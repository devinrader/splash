import test from "node:test";
import assert from "node:assert/strict";
import { EventBroker } from "../src/events.js";
import { buildUnknownPredictedSwimmabilityView, buildUnknownSwimmabilityView } from "./swimmability-fixtures.js";
import { LocalHttpServer, type HttpHandlers } from "../src/http.js";
import { buildSwimmabilityView } from "../src/swimmability.js";
import { buildPredictedSwimmabilityView } from "../src/predicted-swimmability.js";

test("buildSwimmabilityView returns poor when chemistry hits a do-not-swim condition", () => {
  const result = buildSwimmabilityView({
    chemistry: {
      id: "reading-1",
      pool_id: "pool-1",
      ph: 7.5,
      free_chlorine: 0.3,
      total_chlorine: 0.5,
      total_alkalinity: 90,
      calcium_hardness: 260,
      cyanuric_acid: 70,
      source: "manual",
      recorded_at: "2026-06-04T12:00:00.000Z",
      created_at: "2026-06-04T12:00:00.000Z"
    },
    swimmabilityPolicy: {
      freeChlorine: { min: 3, target: 5, max: 10, unsafeMin: 0.5, unsafeMax: null, unit: "ppm" },
      ph: { min: 7.2, target: 7.6, max: 7.8, unsafeMin: 7.0, unsafeMax: 8.2, unit: null }
    },
    cover: { current: null },
    forecast: {
      pool_id: "pool-1",
      provider: "openmeteo",
      status: "available",
      message: "available",
      stale: false,
      fetched_at: "2026-06-04T13:00:00.000Z",
      location: null,
      daily: [{ date: "2026-06-04", weather_code: null, high_temp_f: 92, high_temp_c: null, low_temp_f: 72, low_temp_c: null, precipitation_probability_max: 0, precipitation_amount: 0, precipitation_unit: "mm", uv_index_max: 9, sunrise: null, sunset: null }],
      hourly: []
    },
    latestTemperatures: {
      controller_id: "default",
      status: "available",
      message: "ok",
      last_updated: "2026-06-04T13:00:00.000Z",
      readings: {
        pool_water: {
          timestamp: "2026-06-04T13:00:00.000Z",
          original_value: 86,
          original_unit: "F",
          normalized_f: 86,
          normalized_c: 30,
          raw_byte: null,
          controller_timestamp: null
        }
      }
    },
    rainfallSinceChemistryInches: 0,
    now: "2026-06-04T13:00:00.000Z"
  });

  assert.equal(result.status, "poor");
  assert.equal(result.headline, "Avoid Swimming");
  assert.equal(result.confidence, "medium");
  assert.ok(result.highlights.some((highlight) => highlight.label === "Do not swim chemistry condition"));
  assert.ok(result.drivers.some((driver) => driver.key === "free_chlorine" && driver.severity === "poor"));
  assert.equal(result.input_provenance.chemistry.value_kind, "measured");
  assert.equal(result.input_provenance.chemistry.source_type, "manual_test");
  assert.equal(result.input_provenance.weather_forecast.value_kind, "predicted");
});

test("buildSwimmabilityView uses configured unsafe bounds instead of hidden constants", () => {
  const result = buildSwimmabilityView({
    chemistry: {
      id: "reading-1",
      pool_id: "pool-1",
      ph: 7.15,
      free_chlorine: 2.5,
      total_chlorine: 2.7,
      total_alkalinity: 90,
      calcium_hardness: 260,
      cyanuric_acid: 70,
      source: "manual",
      recorded_at: "2026-06-04T12:00:00.000Z",
      created_at: "2026-06-04T12:00:00.000Z"
    },
    swimmabilityPolicy: {
      freeChlorine: { min: 3, target: 5, max: 10, unsafeMin: 2.0, unsafeMax: null, unit: "ppm" },
      ph: { min: 7.2, target: 7.6, max: 7.8, unsafeMin: 7.1, unsafeMax: 8.2, unit: null }
    },
    cover: { current: null },
    forecast: {
      pool_id: "pool-1",
      provider: "openmeteo",
      status: "available",
      message: "available",
      stale: false,
      fetched_at: "2026-06-04T13:00:00.000Z",
      location: null,
      daily: [{ date: "2026-06-04", weather_code: null, high_temp_f: 86, high_temp_c: null, low_temp_f: 72, low_temp_c: null, precipitation_probability_max: 0, precipitation_amount: 0, precipitation_unit: "mm", uv_index_max: 7, sunrise: null, sunset: null }],
      hourly: []
    },
    latestTemperatures: {
      controller_id: "default",
      status: "available",
      message: "ok",
      last_updated: "2026-06-04T13:00:00.000Z",
      readings: {
        pool_water: {
          timestamp: "2026-06-04T13:00:00.000Z",
          original_value: 84,
          original_unit: "F",
          normalized_f: 84,
          normalized_c: 28.9,
          raw_byte: null,
          controller_timestamp: null
        }
      }
    },
    rainfallSinceChemistryInches: 0,
    now: "2026-06-04T13:00:00.000Z"
  });

  assert.equal(result.status, "caution");
  assert.ok(result.drivers.some((driver) => driver.key === "ph" && driver.severity === "caution"));
  assert.ok(result.drivers.every((driver) => !(driver.key === "ph" && driver.severity === "poor")));
});

