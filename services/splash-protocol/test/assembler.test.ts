import test from "node:test";
import assert from "node:assert/strict";
import { StreamFrameAssembler, type RawSerialChunk } from "../src/protocol/assembler.js";

function buildPentairFrameHex(actionCode: number, payload: number[]): string {
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
  return frame.map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function chunk(bytesHex: string, overrides: Partial<RawSerialChunk> = {}): RawSerialChunk {
  return {
    poolId: "pool-1",
    streamId: "stream-1",
    chunkId: "chunk-1",
    port: "/dev/ttyUSB0",
    receivedAt: "2026-03-29T00:00:00Z",
    bytesHex,
    byteCount: bytesHex.length / 2,
    ...overrides
  };
}

test("assembler reconstructs a frame split across multiple chunks", () => {
  const assembler = new StreamFrameAssembler();
  const frameHex = buildPentairFrameHex(0x02, [0x52, 0x4d, 0x00, 0x01]);

  const first = assembler.ingest(chunk(frameHex.slice(0, 10), { chunkId: "chunk-a" }));
  const second = assembler.ingest(chunk(frameHex.slice(10), { chunkId: "chunk-b" }));

  assert.equal(first.length, 0);
  assert.equal(second.length, 1);
  assert.equal(Buffer.from(second[0].frameBytes).toString("hex"), frameHex);
  assert.deepEqual(second[0].sourceChunkIds, ["chunk-a", "chunk-b"]);
});

test("assembler resets buffered state when stream id changes", () => {
  const assembler = new StreamFrameAssembler();
  const frameHex = buildPentairFrameHex(0x02, [0x52, 0x4d, 0x00, 0x01]);

  assembler.ingest(chunk(frameHex.slice(0, 10), { chunkId: "chunk-a", streamId: "stream-1" }));
  const frames = assembler.ingest(
    chunk(frameHex, { chunkId: "chunk-b", streamId: "stream-2" })
  );

  assert.equal(frames.length, 1);
  assert.deepEqual(frames[0].sourceChunkIds, ["chunk-b"]);
});
