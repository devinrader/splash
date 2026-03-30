import type { ProtocolPlugin } from "./types.js";
import { bytesToHex } from "../protocol/hex.js";
import {
  type DecodedProtocolFrame,
  type NormalizedEvent,
  ProtocolDecodeError
} from "../protocol/types.js";

const START_DELIMITER = [0xff, 0x00, 0xff, 0xa5];

function expectStartDelimiter(frame: Uint8Array): void {
  if (frame.length < 11) {
    throw new ProtocolDecodeError("Frame is too short for Pentair decoding.", "frame_too_short");
  }

  const valid = START_DELIMITER.every((byte, index) => frame[index] === byte);
  if (!valid) {
    throw new ProtocolDecodeError("Frame does not use the Pentair start delimiter.", "frame_delimiter_invalid");
  }
}

function calculateChecksum(bytes: Uint8Array): number {
  return [...bytes].reduce((sum, byte) => (sum + byte) & 0xffff, 0);
}

function decodeMessageType(actionCode: number): string {
  switch (actionCode) {
    case 0x02:
      return "controller_status";
    case 0x07:
      return "pump_status";
    case 0x19:
      return "chlorinator_status";
    default:
      return "unknown";
  }
}

function decodeUnknownFields(payload: Uint8Array): string[] {
  return [...payload].map((value, index) => `payload[${index}]=0x${value.toString(16).padStart(2, "0")}`);
}

function decodeFields(actionCode: number, payload: Uint8Array): Record<string, unknown> {
  const payloadHex = bytesToHex(payload);

  switch (actionCode) {
    case 0x02:
      return {
        payload_hex: payloadHex,
        payload_length: payload.length,
        water_temp_f: payload[0] ?? null,
        air_temp_f: payload[1] ?? null,
        solar_temp_f: payload[2] ?? null,
        status_byte: payload[3] ?? null,
        circuits_byte: payload[4] ?? null
      };
    case 0x07:
      return {
        payload_hex: payloadHex,
        payload_length: payload.length,
        running_byte: payload[0] ?? null,
        rpm_hi: payload[1] ?? null,
        rpm_lo: payload[2] ?? null,
        watts_hi: payload[3] ?? null,
        watts_lo: payload[4] ?? null
      };
    case 0x19:
      return {
        payload_hex: payloadHex,
        payload_length: payload.length,
        salt_hi: payload[0] ?? null,
        salt_lo: payload[1] ?? null,
        output_percent: payload[2] ?? null,
        status_byte: payload[3] ?? null
      };
    default:
      return {
        payload_hex: payloadHex,
        payload_length: payload.length
      };
  }
}

// ASSUMPTION: These partial Pentair normalized mappings use only the current
// trusted subset of bytes. The unresolved payload areas are tracked in #41,
// #42, and #43 and must be revisited against validated captures.
function decodeNormalizedEvents(
  actionCode: number,
  payload: Uint8Array,
  frameId: string | null,
  occurredAt: string
): NormalizedEvent[] {
  const source = {
    service: "splash-protocol",
    protocol_name: "pentair_easytouch",
    frame_id: frameId
  };

  switch (actionCode) {
    case 0x02: {
      const statusByte = payload[3] ?? 0;
      const circuitsByte = payload[4] ?? 0;
      return [
        {
          subject: "equipment.state.controller",
          payload: {
            event_id: null,
            occurred_at: occurredAt,
            source,
            water_temp_f: payload[0] ?? null,
            air_temp_f: payload[1] ?? null,
            solar_temp_f: payload[2] ?? null,
            heater: {
              enabled: (statusByte & 0x01) !== 0
            },
            freeze_protection: (statusByte & 0x02) !== 0,
            circuits: {
              pool: (circuitsByte & 0x01) !== 0,
              spa: (circuitsByte & 0x02) !== 0,
              aux1: (circuitsByte & 0x04) !== 0,
              aux2: (circuitsByte & 0x08) !== 0
            }
          }
        }
      ];
    }
    case 0x07: {
      const rpm = ((payload[1] ?? 0) << 8) | (payload[2] ?? 0);
      const watts = ((payload[3] ?? 0) << 8) | (payload[4] ?? 0);
      return [
        {
          subject: "equipment.state.pump",
          payload: {
            event_id: null,
            occurred_at: occurredAt,
            source,
            equipment_id: null,
            equipment_type: "pump",
            bus_address: "0x60",
            running: (payload[0] ?? 0) !== 0,
            rpm,
            watts
          }
        }
      ];
    }
    case 0x19: {
      const saltPpm = ((payload[0] ?? 0) << 8) | (payload[1] ?? 0);
      return [
        {
          subject: "equipment.state.chlorinator",
          payload: {
            event_id: null,
            occurred_at: occurredAt,
            source,
            equipment_id: null,
            equipment_type: "chlorinator",
            salt_ppm: saltPpm,
            output_percent: payload[2] ?? null,
            status: (payload[3] ?? 0) === 0 ? "ok" : "warning"
          }
        }
      ];
    }
    default:
      return [];
  }
}

export function decodePentairFrame(
  frame: Uint8Array,
  context: { frameId?: string; occurredAt?: string } = {}
): DecodedProtocolFrame {
  expectStartDelimiter(frame);

  const payloadLength = frame[8];
  const dataStart = 9;
  const dataEnd = dataStart + payloadLength;
  const checksumIndex = dataEnd;

  if (frame.length < checksumIndex + 2) {
    throw new ProtocolDecodeError("Frame is shorter than its declared payload length.", "frame_length_invalid");
  }

  const payload = frame.slice(dataStart, dataEnd);
  const expectedChecksum = calculateChecksum(frame.slice(3, dataEnd));
  const actualChecksum = (frame[checksumIndex] << 8) | frame[checksumIndex + 1];

  if (expectedChecksum !== actualChecksum) {
    throw new ProtocolDecodeError("Pentair checksum validation failed.", "checksum_invalid");
  }

  const actionCode = frame[7];

  return {
    protocolName: "pentair_easytouch",
    messageType: decodeMessageType(actionCode),
    actionCode: `0x${actionCode.toString(16).padStart(2, "0")}`,
    sourceAddress: `0x${frame[6].toString(16).padStart(2, "0")}`,
    destinationAddress: `0x${frame[5].toString(16).padStart(2, "0")}`,
    checksumStatus: "valid",
    fields: decodeFields(actionCode, payload),
    unknownFields: decodeUnknownFields(payload),
    normalizedEvents: decodeNormalizedEvents(
      actionCode,
      payload,
      context.frameId ?? null,
      context.occurredAt ?? new Date().toISOString()
    )
  };
}

export const pentairEasyTouchPlugin: ProtocolPlugin = {
  id: "pentair_easytouch",
  status: "active",
  version: "0.1.0",
  decodeFrame(frame, context) {
    return decodePentairFrame(frame, context);
  }
};
