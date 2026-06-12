import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { EventBroker } from "../src/events.js";
import { buildUnknownSwimmabilityView } from "./swimmability-fixtures.js";
import { LocalHttpServer, type HttpHandlers } from "../src/http.js";
import {
  ChemistryObservationsService,
  ChemistryObservationsUnavailableError,
  ChemistryObservationsValidationError,
  SqliteChemistryObservationsRepository
} from "../src/chemistry-observations.js";

test("repository maps stored chemistry observation rows", async () => {
  const repository = new SqliteChemistryObservationsRepository({
    all() {
      return [
        {
          id: "observation-1",
          pool_id: "pool-1",
          clarity: "clear",
          algae_presence: "absent",
          debris_level: "light",
          bather_load_estimate: "moderate",
          notes: "Busy afternoon swim",
          source: "manual",
          recorded_at: "2026-06-06T18:00:00.000Z",
          created_at: "2026-06-06T18:00:03.000Z"
        }
      ];
    },
    get() {
      return undefined;
    },
    run() {},
    exec() {},
    transaction<T>(callback: () => T) {
      return callback();
    },
    close() {}
  } as never);

  const result = await repository.list("pool-1", {
    start: null,
    end: null,
    limit: 10
  });

  assert.equal(result.length, 1);
  assert.equal(result[0]?.clarity, "clear");
  assert.equal(result[0]?.bather_load_estimate, "moderate");
});

test("service rejects invalid chemistry observation writes", async () => {
  const service = new ChemistryObservationsService("pool-1", {
    async create() {
      throw new Error("should not be called");
    },
    async list() {
      return [];
    }
  });

  await assert.rejects(
    () => service.createChemistryObservation({
      clarity: "murky",
      algae_presence: "probably",
      debris_level: "tons",
      bather_load_estimate: "packed"
    }),
    (error: unknown) => {
      assert.ok(error instanceof ChemistryObservationsValidationError);
      assert.equal(error.details.clarity, "clarity must be one of the supported clarity values.");
      assert.equal(error.details.algae_presence, "algae_presence must be one of the supported algae values.");
      assert.equal(error.details.debris_level, "debris_level must be one of the supported debris values.");
      assert.equal(error.details.bather_load_estimate, "bather_load_estimate must be one of the supported bather load values.");
      return true;
    }
  );
});

test("service rejects writes with no observational fields", async () => {
  const service = new ChemistryObservationsService("pool-1", {
    async create() {
      throw new Error("should not be called");
    },
    async list() {
      return [];
    }
  });

  await assert.rejects(
    () => service.createChemistryObservation({ notes: "Looked okay." }),
    (error: unknown) => {
      assert.ok(error instanceof ChemistryObservationsValidationError);
      assert.equal(error.details.observation, "At least one observational field must be provided.");
      return true;
    }
  );
});

test("service throws unavailable when chemistry observations repository is missing", async () => {
  const service = new ChemistryObservationsService("pool-1", null);

  await assert.rejects(
    () => service.getChemistryObservations({ start: null, end: null, limit: null }),
    (error: unknown) => {
      assert.ok(error instanceof ChemistryObservationsUnavailableError);
      return true;
    }
  );
});

