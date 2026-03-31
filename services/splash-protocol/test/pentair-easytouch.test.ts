import test from "node:test";
import assert from "node:assert/strict";
import { ProtocolCommandError } from "../src/commands/types.js";
import { ProtocolDecodeError } from "../src/protocol/types.js";
import { decodePentairFrame, pentairEasyTouchPlugin } from "../src/plugins/pentair-easytouch.js";

function buildPentairFrame(actionCode: number, payload: number[]): Uint8Array {
  return buildPentairFrameWithAddresses(0x0f, 0x10, actionCode, payload);
}

function buildPentairFrameWithAddresses(
  destination: number,
  source: number,
  actionCode: number,
  payload: number[]
): Uint8Array {
  const frame = [
    0xff,
    0x00,
    0xff,
    0xa5,
    0x01,
    destination,
    source,
    actionCode,
    payload.length,
    ...payload
  ];

  const checksum = frame.slice(3).reduce((sum, byte) => (sum + byte) & 0xffff, 0);
  frame.push((checksum >> 8) & 0xff, checksum & 0xff);
  return Uint8Array.from(frame);
}

test("decodePentairFrame validates checksum and decodes controller status identity", () => {
  const frame = buildPentairFrame(0x02, [
    0x15, 0x37, 0x20, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x08,
    0x03, 0x00, 0x40, 0x00, 0x3f, 0x00, 0x01, 0x02, 0x49, 0x20,
    0x00, 0x00, 0x06
  ]);
  const decoded = decodePentairFrame(frame);

  assert.equal(decoded.protocolName, "pentair_easytouch");
  assert.equal(decoded.messageType, "controller_status");
  assert.equal(decoded.actionCode, "0x02");
  assert.equal(decoded.sourceAddress, "0x10");
  assert.equal(decoded.destinationAddress, "0x0f");
  assert.equal(decoded.checksumStatus, "valid");
  assert.deepEqual(decoded.fields, {
    payload_hex: "15372000000000000008030040003f0001024920000006",
    payload_length: 23,
    hour_24: 0x15,
    minute: 0x37,
    water_temp_f: 0x3f,
    air_temp_f: 0x49,
    solar_temp_f: 0x20,
    circuits_byte: 0x20,
    circuits_byte_2: 0x00,
    circuits_byte_3: 0x00,
    controller_mode_byte: 0x08,
    service_mode: false,
    celsius_mode: false,
    freeze_protection_active: true,
    timeout_mode: false,
    valve_state_byte: 0x03,
    delay_byte: 0x40,
    delay_active: true,
    firmware_major: 0x01,
    firmware_minor: 0x02,
    heat_setting_byte: 0x06,
    pool_heat_mode: "solar_preferred",
    spa_heat_mode: "heater",
    active_circuit_keys: ["pool"],
    mode: "pool",
    circuits: {
      pool: true,
      spa: false,
      aux1: false,
      aux2: false,
      aux3: false,
      pool_low: false,
      pool_high: false,
      cleaner: false,
      feature4: false,
      feature5: false,
      feature6: false,
      feature7: false,
      feature8: false,
      aux_extra: false
    }
  });
});

test("decodePentairFrame classifies pump and chlorinator action codes", () => {
  const pump = decodePentairFrame(buildPentairFrame(0x07, [0x01, 0x02]));
  const chlorinator = decodePentairFrame(buildPentairFrame(0x19, [0x10, 0x20]));

  assert.equal(pump.messageType, "pump_status");
  assert.equal(chlorinator.messageType, "chlorinator_status");
});

test("decodePentairFrame rejects invalid checksum", () => {
  const frame = buildPentairFrame(0x02, [0x01, 0x02, 0x03]);
  frame[frame.length - 1] ^= 0xff;

  assert.throws(() => decodePentairFrame(frame), (error: unknown) => {
    assert.ok(error instanceof ProtocolDecodeError);
    assert.equal(error.errorCode, "checksum_invalid");
    return true;
  });
});