test("buildSwimmabilityView uses configured water temperature bounds for comfort messaging", () => {
  const result = buildSwimmabilityView({
    chemistry: {
      id: "reading-1",
      pool_id: "pool-1",
      ph: 7.5,
      free_chlorine: 5,
      total_chlorine: 5.1,
      total_alkalinity: 90,
      calcium_hardness: 260,
      cyanuric_acid: 70,
      source: "manual",
      recorded_at: "2026-06-04T12:00:00.000Z",
      created_at: "2026-06-04T12:00:00.000Z"
    },
    swimmabilityPolicy: {
      freeChlorine: { min: 3, target: 5, max: 10, unsafeMin: 0.5, unsafeMax: null, unit: "ppm" },
      ph: { min: 7.2, target: 7.6, max: 7.8, unsafeMin: 7.0, unsafeMax: 8.2, unit: null },
      waterTemperature: { min: 78, target: 84, max: 88, unsafeMin: null, unsafeMax: null, unit: "F" }
    },
    cover: { current: null },
    forecast: {
      pool_id: "pool-1",
      provider: "openmeteo",
      status: "available",
      message: "available",
      stale: false,
      fetched_at: "2026-06-04T13:00:00.000Z",
      location: null,
      daily: [{ date: "2026-06-04", weather_code: null, high_temp_f: 84, high_temp_c: null, low_temp_f: 72, low_temp_c: null, precipitation_probability_max: 0, precipitation_amount: 0, precipitation_unit: "mm", uv_index_max: 4, sunrise: null, sunset: null }],
      hourly: []
    },
    latestTemperatures: {
      controller_id: "default",
      status: "available",
      message: "ok",
      last_updated: "2026-06-04T13:00:00.000Z",
      readings: {
        pool_water: {
          timestamp: "2026-06-04T13:00:00.000Z",
          original_value: 76,
          original_unit: "F",
          normalized_f: 76,
          normalized_c: 24.4,
          raw_byte: null,
          controller_timestamp: null
        }
      }
    },
    rainfallSinceChemistryInches: 0,
    now: "2026-06-04T13:00:00.000Z"
  });

  assert.equal(result.status, "caution");
  assert.ok(result.drivers.some((driver) => driver.key === "water_temperature" && driver.severity === "caution"));
});

