import {
  ProtocolCommandError,
  type CommandEncodingPlan,
  type NormalizedCommandIntent
} from "../commands/types.js";
import type { ProtocolPlugin } from "./types.js";
import { bytesToHex } from "../protocol/hex.js";
import {
  type DecodedProtocolFrame,
  type NormalizedEvent,
  ProtocolDecodeError
} from "../protocol/types.js";

const START_DELIMITER = [0xff, 0x00, 0xff, 0xa5];
const SPLASH_REMOTE_ADDRESS = 0x21;
const DEFAULT_IDLE_MS = 50;
const PUMP_PROGRAM_1 = 0x27;
const CONTROLLER_CIRCUIT_BITS = [
  { key: "pool", mask: 0x20 },
  { key: "spa", mask: 0x01 },
  { key: "aux1", mask: 0x02 },
  { key: "aux2", mask: 0x04 },
  { key: "aux3", mask: 0x08 },
  { key: "feature1", mask: 0x10 },
  { key: "feature2", mask: 0x40 },
  { key: "feature3", mask: 0x80 }
] as const;

type ControllerMode = "pool" | "spa" | "pool_spa" | "aux_only" | "idle";

function decodeCircuitStates(circuitsByte: number): Record<string, boolean> {
  return Object.fromEntries(
    CONTROLLER_CIRCUIT_BITS.map(({ key, mask }) => [key, (circuitsByte & mask) !== 0])
  );
}

function decodeActiveCircuitKeys(circuitsByte: number): string[] {
  return CONTROLLER_CIRCUIT_BITS.filter(({ mask }) => (circuitsByte & mask) !== 0).map(({ key }) => key);
}

function decodeControllerMode(circuits: Record<string, boolean>): ControllerMode {
  if (circuits.pool && circuits.spa) {
    return "pool_spa";
  }
  if (circuits.pool) {
    return "pool";
  }
  if (circuits.spa) {
    return "spa";
  }
  if (circuits.aux1 || circuits.aux2 || circuits.aux3 || circuits.feature1 || circuits.feature2 || circuits.feature3) {
    return "aux_only";
  }
  return "idle";
}

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
    case 0x9b:
      return "controller_remote_interaction";
    default:
      return "unknown";
  }
}

function describeAddressRole(address: number): "controller" | "remote" | "pump" | "other" {
  if (address >= 0x10 && address <= 0x1f) {
    return "controller";
  }
  if (address >= 0x20 && address <= 0x2f) {
    return "remote";
  }
  if (address >= 0x60 && address <= 0x6f) {
    return "pump";
  }
  return "other";
}

function decodeUnknownFields(payload: Uint8Array): string[] {
  return [...payload].map((value, index) => `payload[${index}]=0x${value.toString(16).padStart(2, "0")}`);
}

function decodeFields(actionCode: number, payload: Uint8Array, sourceAddress: number, destinationAddress: number): Record<string, unknown> {
  const payloadHex = bytesToHex(payload);

  switch (actionCode) {
    case 0x02:
      {
        const circuitsByte = payload[2] ?? 0;
        const circuits = decodeCircuitStates(circuitsByte);
        return {
          payload_hex: payloadHex,
          payload_length: payload.length,
          water_temp_f: payload[0] ?? null,
          air_temp_f: payload[1] ?? null,
          solar_temp_f: payload[2] ?? null,
          status_byte: payload[3] ?? null,
          circuits_byte: circuitsByte,
          active_circuit_keys: decodeActiveCircuitKeys(circuitsByte),
          mode: decodeControllerMode(circuits),
          circuits
        };
      }
    case 0x07:
      return {
        payload_hex: payloadHex,
        payload_length: payload.length,
        status_byte: payload[0] ?? null,
        mode_byte: payload[2] ?? null,
        watts_hi: payload[3] ?? null,
        watts_lo: payload[4] ?? null,
        rpm_hi: payload[5] ?? null,
        rpm_lo: payload[6] ?? null
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
    case 0x9b:
      return {
        payload_hex: payloadHex,
        payload_length: payload.length,
        source_role: describeAddressRole(sourceAddress),
        destination_role: describeAddressRole(destinationAddress),
        source_is_remote: describeAddressRole(sourceAddress) === "remote",
        destination_is_controller: describeAddressRole(destinationAddress) === "controller"
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
  sourceAddress: string,
  destinationAddress: string,
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
      const circuitsByte = payload[2] ?? 0;
      const circuits = decodeCircuitStates(circuitsByte);
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
            mode: decodeControllerMode(circuits),
            active_circuit_keys: decodeActiveCircuitKeys(circuitsByte),
            circuits
          }
        }
      ];
    }
    case 0x07: {
      if (!sourceAddress.startsWith("0x6") || payload.length < 7) {
        return [];
      }

      const rpm = ((payload[5] ?? 0) << 8) | (payload[6] ?? 0);
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
            bus_address: sourceAddress.toLowerCase(),
            running: rpm > 0,
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
    fields: decodeFields(actionCode, payload, frame[6], frame[5]),
    unknownFields: decodeUnknownFields(payload),
    normalizedEvents: decodeNormalizedEvents(
      actionCode,
      payload,
      `0x${frame[6].toString(16).padStart(2, "0")}`,
      `0x${frame[5].toString(16).padStart(2, "0")}`,
      context.frameId ?? null,
      context.occurredAt ?? new Date().toISOString()
    )
  };
}