test("decodePentairFrame emits partial normalized events for trusted message families", () => {
  const controller = decodePentairFrame(buildPentairFrame(0x02, [
    0x15, 0x37, 0x22, 0x14, 0x00, 0x00, 0x00, 0x00, 0x00, 0x08,
    0x30, 0x00, 0x40, 0x00, 0x3f, 0x20, 0x01, 0x02, 0x49, 0x20,
    0x00, 0x00, 0x06
  ]), {
    frameId: "frame-1",
    occurredAt: "2026-03-30T00:00:00Z"
  });
  const pump = decodePentairFrame(
    buildPentairFrameWithAddresses(0x10, 0x60, 0x07, [0x0a, 0x00, 0x02, 0x01, 0x60, 0x08, 0xfc, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x0d, 0x0e]),
    {
      frameId: "frame-2",
      occurredAt: "2026-03-30T00:00:01Z"
    }
  );
  const chlorinator = decodePentairFrame(buildPentairFrame(0x19, [0x0c, 0x1c, 40, 0x00]), {
    frameId: "frame-2",
    occurredAt: "2026-03-30T00:00:02Z"
  });

  assert.equal(controller.normalizedEvents?.[0].subject, "equipment.state.controller");
  assert.equal(controller.normalizedEvents?.[0].payload.water_temp_f, 63);
  assert.equal(controller.normalizedEvents?.[0].payload.air_temp_f, 73);
  assert.equal(controller.normalizedEvents?.[0].payload.solar_temp_f, 32);
  assert.equal(controller.normalizedEvents?.[0].payload.freeze_protection, true);
  const controllerHeater = controller.normalizedEvents?.[0].payload.heater as Record<string, unknown>;
  assert.equal(controllerHeater.enabled, true);
  assert.equal(controller.normalizedEvents?.[0].payload.mode, "pool");
  assert.deepEqual(controller.normalizedEvents?.[0].payload.active_circuit_keys, ["pool", "aux1", "pool_low", "cleaner"]);
  assert.deepEqual(controller.normalizedEvents?.[0].payload.circuits, {
    pool: true,
    spa: false,
    aux1: true,
    aux2: false,
    aux3: false,
    pool_low: true,
    pool_high: false,
    cleaner: true,
    feature4: false,
    feature5: false,
    feature6: false,
    feature7: false,
    feature8: false,
    aux_extra: false
  });

  assert.equal(pump.normalizedEvents?.[0].subject, "equipment.state.pump");
  assert.equal(pump.normalizedEvents?.[0].payload.rpm, 2300);
  assert.equal(pump.normalizedEvents?.[0].payload.watts, 352);
  assert.equal(pump.normalizedEvents?.[0].payload.bus_address, "0x60");

  assert.equal(chlorinator.normalizedEvents?.[0].subject, "equipment.state.chlorinator");
  assert.equal(chlorinator.normalizedEvents?.[0].payload.salt_ppm, 3100);
  assert.equal(chlorinator.normalizedEvents?.[0].payload.output_percent, 40);
});

test("decodePentairFrame does not emit normalized pump state for controller poll frames", () => {
  const poll = decodePentairFrame(buildPentairFrameWithAddresses(0x60, 0x10, 0x07, []), {
    frameId: "frame-poll",
    occurredAt: "2026-03-30T00:00:03Z"
  });

  assert.equal(poll.messageType, "pump_status");
  assert.deepEqual(poll.normalizedEvents, []);
});

test("decodePentairFrame derives controller mode hints from trusted circuit bits", () => {
  const spa = decodePentairFrame(buildPentairFrame(0x02, [70, 65, 0x01, 0x00, 0x00]));
  const poolSpa = decodePentairFrame(buildPentairFrame(0x02, [70, 65, 0x21, 0x00, 0x00]));
  const auxOnly = decodePentairFrame(buildPentairFrame(0x02, [70, 65, 0x08, 0x00, 0x00]));
  const featureOnly = decodePentairFrame(buildPentairFrame(0x02, [70, 65, 0x00, 0x04, 0x00]));

  assert.equal(spa.fields.mode, "spa");
  assert.deepEqual(spa.fields.active_circuit_keys, ["spa"]);
  assert.equal(poolSpa.fields.mode, "pool_spa");
  assert.deepEqual(poolSpa.fields.active_circuit_keys, ["pool", "spa"]);
  assert.equal(auxOnly.fields.mode, "aux_only");
  assert.deepEqual(auxOnly.fields.active_circuit_keys, ["aux3"]);
  assert.equal(featureOnly.fields.mode, "aux_only");
  assert.deepEqual(featureOnly.fields.active_circuit_keys, ["pool_low"]);
});

