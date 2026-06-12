import test from "node:test";
import assert from "node:assert/strict";
import { EquipmentBridge } from "../src/bridge.js";
import { LatestStateProjection } from "../src/state.js";

test("projection exposes initial milestone equipment values through the bridge", () => {
  const bridge = new EquipmentBridge();
  const projection = new LatestStateProjection();

  projection.updateController({
    controller_hour_24: 14,
    controller_minute: 5,
    air_temp_f: 77,
    water_temp_f: 82,
    heater: {
      enabled: true
    },
    mode: "pool",
    controller_mode_byte: 9,
    controller_mode_label: "run + freeze protection",
    active_circuit_keys: ["pool", "cleaner"],
    circuits: {
      pool: true,
      spa: false,
      cleaner: true
    },
    occurred_at: "2026-03-30T00:00:00Z"
  });
  projection.updateControllerDatetimeReply({
    month: 4,
    day: 23,
    year: 26,
    day_of_week: 4,
    hour_24: 14,
    minute: 37,
    occurred_at: "2026-03-30T00:00:02Z"
  });
  projection.updateControllerCircuitConfiguration({
    circuit_id: 2,
    function_id: 2,
    base_function_label: "Pool",
    name_id: 17,
    name_label: "FEATURE 6",
    freeze_flag: false,
    high_flag: false,
    occurred_at: "2026-03-30T00:00:03Z"
  });
  projection.updateControllerCircuitConfiguration({
    circuit_id: 10,
    function_id: 0,
    base_function_label: "Generic",
    name_id: 42,
    freeze_flag: false,
    high_flag: false,
    occurred_at: "2026-03-30T00:00:04Z"
  });
  projection.updatePump({
    rpm: 2800,
    running: true,
    flow_gpm: 48,
    filter_pressure_psi: 18,
    filter_condition: "watch",
    occurred_at: "2026-03-30T00:00:01Z"
  });
  projection.updateChlorinator({
    salt_ppm: 3100,
    output_percent: 45,
    run_state: "producing",
    status: "ok",
    occurred_at: "2026-03-30T00:00:02Z"
  });

  const equipment = projection.getEquipmentView(bridge.all());
  const controller = equipment[0] as {
    hardware: {
      circuits: Array<{
        circuit_key: string;
        configuration_circuit_index: number | null;
        write_circuit_id: number | null;
        writable: boolean;
      }>;
    };
    latest_state: {
      controller_hour_24: number;
      controller_minute: number;
      controller_datetime_reply: {
        month: number | null;
        day: number | null;
        year: number | null;
        day_of_week: number | null;
        hour_24: number | null;
        minute: number | null;
        daylight_savings_auto: boolean | null;
      } | null;
      air_temp_f: number;
      water_temp_f: number;
      heater_enabled: boolean;
      mode: string;
      controller_mode_byte: number;
      controller_mode_label: string;
      active_circuit_keys: string[];
      circuits: Record<string, boolean>;
      circuit_configurations: Record<string, { function_value: number | null; function_label: string | null; name_value: number | null; name_label?: string | null }>;
    };
  };
  const pump = equipment[1] as {
    latest_state: {
      rpm: number;
      flow_gpm: number;
      filter_pressure_psi: number;
      filter_condition: string;
    };
    control_circuit_keys: string[];
    default_control_circuit_key: string | null;
  };
  const chlorinator = equipment[2] as {
    latest_state: {
      salt_ppm: number;
      output_percent: number;
      run_state: string;
      status: string;
    };
  };

  assert.equal(equipment.length, 3);
  assert.equal(controller.latest_state.controller_hour_24, 14);
  assert.equal(controller.latest_state.controller_minute, 5);
  assert.equal(controller.latest_state.controller_datetime_reply?.month, 4);
  assert.equal(controller.latest_state.controller_datetime_reply?.day, 23);
  assert.equal(controller.latest_state.controller_datetime_reply?.year, 26);
  assert.equal(controller.latest_state.controller_datetime_reply?.hour_24, 14);
  assert.equal(controller.latest_state.controller_datetime_reply?.minute, 37);
  assert.equal(controller.latest_state.controller_datetime_reply?.day_of_week, 4);
  assert.equal(controller.latest_state.controller_datetime_reply?.daylight_savings_auto, null);
  assert.equal(controller.latest_state.air_temp_f, 77);
  assert.equal(controller.latest_state.water_temp_f, 82);
  assert.equal(controller.latest_state.heater_enabled, true);
  assert.equal(controller.latest_state.mode, "pool");
  assert.equal(controller.latest_state.controller_mode_byte, 9);
  assert.equal(controller.latest_state.controller_mode_label, "run + freeze protection");
  assert.deepEqual(controller.latest_state.active_circuit_keys, ["pool", "cleaner"]);
  assert.deepEqual(controller.latest_state.circuits, {
    pool: true,
    spa: false,
    cleaner: true
  });
  assert.equal(controller.latest_state.circuit_configurations["2"].function_value, 2);
  assert.equal(controller.latest_state.circuit_configurations["2"].function_label, "Pool");
  assert.equal(controller.latest_state.circuit_configurations["2"].name_value, 17);
  assert.equal(controller.latest_state.circuit_configurations["2"].name_label, "FEATURE 6");
  assert.equal(controller.latest_state.circuit_configurations["10"].name_value, 42);
  assert.equal(controller.hardware.circuits.length, 18);
  assert.deepEqual(controller.hardware.circuits.find((circuit) => circuit.circuit_key === "feature1"), {
    circuit_key: "feature1",
    display_name: "Feature 1",
    circuit_type: "feature",
    installed: true,
    writable: true,
    configuration_circuit_index: 10,
    write_circuit_id: 11
  });
  assert.deepEqual(controller.hardware.circuits.find((circuit) => circuit.circuit_key === "aux_extra"), {
    circuit_key: "aux_extra",
    display_name: "Aux Extra",
    circuit_type: "aux_extra",
    installed: true,
    writable: false,
    configuration_circuit_index: 18,
    write_circuit_id: null
  });
  assert.equal(pump.latest_state.rpm, 2800);
  assert.equal(pump.latest_state.flow_gpm, 48);
  assert.equal(pump.latest_state.filter_pressure_psi, 18);
  assert.equal(pump.latest_state.filter_condition, "watch");
  assert.deepEqual(pump.control_circuit_keys, ["pool", "pool_low", "pool_high", "cleaner"]);
  assert.equal(pump.default_control_circuit_key, "pool");
  assert.equal(chlorinator.latest_state.salt_ppm, 3100);
  assert.equal(chlorinator.latest_state.output_percent, 45);
  assert.equal(chlorinator.latest_state.run_state, "producing");
  assert.equal(chlorinator.latest_state.status, "ok");
});

