import test from "node:test";
import assert from "node:assert/strict";
import { EventBroker } from "../src/events.js";
import { LocalHttpServer, type HttpHandlers } from "../src/http.js";
import {
  ChlorinatorProfileSettingsService,
  ChlorinatorProfileSettingsUnavailableError,
  ChlorinatorProfileSettingsValidationError,
  SqliteChlorinatorProfileSettingsRepository,
  validateChlorinatorProfileSettingsUpdateInput
} from "../src/chlorinator-profile-settings.js";

test("validateChlorinatorProfileSettingsUpdateInput accepts profile fields", () => {
  const result = validateChlorinatorProfileSettingsUpdateInput({
    settings: [
      {
        chemicalKey: "salinity",
        ideal_target: 3600,
        allowed_min: 2600,
        allowed_max: 4500,
        enabled: true
      }
    ]
  });

  assert.equal(result.settings.length, 1);
  assert.equal(result.settings[0]?.chemicalKey, "salinity");
  assert.equal(result.settings[0]?.ideal_target, 3600);
});

test("validateChlorinatorProfileSettingsUpdateInput rejects invalid range ordering", () => {
  assert.throws(
    () =>
      validateChlorinatorProfileSettingsUpdateInput({
        settings: [
          {
            chemicalKey: "ph",
            allowed_min: 7.8,
            allowed_max: 7.2
          }
        ]
      }),
    (error: unknown) => {
      assert.ok(error instanceof ChlorinatorProfileSettingsValidationError);
      assert.deepEqual(error.details, {
        ph: {
          allowed_range: "allowed_min must be less than or equal to allowed_max."
        }
      });
      return true;
    }
  );
});

test("chlorinator profile repository maps stored rows", async () => {
  const repository = new SqliteChlorinatorProfileSettingsRepository({
    get() {
      return {
        pool_id: "pool-1",
        profile_json: JSON.stringify([
          {
            chemicalKey: "salinity",
            ideal_target: 3600,
            allowed_min: 2600,
            allowed_max: 4500,
            enabled: true
          }
        ])
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

  assert.equal(result?.settings.salinity.ideal_target, 3600);
  assert.equal(result?.settings.salinity.allowed_min, 2600);
});

test("service returns defaults when no stored chlorinator profile exists yet", async () => {
  const service = new ChlorinatorProfileSettingsService("pool-1", {
    async get() {
      return null;
    },
    async upsert(settings) {
      return settings;
    }
  });

  const result = await service.getChlorinatorProfileSettings();

  assert.equal(result.source, "defaults");
  assert.equal(result.settings.find((item) => item.chemicalKey === "free_chlorine")?.ideal_min, 2);
});

test("service throws unavailable when updating without SQLite", async () => {
  const service = new ChlorinatorProfileSettingsService("pool-1", null);

  await assert.rejects(
    () => service.updateChlorinatorProfileSettings({ settings: [] }),
    (error: unknown) => {
      assert.ok(error instanceof ChlorinatorProfileSettingsUnavailableError);
      assert.match(error.message, /chlorinator operating profile/i);
      return true;
    }
  );
});

test("chlorinator profile API GET and PUT routes work", async () => {
  const server = new LocalHttpServer("127.0.0.1:0", createHttpHandlers({
    async getChlorinatorProfileSettings() {
      return {
        settings: [
          {
            chemicalKey: "salinity",
            displayName: "Salinity",
            unit: "ppm",
            ideal_min: null,
            ideal_max: null,
            ideal_target: 3600,
            allowed_min: 2600,
            allowed_max: 4500,
            enabled: true,
            sortOrder: 80
          }
        ],
        source: "sqlite"
      };
    },
    async updateChlorinatorProfileSettings(input) {
      const settings = (input.settings ?? []) as Array<Record<string, unknown>>;
      assert.equal(settings[0]?.chemicalKey, "salinity");
      assert.equal(settings[0]?.ideal_target, 3400);
      return {
        settings: [
          {
            chemicalKey: "salinity",
            displayName: "Salinity",
            unit: "ppm",
            ideal_min: null,
            ideal_max: null,
            ideal_target: 3400,
            allowed_min: 2600,
            allowed_max: 4500,
            enabled: true,
            sortOrder: 80
          }
        ],
        source: "sqlite"
      };
    }
  }));

  const getResponse = await invokeRoute(server, "GET", "/api/settings/chlorinator-profile");
  assert.equal(getResponse.statusCode, 200);
  assert.equal((getResponse.body.data as { settings: Array<{ ideal_target: number }> }).settings[0]?.ideal_target, 3600);

  const putResponse = await invokeRoute(server, "PUT", "/api/settings/chlorinator-profile", {
    settings: [{ chemicalKey: "salinity", ideal_target: 3400 }]
  });
  assert.equal(putResponse.statusCode, 200);
  assert.equal((putResponse.body.data as { settings: Array<{ ideal_target: number }> }).settings[0]?.ideal_target, 3400);
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
    getChlorinatorProfileSettings: async () => ({ settings: [], source: "defaults" }),
    updateChlorinatorProfileSettings: async () => ({ settings: [], source: "defaults" }),
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
    getPredictedSwimmability: async () => ({ horizons: [], requested_horizon: null, generated_at: null }),
    getMaintenanceRecommendations: async () => ({ recommendations: [] }),
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
