export type ValueKind = "measured" | "observed" | "derived" | "predicted" | "estimated";
export type SourceType =
  | "manual_test"
  | "manual_observation"
  | "manual_log"
  | "sensor"
  | "weather_provider"
  | "controller"
  | "direct_device"
  | "derived_calculation"
  | "prediction_model"
  | "user_estimate"
  | "default";
export type FreshnessState = "fresh" | "aging" | "stale" | "missing" | "unavailable" | "estimated";
export type ConfidenceBand = "high" | "medium" | "low" | "unknown";

export interface ValueProvenance {
  value_kind: ValueKind;
  source_type: SourceType;
  source_detail: string | null;
  freshness_state: FreshnessState;
  confidence_band: ConfidenceBand;
  measured_at: string | null;
  evaluated_at: string;
  reasons: string[];
}

export function buildValueProvenance(input: ValueProvenance): ValueProvenance {
  return input;
}

export function ageHours(measuredAt: string | null, evaluatedAt: string): number | null {
  if (!measuredAt) {
    return null;
  }
  const measuredMs = Date.parse(measuredAt);
  const evaluatedMs = Date.parse(evaluatedAt);
  if (Number.isNaN(measuredMs) || Number.isNaN(evaluatedMs)) {
    return null;
  }
  return Math.max(0, (evaluatedMs - measuredMs) / (60 * 60 * 1000));
}

export function classifyAgeFreshness(
  measuredAt: string | null,
  evaluatedAt: string,
  thresholds: { freshHours: number; agingHours: number }
): FreshnessState {
  const age = ageHours(measuredAt, evaluatedAt);
  if (age == null) {
    return "missing";
  }
  if (age <= thresholds.freshHours) {
    return "fresh";
  }
  if (age <= thresholds.agingHours) {
    return "aging";
  }
  return "stale";
}
