import test from "node:test";
import assert from "node:assert/strict";
import { App } from "../src/app.js";
import type { HttpServer } from "../src/http.js";
import type { Logger } from "../src/logger.js";
import { EnvProtocolSelectionProvider, type ProtocolSelectionProvider } from "../src/provider.js";

class UnavailableProvider implements ProtocolSelectionProvider {
  async getSelection(): Promise<{
    kind: "unavailable";
    errorCode: string;
    detail: string;
  }> {
    return {
      kind: "unavailable",
      errorCode: "config_provider_unavailable",
      detail: "provider unavailable"
    };
  }
}

class NoopHttpServer implements HttpServer {
  async start(_signal: AbortSignal): Promise<void> {}
}

const noopLogger: Logger = {
  info() {},
  warn() {},
  error() {}
};

test("app starts in degraded config state when provider is unavailable", async () => {
  const app = new App({
    config: {
      natsUrl: "nats://127.0.0.1:4222",
      httpBind: "127.0.0.1:19110",
      commandTimeoutMs: 5000,
      logLevel: "info",
      timezone: "UTC"
    },
    provider: new UnavailableProvider(),
    httpServer: new NoopHttpServer(),
    logger: noopLogger
  });

  const controller = new AbortController();
  const run = app.run(controller.signal);

  await new Promise((resolve) => setTimeout(resolve, 25));
  const snapshot = app.getSnapshot();

  assert.equal(snapshot.configuration, "error");
  assert.equal(snapshot.decode, "error");
  assert.equal(snapshot.commands, "error");
  assert.equal(snapshot.startupPhase, "config_degraded");

  controller.abort();
  await run;
});

test("env provider allows app to resolve an active plugin selection", async () => {
  const app = new App({
    config: {
      natsUrl: "nats://127.0.0.1:4222",
      httpBind: "127.0.0.1:19110",
      commandTimeoutMs: 5000,
      logLevel: "info",
      timezone: "UTC"
    },
    provider: new EnvProtocolSelectionProvider({
      PROTOCOL_POOL_ID: "pool-1",
      PROTOCOL_SELECTED_PLUGIN: "pentair_easytouch",
      PROTOCOL_SELECTED_CONFIG_JSON: "{}"
    }),
    httpServer: new NoopHttpServer(),
    logger: noopLogger
  });

  const controller = new AbortController();
  const run = app.run(controller.signal);

  await new Promise((resolve) => setTimeout(resolve, 25));
  const snapshot = app.getSnapshot();

  assert.equal(snapshot.poolId, "pool-1");
  assert.equal(snapshot.activePlugin, "pentair_easytouch");
  assert.equal(snapshot.configuration, "valid");
  assert.equal(snapshot.decode, "ok");
  assert.equal(snapshot.commands, "ok");

  controller.abort();
  await run;
});
