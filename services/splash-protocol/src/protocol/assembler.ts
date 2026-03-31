import { ProtocolDecodeError } from "./types.js";

const PENTAIR_DELIMITER = Uint8Array.from([0xff, 0x00, 0xff, 0xa5]);

export interface RawSerialChunk {
  serialInstanceId: string;
  streamId: string;
  chunkId: string;
  port: string;
  receivedAt: string;
  bytesHex: string;
  byteCount: number;
}

export interface AssembledFrame {
  serialInstanceId: string;
  streamId: string;
  frameBytes: Uint8Array;
  sourceChunkIds: string[];
  capturedAt: string;
}

export interface UnidentifiedBytes {
  serialInstanceId: string;
  streamId: string;
  chunkId: string;
  capturedAt: string;
  bytes: Uint8Array;
  reason: "delimiter_noise" | "stream_reset";
}

export interface AssemblyResult {
  frames: AssembledFrame[];
  unidentified: UnidentifiedBytes[];
}

export class StreamFrameAssembler {
  private activeStreamId: string | null = null;
  private buffer: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
  private chunkIds: string[] = [];

  ingest(chunk: RawSerialChunk): AssemblyResult {
    const unidentified: UnidentifiedBytes[] = [];
    if (this.activeStreamId !== chunk.streamId) {
      if (this.buffer.length > 0 && this.activeStreamId !== null) {
        unidentified.push({
          serialInstanceId: chunk.serialInstanceId,
          streamId: this.activeStreamId,
          chunkId: chunk.chunkId,
          capturedAt: chunk.receivedAt,
          bytes: this.buffer,
          reason: "stream_reset"
        });
      }
      this.activeStreamId = chunk.streamId;
      this.buffer = new Uint8Array(0);
      this.chunkIds = [];
    }

    this.buffer = concatBytes(this.buffer, hexToBytes(chunk.bytesHex)) as Uint8Array;
    this.chunkIds.push(chunk.chunkId);

    const frames: AssembledFrame[] = [];
    while (true) {
      const start = findDelimiter(this.buffer);
      if (start < 0) {
        if (this.buffer.length > 0) {
          unidentified.push({
            serialInstanceId: chunk.serialInstanceId,
            streamId: chunk.streamId,
            chunkId: chunk.chunkId,
            capturedAt: chunk.receivedAt,
            bytes: this.buffer,
            reason: "delimiter_noise"
          });
        }
        this.buffer = new Uint8Array(0);
        this.chunkIds = [];
        return { frames, unidentified };
      }

      if (start > 0) {
        unidentified.push({
          serialInstanceId: chunk.serialInstanceId,
          streamId: chunk.streamId,
          chunkId: chunk.chunkId,
          capturedAt: chunk.receivedAt,
          bytes: this.buffer.slice(0, start) as Uint8Array,
          reason: "delimiter_noise"
        });
        this.buffer = this.buffer.slice(start) as Uint8Array;
      }

      if (this.buffer.length < 11) {
        return { frames, unidentified };
      }

      const payloadLength = this.buffer[8];
      const expectedLength = 11 + payloadLength;
      if (this.buffer.length < expectedLength) {
        return { frames, unidentified };
      }

      const frameBytes = this.buffer.slice(0, expectedLength) as Uint8Array;
      frames.push({
        serialInstanceId: chunk.serialInstanceId,
        streamId: chunk.streamId,
        frameBytes,
        sourceChunkIds: [...this.chunkIds],
        capturedAt: chunk.receivedAt
      });

      this.buffer = this.buffer.slice(expectedLength) as Uint8Array;
      this.chunkIds = [];
    }
  }
}

function findDelimiter(bytes: Uint8Array): number {
  for (let index = 0; index <= bytes.length - PENTAIR_DELIMITER.length; index += 1) {
    let valid = true;
    for (let offset = 0; offset < PENTAIR_DELIMITER.length; offset += 1) {
      if (bytes[index + offset] !== PENTAIR_DELIMITER[offset]) {
        valid = false;
        break;
      }
    }

    if (valid) {
      return index;
    }
  }

  return -1;
}

function concatBytes(left: Uint8Array, right: Uint8Array): Uint8Array {
  const result = new Uint8Array(left.length + right.length);
  result.set(left, 0);
  result.set(right, left.length);
  return result;
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new ProtocolDecodeError("Hex payload must have an even number of characters.", "hex_invalid_length");
  }

  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    const value = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
    if (Number.isNaN(value)) {
      throw new ProtocolDecodeError("Hex payload contains invalid bytes.", "hex_invalid");
    }

    bytes[index] = value;
  }

  return bytes;
}
