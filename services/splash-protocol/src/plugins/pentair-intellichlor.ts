import { bytesToHex } from "../protocol/hex.js";
import type { DecodedProtocolFrame, NormalizedEvent } from "../protocol/types.js";
import { ProtocolDecodeError } from "../protocol/types.js";

const INTELLICHLOR_START_DELIMITER = [0x10, 0x02] as const;
const INTELLICHLOR_END_DELIMITER = [0x10, 0x03] as const;
export const DEFAULT_INTELLICHLOR_DESTINATION = 0x50;

export const INTELLICHLOR_STATUS_MAP = {
  0: "ok",
  1: "low_flow",
  2: "low_salt",
  3: "very_low_salt",
  4: "high_current",
  5: "clean_cell",
  6: "low_voltage",
  7: "low_water_temp",
  8: "communication_lost"
} as const;

export const INTELLICHLOR_MODEL_METADATA = {
  IC15: { productionLbPerDay: 0.6 },
  IC20: { productionLbPerDay: 0.7 },
  IC40: { productionLbPerDay: 1.4 },
  IC60: { productionLbPerDay: 2.0 },
  "iChlor IC15": { productionLbPerDay: 0.6 },
  "iChlor IC30": { productionLbPerDay: 1.0 },
  LT15: { productionLbPerDay: 0.65 },
  LT25: { productionLbPerDay: 0.9 },
  PLUS30: { productionLbPerDay: 1.1 },
  PLUS40: { productionLbPerDay: 1.4 },
  PLUS60: { productionLbPerDay: 2.0 }
} as const;

type KnownIntellichlorModel = keyof typeof INTELLICHLOR_MODEL_METADATA;

export interface ParsedIntellichlorFrame {
  headerByte: number;
  action: number;
  payload: Uint8Array;
  checksum: number;
  checksumStatus: "valid" | "unknown";
  checksumMode: "full_frame_sum" | "stx_body_sum" | "unknown";
  bodyHex: string;
}

export function parseIntellichlorFrame(frame: Uint8Array, context: { frameId?: string; occurredAt?: string } = {}): DecodedProtocolFrame {
  if (!hasDelimiter(frame, INTELLICHLOR_START_DELIMITER) || !hasDelimiter(frame, INTELLICHLOR_END_DELIMITER, frame.length - 2)) {
    throw new ProtocolDecodeError("Frame does not use IntelliChlor delimiters.", "frame_delimiter_invalid");
  }

  const inner = frame.slice(INTELLICHLOR_START_DELIMITER.length, frame.length - INTELLICHLOR_END_DELIMITER.length);
  const unescaped = unescapeDleBytes(inner);
  if (unescaped.length < 3) {
    throw new ProtocolDecodeError("IntelliChlor frame is too short.", "frame_too_short");
  }

  const checksumByte = unescaped[unescaped.length - 1] ?? 0;
  const candidateBodies = [unescaped.slice(0, -1)];
  const lastCandidateByte = candidateBodies[0]?.[candidateBodies[0].length - 1] ?? null;
  if (lastCandidateByte === 0x10) {
    candidateBodies.push(candidateBodies[0].slice(0, -1));
  }

  let body = candidateBodies[0];
  let checksumStatus: "valid" | "unknown" = "unknown";
  let checksumMode: "full_frame_sum" | "stx_body_sum" | "unknown" = "unknown";
  for (const candidate of candidateBodies) {
    const fullFrameChecksum = computeIntellichlorChecksum(candidate, "full_frame_sum");
    if (fullFrameChecksum === checksumByte) {
      body = candidate;
      checksumStatus = "valid";
      checksumMode = "full_frame_sum";
      break;
    }

    const stxBodyChecksum = computeIntellichlorChecksum(candidate, "stx_body_sum");
    if (stxBodyChecksum === checksumByte) {
      body = candidate;
      checksumStatus = "valid";
      checksumMode = "stx_body_sum";
      break;
    }
  }

  if (body.length < 2) {
    throw new ProtocolDecodeError("IntelliChlor frame is missing header bytes.", "frame_too_short");
  }

  const headerByte = body[0] ?? 0;
  const action = body[1] ?? 0;
  const payload = body.slice(2);
  const interpreted = interpretIntellichlorAction(headerByte, action, payload, checksumByte, context);

  return {
    protocolName: "pentair_easytouch",
    frameFamily: "intellichlor",
    messageType: interpreted.messageType,
    actionCode: `0x${action.toString(16).padStart(2, "0")}`,
    sourceAddress: headerByte >= 0x50 ? "unknown" : `0x${headerByte.toString(16).padStart(2, "0")}`,
    destinationAddress: headerByte >= 0x50 ? `0x${headerByte.toString(16).padStart(2, "0")}` : "inferred",
    checksumStatus,
    fields: {
      header_byte: headerByte,
      payload_hex: bytesToHex(payload),
      payload_length: payload.length,
      checksum_byte: checksumByte,
      checksum_mode: checksumMode,
      body_hex: bytesToHex(body),
      ...interpreted.fields
    },
    unknownFields: interpreted.unknownFields,
    normalizedEvents: interpreted.normalizedEvents
  };
}

