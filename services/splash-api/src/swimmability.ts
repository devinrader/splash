import type { ChemistryReadingRecord } from "./chemistry-readings.js";
import type { PoolChemistryRecommendationBounds } from "./pool-chemistry-settings.js";
import type { PoolCoverCurrentView } from "./pool-cover-events.js";
import { ageHours, buildValueProvenance, classifyAgeFreshness, type ValueProvenance } from "./provenance.js";
import type { TemperatureLatestView } from "./temperature-telemetry.js";
import type { WeatherForecastView } from "./weather-forecast.js";
import type { WaterTestingFreshnessView } from "./water-testing-schedule.js";

export type SwimmabilityStatus = "good" | "caution" | "poor" | "unknown";
export type SwimmabilityDriverSeverity = "good" | "neutral" | "caution" | "poor" | "unknown";
export type SwimmabilityConfidence = "high" | "medium" | "low" | "unknown";
export type SwimmabilityHighlightTone = "positive" | "neutral" | "caution" | "negative";

export interface SwimmabilityDriver {
  key: string;
  severity: SwimmabilityDriverSeverity;
  message: string;
}

export interface SwimmabilityHighlight {
  tone: SwimmabilityHighlightTone;
  label: string;
}

export interface SwimmabilityView {
  status: SwimmabilityStatus;
  score: number;
  summary: string;
  headline: string;
  confidence: SwimmabilityConfidence;
  last_chemistry_age_label: string | null;
  highlights: SwimmabilityHighlight[];
  updated_at: string;
  drivers: SwimmabilityDriver[];
  inputs: {
    chemistry_latest_at: string | null;
    cover_latest_at: string | null;
    forecast_fetched_at: string | null;
    telemetry_latest_at: string | null;
  };
  input_provenance: {
    chemistry: ValueProvenance;
    cover: ValueProvenance;
    weather_forecast: ValueProvenance;
    water_temperature: ValueProvenance;
    rainfall_since_chemistry: ValueProvenance;
  };
}

export interface SwimmabilityInput {
  chemistry: ChemistryReadingRecord | null;
  chemistryBounds: PoolChemistryRecommendationBounds;
  cover: PoolCoverCurrentView;
  forecast: WeatherForecastView;
  latestTemperatures: TemperatureLatestView;
  rainfallSinceChemistryInches: number | null;
  freshness?: WaterTestingFreshnessView;
  now?: string;
}

const HARD_BLOCK_PH_LOW = 7.0;
const HARD_BLOCK_PH_HIGH = 8.2;
const HARD_BLOCK_FC_LOW = 0.5;
const HARD_BLOCK_CYA_HIGH = 100;
const STALE_CAUTION_HOURS = 7 * 24;
const STALE_UNKNOWN_HOURS = 14 * 24;
const LIGHT_RAIN_INCHES = 0.25;
const HEAVY_RAIN_INCHES = 1.0;

