import test from "node:test";
import assert from "node:assert/strict";
import { EventBroker } from "../src/events.js";
import { LocalHttpServer, type HttpHandlers } from "../src/http.js";
import {
  PoolProfileSettingsService,
  PoolProfileSettingsUnavailableError,
  PoolProfileSettingsValidationError,
  SqlitePoolProfileSettingsRepository,
  validatePoolProfileSettingsUpdateInput
} from "../src/pool-profile-settings.js";

test("validatePoolProfileSettingsUpdateInput accepts positive gallons", () => {
  const result = validatePoolProfileSettingsUpdateInput({
    volume_gallons: 18000
  });

  assert.equal(result.volume_gallons, 18000);
});

test("validatePoolProfileSettingsUpdateInput rejects missing or invalid gallons", () => {
  assert.throws(
    () => validatePoolProfileSettingsUpdateInput({ volume_gallons: 0 }),
    (error: unknown) => {
      assert.ok(error instanceof PoolProfileSettingsValidationError);
      assert.deepEqual(error.details, {
        volume_gallons: "volume_gallons must be a positive number."
      });
      return true;
    }
  );
});

test("repository maps saved pool profile rows", async () => {
  const repository = new SqlitePoolProfileSettingsRepository({
    get() {
      return {
        id: "pool-1",
        volume_gallons: 18500
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

  assert.deepEqual(result, {
    poolId: "pool-1",
    volumeGallons: 18500
  });
});

test("service returns null volume when no stored pool profile exists yet", async () => {
  const service = new PoolProfileSettingsService("pool-1", {
    async get() {
      return null;
    },
    async upsert(settings) {
      return settings;
    }
  });

  const result = await service.getPoolProfileSettings();

  assert.deepEqual(result, {
    volume_gallons: null,
    source: "sqlite"
  });
});

test("service throws unavailable when updating without SQLite", async () => {
  const service = new PoolProfileSettingsService("pool-1", null);

  await assert.rejects(
    () => service.updatePoolProfileSettings({ volume_gallons: 20000 }),
    (error: unknown) => {
      assert.ok(error instanceof PoolProfileSettingsUnavailableError);
      assert.match(error.message, /pool profile settings/i);
      return true;
    }
  );
});

test("pool profile settings API GET and PUT routes work", async () => {
  const server = new LocalHttpServer("127.0.0.1:0", createHttpHandlers({
    async getPoolProfileSettings() {
      return {
        volume_gallons: 18000,
        source: "sqlite"
      };
    },
    async updatePoolProfileSettings(input) {
      assert.equal(input.volume_gallons, 22000);
      return {
        volume_gallons: 22000,
        source: "sqlite"
      };
    }
  }));

  const getResponse = await invokeRoute(server, "GET", "/api/settings/pool-profile");
  assert.equal(getResponse.statusCode, 200);
  assert.equal((getResponse.body.data as { volume_gallons: number }).volume_gallons, 18000);

  const putResponse = await invokeRoute(server, "PUT", "/api/settings/pool-profile", {
    volume_gallons: 22000
  });
  assert.equal(putResponse.statusCode, 200);
  assert.equal((putResponse.body.data as { volume_gallons: number }).volume_gallons, 22000);
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
    updateGeocodingProviderConfig: async () => ({}),
    getPoolProfileSettings: async () => ({ volume_gallons: null, source: "sqlite" }),
    updatePoolProfileSettings: async () => ({ volume_gallons: null, source: "sqlite" }),
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
    getChemistryObservations: async () => ({ start: null, end: null, limit: 25, observations: [] }),
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
    getMaintenanceActivities: async () => ({ start: null, end: null, limit: 25, activities: [] }),
    createMaintenanceActivity: async () => ({
      id: "activity-1",
      pool_id: "pool-1",
      activity_type: "brushing",
      notes: null,
      source: "manual",
      recorded_at: "2026-01-01T00:00:00.000Z",
      created_at: "2026-01-01T00:00:00.000Z"
    }),
    getChemicalAdditions: async () => ({ start: null, end: null, limit: 25, additions: [] }),
    createChemicalAddition: async () => ({
      id: "addition-1",
      pool_id: "pool-1",
      chemical_type: "liquid_chlorine",
      amount: 64,
      unit: "fl_oz",
      notes: null,
      source: "manual",
      recorded_at: "2026-01-01T00:00:00.000Z",
      created_at: "2026-01-01T00:00:00.000Z"
    }),
    getWaterAdditions: async () => ({ start: null, end: null, limit: 25, additions: [] }),
    createWaterAddition: async () => ({
      id: "water-1",
      pool_id: "pool-1",
      water_source: "well",
      amount: 200,
      unit: "gal",
      reason: "top_up",
      notes: null,
      source: "manual",
      recorded_at: "2026-01-01T00:00:00.000Z",
      created_at: "2026-01-01T00:00:00.000Z"
    }),
    getCurrentPoolCover: async () => ({ current: null }),
    getPoolCoverHistory: async () => ({ start: null, end: null, limit: 25, events: [] }),
    getPoolCoverExposureSummary: async () => ({ generated_at: "2026-01-01T00:00:00.000Z", summaries: [] }),
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
      score: null,
      summary: "",
      updated_at: null,
      highlights: [],
      drivers: [],
      confidence: "unknown",
      confidence_label: "Unknown",
      confidence_summary: "",
      contradictions: [],
      input_provenance: {}
    }),
    getNotifications: async () => ({ notifications: [], unread_count: 0 }),
    markNotificationRead: async () => null,
    markAllNotificationsRead: async () => ({ updated: 0 }),
    getPlatformStatus: async () => ({}),
    getMetrics: () => "",
    getEventBroker: () => eventBroker,
    getProtocolFrameBroker: () => protocolFrameBroker,
    listProtocolFrameBundles: () => [],
    createProtocolFrameBundle: () => ({ id: "bundle-1", label: null, created_at: "2026-01-01T00:00:00.000Z", frame_count: 0 }),
    getProtocolFrameBundle: () => null,
    startProtocolWatchSession: () => ({ id: "watch-1", label: null, status: "active", event_count: 0, created_at: "2026-01-01T00:00:00.000Z", stopped_at: null }),
    getProtocolWatchSession: () => null,
    stopProtocolWatchSession: () => null,
    compareProtocolFrameBundles: () => null,
    listProtocolAnnotations: () => [],
    createProtocolAnnotation: () => ({
      id: "annotation-1",
      bundle_id: null,
      frame_index: 0,
      field_name: "field",
      byte_start: 0,
      byte_end: 0,
      confidence: "medium",
      label: "Field",
      notes: null,
      created_at: "2026-01-01T00:00:00.000Z"
    }),
    listProtocolPrompts: () => [],
    createProtocolPrompt: () => ({
      id: "prompt-1",
      bundle_id: null,
      frame_index: 0,
      prompt_type: "question",
      prompt: "Prompt",
      notes: null,
      created_at: "2026-01-01T00:00:00.000Z"
    }),
    publishRemoteLayoutRequest: async () => ({ commandId: "command-0" }),
    publishPumpInfoRequest: async () => ({ commandId: "command-0" }),
    publishControllerScheduleRequest: async () => ({ commandId: "command-0" }),
    updateControllerSchedule: async () => ({ commandId: "command-0", schedule: {} }),
    publishControllerDatetimeRequest: async () => ({ commandId: "command-0" }),
    publishControllerDatetimeSync: async () => ({ commandId: "command-0", timestamp: new Date().toISOString() }),
    publishCircuitConfigRequest: async () => ({ commandId: "command-0", startCircuitIndex: 1, endCircuitIndex: 1 }),
    publishRawFrameSend: async () => ({ commandId: "command-0", bytes: [] }),
    simulateProtocolCommand: async () => ({ mode: "dry_run", command_type: "unknown", summary: "ok", encoded_frame_hex: null, warnings: [] }),
    publishPumpSpeedCommand: async () => ({ commandId: "command-0" }),
    publishCircuitStateCommand: async () => ({ commandId: "command-0" }),
    publishChlorinatorOutputCommand: async () => ({ commandId: "command-0" }),
    ...overrides
  } as unknown as HttpHandlers;
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

  await (server as unknown as { route: (request: unknown, response: unknown) => Promise<void> }).route(request, response);

  return {
    statusCode: response.statusCode,
    body: JSON.parse(Buffer.concat(chunks).toString("utf8"))
  };
}
