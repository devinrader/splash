import { randomUUID } from "node:crypto";
import { bytesToHex } from "./hex.js";
import type { ProtocolPlugin } from "../plugins/types.js";
import type { AssembledFrame, RawSerialChunk } from "./assembler.js";
import { ProtocolDecodeError } from "./types.js";

export interface PublishedMessage {
  subject: string;
  payload: Record<string, unknown>;
}

export interface MessagePublisher {
  publish(subject: string, payload: Record<string, unknown>): Promise<void>;
}

export class ProtocolProcessor {
  constructor(
    private readonly poolId: string,
    private readonly plugin: ProtocolPlugin,
    private readonly publisher: MessagePublisher
  ) {}

  async processChunk(chunk: RawSerialChunk, frames: AssembledFrame[]): Promise<void> {
    for (const frame of frames) {
      const frameId = randomUUID();
      await this.publisher.publish("protocol.frame.raw", {
        pool_id: this.poolId,
        stream_id: chunk.streamId,
        frame_id: frameId,
        source_chunk_ids: frame.sourceChunkIds,
        protocol_name: this.plugin.id,
        frame_family: frame.frameFamily,
        captured_at: frame.capturedAt,
        bytes_hex: bytesToHex(frame.frameBytes),
        framing_status: "valid"
      });

      let decoded;
      try {
        decoded = this.plugin.decodeFrame(frame.frameBytes, {
          frameId,
          occurredAt: frame.capturedAt
        });
      } catch (error) {
        if (error instanceof ProtocolDecodeError) {
          await this.publisher.publish("protocol.frame.unidentified", {
            pool_id: this.poolId,
            stream_id: chunk.streamId,
            serial_instance_id: chunk.serialInstanceId,
            chunk_id: frame.sourceChunkIds[frame.sourceChunkIds.length - 1] ?? chunk.chunkId,
            protocol_name: this.plugin.id,
            captured_at: frame.capturedAt,
            bytes_hex: bytesToHex(frame.frameBytes),
            byte_count: frame.frameBytes.length,
            reason: "unknown_frame_type"
          });
          continue;
        }
        throw error;
      }
      await this.publisher.publish("protocol.frame.decoded", {
        pool_id: this.poolId,
        stream_id: chunk.streamId,
        frame_id: frameId,
        protocol_name: decoded.protocolName,
        frame_family: decoded.frameFamily ?? frame.frameFamily,
        decoded_at: frame.capturedAt,
        message_type: decoded.messageType,
        action_code: decoded.actionCode,
        source_address: decoded.sourceAddress,
        destination_address: decoded.destinationAddress,
        checksum_status: decoded.checksumStatus,
        fields: decoded.fields,
        unknown_fields: decoded.unknownFields
      });

      for (const event of decoded.normalizedEvents ?? []) {
        await this.publisher.publish(event.subject, {
          pool_id: this.poolId,
          ...event.payload
        });
      }
    }
  }
}
