import type { ChemicalAdditionRecord } from "./chemical-additions.js";
import type { PoolCoverExposureSummaryItemView, PoolCoverExposureSummaryView } from "./pool-cover-events.js";
import { ageHours, buildValueProvenance, classifyAgeFreshness, type ValueProvenance } from "./provenance.js";
import type { PumpCirculationSummaryItemView, PumpCirculationSummaryView } from "./pump-telemetry.js";
import type { ChlorinatorLatestState } from "./state.js";
import type {
  SwimmabilityConfidence,
  SwimmabilityInput,
  SwimmabilityStatus,
  SwimmabilityView
} from "./swimmability.js";

const SUPPORTED_HORIZONS = ["24h", "48h", "72h", "7d"] as const;
const CHLORINE_ADDITION_TYPES = new Set(["liquid_chlorine", "cal_hypo", "trichlor", "dichlor"]);

export type PredictedSwimmabilityHorizon = (typeof SUPPORTED_HORIZONS)[number];
export type PredictedSwimmabilityTrend = "stable" | "improving" | "declining" | "unknown";

export interface PredictedSwimmabilityReference {
  status: SwimmabilityStatus;
  score: number;
  confidence: SwimmabilityConfidence;
  headline: string;
  updated_at: string;
}

export interface PredictedSwimmabilityInputSummary {
  key: string;
  label: string;
  value: string;
  provenance: ValueProvenance;
}

export interface PredictedSwimmabilityItemView {
  horizon: PredictedSwimmabilityHorizon;
  status: SwimmabilityStatus;
  score: number;
  trend: PredictedSwimmabilityTrend;
  confidence: SwimmabilityConfidence;
  headline: string;
  summary: string;
  drivers: string[];
  assumptions: string[];
  confidence_blockers: string[];
  predicted_inputs: PredictedSwimmabilityInputSummary[];
  provenance: {
    prediction: ValueProvenance;
    chemistry: ValueProvenance;
    weather_forecast: ValueProvenance;
    cover_exposure: ValueProvenance;
    circulation: ValueProvenance;
    chlorinator: ValueProvenance;
    chemical_additions: ValueProvenance;
  };
}

export interface PredictedSwimmabilityView {
  generated_at: string;
  current: PredictedSwimmabilityReference;
  predictions: PredictedSwimmabilityItemView[];
}

export interface PredictedSwimmabilityInput {
  current: SwimmabilityView;
  swimmabilityInput: SwimmabilityInput;
  coverExposure: PoolCoverExposureSummaryView;
  circulation: PumpCirculationSummaryView;
  chlorinator: ChlorinatorLatestState;
  chemicalAdditions: ChemicalAdditionRecord[];
  now?: string;
  horizon?: string | null;
}

export function buildPredictedSwimmabilityView(input: PredictedSwimmabilityInput): PredictedSwimmabilityView {
  const generatedAt = input.now ?? new Date().toISOString();
  const horizons = normalizeHorizons(input.horizon);

  return {
    generated_at: generatedAt,
    current: {
      status: input.current.status,
      score: input.current.score,
      confidence: input.current.confidence,
      headline: input.current.headline,
      updated_at: input.current.updated_at
    },
    predictions: horizons.map((horizon) => buildPredictionForHorizon(input, horizon, generatedAt))
  };
}