export function buildSwimmabilityView(input: SwimmabilityInput): SwimmabilityView {
  const updatedAt = input.now ?? new Date().toISOString();
  const drivers: SwimmabilityDriver[] = [];

  if (!input.chemistry) {
    return {
      status: "unknown",
      score: 0,
      summary: "Swimmability is unknown because no chemistry reading has been logged yet.",
      headline: "Assessment Unavailable",
      confidence: "unknown",
      last_chemistry_age_label: null,
      highlights: [
        {
          tone: "caution",
          label: "No chemistry test logged"
        }
      ],
      updated_at: updatedAt,
      drivers: [
        {
          key: "chemistry_missing",
          severity: "unknown",
          message: "No chemistry reading is available yet."
        }
      ],
      inputs: {
        chemistry_latest_at: null,
        cover_latest_at: input.cover.current?.recorded_at ?? null,
        forecast_fetched_at: input.forecast.fetched_at,
        telemetry_latest_at: input.latestTemperatures.last_updated
      },
      input_provenance: buildInputProvenance({
        chemistry: null,
        chemistrySource: null,
        cover: input.cover,
        forecast: input.forecast,
        latestTemperatures: input.latestTemperatures,
        rainfallSinceChemistryInches: input.rainfallSinceChemistryInches,
        updatedAt,
        recencyStatus: "unknown",
        confidence: "unknown"
      })
    };
  }

  let score = 100;
  let status: SwimmabilityStatus = "good";

  const hardBlock = assessHardBlock(input.chemistry);
  if (hardBlock) {
    drivers.push(hardBlock);
    score = Math.min(score, 20);
    status = "poor";
  }

  const chemistryDrivers = assessChemistryBounds(input.chemistry, input.chemistryBounds);
  for (const driver of chemistryDrivers) {
    drivers.push(driver);
    if (driver.severity === "caution") {
      score -= 12;
      if (status === "good") {
        status = "caution";
      }
    }
  }

  const freshnessDrivers = assessFreshness(input.freshness);
  for (const driver of freshnessDrivers) {
    drivers.push(driver);
    if (
      (driver.key === "free_chlorine_freshness" || driver.key === "ph_freshness")
      && (driver.severity === "caution" || driver.severity === "unknown")
    ) {
      if (status === "good") {
        status = "caution";
      }
      score -= 12;
      continue;
    }
    if (driver.severity === "caution" || driver.severity === "unknown") {
      if (status === "good") {
        status = "caution";
      }
      score -= 6;
    }
  }

  const context = deriveContext(input);
  const recency = assessChemistryRecency(input.chemistry.recorded_at, context);
  drivers.push(recency.driver);
  if (recency.status === "unknown" && status !== "poor") {
    status = "unknown";
    score = Math.min(score, 35);
  } else if (recency.status === "caution" && status === "good") {
    status = "caution";
    score -= 10;
  }

  const coverDriver = describeCoverState(input.cover.current?.state ?? null, input.cover.current?.cover_type ?? null);
  if (coverDriver) {
    drivers.push(coverDriver);
  }

  const weatherDriver = describeWeatherContext(context);
  if (weatherDriver) {
    drivers.push(weatherDriver);
    if (weatherDriver.severity === "caution" && status === "good") {
      status = "caution";
      score -= 8;
    }
  }

  const temperatureDriver = describeWaterTemperatureComfort(context.waterTemperatureF);
  if (temperatureDriver) {
    drivers.push(temperatureDriver);
    if (temperatureDriver.severity === "caution" && status === "good") {
      status = "caution";
      score -= 6;
    }
  }

  score = clamp(Math.round(score), 0, 100);
  const summary = summarize(status, drivers);
  const confidence = deriveConfidence(status, recency.status, drivers);
  const lastChemistryAgeLabel = formatAgeLabel(input.chemistry.recorded_at, updatedAt);
  const headline = deriveHeadline(status);
  const highlights = deriveHighlights({
    status,
    confidence,
    recencyStatus: recency.status,
    drivers
  });

  return {
    status,
    score,
    summary,
    headline,
    confidence,
    last_chemistry_age_label: lastChemistryAgeLabel,
    highlights,
    updated_at: updatedAt,
    drivers,
    inputs: {
      chemistry_latest_at: input.chemistry.recorded_at,
      cover_latest_at: input.cover.current?.recorded_at ?? null,
      forecast_fetched_at: input.forecast.fetched_at,
      telemetry_latest_at: input.latestTemperatures.last_updated
    },
    input_provenance: buildInputProvenance({
      chemistry: input.chemistry.recorded_at,
      chemistrySource: input.chemistry.source,
      cover: input.cover,
      forecast: input.forecast,
      latestTemperatures: input.latestTemperatures,
      rainfallSinceChemistryInches: input.rainfallSinceChemistryInches,
      updatedAt,
      recencyStatus: recency.status,
      confidence
    })
  };
}

function buildInputProvenance(input: {
  chemistry: string | null;
  chemistrySource: ChemistryReadingRecord["source"] | null;
  cover: PoolCoverCurrentView;
  forecast: WeatherForecastView;
  latestTemperatures: TemperatureLatestView;
  rainfallSinceChemistryInches: number | null;
  updatedAt: string;
  recencyStatus: "good" | "caution" | "unknown";
  confidence: SwimmabilityConfidence;
}): SwimmabilityView["input_provenance"] {
  return {
    chemistry: buildChemistryProvenance(input.chemistry, input.chemistrySource, input.updatedAt, input.recencyStatus, input.confidence),
    cover: buildCoverProvenance(input.cover, input.updatedAt),
    weather_forecast: buildForecastProvenance(input.forecast, input.updatedAt),
    water_temperature: buildWaterTemperatureProvenance(input.latestTemperatures, input.updatedAt),
    rainfall_since_chemistry: buildRainfallProvenance(input.rainfallSinceChemistryInches, input.chemistry, input.forecast, input.updatedAt)
  };
}

