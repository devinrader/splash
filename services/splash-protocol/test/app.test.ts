import test from "node:test";
import assert from "node:assert/strict";
import { App } from "../src/app.js";
import type { HttpServer } from "../src/http.js";
import type { Logger } from "../src/logger.js";
import type { MessagingSession } from "../src/messaging.js";
import { renderMetrics } from "../src/metrics.js";
import { EnvProtocolSelectionProvider, type ProtocolSelectionProvider } from "../src/provider.js";
import type { AppSnapshot } from "../src/state.js";

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

function buildFrameHex(): string {
  const frame = [
    0xff,
    0x00,
    0xff,
    0xa5,
    0x01,
    0x0f,
    0x10,
    0x02,
    0x05,
    82,
    77,
    84,
    0x03,
    0x05
  ];
  const checksum = frame.slice(3).reduce((sum, byte) => (sum + byte) & 0xffff, 0);
  frame.push((checksum >> 8) & 0xff, checksum & 0xff);
  return frame.map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function commandIntent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    pool_id: "pool-1",
    command_id: "command-1",
    requested_at: "2026-03-30T00:00:00Z",
    protocol_name: "pentair_easytouch",
    target: {
      equipment_type: "circuit",
      circuit_key: "pool_high"
    },
    command_type: "set_speed",
    arguments: {
      rpm: 2800
    },
    requested_by: "test",
    dry_run: false,
    ...overrides
  };
}

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

test("app tracks service-local NATS and RS485 metric counters", async () => {
  const app = new App({
    config: {
      natsUrl: "nats://127.0.0.1:4222",
      httpBind: "127.0.0.1:19110",
      commandTimeoutMs: 20,
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
  }) as unknown as {
    refreshSelection(signal?: AbortSignal): Promise<void>;
    getSnapshot(): AppSnapshot;
    runNatsSession(session: MessagingSession, signal: AbortSignal): Promise<void>;
  };

  const handlers = new Map<string, Array<(payload: Record<string, unknown>) => Promise<void> | void>>();
  const session: MessagingSession & {
    emittedPublishes: Array<{ subject: string; payload: Record<string, unknown> }>;
    emit(subject: string, payload: Record<string, unknown>): Promise<void>;
  } = {
    emittedPublishes: [],
    async publish(subject: string, payload: Record<string, unknown>) {
      this.emittedPublishes.push({ subject, payload });
    },
    subscribe(subject: string, handler: (payload: Record<string, unknown>) => Promise<void> | void) {
      const list = handlers.get(subject) ?? [];
      list.push(handler);
      handlers.set(subject, list);
    },
    async emit(subject: string, payload: Record<string, unknown>) {
      for (const handler of handlers.get(subject) ?? []) {
        await handler(payload);
      }
    }
  };

  const controller = new AbortController();
  await app.refreshSelection(controller.signal);
  const running = app.runNatsSession(session, controller.signal);

  await session.emit("serial.rx.raw", {
    serial_instance_id: "serial-1",
    stream_id: "stream-1",
    chunk_id: "chunk-1",
    port: "/dev/ttyUSB0",
    received_at: "2026-03-30T00:00:00Z",
    bytes_hex: buildFrameHex(),
    byte_count: 16
  });
  await session.emit("serial.rx.raw", {
    serial_instance_id: "serial-1",
    stream_id: "stream-1",
    chunk_id: "chunk-bad",
    port: "/dev/ttyUSB0",
    received_at: "2026-03-30T00:00:01Z",
    bytes_hex: buildFrameHex().slice(0, -2) + "00",
    byte_count: 16
  });
  await session.emit("serial.rx.raw", {
    serial_instance_id: "serial-1",
    stream_id: "stream-1",
    chunk_id: "chunk-partial",
    port: "/dev/ttyUSB0",
    received_at: "2026-03-30T00:00:02Z",
    bytes_hex: "ff00ff",
    byte_count: 3
  });
  await session.emit("serial.rx.raw", {
    serial_instance_id: "serial-1",
    stream_id: "stream-2",
    chunk_id: "chunk-reset",
    port: "/dev/ttyUSB0",
    received_at: "2026-03-30T00:00:03Z",
    bytes_hex: "abcd",
    byte_count: 2
  });
  await session.emit("protocol.command.intent", commandIntent({ command_id: "command-dry-run", dry_run: true }));
  await session.emit("serial.port.status", {
    pool_id: "pool-1",
    stream_id: "stream-2",
    status: "connected",
    reported_at: "2026-03-30T00:00:04Z"
  });
  await session.emit("protocol.command.intent", commandIntent({ command_id: "command-timeout" }));
  await session.emit("serial.tx.raw", {
    serial_instance_id: "serial-1",
    stream_id: "stream-1",
    command_id: "command-1",
    bytes_hex: "ff00ffa5011021e1010001b9"
  });
  await new Promise((resolve) => setTimeout(resolve, 40));

  controller.abort();
  await running;

  const snapshot = app.getSnapshot();
  const metrics = renderMetrics(snapshot);

  assert.equal(snapshot.metrics.framesAssembledTotal, 2);
  assert.equal(snapshot.metrics.frameValidationFailuresTotal, 2);
  assert.ok(snapshot.metrics.normalizedEventsTotal >= 1);
  assert.equal(snapshot.metrics.commandsAcceptedTotal, 2);
  assert.equal(snapshot.metrics.commandResultsTotal.accepted, 2);
  assert.equal(snapshot.metrics.commandResultsTotal.encoded, 2);
  assert.equal(snapshot.metrics.commandResultsTotal.completed, 1);
  assert.equal(snapshot.metrics.commandResultsTotal.timed_out, 1);
  assert.equal(snapshot.metrics.streamResetsTotal, 1);
  assert.equal(snapshot.metrics.correlationTimeoutsTotal, 1);
  assert.equal(snapshot.metrics.serialRxMessagesTotal, 4);
  assert.equal(snapshot.metrics.serialTxMessagesTotal, 1);
  assert.ok(snapshot.metrics.natsMessagesReceivedTotal >= 7);
  assert.ok(snapshot.metrics.natsMessagesPublishedTotal >= 11);
  assert.ok(snapshot.metrics.protocolFramesDecodedTotal >= 1);
  assert.match(metrics, /splash_protocol_frames_assembled_total 2/);
  assert.match(metrics, /splash_protocol_frame_validation_failures_total 2/);
  assert.match(metrics, new RegExp(`splash_protocol_normalized_events_total ${snapshot.metrics.normalizedEventsTotal}`));
  assert.match(metrics, /splash_protocol_commands_total 2/);
  assert.match(metrics, /splash_protocol_command_results_total\{status="completed"\} 1/);
  assert.match(metrics, /splash_protocol_command_results_total\{status="timed_out"\} 1/);
  assert.match(metrics, /splash_protocol_stream_resets_total 1/);
  assert.match(metrics, /splash_protocol_correlation_timeouts_total 1/);
});
