import test from "node:test";
import assert from "node:assert/strict";
import { App } from "../src/app.js";
import type { MessagingSession } from "../src/messaging.js";

class FakeSession implements MessagingSession {
  readonly published: Array<{ subject: string; payload: Record<string, unknown> }> = [];

  async publish(subject: string, payload: Record<string, unknown>): Promise<void> {
    this.published.push({ subject, payload });
  }

  subscribe(): void {}
}

const noopLogger = {
  info() {},
  warn() {},
  error() {}
};

test("app publishes normalized pump speed command intent through the bridge target", async () => {
  const app = new App({
    config: {
      poolId: "pool-1",
      natsUrl: "nats://127.0.0.1:4222",
      httpBind: "127.0.0.1:8080",
      logLevel: "info",
      timezone: "UTC"
    },
    logger: noopLogger
  });
  const session = new FakeSession();

  const result = await app.publishPumpSpeedCommand({ equipmentId: "pump-main", rpm: 2800 }, session);

  assert.ok(result.commandId);
  assert.equal(session.published.length, 1);
  assert.equal(session.published[0].subject, "protocol.command.intent");
  const payload = session.published[0].payload as {
    target: { bus_address: string };
    arguments: { rpm: number };
  };
  assert.equal(payload.target.bus_address, "0x60");
  assert.equal(payload.arguments.rpm, 2800);
});