function buildPredictionForHorizon(
  input: PredictedSwimmabilityInput,
  horizon: PredictedSwimmabilityHorizon,
  generatedAt: string
): PredictedSwimmabilityItemView {
  const chemistryProvenance = input.current.input_provenance.chemistry;
  const weatherProvenance = input.current.input_provenance.weather_forecast;

  const coverSummary = approximateCoverSummary(input.coverExposure, horizon);
  const circulationSummary = approximateCirculationSummary(input.circulation, horizon);
  const coverProvenance = buildCoverExposureProvenance(coverSummary, generatedAt);
  const circulationProvenance = buildCirculationProvenance(circulationSummary, generatedAt);
  const chlorinatorProvenance = buildChlorinatorProvenance(input.chlorinator, generatedAt);
  const additionsProvenance = buildChemicalAdditionsProvenance(input.chemicalAdditions, generatedAt);

  if (!input.swimmabilityInput.chemistry || input.current.status === "unknown" || chemistryProvenance.freshness_state === "missing") {
    return buildUnavailablePrediction({
      horizon,
      generatedAt,
      chemistry: chemistryProvenance,
      weather: weatherProvenance,
      coverExposure: coverProvenance,
      circulation: circulationProvenance,
      chlorinator: chlorinatorProvenance,
      chemicalAdditions: additionsProvenance
    });
  }

  let score = input.current.score;
  const drivers: string[] = [];
  const assumptions: string[] = [];
  let confidenceRank = confidenceToRank(input.current.confidence);
  const horizonHours = horizonToHours(horizon);

  const chemistryAgeHours = ageHours(input.swimmabilityInput.chemistry.recorded_at, generatedAt) ?? 999;
  const projectedChemistryAgeHours = chemistryAgeHours + horizonHours;
  if (projectedChemistryAgeHours >= 96) {
    score -= 20;
    confidenceRank -= 2;
    drivers.push(`Chemistry will be roughly ${Math.round(projectedChemistryAgeHours / 24)} days old by ${formatHorizonLabel(horizon)}.`);
  } else if (projectedChemistryAgeHours >= 48) {
    score -= 12;
    confidenceRank -= 1;
    drivers.push(`Chemistry age will be stretching by ${formatHorizonLabel(horizon)}.`);
  } else {
    assumptions.push("Recent chemistry is still usable for short-horizon projection.");
  }

  const weatherContext = summarizeForecastRisk(input.swimmabilityInput.forecast, horizon);
  if (weatherContext.maxUv >= 8) {
    score -= horizon === "7d" ? 18 : horizon === "72h" ? 12 : 8;
    drivers.push(`High UV is forecast before ${formatHorizonLabel(horizon)}.`);
  } else if (weatherContext.maxUv >= 5) {
    score -= horizon === "7d" ? 10 : 6;
    drivers.push(`Elevated UV is forecast before ${formatHorizonLabel(horizon)}.`);
  }
  if (weatherContext.totalRainMm >= 20) {
    score -= 10;
    drivers.push(`Heavy rain is forecast before ${formatHorizonLabel(horizon)}.`);
  } else if (weatherContext.totalRainMm >= 8) {
    score -= 6;
    drivers.push(`Rain is forecast before ${formatHorizonLabel(horizon)}.`);
  }
  if (weatherContext.maxAirTempF != null && weatherContext.maxAirTempF >= 90) {
    score -= 5;
    drivers.push("Hot weather may increase chlorine demand.");
  }

  if (coverSummary) {
    if (coverSummary.daylight_uncovered_minutes >= 6 * 60) {
      score -= 8;
      drivers.push("Recent daylight uncovered time is high.");
    } else if (coverSummary.daylight_uncovered_minutes >= 3 * 60) {
      score -= 4;
      drivers.push("Recent uncovered daylight exposure is moderate.");
    }
    if (coverSummary.covered_percent >= 70) {
      score += 4;
      assumptions.push("Recent cover usage should reduce UV-driven loss.");
    }
    if (coverSummary.status !== "available") {
      confidenceRank -= coverSummary.status === "partial" ? 1 : 2;
      assumptions.push("Cover exposure history is incomplete.");
    }
  } else {
    confidenceRank -= 1;
    assumptions.push("No cover exposure summary was available.");
  }

  if (circulationSummary) {
    if (circulationSummary.runtime_percent < 20) {
      score -= 7;
      drivers.push("Recent circulation time is limited.");
    } else if (circulationSummary.runtime_percent >= 40) {
      score += 3;
      assumptions.push("Recent circulation should help support chemical distribution.");
    }
    if (circulationSummary.status !== "available") {
      confidenceRank -= circulationSummary.status === "partial" ? 1 : 2;
      assumptions.push("Circulation coverage is incomplete.");
    }
  } else {
    confidenceRank -= 1;
    assumptions.push("No circulation summary was available.");
  }

  const chlorinatorTargetOutput = resolveChlorinatorTargetOutput(input.chlorinator);
  if (chlorinatorTargetOutput != null && chlorinatorTargetOutput > 0) {
    const circulationSupportFraction = circulationSummary == null ? null : clamp(circulationSummary.runtime_percent / 100, 0, 1);
    const supportScore = Math.min(8, Math.round(chlorinatorTargetOutput / 15));
    score += circulationSupportFraction == null
      ? Math.max(1, supportScore - 2)
      : Math.max(1, Math.round(supportScore * circulationSupportFraction));
    assumptions.push(`SWG target output is set to ${chlorinatorTargetOutput}% duty-cycle support.`);

    const estimatedGenerationLb = estimateSwgGenerationLb({
      chlorinator: input.chlorinator,
      targetOutputPercent: chlorinatorTargetOutput,
      circulationSummary,
      horizonHours
    });
    if (estimatedGenerationLb != null) {
      assumptions.push(`Estimated SWG chlorine support through ${formatHorizonLabel(horizon)} is about ${estimatedGenerationLb.toFixed(2)} lb.`);
    } else if (circulationSummary == null) {
      assumptions.push("SWG support is estimated without recent circulation-runtime evidence.");
    }
  } else if (chlorinatorTargetOutput == null) {
    confidenceRank -= 1;
    assumptions.push("Configured chlorinator output is unavailable.");
  } else if (horizon !== "24h") {
    score -= 4;
    drivers.push("No SWG duty-cycle support is configured right now.");
  }

  const chlorineSupport = summarizeRecentChlorineAdditions(input.chemicalAdditions, generatedAt);
  if (chlorineSupport.recentCount > 0) {
    const additionBoost = horizon === "24h" ? 8 : horizon === "48h" ? 5 : horizon === "72h" ? 3 : 1;
    score += additionBoost;
    assumptions.push("Recent chlorine additions should help preserve sanitizer margin in the short term.");
  } else {
    assumptions.push("No recent chlorine addition was recorded.");
  }

  if (weatherProvenance.freshness_state === "stale" || weatherProvenance.freshness_state === "unavailable") {
    confidenceRank -= 2;
    assumptions.push("Forecast freshness reduces prediction confidence.");
  }
  if (chemistryProvenance.freshness_state === "stale") {
    confidenceRank -= 2;
  } else if (chemistryProvenance.freshness_state === "aging") {
    confidenceRank -= 1;
  }

  score = clamp(score, 0, 100);
  const confidence = rankToConfidence(confidenceRank);
  const confidenceBlockers = deriveConfidenceBlockers({
    confidence,
    chemistry: chemistryProvenance,
    weather: weatherProvenance,
    coverExposure: coverProvenance,
    circulation: circulationProvenance,
    chlorinator: chlorinatorProvenance
  });
  const status = scoreToStatus(score, confidence);
  const trend = deriveTrend(input.current.score, score, status);
  const headline = derivePredictionHeadline(status, confidence, horizon, confidenceBlockers);
  const summary = derivePredictionSummary(status, confidence, drivers, horizon, confidenceBlockers);

  return {
    horizon,
    status,
    score,
    trend,
    confidence,
    headline,
    summary,
    drivers: drivers.slice(0, 4),
    assumptions: assumptions.slice(0, 4),
    confidence_blockers: confidenceBlockers,
    predicted_inputs: [
      {
        key: "uv_risk",
        label: "Forecast UV",
        value: weatherContext.maxUv == null ? "Unavailable" : `${weatherContext.maxUv.toFixed(1)} max`,
        provenance: weatherProvenance
      },
      {
        key: "rain_risk",
        label: "Forecast Rain",
        value: `${weatherContext.totalRainMm.toFixed(1)} mm`,
        provenance: weatherProvenance
      },
      {
        key: "cover_exposure",
        label: "Daylight Uncovered",
        value: coverSummary ? `${Math.round(coverSummary.daylight_uncovered_minutes / 60)}h` : "Unavailable",
        provenance: coverProvenance
      },
      {
        key: "circulation",
        label: "Circulation",
        value: circulationSummary ? `${circulationSummary.runtime_minutes} min` : "Unavailable",
        provenance: circulationProvenance
      },
      {
        key: "chlorinator",
        label: "Chlorinator",
        value:
          chlorinatorTargetOutput != null
            ? `${chlorinatorTargetOutput}% target`
            : "Unavailable",
        provenance: chlorinatorProvenance
      },
      {
        key: "recent_chlorine_additions",
        label: "Recent Chlorine Additions",
        value: chlorineSupport.recentCount > 0 ? `${chlorineSupport.recentCount} logged` : "None logged",
        provenance: additionsProvenance
      }
    ],
    provenance: {
      prediction: buildPredictionProvenance(confidence, generatedAt, assumptions),
      chemistry: chemistryProvenance,
      weather_forecast: weatherProvenance,
      cover_exposure: coverProvenance,
      circulation: circulationProvenance,
      chlorinator: chlorinatorProvenance,
      chemical_additions: additionsProvenance
    }
  };
}

