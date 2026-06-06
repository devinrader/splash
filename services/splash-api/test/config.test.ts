import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config.js";

test("loadConfig validates required configuration", () => {
  assert.throws(
    () =>
      loadConfig({
        NATS_URL: "nats://127.0.0.1:4222",
        API_HTTP_BIND: "127.0.0.1:8080"
      }),
    /API_POOL_ID is required/
  );
});

test("loadConfig parses expected settings", () => {
  const config = loadConfig({
    API_POOL_ID: "pool-1",
    NATS_URL: "nats://127.0.0.1:4222",
    API_HTTP_BIND: "127.0.0.1:8080",
    LOG_LEVEL: "debug",
    TZ: "America/New_York"
  });

  assert.equal(config.poolId, "pool-1");
  assert.equal(config.natsUrl, "nats://127.0.0.1:4222");
  assert.equal(config.httpBind, "127.0.0.1:8080");
  assert.equal(config.logLevel, "debug");
  assert.equal(config.timezone, "America/New_York");
  assert.equal(config.serialHealthUrl, null);
  assert.equal(config.protocolHealthUrl, null);
  assert.ok(config.poolSite);
  assert.ok(config.weather);
  assert.ok(config.geocoding);
  assert.equal(config.poolSite.timezone, "America/New_York");
  assert.equal(config.weather.provider, "openmeteo");
  assert.equal(config.weather.refreshMinutes, null);
  assert.equal(config.weather.refreshIntervalHours, 6);
  assert.equal(config.geocoding.geoapifyBaseUrl, "https://api.geoapify.com/v1");
  assert.equal(config.geocoding.osmBaseUrl, "https://nominatim.openstreetmap.org");
});

test("loadConfig parses optional Influx telemetry configuration", () => {
  const config = loadConfig({
    API_POOL_ID: "pool-1",
    NATS_URL: "nats://127.0.0.1:4222",
    API_HTTP_BIND: "127.0.0.1:8080",
    INFLUX_URL: "http://127.0.0.1:8086",
    INFLUX_TOKEN: "token-1",
    INFLUX_ORG: "splash",
    INFLUX_BUCKET: "pool-telemetry"
  });

  assert.deepEqual(config.influx, {
    url: "http://127.0.0.1:8086",
    token: "token-1",
    org: "splash",
    bucket: "pool-telemetry"
  });
});

test("loadConfig parses optional SQLite configuration", () => {
  const config = loadConfig({
    API_POOL_ID: "pool-1",
    NATS_URL: "nats://127.0.0.1:4222",
    API_HTTP_BIND: "127.0.0.1:8080",
    SQLITE_PATH: "/tmp/splash.sqlite",
    DATABASE_MIGRATIONS_DIR: "migrations",
    SQLITE_BUSY_TIMEOUT_MS: "2500",
    SQLITE_JOURNAL_MODE: "wal"
  });

  assert.deepEqual(config.sqlite, {
    path: "/tmp/splash.sqlite",
    migrationsDir: "migrations",
    busyTimeoutMs: 2500,
    journalMode: "WAL"
  });
});

test("loadConfig rejects unsupported SQLite journal mode", () => {
  assert.throws(
    () =>
      loadConfig({
        API_POOL_ID: "pool-1",
        NATS_URL: "nats://127.0.0.1:4222",
        API_HTTP_BIND: "127.0.0.1:8080",
        SQLITE_PATH: "/tmp/splash.sqlite",
        SQLITE_JOURNAL_MODE: "invalid"
      }),
    /Unsupported SQLITE_JOURNAL_MODE: INVALID/
  );
});

test("loadConfig rejects partial Influx telemetry configuration", () => {
  assert.throws(
    () =>
      loadConfig({
        API_POOL_ID: "pool-1",
        NATS_URL: "nats://127.0.0.1:4222",
        API_HTTP_BIND: "127.0.0.1:8080",
        INFLUX_URL: "http://127.0.0.1:8086",
        INFLUX_TOKEN: "token-1"
      }),
    /INFLUX_URL, INFLUX_TOKEN, INFLUX_ORG, and INFLUX_BUCKET must all be set together/
  );
});

