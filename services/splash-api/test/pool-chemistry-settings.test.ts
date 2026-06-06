import test from "node:test";
import assert from "node:assert/strict";
import { EventBroker } from "../src/events.js";
import { LocalHttpServer, type HttpHandlers } from "../src/http.js";
import {
  PoolChemistrySettingsService,
  PoolChemistrySettingsUnavailableError,
  PoolChemistrySettingsValidationError,
  SqlitePoolChemistrySettingsRepository,
  validatePoolChemistrySettingsUpdateInput
} from "../src/pool-chemistry-settings.js";

test("validatePoolChemistrySettingsUpdateInput accepts supported chemistry updates", () => {
  const result = validatePoolChemistrySettingsUpdateInput({
    settings: [
      {
        chemicalKey: "free_chlorine",
        minimum: 3,
        target: 5,
        maximum: 10,
        enabled: true
      },
      {
        chemicalKey: "total_chlorine",
        minimum: 3,
        target: 5,
        maximum: 10,
        enabled: true
      },
      {
        chemicalKey: "salt",
        source_mode: "hardware",
        source_binding: {
          provider_type: "chlorinator",
          provider_id: "chlorinator-1",
          measurement_key: "salt"
        }
      }
    ],
    chemistry_prompt_interval_days: 4
  });

  assert.equal(result.settings.length, 3);
  assert.equal(result.settings[0]?.chemicalKey, "free_chlorine");
  assert.equal(result.settings[0]?.target, 5);
  assert.equal(result.settings[1]?.chemicalKey, "total_chlorine");
  assert.equal(result.settings[1]?.target, 5);
  assert.equal(result.settings[2]?.source_mode, "hardware");
  assert.equal(result.chemistry_prompt_interval_days, 4);
});

test("validatePoolChemistrySettingsUpdateInput rejects unknown keys and invalid ordering", () => {
  assert.throws(
    () =>
      validatePoolChemistrySettingsUpdateInput({
        settings: [
          {
            chemicalKey: "unknown_key",
            minimum: 10,
            target: 5,
            maximum: 3
          }
        ]
      }),
    (error: unknown) => {
      assert.ok(error instanceof PoolChemistrySettingsValidationError);
      assert.deepEqual(error.details, {
        unknown_key: {
          chemicalKey: "chemicalKey must be one of the supported built-in chemistry keys."
        }
      });
      return true;
    }
  );
});