function buildUnavailablePrediction(input: {
  horizon: PredictedSwimmabilityHorizon;
  generatedAt: string;
  chemistry: ValueProvenance;
  weather: ValueProvenance;
  coverExposure: ValueProvenance;
  circulation: ValueProvenance;
  chlorinator: ValueProvenance;
  chemicalAdditions: ValueProvenance;
}): PredictedSwimmabilityItemView {
  return {
    horizon: input.horizon,
    status: "unknown",
    score: 0,
    trend: "unknown",
    confidence: "unknown",
    headline: `Prediction Unavailable for ${formatHorizonLabel(input.horizon)}`,
    summary: "Prediction is unavailable because recent chemistry does not provide a trustworthy current anchor.",
    drivers: ["No trustworthy current chemistry anchor is available for prediction."],
    assumptions: ["Predicted values do not replace measured chemistry."],
    confidence_blockers: ["A trustworthy current chemistry anchor is not available."],
    predicted_inputs: [],
    provenance: {
      prediction: buildValueProvenance({
        value_kind: "predicted",
        source_type: "prediction_model",
        source_detail: "swimmability.predicted",
        freshness_state: "missing",
        confidence_band: "unknown",
        measured_at: null,
        evaluated_at: input.generatedAt,
        reasons: ["Prediction cannot be generated without a trustworthy current chemistry anchor."]
      }),
      chemistry: input.chemistry,
      weather_forecast: input.weather,
      cover_exposure: input.coverExposure,
      circulation: input.circulation,
      chlorinator: input.chlorinator,
      chemical_additions: input.chemicalAdditions
    }
  };
}