function buildChemistryProvenance(
  measuredAt: string | null,
  source: ChemistryReadingRecord["source"] | null,
  evaluatedAt: string,
  recencyStatus: "good" | "caution" | "unknown",
  confidence: SwimmabilityConfidence
): ValueProvenance {
  if (!measuredAt) {
    return buildValueProvenance({
      value_kind: "measured",
      source_type: source === "sensor" ? "sensor" : "manual_test",
      source_detail: source === "sensor" ? "chemistry.sensor" : "chemistry.manual_test",
      freshness_state: "missing",
      confidence_band: "unknown",
      measured_at: null,
      evaluated_at: evaluatedAt,
      reasons: ["No chemistry reading is available."]
    });
  }

  const freshnessState = recencyStatus === "good" ? "fresh" : recencyStatus === "caution" ? "aging" : "stale";
  const age = ageHours(measuredAt, evaluatedAt);
  const reasonPrefix = age == null ? "Chemistry reading age could not be evaluated." : `Chemistry reading is ${formatHours(age)} old.`;

  return buildValueProvenance({
    value_kind: "measured",
    source_type: source === "sensor" ? "sensor" : "manual_test",
    source_detail: source === "sensor" ? "chemistry.sensor" : "chemistry.manual_test",
    freshness_state: freshnessState,
    confidence_band: confidence === "unknown" ? "low" : confidence,
    measured_at: measuredAt,
    evaluated_at: evaluatedAt,
    reasons: [
      reasonPrefix,
      recencyStatus === "good"
        ? "Chemistry recency is still considered acceptable."
        : recencyStatus === "caution"
          ? "Chemistry confidence is aging because recency context is less favorable."
          : "Chemistry is too old to support a trustworthy current assessment."
    ]
  });
}

function buildCoverProvenance(cover: PoolCoverCurrentView, evaluatedAt: string): ValueProvenance {
  const measuredAt = cover.current?.recorded_at ?? null;
  if (!cover.current) {
    return buildValueProvenance({
      value_kind: "observed",
      source_type: "manual_log",
      source_detail: "pool_cover.manual_event",
      freshness_state: "missing",
      confidence_band: "unknown",
      measured_at: null,
      evaluated_at: evaluatedAt,
      reasons: ["No recent cover event is available."]
    });
  }

  const freshnessState = classifyAgeFreshness(measuredAt, evaluatedAt, { freshHours: 48, agingHours: 7 * 24 });
  const confidenceBand = freshnessState === "fresh" ? "high" : freshnessState === "aging" ? "medium" : "low";

  return buildValueProvenance({
    value_kind: "observed",
    source_type: "manual_log",
    source_detail: `pool_cover.${cover.current.cover_type}`,
    freshness_state: freshnessState,
    confidence_band: confidenceBand,
    measured_at: measuredAt,
    evaluated_at: evaluatedAt,
    reasons: [
      `Latest cover state was recorded as ${cover.current.state}.`,
      freshnessState === "stale"
        ? "Cover state is old enough that its current accuracy is uncertain."
        : "Cover state is recent enough to use as current context."
    ]
  });
}

function buildForecastProvenance(forecast: WeatherForecastView, evaluatedAt: string): ValueProvenance {
  const freshnessState =
    forecast.fetched_at == null
      ? forecast.status === "empty"
        ? "missing"
        : "unavailable"
      : forecast.stale
        ? "stale"
        : "fresh";
  const confidenceBand =
    freshnessState === "fresh"
      ? "high"
      : freshnessState === "stale"
        ? "low"
        : freshnessState === "missing"
          ? "unknown"
          : "low";

  return buildValueProvenance({
    value_kind: "predicted",
    source_type: "weather_provider",
    source_detail: forecast.provider || null,
    freshness_state: freshnessState,
    confidence_band: confidenceBand,
    measured_at: forecast.fetched_at,
    evaluated_at: evaluatedAt,
    reasons: [
      forecast.message,
      forecast.stale ? "The latest cached weather forecast is stale." : "Weather forecast metadata is current."
    ]
  });
}

