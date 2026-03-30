import type { Logger } from "../logger.js";
import type { MessagingSession } from "../messaging.js";
import type { ProtocolPlugin } from "../plugins/types.js";
import { type RawSerialChunk, StreamFrameAssembler } from "./assembler.js";
import { ProtocolProcessor } from "./processor.js";
import { ProtocolDecodeError } from "./types.js";

export class ProtocolRuntime {
  private readonly assembler = new StreamFrameAssembler();
  private activePlugin: ProtocolPlugin | null = null;
  private activePoolId: string | null = null;

  constructor(private readonly logger: Logger) {}

  setActiveSelection(poolId: string, plugin: ProtocolPlugin): void {
    this.activePoolId = poolId;
    this.activePlugin = plugin;
  }

  clearActivePlugin(): void {
    this.activePoolId = null;
    this.activePlugin = null;
  }

  attach(session: MessagingSession): void {
    session.subscribe("serial.rx.raw", async (payload) => {
      if (!this.activePlugin || !this.activePoolId) {
        return;
      }

      let chunk: RawSerialChunk;
      try {
        chunk = parseChunk(payload);
      } catch (error) {
        const decodeError = normalizeDecodeError(error);
        this.logger.warn("protocol.chunk.invalid", "Received invalid serial chunk payload.", {
          error_code: decodeError.errorCode,
          detail: decodeError.message
        });
        return;
      }

      try {
        const frames = this.assembler.ingest(chunk);
        if (frames.length === 0) {
          return;
        }

        const processor = new ProtocolProcessor(this.activePoolId, this.activePlugin, session);
        await processor.processChunk(chunk, frames);
      } catch (error) {
        const decodeError = normalizeDecodeError(error);
        this.logger.warn("protocol.decode.failed", "Failed to process live protocol chunk.", {
          error_code: decodeError.errorCode,
          detail: decodeError.message,
          serial_instance_id: chunk.serialInstanceId,
          stream_id: chunk.streamId,
          chunk_id: chunk.chunkId
        });
      }
    });
  }
}

function parseChunk(payload: Record<string, unknown>): RawSerialChunk {
  return {
    serialInstanceId: readRequiredString(payload, "serial_instance_id"),
    streamId: readRequiredString(payload, "stream_id"),
    chunkId: readRequiredString(payload, "chunk_id"),
    port: readRequiredString(payload, "port"),
    receivedAt: readRequiredString(payload, "received_at"),
    bytesHex: readRequiredString(payload, "bytes_hex"),
    byteCount: readRequiredNumber(payload, "byte_count")
  };
}

function normalizeDecodeError(error: unknown): ProtocolDecodeError {
  if (error instanceof ProtocolDecodeError) {
    return error;
  }
  if (error instanceof Error) {
    return new ProtocolDecodeError(error.message, "protocol_runtime_error");
  }
  return new ProtocolDecodeError(String(error), "protocol_runtime_error");
}

function readRequiredString(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new ProtocolDecodeError(`Chunk payload field '${key}' must be a non-empty string.`, "chunk_payload_invalid");
  }
  return value;
}

function readRequiredNumber(payload: Record<string, unknown>, key: string): number {
  const value = payload[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ProtocolDecodeError(`Chunk payload field '${key}' must be a number.`, "chunk_payload_invalid");
  }
  return value;
}
