import test from "node:test";
import assert from "node:assert/strict";
import { ProtocolDecodeError } from "../src/protocol/types.js";
import { decodePentairFrame } from "../src/plugins/pentair-easytouch.js";

function buildPentairFrame(actionCode: number, payload: number[]): Uint8Array {
  const frame = [
    0xff,
    0x00,
    0xff,
    0xa5,
    0x01,
    0x0f,
    0x10,
    actionCode,
    payload.length,
    ...payload
  ];

  const checksum = frame.slice(3).reduce((sum, byte) => (sum + byte) & 0xffff, 0);
  frame.push((checksum >> 8) & 0xff, checksum & 0xff);
  return Uint8Array.from(frame);
}

test("decodePentairFrame validates checksum and decodes controller status identity", () => {
  const frame = buildPentairFrame(0x02, [0x52, 0x4d, 0x00, 0x01]);
  const decoded = decodePentairFrame(frame);

  assert.equal(decoded.protocolName, "pentair_easytouch");
  assert.equal(decoded.messageType, "controller_status");
  assert.equal(decoded.actionCode, "0x02");
  assert.equal(decoded.sourceAddress, "0x10");
  assert.equal(decoded.destinationAddress, "0x0f");
  assert.equal(decoded.checksumStatus, "valid");
  assert.deepEqual(decoded.fields, {
    payload_hex: "524d0001",
    payload_length: 4
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
