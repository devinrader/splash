import test from "node:test";
import assert from "node:assert/strict";
import { EventBroker } from "../src/events.js";
import { LocalHttpServer, type HttpHandlers } from "../src/http.js";
import {
  buildMaintenanceRecommendationsView,
  type MaintenanceRecommendationsView
} from "../src/maintenance-recommendations.js";
import { buildUnknownPredictedSwimmabilityView, buildUnknownSwimmabilityView } from "./swimmability-fixtures.js";

test("buildMaintenanceRecommendationsView prioritizes retest when chemistry trust is weak", () => {
  const view = buildMaintenanceRecommendationsView({
    swimmability: buildUnknownSwimmabilityView(),
    predicted: buildUnknownPredictedSwimmabilityView(),
    freshness: {
      generatedAt: "2026-06-12T22:00:00.000Z",
      items: [
        {
          chemicalKey: "free_chlorine",
          displayName: "Free Chlorine",
          enabled: true,
          expectedIntervalValue: 1,
          expectedIntervalUnit: "days",
          staleThresholdUnit: "days",
          staleThresholdValue: 1,
          unavailableThresholdValue: 2,
          unavailableThresholdUnit: "days",
          status: "unavailable",
          lastObservedAt: null
        },
        {
          chemicalKey: "ph",
          displayName: "pH",
          enabled: true,
          expectedIntervalValue: 1,
          expectedIntervalUnit: "days",
          staleThresholdUnit: "days",
          staleThresholdValue: 1,
          unavailableThresholdValue: 2,
          unavailableThresholdUnit: "days",
          status: "unavailable",
          lastObservedAt: null
        }
      ]
    },
    observations: [],
    maintenanceActivities: [],
    chemicalAdditions: [],
    circulation: {
      generated_at: "2026-06-12T22:00:00.000Z",
      pump_id: null,
      summaries: []
    },
    coverExposure: {
      generated_at: "2026-06-12T22:00:00.000Z",
      summaries: []
    },
    pump: {
      rpm: null,
      running: null,
      flowGpm: null,
      filterPressurePsi: null,
      filterCondition: null,
      updatedAt: null
    },
    chlorinator: {
      saltPpm: null,
      outputPercent: null,
      runState: null,
      status: null,
      updatedAt: null
    },
    query: {
      limit: null,
      category: null,
      priority: null
    },
    now: "2026-06-12T22:00:00.000Z"
  });

  assert.equal(view.recommendations[0]?.category, "retest");
  assert.equal(view.recommendations[0]?.priority, "now");
  assert.ok(view.recommendations[0]?.why.some((reason) => reason.includes("unknown")));
});

