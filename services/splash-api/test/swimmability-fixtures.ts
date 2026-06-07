import type { SwimmabilityView } from "../src/swimmability.js";

export function buildUnknownSwimmabilityView(): SwimmabilityView {
  return {
    status: "unknown",
    score: 0,
    summary: "No chemistry reading is available yet.",
    headline: "No data",
    confidence: "unknown",
    last_chemistry_age_label: null,
    highlights: [],
    updated_at: "2026-01-01T00:00:00.000Z",
    drivers: [],
    inputs: {
      chemistry_latest_at: null,
      cover_latest_at: null,
      forecast_fetched_at: null,
      telemetry_latest_at: null
    },
    input_provenance: {
      chemistry: {
        value_kind: "measured",
        source_type: "manual_test",
        source_detail: "manual",
        freshness_state: "missing",
        confidence_band: "unknown",
        measured_at: null,
        evaluated_at: "2026-01-01T00:00:00.000Z",
        reasons: ["No chemistry reading is available yet."]
      },
      cover: {
        value_kind: "observed",
        source_type: "manual_log",
        source_detail: "manual",
        freshness_state: "missing",
        confidence_band: "unknown",
        measured_at: null,
        evaluated_at: "2026-01-01T00:00:00.000Z",
        reasons: ["No cover event is available yet."]
      },
      weather_forecast: {
        value_kind: "predicted",
        source_type: "weather_provider",
        source_detail: "unknown",
        freshness_state: "unavailable",
        confidence_band: "unknown",
        measured_at: null,
        evaluated_at: "2026-01-01T00:00:00.000Z",
        reasons: ["No weather forecast is available yet."]
      },
      water_temperature: {
        value_kind: "measured",
        source_type: "controller",
        source_detail: "unknown",
        freshness_state: "unavailable",
        confidence_band: "unknown",
        measured_at: null,
        evaluated_at: "2026-01-01T00:00:00.000Z",
        reasons: ["No recent water temperature telemetry is available."]
      },
      rainfall_since_chemistry: {
        value_kind: "derived",
        source_type: "derived_calculation",
        source_detail: "weather.rainfall_since_chemistry",
        freshness_state: "missing",
        confidence_band: "unknown",
        measured_at: null,
        evaluated_at: "2026-01-01T00:00:00.000Z",
        reasons: ["Rainfall context cannot be derived without chemistry history."]
      }
    }
  };
}
