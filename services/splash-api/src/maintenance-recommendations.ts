import { randomUUID } from "node:crypto";
import type { ChemicalAdditionRecord } from "./chemical-additions.js";
import type { ChemistryObservationRecord } from "./chemistry-observations.js";
import type { MaintenanceActivityRecord } from "./maintenance-activities.js";
import type { NotificationType } from "./notifications.js";
import type { PoolCoverExposureSummaryItemView, PoolCoverExposureSummaryView } from "./pool-cover-events.js";
import type { PredictedSwimmabilityItemView, PredictedSwimmabilityView } from "./predicted-swimmability.js";
import type { PumpCirculationSummaryItemView, PumpCirculationSummaryView } from "./pump-telemetry.js";
import type { PumpLatestState, ChlorinatorLatestState } from "./state.js";
import type { SwimmabilityConfidence, SwimmabilityView } from "./swimmability.js";
import type { WaterTestingFreshnessView } from "./water-testing-schedule.js";

export type MaintenanceRecommendationCategory =
  | "retest"
  | "chemistry_adjustment"
  | "circulation"
  | "cover_usage"
  | "cleaning"
  | "inspection"
  | "wait";

export type MaintenanceRecommendationPriority = "now" | "soon" | "monitor";

export interface MaintenanceRecommendationSupportingInput {
  key: string;
  label: string;
  detail: string;
}

export interface MaintenanceRecommendationItemView {
  id: string;
  category: MaintenanceRecommendationCategory;
  priority: MaintenanceRecommendationPriority;
  title: string;
  summary: string;
  recommended_action: string;
  why: string[];
  confidence: SwimmabilityConfidence;
  blocking_factors: string[];
  supporting_inputs: MaintenanceRecommendationSupportingInput[];
  related_alert_types: NotificationType[];
}

export interface MaintenanceRecommendationsView {
  generated_at: string;
  current: {
    swimmability: {
      status: SwimmabilityView["status"];
      score: number;
      confidence: SwimmabilityConfidence;
      headline: string;
      updated_at: string;
    };
    predicted: {
      horizon: PredictedSwimmabilityItemView["horizon"];
      status: PredictedSwimmabilityItemView["status"];
      score: number;
      confidence: SwimmabilityConfidence;
      trend: PredictedSwimmabilityItemView["trend"];
      headline: string;
    } | null;
  };
  recommendations: MaintenanceRecommendationItemView[];
}

export interface MaintenanceRecommendationsQueryInput {
  limit: string | null;
  category: string | null;
  priority: string | null;
}

export interface MaintenanceRecommendationsInput {
  swimmability: SwimmabilityView;
  predicted: PredictedSwimmabilityView;
  freshness: WaterTestingFreshnessView;
  observations: ChemistryObservationRecord[];
  maintenanceActivities: MaintenanceActivityRecord[];
  chemicalAdditions: ChemicalAdditionRecord[];
  circulation: PumpCirculationSummaryView;
  coverExposure: PoolCoverExposureSummaryView;
  pump: PumpLatestState;
  chlorinator: ChlorinatorLatestState;
  query: MaintenanceRecommendationsQueryInput;
  now?: string;
}

const CATEGORIES: MaintenanceRecommendationCategory[] = [
  "retest",
  "chemistry_adjustment",
  "circulation",
  "cover_usage",
  "cleaning",
  "inspection",
  "wait"
];

const PRIORITIES: MaintenanceRecommendationPriority[] = ["now", "soon", "monitor"];
const LOW_CONFIDENCE: SwimmabilityConfidence[] = ["low", "unknown"];