test("decodePentairFrame decodes live 0x02 pool-only and pool-plus-0x08 circuit bytes", () => {
  const poolOnly = decodePentairFrame(
    buildPentairFrame(0x02, [
      0x15, 0x21, 0x20, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x04,
      0x00, 0x00, 0x00, 0x80, 0x3f, 0x3f, 0x00, 0x00, 0x3e, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0xab, 0xbb, 0x03, 0x0d
    ])
  );
  const poolPlus08 = decodePentairFrame(
    buildPentairFrame(0x02, [
      0x15, 0x23, 0x28, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x0c,
      0x00, 0x00, 0x00, 0x80, 0x3f, 0x3f, 0x00, 0x00, 0x3e, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0xab, 0xbb, 0x03, 0x0d
    ])
  );

  assert.deepEqual(poolOnly.fields.active_circuit_keys, ["pool"]);
  assert.equal(poolOnly.fields.circuits_byte, 0x20);
  assert.deepEqual(poolPlus08.fields.active_circuit_keys, ["pool", "aux3"]);
  assert.equal(poolPlus08.fields.circuits_byte, 0x28);
});

test("decodePentairFrame decodes validated multi-byte named circuit bitmasks", () => {
  const decoded = decodePentairFrame(
    buildPentairFrame(0x02, [
      0x16, 0x23, 0x20, 0xfc, 0x0b, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x80, 0x3f, 0x3f, 0x00, 0x00, 0x3c, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x80, 0x9d, 0x03, 0x0d
    ])
  );

  assert.equal(decoded.fields.circuits_byte, 0x20);
  assert.equal(decoded.fields.circuits_byte_2, 0xfc);
  assert.equal(decoded.fields.circuits_byte_3, 0x0b);
  assert.deepEqual(decoded.fields.active_circuit_keys, [
    "pool",
    "pool_low",
    "pool_high",
    "cleaner",
    "feature4",
    "feature5",
    "feature6",
    "feature7",
    "feature8",
    "aux_extra"
  ]);
  assert.deepEqual(decoded.fields.circuits, {
    pool: true,
    spa: false,
    aux1: false,
    aux2: false,
    aux3: false,
    pool_low: true,
    pool_high: true,
    cleaner: true,
    feature4: true,
    feature5: true,
    feature6: true,
    feature7: true,
    feature8: true,
    aux_extra: true
  });
});

test("decodePentairFrame classifies observed 0x9b traffic as controller remote interaction", () => {
  const payload = [
    0x01, 0x80, 0x00, 0x02, 0x00, 0x06, 0x03, 0x0b, 0x04, 0x0c, 0x0d, 0x0d,
    0x09, 0x80, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03, 0x84, 0xe2,
    0x7a, 0x24, 0x6c, 0x00, 0x00, 0x00, 0xe8, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
  ];
  const decoded = decodePentairFrame(buildPentairFrameWithAddresses(0x10, 0x21, 0x9b, payload));

  assert.equal(decoded.messageType, "controller_remote_interaction");
  assert.equal(decoded.fields.payload_length, 46);
  assert.equal(decoded.fields.source_role, "remote");
  assert.equal(decoded.fields.destination_role, "controller");
  assert.equal(decoded.fields.source_is_remote, true);
  assert.equal(decoded.fields.destination_is_controller, true);
});

test("decodePentairFrame classifies intellichlor framed traffic generically", () => {
  const decoded = decodePentairFrame(Uint8Array.from([0x10, 0x02, 0x50, 0x11, 0x1e, 0x91, 0x10, 0x03]));

  assert.equal(decoded.frameFamily, "intellichlor");
  assert.equal(decoded.messageType, "intellichlor_frame");
  assert.equal(decoded.actionCode, "0x11");
  assert.equal(decoded.sourceAddress, "unknown");
  assert.equal(decoded.destinationAddress, "0x50");
  assert.equal(decoded.checksumStatus, "unknown");
  assert.deepEqual(decoded.fields, {
    payload_hex: "1e",
    payload_length: 1,
    checksum_byte: 0x91
  });
  assert.deepEqual(decoded.normalizedEvents, []);
});

