import type { ProtocolPlugin } from "./types.js";
import { bytesToHex } from "../protocol/hex.js";
import { type DecodedProtocolFrame, ProtocolDecodeError } from "../protocol/types.js";

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
    case 0x07:
    case 0x19:
      return {
        payload_hex: payloadHex,
        payload_length: payload.length
      };
    default:
      return {
        payload_hex: payloadHex,
        payload_length: payload.length
      };
  }
}

export function decodePentairFrame(frame: Uint8Array): DecodedProtocolFrame {
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
    unknownFields: decodeUnknownFields(payload)
  };
}

export const pentairEasyTouchPlugin: ProtocolPlugin = {
  id: "pentair_easytouch",
  status: "active",
  version: "0.1.0",
  decodeFrame(frame) {
    return decodePentairFrame(frame);
  }
};
