import test from "node:test";
import assert from "node:assert/strict";
import { App } from "../src/app.js";
import type { MessagingSession } from "../src/messaging.js";
import { ProtocolAnnotationStore } from "../src/protocol-annotations.js";
import { ProtocolPromptStore } from "../src/protocol-prompts.js";
import { ProtocolFrameBundleStore } from "../src/protocol-bundles.js";

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

test("app publishes a manual Remote Layout request intent for Protocol Explorer", async () => {
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

  const result = await app.publishRemoteLayoutRequest({ pageIndex: 5 }, session);

  assert.ok(result.commandId);
  assert.equal(session.published.length, 1);
  assert.equal(session.published[0].subject, "protocol.command.intent");
  assert.equal(session.published[0].payload.command_type, "request_remote_layout_page");
  assert.equal((session.published[0].payload.arguments as { page_index: number }).page_index, 5);
});

test("app publishes a manual raw frame request intent for Protocol Explorer", async () => {
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

  const result = await app.publishRawFrameCommand(
    { protocolName: "pentair_easytouch", bytesHex: "ff00ffa5011022e1010001ba" },
    session
  );

  assert.ok(result.commandId);
  assert.equal(session.published.length, 1);
  assert.equal(session.published[0].subject, "protocol.command.intent");
  assert.equal(session.published[0].payload.command_type, "send_raw_frame");
  assert.equal(
    (session.published[0].payload.arguments as { bytes_hex: string }).bytes_hex,
    "ff00ffa5011022e1010001ba"
  );
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
  await session.emit("protocol.command.encoded", { command_id: "command-1", bytes_hex: "ff00ffa5011021e1010001b9" });
  await session.emit("serial.rx.raw", { stream_id: "stream-1", bytes_hex: "ff00ffa5340f1002" });
  await session.emit("serial.tx.raw", { command_id: "command-1", write_result: "ok", bytes_hex: "ff00ffa5011021e1010001b9" });

  controller.abort();
  await running;
  unsubscribe();

  assert.deepEqual(observed, [
    { event: "protocol.frame.raw", payload: { frame_id: "frame-1", bytes_hex: "ff00ffa5" } },
    { event: "protocol.frame.decoded", payload: { frame_id: "frame-1", action_code: "0x02" } },
    {
      event: "protocol.command.encoded",
      payload: { command_id: "command-1", bytes_hex: "ff00ffa5011021e1010001b9" }
    },
    {
      event: "serial.rx.raw",
      payload: { stream_id: "stream-1", bytes_hex: "ff00ffa5340f1002" }
    },
    {
      event: "serial.tx.raw",
      payload: { command_id: "command-1", write_result: "ok", bytes_hex: "ff00ffa5011021e1010001b9" }
    }
  ]);
});

test("app saves protocol frame bundles from recent observed frame traffic", async () => {
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
    createProtocolFrameBundle(input: { label: string | null }): {
      id: string;
      label: string | null;
      frame_count: number;
      created_at: string;
    };
    getProtocolFrameBundle(id: string): {
      id: string;
      label: string | null;
      frame_count: number;
      frames: Array<{ event: string; payload: Record<string, unknown> }>;
    } | null;
    runNatsSession(session: MessagingSession, signal: AbortSignal): Promise<void>;
  };

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
  await session.emit("protocol.command.encoded", { command_id: "command-1", bytes_hex: "ff00ffa5011021e1010001b9" });

  const summary = app.createProtocolFrameBundle({ label: "baseline" });
  const bundle = app.getProtocolFrameBundle(summary.id);

  controller.abort();
  await running;

  assert.equal(summary.label, "baseline");
  assert.equal(summary.frame_count, 3);
  assert.ok(bundle);
  assert.equal(bundle?.frames.length, 3);
  assert.deepEqual(bundle?.frames.map((frame) => frame.event), [
    "protocol.frame.raw",
    "protocol.frame.decoded",
    "protocol.command.encoded"
  ]);
});

