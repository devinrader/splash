import test from "node:test";
import assert from "node:assert/strict";
import { App } from "../src/app.js";
import type { HttpServer } from "../src/http.js";
import type { Logger } from "../src/logger.js";
import type { ProtocolSelectionProvider } from "../src/provider.js";

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