function parseBusAddress(address: string): number {
  const normalized = address.toLowerCase();
  if (!normalized.startsWith("0x")) {
    throw new ProtocolCommandError("Pentair pump commands require a hex bus address.", "command_target_invalid");
  }

  const parsed = Number.parseInt(normalized.slice(2), 16);
  if (!Number.isInteger(parsed) || parsed < 0x60 || parsed > 0x6f) {
    throw new ProtocolCommandError("Pentair direct pump commands require a direct pump bus address in the 0x60-0x6f range.", "command_target_invalid");
  }
  return parsed;
}

function parseTargetRpm(intent: NormalizedCommandIntent): number {
  const rpm = intent.arguments.rpm;
  if (typeof rpm !== "number" || !Number.isInteger(rpm) || rpm < 450 || rpm > 3450) {
    throw new ProtocolCommandError("Pentair direct pump set_speed requires an integer rpm between 450 and 3450.", "command_arguments_invalid");
  }
  return rpm;
}

function buildPentairFrame(destination: number, source: number, actionCode: number, payload: number[]): Uint8Array {
  const frame = [0xff, 0x00, 0xff, 0xa5, 0x00, destination, source, actionCode, payload.length, ...payload];
  const checksum = frame.slice(3).reduce((sum, byte) => (sum + byte) & 0xffff, 0);
  frame.push((checksum >> 8) & 0xff, checksum & 0xff);
  return Uint8Array.from(frame);
}

function encodePentairCommand(intent: NormalizedCommandIntent): CommandEncodingPlan {
  if (intent.command_type !== "set_speed") {
    throw new ProtocolCommandError("pentair_easytouch only supports direct pump set_speed in the initial command slice.", "unsupported_command_encode");
  }

  if (intent.target.equipment_type !== "pump") {
    throw new ProtocolCommandError("Pentair direct set_speed requires a pump target.", "command_target_invalid");
  }

  const busAddress = typeof intent.target.bus_address === "string" ? intent.target.bus_address : null;
  if (!busAddress) {
    throw new ProtocolCommandError("Pentair direct set_speed requires a target bus_address.", "command_target_invalid");
  }

  const destination = parseBusAddress(busAddress);
  const rpm = parseTargetRpm(intent);
  const rpmHi = (rpm >> 8) & 0xff;
  const rpmLo = rpm & 0xff;

  const writes = [
    buildPentairFrame(destination, SPLASH_REMOTE_ADDRESS, 0x04, [0xff]),
    buildPentairFrame(destination, SPLASH_REMOTE_ADDRESS, 0x01, [0x03, PUMP_PROGRAM_1, rpmHi, rpmLo]),
    buildPentairFrame(destination, SPLASH_REMOTE_ADDRESS, 0x04, [0x00])
  ].map((bytes) => ({
    bytes,
    bytesHex: bytesToHex(bytes),
    busRequirements: {
      requires_idle_ms: DEFAULT_IDLE_MS
    }
  }));

  return {
    protocolName: "pentair_easytouch",
    writes,
    correlation: {
      kind: "pump_rpm",
      targetRpm: rpm,
      busAddress: busAddress.toLowerCase()
    }
  };
}

export const pentairEasyTouchPlugin: ProtocolPlugin = {
  id: "pentair_easytouch",
  status: "active",
  version: "0.1.0",
  decodeFrame(frame, context) {
    return decodePentairFrame(frame, context);
  },
  encodeCommand(intent) {
    return encodePentairCommand(intent);
  }
};