export function buildMaintenanceRecommendationsView(input: MaintenanceRecommendationsInput): MaintenanceRecommendationsView {
  const generatedAt = input.now ?? new Date().toISOString();
  const query = validateRecommendationQueryInput(input.query);

  const topPrediction = chooseTopPrediction(input.predicted);
  const recommendations = buildRecommendationCandidates(input, topPrediction, generatedAt)
    .filter((item) => !query.category || item.category === query.category)
    .filter((item) => !query.priority || item.priority === query.priority)
    .sort(compareRecommendations)
    .slice(0, query.limit);

  return {
    generated_at: generatedAt,
    current: {
      swimmability: {
        status: input.swimmability.status,
        score: input.swimmability.score,
        confidence: input.swimmability.confidence,
        headline: input.swimmability.headline,
        updated_at: input.swimmability.updated_at
      },
      predicted: topPrediction
        ? {
            horizon: topPrediction.horizon,
            status: topPrediction.status,
            score: topPrediction.score,
            confidence: topPrediction.confidence,
            trend: topPrediction.trend,
            headline: topPrediction.headline
          }
        : null
    },
    recommendations: recommendations.length > 0 ? recommendations : [buildWaitRecommendation(input, topPrediction)]
  };
}

function buildRecommendationCandidates(
  input: MaintenanceRecommendationsInput,
  topPrediction: PredictedSwimmabilityItemView | null,
  now: string
): MaintenanceRecommendationItemView[] {
  const recommendations: MaintenanceRecommendationItemView[] = [];
  const chemistryFreshness = input.swimmability.input_provenance.chemistry.freshness_state;
  const chemistryTrusted = chemistryFreshness === "fresh" || chemistryFreshness === "aging";
  const predictedDecline = topPrediction && (topPrediction.trend === "declining" || topPrediction.score < input.swimmability.score);
  const circulation24h = findCirculationSummary(input.circulation, "24h");
  const cover24h = findCoverSummary(input.coverExposure, "24h");
  const latestObservation = input.observations[0] ?? null;
  const lastBrushing = findLatestActivity(input.maintenanceActivities, ["brushed"]);
  const lastVacuuming = findLatestActivity(input.maintenanceActivities, ["vacuumed", "robot_cleaned"]);
  const hasRecentChlorineAddition = input.chemicalAdditions.some((addition) => {
    if (!CHLORINE_ADDITION_TYPES.has(addition.chemical_type)) {
      return false;
    }
    const age = ageHours(addition.recorded_at, now);
    return age != null && age <= 24;
  });
  const staleChemicals = new Set(
    input.freshness.items
      .filter((item) => item.enabled && (item.status === "stale" || item.status === "unavailable"))
      .map((item) => item.chemicalKey)
  );

  if (
    input.swimmability.status === "unknown"
    || LOW_CONFIDENCE.includes(input.swimmability.confidence)
    || staleChemicals.has("free_chlorine")
    || staleChemicals.has("ph")
  ) {
    recommendations.push({
      id: randomUUID(),
      category: "retest",
      priority: input.swimmability.status === "unknown" ? "now" : "soon",
      title: "Retest free chlorine and pH",
      summary: "Refresh the chemistry baseline before relying on corrective guidance.",
      recommended_action: "Run a manual free chlorine and pH test and log the result.",
      why: uniqueStrings([
        input.swimmability.status === "unknown" ? "Current swimmability is unknown without trustworthy chemistry." : null,
        staleChemicals.has("free_chlorine") ? "Free chlorine freshness is stale or unavailable." : null,
        staleChemicals.has("ph") ? "pH freshness is stale or unavailable." : null,
        LOW_CONFIDENCE.includes(input.swimmability.confidence) ? "Splash confidence is reduced because one or more critical inputs are stale or missing." : null
      ]),
      confidence: "high",
      blocking_factors: [],
      supporting_inputs: [
        {
          key: "chemistry_freshness",
          label: "Chemistry freshness",
          detail: input.swimmability.input_provenance.chemistry.freshness_state
        },
        {
          key: "swimmability_confidence",
          label: "Current swimmability confidence",
          detail: input.swimmability.confidence
        }
      ],
      related_alert_types: ["chemistry_test_due", "chemistry_value_stale", "chemistry_value_unavailable", "swimmability_low_confidence"]
    });
  }

  if (chemistryTrusted && hasDriver(input.swimmability, "free_chlorine")) {
    recommendations.push({
      id: randomUUID(),
      category: "chemistry_adjustment",
      priority: input.swimmability.status === "poor" ? "now" : "soon",
      title: "Add chlorine",
      summary: "Sanitizer margin needs support.",
      recommended_action: "Add chlorine using your normal treatment process, then retest after circulation mixes the water.",
      why: uniqueStrings([
        driverMessage(input.swimmability, "free_chlorine"),
        predictedDecline ? `${formatHorizon(topPrediction?.horizon)} prediction also trends downward.` : null
      ]),
      confidence: chemistryFreshness === "fresh" ? "high" : "medium",
      blocking_factors: hasRecentChlorineAddition ? ["A recent chlorine addition is already logged, so confirm mixing before adding more."] : [],
      supporting_inputs: [
        {
          key: "current_swimmability",
          label: "Current score",
          detail: `${input.swimmability.score} (${input.swimmability.status})`
        },
        {
          key: "chemistry_freshness",
          label: "Chemistry freshness",
          detail: chemistryFreshness
        }
      ],
      related_alert_types: ["swimmability_caution", "swimmability_poor"]
    });
  }

  if (chemistryTrusted && hasDriver(input.swimmability, "ph")) {
    recommendations.push({
      id: randomUUID(),
      category: "chemistry_adjustment",
      priority: input.swimmability.status === "poor" ? "now" : "soon",
      title: "Adjust pH",
      summary: "pH is outside the preferred swimming range.",
      recommended_action: "Adjust pH using your normal treatment process, then retest after the pool has circulated.",
      why: [driverMessage(input.swimmability, "ph") ?? "The latest pH reading is outside the recommended range."],
      confidence: chemistryFreshness === "fresh" ? "high" : "medium",
      blocking_factors: [],
      supporting_inputs: [
        {
          key: "chemistry_freshness",
          label: "Chemistry freshness",
          detail: chemistryFreshness
        }
      ],
      related_alert_types: ["swimmability_caution", "swimmability_poor"]
    });
  }

  if (circulation24h && (circulation24h.runtime_percent < 20 || circulation24h.status !== "available")) {
    recommendations.push({
      id: randomUUID(),
      category: "circulation",
      priority: circulation24h.runtime_percent < 20 ? "soon" : "monitor",
      title: circulation24h.runtime_percent < 20 ? "Run the pump longer" : "Check circulation coverage",
      summary: "Recent circulation support looks weaker than ideal for stable chemistry distribution.",
      recommended_action:
        circulation24h.runtime_percent < 20
          ? "Increase circulation time and confirm the pump is running when treatments are added."
          : "Review recent pump telemetry coverage before relying on circulation-sensitive guidance.",
      why: uniqueStrings([
        `Pump runtime over the last 24 hours was ${circulation24h.runtime_percent.toFixed(1)}%.`,
        circulation24h.status !== "available" ? "Circulation summary coverage is incomplete." : null,
        predictedDecline ? "Short-horizon prediction is already trending down." : null
      ]),
      confidence: circulation24h.status === "available" ? "medium" : "low",
      blocking_factors: circulation24h.status !== "available" ? ["Telemetry gaps limit how confidently Splash can judge recent circulation."] : [],
      supporting_inputs: [
        {
          key: "circulation_runtime_24h",
          label: "Circulation last 24h",
          detail: `${circulation24h.runtime_minutes} min`
        },
        {
          key: "circulation_coverage_24h",
          label: "Telemetry coverage",
          detail: `${circulation24h.sample_coverage_percent.toFixed(1)}%`
        }
      ],
      related_alert_types: ["swimmability_low_confidence"]
    });
  }

  if (cover24h && predictedDecline && cover24h.daylight_uncovered_minutes >= 4 * 60) {
    recommendations.push({
      id: randomUUID(),
      category: "cover_usage",
      priority: "monitor",
      title: "Use the cover during peak sun",
      summary: "Recent uncovered daylight exposure is increasing predicted chlorine demand.",
      recommended_action: "Keep the pool covered when practical during daytime idle periods.",
      why: uniqueStrings([
        `Daylight uncovered time over the last 24 hours was ${Math.round(cover24h.daylight_uncovered_minutes / 60)}h.`,
        topPrediction ? `${formatHorizon(topPrediction.horizon)} prediction is ${topPrediction.trend}.` : null
      ]),
      confidence: cover24h.status === "available" ? "medium" : "low",
      blocking_factors: cover24h.status !== "available" ? ["Cover history is incomplete, so exposure estimates are conservative."] : [],
      supporting_inputs: [
        {
          key: "daylight_uncovered",
          label: "Daylight uncovered",
          detail: `${cover24h.daylight_uncovered_minutes} min`
        }
      ],
      related_alert_types: []
    });
  }

  if (latestObservation && (latestObservation.algae_presence === "visible" || latestObservation.algae_presence === "suspected")) {
    recommendations.push({
      id: randomUUID(),
      category: "cleaning",
      priority: latestObservation.algae_presence === "visible" ? "now" : "soon",
      title: "Brush the pool",
      summary: "Recent observations suggest algae or boundary-layer buildup needs attention.",
      recommended_action: "Brush the pool surfaces and retest chemistry after circulation.",
      why: uniqueStrings([
        latestObservation.algae_presence === "visible" ? "Visible algae was recorded." : "Algae was suspected in the latest observation.",
        lastBrushing ? `Last brushing was logged ${formatAge(lastBrushing.recorded_at, now)} ago.` : "No recent brushing activity is logged."
      ]),
      confidence: observationConfidence(latestObservation.recorded_at, now),
      blocking_factors: [],
      supporting_inputs: [
        {
          key: "algae_observation",
          label: "Latest algae observation",
          detail: latestObservation.algae_presence
        }
      ],
      related_alert_types: []
    });
  }

  if (
    latestObservation
    && (latestObservation.debris_level === "moderate" || latestObservation.debris_level === "heavy" || latestObservation.clarity === "cloudy" || latestObservation.clarity === "opaque")
  ) {
    recommendations.push({
      id: randomUUID(),
      category: "cleaning",
      priority: latestObservation.debris_level === "heavy" || latestObservation.clarity === "opaque" ? "now" : "soon",
      title: "Brush or vacuum the pool",
      summary: "Observed debris or poor clarity suggests cleanup is needed before conditions worsen.",
      recommended_action: "Skim, vacuum, or run the robot cleaner, then review filter and circulation performance.",
      why: uniqueStrings([
        latestObservation.debris_level ? `Debris was logged as ${latestObservation.debris_level}.` : null,
        latestObservation.clarity ? `Water clarity was logged as ${latestObservation.clarity.replace("_", " ")}.` : null,
        lastVacuuming ? `Last vacuum or robot-cleaning was logged ${formatAge(lastVacuuming.recorded_at, now)} ago.` : "No recent vacuum or robot-cleaning activity is logged."
      ]),
      confidence: observationConfidence(latestObservation.recorded_at, now),
      blocking_factors: [],
      supporting_inputs: [
        {
          key: "clarity_observation",
          label: "Latest clarity",
          detail: latestObservation.clarity ?? "unavailable"
        },
        {
          key: "debris_observation",
          label: "Latest debris level",
          detail: latestObservation.debris_level ?? "unavailable"
        }
      ],
      related_alert_types: []
    });
  }

  if (
    input.pump.filterCondition === "dirty"
    || input.pump.filterCondition === "watch"
    || (typeof input.pump.filterPressurePsi === "number" && input.pump.filterPressurePsi >= 20)
  ) {
    recommendations.push({
      id: randomUUID(),
      category: "inspection",
      priority: input.pump.filterCondition === "dirty" ? "soon" : "monitor",
      title: input.pump.filterCondition === "dirty" ? "Clean the filter" : "Inspect filter condition",
      summary: "Filter telemetry suggests circulation support may be degrading.",
      recommended_action:
        input.pump.filterCondition === "dirty"
          ? "Clean or backwash the filter and confirm flow returns to normal."
          : "Inspect filter pressure and condition before relying on circulation-sensitive guidance.",
      why: uniqueStrings([
        input.pump.filterCondition ? `Filter condition is reported as ${input.pump.filterCondition}.` : null,
        typeof input.pump.filterPressurePsi === "number" ? `Filter pressure is ${input.pump.filterPressurePsi} psi.` : null
      ]),
      confidence: input.pump.filterCondition ? "medium" : "low",
      blocking_factors: input.pump.filterCondition == null && input.pump.filterPressurePsi == null ? ["Filter telemetry is incomplete."] : [],
      supporting_inputs: [
        {
          key: "filter_condition",
          label: "Filter condition",
          detail: input.pump.filterCondition ?? "unknown"
        },
        {
          key: "filter_pressure",
          label: "Filter pressure",
          detail: input.pump.filterPressurePsi == null ? "Unavailable" : `${input.pump.filterPressurePsi} psi`
        }
      ],
      related_alert_types: []
    });
  }

  if (
    (input.chlorinator.runState === "unknown" || input.chlorinator.outputPercent == null)
    && predictedDecline
  ) {
    recommendations.push({
      id: randomUUID(),
      category: "inspection",
      priority: "monitor",
      title: "Investigate chlorinator telemetry",
      summary: "Prediction quality is reduced because live chlorinator support is incomplete.",
      recommended_action: "Confirm the salt cell is configured, producing, and reporting output percent reliably.",
      why: uniqueStrings([
        input.chlorinator.runState === "unknown" ? "The current chlorinator run state is unknown." : null,
        input.chlorinator.outputPercent == null ? "No chlorinator output percentage is available." : null
      ]),
      confidence: "low",
      blocking_factors: ["Prediction confidence is limited until chlorinator telemetry becomes more complete."],
      supporting_inputs: [
        {
          key: "chlorinator_state",
          label: "Chlorinator state",
          detail: input.chlorinator.runState ?? "unknown"
        },
        {
          key: "chlorinator_output",
          label: "Chlorinator output",
          detail: input.chlorinator.outputPercent == null ? "Unavailable" : `${input.chlorinator.outputPercent}%`
        }
      ],
      related_alert_types: ["swimmability_low_confidence"]
    });
  }

  return dedupeRecommendations(recommendations);
}

