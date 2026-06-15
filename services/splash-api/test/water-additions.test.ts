import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { EventBroker } from "../src/events.js";
import { buildUnknownSwimmabilityView } from "./swimmability-fixtures.js";
import { LocalHttpServer, type HttpHandlers } from "../src/http.js";
import {
  SqliteWaterAdditionsRepository,
  WaterAdditionsService,
  WaterAdditionsUnavailableError,
  WaterAdditionsValidationError
} from "../src/water-additions.js";

test("repository maps stored water addition rows", async () => {
  const repository = new SqliteWaterAdditionsRepository({
    all() {
      return [
        {
          id: "water-addition-1",
          pool_id: "pool-1",
          water_source: "well",
          amount: 200,
          unit: "gal",
          reason: "top_up",
          notes: "Refilled after evaporation",
          source: "manual",
          recorded_at: "2026-06-14T18:00:00.000Z",
          created_at: "2026-06-14T18:00:03.000Z"
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
  assert.equal(result[0]?.water_source, "well");
  assert.equal(result[0]?.reason, "top_up");
});

test("service rejects invalid water addition writes", async () => {
  const service = new WaterAdditionsService("pool-1", {
    async create() {
      throw new Error("should not be called");
    },
    async list() {
      return [];
    }
  });

  await assert.rejects(
    () => service.createWaterAddition({
      water_source: "pond",
      amount: 0,
      unit: "cups",
      reason: "mystery"
    }),
    (error: unknown) => {
      assert.ok(error instanceof WaterAdditionsValidationError);
      assert.equal(error.details.water_source, "water_source must be one of the supported source-water values.");
      assert.equal(error.details.amount, "amount must be a positive number.");
      assert.equal(error.details.unit, "unit must be one of the supported water-addition units.");
      assert.equal(error.details.reason, "reason must be one of the supported water-addition reasons.");
      return true;
    }
  );
});

test("service throws unavailable when water additions repository is missing", async () => {
  const service = new WaterAdditionsService("pool-1", null);

  await assert.rejects(
    () => service.getWaterAdditions({ start: null, end: null, limit: null }),
    (error: unknown) => {
      assert.ok(error instanceof WaterAdditionsUnavailableError);
      return true;
    }
  );
});

test("water additions API list and create routes work", async () => {
  const server = new LocalHttpServer("127.0.0.1:0", createHttpHandlers({
    async getWaterAdditions(input) {
      assert.equal(input.limit, "10");
      return {
        start: null,
        end: null,
        limit: 10,
        additions: []
      };
    },
    async createWaterAddition(input) {
      assert.equal(input.water_source, "well");
      assert.equal(input.amount, 200);
      assert.equal(input.unit, "gal");
      assert.equal(input.reason, "top_up");
      return {
        id: "water-addition-2",
        pool_id: "pool-1",
        water_source: "well",
        amount: 200,
        unit: "gal",
        reason: "top_up",
        notes: "Refilled after evaporation",
        source: "manual",
        recorded_at: "2026-06-14T19:30:00.000Z",
        created_at: "2026-06-14T19:30:03.000Z"
      };
    }
  }));

  const listResponse = await invokeRoute(server, "GET", "/chemistry/water-additions?limit=10");
  assert.equal(listResponse.statusCode, 200);
  assert.equal(listResponse.body.data.limit, 10);

  const createResponse = await invokeRoute(server, "POST", "/chemistry/water-additions", {
    water_source: "well",
    amount: 200,
    unit: "gal",
    reason: "top_up",
    notes: "Refilled after evaporation"
  });
  assert.equal(createResponse.statusCode, 201);
  assert.equal(createResponse.body.data.id, "water-addition-2");
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
  url: string,
  body?: Record<string, unknown>
): Promise<{ statusCode: number; body: any }> {
  const requestBody = body ? JSON.stringify(body) : "";
  const req = Readable.from(requestBody ? [requestBody] : []) as Readable & {
    method: string;
    url: string;
    headers: Record<string, string>;
  };
  req.method = method;
  req.url = url;
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
