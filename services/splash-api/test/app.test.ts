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

test("app republishes protocol frame events to the Protocol Explorer broker", async () => {
  const app = new App({
    config: {
      poolId: "pool-1",
      natsUrl: "nats://127.0.0.1:4222",
      httpBind: "127.0.0.1:8080",
      logLevel: "info",
      timezone: "UTC"
    },
    logger: noopLogger
  }) as unknown as {
    protocolFrames: {
      addClient(client: { send(event: string, payload: Record<string, unknown>): void }): () => void;
    };
    runNatsSession(session: MessagingSession, signal: AbortSignal): Promise<void>;
  };

  const observed: Array<{ event: string; payload: Record<string, unknown> }> = [];
  const unsubscribe = app.protocolFrames.addClient({
    send(event, payload) {
      observed.push({ event, payload });
    }
  });

  const handlers = new Map<string, Array<(payload: Record<string, unknown>) => Promise<void> | void>>();
  const session: MessagingSession & {
    emit(subject: string, payload: Record<string, unknown>): Promise<void>;
  } = {
    async publish() {},
    subscribe(subject, handler) {
      const list = handlers.get(subject) ?? [];
      list.push(handler);
      handlers.set(subject, list);
    },
    async emit(subject, payload) {
      for (const handler of handlers.get(subject) ?? []) {
        await handler(payload);
      }
    }
  };

  const controller = new AbortController();
  const running = app.runNatsSession(session, controller.signal);

  await session.emit("protocol.frame.raw", { frame_id: "frame-1", bytes_hex: "ff00ffa5" });
  await session.emit("protocol.frame.decoded", { frame_id: "frame-1", action_code: "0x02" });

  controller.abort();
  await running;
  unsubscribe();

  assert.deepEqual(observed, [
    { event: "protocol.frame.raw", payload: { frame_id: "frame-1", bytes_hex: "ff00ffa5" } },
    { event: "protocol.frame.decoded", payload: { frame_id: "frame-1", action_code: "0x02" } }
  ]);
});