test("buildSwimmabilityView returns unknown when chemistry is old and uncovered in high UV after rain", () => {
  const result = buildSwimmabilityView({
    chemistry: {
      id: "reading-1",
      pool_id: "pool-1",
      ph: 7.5,
      free_chlorine: 5,
      total_chlorine: 5.2,
      total_alkalinity: 90,
      calcium_hardness: 260,
      cyanuric_acid: 70,
      source: "manual",
      recorded_at: "2026-05-22T12:00:00.000Z",
      created_at: "2026-05-22T12:00:00.000Z"
    },
    swimmabilityPolicy: {
      freeChlorine: { min: 3, target: 5, max: 10, unsafeMin: 0.5, unsafeMax: null, unit: "ppm" },
      ph: { min: 7.2, target: 7.6, max: 7.8, unsafeMin: 7.0, unsafeMax: 8.2, unit: null }
    },
    cover: {
      current: {
        id: "cover-1",
        pool_id: "pool-1",
        state: "off",
        cover_type: "unknown",
        source: "manual",
        recorded_at: "2026-06-04T13:00:00.000Z",
        created_at: "2026-06-04T13:00:00.000Z"
      }
    },
    forecast: {
      pool_id: "pool-1",
      provider: "openmeteo",
      status: "available",
      message: "available",
      stale: false,
      fetched_at: "2026-06-04T13:00:00.000Z",
      location: null,
      daily: [{ date: "2026-06-04", weather_code: null, high_temp_f: 94, high_temp_c: null, low_temp_f: 72, low_temp_c: null, precipitation_probability_max: 80, precipitation_amount: 8, precipitation_unit: "mm", uv_index_max: 10, sunrise: null, sunset: null }],
      hourly: []
    },
    latestTemperatures: {
      controller_id: "default",
      status: "available",
      message: "ok",
      last_updated: "2026-06-04T13:00:00.000Z",
      readings: {
        pool_water: {
          timestamp: "2026-06-04T13:00:00.000Z",
          original_value: 88,
          original_unit: "F",
          normalized_f: 88,
          normalized_c: 31.1,
          raw_byte: null,
          controller_timestamp: null
        }
      }
    },
    rainfallSinceChemistryInches: 1.2,
    now: "2026-06-04T13:00:00.000Z"
  });

  assert.equal(result.status, "unknown");
  assert.equal(result.headline, "Assessment Unavailable");
  assert.equal(result.confidence, "unknown");
  assert.ok(result.drivers.some((driver) => driver.key === "chemistry_recency" && driver.severity === "unknown"));
  assert.equal(result.input_provenance.chemistry.freshness_state, "stale");
  assert.equal(result.input_provenance.cover.source_type, "manual_log");
  assert.equal(result.input_provenance.rainfall_since_chemistry.value_kind, "derived");
});