test("buildMaintenanceRecommendationsView suggests chlorine adjustment when sanitizer support is poor", () => {
  const view = buildMaintenanceRecommendationsView({
    swimmability: {
      status: "poor",
      score: 28,
      summary: "Free chlorine is below the minimum target.",
      headline: "Avoid Swimming",
      confidence: "high",
      last_chemistry_age_label: "2h",
      highlights: [],
      updated_at: "2026-06-12T22:00:00.000Z",
      drivers: [
        {
          key: "free_chlorine",
          severity: "poor",
          message: "Free chlorine is below the configured minimum."
        }
      ],
      inputs: {
        chemistry_latest_at: "2026-06-12T20:00:00.000Z",
        cover_latest_at: null,
        forecast_fetched_at: "2026-06-12T21:00:00.000Z",
        telemetry_latest_at: "2026-06-12T21:00:00.000Z"
      },
      input_provenance: {
        chemistry: {
          value_kind: "measured",
          source_type: "manual_test",
          source_detail: "manual",
          freshness_state: "fresh",
          confidence_band: "high",
          measured_at: "2026-06-12T20:00:00.000Z",
          evaluated_at: "2026-06-12T22:00:00.000Z",
          reasons: ["Chemistry is recent."]
        },
        cover: {
          value_kind: "observed",
          source_type: "manual_log",
          source_detail: "manual",
          freshness_state: "missing",
          confidence_band: "unknown",
          measured_at: null,
          evaluated_at: "2026-06-12T22:00:00.000Z",
          reasons: []
        },
        weather_forecast: {
          value_kind: "predicted",
          source_type: "weather_provider",
          source_detail: "openmeteo",
          freshness_state: "fresh",
          confidence_band: "high",
          measured_at: "2026-06-12T21:00:00.000Z",
          evaluated_at: "2026-06-12T22:00:00.000Z",
          reasons: []
        },
        water_temperature: {
          value_kind: "measured",
          source_type: "controller",
          source_detail: "temperature",
          freshness_state: "fresh",
          confidence_band: "high",
          measured_at: "2026-06-12T21:00:00.000Z",
          evaluated_at: "2026-06-12T22:00:00.000Z",
          reasons: []
        },
        rainfall_since_chemistry: {
          value_kind: "derived",
          source_type: "derived_calculation",
          source_detail: "weather.rainfall_since_chemistry",
          freshness_state: "fresh",
          confidence_band: "medium",
          measured_at: "2026-06-12T21:00:00.000Z",
          evaluated_at: "2026-06-12T22:00:00.000Z",
          reasons: []
        }
      }
    },
    predicted: {
      generated_at: "2026-06-12T22:00:00.000Z",
      current: {
        status: "poor",
        score: 28,
        confidence: "high",
        headline: "Avoid Swimming",
        updated_at: "2026-06-12T22:00:00.000Z"
      },
      predictions: [
        {
          horizon: "24h",
          status: "poor",
          score: 22,
          trend: "declining",
          confidence: "medium",
          headline: "Risk increasing",
          summary: "Forecast UV keeps pressure on chlorine.",
          drivers: ["High UV is forecast."],
          assumptions: [],
          predicted_inputs: [],
          provenance: {
            prediction: {
              value_kind: "predicted",
              source_type: "prediction_model",
              source_detail: "predicted_swimmability.v1",
              freshness_state: "fresh",
              confidence_band: "medium",
              measured_at: "2026-06-12T22:00:00.000Z",
              evaluated_at: "2026-06-12T22:00:00.000Z",
              reasons: []
            },
            chemistry: {
              value_kind: "measured",
              source_type: "manual_test",
              source_detail: "manual",
              freshness_state: "fresh",
              confidence_band: "high",
              measured_at: "2026-06-12T20:00:00.000Z",
              evaluated_at: "2026-06-12T22:00:00.000Z",
              reasons: []
            },
            weather_forecast: {
              value_kind: "predicted",
              source_type: "weather_provider",
              source_detail: "openmeteo",
              freshness_state: "fresh",
              confidence_band: "high",
              measured_at: "2026-06-12T21:00:00.000Z",
              evaluated_at: "2026-06-12T22:00:00.000Z",
              reasons: []
            },
            cover_exposure: {
              value_kind: "derived",
              source_type: "derived_calculation",
              source_detail: "pool_cover.exposure_summary",
              freshness_state: "fresh",
              confidence_band: "medium",
              measured_at: "2026-06-12T22:00:00.000Z",
              evaluated_at: "2026-06-12T22:00:00.000Z",
              reasons: []
            },
            circulation: {
              value_kind: "derived",
              source_type: "derived_calculation",
              source_detail: "pump.circulation_summary",
              freshness_state: "fresh",
              confidence_band: "medium",
              measured_at: "2026-06-12T22:00:00.000Z",
              evaluated_at: "2026-06-12T22:00:00.000Z",
              reasons: []
            },
            chlorinator: {
              value_kind: "measured",
              source_type: "controller",
              source_detail: "chlorinator.latest_state",
              freshness_state: "fresh",
              confidence_band: "medium",
              measured_at: "2026-06-12T22:00:00.000Z",
              evaluated_at: "2026-06-12T22:00:00.000Z",
              reasons: []
            },
            chemical_additions: {
              value_kind: "observed",
              source_type: "manual_log",
              source_detail: "chemistry.additions",
              freshness_state: "fresh",
              confidence_band: "medium",
              measured_at: "2026-06-12T22:00:00.000Z",
              evaluated_at: "2026-06-12T22:00:00.000Z",
              reasons: []
            }
          }
        }
      ]
    },
    freshness: {
      generatedAt: "2026-06-12T22:00:00.000Z",
      items: [
        {
          chemicalKey: "free_chlorine",
          displayName: "Free Chlorine",
          enabled: true,
          expectedIntervalValue: 1,
          expectedIntervalUnit: "days",
          staleThresholdUnit: "days",
          staleThresholdValue: 1,
          unavailableThresholdValue: 2,
          unavailableThresholdUnit: "days",
          status: "current",
          lastObservedAt: "2026-06-12T20:00:00.000Z"
        },
        {
          chemicalKey: "ph",
          displayName: "pH",
          enabled: true,
          expectedIntervalValue: 1,
          expectedIntervalUnit: "days",
          staleThresholdUnit: "days",
          staleThresholdValue: 1,
          unavailableThresholdValue: 2,
          unavailableThresholdUnit: "days",
          status: "current",
          lastObservedAt: "2026-06-12T20:00:00.000Z"
        }
      ]
    },
    observations: [],
    maintenanceActivities: [],
    chemicalAdditions: [],
    circulation: {
      generated_at: "2026-06-12T22:00:00.000Z",
      pump_id: null,
      summaries: []
    },
    coverExposure: {
      generated_at: "2026-06-12T22:00:00.000Z",
      summaries: []
    },
    pump: {
      rpm: 2200,
      running: true,
      flowGpm: 40,
      filterPressurePsi: 16,
      filterCondition: "clean",
      updatedAt: "2026-06-12T22:00:00.000Z"
    },
    chlorinator: {
      saltPpm: 3200,
      outputPercent: 30,
      runState: "producing",
      status: "ok",
      updatedAt: "2026-06-12T22:00:00.000Z"
    },
    query: {
      limit: null,
      category: null,
      priority: null
    },
    now: "2026-06-12T22:00:00.000Z"
  });

  assert.ok(view.recommendations.some((item) => item.title === "Add chlorine"));
});

