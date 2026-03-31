import test from "node:test";
import assert from "node:assert/strict";
import { ProtocolProcessor, type MessagePublisher } from "../src/protocol/processor.js";
import { pentairEasyTouchPlugin } from "../src/plugins/pentair-easytouch.js";
import type { AssembledFrame, RawSerialChunk } from "../src/protocol/assembler.js";

class InMemoryPublisher implements MessagePublisher {
  readonly messages: Array<{ subject: string; payload: Record<string, unknown> }> = [];

  async publish(subject: string, payload: Record<string, unknown>): Promise<void> {
    this.messages.push({ subject, payload });
  }
}

function buildFrame(): Uint8Array {
  const frame = [
    0xff,
    0x00,
    0xff,
    0xa5,
    0x01,
    0x0f,
    0x10,
    0x02,
    0x05,
    82,
    77,
    84,
    0x03,
    0x05
  ];
  const checksum = frame.slice(3).reduce((sum, byte) => (sum + byte) & 0xffff, 0);
  frame.push((checksum >> 8) & 0xff, checksum & 0xff);
  return Uint8Array.from(frame);
}

test("processor publishes protocol.frame.raw, protocol.frame.decoded, and normalized events", async () => {
  const publisher = new InMemoryPublisher();
  const processor = new ProtocolProcessor("pool-1", pentairEasyTouchPlugin, publisher);

  const chunk: RawSerialChunk = {
    serialInstanceId: "serial-1",
    streamId: "stream-1",
    chunkId: "chunk-1",
    port: "/dev/ttyUSB0",
    receivedAt: "2026-03-29T00:00:00Z",
    bytesHex: Buffer.from(buildFrame()).toString("hex"),
    byteCount: 16
  };

  const frames: AssembledFrame[] = [
    {
      serialInstanceId: "serial-1",
      streamId: "stream-1",
      frameBytes: buildFrame(),
      sourceChunkIds: ["chunk-1"],
      capturedAt: "2026-03-29T00:00:00Z"
    }
  ];

  await processor.processChunk(chunk, frames);

  assert.equal(publisher.messages.length, 3);
  assert.equal(publisher.messages[0].subject, "protocol.frame.raw");
  assert.equal(publisher.messages[1].subject, "protocol.frame.decoded");
  assert.equal(publisher.messages[2].subject, "equipment.state.controller");
  assert.equal(publisher.messages[1].payload.message_type, "controller_status");
  const decodedFields = publisher.messages[1].payload.fields as Record<string, unknown>;
  assert.equal(decodedFields.hour_24, 82);
  assert.equal(decodedFields.minute, 77);
  assert.equal(publisher.messages[2].payload.water_temp_f, null);
});