test("buildPredictedSwimmabilityView projects horizon predictions with show-your-work metadata", () => {
  const chemistry = {
    id: "reading-1",
    pool_id: "pool-1",
    ph: 7.5,
    free_chlorine: 4.8,
    total_chlorine: 5.1,
    total_alkalinity: 90,
    calcium_hardness: 260,
    cyanuric_acid: 60,
    source: "manual" as const,
    recorded_at: "2026-06-04T10:00:00.000Z",
    created_at: "2026-06-04T10:00:00.000Z"
  };
  const swimmabilityInput = {
    chemistry,
    swimmabilityPolicy: {
      freeChlorine: { min: 3, target: 5, max: 10, unsafeMin: 0.5, unsafeMax: null, unit: "ppm" },
      ph: { min: 7.2, target: 7.6, max: 7.8, unsafeMin: 7.0, unsafeMax: 8.2, unit: null }
    },
    cover: {
      current: {
        id: "cover-1",
        pool_id: "pool-1",
        state: "on" as const,
        cover_type: "solar" as const,
        source: "manual" as const,
        recorded_at: "2026-06-04T12:00:00.000Z",
        created_at: "2026-06-04T12:00:00.000Z"
      }
    },
    forecast: {
      pool_id: "pool-1",
      provider: "openmeteo",
      status: "available" as const,
      message: "available",
      stale: false,
      fetched_at: "2026-06-04T12:00:00.000Z",
      location: null,
      daily: [
        { date: "2026-06-04", weather_code: null, high_temp_f: 88, high_temp_c: null, low_temp_f: 72, low_temp_c: null, precipitation_probability_max: 20, precipitation_amount: 1, precipitation_unit: "mm" as const, uv_index_max: 8, sunrise: null, sunset: null },
        { date: "2026-06-05", weather_code: null, high_temp_f: 90, high_temp_c: null, low_temp_f: 73, low_temp_c: null, precipitation_probability_max: 35, precipitation_amount: 4, precipitation_unit: "mm" as const, uv_index_max: 7, sunrise: null, sunset: null },
        { date: "2026-06-06", weather_code: null, high_temp_f: 86, high_temp_c: null, low_temp_f: 70, low_temp_c: null, precipitation_probability_max: 65, precipitation_amount: 9, precipitation_unit: "mm" as const, uv_index_max: 6, sunrise: null, sunset: null }
      ],
      hourly: []
    },
    latestTemperatures: {
      controller_id: "default",
      status: "available" as const,
      message: "ok",
      last_updated: "2026-06-04T12:00:00.000Z",
      readings: {
        pool_water: {
          timestamp: "2026-06-04T12:00:00.000Z",
          original_value: 84,
          original_unit: "F" as const,
          normalized_f: 84,
          normalized_c: 28.9,
          raw_byte: null,
          controller_timestamp: null
        }
      }
    },
    rainfallSinceChemistryInches: 0.1,
    now: "2026-06-04T12:00:00.000Z"
  };
  const current = buildSwimmabilityView(swimmabilityInput);
  const view = buildPredictedSwimmabilityView({
    current,
    swimmabilityInput,
    coverExposure: {
      generated_at: "2026-06-04T12:00:00.000Z",
      summaries: [
        { window: "24h", covered_minutes: 960, uncovered_minutes: 480, covered_percent: 66.7, uncovered_percent: 33.3, daylight_uncovered_minutes: 180, last_cover_change_at: "2026-06-04T11:00:00.000Z", status: "available" },
        { window: "72h", covered_minutes: 2700, uncovered_minutes: 1620, covered_percent: 62.5, uncovered_percent: 37.5, daylight_uncovered_minutes: 420, last_cover_change_at: "2026-06-04T11:00:00.000Z", status: "available" },
        { window: "7d", covered_minutes: 6800, uncovered_minutes: 3280, covered_percent: 67.5, uncovered_percent: 32.5, daylight_uncovered_minutes: 820, last_cover_change_at: "2026-06-04T11:00:00.000Z", status: "partial" }
      ]
    },
    circulation: {
      generated_at: "2026-06-04T12:00:00.000Z",
      pump_id: null,
      summaries: [
        { window: "24h", runtime_minutes: 540, runtime_percent: 37.5, sample_coverage_percent: 90, last_running_at: "2026-06-04T11:50:00.000Z", status: "available" },
        { window: "72h", runtime_minutes: 1560, runtime_percent: 36.1, sample_coverage_percent: 88, last_running_at: "2026-06-04T11:50:00.000Z", status: "available" },
        { window: "7d", runtime_minutes: 3640, runtime_percent: 36.1, sample_coverage_percent: 78, last_running_at: "2026-06-04T11:50:00.000Z", status: "partial" }
      ]
    },
    chlorinator: {
      saltPpm: 3200,
      outputPercent: 40,
      targetOutputPercent: 40,
      runState: "unknown",
      status: "ok",
      productionLbPerDay: 1.4,
      updatedAt: "2026-06-04T11:59:00.000Z"
    },
    chemicalAdditions: [
      {
        id: "addition-1",
        pool_id: "pool-1",
        chemical_type: "liquid_chlorine",
        amount: 0.5,
        unit: "gal",
        notes: null,
        source: "manual",
        recorded_at: "2026-06-04T09:30:00.000Z",
        created_at: "2026-06-04T09:30:00.000Z"
      }
    ],
    now: "2026-06-04T12:00:00.000Z"
  });

  assert.equal(view.predictions.length, 4);
  assert.equal(view.predictions[0].horizon, "24h");
  assert.ok(view.predictions[0].predicted_inputs.length > 0);
  assert.ok(Array.isArray(view.predictions[0].confidence_blockers));
  assert.equal(view.predictions[0].provenance.prediction.source_type, "prediction_model");
  assert.equal(view.predictions[0].provenance.chlorinator.confidence_band, "high");
  assert.equal(view.predictions[0].confidence_blockers.includes("Configured chlorinator output is unavailable."), false);
  assert.ok(
    view.predictions[0].assumptions.some((value) => value.includes("SWG target output is set to 40% duty-cycle support."))
  );
});

