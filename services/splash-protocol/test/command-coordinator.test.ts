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

function circuitConfigurationFrame(circuitId: number): MessagePayload {
  return {
    pool_id: "pool-1",
    stream_id: "stream-1",
    frame_id: `frame-circuit-${circuitId}`,
    protocol_name: "pentair_easytouch",
    frame_family: "pentair",
    decoded_at: "2026-03-30T00:00:02Z",
    message_type: "circuit_configuration",
    action_code: "0x0b",
    source_address: "0x10",
    destination_address: "0x21",
    checksum_status: "valid",
    fields: {
      circuit_id: circuitId,
      function_id: 1,
      base_function_label: "Pool",
      name_id: circuitId,
      freeze_flag: false,
      high_flag: false
    },
    unknown_fields: []
  };
}

function controllerAckFrame(): MessagePayload {
  return {
    pool_id: "pool-1",
    stream_id: "stream-1",
    frame_id: "frame-controller-ack",
    protocol_name: "pentair_easytouch",
    frame_family: "pentair",
    decoded_at: "2026-03-30T00:00:02Z",
    message_type: "controller_ack",
    action_code: "0x01",
    source_address: "0x10",
    destination_address: "0x21",
    checksum_status: "valid",
    fields: {
      payload_hex: "",
      payload_length: 0
    },
    unknown_fields: []
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

  assert.equal(encoded.length, 1);
  assert.equal(writes.length, 1);
  assert.equal(results[0]?.payload.status, "accepted");
  assert.equal(results[1]?.payload.status, "encoded");

  await session.emit("serial.tx.raw", {
    pool_id: "pool-1",
    stream_id: "stream-1",
    command_id: "command-1",
    written_at: "2026-03-30T00:00:01Z",
    bytes_hex: writes[0]?.payload.bytes_hex,
    byte_count: writes[0]?.payload.byte_count,
    write_result: "ok",
    error_code: null,
    detail: null
  });

  await session.emit("protocol.frame.decoded", {
    pool_id: "pool-1",
    stream_id: "stream-1",
    frame_id: "frame-baseline",
    protocol_name: "pentair_easytouch",
    frame_family: "pentair",
    decoded_at: "2026-03-30T00:00:02Z",
    message_type: "pump_info",
    action_code: "0x18",
    source_address: "0x0f",
    destination_address: "0x10",
    checksum_status: "valid",
    fields: {
      pump_slot: 1,
      pump_type: 0x80,
      priming_time: 0,
      unknown_3: 0x02,
      unknown_4: 0x00,
      priming_speed: 1000,
      trailing_bytes: new Array(15).fill(0),
      slots: [
        { circuit_assignment: 0x06, rpm: 900 },
        { circuit_assignment: 0x0b, rpm: 1250 },
        { circuit_assignment: 0x0c, rpm: 3450 },
        { circuit_assignment: 0x0d, rpm: 2340 },
        { circuit_assignment: 0x80, rpm: 1900 },
        { circuit_assignment: 0x00, rpm: 0 },
        { circuit_assignment: 0x00, rpm: 0 },
        { circuit_assignment: 0x00, rpm: 0 }
      ]
    },
    unknown_fields: []
  });

  const writePhaseWrites = session.published.filter((entry) => entry.subject === "serial.write.request");
  assert.equal(writePhaseWrites.length, 2);

  await session.emit("serial.tx.raw", {
    pool_id: "pool-1",
    stream_id: "stream-1",
    command_id: "command-1",
    written_at: "2026-03-30T00:00:03Z",
    bytes_hex: writePhaseWrites[1]?.payload.bytes_hex,
    byte_count: writePhaseWrites[1]?.payload.byte_count,
    write_result: "ok",
    error_code: null,
    detail: null
  });

  const verifyPhaseWrites = session.published.filter((entry) => entry.subject === "serial.write.request");
  assert.equal(verifyPhaseWrites.length, 3);

  await session.emit("serial.tx.raw", {
    pool_id: "pool-1",
    stream_id: "stream-1",
    command_id: "command-1",
    written_at: "2026-03-30T00:00:04Z",
    bytes_hex: verifyPhaseWrites[2]?.payload.bytes_hex,
    byte_count: verifyPhaseWrites[2]?.payload.byte_count,
    write_result: "ok",
    error_code: null,
    detail: null
  });

  await session.emit("protocol.frame.decoded", {
    pool_id: "pool-1",
    stream_id: "stream-1",
    frame_id: "frame-verified",
    protocol_name: "pentair_easytouch",
    frame_family: "pentair",
    decoded_at: "2026-03-30T00:00:05Z",
    message_type: "pump_info",
    action_code: "0x18",
    source_address: "0x0f",
    destination_address: "0x10",
    checksum_status: "valid",
    fields: {
      pump_slot: 1,
      slots: [
        { circuit_assignment: 0x06, rpm: 900 },
        { circuit_assignment: 0x0b, rpm: 1250 },
        { circuit_assignment: 0x0c, rpm: 2800 },
        { circuit_assignment: 0x0d, rpm: 2340 },
        { circuit_assignment: 0x80, rpm: 1900 },
        { circuit_assignment: 0x00, rpm: 0 },
        { circuit_assignment: 0x00, rpm: 0 },
        { circuit_assignment: 0x00, rpm: 0 }
      ]
    },
    unknown_fields: []
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

test("command coordinator accepts live raw chunks as active stream evidence", async () => {
  const session = new FakeSession();
  const coordinator = new CommandCoordinator(noopLogger, 100);
  coordinator.setActiveSelection(selection, pentairEasyTouchPlugin);
  coordinator.attach(session);

  await session.emit("serial.rx.raw", {
    serial_instance_id: "serial-instance-1",
    stream_id: "stream-1",
    chunk_id: "chunk-1",
    port: "/dev/ttyUSB0",
    received_at: "2026-03-30T00:00:00Z",
    bytes_hex: "ff00ffa5",
    byte_count: 4
  });
  await session.emit("protocol.command.intent", commandIntent({ command_id: "command-from-rx" }));

  const results = session.published
    .filter((entry) => entry.subject === "command.result.command-from-rx")
    .map((entry) => entry.payload.status);
  const writes = session.published.filter((entry) => entry.subject === "serial.write.request");

  assert.ok(results.includes("accepted"));
  assert.ok(!results.includes("failed"));
  assert.equal(writes.length, 1);
});

test("command coordinator completes transport-ack diagnostic commands after write acknowledgement", async () => {
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
  await session.emit(
    "protocol.command.intent",
    commandIntent({
      command_id: "command-remote-layout",
      target: {
        equipment_type: "controller",
        bus_address: "0x10"
      },
      command_type: "request_remote_layout_page",
      arguments: {
        page_index: 5
      }
    })
  );

  const writes = session.published.filter((entry) => entry.subject === "serial.write.request");
  assert.equal(writes.length, 1);

  await session.emit("serial.tx.raw", {
    pool_id: "pool-1",
    stream_id: "stream-1",
    command_id: "command-remote-layout",
    written_at: "2026-03-30T00:00:01Z",
    bytes_hex: writes[0]?.payload.bytes_hex,
    byte_count: writes[0]?.payload.byte_count,
    write_result: "ok",
    error_code: null,
    detail: null
  });

  const results = session.published
    .filter((entry) => entry.subject === "command.result.command-remote-layout")
    .map((entry) => entry.payload.status);
  assert.ok(results.includes("transmitted"));
  assert.ok(results.includes("completed"));
});

test("command coordinator waits for controller ack before completing set_circuit_state", async () => {
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
  await session.emit(
    "protocol.command.intent",
    commandIntent({
      command_id: "command-circuit-toggle",
      target: {
        equipment_type: "circuit",
        circuit_key: "feature4"
      },
      command_type: "set_circuit_state",
      arguments: {
        circuit_id: 14,
        enabled: true
      }
    })
  );

  const writes = session.published.filter((entry) => entry.subject === "serial.write.request");
  assert.equal(writes.length, 1);

  await session.emit("serial.tx.raw", {
    pool_id: "pool-1",
    stream_id: "stream-1",
    command_id: "command-circuit-toggle",
    written_at: "2026-03-30T00:00:01Z",
    bytes_hex: writes[0]?.payload.bytes_hex,
    byte_count: writes[0]?.payload.byte_count,
    write_result: "ok",
    error_code: null,
    detail: null
  });

  let results = session.published
    .filter((entry) => entry.subject === "command.result.command-circuit-toggle")
    .map((entry) => entry.payload.status);
  assert.ok(results.includes("transmitted"));
  assert.ok(!results.includes("completed"));

  await session.emit("protocol.frame.decoded", controllerAckFrame());

  results = session.published
    .filter((entry) => entry.subject === "command.result.command-circuit-toggle")
    .map((entry) => entry.payload.status);
  assert.ok(results.includes("completed"));
});

test("command coordinator paces controller circuit config requests by decoded replies", async () => {
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
  await session.emit(
    "protocol.command.intent",
    commandIntent({
      command_id: "command-circuit-config",
      target: {
        equipment_type: "controller",
        bus_address: "0x10"
      },
      command_type: "request_circuit_config",
      arguments: {
        start_index: 1,
        end_index: 3
      }
    })
  );

  const encoded = session.published.filter((entry) => entry.subject === "protocol.command.encoded");
  let writes = session.published.filter((entry) => entry.subject === "serial.write.request");
  assert.equal(encoded.length, 3);
  assert.equal(writes.length, 1);

  await session.emit("serial.tx.raw", {
    pool_id: "pool-1",
    stream_id: "stream-1",
    command_id: "command-circuit-config",
    written_at: "2026-03-30T00:00:01Z",
    bytes_hex: writes[0]?.payload.bytes_hex,
    byte_count: writes[0]?.payload.byte_count,
    write_result: "ok",
    error_code: null,
    detail: null
  });

  writes = session.published.filter((entry) => entry.subject === "serial.write.request");
  assert.equal(writes.length, 1);

  await session.emit("protocol.frame.decoded", circuitConfigurationFrame(1));
  writes = session.published.filter((entry) => entry.subject === "serial.write.request");
  assert.equal(writes.length, 2);

  await session.emit("serial.tx.raw", {
    pool_id: "pool-1",
    stream_id: "stream-1",
    command_id: "command-circuit-config",
    written_at: "2026-03-30T00:00:02Z",
    bytes_hex: writes[1]?.payload.bytes_hex,
    byte_count: writes[1]?.payload.byte_count,
    write_result: "ok",
    error_code: null,
    detail: null
  });
  await session.emit("protocol.frame.decoded", circuitConfigurationFrame(2));

  writes = session.published.filter((entry) => entry.subject === "serial.write.request");
  assert.equal(writes.length, 3);

  await session.emit("serial.tx.raw", {
    pool_id: "pool-1",
    stream_id: "stream-1",
    command_id: "command-circuit-config",
    written_at: "2026-03-30T00:00:03Z",
    bytes_hex: writes[2]?.payload.bytes_hex,
    byte_count: writes[2]?.payload.byte_count,
    write_result: "ok",
    error_code: null,
    detail: null
  });
  await session.emit("protocol.frame.decoded", circuitConfigurationFrame(3));

  const results = session.published
    .filter((entry) => entry.subject === "command.result.command-circuit-config")
    .map((entry) => entry.payload.status);
  assert.ok(results.includes("completed"));
});

test("command coordinator completes manual raw frame commands after write acknowledgement", async () => {
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
  await session.emit(
    "protocol.command.intent",
    commandIntent({
      command_id: "command-raw-frame",
      command_type: "send_raw_frame",
      arguments: {
        bytes_hex: "ff00ffa5011022e1010001ba"
      }
    })
  );

  const writes = session.published.filter((entry) => entry.subject === "serial.write.request");
  assert.equal(writes.length, 1);

  await session.emit("serial.tx.raw", {
    pool_id: "pool-1",
    stream_id: "stream-1",
    command_id: "command-raw-frame",
    written_at: "2026-03-30T00:00:01Z",
    bytes_hex: writes[0]?.payload.bytes_hex,
    byte_count: writes[0]?.payload.byte_count,
    write_result: "ok",
    error_code: null,
    detail: null
  });

  const results = session.published
    .filter((entry) => entry.subject === "command.result.command-raw-frame")
    .map((entry) => entry.payload.status);
  assert.ok(results.includes("transmitted"));
  assert.ok(results.includes("completed"));
});