export function createIntellichlorTakeControlFrame(destination = DEFAULT_INTELLICHLOR_DESTINATION): Uint8Array {
  return buildIntellichlorFrame(destination, 0x00, [0x00]);
}

export function createIntellichlorSetOutputFrame(percent: number, destination = DEFAULT_INTELLICHLOR_DESTINATION): Uint8Array {
  validateOutputPercent(percent);
  return buildIntellichlorFrame(destination, 0x11, [percent]);
}

export function createIntellichlorGetModelFrame(destination = DEFAULT_INTELLICHLOR_DESTINATION): Uint8Array {
  return buildIntellichlorFrame(destination, 0x14, [0x00]);
}

export function buildIntellichlorFrame(destination: number, action: number, payload: number[]): Uint8Array {
  const body = Uint8Array.from([destination & 0xff, action & 0xff, ...payload.map((byte) => byte & 0xff)]);
  const checksum = computeIntellichlorChecksum(body, "full_frame_sum");
  const escapedBody = escapeDleBytes(Uint8Array.from([...body, checksum]));
  return Uint8Array.from([
    ...INTELLICHLOR_START_DELIMITER,
    ...escapedBody,
    ...INTELLICHLOR_END_DELIMITER
  ]);
}

export function computeIntellichlorChecksum(
  body: Uint8Array,
  mode: "full_frame_sum" | "stx_body_sum" = "full_frame_sum"
): number {
  const seed = mode === "full_frame_sum" ? 0x12 : 0x02;
  return [...body].reduce((sum, byte) => (sum + byte) & 0xff, seed);
}

function validateOutputPercent(percent: number): void {
  if (!Number.isInteger(percent) || percent < 0 || percent > 100) {
    throw new ProtocolDecodeError("IntelliChlor output percent must be an integer between 0 and 100.", "command_arguments_invalid");
  }
}

function interpretIntellichlorAction(
  headerByte: number,
  action: number,
  payload: Uint8Array,
  checksumByte: number,
  context: { frameId?: string; occurredAt?: string }
): {
  messageType: string;
  fields: Record<string, unknown>;
  unknownFields: string[];
  normalizedEvents: NormalizedEvent[];
} {
  const source = {
    service: "splash-protocol",
    protocol_name: "pentair_easytouch",
    frame_id: context.frameId ?? null
  };
  const occurredAt = context.occurredAt ?? new Date().toISOString();
  const connectivityPayload = {
    event_id: null,
    occurred_at: occurredAt,
    source,
    equipment_id: null,
    equipment_type: "chlorinator",
    connected: true,
    comms_lost: false,
    last_comm: occurredAt
  };

  switch (action) {
    case 0x00:
      return {
        messageType: "intellichlor_take_control",
        fields: {
          command: "take_control"
        },
        unknownFields: decodeUnknownFields(payload),
        normalizedEvents: []
      };
    case 0x01:
      return {
        messageType: "intellichlor_take_control_ack",
        fields: {
          command: "take_control_ack"
        },
        unknownFields: decodeUnknownFields(payload),
        normalizedEvents: [
          {
            subject: "equipment.state.chlorinator",
            payload: connectivityPayload
          }
        ]
      };
    case 0x03: {
      const modelName = normalizeModelName(payload);
      const modelMetadata = modelName ? resolveModelMetadata(modelName) : null;
      return {
        messageType: "intellichlor_model",
        fields: {
          model_name: modelName,
          production_lb_per_day: modelMetadata?.productionLbPerDay ?? null,
          production_lb_per_second: modelMetadata ? roundProductionPerSecond(modelMetadata.productionLbPerDay) : null
        },
        unknownFields: decodeUnknownFields(payload),
        normalizedEvents: [
          {
            subject: "equipment.state.chlorinator",
            payload: {
              ...connectivityPayload,
              model: modelName,
              production_lb_per_day: modelMetadata?.productionLbPerDay ?? null,
              production_lb_per_second: modelMetadata ? roundProductionPerSecond(modelMetadata.productionLbPerDay) : null
            }
          }
        ]
      };
    }
    case 0x11: {
      const targetOutput = payload[0] ?? null;
      return {
        messageType: "intellichlor_set_output",
        fields: {
          target_output_percent: targetOutput
        },
        unknownFields: decodeUnknownFields(payload.slice(1)),
        normalizedEvents: targetOutput == null ? [] : [
          {
            subject: "equipment.state.chlorinator",
            payload: {
              ...connectivityPayload,
              output_percent: targetOutput,
              target_output_percent: targetOutput
            }
          }
        ]
      };
    }
    case 0x12: {
      const saltPpm = payload[0] == null ? null : payload[0] * 50;
      const statusCode = payload[1] == null ? null : payload[1] & 0x7f;
      const status = statusCode == null ? null : INTELLICHLOR_STATUS_MAP[statusCode as keyof typeof INTELLICHLOR_STATUS_MAP] ?? "unknown";
      const currentOutput = payload[2] ?? null;
      return {
        messageType: "intellichlor_status_reply",
        fields: {
          salt_ppm: saltPpm,
          status_code: statusCode,
          status,
          current_output_percent: currentOutput
        },
        unknownFields: decodeUnknownFields(payload.slice(currentOutput == null ? 2 : 3)),
        normalizedEvents: [
          {
            subject: "equipment.state.chlorinator",
            payload: {
              ...connectivityPayload,
              salt_ppm: saltPpm,
              status_code: statusCode,
              status
            }
          }
        ]
      };
    }
    case 0x13:
      return {
        messageType: "intellichlor_keepalive",
        fields: {
          keepalive: true
        },
        unknownFields: decodeUnknownFields(payload),
        normalizedEvents: [
          {
            subject: "equipment.state.chlorinator",
            payload: connectivityPayload
          }
        ]
      };
    case 0x14:
      return {
        messageType: "intellichlor_get_model",
        fields: {
          command: "get_model"
        },
        unknownFields: decodeUnknownFields(payload),
        normalizedEvents: []
      };
    case 0x15: {
      const targetOutput = payload[0] == null ? null : Math.round((payload[0] / 10) * 10) / 10;
      return {
        messageType: "intellichlor_fractional_output",
        fields: {
          target_output_percent: targetOutput
        },
        unknownFields: decodeUnknownFields(payload.slice(1)),
        normalizedEvents: targetOutput == null ? [] : [
          {
            subject: "equipment.state.chlorinator",
            payload: {
              ...connectivityPayload,
              target_output_percent: targetOutput,
              output_percent: targetOutput
            }
          }
        ]
      };
    }
    case 0x16: {
      const currentOutput = payload[1] ?? null;
      const waterTempF = payload[2] != null && payload[2] >= 40 ? payload[2] : null;
      const statusCode = payload[4] ?? null;
      const status = statusCode == null ? null : INTELLICHLOR_STATUS_MAP[statusCode as keyof typeof INTELLICHLOR_STATUS_MAP] ?? "unknown";
      return {
        messageType: "intellichlor_ichlor_status",
        fields: {
          current_output_percent: currentOutput,
          water_temp_f: waterTempF,
          status_code: statusCode,
          status
        },
        unknownFields: decodeUnknownFields(payload.slice(5)),
        normalizedEvents: [
          {
            subject: "equipment.state.chlorinator",
            payload: {
              ...connectivityPayload,
              water_temp_f: waterTempF,
              status_code: statusCode,
              status
            }
          }
        ]
      };
    }
    default:
      return {
        messageType: "intellichlor_frame",
        fields: {
          raw_header_byte: headerByte
        },
        unknownFields: decodeUnknownFields(payload),
        normalizedEvents: []
      };
  }
}