function normalizeHorizons(horizon: string | null | undefined): PredictedSwimmabilityHorizon[] {
  if (!horizon) {
    return [...SUPPORTED_HORIZONS];
  }
  return SUPPORTED_HORIZONS.includes(horizon as PredictedSwimmabilityHorizon)
    ? [horizon as PredictedSwimmabilityHorizon]
    : [...SUPPORTED_HORIZONS];
}

function approximateCoverSummary(
  view: PoolCoverExposureSummaryView,
  horizon: PredictedSwimmabilityHorizon
): PoolCoverExposureSummaryItemView | null {
  if (horizon === "48h") {
    const base = view.summaries.find((item) => item.window === "72h");
    if (!base) {
      return null;
    }
    return {
      ...base,
      covered_minutes: Math.round(base.covered_minutes * (48 / 72)),
      uncovered_minutes: Math.round(base.uncovered_minutes * (48 / 72)),
      daylight_uncovered_minutes: Math.round(base.daylight_uncovered_minutes * (48 / 72))
    };
  }
  return view.summaries.find((item) => item.window === horizon) ?? null;
}

function approximateCirculationSummary(
  view: PumpCirculationSummaryView,
  horizon: PredictedSwimmabilityHorizon
): PumpCirculationSummaryItemView | null {
  if (horizon === "48h") {
    const base = view.summaries.find((item) => item.window === "72h");
    if (!base) {
      return null;
    }
    return {
      ...base,
      runtime_minutes: Math.round(base.runtime_minutes * (48 / 72))
    };
  }
  return view.summaries.find((item) => item.window === horizon) ?? null;
}

