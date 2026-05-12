import test from "node:test";
import assert from "node:assert/strict";
import type { MessagePayload, MessagingSession } from "../src/messaging.js";
import { pentairEasyTouchPlugin } from "../src/plugins/pentair-easytouch.js";
import { ProtocolRuntime } from "../src/protocol/runtime.js";

class FakeSession implements MessagingSession {
  readonly published: Array<{ subject: string; payload: MessagePayload }> = [];
  private readonly handlers = new Map<string, Array<(payload: MessagePayload) => Promise<void> | void>>();

  async publish(subject: string, payload: MessagePayload): Promise<void> {
    this.published.push({ subject, payload });
  }

  subscribe(subject: string, handler: (payload: MessagePayload) => Promise<void> | void): void {
    const handlers = this.handlers.get(subject) ?? [];
    handlers.push(handler);
    this.handlers.set(subject, handlers);
  }

  async emit(subject: string, payload: MessagePayload): Promise<void> {
    for (const handler of this.handlers.get(subject) ?? []) {
      await handler(payload);
    }
  }
}

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

const logRecords: Array<{ event: string; fields?: Record<string, unknown> }> = [];
const logger = {
  info() {},
  warn(event: string, _message: string, fields?: Record<string, unknown>) {
    logRecords.push({ event, fields });
  },
  error() {}
};

test("protocol runtime publishes decoded and normalized output for live serial chunks", async () => {
  const session = new FakeSession();
  const runtime = new ProtocolRuntime(logger);
  runtime.setActiveSelection("pool-1", pentairEasyTouchPlugin);
  runtime.attach(session);

  await session.emit("serial.rx.raw", {
    serial_instance_id: "serial-1",
    stream_id: "stream-1",
    chunk_id: "chunk-1",
    port: "/dev/ttyUSB0",
    received_at: "2026-03-30T00:00:00Z",
    bytes_hex: buildFrameHex(),
    byte_count: 16
  });

  assert.equal(session.published.length, 4);
  assert.equal(session.published[0].subject, "protocol.frame.raw");
  assert.equal(session.published[1].subject, "protocol.frame.decoded");
  assert.equal(session.published[2].subject, "equipment.state.controller");
  assert.equal(session.published[3].subject, "telemetry.temperature.easytouch");
});

test("protocol runtime publishes unidentified byte diagnostics for discarded receive bytes", async () => {
  const session = new FakeSession();
  const runtime = new ProtocolRuntime(logger);
  runtime.setActiveSelection("pool-1", pentairEasyTouchPlugin);
  runtime.attach(session);

  await session.emit("serial.rx.raw", {
    serial_instance_id: "serial-1",
    stream_id: "stream-1",
    chunk_id: "chunk-1",
    port: "/dev/ttyUSB0",
    received_at: "2026-03-30T00:00:00Z",
    bytes_hex: `ffff${buildFrameHex()}`,
    byte_count: 18
  });

  assert.equal(session.published[0]?.subject, "protocol.frame.unidentified");
  assert.equal(session.published[0]?.payload.reason, "delimiter_noise");
  assert.equal(session.published[0]?.payload.bytes_hex, "ffff");
  assert.equal(session.published[1]?.subject, "protocol.frame.raw");
  assert.equal(session.published[2]?.subject, "protocol.frame.decoded");
  assert.equal(session.published[3]?.subject, "equipment.state.controller");
  assert.equal(session.published[4]?.subject, "telemetry.temperature.easytouch");
});

test("protocol runtime publishes buffered byte diagnostics for partial receive state", async () => {
  const session = new FakeSession();
  const runtime = new ProtocolRuntime(logger);
  runtime.setActiveSelection("pool-1", pentairEasyTouchPlugin);
  runtime.attach(session);

  const frameHex = buildFrameHex();
  await session.emit("serial.rx.raw", {
    serial_instance_id: "serial-1",
    stream_id: "stream-1",
    chunk_id: "chunk-1",
    port: "/dev/ttyUSB0",
    received_at: "2026-03-30T00:00:00Z",
    bytes_hex: frameHex.slice(0, 10),
    byte_count: 5
  });

  assert.equal(session.published.length, 1);
  assert.equal(session.published[0]?.subject, "protocol.frame.buffered");
  assert.equal(session.published[0]?.payload.reason, "partial_frame");
  assert.equal(session.published[0]?.payload.bytes_hex, frameHex.slice(0, 10));
});

test("protocol runtime reports the active stream id from live serial chunks", async () => {
  const session = new FakeSession();
  let activeStreamId: string | null = null;
  const runtime = new ProtocolRuntime(logger, (streamId) => {
    activeStreamId = streamId;
  });
  runtime.setActiveSelection("pool-1", pentairEasyTouchPlugin);
  runtime.attach(session);

  await session.emit("serial.rx.raw", {
    serial_instance_id: "serial-1",
    stream_id: "stream-1",
    chunk_id: "chunk-1",
    port: "/dev/ttyUSB0",
    received_at: "2026-03-30T00:00:00Z",
    bytes_hex: buildFrameHex(),
    byte_count: 16
  });

  assert.equal(activeStreamId, "stream-1");
});

test("protocol runtime ignores live chunks when no active plugin is configured", async () => {
  const session = new FakeSession();
  const runtime = new ProtocolRuntime(logger);
  runtime.attach(session);

  await session.emit("serial.rx.raw", {
    serial_instance_id: "serial-1",
    stream_id: "stream-1",
    chunk_id: "chunk-1",
    port: "/dev/ttyUSB0",
    received_at: "2026-03-30T00:00:00Z",
    bytes_hex: buildFrameHex(),
    byte_count: 16
  });

  assert.equal(session.published.length, 0);
});

test("protocol runtime logs invalid chunk payloads instead of throwing", async () => {
  logRecords.length = 0;
  const session = new FakeSession();
  const runtime = new ProtocolRuntime(logger);
  runtime.setActiveSelection("pool-1", pentairEasyTouchPlugin);
  runtime.attach(session);

  await session.emit("serial.rx.raw", {
    serial_instance_id: "serial-1",
    stream_id: "stream-1",
    chunk_id: "chunk-1",
    port: "/dev/ttyUSB0",
    received_at: "2026-03-30T00:00:00Z",
    bytes_hex: "zzzz",
    byte_count: 2
  });

  assert.equal(session.published.length, 0);
  assert.equal(logRecords[0]?.event, "protocol.decode.failed");
  assert.equal(logRecords[0]?.fields?.error_code, "hex_invalid");
});