test("swimmability API route returns the assessment", async () => {
  const server = new LocalHttpServer("127.0.0.1:8080", createHttpHandlers({
    async getSwimmability() {
      return {
        status: "caution",
        score: 68,
        summary: "Chemistry confidence is aging because UV is elevated.",
        headline: "Use Caution",
        confidence: "medium",
        last_chemistry_age_label: "3 days ago",
        highlights: [
          {
            tone: "caution",
            label: "Retest chemistry soon"
          }
        ],
        updated_at: "2026-06-04T19:20:00.000Z",
        drivers: [
          {
            key: "chemistry_recency",
            severity: "caution",
            message: "Chemistry confidence is aging because UV is elevated."
          }
        ],
        inputs: {
          chemistry_latest_at: "2026-06-04T18:45:00.000Z",
          cover_latest_at: "2026-06-04T17:30:00.000Z",
          forecast_fetched_at: "2026-06-04T19:00:00.000Z",
          telemetry_latest_at: "2026-06-04T19:18:00.000Z"
        },
        input_provenance: {
          chemistry: {
            value_kind: "measured",
            source_type: "manual_test",
            source_detail: "chemistry.manual_test",
            freshness_state: "aging",
            confidence_band: "medium",
            measured_at: "2026-06-04T18:45:00.000Z",
            evaluated_at: "2026-06-04T19:20:00.000Z",
            reasons: ["Chemistry reading is recent enough for use."]
          },
          cover: {
            value_kind: "observed",
            source_type: "manual_log",
            source_detail: "pool_cover.unknown",
            freshness_state: "fresh",
            confidence_band: "high",
            measured_at: "2026-06-04T17:30:00.000Z",
            evaluated_at: "2026-06-04T19:20:00.000Z",
            reasons: ["Latest cover state was recorded as off."]
          },
          weather_forecast: {
            value_kind: "predicted",
            source_type: "weather_provider",
            source_detail: "openmeteo",
            freshness_state: "fresh",
            confidence_band: "high",
            measured_at: "2026-06-04T19:00:00.000Z",
            evaluated_at: "2026-06-04T19:20:00.000Z",
            reasons: ["available"]
          },
          water_temperature: {
            value_kind: "measured",
            source_type: "controller",
            source_detail: "controller.pool_water",
            freshness_state: "fresh",
            confidence_band: "high",
            measured_at: "2026-06-04T19:18:00.000Z",
            evaluated_at: "2026-06-04T19:20:00.000Z",
            reasons: ["Pool-water telemetry is available."]
          },
          rainfall_since_chemistry: {
            value_kind: "derived",
            source_type: "derived_calculation",
            source_detail: "rainfall_since_chemistry",
            freshness_state: "fresh",
            confidence_band: "high",
            measured_at: "2026-06-04T19:00:00.000Z",
            evaluated_at: "2026-06-04T19:20:00.000Z",
            reasons: ["This value is derived from weather history relative to the last chemistry timestamp."]
          }
        }
      };
    }
  }));

  const response = await invokeRoute(server, "GET", "/swimmability");

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.data.status, "caution");
  assert.equal(response.body.data.score, 68);
  assert.equal(response.body.data.headline, "Use Caution");
  assert.equal(response.body.data.confidence, "medium");
  assert.equal(response.body.data.input_provenance.chemistry.value_kind, "measured");
  assert.equal(response.body.data.input_provenance.weather_forecast.source_type, "weather_provider");
});

test("predicted swimmability API route returns horizon projections", async () => {
  const server = new LocalHttpServer("127.0.0.1:8080", createHttpHandlers({
    async getPredictedSwimmability() {
      return {
        generated_at: "2026-06-04T19:20:00.000Z",
        current: {
          status: "good",
          score: 82,
          confidence: "high",
          headline: "Safe for Swimming",
          updated_at: "2026-06-04T19:20:00.000Z"
        },
        predictions: [
          {
            horizon: "24h",
            status: "good",
            score: 78,
            trend: "declining",
            confidence: "medium",
            headline: "Should Remain Swimmable by Tomorrow",
            summary: "High UV is forecast before Tomorrow.",
            drivers: ["High UV is forecast before Tomorrow."],
            assumptions: ["Recent chemistry is still usable for short-horizon projection."],
            confidence_blockers: [],
            predicted_inputs: [],
            provenance: {
              prediction: {
                value_kind: "predicted",
                source_type: "prediction_model",
                source_detail: "swimmability.predicted.v1",
                freshness_state: "fresh",
                confidence_band: "medium",
                measured_at: "2026-06-04T19:20:00.000Z",
                evaluated_at: "2026-06-04T19:20:00.000Z",
                reasons: ["Recent chemistry is still usable for short-horizon projection."]
              },
              chemistry: buildUnknownSwimmabilityView().input_provenance.chemistry,
              weather_forecast: buildUnknownSwimmabilityView().input_provenance.weather_forecast,
              cover_exposure: buildUnknownSwimmabilityView().input_provenance.cover,
              circulation: buildUnknownSwimmabilityView().input_provenance.rainfall_since_chemistry,
              chlorinator: buildUnknownSwimmabilityView().input_provenance.water_temperature,
              chemical_additions: buildUnknownSwimmabilityView().input_provenance.cover
            }
          }
        ]
      };
    }
  }));

  const response = await invokeRoute(server, "GET", "/swimmability/predicted");

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.data.predictions[0].horizon, "24h");
  assert.deepEqual(response.body.data.predictions[0].confidence_blockers, []);
  assert.equal(response.body.data.predictions[0].provenance.prediction.source_type, "prediction_model");
});

