import { assert, beforeEach, test } from "vitest";
import type { PlatformStatusResponse } from "../src/types";
import { useFrontendStore } from "../src/store";

beforeEach(() => {
  useFrontendStore.setState({
    equipment: {},
    healthStatus: "unknown",
    healthData: null,
    sseStatus: "connecting",
    errorMessage: null,
    command: {
      commandId: null,
      requestedRpm: null,
      status: null,
      detail: null,
      errorCode: null
    }
  });
});

test("setEquipment preserves the existing equipment object for unchanged snapshots", () => {
  const records = [
    {
      id: "controller-main",
      equipment_type: "controller" as const,
      display_name: "Main Controller",
      protocol_name: "pentair_easytouch",
      latest_state: {
        water_temp_f: 84,
        controller_minute: 15
      }
    }
  ];

  useFrontendStore.getState().setEquipment(records);
  const firstEquipmentRef = useFrontendStore.getState().equipment;

  useFrontendStore.getState().setEquipment(records.map((record) => ({
    ...record,
    latest_state: { ...record.latest_state }
  })));
  const secondEquipmentRef = useFrontendStore.getState().equipment;

  assert.strictEqual(secondEquipmentRef, firstEquipmentRef);
});

test("setHealthData preserves the existing health object for unchanged payloads", () => {
  const payload: PlatformStatusResponse = {
    overall: "healthy",
    generatedAt: "2026-06-17T15:00:00.000Z",
    connectivity: {
      rs485: {
        rx_messages_per_second: 1,
        tx_messages_per_second: 2
      },
      nats_broker: {
        status: "ok",
        subscriptions: 3,
        in_messages_per_second: 4,
        out_messages_per_second: 5,
        last_sample_at: "2026-06-17T15:00:00.000Z",
        error_code: null
      }
    },
    services: []
  };

  useFrontendStore.getState().setHealthData(payload);
  const firstHealthRef = useFrontendStore.getState().healthData;

  useFrontendStore.getState().setHealthData({
    ...payload,
    connectivity: {
      ...payload.connectivity,
      rs485: { ...payload.connectivity?.rs485 },
      nats_broker: { ...payload.connectivity?.nats_broker }
    },
    services: [...payload.services]
  });
  const secondHealthRef = useFrontendStore.getState().healthData;

  assert.strictEqual(secondHealthRef, firstHealthRef);
});

test("applyEquipmentStateEvent preserves the equipment object for unchanged SSE payloads", () => {
  useFrontendStore.getState().setEquipment([
    {
      id: "controller-main",
      equipment_type: "controller",
      display_name: "Main Controller",
      protocol_name: "pentair_easytouch",
      latest_state: {
        updated_at: "2026-06-17T15:00:00.000Z",
        water_temp_f: 84
      }
    }
  ]);

  const firstEquipmentRef = useFrontendStore.getState().equipment;
  useFrontendStore.getState().applyEquipmentStateEvent({
    updated_at: "2026-06-17T15:00:00.000Z",
    water_temp_f: 84
  });
  const secondEquipmentRef = useFrontendStore.getState().equipment;

  assert.strictEqual(secondEquipmentRef, firstEquipmentRef);
});