function summarizeForecastRisk(
  forecast: PredictedSwimmabilityInput["swimmabilityInput"]["forecast"],
  horizon: PredictedSwimmabilityHorizon
): { maxUv: number; totalRainMm: number; maxAirTempF: number | null } {
  const dayCount = horizon === "24h" ? 1 : horizon === "48h" ? 2 : horizon === "72h" ? 3 : 7;
  const days = forecast.daily.slice(0, dayCount);
  return {
    maxUv: Math.max(0, ...days.map((day) => day.uv_index_max ?? 0)),
    totalRainMm: days.reduce((sum, day) => sum + (day.precipitation_amount ?? 0), 0),
    maxAirTempF: days.reduce<number | null>((maxValue, day) => {
      if (day.high_temp_f == null) {
        return maxValue;
      }
      return maxValue == null ? day.high_temp_f : Math.max(maxValue, day.high_temp_f);
    }, null)
  };
}

function summarizeRecentChlorineAdditions(additions: ChemicalAdditionRecord[], generatedAt: string): { recentCount: number } {
  const cutoffMs = Date.parse(generatedAt) - (24 * 60 * 60 * 1000);
  const recentCount = additions.filter((addition) => {
    const recordedAt = Date.parse(addition.recorded_at);
    return Number.isFinite(recordedAt) && recordedAt >= cutoffMs && CHLORINE_ADDITION_TYPES.has(addition.chemical_type);
  }).length;
  return { recentCount };
}

function buildCoverExposureProvenance(
  summary: PoolCoverExposureSummaryItemView | null,
  evaluatedAt: string
): ValueProvenance {
  if (!summary) {
    return buildValueProvenance({
      value_kind: "derived",
      source_type: "derived_calculation",
      source_detail: "pool_cover.exposure_summary",
      freshness_state: "missing",
      confidence_band: "unknown",
      measured_at: null,
      evaluated_at: evaluatedAt,
      reasons: ["No cover exposure summary is available."]
    });
  }
  return buildValueProvenance({
    value_kind: "derived",
    source_type: "derived_calculation",
    source_detail: `pool_cover.exposure_summary.${summary.window}`,
    freshness_state: summary.status === "available" ? "fresh" : summary.status === "partial" ? "aging" : "stale",
    confidence_band: summary.status === "available" ? "high" : summary.status === "partial" ? "medium" : "low",
    measured_at: summary.last_cover_change_at,
    evaluated_at: evaluatedAt,
    reasons: [
      `Cover exposure summary is available for the ${summary.window} window.`,
      summary.status === "available"
        ? "Cover history is sufficient for this summary."
        : summary.status === "partial"
          ? "Cover history is only partially complete for this summary."
          : "Cover history is too sparse for a high-confidence summary."
    ]
  });
}

function buildCirculationProvenance(
  summary: PumpCirculationSummaryItemView | null,
  evaluatedAt: string
): ValueProvenance {
  if (!summary) {
    return buildValueProvenance({
      value_kind: "derived",
      source_type: "derived_calculation",
      source_detail: "pump.circulation_summary",
      freshness_state: "missing",
      confidence_band: "unknown",
      measured_at: null,
      evaluated_at: evaluatedAt,
      reasons: ["No circulation summary is available."]
    });
  }
  return buildValueProvenance({
    value_kind: "derived",
    source_type: "derived_calculation",
    source_detail: `pump.circulation_summary.${summary.window}`,
    freshness_state: summary.status === "available" ? "fresh" : summary.status === "partial" ? "aging" : "stale",
    confidence_band: summary.status === "available" ? "high" : summary.status === "partial" ? "medium" : "low",
    measured_at: summary.last_running_at,
    evaluated_at: evaluatedAt,
    reasons: [
      `Circulation summary covers the ${summary.window} window.`,
      summary.status === "available"
        ? "Pump telemetry coverage is sufficient."
        : summary.status === "partial"
          ? "Pump telemetry coverage is incomplete."
          : "Pump telemetry coverage is too sparse for a strong runtime estimate."
    ]
  });
}

