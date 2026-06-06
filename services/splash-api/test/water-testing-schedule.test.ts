import test from "node:test";
import assert from "node:assert/strict";
import { EventBroker } from "../src/events.js";
import { LocalHttpServer, type HttpHandlers } from "../src/http.js";
import {
  SqliteWaterTestingScheduleRepository,
  WaterTestingScheduleService,
  WaterTestingScheduleUnavailableError,
  WaterTestingScheduleValidationError,
  evaluateWaterTestingFreshness,
  validateWaterTestingScheduleUpdateInput
} from "../src/water-testing-schedule.js";

test("validateWaterTestingScheduleUpdateInput accepts supported schedule updates", () => {
  const result = validateWaterTestingScheduleUpdateInput({
    items: [
      {
        chemicalKey: "free_chlorine",
        enabled: true,
        expectedIntervalValue: 3,
        expectedIntervalUnit: "days",
        staleThresholdValue: 3,
        staleThresholdUnit: "days",
        unavailableThresholdValue: 7,
        unavailableThresholdUnit: "days"
      }
    ]
  });

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]?.chemicalKey, "free_chlorine");
  assert.equal(result.items[0]?.staleThresholdValue, 3);
});

test("validateWaterTestingScheduleUpdateInput rejects invalid units", () => {
  assert.throws(
    () =>
      validateWaterTestingScheduleUpdateInput({
        items: [
          {
            chemicalKey: "free_chlorine",
            expectedIntervalValue: 3,
            expectedIntervalUnit: "weeks"
          }
        ]
      }),
    (error: unknown) => {
      assert.ok(error instanceof WaterTestingScheduleValidationError);
      return true;
    }
  );
});

test("repository maps saved water testing schedule rows", async () => {
  const repository = new SqliteWaterTestingScheduleRepository({
    get() {
      return {
        pool_id: "pool-1",
        water_testing_schedule: {
          free_chlorine: {
            chemicalKey: "free_chlorine",
            displayName: "Free Chlorine",
            enabled: true,
            expectedIntervalValue: 4,
            expectedIntervalUnit: "days",
            staleThresholdValue: 4,
            staleThresholdUnit: "days",
            unavailableThresholdValue: 8,
            unavailableThresholdUnit: "days",
            updatedAt: "2026-06-05T12:00:00.000Z"
          }
        }
      };
    },
    all() {
      return [];
    },
    run() {},
    exec() {},
    transaction<T>(callback: () => T) {
      return callback();
    },
    close() {}
  } as never);

  const result = await repository.get("pool-1");
  assert.ok(result);
  assert.equal(result?.items.free_chlorine.expectedIntervalValue, 4);
  assert.equal(result?.items.water_temperature.expectedIntervalUnit, "hours");
});

test("service returns defaults when repository rows are missing", async () => {
  const service = new WaterTestingScheduleService("pool-1", {
    async get() {
      return null;
    },
    async upsert(schedule) {
      return schedule;
    }
  });

  const result = await service.getSchedule();
  assert.equal(result.source, "defaults");
  assert.equal(result.items[0]?.chemicalKey, "free_chlorine");
});

test("service throws unavailable when updating without SQLite", async () => {
  const service = new WaterTestingScheduleService("pool-1", null);

  await assert.rejects(
    () =>
      service.updateSchedule({
        items: [
          {
            chemicalKey: "free_chlorine",
            expectedIntervalValue: 4,
            expectedIntervalUnit: "days"
          }
        ]
      }),
    (error: unknown) => {
      assert.ok(error instanceof WaterTestingScheduleUnavailableError);
      return true;
    }
  );
});

test("evaluateWaterTestingFreshness derives current, stale, and unavailable states", () => {
  const freshness = evaluateWaterTestingFreshness(
    [
      {
        chemicalKey: "free_chlorine",
        displayName: "Free Chlorine",
        enabled: true,
        expectedIntervalValue: 3,
        expectedIntervalUnit: "days",
        staleThresholdValue: 3,
        staleThresholdUnit: "days",
        unavailableThresholdValue: 7,
        unavailableThresholdUnit: "days",
        updatedAt: null
      },
      {
        chemicalKey: "combined_chlorine",
        displayName: "Combined Chlorine",
        enabled: true,
        expectedIntervalValue: 7,
        expectedIntervalUnit: "days",
        staleThresholdValue: 7,
        staleThresholdUnit: "days",
        unavailableThresholdValue: 14,
        unavailableThresholdUnit: "days",
        updatedAt: null
      },
      {
        chemicalKey: "water_temperature",
        displayName: "Water Temperature",
        enabled: true,
        expectedIntervalValue: 1,
        expectedIntervalUnit: "hours",
        staleThresholdValue: 1,
        staleThresholdUnit: "hours",
        unavailableThresholdValue: 1,
        unavailableThresholdUnit: "hours",
        updatedAt: null
      }
    ],
    {
      chemistryReadings: [
        {
          id: "reading-1",
          pool_id: "pool-1",
          ph: 7.5,
          free_chlorine: 5.1,
          total_chlorine: 5.5,
          total_alkalinity: 90,
          calcium_hardness: 260,
          cyanuric_acid: 70,
          source: "manual",
          recorded_at: "2026-06-01T12:00:00.000Z",
          created_at: "2026-06-01T12:00:00.000Z"
        }
      ],
      latestTemperatures: {
        controller_id: "default",
        status: "empty",
        message: "none",
        last_updated: null,
        readings: {}
      },
      saltTelemetry: null,
      now: "2026-06-05T12:00:00.000Z"
    }
  );

  assert.equal(freshness.items.find((item) => item.chemicalKey === "free_chlorine")?.status, "stale");
  assert.equal(freshness.items.find((item) => item.chemicalKey === "combined_chlorine")?.status, "current");
  assert.equal(freshness.items.find((item) => item.chemicalKey === "water_temperature")?.status, "unavailable");
});