test("repository maps saved chemistry settings rows", async () => {
  const repository = new SqlitePoolChemistrySettingsRepository({
    get() {
      return {
        pool_id: "pool-1",
        chemistry_bounds: {
          free_chlorine: {
            chemicalKey: "free_chlorine",
            displayName: "Free Chlorine",
            unit: "ppm",
            minimum: 3,
            target: 5,
            maximum: 10,
            enabled: true,
            sortOrder: 10,
            source_mode: "manual",
            source_binding: null
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
  assert.equal(result?.settings.free_chlorine.target, 5);
  assert.equal(result?.settings.ph.target, 7.6);
});

test("repository maps legacy combined chlorine settings onto total chlorine defaults", async () => {
  const repository = new SqlitePoolChemistrySettingsRepository({
    get() {
      return {
        pool_id: "pool-1",
        chemistry_bounds: {
          combined_chlorine: {
            chemicalKey: "combined_chlorine",
            displayName: "Combined Chlorine",
            unit: "ppm",
            minimum: 0,
            target: 0,
            maximum: 0.5,
            enabled: true,
            sortOrder: 20,
            source_mode: "manual",
            source_binding: null
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
  assert.equal(result?.settings.total_chlorine.displayName, "Total Chlorine");
  assert.equal(result?.settings.total_chlorine.target, 5);
  assert.equal(result?.settings.total_chlorine.maximum, 10);
});

test("service returns seeded defaults when SQLite rows are missing", async () => {
  const service = new PoolChemistrySettingsService("pool-1", {
    async get() {
      return null;
    },
    async upsert(settings) {
      return settings;
    }
  });

  const result = await service.getPoolChemistrySettings();

  assert.equal(result.source, "defaults");
  assert.equal(result.settings[0]?.chemicalKey, "free_chlorine");
  assert.equal(result.settings.find((setting) => setting.chemicalKey === "total_chlorine")?.displayName, "Total Chlorine");
  assert.equal(result.settings.find((setting) => setting.chemicalKey === "salt")?.target, 3400);
  assert.equal(result.settings.find((setting) => setting.chemicalKey === "salt")?.source_mode, "hardware");
  assert.equal(result.settings.find((setting) => setting.chemicalKey === "water_temperature")?.available_sources[0]?.label, "EasyTouch Controller Water Temperature");
});

test("service merges partial updates onto current chemistry settings", async () => {
  const service = new PoolChemistrySettingsService("pool-1", {
    async get() {
      return null;
    },
    async upsert(settings) {
      return settings;
    }
  });

  const result = await service.updatePoolChemistrySettings({
    settings: [
      {
        chemicalKey: "ph",
        minimum: 7.3,
        target: 7.5,
        maximum: 7.7,
        enabled: true
      }
    ]
  });

  const ph = result.settings.find((setting) => setting.chemicalKey === "ph");
  const salt = result.settings.find((setting) => setting.chemicalKey === "salt");

  assert.equal(result.source, "sqlite");
  assert.equal(ph?.target, 7.5);
  assert.equal(salt?.target, 3400);
  assert.equal(salt?.source_mode, "hardware");
});

test("service returns fallback recommendation bounds when repository is unavailable", async () => {
  const service = new PoolChemistrySettingsService("pool-1", null);

  const result = await service.getChemistryBoundsForRecommendations();

  assert.equal(result.freeChlorine?.target, 5);
  assert.equal(result.ph?.min, 7.2);
});

test("service throws unavailable when updating without SQLite", async () => {
  const service = new PoolChemistrySettingsService("pool-1", null);

  await assert.rejects(
    () =>
      service.updatePoolChemistrySettings({
        settings: [
          {
            chemicalKey: "ph",
            minimum: 7.2,
            target: 7.6,
            maximum: 7.8,
            enabled: true
          }
        ]
      }),
    (error: unknown) => {
      assert.ok(error instanceof PoolChemistrySettingsUnavailableError);
      return true;
    }
  );
});

test("pool chemistry API GET and PUT routes work", async () => {
  const server = new LocalHttpServer("127.0.0.1:8080", createHttpHandlers({
    async getPoolChemistrySettings() {
      return {
        settings: [
          {
            chemicalKey: "free_chlorine",
            displayName: "Free Chlorine",
            unit: "ppm",
            minimum: 3,
            target: 5,
            maximum: 10,
            enabled: true,
            sortOrder: 10,
            source_mode: "manual",
            source_binding: null,
            available_sources: []
          }
        ],
        chemistry_prompt_interval_days: 3,
        source: "sqlite"
      };
    },
    async updatePoolChemistrySettings(input) {
      assert.ok(Array.isArray(input.settings));
      return {
        settings: [
          {
            chemicalKey: "ph",
            displayName: "pH",
            unit: null,
            minimum: 7.2,
            target: 7.6,
            maximum: 7.8,
            enabled: true,
            sortOrder: 30,
            source_mode: "manual",
            source_binding: null,
            available_sources: []
          }
        ],
        chemistry_prompt_interval_days: 3,
        source: "sqlite"
      };
    }
  }));

  const getResponse = await invokeRoute(server, "GET", "/api/settings/pool-chemistry");
  assert.equal(getResponse.statusCode, 200);
  assert.equal(getResponse.body.data.settings[0].chemicalKey, "free_chlorine");

  const putResponse = await invokeRoute(server, "PUT", "/api/settings/pool-chemistry", {
    settings: [
      {
        chemicalKey: "ph",
        minimum: 7.2,
        target: 7.6,
        maximum: 7.8,
        enabled: true
      }
    ]
  });
  assert.equal(putResponse.statusCode, 200);
  assert.equal(putResponse.body.data.settings[0].chemicalKey, "ph");
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
    updateControllerSchedule: async () => ({ commandId: "command-0", schedule: {} }),
    updateControllerHeaterConfiguration: async () => ({ commandId: "command-0", heater: {} }),
    updateControllerHeaterSettings: async () => ({ commandId: "command-0", heater: {} }),
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
    createProtocolAnnotation: () => ({
      id: "annotation-1",
      bundle_id: "bundle-1",
      frame_index: 0,
      field_name: "field",
      byte_start: 0,
      byte_end: 1,
      confidence: "known",
      label: "label",
      notes: "note",
      created_at: new Date().toISOString()
    }),
    listProtocolPrompts: () => [],
    createProtocolPrompt: () => ({
      id: "prompt-1",
      bundle_id: "bundle-1",
      frame_index: 0,
      field_name: "field",
      prompt: "question",
      why: "why",
      input_type: "equipment_behavior",
      operator_response: null,
      status: "open",
      created_at: new Date().toISOString(),
      resolved_at: null
    }),
    publishRemoteLayoutRequest: async () => ({ commandId: "command-1" }),
    publishPumpInfoRequest: async () => ({ commandId: "command-2" }),
    publishControllerScheduleRequest: async () => ({ commandId: "command-3" }),
    publishCircuitConfigRequest: async () => ({ commandId: "command-4" }),
    publishCustomNameRequest: async () => ({ commandId: "command-5" }),
    publishControllerSoftwareVersionRequest: async () => ({ commandId: "command-6" }),
    publishControllerDatetimeRequest: async () => ({ commandId: "command-7" }),
    publishControllerDatetimeSync: async () => ({ commandId: "command-8" }),
    publishPumpConfigWrite: async () => ({ commandId: "command-9" }),
    publishRawFrameCommand: async () => ({ commandId: "command-10" }),
    publishPumpSpeedCommand: async () => ({ commandId: "command-11" }),
    publishCircuitStateCommand: async () => ({ commandId: "command-12" }),
    ...overrides
  };
}

async function invokeRoute(
  server: LocalHttpServer,
  method: string,
  url: string,
  body?: unknown
): Promise<{ statusCode: number; body: Record<string, any> }> {
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