function buildWaterTemperatureProvenance(temperatures: TemperatureLatestView, evaluatedAt: string): ValueProvenance {
  const reading = temperatures.readings.pool_water ?? null;
  const measuredAt = reading?.timestamp ?? null;
  const freshnessState =
    temperatures.status === "empty"
      ? "missing"
      : classifyAgeFreshness(measuredAt, evaluatedAt, { freshHours: 1, agingHours: 6 });
  const confidenceBand =
    freshnessState === "fresh"
      ? "high"
      : freshnessState === "aging"
        ? "medium"
        : freshnessState === "stale"
          ? "low"
          : "unknown";

  return buildValueProvenance({
    value_kind: "measured",
    source_type: "controller",
    source_detail: "controller.pool_water",
    freshness_state: freshnessState,
    confidence_band: confidenceBand,
    measured_at: measuredAt,
    evaluated_at: evaluatedAt,
    reasons: [
      temperatures.message,
      measuredAt ? "Pool-water telemetry is available." : "No pool-water telemetry reading is available."
    ]
  });
}

function buildRainfallProvenance(
  rainfallSinceChemistryInches: number | null,
  chemistryMeasuredAt: string | null,
  forecast: WeatherForecastView,
  evaluatedAt: string
): ValueProvenance {
  if (!chemistryMeasuredAt) {
    return buildValueProvenance({
      value_kind: "derived",
      source_type: "derived_calculation",
      source_detail: "rainfall_since_chemistry",
      freshness_state: "missing",
      confidence_band: "unknown",
      measured_at: null,
      evaluated_at: evaluatedAt,
      reasons: ["Rainfall since chemistry cannot be derived without a chemistry reading timestamp."]
    });
  }

  if (rainfallSinceChemistryInches == null) {
    return buildValueProvenance({
      value_kind: "derived",
      source_type: "derived_calculation",
      source_detail: "rainfall_since_chemistry",
      freshness_state: forecast.fetched_at ? (forecast.stale ? "stale" : "aging") : "unavailable",
      confidence_band: forecast.stale ? "low" : "medium",
      measured_at: forecast.fetched_at,
      evaluated_at: evaluatedAt,
      reasons: ["Rainfall-since-chemistry context could not be derived from the available weather history."]
    });
  }

  return buildValueProvenance({
    value_kind: "derived",
    source_type: "derived_calculation",
    source_detail: "rainfall_since_chemistry",
    freshness_state: forecast.stale ? "aging" : "fresh",
    confidence_band: forecast.stale ? "medium" : "high",
    measured_at: forecast.fetched_at,
    evaluated_at: evaluatedAt,
    reasons: [
      `Rainfall since the last chemistry reading is estimated at ${rainfallSinceChemistryInches.toFixed(2)} inches.`,
      "This value is derived from weather history relative to the last chemistry timestamp."
    ]
  });
}

function formatHours(hours: number): string {
  if (hours < 24) {
    return `${Math.round(hours)} hours`;
  }
  return `${Math.round(hours / 24)} days`;
}

function assessHardBlock(reading: ChemistryReadingRecord): SwimmabilityDriver | null {
  if (reading.ph != null && (reading.ph < HARD_BLOCK_PH_LOW || reading.ph > HARD_BLOCK_PH_HIGH)) {
    return {
      key: "ph",
      severity: "poor",
      message: "pH is outside the documented do-not-swim range."
    };
  }
  if (reading.free_chlorine != null && reading.free_chlorine < HARD_BLOCK_FC_LOW) {
    return {
      key: "free_chlorine",
      severity: "poor",
      message: "Free chlorine is below the documented do-not-swim minimum."
    };
  }
  if (reading.cyanuric_acid != null && reading.cyanuric_acid > HARD_BLOCK_CYA_HIGH) {
    return {
      key: "cyanuric_acid",
      severity: "poor",
      message: "Cyanuric acid is above the documented do-not-swim threshold."
    };
  }
  return null;
}

