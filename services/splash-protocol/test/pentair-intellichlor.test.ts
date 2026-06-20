import test from "node:test";
import assert from "node:assert/strict";
import {
  computeIntellichlorChecksum,
  createIntellichlorGetModelFrame,
  createIntellichlorSetOutputFrame,
  createIntellichlorTakeControlFrame,
  parseIntellichlorFrame
} from "../src/plugins/pentair-intellichlor.js";

test("IntelliChlor command serializers match observed take-control, set-output, and get-model frames", () => {
  assert.deepEqual(
    [...createIntellichlorTakeControlFrame()],
    [16, 2, 80, 0, 0, 98, 16, 3]
  );
  assert.deepEqual(
    [...createIntellichlorSetOutputFrame(15)],
    [16, 2, 80, 17, 15, 130, 16, 3]
  );
  assert.deepEqual(
    [...createIntellichlorGetModelFrame()],
    [16, 2, 80, 20, 0, 118, 16, 3]
  );
});

test("IntelliChlor checksum helper supports observed checksum modes", () => {
  assert.equal(computeIntellichlorChecksum(Uint8Array.from([80, 0, 0])), 98);
  assert.equal(computeIntellichlorChecksum(Uint8Array.from([16, 22, 0, 15, 73, 0, 5]), "stx_body_sum"), 133);
});

test("parseIntellichlorFrame decodes take-control ACK and model response", () => {
  const ack = parseIntellichlorFrame(Uint8Array.from([16, 2, 0, 1, 0, 0, 19, 16, 3]), {
    frameId: "frame-1",
    occurredAt: "2026-06-17T20:00:00Z"
  });
  assert.equal(ack.messageType, "intellichlor_take_control_ack");
  assert.equal(ack.checksumStatus, "valid");
  assert.equal(ack.normalizedEvents?.[0]?.payload.connected, true);
  assert.equal(ack.normalizedEvents?.[0]?.payload.comms_lost, false);

  const model = parseIntellichlorFrame(
    Uint8Array.from([16, 2, 0, 3, 0, 73, 110, 116, 101, 108, 108, 105, 99, 104, 108, 111, 114, 45, 45, 52, 48, 188, 16, 3]),
    {
      frameId: "frame-2",
      occurredAt: "2026-06-17T20:01:00Z"
    }
  );
  assert.equal(model.messageType, "intellichlor_model");
  assert.equal(model.fields.model_name, "IC40");
  assert.equal(model.fields.production_lb_per_day, 1.4);
  assert.equal(model.normalizedEvents?.[0]?.payload.model, "IC40");

  const plusModel = parseIntellichlorFrame(
    Uint8Array.from([16, 2, 0, 3, 0, 73, 110, 116, 101, 108, 108, 105, 99, 104, 108, 111, 114, 43, 43, 51, 48, 142, 16, 3]),
    {
      frameId: "frame-3",
      occurredAt: "2026-06-18T04:20:00Z"
    }
  );
  assert.equal(plusModel.messageType, "intellichlor_model");
  assert.equal(plusModel.fields.model_name, "PLUS30");
  assert.equal(plusModel.fields.production_lb_per_day, 1.1);
  assert.equal(plusModel.normalizedEvents?.[0]?.payload.model, "PLUS30");
});

test("parseIntellichlorFrame decodes action 18 salt/status and action 22 partial iChlor status without normalizing active-production state", () => {
  const action18 = parseIntellichlorFrame(Uint8Array.from([16, 2, 80, 18, 62, 2, 178, 16, 3]), {
    occurredAt: "2026-06-17T20:02:00Z"
  });
  assert.equal(action18.messageType, "intellichlor_status_reply");
  assert.equal(action18.fields.salt_ppm, 3100);
  assert.equal(action18.fields.status_code, 2);
  assert.equal(action18.fields.status, "low_salt");
  assert.equal(action18.normalizedEvents?.[0]?.payload.salt_ppm, 3100);
  assert.equal(action18.normalizedEvents?.[0]?.payload.status, "low_salt");
  assert.equal("current_output_percent" in (action18.normalizedEvents?.[0]?.payload ?? {}), false);

  const action22 = parseIntellichlorFrame(Uint8Array.from([16, 2, 16, 22, 0, 15, 73, 0, 5, 16, 133, 16, 3]), {
    occurredAt: "2026-06-17T20:03:00Z"
  });
  assert.equal(action22.messageType, "intellichlor_ichlor_status");
  assert.equal(action22.checksumStatus, "valid");
  assert.equal(action22.fields.current_output_percent, 15);
  assert.equal(action22.fields.water_temp_f, 73);
  assert.equal(action22.fields.status_code, 5);
  assert.equal(action22.fields.status, "clean_cell");
  assert.equal(action22.normalizedEvents?.[0]?.payload.water_temp_f, 73);
  assert.equal("current_output_percent" in (action22.normalizedEvents?.[0]?.payload ?? {}), false);
});

test("parseIntellichlorFrame decodes keepalive and fractional target output without crashing on partial payloads", () => {
  const keepalive = parseIntellichlorFrame(Uint8Array.from([16, 2, 80, 19, 117, 16, 3]), {
    occurredAt: "2026-06-17T20:04:00Z"
  });
  assert.equal(keepalive.messageType, "intellichlor_keepalive");
  assert.equal(keepalive.normalizedEvents?.[0]?.payload.connected, true);

  const fractional = parseIntellichlorFrame(Uint8Array.from([16, 2, 80, 21, 5, 124, 16, 3]), {
    occurredAt: "2026-06-17T20:05:00Z"
  });
  assert.equal(fractional.messageType, "intellichlor_fractional_output");
  assert.equal(fractional.fields.target_output_percent, 0.5);
});