test("water testing schedule API routes return settings and reset data", async () => {
  const server = new LocalHttpServer("127.0.0.1:8080", createHttpHandlers({
    async getWaterTestingSchedule() {
      return {
        items: [
          {
            chemicalKey: "free_chlorine",
            displayName: "Free Chlorine",
            enabled: true,
            expectedIntervalValue: 3,
            expectedIntervalUnit: "days",
            staleThresholdValue: 3,
            staleThresholdUnit: "days",
            unavailableThresholdValue: 7,
            unavailableThresholdUnit: "days",
            status: "stale",
            lastObservedAt: "2026-05-28T18:45:00.000Z",
            updatedAt: "2026-06-05T12:00:00.000Z"
          }
        ],
        source: "sqlite"
      };
    },
    async updateWaterTestingSchedule(input) {
      const items = (input.items as Array<Record<string, unknown>> | undefined) ?? [];
      assert.equal(items[0]?.chemicalKey, "free_chlorine");
      return {
        items: [],
        source: "sqlite"
      };
    },
    async resetWaterTestingSchedule() {
      return {
        items: [],
        source: "sqlite"
      };
    }
  }));

  const listResponse = await invokeRoute(server, "GET", "/api/settings/water-testing-schedule");
  assert.equal(listResponse.statusCode, 200);
  assert.equal((listResponse.body.data as { items: Array<{ chemicalKey: string }> }).items[0]?.chemicalKey, "free_chlorine");

  const saveResponse = await invokeRoute(server, "PUT", "/api/settings/water-testing-schedule", {
    items: [{ chemicalKey: "free_chlorine", expectedIntervalValue: 4, expectedIntervalUnit: "days" }]
  });
  assert.equal(saveResponse.statusCode, 200);

  const resetResponse = await invokeRoute(server, "POST", "/api/settings/water-testing-schedule/reset", {});
  assert.equal(resetResponse.statusCode, 200);
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
    getGeocodingSettings: async () => ({}),
    updateGeocodingSettings: async () => ({}),
    getPoolChemistrySettings: async () => ({ settings: [], source: "defaults" }),
    updatePoolChemistrySettings: async () => ({ settings: [], source: "defaults" }),
    getWaterTestingSchedule: async () => ({ items: [], source: "defaults" }),
    updateWaterTestingSchedule: async () => ({ items: [], source: "defaults" }),
    updateWaterTestingScheduleItem: async () => ({ items: [], source: "defaults" }),
    resetWaterTestingSchedule: async () => ({ items: [], source: "defaults" }),
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
    getCurrentPoolCover: async () => ({ current: null }),
    getPoolCoverHistory: async () => ({ start: null, end: null, limit: 5, events: [] }),
    createPoolCoverEvent: async () => ({
      id: "cover-1",
      pool_id: "pool-1",
      state: "off",
      cover_type: "unknown",
      source: "manual",
      recorded_at: "2026-06-04T18:45:00.000Z",
      created_at: "2026-06-04T18:45:00.000Z"
    }),
    getSwimmability: async () => ({
      status: "unknown",
      score: 0,
      summary: "Unavailable",
      headline: "Assessment Unavailable",
      confidence: "unknown",
      last_chemistry_age_label: null,
      highlights: [],
      updated_at: "2026-06-04T18:45:00.000Z",
      drivers: [],
      inputs: {
        chemistry_latest_at: null,
        cover_latest_at: null,
        forecast_fetched_at: null,
        telemetry_latest_at: null
      }
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
    createProtocolAnnotation: () => ({
      id: "annotation-1"
    } as never),
    listProtocolPrompts: () => [],
    createProtocolPrompt: () => ({
      id: "prompt-1"
    } as never),
    publishRemoteLayoutRequest: async () => ({ commandId: "command-1" }),
    publishPumpInfoRequest: async () => ({ commandId: "command-1" }),
    publishControllerScheduleRequest: async () => ({ commandId: "command-1" }),
    updateControllerSchedule: async () => ({ commandId: "command-1", schedule: {} }),
    updateControllerHeaterConfiguration: async () => ({ commandId: "command-1", heater: {} }),
    updateControllerHeaterSettings: async () => ({ commandId: "command-1", heater: {} }),
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
  url: string,
  body?: unknown
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const chunks: Buffer[] = [];
  const request = {
    method,
    url,
    headers: body ? { "content-type": "application/json" } : {},
    [Symbol.asyncIterator]: async function* () {
      if (body !== undefined) {
        yield Buffer.from(JSON.stringify(body));
      }
    }
  };

  const response = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
    writeHead(statusCode: number, headers: Record<string, string>) {
      this.statusCode = statusCode;
      Object.assign(this.headers, headers);
      return this;
    },
    end(chunk?: string | Buffer) {
      if (chunk) {
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
      }
      return this;
    }
  };

  await (server as any).route(request, response);

  return {
    statusCode: response.statusCode,
    body: JSON.parse(Buffer.concat(chunks).toString("utf8"))
  };
}
