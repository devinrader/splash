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
  return buildPentairFrameWithProtocol(0x01, destination, source, actionCode, payload);
}

function buildPentairFrameWithProtocol(
  protocolByte: number,
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
    protocolByte,
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
    controller_mode_label: "freeze protection",
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
    controller_sub_model_byte: null,
    controller_model_byte: null,
    controller_model_family: null,
    controller_model_label: null,
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
  const controllerAck = decodePentairFrame(buildPentairFrame(0x01, []));
  const pump = decodePentairFrame(buildPentairFrame(0x07, [0x01, 0x02]));
  const chlorinator = decodePentairFrame(buildPentairFrame(0x19, [0x10, 0x20]));
  const controllerDatetime = decodePentairFrame(buildPentairFrame(0x05, [0x12, 0x34, 0x10, 0x17, 0x04, 0x1a, 0x00, 0x00]));

  assert.equal(controllerAck.messageType, "controller_ack");
  assert.equal(pump.messageType, "pump_status");
  assert.equal(chlorinator.messageType, "chlorinator_status");
  assert.equal(controllerDatetime.messageType, "controller_datetime");
  assert.deepEqual(controllerDatetime.fields, {
    payload_hex: "12341017041a0000",
    payload_length: 8,
    hour_24: 18,
    minute: 52,
    day_of_week: 16,
    day: 23,
    month: 4,
    year: 26,
    unknown_byte_6: 0,
    daylight_savings_auto: false
  });
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

test("decodePentairFrame rejects invalid pentair protocol bytes", () => {
  const frame = Uint8Array.from([
    0xff, 0x00, 0xff, 0xa5,
    0x35,
    0x0f, 0x10, 0x02, 0x01,
    0x00,
    0x00, 0x5b
  ]);

  assert.throws(() => decodePentairFrame(frame), (error: unknown) => {
    assert.ok(error instanceof ProtocolDecodeError);
    assert.equal(error.errorCode, "protocol_byte_invalid");
    return true;
  });
});

test("decodePentairFrame accepts controller-family protocol byte 0x34 for live controller status", () => {
  const frame = buildPentairFrameWithProtocol(0x34, 0x0f, 0x10, 0x02, [
    0x15, 0x2f, 0x00, 0x04, 0x00, 0x00, 0x00, 0x00,
    0x08, 0x00, 0x00, 0x80, 0x4a, 0x4a, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x5f, 0x4e, 0x03, 0x0d,
    0x03, 0x38, 0x00, 0x00, 0x00
  ]);

  const decoded = decodePentairFrame(frame);

  assert.equal(decoded.messageType, "controller_status");
  assert.equal(decoded.actionCode, "0x02");
  assert.equal(decoded.checksumStatus, "valid");
  assert.equal(decoded.fields.payload_length, 29);
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
  assert.equal(controller.normalizedEvents?.[0].payload.controller_hour_24, 0x15);
  assert.equal(controller.normalizedEvents?.[0].payload.controller_minute, 0x37);
  assert.equal(controller.normalizedEvents?.[0].payload.water_temp_f, 63);
  assert.equal(controller.normalizedEvents?.[0].payload.air_temp_f, 73);
  assert.equal(controller.normalizedEvents?.[0].payload.solar_temp_f, 32);
  assert.equal(controller.normalizedEvents?.[0].payload.controller_mode_byte, 0x08);
  assert.equal(controller.normalizedEvents?.[0].payload.controller_mode_label, "freeze protection");
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
  assert.equal(controller.normalizedEvents?.[1]?.subject, "telemetry.temperature.easytouch");
  assert.deepEqual(controller.normalizedEvents?.[1]?.payload.temperatures, {
    pool_water: {
      value: 63,
      unit: "F",
      original_value: 63,
      original_unit: "F",
      normalized_f: 63,
      normalized_c: 17.2,
      raw_byte: 63
    },
    air: {
      value: 73,
      unit: "F",
      original_value: 73,
      original_unit: "F",
      normalized_f: 73,
      normalized_c: 22.8,
      raw_byte: 73
    },
    solar: {
      value: 32,
      unit: "F",
      original_value: 32,
      original_unit: "F",
      normalized_f: 32,
      normalized_c: 0,
      raw_byte: 32
    }
  });

  assert.equal(pump.normalizedEvents?.[0].subject, "equipment.state.pump");
  assert.equal(pump.normalizedEvents?.[0].payload.rpm, 2300);
  assert.equal(pump.normalizedEvents?.[0].payload.watts, 352);
  assert.equal(pump.normalizedEvents?.[0].payload.bus_address, "0x60");

  assert.equal(chlorinator.normalizedEvents?.[0].subject, "equipment.state.chlorinator");
  assert.equal(chlorinator.normalizedEvents?.[0].payload.salt_ppm, 3100);
  assert.equal(chlorinator.normalizedEvents?.[0].payload.output_percent, 40);
});

test("decodePentairFrame normalizes controller temperatures from celsius-mode action 0x02 frames", () => {
  const controller = decodePentairFrame(buildPentairFrame(0x02, [
    0x07, 0x15, 0x20, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x04,
    0x00, 0x00, 0x00, 0x00, 28, 0x00, 0x01, 0x02, 24, 35,
    0x00, 0x00, 0x06
  ]), {
    frameId: "frame-celsius",
    occurredAt: "2026-05-12T12:00:00Z"
  });

  assert.equal(controller.normalizedEvents?.[0]?.payload.water_temp_f, 82.4);
  assert.equal(controller.normalizedEvents?.[0]?.payload.air_temp_f, 75.2);
  assert.equal(controller.normalizedEvents?.[0]?.payload.solar_temp_f, 95);
  assert.deepEqual(controller.normalizedEvents?.[1]?.payload.temperatures, {
    pool_water: {
      value: 28,
      unit: "C",
      original_value: 28,
      original_unit: "C",
      normalized_f: 82.4,
      normalized_c: 28,
      raw_byte: 28
    },
    air: {
      value: 24,
      unit: "C",
      original_value: 24,
      original_unit: "C",
      normalized_f: 75.2,
      normalized_c: 24,
      raw_byte: 24
    },
    solar: {
      value: 35,
      unit: "C",
      original_value: 35,
      original_unit: "C",
      normalized_f: 95,
      normalized_c: 35,
      raw_byte: 35
    }
  });
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

test("decodePentairFrame derives diagnostic controller mode labels from payload byte 9", () => {
  const idle = decodePentairFrame(buildPentairFrame(0x02, [70, 65, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]));
  const runFreeze = decodePentairFrame(buildPentairFrame(0x02, [70, 65, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x09]));
  const timeoutCelsius = decodePentairFrame(buildPentairFrame(0x02, [70, 65, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x84]));

  assert.equal(idle.fields.controller_mode_label, "idle");
  assert.equal(runFreeze.fields.controller_mode_label, "run + freeze protection");
  assert.equal(timeoutCelsius.fields.controller_mode_label, "timeout + celsius");
});

test("decodePentairFrame decodes circuit configuration replies", () => {
  const decoded = decodePentairFrame(buildPentairFrame(0x0b, [0x0a, 0x00, 0x00, 0x00, 0x00]));

  assert.equal(decoded.messageType, "circuit_configuration");
  assert.equal(decoded.fields.circuit_id, 0x0a);
  assert.equal(decoded.fields.function_id, 0x00);
  assert.equal(decoded.fields.base_function_id, 0);
  assert.equal(decoded.fields.base_function_label, "Generic");
  assert.equal(decoded.fields.freeze_flag, false);
  assert.equal(decoded.fields.high_flag, false);
  assert.equal(decoded.fields.name_id, 0x00);
  assert.equal(decoded.fields.name_label, "NOT USED");
});

test("decodePentairFrame decodes custom name bank payloads", () => {
  const decoded = decodePentairFrame(
    buildPentairFrame(0x0a, [0x02, 0x53, 0x50, 0x41, 0x20, 0x4d, 0x4f, 0x44, 0x45, 0x20, 0x32])
  );

  assert.equal(decoded.messageType, "custom_name");
  assert.equal(decoded.fields.name_index, 0x02);
  assert.deepEqual(decoded.fields.custom_name_bytes, [0x53, 0x50, 0x41, 0x20, 0x4d, 0x4f, 0x44, 0x45, 0x20, 0x32]);
  assert.equal(decoded.fields.custom_name_text, "SPA MODE 2");
});

test("decodePentairFrame decodes controller software version broadcasts", () => {
  const decoded = decodePentairFrame(buildPentairFrame(0xfc, [0x00, 0x01, 0x22, 0x00, 0x00, 0x03, 0x15]));

  assert.equal(decoded.messageType, "controller_software_version");
  assert.equal(decoded.fields.controller_firmware_major, 0x01);
  assert.equal(decoded.fields.controller_firmware_minor, 0x22);
  assert.equal(decoded.fields.bootloader_major, 0x03);
  assert.equal(decoded.fields.bootloader_minor, 0x15);
});

test("decodePentairFrame derives controller family identity from status bytes 27 and 28", () => {
  const decoded = decodePentairFrame(
    buildPentairFrame(0x02, [
      0x15, 0x21, 0x20, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x04,
      0x00, 0x00, 0x00, 0x80, 0x3f, 0x3f, 0x02, 0x46, 0x3e, 0x00,
      0x00, 0x00, 0x00, 0x10, 0x00, 0xab, 0xbb, 0x17, 0x03
    ]),
    {
      frameId: "frame-identity-1",
      occurredAt: "2026-03-30T00:00:00Z"
    }
  );

  assert.equal(decoded.fields.controller_sub_model_byte, 0x17);
  assert.equal(decoded.fields.controller_model_byte, 0x03);
  assert.equal(decoded.fields.controller_model_family, "intellicenter");
  assert.equal(decoded.fields.controller_model_label, "IntelliCenter");
  assert.deepEqual(decoded.normalizedEvents, [
    {
      subject: "equipment.state.controller",
      payload: {
        event_id: null,
        occurred_at: "2026-03-30T00:00:00Z",
        source: {
          service: "splash-protocol",
          protocol_name: "pentair_easytouch",
          frame_id: "frame-identity-1"
        },
        controller_hour_24: 0x15,
        controller_minute: 0x21,
        water_temp_f: 145.4,
        air_temp_f: 143.6,
        solar_temp_f: 32,
        controller_mode_byte: 0x04,
        controller_mode_label: "celsius",
        controller_sub_model_byte: 0x17,
        controller_model_byte: 0x03,
        controller_model_family: "intellicenter",
        controller_model_label: "IntelliCenter",
        heater: {
          enabled: false
        },
        freeze_protection: false,
        mode: "pool",
        active_circuit_keys: ["pool"],
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
      }
    },
    {
      subject: "telemetry.temperature.easytouch",
      payload: {
        occurred_at: "2026-03-30T00:00:00Z",
        source: {
          service: "splash-protocol",
          protocol_name: "pentair_easytouch",
          frame_id: "frame-identity-1",
          action: 0x02,
          label: "easytouch.action2"
        },
        controller: {
          controller_id: "default",
          controller_type: "easytouch",
          timestamp: {
            hour_24: 0x15,
            minute: 0x21
          }
        },
        temperatures: {
          pool_water: {
            value: 0x3f,
            unit: "C",
            original_value: 0x3f,
            original_unit: "C",
            normalized_f: 145.4,
            normalized_c: 63,
            raw_byte: 0x3f
          },
          air: {
            value: 0x3e,
            unit: "C",
            original_value: 0x3e,
            original_unit: "C",
            normalized_f: 143.6,
            normalized_c: 62,
            raw_byte: 0x3e
          },
          solar: {
            value: 0x00,
            unit: "C",
            original_value: 0x00,
            original_unit: "C",
            normalized_f: 32,
            normalized_c: 0,
            raw_byte: 0x00
          }
        },
        raw_payload: [
          0x15, 0x21, 0x20, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x04,
          0x00, 0x00, 0x00, 0x80, 0x3f, 0x3f, 0x02, 0x46, 0x3e, 0x00,
          0x00, 0x00, 0x00, 0x10, 0x00, 0xab, 0xbb, 0x17, 0x03
        ]
      }
    }
  ]);
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
  assert.equal(decoded.fields.pump_id, 1);
  assert.equal(decoded.fields.pump_type, 0x80);
  assert.equal(decoded.fields.priming_time, 0x00);
  assert.equal(decoded.fields.priming_speed, 0x03e8);
  assert.deepEqual(decoded.fields.slots, [
    { slot: 1, circuit_assignment: 0x06, speed_high: 0x03, speed_low: 0x84, rpm: 900 },
    { slot: 2, circuit_assignment: 0x0b, speed_high: 0x04, speed_low: 0xe2, rpm: 1250 },
    { slot: 3, circuit_assignment: 0x0c, speed_high: 0x0d, speed_low: 0x7a, rpm: 3450 },
    { slot: 4, circuit_assignment: 0x0d, speed_high: 0x09, speed_low: 0x24, rpm: 2340 },
    { slot: 5, circuit_assignment: 0x80, speed_high: 0x07, speed_low: 0x6c, rpm: 1900 },
    { slot: 6, circuit_assignment: 0x00, speed_high: 0x00, speed_low: 0x00, rpm: 0 },
    { slot: 7, circuit_assignment: 0x00, speed_high: 0x00, speed_low: 0x00, rpm: 0 },
    { slot: 8, circuit_assignment: 0x00, speed_high: 0x00, speed_low: 0x00, rpm: 0 }
  ]);
});

test("decodePentairFrame decodes observed 0x18 pump info for EasyTouch Pump #1", () => {
  const payload = [
    0x01, 0x80, 0x00, 0x02, 0x00, 0x0d, 0x04, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01,
    0x1a, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xc2
  ];
  const decoded = decodePentairFrame(buildPentairFrameWithAddresses(0x10, 0x0f, 0x18, payload));

  assert.equal(decoded.messageType, "pump_info");
  assert.equal(decoded.fields.pump_slot, 1);
  assert.equal(decoded.fields.pump_type, 0x80);
  assert.equal(decoded.fields.likely_assigned_circuit, 2);
  assert.equal(decoded.fields.slot_1_rpm_high, 4);
  assert.equal(decoded.fields.slot_1_rpm_low, 0x1a);
  assert.equal(decoded.fields.slot_1_rpm, 1050);
  assert.equal(decoded.fields.trailing_config_byte, 0xc2);
});

test("decodePentairFrame decodes observed 0x18 pump info for EasyTouch Pump #2", () => {
  const payload = [
    0x02, 0x00, 0x0a, 0x02, 0x00, 0x00, 0x1e, 0x00, 0x1e, 0x00, 0x1e,
    0x00, 0x1e, 0x00, 0x1e, 0x00, 0x1e, 0x00, 0x1e, 0x00, 0x1e, 0x00,
    0x1e, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
  ];
  const decoded = decodePentairFrame(buildPentairFrameWithAddresses(0x10, 0x0f, 0x18, payload));

  assert.equal(decoded.messageType, "pump_info");
  assert.equal(decoded.fields.pump_slot, 2);
  assert.equal(decoded.fields.pump_type, 0x00);
  assert.equal(decoded.fields.slot_1_rpm_high, 0x1e);
  assert.equal(decoded.fields.slot_1_rpm_low, 0x1e);
  assert.equal(decoded.fields.slot_1_rpm, 7710);
  assert.equal(decoded.fields.trailing_config_byte, 0x00);
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

test("decodePentairFrame classifies EasyTouch action 17 as a schedule frame", () => {
  const payload = [0x01, 0x06, 0x08, 0x00, 0x11, 0x00, 0x7f];
  const decoded = decodePentairFrame(buildPentairFrameWithAddresses(0x10, 0x21, 0x11, payload));

  assert.equal(decoded.messageType, "controller_schedule");
  assert.equal(decoded.actionCode, "0x11");
  assert.deepEqual(decoded.fields, {
    controller_family: "EasyTouch",
    frame_type: "easytouch_schedule",
    action: 17,
    schedule_id: 1,
    circuit_id: 6,
    active: true,
    schedule_type: 0,
    schedule_type_label: "repeat",
    start_time_minutes: 480,
    end_time_minutes: 1020,
    schedule_days: 127,
    raw_payload: [1, 6, 8, 0, 17, 0, 127],
    payload_hex: "0106080011007f",
    payload_length: 7
    ,
    parse_confidence: "high",
    warnings: []
  });
  assert.deepEqual(decoded.normalizedEvents, []);
});

test("decodePentairFrame classifies EasyTouch action 145 as a schedule frame", () => {
  const payload = [0x02, 0x06, 0x09, 0x1e, 0x11, 0x2d, 0x3e];
  const decoded = decodePentairFrame(buildPentairFrameWithAddresses(0x10, 0x21, 0x91, payload));

  assert.equal(decoded.messageType, "controller_schedule");
  assert.equal(decoded.actionCode, "0x91");
  assert.equal(decoded.fields.action, 145);
  assert.equal(decoded.fields.frame_type, "easytouch_schedule");
});

test("decodePentairFrame does not classify EasyTouch action 30 as a schedule frame", () => {
  const decoded = decodePentairFrame(buildPentairFrameWithAddresses(0x10, 0x21, 0x1e, [0x03, 0x01, 0x02]));

  assert.notEqual(decoded.messageType, "controller_schedule");
});

test("decodePentairFrame returns an invalid parse result for short EasyTouch schedule payloads", () => {
  const decoded = decodePentairFrame(buildPentairFrameWithAddresses(0x10, 0x21, 0x11, [0x01, 0x06, 0x08]));

  assert.equal(decoded.messageType, "controller_schedule");
  assert.deepEqual(decoded.fields, {
    controller_family: "EasyTouch",
    frame_type: "easytouch_schedule",
    action: 17,
    raw_payload: [1, 6, 8],
    payload_hex: "010608",
    payload_length: 3,
    parse_confidence: "invalid",
    warnings: ["EasyTouch schedule payload must contain at least 7 bytes."]
  });
});

test("decodePentairFrame decodes run-once marker schedules using the platform default egg timer runtime", () => {
  const decoded = decodePentairFrame(buildPentairFrameWithAddresses(0x10, 0x21, 0x11, [0x03, 0x06, 0x06, 0x1e, 0x1a, 0x00, 0x15]));

  assert.equal(decoded.fields.schedule_type, 26);
  assert.equal(decoded.fields.schedule_type_label, "run_once_or_egg_timer_controlled");
  assert.equal(decoded.fields.start_time_minutes, 390);
  assert.equal(decoded.fields.end_time_minutes, 1110);
  assert.deepEqual(decoded.fields.warnings, [
    "Used platform default egg timer runtime because no circuit-specific egg timer runtime is known."
  ]);
});

test("decodePentairFrame decodes EasyTouch egg timer frames", () => {
  const decoded = decodePentairFrame(buildPentairFrameWithAddresses(0x10, 0x21, 0x11, [0x01, 0x06, 0x19, 0x00, 0x02, 0x00, 0x00]));

  assert.deepEqual(decoded.fields, {
    controller_family: "EasyTouch",
    frame_type: "easytouch_egg_timer",
    action: 17,
    schedule_id: 1,
    circuit_id: 6,
    active: true,
    egg_timer_run_time_minutes: 120,
    raw_payload: [1, 6, 25, 0, 2, 0, 0],
    payload_hex: "01061900020000",
    payload_length: 7,
    parse_confidence: "high",
    warnings: []
  });
});

test("decodePentairFrame masks the EasyTouch circuit id high bit", () => {
  const decoded = decodePentairFrame(buildPentairFrameWithAddresses(0x10, 0x21, 0x11, [0x01, 0x86, 0x08, 0x00, 0x11, 0x00, 0xff]));

  assert.equal(decoded.fields.circuit_id, 6);
  assert.equal(decoded.fields.schedule_days, 127);
  assert.deepEqual(decoded.fields.warnings, ["Circuit id high bit was masked off with 0x7f."]);
});

test("decodePentairFrame decodes circuit id 0 as an inactive EasyTouch schedule", () => {
  const decoded = decodePentairFrame(buildPentairFrameWithAddresses(0x10, 0x21, 0x11, [0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]));

  assert.deepEqual(decoded.fields, {
    controller_family: "EasyTouch",
    frame_type: "easytouch_schedule",
    action: 17,
    schedule_id: 1,
    active: false,
    raw_payload: [1, 0, 0, 0, 0, 0, 0],
    payload_hex: "01000000000000",
    payload_length: 7,
    parse_confidence: "medium",
    warnings: ["Schedule inactive because circuitId is 0"]
  });
});

test("pentairEasyTouchPlugin encodes the milestone-1 controller circuit baseline request for set_speed", () => {
  const encoded = pentairEasyTouchPlugin.encodeCommand(
    {
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
      dry_run: false
    },
    {}
  );

  assert.equal(encoded.writes.length, 1);
  assert.equal(encoded.writes[0].bytesHex, "ff00ffa5341021d8010101e4");
  assert.equal(encoded.writes[0].busRequirements.requires_idle_ms, 50);
  assert.equal(encoded.correlation?.kind, "controller_circuit_speed");
  assert.equal(encoded.correlation?.targetRpm, 2800);
  assert.equal(encoded.correlation?.pumpSlot, 1);
  assert.equal(encoded.correlation?.selectorValue, 0x0c);
  assert.equal(encoded.correlation?.circuitKey, "pool_high");
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

test("pentairEasyTouchPlugin encodes a controller circuit state write", () => {
  const encoded = pentairEasyTouchPlugin.encodeCommand(
    {
      pool_id: "pool-1",
      command_id: "command-circuit-state",
      requested_at: "2026-03-30T00:00:00Z",
      protocol_name: "pentair_easytouch",
      target: {
        equipment_type: "circuit",
        circuit_key: "feature4"
      },
      command_type: "set_circuit_state",
      arguments: {
        circuit_id: 14,
        enabled: true
      },
      dry_run: false
    },
    {}
  );

  assert.equal(encoded.writes.length, 1);
  assert.equal(encoded.writes[0].bytesHex, "ff00ffa534102186020e0101a1");
  assert.equal(encoded.correlation?.kind, "controller_ack");
});

test("pentairEasyTouchPlugin encodes a manual pump info request for Pump #1", () => {
  const encoded = pentairEasyTouchPlugin.encodeCommand(
    {
      pool_id: "pool-1",
      command_id: "command-pump-info-1",
      requested_at: "2026-03-30T00:00:00Z",
      protocol_name: "pentair_easytouch",
      target: {
        equipment_type: "controller",
        bus_address: "0x10"
      },
      command_type: "request_pump_info",
      arguments: {
        pump_slot: 1
      },
      dry_run: false
    },
    {}
  );

  assert.equal(encoded.writes.length, 1);
  assert.equal(encoded.writes[0].bytesHex, "ff00ffa5341021d8010101e4");
  assert.equal(encoded.correlation?.kind, "transport_ack");
});

test("pentairEasyTouchPlugin encodes a manual pump info request for Pump #2", () => {
  const encoded = pentairEasyTouchPlugin.encodeCommand(
    {
      pool_id: "pool-1",
      command_id: "command-pump-info-2",
      requested_at: "2026-03-30T00:00:00Z",
      protocol_name: "pentair_easytouch",
      target: {
        equipment_type: "controller",
        bus_address: "0x10"
      },
      command_type: "request_pump_info",
      arguments: {
        pump_slot: 2
      },
      dry_run: false
    },
    {}
  );

  assert.equal(encoded.writes.length, 1);
  assert.equal(encoded.writes[0].bytesHex, "ff00ffa5341021d8010201e5");
  assert.equal(encoded.correlation?.kind, "transport_ack");
});

test("pentairEasyTouchPlugin encodes a manual controller schedule request", () => {
  const encoded = pentairEasyTouchPlugin.encodeCommand(
    {
      pool_id: "pool-1",
      command_id: "command-controller-schedule",
      requested_at: "2026-03-30T00:00:00Z",
      protocol_name: "pentair_easytouch",
      target: {
        equipment_type: "controller",
        bus_address: "0x10"
      },
      command_type: "request_controller_schedule",
      arguments: {
        schedule_id: 5
      },
      dry_run: false
    },
    {}
  );

  assert.equal(encoded.writes.length, 1);
  assert.equal(encoded.writes[0].bytesHex, "ff00ffa5341021d1010501e1");
  assert.equal(encoded.correlation?.kind, "transport_ack");
});

test("pentairEasyTouchPlugin encodes a provisional controller datetime request", () => {
  const encoded = pentairEasyTouchPlugin.encodeCommand(
    {
      pool_id: "pool-1",
      command_id: "command-controller-datetime-request",
      requested_at: "2026-03-30T00:00:00Z",
      protocol_name: "pentair_easytouch",
      target: {
        equipment_type: "controller",
        bus_address: "0x10"
      },
      command_type: "request_controller_datetime",
      arguments: {},
      dry_run: false
    },
    {}
  );

  const expected = buildPentairFrameWithProtocol(0x01, 0x10, 0x21, 0xc5, [0x00]);
  assert.equal(encoded.writes.length, 1);
  assert.equal(encoded.writes[0].bytesHex, Buffer.from(expected).toString("hex"));
  assert.equal(encoded.correlation?.kind, "transport_ack");
});

test("pentairEasyTouchPlugin encodes a provisional controller datetime sync", () => {
  const encoded = pentairEasyTouchPlugin.encodeCommand(
    {
      pool_id: "pool-1",
      command_id: "command-controller-datetime-sync",
      requested_at: "2026-03-30T00:00:00Z",
      protocol_name: "pentair_easytouch",
      target: {
        equipment_type: "controller",
        bus_address: "0x10"
      },
      command_type: "sync_controller_datetime",
      arguments: {
        month: 4,
        day: 23,
        year: 26,
        day_of_week: 4,
        hour_24: 14,
        minute: 37
      },
      dry_run: false
    },
    {}
  );

  const expected = buildPentairFrameWithProtocol(0x01, 0x10, 0x21, 0x85, [0x04, 0x17, 0x1a, 0x04, 0x0e, 0x25]);
  assert.equal(encoded.writes.length, 1);
  assert.equal(encoded.writes[0].bytesHex, Buffer.from(expected).toString("hex"));
  assert.equal(encoded.correlation?.kind, "transport_ack");
});

test("pentairEasyTouchPlugin encodes manual circuit configuration requests", () => {
  const encoded = pentairEasyTouchPlugin.encodeCommand(
    {
      pool_id: "pool-1",
      command_id: "command-circuit-config",
      requested_at: "2026-03-30T00:00:00Z",
      protocol_name: "pentair_easytouch",
      target: {
        equipment_type: "controller",
        bus_address: "0x10"
      },
      command_type: "request_circuit_config",
      arguments: {
        start_index: 1,
        end_index: 3
      },
      dry_run: false
    },
    {}
  );

  const expectedFirst = buildPentairFrameWithProtocol(0x34, 0x10, 0x21, 0xcb, [0x01]);
  const expectedLast = buildPentairFrameWithProtocol(0x34, 0x10, 0x21, 0xcb, [0x03]);

  assert.equal(encoded.writes.length, 3);
  assert.equal(encoded.writes[0].bytesHex, Buffer.from(expectedFirst).toString("hex"));
  assert.equal(encoded.writes[2].bytesHex, Buffer.from(expectedLast).toString("hex"));
  assert.equal(encoded.correlation?.kind, "controller_circuit_config");
  assert.equal(encoded.correlation?.startIndex, 1);
  assert.equal(encoded.correlation?.endIndex, 3);
});

test("pentairEasyTouchPlugin encodes manual custom name requests", () => {
  const encoded = pentairEasyTouchPlugin.encodeCommand(
    {
      pool_id: "pool-1",
      command_id: "command-custom-name",
      requested_at: "2026-03-30T00:00:00Z",
      protocol_name: "pentair_easytouch",
      target: {
        equipment_type: "controller",
        bus_address: "0x10"
      },
      command_type: "request_custom_name",
      arguments: {
        name_index: 2
      },
      dry_run: false
    },
    {}
  );

  const expected = buildPentairFrameWithProtocol(0x34, 0x10, 0x21, 0xca, [0x02]);
  assert.equal(encoded.writes.length, 1);
  assert.equal(encoded.writes[0].bytesHex, Buffer.from(expected).toString("hex"));
  assert.equal(encoded.correlation?.kind, "transport_ack");
});

test("pentairEasyTouchPlugin encodes a manual controller software version request", () => {
  const encoded = pentairEasyTouchPlugin.encodeCommand(
    {
      pool_id: "pool-1",
      command_id: "command-controller-software-version",
      requested_at: "2026-03-30T00:00:00Z",
      protocol_name: "pentair_easytouch",
      target: {
        equipment_type: "controller",
        bus_address: "0x10"
      },
      command_type: "request_controller_software_version",
      arguments: {},
      dry_run: false
    },
    {}
  );

  const expected = buildPentairFrameWithProtocol(0x34, 0x10, 0x21, 0xfd, []);
  assert.equal(encoded.writes.length, 1);
  assert.equal(encoded.writes[0].bytesHex, Buffer.from(expected).toString("hex"));
  assert.equal(encoded.correlation?.kind, "transport_ack");
});

test("pentairEasyTouchPlugin encodes a structured manual pump config write", () => {
  const encoded = pentairEasyTouchPlugin.encodeCommand(
    {
      pool_id: "pool-1",
      command_id: "command-pump-config-write",
      requested_at: "2026-03-30T00:00:00Z",
      protocol_name: "pentair_easytouch",
      target: {
        equipment_type: "controller",
        bus_address: "0x10"
      },
      command_type: "write_pump_config",
      arguments: {
        pump_id: 1,
        pump_type: 0x80,
        priming_time: 0x00,
        unknown_3: 0x02,
        unknown_4: 0x00,
        slots: [
          { circuit_assignment: 0x06, rpm: 900 },
          { circuit_assignment: 0x0b, rpm: 1250 },
          { circuit_assignment: 0x0c, rpm: 3450 },
          { circuit_assignment: 0x0d, rpm: 2340 },
          { circuit_assignment: 0x80, rpm: 1900 },
          { circuit_assignment: 0x00, rpm: 0 },
          { circuit_assignment: 0x00, rpm: 0 },
          { circuit_assignment: 0x00, rpm: 0 }
        ],
        priming_speed: 1000,
        trailing_bytes: new Array(15).fill(0)
      },
      dry_run: false
    },
    {}
  );

  const expectedPayload = [
    0x01, 0x80, 0x00, 0x02, 0x00, 0x06, 0x03, 0x0b, 0x04, 0x0c, 0x0d, 0x0d,
    0x09, 0x80, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03, 0x84, 0xe2,
    0x7a, 0x24, 0x6c, 0x00, 0x00, 0x00, 0xe8, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
  ];
  const expected = buildPentairFrameWithProtocol(0x34, 0x10, 0x21, 0x9b, expectedPayload);

  assert.equal(encoded.writes.length, 1);
  assert.equal(encoded.writes[0].bytesHex, Buffer.from(expected).toString("hex"));
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
