import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { EventBroker } from "../src/events.js";
import { LocalHttpServer, type HttpHandlers } from "../src/http.js";
import {
  ChemicalAdditionsService,
  ChemicalAdditionsUnavailableError,
  ChemicalAdditionsValidationError,
  SqliteChemicalAdditionsRepository
} from "../src/chemical-additions.js";

test("repository maps stored chemical addition rows", async () => {
  const repository = new SqliteChemicalAdditionsRepository({
    all() {
      return [
        {
          id: "addition-1",
          pool_id: "pool-1",
          chemical_type: "liquid_chlorine",
          amount: 1.5,
          unit: "gal",
          notes: "Added after storm",
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
  assert.equal(result[0]?.chemical_type, "liquid_chlorine");
  assert.equal(result[0]?.amount, 1.5);
});

test("service rejects invalid chemical addition writes", async () => {
  const service = new ChemicalAdditionsService("pool-1", {
    async create() {
      throw new Error("should not be called");
    },
    async list() {
      return [];
    }
  });

  await assert.rejects(
    () => service.createChemicalAddition({
      chemical_type: "mystery_goop",
      amount: 0,
      unit: "cups"
    }),
    (error: unknown) => {
      assert.ok(error instanceof ChemicalAdditionsValidationError);
      assert.equal(error.details.chemical_type, "chemical_type must be one of the supported addition types.");
      assert.equal(error.details.amount, "amount must be a positive number.");
      assert.equal(error.details.unit, "unit must be one of the supported addition units.");
      return true;
    }
  );
});

test("service throws unavailable when chemical additions repository is missing", async () => {
  const service = new ChemicalAdditionsService("pool-1", null);

  await assert.rejects(
    () => service.getChemicalAdditions({ start: null, end: null, limit: null }),
    (error: unknown) => {
      assert.ok(error instanceof ChemicalAdditionsUnavailableError);
      return true;
    }
  );
});

test("chemical additions API list and create routes work", async () => {
  const server = new LocalHttpServer("127.0.0.1:0", createHttpHandlers({
    async getChemicalAdditions(input) {
      assert.equal(input.limit, "10");
      return {
        start: null,
        end: null,
        limit: 10,
        additions: []
      };
    },
    async createChemicalAddition(input) {
      assert.equal(input.chemical_type, "liquid_chlorine");
      assert.equal(input.amount, 1.5);
      assert.equal(input.unit, "gal");
      return {
        id: "addition-2",
        pool_id: "pool-1",
        chemical_type: "liquid_chlorine",
        amount: 1.5,
        unit: "gal",
        notes: "After rain",
        source: "manual",
        recorded_at: "2026-06-06T19:30:00.000Z",
        created_at: "2026-06-06T19:30:03.000Z"
      };
    }
  }));

  const listResponse = await invokeRoute(server, "GET", "/chemistry/additions?limit=10");
  assert.equal(listResponse.statusCode, 200);
  assert.equal(listResponse.body.data.limit, 10);

  const createResponse = await invokeRoute(server, "POST", "/chemistry/additions", {
    chemical_type: "liquid_chlorine",
    amount: 1.5,
    unit: "gal",
    notes: "After rain"
  });
  assert.equal(createResponse.statusCode, 201);
  assert.equal(createResponse.body.data.id, "addition-2");
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
      summary: "No chemistry reading is available yet.",
      headline: "No data",
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
    getNotifications: async () => ({ status: "unread", limit: 100, notifications: [] }),
    markNotificationRead: async () => null,
    markAllNotificationsRead: async () => ({ updated_count: 0 }),
    getPlatformStatus: async () => ({ overall: "healthy", generatedAt: "2026-01-01T00:00:00.000Z", connectivity: {}, services: [] }),
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

  const route = Reflect.get(server, "route") as (
    req: Parameters<LocalHttpServer["start"]>[0] extends never ? never : any,
    res: any
  ) => Promise<void>;
  await route.call(server, req, res);

  return {
    statusCode,
    body: responseBody ? (JSON.parse(responseBody) as any) : null
  };
}