function buildChlorinatorProvenance(chlorinator: ChlorinatorLatestState, evaluatedAt: string): ValueProvenance {
  const freshness = classifyAgeFreshness(chlorinator.updatedAt, evaluatedAt, { freshHours: 1, agingHours: 6 });
  const targetOutputPercent = resolveChlorinatorTargetOutput(chlorinator);
  return buildValueProvenance({
    value_kind: "measured",
    source_type: "controller",
    source_detail: "chlorinator.latest_state",
    freshness_state: chlorinator.updatedAt ? freshness : "missing",
    confidence_band:
      chlorinator.updatedAt == null
        ? "unknown"
        : targetOutputPercent == null
          ? "medium"
        : freshness === "fresh"
            ? "high"
            : freshness === "aging"
              ? "medium"
              : "low",
    measured_at: chlorinator.updatedAt,
    evaluated_at: evaluatedAt,
    reasons: [
      chlorinator.updatedAt ? "Chlorinator telemetry is available." : "No chlorinator telemetry is available.",
      targetOutputPercent == null
        ? "Configured chlorinator output is unavailable."
        : `Configured chlorinator output target is ${targetOutputPercent}%.`
    ]
  });
}

function buildChemicalAdditionsProvenance(additions: ChemicalAdditionRecord[], evaluatedAt: string): ValueProvenance {
  const latest = additions[0] ?? null;
  return buildValueProvenance({
    value_kind: "observed",
    source_type: "manual_log",
    source_detail: "chemistry.additions",
    freshness_state: latest ? classifyAgeFreshness(latest.recorded_at, evaluatedAt, { freshHours: 24, agingHours: 72 }) : "missing",
    confidence_band: latest ? "medium" : "unknown",
    measured_at: latest?.recorded_at ?? null,
    evaluated_at: evaluatedAt,
    reasons: [latest ? "Recent chemical addition history is available." : "No recent chemical additions were logged."]
  });
}

function buildPredictionProvenance(
  confidence: SwimmabilityConfidence,
  evaluatedAt: string,
  assumptions: string[]
): ValueProvenance {
  return buildValueProvenance({
    value_kind: "predicted",
    source_type: "prediction_model",
    source_detail: "swimmability.predicted.v1",
    freshness_state: "fresh",
    confidence_band: confidence === "unknown" ? "low" : confidence,
    measured_at: evaluatedAt,
    evaluated_at: evaluatedAt,
    reasons: assumptions.length > 0 ? assumptions : ["Prediction is based on current conditions plus forecast context."]
  });
}

function deriveConfidenceBlockers(input: {
  confidence: SwimmabilityConfidence;
  chemistry: ValueProvenance;
  weather: ValueProvenance;
  coverExposure: ValueProvenance;
  circulation: ValueProvenance;
  chlorinator: ValueProvenance;
}): string[] {
  if (input.confidence === "high") {
    return [];
  }

  const blockers: string[] = [];

  if (input.chemistry.freshness_state === "stale" || input.chemistry.freshness_state === "missing") {
    blockers.push("Recent chemistry is missing or too stale for a strong prediction.");
  }
  if (input.weather.freshness_state === "missing" || input.weather.freshness_state === "unavailable") {
    blockers.push("No weather forecast has been captured yet.");
  } else if (input.weather.freshness_state === "stale") {
    blockers.push("The weather forecast is stale.");
  }
  if (input.coverExposure.confidence_band === "low" || input.coverExposure.freshness_state === "stale") {
    blockers.push("Cover history is too sparse for a strong exposure estimate.");
  } else if (input.coverExposure.confidence_band === "medium" || input.coverExposure.freshness_state === "aging") {
    blockers.push("Cover exposure history is only partially complete.");
  }
  if (input.circulation.confidence_band === "low" || input.circulation.freshness_state === "stale") {
    blockers.push("Circulation telemetry coverage is too sparse.");
  } else if (input.circulation.confidence_band === "medium" || input.circulation.freshness_state === "aging") {
    blockers.push("Circulation telemetry coverage is incomplete.");
  }
  if (input.chlorinator.freshness_state === "missing" || input.chlorinator.freshness_state === "unavailable") {
    blockers.push("Chlorinator telemetry is unavailable.");
  } else if (input.chlorinator.confidence_band === "medium" || input.chlorinator.confidence_band === "low") {
    blockers.push("Configured chlorinator output is unavailable.");
  }

  return blockers.slice(0, 4);
}

function resolveChlorinatorTargetOutput(chlorinator: ChlorinatorLatestState): number | null {
  return chlorinator.targetOutputPercent ?? chlorinator.outputPercent ?? null;
}

