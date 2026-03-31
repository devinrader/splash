import { ProtocolDecodeError } from "./types.js";

const PENTAIR_DELIMITER = Uint8Array.from([0xff, 0x00, 0xff, 0xa5]);
const INTELLICHLOR_START = Uint8Array.from([0x10, 0x02]);
const INTELLICHLOR_END = Uint8Array.from([0x10, 0x03]);

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
  frameFamily: "pentair" | "intellichlor";
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

export interface BufferedBytes {
  serialInstanceId: string;
  streamId: string;
  chunkId: string;
  capturedAt: string;
  bytes: Uint8Array;
  reason: "partial_delimiter" | "partial_frame";
}

export interface AssemblyResult {
  frames: AssembledFrame[];
  unidentified: UnidentifiedBytes[];
  buffered: BufferedBytes | null;
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
      const candidate = findNextFrameStart(this.buffer);
      if (!candidate) {
        const preservedSuffixLength = longestDelimiterPrefixSuffixLength(this.buffer, [PENTAIR_DELIMITER, INTELLICHLOR_START]);
        const discardLength = this.buffer.length - preservedSuffixLength;
        if (discardLength > 0) {
          unidentified.push({
            serialInstanceId: chunk.serialInstanceId,
            streamId: chunk.streamId,
            chunkId: chunk.chunkId,
            capturedAt: chunk.receivedAt,
            bytes: this.buffer.slice(0, discardLength) as Uint8Array,
            reason: "delimiter_noise"
          });
        }
        this.buffer =
          preservedSuffixLength > 0
            ? (this.buffer.slice(discardLength) as Uint8Array)
            : new Uint8Array(0);
        if (this.buffer.length === 0) {
          this.chunkIds = [];
        }
        return { frames, unidentified, buffered: buildBufferedState(this.buffer, chunk) };
      }

      if (candidate.start > 0) {
        unidentified.push({
          serialInstanceId: chunk.serialInstanceId,
          streamId: chunk.streamId,
          chunkId: chunk.chunkId,
          capturedAt: chunk.receivedAt,
          bytes: this.buffer.slice(0, candidate.start) as Uint8Array,
          reason: "delimiter_noise"
        });
        this.buffer = this.buffer.slice(candidate.start) as Uint8Array;
      }

      const frameBytes = candidate.family === "pentair"
        ? extractPentairFrame(this.buffer)
        : extractIntellichlorFrame(this.buffer);
      if (!frameBytes) {
        return { frames, unidentified, buffered: buildBufferedState(this.buffer, chunk) };
      }

      frames.push({
        serialInstanceId: chunk.serialInstanceId,
        streamId: chunk.streamId,
        frameFamily: candidate.family,
        frameBytes,
        sourceChunkIds: [...this.chunkIds],
        capturedAt: chunk.receivedAt
      });

      this.buffer = this.buffer.slice(frameBytes.length) as Uint8Array;
      this.chunkIds = [];
    }
  }
}

function buildBufferedState(buffer: Uint8Array, chunk: RawSerialChunk): BufferedBytes | null {
  if (buffer.length === 0) {
    return null;
  }

  return {
    serialInstanceId: chunk.serialInstanceId,
    streamId: chunk.streamId,
    chunkId: chunk.chunkId,
    capturedAt: chunk.receivedAt,
    bytes: buffer,
    reason: startsWithKnownDelimiterPrefix(buffer) ? "partial_frame" : "partial_delimiter"
  };
}

function findNextFrameStart(bytes: Uint8Array): { start: number; family: "pentair" | "intellichlor" } | null {
  const pentairStart = findDelimiter(bytes, PENTAIR_DELIMITER);
  const intellichlorStart = findDelimiter(bytes, INTELLICHLOR_START);

  if (pentairStart < 0 && intellichlorStart < 0) {
    return null;
  }
  if (pentairStart < 0) {
    return { start: intellichlorStart, family: "intellichlor" };
  }
  if (intellichlorStart < 0) {
    return { start: pentairStart, family: "pentair" };
  }
  return pentairStart <= intellichlorStart
    ? { start: pentairStart, family: "pentair" }
    : { start: intellichlorStart, family: "intellichlor" };
}

function findDelimiter(bytes: Uint8Array, delimiter: Uint8Array): number {
  for (let index = 0; index <= bytes.length - delimiter.length; index += 1) {
    let valid = true;
    for (let offset = 0; offset < delimiter.length; offset += 1) {
      if (bytes[index + offset] !== delimiter[offset]) {
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

function longestDelimiterPrefixSuffixLength(bytes: Uint8Array, delimiters: Uint8Array[]): number {
  let longest = 0;
  for (const delimiter of delimiters) {
    const maxLength = Math.min(bytes.length, delimiter.length - 1);
    for (let length = maxLength; length > 0; length -= 1) {
      let valid = true;
      for (let index = 0; index < length; index += 1) {
        if (bytes[bytes.length - length + index] !== delimiter[index]) {
          valid = false;
          break;
        }
      }
      if (valid) {
        longest = Math.max(longest, length);
        break;
      }
    }
  }
  return longest;
}

function startsWithKnownDelimiterPrefix(bytes: Uint8Array): boolean {
  return startsWithPrefix(bytes, PENTAIR_DELIMITER) || startsWithPrefix(bytes, INTELLICHLOR_START);
}

function startsWithPrefix(bytes: Uint8Array, delimiter: Uint8Array): boolean {
  const compareLength = Math.min(bytes.length, delimiter.length);
  for (let index = 0; index < compareLength; index += 1) {
    if (bytes[index] !== delimiter[index]) {
      return false;
    }
  }
  return true;
}

function extractPentairFrame(buffer: Uint8Array): Uint8Array | null {
  if (buffer.length < 11) {
    return null;
  }
  const payloadLength = buffer[8];
  const expectedLength = 11 + payloadLength;
  if (buffer.length < expectedLength) {
    return null;
  }
  return buffer.slice(0, expectedLength) as Uint8Array;
}

function extractIntellichlorFrame(buffer: Uint8Array): Uint8Array | null {
  const endStart = findDelimiter(buffer.slice(INTELLICHLOR_START.length) as Uint8Array, INTELLICHLOR_END);
  if (endStart < 0) {
    return null;
  }
  const frameLength = INTELLICHLOR_START.length + endStart + INTELLICHLOR_END.length;
  return buffer.slice(0, frameLength) as Uint8Array;
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