test("watch sessions capture live explorer frames after explicit start", async () => {
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
    startProtocolWatchSession(input: { label: string | null; events: string[] | null }): {
      id: string;
      status: "active" | "stopped";
      events: string[] | null;
      frame_count: number;
    };
    getProtocolWatchSession(id: string): {
      id: string;
      status: "active" | "stopped";
      events: string[] | null;
      frame_count: number;
      frames: Array<{ event: string; payload: Record<string, unknown> }>;
    } | null;
    stopProtocolWatchSession(id: string): {
      id: string;
      status: "active" | "stopped";
      frame_count: number;
      stopped_at: string | null;
    } | null;
    runNatsSession(session: MessagingSession, signal: AbortSignal): Promise<void>;
  };

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

  await session.emit("protocol.frame.raw", { frame_id: "before", bytes_hex: "ff00ffa5" });
  const watch = app.startProtocolWatchSession({
    label: "watch test",
    events: ["serial.rx.raw", "serial.tx.raw"]
  });
  await session.emit("protocol.frame.decoded", { frame_id: "after-1", action_code: "0x02" });
  await session.emit("serial.rx.raw", { stream_id: "stream-1", bytes_hex: "ff00ffa5340f1002" });
  await session.emit("serial.tx.raw", { command_id: "after-2", write_result: "ok", bytes_hex: "ff00ffa5" });

  const active = app.getProtocolWatchSession(watch.id);
  const stopped = app.stopProtocolWatchSession(watch.id);

  controller.abort();
  await running;

  assert.ok(active);
  assert.equal(active?.status, "active");
  assert.deepEqual(active?.events, ["serial.rx.raw", "serial.tx.raw"]);
  assert.equal(active?.frame_count, 2);
  assert.deepEqual(
    active?.frames.map((frame) => frame.event),
    ["serial.rx.raw", "serial.tx.raw"]
  );
  assert.ok(stopped);
  assert.equal(stopped?.status, "stopped");
  assert.equal(stopped?.frame_count, 2);
  assert.ok(stopped?.stopped_at);
});

test("bundle store compares saved bundles with byte-level hex diffs", () => {
  const baselineStore = new ProtocolFrameBundleStore();
  baselineStore.recordFrame("protocol.frame.raw", { frame_id: "frame-1", bytes_hex: "ff00ffa50010" });
  const baseline = baselineStore.createBundle("baseline");

  const comparisonStore = new ProtocolFrameBundleStore();
  comparisonStore.recordFrame("protocol.frame.raw", { frame_id: "frame-1", bytes_hex: "ff00ffa50020" });
  const comparison = comparisonStore.createBundle("comparison");

  const aggregateStore = new ProtocolFrameBundleStore();
  (aggregateStore as unknown as { bundles: unknown[] }).bundles = [
    baselineStore.getBundle(baseline.id),
    comparisonStore.getBundle(comparison.id)
  ].filter(Boolean);

  const diff = aggregateStore.compareBundles(baseline.id, comparison.id);

  assert.ok(diff);
  assert.equal(diff?.frame_pairs.length, 1);
  assert.deepEqual(diff?.frame_pairs[0].changed_fields, [
    {
      field: "bytes_hex",
      byte_changes: [{ byte_index: 5, baseline: "10", comparison: "20" }]
    }
  ]);
});

test("annotation store saves confidence-aware protocol annotations", () => {
  const store = new ProtocolAnnotationStore();
  const created = store.create({
    bundle_id: "bundle-1",
    frame_index: 0,
    field_name: "payload_hex",
    byte_start: 2,
    byte_end: 3,
    confidence: "inferred",
    label: "likely circuit id",
    notes: "Changes when Pool High is edited."
  });

  assert.ok(created.id);
  assert.equal(created.confidence, "inferred");
  assert.equal(store.list("bundle-1").length, 1);
  assert.equal(store.list("bundle-1")[0]?.field_name, "payload_hex");
});

test("prompt store saves operator-needed protocol prompts", () => {
  const store = new ProtocolPromptStore();
  const created = store.create({
    bundle_id: "bundle-1",
    frame_index: 0,
    field_name: "payload_hex",
    prompt: "What circuit was active when this frame was captured?",
    why: "This byte range changes with pump-circuit edits.",
    input_type: "controller_menu_state",
    operator_response: null
  });

  assert.ok(created.id);
  assert.equal(created.status, "open");
  assert.equal(store.list("bundle-1").length, 1);
  assert.equal(store.list("bundle-1")[0]?.input_type, "controller_menu_state");
});