test("projection normalizes unknown filter condition values conservatively", () => {
  const bridge = new EquipmentBridge();
  const projection = new LatestStateProjection();

  projection.updatePump({
    rpm: 2400,
    running: true,
    flow_gpm: 42,
    filter_pressure_psi: 16,
    filter_condition: "needs_service",
    occurred_at: "2026-03-30T00:10:00Z"
  });

  const equipment = projection.getEquipmentView(bridge.all());
  const pump = equipment[1] as {
    latest_state: {
      filter_condition: string;
    };
  };

  assert.equal(pump.latest_state.filter_condition, "unknown");
});

test("projection normalizes unknown chlorinator state values conservatively", () => {
  const bridge = new EquipmentBridge();
  const projection = new LatestStateProjection();

  projection.updateChlorinator({
    salt_ppm: 2950,
    output_percent: 20,
    run_state: "spinning_up",
    status: "warningish",
    occurred_at: "2026-03-30T00:10:00Z"
  });

  const equipment = projection.getEquipmentView(bridge.all());
  const chlorinator = equipment[2] as {
    latest_state: {
      run_state: string;
      status: string;
    };
  };

  assert.equal(chlorinator.latest_state.run_state, "unknown");
  assert.equal(chlorinator.latest_state.status, "unknown");
});

test("projection exposes controller schedule visibility as unavailable until fields are validated", () => {
  const projection = new LatestStateProjection();

  assert.deepEqual(projection.getControllerSchedulesView(), {
    source: "controller_native",
    controller_type: "easytouch",
    status: "unavailable",
    message: "EasyTouch schedule payload is not yet fully decoded.",
    last_checked: null,
    schedules: [],
    observed_payloads: []
  });

  const updated = projection.updateControllerScheduleObservation({
    payload_hex: "019b0000000000",
    payload_length: 7,
    occurred_at: "2026-05-12T01:50:00Z"
  });

  assert.deepEqual(updated, {
    source: "controller_native",
    controller_type: "easytouch",
    status: "unavailable",
    message: "Observed EasyTouch schedule payloads, but no validated schedule records are available yet.",
    last_checked: "2026-05-12T01:50:00Z",
    schedules: [],
    observed_payloads: [
      {
        payload_hex: "019b0000000000",
        payload_length: 7,
        updated_at: "2026-05-12T01:50:00Z"
      }
    ]
  });
});

test("projection exposes validated EasyTouch schedule records when decoded fields are available", () => {
  const projection = new LatestStateProjection();

  const updated = projection.updateControllerScheduleObservation({
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
    payload_length: 7,
    parse_confidence: "high",
    warnings: [],
    occurred_at: "2026-05-12T01:55:00Z"
  });

  assert.deepEqual(updated, {
    source: "controller_native",
    controller_type: "easytouch",
    status: "available",
    message: "Validated EasyTouch controller schedule frames observed.",
    last_checked: "2026-05-12T01:55:00Z",
    schedules: [
      {
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
        parse_confidence: "high",
        warnings: [],
        raw_payload: [1, 6, 8, 0, 17, 0, 127],
        updated_at: "2026-05-12T01:55:00Z"
      }
    ],
    observed_payloads: [
      {
        payload_hex: "0106080011007f",
        payload_length: 7,
        updated_at: "2026-05-12T01:55:00Z"
      }
    ]
  });
});