function assessChemistryBounds(
  reading: ChemistryReadingRecord,
  bounds: PoolChemistryRecommendationBounds
): SwimmabilityDriver[] {
  const drivers: SwimmabilityDriver[] = [];
  maybePushBoundDriver(drivers, "free_chlorine", "Free chlorine", reading.free_chlorine, bounds.freeChlorine?.min, bounds.freeChlorine?.max);
  maybePushBoundDriver(drivers, "ph", "pH", reading.ph, bounds.ph?.min, bounds.ph?.max);
  maybePushBoundDriver(
    drivers,
    "total_alkalinity",
    "Total alkalinity",
    reading.total_alkalinity,
    bounds.totalAlkalinity?.min,
    bounds.totalAlkalinity?.max
  );
  maybePushBoundDriver(
    drivers,
    "calcium_hardness",
    "Calcium hardness",
    reading.calcium_hardness,
    bounds.calciumHardness?.min,
    bounds.calciumHardness?.max
  );
  maybePushBoundDriver(
    drivers,
    "cyanuric_acid",
    "Cyanuric acid",
    reading.cyanuric_acid,
    bounds.cyanuricAcid?.min,
    bounds.cyanuricAcid?.max
  );

  if (reading.total_chlorine != null && reading.free_chlorine != null) {
    const combined = Number((reading.total_chlorine - reading.free_chlorine).toFixed(2));
    if (combined > 0.5) {
      drivers.push({
        key: "combined_chlorine",
        severity: "caution",
        message: `Combined chlorine is elevated at ${combined.toFixed(1)} ppm.`
      });
    } else {
      drivers.push({
        key: "combined_chlorine",
        severity: "good",
        message: "Combined chlorine is within the preferred range."
      });
    }
  }

  return drivers;
}

function maybePushBoundDriver(
  drivers: SwimmabilityDriver[],
  key: string,
  label: string,
  value: number | null,
  min: number | null | undefined,
  max: number | null | undefined
): void {
  if (value == null || (min == null && max == null)) {
    return;
  }
  if (min != null && value < min) {
    drivers.push({
      key,
      severity: "caution",
      message: `${label} is below the configured minimum range.`
    });
    return;
  }
  if (max != null && value > max) {
    drivers.push({
      key,
      severity: "caution",
      message: `${label} is above the configured maximum range.`
    });
    return;
  }
  drivers.push({
    key,
    severity: "good",
    message: `${label} is within the configured target range.`
  });
}

function assessChemistryRecency(
  recordedAt: string,
  context: ReturnType<typeof deriveContext>
): { status: "good" | "caution" | "unknown"; driver: SwimmabilityDriver } {
  const ageHours = positiveHoursBetween(recordedAt, context.nowIso);
  const adjustedAgeHours = ageHours * context.stalenessFactor;
  if (adjustedAgeHours >= STALE_UNKNOWN_HOURS) {
    return {
      status: "unknown",
      driver: {
        key: "chemistry_recency",
        severity: "unknown",
        message: `Chemistry confidence is too old to trust${context.reasonSuffix}.`
      }
    };
  }
  if (adjustedAgeHours >= STALE_CAUTION_HOURS) {
    return {
      status: "caution",
      driver: {
        key: "chemistry_recency",
        severity: "caution",
        message: `Chemistry confidence is aging${context.reasonSuffix}.`
      }
    };
  }
  return {
    status: "good",
    driver: {
      key: "chemistry_recency",
      severity: "good",
      message: "Chemistry reading is still reasonably fresh."
    }
  };
}

function assessFreshness(freshness: WaterTestingFreshnessView | undefined): SwimmabilityDriver[] {
  if (!freshness) {
    return [];
  }

  const drivers: SwimmabilityDriver[] = [];
  for (const item of freshness.items) {
    if (!item.enabled || item.status === "current" || item.status === "disabled") {
      continue;
    }

    const severity: SwimmabilityDriverSeverity =
      item.status === "unavailable" ? "unknown" : "caution";

    drivers.push({
      key: `${item.chemicalKey}_freshness`,
      severity,
      message:
        item.status === "stale"
          ? `${item.displayName} freshness is stale under the configured testing schedule.`
          : `${item.displayName} freshness is unavailable under the configured testing schedule.`
    });
  }

  return drivers;
}