function buildWaitRecommendation(
  input: MaintenanceRecommendationsInput,
  topPrediction: PredictedSwimmabilityItemView | null
): MaintenanceRecommendationItemView {
  return {
    id: randomUUID(),
    category: "wait",
    priority: "monitor",
    title: "Wait and monitor",
    summary: "No immediate maintenance action stands out from the current evidence.",
    recommended_action: "Keep monitoring current and predicted swimmability, and retest on schedule.",
    why: uniqueStrings([
      `Current swimmability is ${input.swimmability.status} at ${input.swimmability.score}.`,
      topPrediction ? `${formatHorizon(topPrediction.horizon)} prediction is ${topPrediction.status} with ${topPrediction.confidence} confidence.` : null
    ]),
    confidence: LOW_CONFIDENCE.includes(input.swimmability.confidence) ? "low" : "medium",
    blocking_factors: LOW_CONFIDENCE.includes(input.swimmability.confidence)
      ? ["Low confidence means this recommendation is provisional until critical inputs are refreshed."]
      : [],
    supporting_inputs: [
      {
        key: "current_swimmability",
        label: "Current swimmability",
        detail: `${input.swimmability.score} (${input.swimmability.status})`
      }
    ],
    related_alert_types: []
  };
}

function validateRecommendationQueryInput(input: MaintenanceRecommendationsQueryInput): {
  limit: number;
  category: MaintenanceRecommendationCategory | null;
  priority: MaintenanceRecommendationPriority | null;
} {
  const limitValue = Number.parseInt(input.limit ?? "5", 10);
  const limit = Number.isInteger(limitValue) && limitValue > 0 ? Math.min(limitValue, 20) : 5;
  const category = input.category && CATEGORIES.includes(input.category as MaintenanceRecommendationCategory)
    ? input.category as MaintenanceRecommendationCategory
    : null;
  const priority = input.priority && PRIORITIES.includes(input.priority as MaintenanceRecommendationPriority)
    ? input.priority as MaintenanceRecommendationPriority
    : null;
  return { limit, category, priority };
}