function resolveModelMetadata(modelName: string): { productionLbPerDay: number } | null {
  const direct = INTELLICHLOR_MODEL_METADATA[modelName as KnownIntellichlorModel];
  if (direct) {
    return direct;
  }

  const compact = modelName.replace(/\s+/g, "").replace(/^Intellichlor--/, "IC");
  if (compact in INTELLICHLOR_MODEL_METADATA) {
    return INTELLICHLOR_MODEL_METADATA[compact as KnownIntellichlorModel];
  }

  return null;
}

function normalizeModelName(payload: Uint8Array): string | null {
  const text = new TextDecoder("ascii")
    .decode(payload)
    .replace(/\0+/g, "")
    .trim();
  if (!text) {
    return null;
  }

  if (/^Intellichlor--(\d+)/i.test(text)) {
    const match = text.match(/^Intellichlor--(\d+)/i);
    return match ? `IC${match[1]}` : text;
  }

  if (/^Intellichlor\+\+(\d+)/i.test(text)) {
    const match = text.match(/^Intellichlor\+\+(\d+)/i);
    return match ? `PLUS${match[1]}` : text;
  }

  return text;
}

function roundProductionPerSecond(lbPerDay: number): number {
  return Math.round((lbPerDay / 86400) * 1_000_000_000) / 1_000_000_000;
}

function decodeUnknownFields(payload: Uint8Array): string[] {
  return [...payload].map((value, index) => `payload[${index}]=0x${value.toString(16).padStart(2, "0")}`);
}

function hasDelimiter(frame: Uint8Array, delimiter: readonly number[], offset = 0): boolean {
  if (frame.length < offset + delimiter.length) {
    return false;
  }
  return delimiter.every((byte, index) => frame[offset + index] === byte);
}

function unescapeDleBytes(bytes: Uint8Array): Uint8Array {
  const result: number[] = [];
  for (let index = 0; index < bytes.length; index += 1) {
    const value = bytes[index] ?? 0;
    if (value === 0x10 && bytes[index + 1] === 0x10) {
      result.push(0x10);
      index += 1;
      continue;
    }
    result.push(value);
  }
  return Uint8Array.from(result);
}

function escapeDleBytes(bytes: Uint8Array): Uint8Array {
  const result: number[] = [];
  for (const value of bytes) {
    result.push(value);
    if (value === 0x10) {
      result.push(0x10);
    }
  }
  return Uint8Array.from(result);
}