function deriveContext(input: SwimmabilityInput) {
  const coverState = input.cover.current?.state ?? null;
  const uv = input.forecast.hourly[0]?.uv_index ?? input.forecast.daily[0]?.uv_index_max ?? null;
  const airTemperatureF =
    input.latestTemperatures.readings.air?.normalized_f
    ?? input.forecast.hourly[0]?.temperature_f
    ?? input.forecast.daily[0]?.high_temp_f
    ?? null;
  const waterTemperatureF = input.latestTemperatures.readings.pool_water?.normalized_f ?? null;
  const rainfallSinceChemistryInches = input.rainfallSinceChemistryInches;
  let stalenessFactor = 1;
  const reasons: string[] = [];

  if (uv != null && uv >= 8) {
    stalenessFactor += 0.35;
    reasons.push("UV is high");
  } else if (uv != null && uv >= 5) {
    stalenessFactor += 0.2;
    reasons.push("UV is elevated");
  }
  if (airTemperatureF != null && airTemperatureF >= 90) {
    stalenessFactor += 0.25;
    reasons.push("air temperature is hot");
  } else if (airTemperatureF != null && airTemperatureF >= 82) {
    stalenessFactor += 0.1;
    reasons.push("air temperature is warm");
  }
  if (waterTemperatureF != null && waterTemperatureF >= 88) {
    stalenessFactor += 0.2;
    reasons.push("water temperature is warm");
  } else if (waterTemperatureF != null && waterTemperatureF >= 82) {
    stalenessFactor += 0.1;
    reasons.push("water temperature is elevated");
  }
  if (rainfallSinceChemistryInches != null && rainfallSinceChemistryInches >= HEAVY_RAIN_INCHES) {
    stalenessFactor += 0.5;
    reasons.push("heavy rain has fallen since the last test");
  } else if (rainfallSinceChemistryInches != null && rainfallSinceChemistryInches >= LIGHT_RAIN_INCHES) {
    stalenessFactor += 0.2;
    reasons.push("rain has fallen since the last test");
  }

  return {
    nowIso: input.now ?? new Date().toISOString(),
    coverState,
    uv,
    airTemperatureF,
    waterTemperatureF,
    rainfallSinceChemistryInches,
    stalenessFactor: Math.max(0.5, stalenessFactor),
    reasonSuffix: reasons.length > 0 ? ` because ${joinReasons(reasons)}.` : "."
  };
}

function describeCoverState(
  state: "on" | "off" | null,
  coverType: string | null
): SwimmabilityDriver | null {
  if (!state) {
    return null;
  }
  if (state === "on") {
    return {
      key: "cover_state",
      severity: "good",
      message: `The ${coverType ?? "pool"} cover is currently on.`
    };
  }
  return {
    key: "cover_state",
    severity: "neutral",
    message: "The pool is currently uncovered."
  };
}

function describeWeatherContext(context: ReturnType<typeof deriveContext>): SwimmabilityDriver | null {
  const notes: string[] = [];
  if (context.uv != null && context.uv >= 5) {
    notes.push(`UV is ${context.uv >= 8 ? "high" : "elevated"}`);
  }
  if (context.airTemperatureF != null && context.airTemperatureF >= 82) {
    notes.push(`air temperature is ${Math.round(context.airTemperatureF)}°F`);
  }
  if (context.rainfallSinceChemistryInches != null && context.rainfallSinceChemistryInches >= LIGHT_RAIN_INCHES) {
    notes.push(`${context.rainfallSinceChemistryInches.toFixed(2)}" rain has fallen since the last test`);
  }
  if (notes.length === 0) {
    return null;
  }
  return {
    key: "weather_context",
    severity: "caution",
    message: `${capitalize(notes.join(", "))}.`
  };
}

function describeWaterTemperatureComfort(value: number | null): SwimmabilityDriver | null {
  if (value == null) {
    return null;
  }
  if (value < 70) {
    return {
      key: "water_temperature",
      severity: "caution",
      message: `Pool water is cool at ${Math.round(value)}°F.`
    };
  }
  if (value > 92) {
    return {
      key: "water_temperature",
      severity: "caution",
      message: `Pool water is very warm at ${Math.round(value)}°F.`
    };
  }
  return {
    key: "water_temperature",
    severity: "good",
    message: "Pool water is within the preferred swim range."
  };
}

function summarize(status: SwimmabilityStatus, drivers: SwimmabilityDriver[]): string {
  if (status === "poor") {
    const primary = drivers.find((driver) => driver.severity === "poor");
    return primary ? primary.message : "Water is currently not suitable for swimming.";
  }
  if (status === "unknown") {
    return "Swimmability is uncertain because the supporting chemistry context is not trustworthy enough.";
  }
  if (status === "caution") {
    const primary = drivers.find((driver) => driver.severity === "caution");
    return primary ? primary.message : "Swimmability requires caution.";
  }
  return "Water is currently suitable for swimming.";
}

