import test from "node:test";
import assert from "node:assert/strict";
import { EventBroker } from "../src/events.js";
import { LocalHttpServer, type HttpHandlers } from "../src/http.js";
import {
  SqliteWeatherLocationSettingsRepository,
  WeatherLocationSettingsService,
  WeatherLocationSettingsUnavailableError,
  WeatherLocationSettingsValidationError,
  validateWeatherLocationSettingsInput
} from "../src/weather-location-settings.js";

test("validateWeatherLocationSettingsInput accepts coordinate mode", () => {
  const result = validateWeatherLocationSettingsInput({
    locationMode: "coordinates",
    latitude: 35.2621,
    longitude: -81.1873,
    timezone: "America/New_York"
  });

  assert.equal(result.locationMode, "coordinates");
  assert.equal(result.latitude, 35.2621);
  assert.equal(result.longitude, -81.1873);
  assert.equal(result.timezone, "America/New_York");
});

test("validateWeatherLocationSettingsInput accepts address mode", () => {
  const result = validateWeatherLocationSettingsInput({
    locationMode: "address",
    addressLine1: "123 Main St",
    city: "Gastonia",
    stateRegion: "NC",
    postalCode: "28054",
    country: "US"
  });

  assert.equal(result.locationMode, "address");
  assert.equal(result.addressLine1, "123 Main St");
  assert.equal(result.city, "Gastonia");
});

test("validateWeatherLocationSettingsInput rejects invalid latitude and longitude", () => {
  assert.throws(
    () =>
      validateWeatherLocationSettingsInput({
        locationMode: "coordinates",
        latitude: 95,
        longitude: -190
      }),
    (error: unknown) => {
      assert.ok(error instanceof WeatherLocationSettingsValidationError);
      assert.equal(error.details.latitude, "Latitude must be between -90 and 90.");
      assert.equal(error.details.longitude, "Longitude must be between -180 and 180.");
      return true;
    }
  );
});

test("repository maps saved weather location rows", async () => {
  const repository = new SqliteWeatherLocationSettingsRepository({
    get() {
      return {
        pool_id: "pool-1",
        weather_location_mode: "coordinates",
        weather_location_address_line1: null,
        weather_location_address_line2: null,
        weather_location_city: null,
        weather_location_state_region: null,
        weather_location_postal_code: null,
        weather_location_country: null,
        weather_location_latitude: "35.262100",
        weather_location_longitude: "-81.187300",
        weather_location_timezone: "America/New_York",
        weather_geocoded_latitude: null,
        weather_geocoded_longitude: null,
        weather_geocode_provider: null,
        weather_geocoded_at: null
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
  assert.equal(result?.latitude, 35.2621);
  assert.equal(result?.longitude, -81.1873);
});

test("service returns requires_geocoding for address mode without resolved coordinates", async () => {
  const service = new WeatherLocationSettingsService("pool-1", {
    async get() {
      return {
        poolId: "pool-1",
        locationMode: "address",
        addressLine1: "123 Main St",
        addressLine2: null,
        city: "Gastonia",
        stateRegion: "NC",
        postalCode: "28054",
        country: "US",
        latitude: null,
        longitude: null,
        timezone: null,
        geocodedLatitude: null,
        geocodedLongitude: null,
        geocodeProvider: null,
        geocodedAt: null
      };
    },
    async upsert(settings) {
      return settings;
    }
  });

  const result = await service.getActiveWeatherCoordinates();

  assert.equal(result.status, "requires_geocoding");
  assert.equal(result.source, null);
});

test("service throws unavailable when repository is not configured", async () => {
  const service = new WeatherLocationSettingsService("pool-1", null);

  await assert.rejects(
    () => service.getWeatherLocationSettings(),
    (error: unknown) => {
      assert.ok(error instanceof WeatherLocationSettingsUnavailableError);
      return true;
    }
  );
});

test("weather location API GET and PUT routes work", async () => {
  const server = new LocalHttpServer("127.0.0.1:8080", createHttpHandlers({
    async getWeatherLocationSettings() {
      return {
        poolId: "pool-1",
        locationMode: "address",
        addressLine1: "123 Main St",
        addressLine2: null,
        city: "Gastonia",
        stateRegion: "NC",
        postalCode: "28054",
        country: "US",
        latitude: null,
        longitude: null,
        timezone: null,
        geocodedLatitude: null,
        geocodedLongitude: null,
        geocodeProvider: null,
        geocodedAt: null,
        locationStatus: "requires_geocoding"
      };
    },
    async upsertWeatherLocationSettings(input) {
      assert.equal(input.locationMode, "coordinates");
      return {
        poolId: "pool-1",
        locationMode: "coordinates",
        addressLine1: null,
        addressLine2: null,
        city: null,
        stateRegion: null,
        postalCode: null,
        country: null,
        latitude: 35.2621,
        longitude: -81.1873,
        timezone: "America/New_York",
        geocodedLatitude: null,
        geocodedLongitude: null,
        geocodeProvider: null,
        geocodedAt: null,
        locationStatus: "resolved"
      };
    }
  }));
  const getResponse = await invokeRoute(server, "GET", "/api/settings/weather-location");
  assert.equal(getResponse.statusCode, 200);
  assert.equal(getResponse.body.data.locationMode, "address");

  const putResponse = await invokeRoute(server, "PUT", "/api/settings/weather-location", {
    locationMode: "coordinates",
    latitude: 35.2621,
    longitude: -81.1873,
    timezone: "America/New_York"
  });
  assert.equal(putResponse.statusCode, 200);
  assert.equal(putResponse.body.data.locationMode, "coordinates");
  assert.equal(putResponse.body.data.latitude, 35.2621);
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
        total_alkalinity: null,
        calcium_hardness: null,
        cyanuric_acid: null,
        salt_level: null,
        rainfall_inches: null,
        source: "manual",
        recorded_at: "2026-01-01T00:00:00.000Z",
        created_at: "2026-01-01T00:00:00.000Z"
      },
      warnings: []
    }),
    getPlatformStatus: async () => ({}),
    getMetrics: () => "",
    getEventBroker: () => eventBroker,
    getProtocolFrameBroker: () => protocolFrameBroker,
    listProtocolFrameBundles: () => [],
    createProtocolFrameBundle: () => ({ id: "bundle-1", label: "label", frame_count: 0, created_at: new Date().toISOString() }),
    getProtocolFrameBundle: () => null,
    startProtocolWatchSession: () => ({ id: "watch-1", label: "watch", status: "active", events: [], frame_count: 0, created_at: new Date().toISOString(), stopped_at: null }),
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

async function invokeRoute(server: LocalHttpServer, method: string, url: string, body?: Record<string, unknown>) {
  let statusCode = 0;
  let responseBody = "";
  const requestBody = body ? JSON.stringify(body) : "";
  const req = {
    method,
    url,
    headers: {},
    async *[Symbol.asyncIterator]() {
      if (requestBody.length > 0) {
        yield Buffer.from(requestBody);
      }
    }
  };
  const res = {
    writeHead(code: number) {
      statusCode = code;
    },
    write(chunk: string) {
      responseBody += chunk;
    },
    end(chunk?: string) {
      if (chunk) {
        responseBody += chunk;
      }
    },
    on() {}
  };

  await (server as never as { route(req: unknown, res: unknown): Promise<void> }).route(req, res);

  return {
    statusCode,
    body: JSON.parse(responseBody) as { data: Record<string, unknown> }
  };
}
