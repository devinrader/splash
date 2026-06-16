import test from "node:test";
import assert from "node:assert/strict";
import { EventBroker } from "../src/events.js";
import { buildUnknownSwimmabilityView } from "./swimmability-fixtures.js";
import { LocalHttpServer, type HttpHandlers } from "../src/http.js";
import {
  PoolCoverEventsService,
  PoolCoverEventsUnavailableError,
  PoolCoverEventsValidationError,
  SqlitePoolCoverEventsRepository
} from "../src/pool-cover-events.js";

test("repository maps latest pool cover event rows", async () => {
  const repository = new SqlitePoolCoverEventsRepository({
    get() {
      return {
        id: "cover-1",
        pool_id: "pool-1",
        state: "on",
        cover_type: "solar",
        source: "manual",
        recorded_at: "2026-06-04T19:30:00.000Z",
        created_at: "2026-06-04T19:30:03.000Z"
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

  const result = await repository.getLatest("pool-1");

  assert.ok(result);
  assert.equal(result?.cover_type, "solar");
});

test("service requires cover type when recording cover on", async () => {
  const service = new PoolCoverEventsService("pool-1", {
    async getLatest() {
      return null;
    },
    async getLatestBefore() {
      return null;
    },
    async getEarliestAfter() {
      return null;
    },
    async create() {
      throw new Error("should not be called");
    },
    async list() {
      return [];
    },
    async listRange() {
      return [];
    }
  });

  await assert.rejects(
    () => service.createPoolCoverEvent({ state: "on" }),
    (error: unknown) => {
      assert.ok(error instanceof PoolCoverEventsValidationError);
      assert.equal(error.details.cover_type, "Cover type is required when recording Cover On.");
      return true;
    }
  );
});

test("service throws unavailable when pool cover repository is missing", async () => {
  const service = new PoolCoverEventsService("pool-1", null);

  await assert.rejects(
    () => service.getCurrentPoolCover(),
    (error: unknown) => {
      assert.ok(error instanceof PoolCoverEventsUnavailableError);
      return true;
    }
  );
});

test("service derives cover exposure summaries from cover history", async () => {
  const service = new PoolCoverEventsService(
    "pool-1",
    {
      async getLatest() {
        return null;
      },
      async getLatestBefore() {
        return {
          id: "cover-seed",
          pool_id: "pool-1",
          state: "on",
          cover_type: "solar",
          source: "manual",
          recorded_at: "2026-06-04T00:00:00.000Z",
          created_at: "2026-06-04T00:00:01.000Z"
        };
      },
      async getEarliestAfter() {
        return null;
      },
      async create() {
        throw new Error("should not be called");
      },
      async list() {
        return [];
      },
      async listRange() {
        return [
          {
            id: "cover-1",
            pool_id: "pool-1",
            state: "off",
            cover_type: "unknown",
            source: "manual",
            recorded_at: "2026-06-04T12:00:00.000Z",
            created_at: "2026-06-04T12:00:01.000Z"
          },
          {
            id: "cover-2",
            pool_id: "pool-1",
            state: "on",
            cover_type: "solar",
            source: "manual",
            recorded_at: "2026-06-05T00:00:00.000Z",
            created_at: "2026-06-05T00:00:01.000Z"
          }
        ];
      }
    },
    "America/New_York"
  );

  const summary = await service.getPoolCoverExposureSummary({
    window: "24h",
    now: "2026-06-05T12:00:00.000Z"
  });

  assert.equal(summary.summaries.length, 1);
  assert.equal(summary.summaries[0]?.window, "24h");
  assert.equal(summary.summaries[0]?.status, "available");
  assert.equal(summary.summaries[0]?.covered_minutes, 720);
  assert.equal(summary.summaries[0]?.uncovered_minutes, 720);
  assert.equal(summary.summaries[0]?.daylight_uncovered_minutes, 600);
});

test("service carries forward the latest known cover state into a narrower exposure window", async () => {
  const service = new PoolCoverEventsService(
    "pool-1",
    {
      async getLatest() {
        return null;
      },
      async getLatestBefore() {
        return {
          id: "cover-seed",
          pool_id: "pool-1",
          state: "on",
          cover_type: "solar",
          source: "manual",
          recorded_at: "2026-06-12T18:12:21.000Z",
          created_at: "2026-06-12T18:12:22.000Z"
        };
      },
      async getEarliestAfter() {
        return null;
      },
      async create() {
        throw new Error("should not be called");
      },
      async list() {
        return [];
      },
      async listRange() {
        return [
          {
            id: "cover-seed",
            pool_id: "pool-1",
            state: "on",
            cover_type: "solar",
            source: "manual",
            recorded_at: "2026-06-12T18:12:21.000Z",
            created_at: "2026-06-12T18:12:22.000Z"
          }
        ];
      }
    },
    "America/New_York"
  );

  const summary = await service.getPoolCoverExposureSummary({
    window: "24h",
    now: "2026-06-15T18:13:00.000Z"
  });

  assert.equal(summary.summaries.length, 1);
  assert.equal(summary.summaries[0]?.window, "24h");
  assert.equal(summary.summaries[0]?.status, "available");
  assert.equal(summary.summaries[0]?.covered_minutes, 1440);
  assert.equal(summary.summaries[0]?.uncovered_minutes, 0);
  assert.equal(summary.summaries[0]?.daylight_uncovered_minutes, 0);
  assert.equal(summary.summaries[0]?.last_cover_change_at, "2026-06-12T18:12:21.000Z");
});

test("service accepts retroactive cover events with explicit recorded_at", async () => {
  let createdRecordedAt: string | null = null;
  const service = new PoolCoverEventsService("pool-1", {
    async getLatest() {
      return null;
    },
    async getLatestBefore() {
      return {
        id: "cover-1",
        pool_id: "pool-1",
        state: "off",
        cover_type: "unknown",
        source: "manual",
        recorded_at: "2026-06-04T17:00:00.000Z",
        created_at: "2026-06-04T17:00:01.000Z"
      };
    },
    async getEarliestAfter() {
      return {
        id: "cover-3",
        pool_id: "pool-1",
        state: "off",
        cover_type: "unknown",
        source: "manual",
        recorded_at: "2026-06-04T20:00:00.000Z",
        created_at: "2026-06-04T20:00:01.000Z"
      };
    },
    async create(record) {
      createdRecordedAt = record.recordedAt;
      return {
        id: "cover-2",
        pool_id: "pool-1",
        state: record.state,
        cover_type: record.coverType,
        source: record.source,
        recorded_at: record.recordedAt,
        created_at: "2026-06-12T18:00:00.000Z"
      };
    },
    async list() {
      return [];
    },
    async listRange() {
      return [];
    }
  });

  const result = await service.createPoolCoverEvent({
    state: "on",
    cover_type: "solar",
    recorded_at: "2026-06-04T18:30:00.000Z"
  });

  assert.equal(result.recorded_at, "2026-06-04T18:30:00.000Z");
  assert.equal(createdRecordedAt, "2026-06-04T18:30:00.000Z");
});

test("service rejects ambiguous retroactive cover events", async () => {
  const service = new PoolCoverEventsService("pool-1", {
    async getLatest() {
      return null;
    },
    async getLatestBefore() {
      return {
        id: "cover-1",
        pool_id: "pool-1",
        state: "off",
        cover_type: "unknown",
        source: "manual",
        recorded_at: "2026-06-04T17:00:00.000Z",
        created_at: "2026-06-04T17:00:01.000Z"
      };
    },
    async getEarliestAfter() {
      return {
        id: "cover-3",
        pool_id: "pool-1",
        state: "off",
        cover_type: "unknown",
        source: "manual",
        recorded_at: "2026-06-04T20:00:00.000Z",
        created_at: "2026-06-04T20:00:01.000Z"
      };
    },
    async create() {
      throw new Error("should not be called");
    },
    async list() {
      return [];
    },
    async listRange() {
      return [];
    }
  });

  await assert.rejects(
    () =>
      service.createPoolCoverEvent({
        state: "off",
        recorded_at: "2026-06-04T18:30:00.000Z"
      }),
    (error: unknown) => {
      assert.ok(error instanceof PoolCoverEventsValidationError);
      assert.equal(
        error.details.recorded_at,
        "Backfilled cover events must represent a state change from the prior event."
      );
      return true;
    }
  );
});

test("pool cover API current, history, and create routes work", async () => {
  const server = new LocalHttpServer("127.0.0.1:8080", createHttpHandlers({
    async getCurrentPoolCover() {
      return {
        current: {
          id: "cover-1",
          pool_id: "pool-1",
          state: "on",
          cover_type: "solar",
          source: "manual",
          recorded_at: "2026-06-04T19:30:00.000Z",
          created_at: "2026-06-04T19:30:03.000Z"
        }
      };
    },
    async getPoolCoverHistory(input) {
      assert.equal(input.limit, "5");
      return {
        start: null,
        end: null,
        limit: 5,
        events: [
          {
            id: "cover-1",
            pool_id: "pool-1",
            state: "on",
            cover_type: "solar",
            source: "manual",
            recorded_at: "2026-06-04T19:30:00.000Z",
            created_at: "2026-06-04T19:30:03.000Z"
          }
        ]
      };
    },
    async getPoolCoverExposureSummary(input) {
      assert.equal(input.window, "24h");
      return {
        generated_at: "2026-06-05T12:00:00.000Z",
        summaries: [
          {
            window: "24h",
            covered_minutes: 720,
            uncovered_minutes: 720,
            covered_percent: 50,
            uncovered_percent: 50,
            daylight_uncovered_minutes: 480,
            last_cover_change_at: "2026-06-05T00:00:00.000Z",
            status: "available"
          }
        ]
      };
    },
    async createPoolCoverEvent(input) {
      assert.equal(input.state, "off");
      assert.equal(input.recorded_at, "2026-06-04T20:00:00.000Z");
      return {
        id: "cover-2",
        pool_id: "pool-1",
        state: "off",
        cover_type: "unknown",
        source: "manual",
        recorded_at: "2026-06-04T20:00:00.000Z",
        created_at: "2026-06-04T20:00:03.000Z"
      };
    }
  }));

  const currentResponse = await invokeRoute(server, "GET", "/pool/cover");
  assert.equal(currentResponse.statusCode, 200);
  assert.equal(currentResponse.body.data.current.cover_type, "solar");

  const historyResponse = await invokeRoute(server, "GET", "/pool/cover/history?limit=5");
  assert.equal(historyResponse.statusCode, 200);
  assert.equal(historyResponse.body.data.limit, 5);

  const exposureResponse = await invokeRoute(server, "GET", "/pool/cover/exposure-summary?window=24h");
  assert.equal(exposureResponse.statusCode, 200);
  assert.equal(exposureResponse.body.data.summaries[0].daylight_uncovered_minutes, 480);

  const createResponse = await invokeRoute(server, "POST", "/pool/cover", {
    state: "off",
    recorded_at: "2026-06-04T20:00:00.000Z"
  });
  assert.equal(createResponse.statusCode, 201);
  assert.equal(createResponse.body.data.id, "cover-2");
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
    getChemistryHistory: async () => ({
      start: "2026-01-01T00:00:00.000Z",
      end: "2026-01-02T00:00:00.000Z",
      interval: "raw",
      readings: [],
      series: []
    }),
    createChemistryReading: async () => ({
      reading: {
        id: "reading-1",
        pool_id: "pool-1",
        ph: 7.5,
        free_chlorine: 5.8,
        total_chlorine: null,
        total_alkalinity: null,
        calcium_hardness: null,
        cyanuric_acid: null,
        source: "manual",
        recorded_at: "2026-01-01T00:00:00.000Z",
        created_at: "2026-01-01T00:00:00.000Z"
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
    getPoolCoverHistory: async () => ({ start: null, end: null, limit: 100, events: [] }),
    getPoolCoverExposureSummary: async () => ({ generated_at: new Date().toISOString(), summaries: [] }),
    createPoolCoverEvent: async () => ({
      id: "cover-1",
      pool_id: "pool-1",
      state: "off",
      cover_type: "unknown",
      source: "manual",
      recorded_at: "2026-01-01T00:00:00.000Z",
      created_at: "2026-01-01T00:00:00.000Z"
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
  url: string,
  body?: Record<string, unknown>
): Promise<{ statusCode: number; body: Record<string, any> }> {
  let statusCode = 0;
  let responseBody = "";
  const req = createMockRequest(method, url, body);
  const res = createMockResponse((code, payload) => {
    statusCode = code;
    responseBody = payload;
  });

  await (server as any).route(req, res);

  return {
    statusCode,
    body: responseBody ? JSON.parse(responseBody) : {}
  };
}

function createMockRequest(method: string, url: string, body?: Record<string, unknown>) {
  const chunks = body ? [Buffer.from(JSON.stringify(body))] : [];
  return {
    method,
    url,
    headers: {},
    [Symbol.asyncIterator]: async function* () {
      for (const chunk of chunks) {
        yield chunk;
      }
    }
  };
}

function createMockResponse(onEnd: (statusCode: number, body: string) => void) {
  let statusCode = 200;
  const chunks: string[] = [];

  return {
    writeHead(code: number) {
      statusCode = code;
    },
    end(chunk?: string) {
      if (chunk) {
        chunks.push(chunk);
      }
      onEnd(statusCode, chunks.join(""));
    },
    write(chunk: string) {
      chunks.push(chunk);
    },
    on() {}
  };
}