function chooseTopPrediction(view: PredictedSwimmabilityView): PredictedSwimmabilityItemView | null {
  if (view.predictions.length === 0) {
    return null;
  }
  return view.predictions[0] ?? null;
}

function compareRecommendations(a: MaintenanceRecommendationItemView, b: MaintenanceRecommendationItemView): number {
  const priorityDelta = priorityWeight(a.priority) - priorityWeight(b.priority);
  if (priorityDelta !== 0) {
    return priorityDelta;
  }
  const confidenceDelta = confidenceWeight(b.confidence) - confidenceWeight(a.confidence);
  if (confidenceDelta !== 0) {
    return confidenceDelta;
  }
  return a.title.localeCompare(b.title);
}

function dedupeRecommendations(items: MaintenanceRecommendationItemView[]): MaintenanceRecommendationItemView[] {
  const seen = new Set<string>();
  const deduped: MaintenanceRecommendationItemView[] = [];
  for (const item of items) {
    const key = `${item.category}:${item.title}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(item);
  }
  return deduped;
}

function hasDriver(swimmability: SwimmabilityView, key: string): boolean {
  return swimmability.drivers.some((driver) => driver.key === key && (driver.severity === "caution" || driver.severity === "poor"));
}

function driverMessage(swimmability: SwimmabilityView, key: string): string | null {
  return swimmability.drivers.find((driver) => driver.key === key)?.message ?? null;
}

function findCirculationSummary(
  view: PumpCirculationSummaryView,
  window: PumpCirculationSummaryItemView["window"]
): PumpCirculationSummaryItemView | null {
  return view.summaries.find((item) => item.window === window) ?? null;
}

function findCoverSummary(
  view: PoolCoverExposureSummaryView,
  window: PoolCoverExposureSummaryItemView["window"]
): PoolCoverExposureSummaryItemView | null {
  return view.summaries.find((item) => item.window === window) ?? null;
}

function findLatestActivity(
  activities: MaintenanceActivityRecord[],
  types: MaintenanceActivityRecord["activity_type"][]
): MaintenanceActivityRecord | null {
  return activities.find((activity) => types.includes(activity.activity_type)) ?? null;
}

function ageHours(recordedAt: string, now: string): number | null {
  const recorded = Date.parse(recordedAt);
  const current = Date.parse(now);
  if (Number.isNaN(recorded) || Number.isNaN(current)) {
    return null;
  }
  return Math.max(0, (current - recorded) / (60 * 60 * 1000));
}

function formatAge(recordedAt: string, now: string): string {
  const hours = ageHours(recordedAt, now);
  if (hours == null) {
    return "at an unknown time";
  }
  if (hours < 24) {
    return `${Math.round(hours)}h`;
  }
  return `${Math.round(hours / 24)}d`;
}

function observationConfidence(recordedAt: string, now: string): SwimmabilityConfidence {
  const hours = ageHours(recordedAt, now);
  if (hours == null) {
    return "low";
  }
  if (hours <= 24) {
    return "high";
  }
  if (hours <= 72) {
    return "medium";
  }
  return "low";
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0))];
}

function priorityWeight(priority: MaintenanceRecommendationPriority): number {
  switch (priority) {
    case "now":
      return 0;
    case "soon":
      return 1;
    case "monitor":
      return 2;
  }
}

function confidenceWeight(confidence: SwimmabilityConfidence): number {
  switch (confidence) {
    case "high":
      return 4;
    case "medium":
      return 3;
    case "low":
      return 2;
    case "unknown":
      return 1;
  }
}

function formatHorizon(horizon: PredictedSwimmabilityItemView["horizon"] | undefined): string {
  if (!horizon) {
    return "Short-horizon";
  }
  return horizon;
}

const CHLORINE_ADDITION_TYPES = new Set(["liquid_chlorine", "cal_hypo", "trichlor", "dichlor"]);
