import test from "node:test";
import assert from "node:assert/strict";
import { EquipmentBridge } from "../src/bridge.js";
import { LatestStateProjection } from "../src/state.js";

test("projection exposes initial milestone equipment values through the bridge", () => {
  const bridge = new EquipmentBridge();
  const projection = new LatestStateProjection();

  projection.updateController({
    air_temp_f: 77,
    water_temp_f: 82,
    occurred_at: "2026-03-30T00:00:00Z"
  });
  projection.updatePump({
    rpm: 2800,
    running: true,
    occurred_at: "2026-03-30T00:00:01Z"
  });
  projection.updateChlorinator({
    salt_ppm: 3100,
    occurred_at: "2026-03-30T00:00:02Z"
  });

  const equipment = projection.getEquipmentView(bridge.all());
  const controller = equipment[0] as { latest_state: { air_temp_f: number; water_temp_f: number } };
  const pump = equipment[1] as {
    latest_state: { rpm: number };
    control_circuit_keys: string[];
    default_control_circuit_key: string | null;
  };
  const chlorinator = equipment[2] as { latest_state: { salt_ppm: number } };

  assert.equal(equipment.length, 3);
  assert.equal(controller.latest_state.air_temp_f, 77);
  assert.equal(controller.latest_state.water_temp_f, 82);
  assert.equal(pump.latest_state.rpm, 2800);
  assert.deepEqual(pump.control_circuit_keys, ["pool", "pool_low", "pool_high", "cleaner"]);
  assert.equal(pump.default_control_circuit_key, "pool");
  assert.equal(chlorinator.latest_state.salt_ppm, 3100);
});