function deriveHeadline(status: SwimmabilityStatus): string {
  switch (status) {
    case "good":
      return "Safe for Swimming";
    case "caution":
      return "Use Caution";
    case "poor":
      return "Avoid Swimming";
    default:
      return "Assessment Unavailable";
  }
}

function deriveConfidence(
  status: SwimmabilityStatus,
  recencyStatus: "good" | "caution" | "unknown",
  drivers: SwimmabilityDriver[]
): SwimmabilityConfidence {
  if (status === "unknown") {
    return "unknown";
  }
  if (recencyStatus === "unknown") {
    return "low";
  }
  if (recencyStatus === "caution") {
    return "medium";
  }
  const cautionContext = drivers.some((driver) => driver.key === "weather_context" && driver.severity === "caution");
  if (cautionContext) {
    return "medium";
  }
  return "high";
}

function deriveHighlights(input: {
  status: SwimmabilityStatus;
  confidence: SwimmabilityConfidence;
  recencyStatus: "good" | "caution" | "unknown";
  drivers: SwimmabilityDriver[];
}): SwimmabilityHighlight[] {
  const highlights: SwimmabilityHighlight[] = [];
  const cautionKeys = new Set(
    input.drivers
      .filter((driver) => driver.severity === "caution" || driver.severity === "poor")
      .map((driver) => driver.key)
  );

  if (input.status === "good") {
    if (!cautionKeys.has("free_chlorine") && !cautionKeys.has("ph") && !cautionKeys.has("cyanuric_acid") && !cautionKeys.has("combined_chlorine")) {
      highlights.push({ tone: "positive", label: "Chemistry in range" });
    }
    if (input.recencyStatus === "good") {
      highlights.push({ tone: "positive", label: "Recent test available" });
    }
    if (input.drivers.every((driver) => driver.severity !== "poor")) {
      highlights.push({ tone: "positive", label: "No active swim advisories" });
    }
  } else if (input.status === "caution") {
    if (cautionKeys.has("chemistry_recency")) {
      highlights.push({ tone: "caution", label: "Retest chemistry soon" });
    }
    if (cautionKeys.has("weather_context")) {
      highlights.push({ tone: "caution", label: "Recent weather may affect chlorine" });
    }
    if (cautionKeys.has("combined_chlorine") || cautionKeys.has("free_chlorine") || cautionKeys.has("ph") || cautionKeys.has("cyanuric_acid")) {
      highlights.push({ tone: "caution", label: "Chemistry needs attention" });
    }
  } else if (input.status === "poor") {
    highlights.push({ tone: "negative", label: "Do not swim chemistry condition" });
    if (cautionKeys.has("free_chlorine") || cautionKeys.has("ph") || cautionKeys.has("cyanuric_acid")) {
      highlights.push({ tone: "negative", label: "Correct chemistry before swimming" });
    }
  } else {
    highlights.push({ tone: "neutral", label: "Assessment needs fresher chemistry" });
  }

  if (highlights.length === 0) {
    if (input.confidence === "high") {
      highlights.push({ tone: "positive", label: "Assessment confidence is high" });
    } else if (input.confidence === "medium") {
      highlights.push({ tone: "neutral", label: "Assessment confidence is moderate" });
    } else if (input.confidence === "low") {
      highlights.push({ tone: "caution", label: "Assessment confidence is limited" });
    } else {
      highlights.push({ tone: "neutral", label: "Assessment is currently limited" });
    }
  }

  return highlights.slice(0, 3);
}

function formatAgeLabel(timestamp: string, nowIso: string): string {
  const hours = positiveHoursBetween(timestamp, nowIso);
  if (hours < 1) {
    return "less than 1 hour ago";
  }
  if (hours < 24) {
    const rounded = Math.round(hours);
    return `${rounded} hour${rounded === 1 ? "" : "s"} ago`;
  }
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function positiveHoursBetween(startIso: string, endIso: string): number {
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return STALE_UNKNOWN_HOURS;
  }
  return Math.max(0, (end - start) / (60 * 60 * 1000));
}

function joinReasons(reasons: string[]): string {
  if (reasons.length === 1) {
    return reasons[0];
  }
  return `${reasons.slice(0, -1).join(", ")} and ${reasons[reasons.length - 1]}`;
}

function capitalize(value: string): string {
  return value.length > 0 ? value[0].toUpperCase() + value.slice(1) : value;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
