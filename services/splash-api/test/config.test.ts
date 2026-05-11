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