function createHttpHandlers(overrides: Partial<HttpHandlers>): HttpHandlers {
  const eventBroker = new EventBroker();
  const protocolFrameBroker = new EventBroker();

  return {
    getEquipment: () => [],
    getHealth: () => ({ status: "healthy", ready: true }),
    getControllerSchedules: () => ({}),
    getControllerClock: () => ({}),
    updateControllerClock: async () => ({ commandId: "command-0", clock: {} }),
    getControllerPumpConfigurations: () => ({ source: "controller_native", controller_type: "easytouch", status: "unavailable", message: "", last_checked: null, pumps: [] }),
    updateControllerPumpConfiguration: async () => ({ commandId: "command-0", pumpConfiguration: {} }),
    getControllerHeater: () => ({}),
    getTemperatureTelemetryLatest: async () => ({}),
    getTemperatureTelemetryHistory: async () => ({}),
    getPumpTelemetryLatest: async () => ({}),
    getPumpTelemetryHistory: async () => ({}),
    getWeatherForecast: async () => ({}),
    getWeatherHistory: async () => ({}),
    refreshWeatherForecast: async () => ({}),
    getWeatherLocationSettings: async () => ({}),
    upsertWeatherLocationSettings: async () => ({}),
    getPoolChemistrySettings: async () => ({ settings: [], source: "defaults" }),
    updatePoolChemistrySettings: async () => ({ settings: [], source: "defaults" }),
    getLatestChemistryReading: async () => null,
    getChemistryHistory: async () => ({ start: "", end: "", interval: "raw", readings: [], series: [] }),
    createChemistryReading: async () => ({
      reading: {
        id: "reading-1",
        pool_id: "pool-1",
        ph: 7.5,
        free_chlorine: 5,
        total_chlorine: 5.2,
        total_alkalinity: 90,
        calcium_hardness: 260,
        cyanuric_acid: 70,
        source: "manual",
        recorded_at: "2026-06-04T18:45:00.000Z",
        created_at: "2026-06-04T18:45:00.000Z"
      },
      warnings: []
    }),
    getChemistryObservations: async () => ({
      start: null,
      end: null,
      limit: 25,
      observations: []
    }),
    createChemistryObservation: async () => ({
      id: "observation-1",
      pool_id: "pool-1",
      clarity: "clear",
      algae_presence: null,
      debris_level: null,
      bather_load_estimate: null,
      notes: null,
      source: "manual",
      recorded_at: "2026-01-01T00:00:00.000Z",
      created_at: "2026-01-01T00:00:00.000Z"
    }),
    getMaintenanceActivities: async () => ({
      start: null,
      end: null,
      limit: 25,
      activities: []
    }),
    createMaintenanceActivity: async () => ({
      id: "activity-1",
      pool_id: "pool-1",
      activity_type: "brushed",
      notes: null,
      source: "manual",
      recorded_at: "2026-01-01T00:00:00.000Z",
      created_at: "2026-01-01T00:00:00.000Z"
    }),
    getChemicalAdditions: async () => ({
      start: null,
      end: null,
      limit: 25,
      additions: []
    }),
    createChemicalAddition: async () => ({
      id: "addition-1",
      pool_id: "pool-1",
      chemical_type: "liquid_chlorine",
      amount: 1,
      unit: "gal",
      notes: null,
      source: "manual",
      recorded_at: "2026-01-01T00:00:00.000Z",
      created_at: "2026-01-01T00:00:00.000Z"
    }),
    getCurrentPoolCover: async () => ({ current: null }),
    getPoolCoverHistory: async () => ({ start: null, end: null, limit: 5, events: [] }),
    getPoolCoverExposureSummary: async () => ({ generated_at: new Date().toISOString(), summaries: [] }),
    createPoolCoverEvent: async () => ({
      id: "cover-1",
      pool_id: "pool-1",
      state: "off",
      cover_type: "unknown",
      source: "manual",
      recorded_at: "2026-06-04T18:45:00.000Z",
      created_at: "2026-06-04T18:45:00.000Z"
    }),
    getSwimmability: async () => buildUnknownSwimmabilityView(),
    getPredictedSwimmability: async () => buildUnknownPredictedSwimmabilityView(),
    getMaintenanceRecommendations: async () => ({
      generated_at: "2026-01-01T00:00:00.000Z",
      current: {
        swimmability: {
          status: "unknown",
          score: 0,
          confidence: "unknown",
          headline: "No data",
          updated_at: "2026-01-01T00:00:00.000Z"
        },
        predicted: null
      },
      recommendations: []
    }),
    getNotifications: async () => ({ status: "unread", limit: 50, notifications: [] }),
    markNotificationRead: async () => null,
    markAllNotificationsRead: async () => ({ updated_count: 0 }),
    getPlatformStatus: async () => ({}),
    getMetrics: () => "",
    getEventBroker: () => eventBroker,
    getProtocolFrameBroker: () => protocolFrameBroker,
    listProtocolFrameBundles: () => [],
    createProtocolFrameBundle: () => ({ id: "bundle-1", label: "label", frame_count: 0, created_at: new Date().toISOString() }),
    getProtocolFrameBundle: () => null,
    startProtocolWatchSession: () => ({ id: "watch-1", label: "watch", status: "active", events: null, frame_count: 0, created_at: new Date().toISOString(), stopped_at: null }),
    getProtocolWatchSession: () => null,
    stopProtocolWatchSession: () => null,
    compareProtocolFrameBundles: () => null,
    listProtocolAnnotations: () => [],
    createProtocolAnnotation: () => ({ id: "annotation-1" } as never),
    listProtocolPrompts: () => [],
    createProtocolPrompt: () => ({ id: "prompt-1" } as never),
    publishRemoteLayoutRequest: async () => ({ commandId: "command-1" }),
    publishPumpInfoRequest: async () => ({ commandId: "command-1" }),
    publishControllerScheduleRequest: async () => ({ commandId: "command-1" }),
    updateControllerSchedule: async () => ({ commandId: "command-0", schedule: {} }),
    updateControllerHeaterConfiguration: async () => ({ commandId: "command-0", heater: {} }),
    updateControllerHeaterSettings: async () => ({ commandId: "command-0", heater: {} }),
    publishCircuitConfigRequest: async () => ({ commandId: "command-1" }),
    publishCustomNameRequest: async () => ({ commandId: "command-1" }),
    publishControllerSoftwareVersionRequest: async () => ({ commandId: "command-1" }),
    publishControllerDatetimeRequest: async () => ({ commandId: "command-1" }),
    publishControllerDatetimeSync: async () => ({ commandId: "command-1" }),
    publishPumpConfigWrite: async () => ({ commandId: "command-1" }),
    publishRawFrameCommand: async () => ({ commandId: "command-1" }),
    publishPumpSpeedCommand: async () => ({ commandId: "command-1" }),
    publishCircuitStateCommand: async () => ({ commandId: "command-1" }),
    ...overrides
  };
}

async function invokeRoute(
  server: LocalHttpServer,
  method: string,
  url: string
): Promise<{ statusCode: number; body: Record<string, any> }> {
  let statusCode = 0;
  let responseBody = "";
  const req = { method, url, headers: {}, on() {} } as never;
  const res: {
    writableEnded: boolean;
    setHeader: (name: string, value: string) => void;
    writeHead: (code: number) => unknown;
    end: (payload: string) => void;
  } = {
    writableEnded: false,
    setHeader() {},
    writeHead(code: number) {
      statusCode = code;
      return this;
    },
    end(payload: string) {
      responseBody = payload;
      this.writableEnded = true;
    }
  };

  await (server as any).route(req, res as never);

  return {
    statusCode,
    body: responseBody ? JSON.parse(responseBody) : {}
  };
}
