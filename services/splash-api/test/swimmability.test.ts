import test from "node:test";
import assert from "node:assert/strict";
import { EventBroker } from "../src/events.js";
import { buildUnknownSwimmabilityView } from "./swimmability-fixtures.js";
import { LocalHttpServer, type HttpHandlers } from "../src/http.js";
import { buildSwimmabilityView } from "../src/swimmability.js";

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
    chemistryBounds: {
      freeChlorine: { min: 3, target: 5, max: 10, unit: "ppm" },
      ph: { min: 7.2, target: 7.6, max: 7.8, unit: null }
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
    chemistryBounds: {
      freeChlorine: { min: 3, target: 5, max: 10, unit: "ppm" },
      ph: { min: 7.2, target: 7.6, max: 7.8, unit: null }
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

test("swimmability API route returns the assessment", async () => {
  const server = new LocalHttpServer("127.0.0.1:8080", createHttpHandlers({
    async getSwimmability() {
      return {
        status: "caution",
        score: 68,
        summary: "Chemistry confidence is aging because the pool is uncovered and UV is elevated.",
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
            message: "Chemistry confidence is aging because the pool is uncovered and UV is elevated."
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