test("maintenance recommendations API route returns recommendation payload", async () => {
  const server = new LocalHttpServer("127.0.0.1:8080", createHttpHandlers({
    async getMaintenanceRecommendations() {
      return {
        generated_at: "2026-06-12T22:00:00.000Z",
        current: {
          swimmability: {
            status: "good",
            score: 90,
            confidence: "high",
            headline: "Swim Ready",
            updated_at: "2026-06-12T22:00:00.000Z"
          },
          predicted: null
        },
        recommendations: [
          {
            id: "recommendation-1",
            category: "wait",
            priority: "monitor",
            title: "Wait and monitor",
            summary: "No immediate action is required.",
            recommended_action: "Monitor routine conditions.",
            why: ["Current conditions are stable."],
            confidence: "medium",
            blocking_factors: [],
            supporting_inputs: [],
            related_alert_types: []
          }
        ]
      } satisfies MaintenanceRecommendationsView;
    }
  }));

  const response = await invokeRoute(server, "GET", "/maintenance/recommendations");

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.error, null);
  assert.equal(response.body.data.recommendations[0].title, "Wait and monitor");
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
    createChemistryReading: async () => ({ reading: null as never, warnings: [] }),
    getChemistryObservations: async () => ({ start: null, end: null, limit: 10, observations: [] }),
    createChemistryObservation: async () => ({ id: "observation-1" } as never),
    getMaintenanceActivities: async () => ({ start: null, end: null, limit: 10, activities: [] }),
    createMaintenanceActivity: async () => ({ id: "activity-1" } as never),
    getChemicalAdditions: async () => ({ start: null, end: null, limit: 10, additions: [] }),
    createChemicalAddition: async () => ({ id: "addition-1" } as never),
    getCurrentPoolCover: async () => ({ current: null }),
    getPoolCoverHistory: async () => ({ start: null, end: null, limit: 10, events: [] }),
    getPoolCoverExposureSummary: async () => ({ generated_at: new Date().toISOString(), summaries: [] }),
    createPoolCoverEvent: async () => ({ id: "cover-1" } as never),
    getSwimmability: async () => buildUnknownSwimmabilityView(),
    getPredictedSwimmability: async () => buildUnknownPredictedSwimmabilityView(),
    getMaintenanceRecommendations: async () => ({
      generated_at: "2026-06-12T22:00:00.000Z",
      current: {
        swimmability: {
          status: "unknown",
          score: 0,
          confidence: "unknown",
          headline: "No data",
          updated_at: "2026-06-12T22:00:00.000Z"
        },
        predicted: null
      },
      recommendations: []
    }),
    getNotifications: async () => ({ status: "unread", limit: 10, notifications: [] }),
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
  const res = {
    setHeader() {},
    writeHead(code: number) {
      statusCode = code;
    },
    end(chunk: string) {
      responseBody = chunk;
    }
  } as never;

  await (server as any).route(req, res);

  return {
    statusCode,
    body: JSON.parse(responseBody) as Record<string, any>
  };
}
