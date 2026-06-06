import assert from "node:assert/strict";
import test from "node:test";
import { EventBroker } from "../src/events.js";
import { LocalHttpServer, type HttpHandlers } from "../src/http.js";
import { createSqliteDatabase } from "../src/database.js";
import { NotificationsService } from "../src/notifications.js";

test("notifications service generates alerts and does not recreate a read alert for the same active context", async () => {
  const database = createNotificationsDatabase();
  const service = new NotificationsService("pool-1", database);

  const context = buildNotificationContext({
    rainfallSinceChemistryInches: 0.5,
    swimmability: {
      status: "caution",
      summary: "Chemistry confidence is aging."
    }
  });

  const firstInbox = await service.getNotifications({ status: null, limit: null, type: null }, context);
  assert.deepEqual(
    firstInbox.notifications.map((notification) => notification.type).sort(),
    ["chemistry_test_due", "chemistry_value_stale", "rain_since_test", "swimmability_caution"]
  );

  const swimmabilityNotification = firstInbox.notifications.find((notification) => notification.type === "swimmability_caution");
  assert.ok(swimmabilityNotification);

  const readRecord = await service.markNotificationRead(swimmabilityNotification.id);
  assert.ok(readRecord);
  assert.equal(readRecord?.read, true);

  const secondInbox = await service.getNotifications({ status: null, limit: null, type: null }, context);
  assert.deepEqual(
    secondInbox.notifications.map((notification) => notification.type).sort(),
    ["chemistry_test_due", "chemistry_value_stale", "rain_since_test"]
  );
});

test("notifications service removes inactive unread alerts when the condition clears", async () => {
  const database = createNotificationsDatabase();
  const service = new NotificationsService("pool-1", database);

  await service.getNotifications(
    { status: null, limit: null, type: null },
    buildNotificationContext({
      rainfallSinceChemistryInches: 0.5
    })
  );

  const refreshed = await service.getNotifications(
    { status: null, limit: null, type: null },
    buildNotificationContext({
      rainfallSinceChemistryInches: 0.0
    })
  );

  assert.equal(refreshed.notifications.some((notification) => notification.type === "rain_since_test"), false);
});

test("notifications API routes return inbox data and read mutations", async () => {
  const server = new LocalHttpServer("127.0.0.1:8080", createHttpHandlers({
    async getNotifications(input) {
      assert.equal(input.status ?? "unread", "unread");
      return {
        status: "unread",
        limit: 50,
        notifications: [
          {
            id: "notification-1",
            pool_id: "pool-1",
            type: "chemistry_test_due",
            severity: "warning",
            title: "Chemistry test is due",
            body: "The latest chemistry reading is older than the configured testing interval.",
            read: false,
            source: "system",
            related_entity_type: "chemistry_reading",
            related_entity_id: "reading-1",
            created_at: "2026-06-04T21:00:00.000Z",
            read_at: null
          }
        ]
      };
    },
    async markNotificationRead(id) {
      return {
        id,
        pool_id: "pool-1",
        type: "chemistry_test_due",
        severity: "warning",
        title: "Chemistry test is due",
        body: "The latest chemistry reading is older than the configured testing interval.",
        read: true,
        source: "system",
        related_entity_type: "chemistry_reading",
        related_entity_id: "reading-1",
        created_at: "2026-06-04T21:00:00.000Z",
        read_at: "2026-06-04T21:05:00.000Z"
      };
    },
    async markAllNotificationsRead() {
      return { updated_count: 3 };
    }
  }));

  const listResponse = await invokeRoute(server, "GET", "/notifications?status=unread");
  assert.equal(listResponse.statusCode, 200);
  assert.equal(listResponse.body.data.notifications.length, 1);

  const readResponse = await invokeRoute(server, "POST", "/notifications/notification-1/read", {});
  assert.equal(readResponse.statusCode, 200);
  assert.equal(readResponse.body.data.read, true);

  const readAllResponse = await invokeRoute(server, "POST", "/notifications/read-all", {});
  assert.equal(readAllResponse.statusCode, 200);
  assert.equal(readAllResponse.body.data.updated_count, 3);
});

