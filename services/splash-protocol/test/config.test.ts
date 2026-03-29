import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config.js";

test("loadConfig validates required configuration", () => {
  assert.throws(
    () =>
      loadConfig({
        PROTOCOL_HTTP_BIND: "127.0.0.1:9110",
        PROTOCOL_COMMAND_TIMEOUT_MS: "5000"
      }),
    /NATS_URL is required/
  );
});

test("loadConfig parses expected settings", () => {
  const config = loadConfig({
    NATS_URL: "nats://localhost:4222",
    PROTOCOL_HTTP_BIND: "127.0.0.1:9110",
    PROTOCOL_COMMAND_TIMEOUT_MS: "5000",
    LOG_LEVEL: "debug",
    TZ: "America/New_York"
  });

  assert.equal(config.natsUrl, "nats://localhost:4222");
  assert.equal(config.httpBind, "127.0.0.1:9110");
  assert.equal(config.commandTimeoutMs, 5000);
  assert.equal(config.logLevel, "debug");
  assert.equal(config.timezone, "America/New_York");
});