test("chemistry observations API list and create routes work", async () => {
  const server = new LocalHttpServer("127.0.0.1:0", createHttpHandlers({
    async getChemistryObservations(input) {
      assert.equal(input.limit, "10");
      return {
        start: null,
        end: null,
        limit: 10,
        observations: []
      };
    },
    async createChemistryObservation(input) {
      assert.equal(input.clarity, "clear");
      assert.equal(input.algae_presence, "absent");
      assert.equal(input.debris_level, "light");
      return {
        id: "observation-2",
        pool_id: "pool-1",
        clarity: "clear",
        algae_presence: "absent",
        debris_level: "light",
        bather_load_estimate: "moderate",
        notes: "Crowded afternoon.",
        source: "manual",
        recorded_at: "2026-06-06T19:30:00.000Z",
        created_at: "2026-06-06T19:30:03.000Z"
      };
    }
  }));

  const listResponse = await invokeRoute(server, "GET", "/chemistry/observations?limit=10");
  assert.equal(listResponse.statusCode, 200);
  assert.equal(listResponse.body.data.limit, 10);

  const createResponse = await invokeRoute(server, "POST", "/chemistry/observations", {
    clarity: "clear",
    algae_presence: "absent",
    debris_level: "light",
    bather_load_estimate: "moderate",
    notes: "Crowded afternoon."
  });
  assert.equal(createResponse.statusCode, 201);
  assert.equal(createResponse.body.data.id, "observation-2");
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
    getNotifications: async () => ({
      status: "unread",
      limit: 50,
      notifications: []
    }),
    markNotificationRead: async () => null,
    markAllNotificationsRead: async () => ({ updated_count: 0 }),
    getPlatformStatus: async () => ({}),
    getMetrics: () => "",
    getEventBroker: () => eventBroker,
    getProtocolFrameBroker: () => protocolFrameBroker,
    listProtocolFrameBundles: () => [],
    createProtocolFrameBundle: () => ({ id: "bundle-1", label: "bundle", frame_count: 0, created_at: "2026-01-01T00:00:00.000Z" }),
    getProtocolFrameBundle: () => null,
    startProtocolWatchSession: () => ({
      id: "watch-1",
      label: "watch",
      status: "active",
      events: null,
      frame_count: 0,
      created_at: "2026-01-01T00:00:00.000Z",
      stopped_at: null
    }),
    getProtocolWatchSession: () => null,
    stopProtocolWatchSession: () => null,
    compareProtocolFrameBundles: () => null,
    listProtocolAnnotations: () => [],
    createProtocolAnnotation: () => {
      throw new Error("not implemented");
    },
    listProtocolPrompts: () => [],
    createProtocolPrompt: () => {
      throw new Error("not implemented");
    },
    publishRemoteLayoutRequest: async () => ({ commandId: "command-0" }),
    publishPumpInfoRequest: async () => ({ commandId: "command-0" }),
    publishControllerScheduleRequest: async () => ({ commandId: "command-0" }),
    updateControllerSchedule: async () => ({ commandId: "command-0", schedule: {} }),
    updateControllerHeaterConfiguration: async () => ({ commandId: "command-0", heater: {} }),
    updateControllerHeaterSettings: async () => ({ commandId: "command-0", heater: {} }),
    publishCircuitConfigRequest: async () => ({ commandId: "command-0" }),
    publishCustomNameRequest: async () => ({ commandId: "command-0" }),
    publishControllerSoftwareVersionRequest: async () => ({ commandId: "command-0" }),
    publishControllerDatetimeRequest: async () => ({ commandId: "command-0" }),
    publishControllerDatetimeSync: async () => ({ commandId: "command-0" }),
    publishPumpConfigWrite: async () => ({ commandId: "command-0" }),
    publishRawFrameCommand: async () => ({ commandId: "command-0" }),
    publishPumpSpeedCommand: async () => ({ commandId: "command-0" }),
    publishCircuitStateCommand: async () => ({ commandId: "command-0" }),
    ...overrides
  };
}

async function invokeRoute(
  server: LocalHttpServer,
  method: string,
  path: string,
  body?: Record<string, unknown>
): Promise<{ statusCode: number; body: any }> {
  const requestBody = body ? JSON.stringify(body) : "";
  const req = Readable.from(requestBody ? [requestBody] : []) as Readable & {
    method: string;
    url: string;
    headers: Record<string, string>;
  };
  req.method = method;
  req.url = path;
  req.headers = body ? { "content-type": "application/json" } : {};

  let statusCode = 200;
  let responseBody = "";
  const res = {
    writeHead(status: number) {
      statusCode = status;
      return this;
    },
    end(payload?: string) {
      responseBody = payload ?? "";
      return this;
    }
  };

  await (server as any).route(req, res);
  return {
    statusCode,
    body: responseBody ? JSON.parse(responseBody) : null
  };
}