test("pentairEasyTouchPlugin encodes the initial direct pump set_speed sequence", () => {
  const encoded = pentairEasyTouchPlugin.encodeCommand(
    {
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
      dry_run: false
    },
    {}
  );

  assert.equal(encoded.writes.length, 3);
  assert.equal(encoded.writes[0].bytesHex, "ff00ffa50060210401ff022a");
  assert.equal(encoded.writes[1].bytesHex, "ff00ffa5006021010403270af0024f");
  assert.equal(encoded.writes[2].bytesHex, "ff00ffa5006021040100012b");
  assert.equal(encoded.writes[1].busRequirements.requires_idle_ms, 50);
  assert.equal(encoded.correlation?.kind, "pump_rpm");
  assert.equal(encoded.correlation?.targetRpm, 2800);
});

test("pentairEasyTouchPlugin encodes a manual Remote Layout page request", () => {
  const encoded = pentairEasyTouchPlugin.encodeCommand(
    {
      pool_id: "pool-1",
      command_id: "command-remote-layout",
      requested_at: "2026-03-30T00:00:00Z",
      protocol_name: "pentair_easytouch",
      target: {
        equipment_type: "controller",
        bus_address: "0x10"
      },
      command_type: "request_remote_layout_page",
      arguments: {
        page_index: 5
      },
      dry_run: false
    },
    {}
  );

  assert.equal(encoded.writes.length, 1);
  assert.equal(encoded.writes[0].bytesHex, "ff00ffa5011021e1010501be");
  assert.equal(encoded.correlation?.kind, "transport_ack");
});

test("pentairEasyTouchPlugin encodes a manual raw frame send without rewriting bytes", () => {
  const encoded = pentairEasyTouchPlugin.encodeCommand(
    {
      pool_id: "pool-1",
      command_id: "command-raw-frame",
      requested_at: "2026-03-30T00:00:00Z",
      protocol_name: "pentair_easytouch",
      target: {},
      command_type: "send_raw_frame",
      arguments: {
        bytes_hex: "ff00ffa5011022e1010001ba"
      },
      dry_run: false
    },
    {}
  );

  assert.equal(encoded.writes.length, 1);
  assert.equal(encoded.writes[0].bytesHex, "ff00ffa5011022e1010001ba");
  assert.equal(encoded.correlation?.kind, "transport_ack");
});

test("pentairEasyTouchPlugin rejects malformed manual raw frame hex", () => {
  assert.throws(
    () =>
      pentairEasyTouchPlugin.encodeCommand(
        {
          pool_id: "pool-1",
          command_id: "command-raw-frame",
          requested_at: "2026-03-30T00:00:00Z",
          protocol_name: "pentair_easytouch",
          target: {},
          command_type: "send_raw_frame",
          arguments: {
            bytes_hex: "FF"
          },
          dry_run: false
        },
        {}
      ),
    (error: unknown) => {
      assert.ok(error instanceof ProtocolCommandError);
      assert.equal(error.errorCode, "invalid_raw_bytes_hex");
      return true;
    }
  );
});

test("pentairEasyTouchPlugin rejects unsupported initial command targets", () => {
  assert.throws(
    () =>
      pentairEasyTouchPlugin.encodeCommand(
        {
          pool_id: "pool-1",
          command_id: "command-1",
          requested_at: "2026-03-30T00:00:00Z",
          protocol_name: "pentair_easytouch",
          target: {
            equipment_type: "pump",
            bus_address: "0x10"
          },
          command_type: "set_speed",
          arguments: {
            rpm: 2800
          },
          dry_run: false
        },
        {}
      ),
    (error: unknown) => {
      assert.ok(error instanceof ProtocolCommandError);
      assert.equal(error.errorCode, "command_target_invalid");
      return true;
    }
  );
});