test("loadConfig parses optional upstream health URLs", () => {
  const config = loadConfig({
    API_POOL_ID: "pool-1",
    NATS_URL: "nats://127.0.0.1:4222",
    API_NATS_MONITORING_URL: "http://127.0.0.1:8222",
    API_SERIAL_HEALTH_URL: "http://10.0.40.54:9108/health",
    API_PROTOCOL_HEALTH_URL: "http://127.0.0.1:9109/health",
    API_PROMETHEUS_URL: "http://prometheus.rader.haus",
    API_GRAFANA_URL: "http://grafana.rader.haus",
    API_HTTP_BIND: "127.0.0.1:8080"
  });

  assert.equal(config.natsMonitoringUrl, "http://127.0.0.1:8222");
  assert.equal(config.serialHealthUrl, "http://10.0.40.54:9108/health");
  assert.equal(config.protocolHealthUrl, "http://127.0.0.1:9109/health");
  assert.equal(config.prometheusUrl, "http://prometheus.rader.haus");
  assert.equal(config.grafanaUrl, "http://grafana.rader.haus");
});

test("loadConfig parses pool site and weather provider configuration", () => {
  const config = loadConfig({
    API_POOL_ID: "pool-1",
    NATS_URL: "nats://127.0.0.1:4222",
    API_HTTP_BIND: "127.0.0.1:8080",
    POOL_STREET_ADDRESS: "123 Splash Lane",
    POOL_CITY: "Gastonia",
    POOL_STATE: "NC",
    POOL_POSTAL_CODE: "28052",
    POOL_LATITUDE: "35.2621",
    POOL_LONGITUDE: "-81.1873",
    POOL_TIMEZONE: "America/New_York",
    WEATHER_PROVIDER: "openmeteo",
    WEATHER_REFRESH_MINUTES: "15,45",
    WEATHER_REFRESH_INTERVAL_HOURS: "12",
    OPEN_METEO_BASE_URL: "https://api.open-meteo.com/v1",
    OPEN_METEO_GEOCODING_URL: "https://geocoding-api.open-meteo.com/v1",
    GEOCODING_GEOAPIFY_API_KEY: "geo-key",
    GEOCODING_GEOAPIFY_BASE_URL: "https://geo.example.test/v1",
    GEOCODING_OSM_BASE_URL: "https://nominatim.example.test",
    GEOCODING_OSM_USER_AGENT: "Splash/1.0 (dev@example.test)",
    GEOCODING_OSM_EMAIL: "dev@example.test"
  });

  assert.ok(config.poolSite);
  assert.ok(config.weather);
  assert.equal(config.poolSite.streetAddress, "123 Splash Lane");
  assert.equal(config.poolSite.city, "Gastonia");
  assert.equal(config.poolSite.state, "NC");
  assert.equal(config.poolSite.postalCode, "28052");
  assert.equal(config.poolSite.latitude, 35.2621);
  assert.equal(config.poolSite.longitude, -81.1873);
  assert.deepEqual(config.weather.refreshMinutes, [15, 45]);
  assert.equal(config.weather.refreshIntervalHours, 12);
  assert.equal(config.weather.openMeteoBaseUrl, "https://api.open-meteo.com/v1");
  assert.equal(config.geocoding?.geoapifyApiKey, "geo-key");
  assert.equal(config.geocoding?.geoapifyBaseUrl, "https://geo.example.test/v1");
  assert.equal(config.geocoding?.osmBaseUrl, "https://nominatim.example.test");
  assert.equal(config.geocoding?.osmUserAgent, "Splash/1.0 (dev@example.test)");
  assert.equal(config.geocoding?.osmEmail, "dev@example.test");
});

test("loadConfig rejects invalid weather refresh minute values", () => {
  assert.throws(
    () =>
      loadConfig({
        API_POOL_ID: "pool-1",
        NATS_URL: "nats://127.0.0.1:4222",
        API_HTTP_BIND: "127.0.0.1:8080",
        WEATHER_REFRESH_MINUTES: "15,99"
      }),
    /WEATHER_REFRESH_MINUTES must contain comma-separated minute values between 0 and 59/
  );
});