function createNotificationsDatabase() {
  const database = createSqliteDatabase({
    path: ":memory:",
    migrationsDir: "migrations",
    busyTimeoutMs: 0,
    journalMode: "MEMORY"
  });

  database.exec(`
    CREATE TABLE notifications (
      id TEXT PRIMARY KEY,
      pool_id TEXT NOT NULL,
      type TEXT NOT NULL,
      severity TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      read INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL,
      related_entity_type TEXT,
      related_entity_id TEXT,
      created_at TEXT NOT NULL,
      read_at TEXT
    )
  `);

  return database;
}

function buildNotificationContext(overrides: {
  rainfallSinceChemistryInches?: number | null;
  swimmability?: {
    status: "good" | "caution" | "poor" | "unknown";
    summary: string;
  };
} = {}) {
  return {
    chemistry: {
      id: "reading-1",
      pool_id: "pool-1",
      ph: 7.5,
      free_chlorine: 5.4,
      total_chlorine: 5.7,
      total_alkalinity: 90,
      calcium_hardness: 260,
      cyanuric_acid: 70,
      source: "manual" as const,
      recorded_at: "2026-05-28T18:45:00.000Z",
      created_at: "2026-05-28T18:45:00.000Z"
    },
    chemistryPromptIntervalDays: 3,
    swimmability: {
      status: overrides.swimmability?.status ?? "good",
      score: overrides.swimmability?.status === "good" ? 85 : 68,
      summary: overrides.swimmability?.summary ?? "Water is currently suitable for swimming.",
      headline: "Safe for Swimming",
      confidence: "high" as const,
      last_chemistry_age_label: "7 days ago",
      highlights: [],
      updated_at: "2026-06-04T21:00:00.000Z",
      drivers: [],
      inputs: {
        chemistry_latest_at: "2026-05-28T18:45:00.000Z",
        cover_latest_at: "2026-06-04T17:30:00.000Z",
        forecast_fetched_at: "2026-06-04T19:00:00.000Z",
        telemetry_latest_at: "2026-06-04T19:18:00.000Z"
      }
    },
    rainfallSinceChemistryInches: overrides.rainfallSinceChemistryInches ?? 0,
    cover: {
      current: {
        id: "cover-1",
        pool_id: "pool-1",
        state: "off" as const,
        cover_type: "solar" as const,
        source: "manual" as const,
        recorded_at: "2026-06-04T17:30:00.000Z",
        created_at: "2026-06-04T17:30:00.000Z"
      }
    },
    forecast: {
      pool_id: "pool-1",
      provider: "openmeteo",
      status: "available" as const,
      message: "Weather forecast is available.",
      stale: false,
      fetched_at: "2026-06-04T19:00:00.000Z",
      location: null,
      daily: [],
      hourly: []
    },
    latestTemperatures: {
      controller_id: "default",
      status: "available" as const,
      message: "Temperature telemetry is available.",
      last_updated: "2026-06-04T19:18:00.000Z",
      readings: {}
    },
    freshness: {
      generatedAt: "2026-06-04T21:00:00.000Z",
      items: [
        {
          chemicalKey: "free_chlorine" as const,
          displayName: "Free Chlorine",
          enabled: true,
          status: "stale" as const,
          lastObservedAt: "2026-05-28T18:45:00.000Z",
          expectedIntervalValue: 3,
          expectedIntervalUnit: "days" as const,
          staleThresholdValue: 3,
          staleThresholdUnit: "days" as const,
          unavailableThresholdValue: 7,
          unavailableThresholdUnit: "days" as const
        }
      ]
    },
    now: "2026-06-04T21:00:00.000Z"
  };
}

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
    getPoolChemistrySettings: async () => ({ settings: [], chemistry_prompt_interval_days: 3, source: "defaults" }),
    updatePoolChemistrySettings: async () => ({ settings: [], chemistry_prompt_interval_days: 3, source: "defaults" }),
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

  await (server as unknown as { route: (req: any, res: any) => Promise<void> }).route(req, res);

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
    headers: {
      origin: "http://127.0.0.1:3000"
    },
    [Symbol.asyncIterator]: async function* () {
      for (const chunk of chunks) {
        yield chunk;
      }
    }
  };
}

function createMockResponse(onFinish: (statusCode: number, payload: string) => void) {
  const chunks: string[] = [];
  let statusCode = 200;

  return {
    writeHead(code: number) {
      statusCode = code;
    },
    setHeader() {
      return this;
    },
    end(chunk?: string | Buffer) {
      if (chunk) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk);
      }
      onFinish(statusCode, chunks.join(""));
    },
    write(chunk: string | Buffer) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk);
      return true;
    }
  };
}
