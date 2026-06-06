import test from "node:test";
import assert from "node:assert/strict";
import { EventBroker } from "../src/events.js";
import { LocalHttpServer, type HttpHandlers } from "../src/http.js";
import {
  ChemistryReadingsService,
  ChemistryReadingsUnavailableError,
  ChemistryReadingsValidationError,
  SqliteChemistryReadingsRepository
} from "../src/chemistry-readings.js";

test("repository maps latest chemistry reading rows", async () => {
  const repository = new SqliteChemistryReadingsRepository({
    get() {
      return {
        id: "reading-1",
        pool_id: "pool-1",
        ph: 7.5,
        free_chlorine: 5.8,
        total_chlorine: 6.1,
        total_alkalinity: 90,
        calcium_hardness: 260,
        cyanuric_acid: 70,
        source: "manual",
        recorded_at: "2026-03-26T19:30:00.000Z",
        created_at: "2026-03-26T19:30:03.000Z"
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
  assert.equal(result?.total_chlorine, 6.1);
});

test("service warns when pH and free chlorine are both omitted", async () => {
  const service = new ChemistryReadingsService("pool-1", {
    async getLatest() {
      return null;
    },
    async create(record) {
      return {
        id: "reading-1",
        pool_id: record.poolId,
        ph: record.ph,
        free_chlorine: record.freeChlorine,
        total_chlorine: record.totalChlorine,
        total_alkalinity: record.totalAlkalinity,
        calcium_hardness: record.calciumHardness,
        cyanuric_acid: record.cyanuricAcid,
        source: record.source,
        recorded_at: record.recordedAt,
        created_at: "2026-03-26T19:30:03.000Z"
      };
    },
    async listRaw() {
      return [];
    },
    async listRecent() {
      return [];
    },
    async listDailyAverage() {
      return [];
    }
  });

  const result = await service.createChemistryReading({
    total_alkalinity: 90
  });

  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0], "Manual reading omitted both pH and Free Chlorine.");
  assert.equal(result.reading.total_alkalinity, 90);
});

test("service rejects empty chemistry reading writes", async () => {
  const service = new ChemistryReadingsService("pool-1", {
    async getLatest() {
      return null;
    },
    async create() {
      throw new Error("should not be called");
    },
    async listRaw() {
      return [];
    },
    async listRecent() {
      return [];
    },
    async listDailyAverage() {
      return [];
    }
  });

  await assert.rejects(
    () => service.createChemistryReading({}),
    (error: unknown) => {
      assert.ok(error instanceof ChemistryReadingsValidationError);
      assert.equal(error.details.reading, "At least one manual chemistry field must be provided.");
      return true;
    }
  );
});

test("service throws unavailable when chemistry repository is missing", async () => {
  const service = new ChemistryReadingsService("pool-1", null);

  await assert.rejects(
    () => service.getChemistryHistory({ start: null, end: null, interval: "raw" }),
    (error: unknown) => {
      assert.ok(error instanceof ChemistryReadingsUnavailableError);
      return true;
    }
  );
});

test("chemistry API latest, history, and create routes work", async () => {
  const server = new LocalHttpServer("127.0.0.1:8080", createHttpHandlers({
    async getLatestChemistryReading() {
      return {
        id: "reading-1",
        pool_id: "pool-1",
        ph: 7.5,
        free_chlorine: 5.8,
        total_chlorine: 6,
        total_alkalinity: null,
        calcium_hardness: null,
        cyanuric_acid: null,
        source: "manual",
        recorded_at: "2026-03-26T19:30:00.000Z",
        created_at: "2026-03-26T19:30:03.000Z"
      };
    },
    async getChemistryHistory(input) {
      assert.equal(input.interval, "raw");
      return {
        start: input.start ?? "2026-03-01T00:00:00.000Z",
        end: input.end ?? "2026-03-31T00:00:00.000Z",
        interval: "raw",
        readings: [],
        series: []
      };
    },
    async createChemistryReading(input) {
      assert.equal(input.ph, 7.5);
      return {
        reading: {
          id: "reading-2",
          pool_id: "pool-1",
          ph: 7.5,
          free_chlorine: 5.6,
          total_chlorine: 5.9,
          total_alkalinity: null,
          calcium_hardness: null,
          cyanuric_acid: null,
          source: "manual",
          recorded_at: "2026-03-27T19:30:00.000Z",
          created_at: "2026-03-27T19:30:03.000Z"
        },
        warnings: []
      };
    }
  }));

  const latestResponse = await invokeRoute(server, "GET", "/chemistry/latest");
  assert.equal(latestResponse.statusCode, 200);
  assert.equal(latestResponse.body.data.total_chlorine, 6);

  const historyResponse = await invokeRoute(server, "GET", "/chemistry/history?interval=raw&start=2026-03-01T00:00:00.000Z&end=2026-03-31T00:00:00.000Z");
  assert.equal(historyResponse.statusCode, 200);
  assert.equal(historyResponse.body.data.interval, "raw");

  const createResponse = await invokeRoute(server, "POST", "/chemistry", {
    ph: 7.5,
    free_chlorine: 5.6,
    total_chlorine: 5.9
  });
  assert.equal(createResponse.statusCode, 201);
  assert.equal(createResponse.body.data.reading.id, "reading-2");
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
    getWeatherLocationSettings: async () => ({
      poolId: "pool-1",
      locationMode: "address",
      addressLine1: null,
      addressLine2: null,
      city: null,
      stateRegion: null,
      postalCode: null,
      country: null,
      latitude: null,
      longitude: null,
      timezone: null,
      geocodedLatitude: null,
      geocodedLongitude: null,
      geocodeProvider: null,
      geocodedAt: null,
      locationStatus: "requires_geocoding"
    }),
    upsertWeatherLocationSettings: async () => ({
      poolId: "pool-1",
      locationMode: "address",
      addressLine1: null,
      addressLine2: null,
      city: null,
      stateRegion: null,
      postalCode: null,
      country: null,
      latitude: null,
      longitude: null,
      timezone: null,
      geocodedLatitude: null,
      geocodedLongitude: null,
      geocodeProvider: null,
      geocodedAt: null,
      locationStatus: "requires_geocoding"
    }),
    getPoolChemistrySettings: async () => ({
      settings: [],
      source: "defaults"
    }),
    updatePoolChemistrySettings: async () => ({
      settings: [],
      source: "defaults"
    }),
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
    createPoolCoverEvent: async () => ({
      id: "cover-1",
      pool_id: "pool-1",
      state: "off",
      cover_type: "unknown",
      source: "manual",
      recorded_at: "2026-01-01T00:00:00.000Z",
      created_at: "2026-01-01T00:00:00.000Z"
    }),
    getSwimmability: async () => ({
      status: "unknown",
      score: 0,
      summary: "Unavailable",
      headline: "Assessment Unavailable",
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