function estimateSwgGenerationLb(input: {
  chlorinator: ChlorinatorLatestState;
  targetOutputPercent: number;
  circulationSummary: PumpCirculationSummaryItemView | null;
  horizonHours: number;
}): number | null {
  const productionLbPerDay = input.chlorinator.productionLbPerDay ?? null;
  if (productionLbPerDay == null) {
    return null;
  }

  const outputFraction = clamp(input.targetOutputPercent / 100, 0, 1);
  const circulationFraction = input.circulationSummary == null
    ? 1
    : clamp(input.circulationSummary.runtime_percent / 100, 0, 1);
  const horizonFraction = input.horizonHours / 24;
  return productionLbPerDay * outputFraction * circulationFraction * horizonFraction;
}

function confidenceToRank(value: SwimmabilityConfidence): number {
  switch (value) {
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
      return 1;
    default:
      return 0;
  }
}

function rankToConfidence(value: number): SwimmabilityConfidence {
  if (value >= 3) {
    return "high";
  }
  if (value === 2) {
    return "medium";
  }
  if (value === 1) {
    return "low";
  }
  return "unknown";
}

function scoreToStatus(score: number, confidence: SwimmabilityConfidence): SwimmabilityStatus {
  if (confidence === "unknown") {
    return "unknown";
  }
  if (score >= 80) {
    return "good";
  }
  if (score >= 55) {
    return "caution";
  }
  return "poor";
}

function deriveTrend(currentScore: number, predictedScore: number, status: SwimmabilityStatus): PredictedSwimmabilityTrend {
  if (status === "unknown") {
    return "unknown";
  }
  if (predictedScore >= currentScore + 5) {
    return "improving";
  }
  if (predictedScore <= currentScore - 5) {
    return "declining";
  }
  return "stable";
}

function derivePredictionHeadline(
  status: SwimmabilityStatus,
  confidence: SwimmabilityConfidence,
  horizon: PredictedSwimmabilityHorizon,
  confidenceBlockers: string[]
): string {
  if (status === "unknown") {
    return confidenceBlockers[0] ?? `Prediction Uncertain for ${formatHorizonLabel(horizon)}`;
  }
  if (status === "good") {
    return confidence === "low"
      ? `Likely Swimmable by ${formatHorizonLabel(horizon)}`
      : `Should Remain Swimmable by ${formatHorizonLabel(horizon)}`;
  }
  if (status === "caution") {
    return `Swimmability May Slip by ${formatHorizonLabel(horizon)}`;
  }
  return `Swimmability Risk by ${formatHorizonLabel(horizon)}`;
}

function derivePredictionSummary(
  status: SwimmabilityStatus,
  confidence: SwimmabilityConfidence,
  drivers: string[],
  horizon: PredictedSwimmabilityHorizon,
  confidenceBlockers: string[]
): string {
  if (status === "unknown") {
    return confidenceBlockers.length > 0
      ? `Prediction for ${formatHorizonLabel(horizon)} is not trustworthy enough because ${lowercaseFirst(confidenceBlockers[0])}`
      : `Prediction for ${formatHorizonLabel(horizon)} is not trustworthy enough with the current inputs.`;
  }
  if (drivers.length === 0) {
    return `No major forecast or operational risks stand out before ${formatHorizonLabel(horizon)}.`;
  }
  const lead = drivers[0];
  return confidence === "low"
    ? confidenceBlockers.length > 0
      ? `${lead} Prediction confidence is limited because ${lowercaseFirst(confidenceBlockers[0])}`
      : `${lead} Prediction confidence is limited.`
    : lead;
}

function formatHorizonLabel(horizon: PredictedSwimmabilityHorizon): string {
  switch (horizon) {
    case "24h":
      return "Tomorrow";
    case "48h":
      return "48 Hours";
    case "72h":
      return "72 Hours";
    default:
      return "7 Days";
  }
}

function horizonToHours(horizon: PredictedSwimmabilityHorizon): number {
  switch (horizon) {
    case "24h":
      return 24;
    case "48h":
      return 48;
    case "72h":
      return 72;
    default:
      return 168;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lowercaseFirst(value: string): string {
  return value.length > 0 ? value[0].toLowerCase() + value.slice(1) : value;
}
