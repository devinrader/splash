import test from "node:test";
import assert from "node:assert/strict";
import { CommandCoordinator } from "../src/commands/coordinator.js";
import type { MessagePayload, MessagingSession } from "../src/messaging.js";
import { pentairEasyTouchPlugin } from "../src/plugins/pentair-easytouch.js";
import type { SelectedProtocolConfig } from "../src/provider.js";

class FakeSession implements MessagingSession {
  readonly published: Array<{ subject: string; payload: MessagePayload }> = [];
  private readonly handlers = new Map<string, Array<(payload: MessagePayload) => Promise<void> | void>>();

  subscribe(subject: string, handler: (payload: MessagePayload) => Promise<void> | void): void {
    const handlers = this.handlers.get(subject) ?? [];
    handlers.push(handler);
    this.handlers.set(subject, handlers);
  }

  async publish(subject: string, payload: MessagePayload): Promise<void> {
    this.published.push({ subject, payload });
    await this.emit(subject, payload);
  }

  async emit(subject: string, payload: MessagePayload): Promise<void> {
    for (const handler of this.handlers.get(subject) ?? []) {
      await handler(payload);
    }
  }
}

const noopLogger = {
  info() {},
  warn() {},
  error() {}
};

const selection: SelectedProtocolConfig = {
  poolId: "pool-1",
  protocolPlugin: "pentair_easytouch",
  protocolConfig: {}
};

function commandIntent(overrides: Partial<MessagePayload> = {}): MessagePayload {
  return {
    pool_id: "pool-1",
    command_id: "command-1",
    requested_at: "2026-03-30T00:00:00Z",
    protocol_name: "pentair_easytouch",
    target: {
      equipment_type: "pump",
      bus_address: "0x60"
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

test("command coordinator encodes, transmits, and completes the initial pump speed flow", async () => {
  const session = new FakeSession();
  const coordinator = new CommandCoordinator(noopLogger, 100);
  coordinator.setActiveSelection(selection, pentairEasyTouchPlugin);
  coordinator.attach(session);

  await session.emit("serial.port.status", {
    pool_id: "pool-1",
    stream_id: "stream-1",
    status: "connected",
    reported_at: "2026-03-30T00:00:00Z"
  });
  await session.emit("protocol.command.intent", commandIntent());

  const encoded = session.published.filter((entry) => entry.subject === "protocol.command.encoded");
  const writes = session.published.filter((entry) => entry.subject === "serial.write.request");
  const results = session.published.filter((entry) => entry.subject === "command.result.command-1");

  assert.equal(encoded.length, 3);
  assert.equal(writes.length, 3);
  assert.equal(results[0]?.payload.status, "accepted");
  assert.equal(results[1]?.payload.status, "encoded");

  for (let index = 0; index < 3; index += 1) {
    await session.emit("serial.tx.raw", {
      pool_id: "pool-1",
      stream_id: "stream-1",
      command_id: "command-1",
      written_at: "2026-03-30T00:00:01Z",
      bytes_hex: writes[index]?.payload.bytes_hex,
      byte_count: writes[index]?.payload.byte_count,
      write_result: "ok",
      error_code: null,
      detail: null
    });
  }

  await session.emit("equipment.state.pump", {
    bus_address: "0x60",
    rpm: 2800
  });

  const terminalResults = session.published
    .filter((entry) => entry.subject === "command.result.command-1")
    .map((entry) => entry.payload.status);
  assert.ok(terminalResults.includes("transmitted"));
  assert.ok(terminalResults.includes("completed"));
});

test("command coordinator times out when confirmation is not observed", async () => {
  const session = new FakeSession();
  const coordinator = new CommandCoordinator(noopLogger, 10);
  coordinator.setActiveSelection(selection, pentairEasyTouchPlugin);
  coordinator.attach(session);

  await session.emit("serial.port.status", {
    pool_id: "pool-1",
    stream_id: "stream-1",
    status: "connected",
    reported_at: "2026-03-30T00:00:00Z"
  });
  await session.emit("protocol.command.intent", commandIntent({ command_id: "command-timeout" }));

  await new Promise((resolve) => setTimeout(resolve, 25));

  const results = session.published
    .filter((entry) => entry.subject === "command.result.command-timeout")
    .map((entry) => entry.payload.status);
  assert.ok(results.includes("timed_out"));
});

test("command coordinator fails on transport error", async () => {
  const session = new FakeSession();
  const coordinator = new CommandCoordinator(noopLogger, 100);
  coordinator.setActiveSelection(selection, pentairEasyTouchPlugin);
  coordinator.attach(session);

  await session.emit("serial.port.status", {
    pool_id: "pool-1",
    stream_id: "stream-1",
    status: "connected",
    reported_at: "2026-03-30T00:00:00Z"
  });
  await session.emit("protocol.command.intent", commandIntent({ command_id: "command-fail" }));
  await session.emit("serial.tx.raw", {
    pool_id: "pool-1",
    stream_id: "stream-1",
    command_id: "command-fail",
    written_at: "2026-03-30T00:00:01Z",
    bytes_hex: "ff00ffa5",
    byte_count: 4,
    write_result: "stale_stream",
    error_code: "stale_stream",
    detail: "stream changed"
  });

  const results = session.published
    .filter((entry) => entry.subject === "command.result.command-fail")
    .map((entry) => entry.payload.status);
  assert.ok(results.includes("failed"));
});
