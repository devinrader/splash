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
});
