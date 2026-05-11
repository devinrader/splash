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
const INTELLICHLOR_START_DELIMITER = [0x10, 0x02];
const INTELLICHLOR_END_DELIMITER = [0x10, 0x03];
const SPLASH_REMOTE_ADDRESS = 0x21;
const CONTROLLER_ADDRESS = 0x10;
const DEFAULT_IDLE_MS = 50;
const PUMP_PROGRAM_1 = 0x27;
const DEFAULT_CONTROLLER_CIRCUIT_SPEED_CONFIG = {
  pumpSlot: 1,
  circuitAssignments: {
    pool: 0x06,
    pool_low: 0x0b,
    pool_high: 0x0c,
    cleaner: 0x0d
  }
} as const;
const CONTROLLER_CIRCUIT_BITS = [
  { key: "pool", mask: 0x20 },
  { key: "spa", mask: 0x01 },
  { key: "aux1", mask: 0x02 },
  { key: "aux2", mask: 0x04 },
  { key: "aux3", mask: 0x08 }
] as const;
const CONTROLLER_CIRCUIT_BITS_2 = [
  { key: "pool_low", mask: 0x04 },
  { key: "pool_high", mask: 0x08 },
  { key: "cleaner", mask: 0x10 },
  { key: "feature4", mask: 0x20 },
  { key: "feature5", mask: 0x40 },
  { key: "feature6", mask: 0x80 }
] as const;
const CONTROLLER_CIRCUIT_BITS_3 = [
  { key: "feature7", mask: 0x01 },
  { key: "feature8", mask: 0x02 },
  { key: "aux_extra", mask: 0x08 }
] as const;

function decodePumpConfigSlots(payload: Uint8Array): Array<Record<string, number | null>> {
  return Array.from({ length: 8 }, (_, index) => {
    const assignmentIndex = 5 + index * 2;
    const speedHighIndex = 6 + index * 2;
    const speedLowIndex = 22 + index;
    const assignment = payload[assignmentIndex] ?? null;
    const speedHigh = payload[speedHighIndex] ?? null;
    const speedLow = payload[speedLowIndex] ?? null;
    return {
      slot: index + 1,
      circuit_assignment: assignment,
      speed_high: speedHigh,
      speed_low: speedLow,
      rpm: speedHigh === null || speedLow === null ? null : (speedHigh << 8) | speedLow
    };
  });
}

type ControllerMode = "pool" | "spa" | "pool_spa" | "aux_only" | "idle";

function decodeControllerModelFamily(
  controllerSubModelByte: number | null,
  controllerModelByte: number | null
): "easytouch" | "suntouch" | "intellitouch" | "intellicenter" | null {
  if (controllerModelByte === null) {
    return null;
  }

  if (controllerModelByte === 13 || controllerModelByte === 14) {
    return "easytouch";
  }

  if (controllerModelByte === 11) {
    return "suntouch";
  }

  if (controllerModelByte >= 0 && controllerModelByte <= 5) {
    if (controllerSubModelByte === 23 || (controllerSubModelByte !== null && controllerSubModelByte >= 40)) {
      return "intellicenter";
    }
    return "intellitouch";
  }

  return null;
}

function decodeControllerModelLabel(controllerSubModelByte: number | null, controllerModelByte: number | null): string | null {
  const family = decodeControllerModelFamily(controllerSubModelByte, controllerModelByte);
  switch (family) {
    case "easytouch":
      return "EasyTouch";
    case "suntouch":
      return "SunTouch";
    case "intellitouch":
      return "IntelliTouch";
    case "intellicenter":
      return "IntelliCenter";
    default:
      return null;
  }
}

function decodeControllerModeLabel(controllerModeByte: number | null): string | null {
  if (controllerModeByte === null) {
    return null;
  }

  const labels: string[] = [];

  if ((controllerModeByte & 0x01) !== 0) {
    labels.push("run");
  }
  if ((controllerModeByte & 0x08) !== 0) {
    labels.push("freeze protection");
  }
  if ((controllerModeByte & 0x80) !== 0) {
    labels.push("timeout");
  }
  if ((controllerModeByte & 0x04) !== 0) {
    labels.push("celsius");
  }

  if (labels.length === 0) {
    labels.push("idle");
  }

  return labels.join(" + ");
}

function decodePoolHeatMode(heatSettingByte: number | null): "off" | "heater" | "solar_preferred" | "solar" | null {
  if (heatSettingByte === null) {
    return null;
  }

  switch (heatSettingByte & 0x03) {
    case 0:
      return "off";
    case 1:
      return "heater";
    case 2:
      return "solar_preferred";
    case 3:
      return "solar";
    default:
      return null;
  }
}

function decodeCircuitBaseFunction(functionId: number | null): string | null {
  if (functionId === null) {
    return null;
  }

  switch (functionId & 0x3f) {
    case 0:
      return "Generic";
    case 1:
      return "Spa";
    case 2:
      return "Pool";
    case 3:
      return "Spillway";
    case 4:
      return "Master Cleaner";
    case 5:
      return "Cleaner";
    case 6:
      return "Solar";
    case 7:
      return "Heat Boost";
    case 8:
      return "Heat Enable";
    case 9:
      return "Jets";
    case 10:
      return "Aux (standard relay)";
    case 11:
      return "Feature";
    case 12:
      return "Light";
    case 13:
      return "IntelliBrite";
    case 14:
      return "MagicStream";
    case 15:
      return "Laminar";
    case 16:
      return "Waterfall";
    case 17:
      return "Fountain";
    case 18:
      return "Blower";
    case 19:
      return "Pool Light";
    case 20:
      return "Spa Light";
    case 21:
      return "Landscape Light";
    case 22:
      return "Floor Cleaner";
    case 23:
      return "Booster Pump";
    case 24:
      return "Valve";
    case 25:
      return "Heater";
    case 26:
      return "Heat Pump";
    case 27:
      return "Color Wheel";
    case 28:
      return "Dimmer";
    case 29:
      return "Unknown / Reserved";
    case 30:
      return "Egg Timer Only";
    default:
      return "Unknown";
  }
}

function decodeCircuitNameLabel(nameId: number | null): string | null {
  switch (nameId) {
    case 0:
      return "NOT USED";
    case 1:
      return "SPA";
    case 2:
      return "POOL";
    case 3:
      return "SPA LIGHT";
    case 4:
      return "POOL LIGHT";
    case 5:
      return "AUX 1";
    case 6:
      return "AUX 2";
    case 7:
      return "AUX 3";
    case 8:
      return "AUX 4";
    case 9:
      return "AUX 5";
    case 10:
      return "AUX 6";
    case 11:
      return "AUX 7";
    case 12:
      return "FEATURE 1";
    case 13:
      return "FEATURE 2";
    case 14:
      return "FEATURE 3";
    case 15:
      return "FEATURE 4";
    case 16:
      return "FEATURE 5";
    case 17:
      return "FEATURE 6";
    case 18:
      return "FEATURE 7";
    case 19:
      return "VALVE 1";
    case 20:
      return "VALVE 2";
    case 21:
      return "VALVE 3";
    case 22:
      return "VALVE 4";
    case 23:
      return "SOLAR";
    case 24:
      return "HEATER";
    case 25:
      return "HEAT PUMP";
    case 26:
      return "CLEANER";
    case 27:
      return "BOOSTER";
    case 28:
      return "WATERFALL";
    case 29:
      return "FOUNTAIN";
    case 30:
      return "BLOWER";
    case 31:
      return "LIGHTS";
    case 32:
      return "LANDSCAPE LIGHT";
    case 33:
      return "INTELLIBRITE";
    case 34:
      return "MAGICSTREAM";
    case 35:
      return "LAMINAR";
    case 36:
      return "COLOR WHEEL";
    case 37:
      return "DIMMER";
    case 38:
      return "GENERIC";
    default:
      return null;
  }
}

function decodeSpaHeatMode(heatSettingByte: number | null): "off" | "heater" | "solar_preferred" | "solar" | null {
  if (heatSettingByte === null) {
    return null;
  }

  switch (heatSettingByte & 0x0c) {
    case 0x00:
      return "off";
    case 0x04:
      return "heater";
    case 0x08:
      return "solar_preferred";
    case 0x0c:
      return "solar";
    default:
      return null;
  }
}

function decodeCircuitStates(circuitsByte: number, circuitsByte2 = 0, circuitsByte3 = 0): Record<string, boolean> {
  return Object.fromEntries([
    ...CONTROLLER_CIRCUIT_BITS.map(({ key, mask }) => [key, (circuitsByte & mask) !== 0]),
    ...CONTROLLER_CIRCUIT_BITS_2.map(({ key, mask }) => [key, (circuitsByte2 & mask) !== 0]),
    ...CONTROLLER_CIRCUIT_BITS_3.map(({ key, mask }) => [key, (circuitsByte3 & mask) !== 0])
  ]);
}

function decodeActiveCircuitKeys(circuitsByte: number, circuitsByte2 = 0, circuitsByte3 = 0): string[] {
  return [
    ...CONTROLLER_CIRCUIT_BITS.filter(({ mask }) => (circuitsByte & mask) !== 0).map(({ key }) => key),
    ...CONTROLLER_CIRCUIT_BITS_2.filter(({ mask }) => (circuitsByte2 & mask) !== 0).map(({ key }) => key),
    ...CONTROLLER_CIRCUIT_BITS_3.filter(({ mask }) => (circuitsByte3 & mask) !== 0).map(({ key }) => key)
  ];
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
  if (
    circuits.aux1 ||
    circuits.aux2 ||
    circuits.aux3 ||
    circuits.pool_low ||
    circuits.pool_high ||
    circuits.cleaner ||
    circuits.feature4 ||
    circuits.feature5 ||
    circuits.feature6 ||
    circuits.feature7 ||
    circuits.feature8 ||
    circuits.aux_extra
  ) {
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

function expectValidPentairProtocolByte(frame: Uint8Array): void {
  const protocolByte = frame[4];
  if (protocolByte !== 0x00 && protocolByte !== 0x01 && protocolByte !== 0x34) {
    throw new ProtocolDecodeError(
      `Frame uses unsupported Pentair protocol byte 0x${(protocolByte ?? 0).toString(16).padStart(2, "0")}.`,
      "protocol_byte_invalid"
    );
  }
}

function hasDelimiter(frame: Uint8Array, delimiter: number[], offset = 0): boolean {
  if (frame.length < offset + delimiter.length) {
    return false;
  }
  return delimiter.every((byte, index) => frame[offset + index] === byte);
}

function calculateChecksum(bytes: Uint8Array): number {
  return [...bytes].reduce((sum, byte) => (sum + byte) & 0xffff, 0);
}

function decodeMessageType(actionCode: number): string {
  switch (actionCode) {
    case 0x0a:
      return "custom_name";
    case 0xfc:
      return "controller_software_version";
    case 0x01:
      return "controller_ack";
    case 0x05:
      return "controller_datetime";
    case 0x02:
      return "controller_status";
    case 0x0b:
      return "circuit_configuration";
    case 0x18:
      return "pump_info";
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
    case 0x0a:
      return {
        payload_hex: payloadHex,
        payload_length: payload.length,
        name_index: payload[0] ?? null,
        custom_name_bytes: [...payload.slice(1)],
        custom_name_text: decodeFixedWidthAscii(payload.slice(1))
      };
    case 0xfc:
      return {
        payload_hex: payloadHex,
        payload_length: payload.length,
        controller_firmware_major: payload[1] ?? null,
        controller_firmware_minor: payload[2] ?? null,
        bootloader_major: payload[5] ?? null,
        bootloader_minor: payload[6] ?? null
      };
    case 0x05:
      return {
        payload_hex: payloadHex,
        payload_length: payload.length,
        hour_24: payload[0] ?? null,
        minute: payload[1] ?? null,
        day_of_week: payload[2] ?? null,
        day: payload[3] ?? null,
        month: payload[4] ?? null,
        year: payload[5] ?? null,
        unknown_byte_6: payload[6] ?? null,
        daylight_savings_auto: payload[7] == null ? null : payload[7] === 1
      };
    case 0x02:
      {
        const circuitsByte = payload[2] ?? 0;
        const circuitsByte2 = payload[3] ?? 0;
        const circuitsByte3 = payload[4] ?? 0;
        const controllerModeByte = payload[9] ?? null;
        const valveStateByte = payload[10] ?? null;
        const delayByte = payload[12] ?? null;
        const heatSettingByte = payload[22] ?? null;
        const controllerSubModelByte = payload[27] ?? null;
        const controllerModelByte = payload[28] ?? null;
        const circuits = decodeCircuitStates(circuitsByte, circuitsByte2, circuitsByte3);
        return {
          payload_hex: payloadHex,
          payload_length: payload.length,
          hour_24: payload[0] ?? null,
          minute: payload[1] ?? null,
          water_temp_f: payload[14] ?? null,
          air_temp_f: payload[18] ?? null,
          solar_temp_f: payload[19] ?? null,
          circuits_byte: circuitsByte,
          circuits_byte_2: circuitsByte2,
          circuits_byte_3: circuitsByte3,
          controller_mode_byte: controllerModeByte,
          controller_mode_label: decodeControllerModeLabel(controllerModeByte),
          service_mode: controllerModeByte === null ? null : (controllerModeByte & 0x01) !== 0,
          celsius_mode: controllerModeByte === null ? null : (controllerModeByte & 0x04) !== 0,
          freeze_protection_active: controllerModeByte === null ? null : (controllerModeByte & 0x08) !== 0,
          timeout_mode: controllerModeByte === null ? null : (controllerModeByte & 0x80) !== 0,
          valve_state_byte: valveStateByte,
          delay_byte: delayByte,
          delay_active: delayByte === null ? null : delayByte !== 0,
          firmware_major: payload[16] ?? null,
          firmware_minor: payload[17] ?? null,
          heat_setting_byte: heatSettingByte,
          pool_heat_mode: decodePoolHeatMode(heatSettingByte),
          spa_heat_mode: decodeSpaHeatMode(heatSettingByte),
          controller_sub_model_byte: controllerSubModelByte,
          controller_model_byte: controllerModelByte,
          controller_model_family: decodeControllerModelFamily(controllerSubModelByte, controllerModelByte),
          controller_model_label: decodeControllerModelLabel(controllerSubModelByte, controllerModelByte),
          active_circuit_keys: decodeActiveCircuitKeys(circuitsByte, circuitsByte2, circuitsByte3),
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
    case 0x0b:
      {
        const functionId = payload[1] ?? null;
        const nameId = payload[2] ?? null;
        return {
          payload_hex: payloadHex,
          payload_length: payload.length,
          circuit_id: payload[0] ?? null,
          function_id: functionId,
          base_function_id: functionId === null ? null : functionId & 0x3f,
          base_function_label: decodeCircuitBaseFunction(functionId),
          freeze_flag: functionId === null ? null : (functionId & 0x40) !== 0,
          high_flag: functionId === null ? null : (functionId & 0x80) !== 0,
          name_id: nameId,
          name_label: decodeCircuitNameLabel(nameId),
          reserved_3: payload[3] ?? null,
          reserved_4: payload[4] ?? null
        };
      }
    case 0x19:
      return {
        payload_hex: payloadHex,
        payload_length: payload.length,
        salt_hi: payload[0] ?? null,
        salt_lo: payload[1] ?? null,
        output_percent: payload[2] ?? null,
        status_byte: payload[3] ?? null
      };
    case 0x18:
      return {
        payload_hex: payloadHex,
        payload_length: payload.length,
        pump_slot: payload[0] ?? null,
        pump_type: payload[1] ?? null,
        priming_time: payload[2] ?? null,
        likely_assigned_circuit: payload[3] ?? null,
        unknown_3: payload[3] ?? null,
        unknown_4: payload[4] ?? null,
        slots: decodePumpConfigSlots(payload),
        slot_1_rpm_high: payload[6] ?? null,
        slot_1_rpm_low: payload[22] ?? null,
        slot_1_rpm: payload.length > 22 ? (((payload[6] ?? 0) << 8) | (payload[22] ?? 0)) : null,
        priming_flag_or_speed_hi: payload[21] ?? null,
        priming_speed_high: payload[21] ?? null,
        priming_speed_low: payload[30] ?? null,
        priming_speed:
          payload.length > 30 ? (((payload[21] ?? 0) << 8) | (payload[30] ?? 0)) : null,
        trailing_bytes: payload.length > 31 ? [...payload.slice(31)] : [],
        trailing_config_byte: payload[30] ?? null
      };
    case 0x9b:
      return {
        payload_hex: payloadHex,
        payload_length: payload.length,
        pump_id: payload[0] ?? null,
        pump_type: payload[1] ?? null,
        priming_time: payload[2] ?? null,
        unknown_3: payload[3] ?? null,
        unknown_4: payload[4] ?? null,
        slots: decodePumpConfigSlots(payload),
        priming_speed_high: payload[21] ?? null,
        priming_speed_low: payload[30] ?? null,
        priming_speed:
          payload.length > 30 ? (((payload[21] ?? 0) << 8) | (payload[30] ?? 0)) : null,
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
      const circuitsByte = payload[2] ?? 0;
      const circuitsByte2 = payload[3] ?? 0;
      const circuitsByte3 = payload[4] ?? 0;
      const controllerModeByte = payload[9] ?? null;
      const circuits = decodeCircuitStates(circuitsByte, circuitsByte2, circuitsByte3);
      return [
        {
          subject: "equipment.state.controller",
          payload: {
            event_id: null,
            occurred_at: occurredAt,
            source,
            controller_hour_24: payload[0] ?? null,
            controller_minute: payload[1] ?? null,
            water_temp_f: payload[14] ?? null,
            air_temp_f: payload[18] ?? null,
            solar_temp_f: payload[19] ?? null,
            controller_mode_byte: controllerModeByte,
            controller_mode_label: decodeControllerModeLabel(controllerModeByte),
            controller_sub_model_byte: payload[27] ?? null,
            controller_model_byte: payload[28] ?? null,
            controller_model_family: decodeControllerModelFamily(payload[27] ?? null, payload[28] ?? null),
            controller_model_label: decodeControllerModelLabel(payload[27] ?? null, payload[28] ?? null),
            heater: {
              enabled: (payload[15] ?? 0) === 0x20
            },
            freeze_protection: controllerModeByte === null ? false : (controllerModeByte & 0x08) !== 0,
            mode: decodeControllerMode(circuits),
            active_circuit_keys: decodeActiveCircuitKeys(circuitsByte, circuitsByte2, circuitsByte3),
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
  if (hasDelimiter(frame, INTELLICHLOR_START_DELIMITER) && hasDelimiter(frame, INTELLICHLOR_END_DELIMITER, frame.length - 2)) {
    const destination = frame[2] ?? 0;
    const command = frame[3] ?? 0;
    const checksumByte = frame[frame.length - 3] ?? null;
    const payload = frame.slice(4, frame.length - 3);
    return {
      protocolName: "pentair_easytouch",
      frameFamily: "intellichlor",
      messageType: "intellichlor_frame",
      actionCode: `0x${command.toString(16).padStart(2, "0")}`,
      sourceAddress: "unknown",
      destinationAddress: `0x${destination.toString(16).padStart(2, "0")}`,
      checksumStatus: "unknown",
      fields: {
        payload_hex: bytesToHex(payload),
        payload_length: payload.length,
        checksum_byte: checksumByte
      },
      unknownFields: decodeUnknownFields(payload),
      normalizedEvents: []
    };
  }

  expectStartDelimiter(frame);
  expectValidPentairProtocolByte(frame);

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
    frameFamily: "pentair",
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

function buildPentairFrame(protocolByte: number, destination: number, source: number, actionCode: number, payload: number[]): Uint8Array {
  const frame = [0xff, 0x00, 0xff, 0xa5, protocolByte, destination, source, actionCode, payload.length, ...payload];
  const checksum = frame.slice(3).reduce((sum, byte) => (sum + byte) & 0xffff, 0);
  frame.push((checksum >> 8) & 0xff, checksum & 0xff);
  return Uint8Array.from(frame);
}

function parseExactHex(bytesHex: string): Uint8Array {
  if (!/^[0-9a-f]+$/.test(bytesHex) || bytesHex.length % 2 !== 0) {
    throw new ProtocolCommandError("Raw frame bytes must be even-length lowercase hex.", "invalid_raw_bytes_hex");
  }

  const bytes = new Uint8Array(bytesHex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(bytesHex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function parseByteArgument(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 255) {
    throw new ProtocolCommandError(`${fieldName} must be an integer byte between 0 and 255.`, "command_arguments_invalid");
  }
  return value;
}

function parseRpmArgument(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 3450) {
    throw new ProtocolCommandError(`${fieldName} must be an integer RPM between 0 and 3450.`, "command_arguments_invalid");
  }
  return value;
}

function decodeFixedWidthAscii(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => String.fromCharCode(byte))
    .join("")
    .replace(/\s+$/g, "");
}

function buildPumpConfigPayload(argumentsValue: Record<string, unknown>): number[] {
  const pumpId = parseByteArgument(argumentsValue.pump_id, "pump_id");
  const pumpType = parseByteArgument(argumentsValue.pump_type, "pump_type");
  const primingTime = parseByteArgument(argumentsValue.priming_time, "priming_time");
  const unknown3 = parseByteArgument(argumentsValue.unknown_3, "unknown_3");
  const unknown4 = parseByteArgument(argumentsValue.unknown_4, "unknown_4");
  const primingSpeed = parseRpmArgument(argumentsValue.priming_speed, "priming_speed");

  const slotsValue = argumentsValue.slots;
  if (!Array.isArray(slotsValue) || slotsValue.length !== 8) {
    throw new ProtocolCommandError("write_pump_config requires slots as an array of 8 entries.", "command_arguments_invalid");
  }

  const payload = new Array<number>(31).fill(0);
  payload[0] = pumpId;
  payload[1] = pumpType;
  payload[2] = primingTime;
  payload[3] = unknown3;
  payload[4] = unknown4;

  for (let index = 0; index < 8; index += 1) {
    const slotValue = slotsValue[index];
    if (!slotValue || typeof slotValue !== "object" || Array.isArray(slotValue)) {
      throw new ProtocolCommandError(`slots[${index}] must be an object.`, "command_arguments_invalid");
    }

    const slot = slotValue as Record<string, unknown>;
    const circuitAssignment = parseByteArgument(slot.circuit_assignment, `slots[${index}].circuit_assignment`);
    const rpm = parseRpmArgument(slot.rpm, `slots[${index}].rpm`);
    const speedHigh = (rpm >> 8) & 0xff;
    const speedLow = rpm & 0xff;

    payload[5 + index * 2] = circuitAssignment;
    payload[6 + index * 2] = speedHigh;
    payload[22 + index] = speedLow;
  }

  payload[21] = (primingSpeed >> 8) & 0xff;
  payload[30] = primingSpeed & 0xff;

  const trailingBytesValue = argumentsValue.trailing_bytes;
  if (trailingBytesValue == null) {
    return payload;
  }

  if (!Array.isArray(trailingBytesValue)) {
    throw new ProtocolCommandError("trailing_bytes must be an array of bytes when provided.", "command_arguments_invalid");
  }

  return [
    ...payload,
    ...trailingBytesValue.map((value, index) => parseByteArgument(value, `trailing_bytes[${index}]`))
  ];
}

function readProtocolConfigObject(value: unknown, fieldName: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProtocolCommandError(`${fieldName} must be a JSON object when provided.`, "command_arguments_invalid");
  }

  return value as Record<string, unknown>;
}

function resolveControllerCircuitSpeedConfig(protocolConfig: Record<string, unknown>): {
  pumpSlot: number;
  circuitAssignments: Record<string, number>;
} {
  const raw = protocolConfig.controller_circuit_speed;
  if (raw == null) {
    return {
      pumpSlot: DEFAULT_CONTROLLER_CIRCUIT_SPEED_CONFIG.pumpSlot,
      circuitAssignments: { ...DEFAULT_CONTROLLER_CIRCUIT_SPEED_CONFIG.circuitAssignments }
    };
  }

  const config = readProtocolConfigObject(raw, "controller_circuit_speed");
  const rawPumpSlot = config.pump_slot;
  const pumpSlot =
    rawPumpSlot == null
      ? DEFAULT_CONTROLLER_CIRCUIT_SPEED_CONFIG.pumpSlot
      : parseByteArgument(rawPumpSlot, "controller_circuit_speed.pump_slot");

  const rawAssignments = config.circuit_assignments;
  if (rawAssignments == null) {
    return {
      pumpSlot,
      circuitAssignments: { ...DEFAULT_CONTROLLER_CIRCUIT_SPEED_CONFIG.circuitAssignments }
    };
  }

  const assignments = readProtocolConfigObject(rawAssignments, "controller_circuit_speed.circuit_assignments");
  return {
    pumpSlot,
    circuitAssignments: Object.fromEntries(
      Object.entries(assignments).map(([key, value]) => [
        key,
        parseByteArgument(value, `controller_circuit_speed.circuit_assignments.${key}`)
      ])
    )
  };
}

function toPumpConfigSlots(value: unknown): Array<{ circuit_assignment: number; rpm: number }> | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const slots: Array<{ circuit_assignment: number; rpm: number }> = [];
  for (const [index, entry] of value.entries()) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new ProtocolCommandError(`slots[${index}] must be an object.`, "command_arguments_invalid");
    }

    const slot = entry as Record<string, unknown>;
    slots.push({
      circuit_assignment: parseByteArgument(slot.circuit_assignment, `slots[${index}].circuit_assignment`),
      rpm: parseRpmArgument(slot.rpm, `slots[${index}].rpm`)
    });
  }

  return slots;
}

function encodePentairCommand(intent: NormalizedCommandIntent, protocolConfig: Record<string, unknown>): CommandEncodingPlan {
  if (intent.command_type === "send_raw_frame") {
    const bytesHex = intent.arguments.bytes_hex;
    if (typeof bytesHex !== "string") {
      throw new ProtocolCommandError("Raw frame command requires string bytes_hex.", "command_arguments_invalid");
    }

    const bytes = parseExactHex(bytesHex);
    return {
      protocolName: "pentair_easytouch",
      writes: [
        {
          bytes,
          bytesHex,
          busRequirements: {
            requires_idle_ms: DEFAULT_IDLE_MS
          }
        }
      ],
      correlation: {
        kind: "transport_ack"
      }
    };
  }

  if (intent.command_type === "request_remote_layout_page") {
    const pageIndex = intent.arguments.page_index;
    if (typeof pageIndex !== "number" || !Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex > 255) {
      throw new ProtocolCommandError("Pentair Remote Layout requests require an integer page_index between 0 and 255.", "command_arguments_invalid");
    }

    const bytes = buildPentairFrame(0x01, CONTROLLER_ADDRESS, SPLASH_REMOTE_ADDRESS, 0xe1, [pageIndex]);
    return {
      protocolName: "pentair_easytouch",
      writes: [
        {
          bytes,
          bytesHex: bytesToHex(bytes),
          busRequirements: {
            requires_idle_ms: DEFAULT_IDLE_MS
          }
        }
      ],
      correlation: {
        kind: "transport_ack"
      }
    };
  }

  if (intent.command_type === "request_pump_info") {
    const pumpSlot = intent.arguments.pump_slot;
    if (typeof pumpSlot !== "number" || !Number.isInteger(pumpSlot) || pumpSlot < 1 || pumpSlot > 2) {
      throw new ProtocolCommandError("Pentair pump info requests require an integer pump_slot of 1 or 2.", "command_arguments_invalid");
    }

    const bytes = buildPentairFrame(0x34, CONTROLLER_ADDRESS, SPLASH_REMOTE_ADDRESS, 0xd8, [pumpSlot]);
    return {
      protocolName: "pentair_easytouch",
      writes: [
        {
          bytes,
          bytesHex: bytesToHex(bytes),
          busRequirements: {
            requires_idle_ms: DEFAULT_IDLE_MS
          }
        }
      ],
      correlation: {
        kind: "transport_ack"
      }
    };
  }

  if (intent.command_type === "request_controller_datetime") {
    const bytes = buildPentairFrame(0x01, CONTROLLER_ADDRESS, SPLASH_REMOTE_ADDRESS, 0xc5, [0x00]);
    return {
      protocolName: "pentair_easytouch",
      writes: [
        {
          bytes,
          bytesHex: bytesToHex(bytes),
          busRequirements: {
            requires_idle_ms: DEFAULT_IDLE_MS
          }
        }
      ],
      correlation: {
        kind: "transport_ack"
      }
    };
  }

  if (intent.command_type === "sync_controller_datetime") {
    const month = parseByteArgument(intent.arguments.month, "month");
    const day = parseByteArgument(intent.arguments.day, "day");
    const year = parseByteArgument(intent.arguments.year, "year");
    const dayOfWeek = parseByteArgument(intent.arguments.day_of_week, "day_of_week");
    const hour24 = parseByteArgument(intent.arguments.hour_24, "hour_24");
    const minute = parseByteArgument(intent.arguments.minute, "minute");

    const bytes = buildPentairFrame(0x01, CONTROLLER_ADDRESS, SPLASH_REMOTE_ADDRESS, 0x85, [
      month,
      day,
      year,
      dayOfWeek,
      hour24,
      minute
    ]);
    return {
      protocolName: "pentair_easytouch",
      writes: [
        {
          bytes,
          bytesHex: bytesToHex(bytes),
          busRequirements: {
            requires_idle_ms: DEFAULT_IDLE_MS
          }
        }
      ],
      correlation: {
        kind: "transport_ack"
      }
    };
  }

  if (intent.command_type === "request_circuit_config") {
    const startIndex = intent.arguments.start_index;
    const endIndex = intent.arguments.end_index;
    if (typeof startIndex !== "number" || !Number.isInteger(startIndex) || startIndex < 1 || startIndex > 255) {
      throw new ProtocolCommandError("Pentair circuit config requests require integer start_index between 1 and 255.", "command_arguments_invalid");
    }
    if (typeof endIndex !== "number" || !Number.isInteger(endIndex) || endIndex < 1 || endIndex > 255) {
      throw new ProtocolCommandError("Pentair circuit config requests require integer end_index between 1 and 255.", "command_arguments_invalid");
    }
    if (endIndex < startIndex) {
      throw new ProtocolCommandError("Pentair circuit config requests require end_index >= start_index.", "command_arguments_invalid");
    }
    if (endIndex - startIndex + 1 > 32) {
      throw new ProtocolCommandError("Pentair circuit config requests are limited to 32 indexes at a time.", "command_arguments_invalid");
    }

    const writes = Array.from({ length: endIndex - startIndex + 1 }, (_, offset) => {
      const circuitIndex = startIndex + offset;
      const bytes = buildPentairFrame(0x34, CONTROLLER_ADDRESS, SPLASH_REMOTE_ADDRESS, 0xcb, [circuitIndex]);
      return {
        bytes,
        bytesHex: bytesToHex(bytes),
        busRequirements: {
          requires_idle_ms: DEFAULT_IDLE_MS
        }
      };
    });

    return {
      protocolName: "pentair_easytouch",
      writes,
      correlation: {
        kind: "controller_circuit_config",
        startIndex,
        endIndex
      }
    };
  }

  if (intent.command_type === "request_custom_name") {
    const nameIndex = intent.arguments.name_index;
    if (typeof nameIndex !== "number" || !Number.isInteger(nameIndex) || nameIndex < 0 || nameIndex > 9) {
      throw new ProtocolCommandError("Pentair custom name requests require integer name_index between 0 and 9.", "command_arguments_invalid");
    }

    const bytes = buildPentairFrame(0x34, CONTROLLER_ADDRESS, SPLASH_REMOTE_ADDRESS, 0xca, [nameIndex]);
    return {
      protocolName: "pentair_easytouch",
      writes: [
        {
          bytes,
          bytesHex: bytesToHex(bytes),
          busRequirements: {
            requires_idle_ms: DEFAULT_IDLE_MS
          }
        }
      ],
      correlation: {
        kind: "transport_ack"
      }
    };
  }

  if (intent.command_type === "request_controller_software_version") {
    const bytes = buildPentairFrame(0x34, CONTROLLER_ADDRESS, SPLASH_REMOTE_ADDRESS, 0xfd, []);
    return {
      protocolName: "pentair_easytouch",
      writes: [
        {
          bytes,
          bytesHex: bytesToHex(bytes),
          busRequirements: {
            requires_idle_ms: DEFAULT_IDLE_MS
          }
        }
      ],
      correlation: {
        kind: "transport_ack"
      }
    };
  }

  if (intent.command_type === "write_pump_config") {
    const payload = buildPumpConfigPayload(intent.arguments);
    const bytes = buildPentairFrame(0x34, CONTROLLER_ADDRESS, SPLASH_REMOTE_ADDRESS, 0x9b, payload);
    return {
      protocolName: "pentair_easytouch",
      writes: [
        {
          bytes,
          bytesHex: bytesToHex(bytes),
          busRequirements: {
            requires_idle_ms: DEFAULT_IDLE_MS
          }
        }
      ],
      correlation: {
        kind: "transport_ack"
      }
    };
  }

  if (intent.command_type === "set_circuit_state") {
    if (intent.target.equipment_type !== "circuit") {
      throw new ProtocolCommandError("Pentair set_circuit_state requires a controller circuit target.", "command_target_invalid");
    }

    const circuitId = parseByteArgument(intent.arguments.circuit_id, "circuit_id");
    const enabled = intent.arguments.enabled;
    if (typeof enabled !== "boolean") {
      throw new ProtocolCommandError("Pentair set_circuit_state requires boolean enabled.", "command_arguments_invalid");
    }

    const bytes = buildPentairFrame(0x34, CONTROLLER_ADDRESS, SPLASH_REMOTE_ADDRESS, 0x86, [circuitId, enabled ? 1 : 0]);
    return {
      protocolName: "pentair_easytouch",
      writes: [
        {
          bytes,
          bytesHex: bytesToHex(bytes),
          busRequirements: {
            requires_idle_ms: DEFAULT_IDLE_MS
          }
        }
      ],
      correlation: {
        kind: "controller_ack"
      }
    };
  }

  if (intent.command_type !== "set_speed") {
    throw new ProtocolCommandError(
      "pentair_easytouch only supports controller-circuit set_speed and set_circuit_state, manual circuit config requests, manual custom name requests, manual controller software-version requests, controller date/time requests and sync, manual pump info requests, manual pump config writes, manual Remote Layout requests, and Explorer raw frame sends in the current command slice.",
      "unsupported_command_encode"
    );
  }

  if (intent.target.equipment_type !== "circuit") {
    throw new ProtocolCommandError("Pentair milestone-1 set_speed requires a controller circuit target.", "command_target_invalid");
  }

  const circuitKey = typeof intent.target.circuit_key === "string" ? intent.target.circuit_key.trim() : "";
  if (!circuitKey) {
    throw new ProtocolCommandError("Pentair milestone-1 set_speed requires a target circuit_key.", "command_target_invalid");
  }

  const controllerConfig = resolveControllerCircuitSpeedConfig(protocolConfig);
  const selectorValue = controllerConfig.circuitAssignments[circuitKey];
  if (typeof selectorValue !== "number") {
    throw new ProtocolCommandError(`Pentair milestone-1 set_speed does not support circuit '${circuitKey}'.`, "command_target_invalid");
  }

  const rpm = parseTargetRpm(intent);
  const bytes = buildPentairFrame(0x34, CONTROLLER_ADDRESS, SPLASH_REMOTE_ADDRESS, 0xd8, [controllerConfig.pumpSlot]);

  return {
    protocolName: "pentair_easytouch",
    writes: [
      {
        bytes,
        bytesHex: bytesToHex(bytes),
        busRequirements: {
          requires_idle_ms: DEFAULT_IDLE_MS
        }
      }
    ],
    correlation: {
      kind: "controller_circuit_speed",
      targetRpm: rpm,
      pumpSlot: controllerConfig.pumpSlot,
      selectorValue,
      circuitKey
    }
  };
}

export function encodePentairPumpConfigWriteFromBaseline(input: {
  poolId: string;
  commandId: string;
  targetRpm: number;
  selectorValue: number;
  pumpSlot: number;
  fields: Record<string, unknown>;
}): CommandEncodingPlan {
  const pumpType = parseByteArgument(input.fields.pump_type, "fields.pump_type");
  const primingTime = parseByteArgument(input.fields.priming_time, "fields.priming_time");
  const unknown3 = parseByteArgument(input.fields.unknown_3, "fields.unknown_3");
  const unknown4 = parseByteArgument(input.fields.unknown_4, "fields.unknown_4");
  const primingSpeed = parseRpmArgument(input.fields.priming_speed, "fields.priming_speed");
  const slots = toPumpConfigSlots(input.fields.slots);
  if (!slots || slots.length !== 8) {
    throw new ProtocolCommandError("Pump info baseline must include 8 writable slots.", "command_baseline_invalid");
  }

  const slotIndex = slots.findIndex((slot) => slot.circuit_assignment === input.selectorValue);
  if (slotIndex < 0) {
    throw new ProtocolCommandError(
      `Pump config baseline did not include selector value ${input.selectorValue}.`,
      "command_target_invalid"
    );
  }

  const trailingBytesValue = input.fields.trailing_bytes;
  const trailingBytes = Array.isArray(trailingBytesValue)
    ? trailingBytesValue.map((value, index) => parseByteArgument(value, `fields.trailing_bytes[${index}]`))
    : [];

  const nextSlots = slots.map((slot, index) =>
    index === slotIndex ? { ...slot, rpm: input.targetRpm } : { ...slot }
  );

  return encodePentairCommand(
    {
      pool_id: input.poolId,
      command_id: input.commandId,
      requested_at: new Date().toISOString(),
      protocol_name: "pentair_easytouch",
      target: {
        equipment_type: "controller",
        bus_address: "0x10"
      },
      command_type: "write_pump_config",
      arguments: {
        pump_id: input.pumpSlot,
        pump_type: pumpType,
        priming_time: primingTime,
        unknown_3: unknown3,
        unknown_4: unknown4,
        slots: nextSlots,
        priming_speed: primingSpeed,
        trailing_bytes: trailingBytes
      },
      dry_run: false
    },
    {}
  );
}

export function encodePentairPumpInfoRequest(input: {
  poolId: string;
  commandId: string;
  pumpSlot: number;
}): CommandEncodingPlan {
  return encodePentairCommand(
    {
      pool_id: input.poolId,
      command_id: input.commandId,
      requested_at: new Date().toISOString(),
      protocol_name: "pentair_easytouch",
      target: {
        equipment_type: "controller",
        bus_address: "0x10"
      },
      command_type: "request_pump_info",
      arguments: {
        pump_slot: input.pumpSlot
      },
      dry_run: false
    },
    {}
  );
}

export function parsePentairPumpInfoFields(fields: Record<string, unknown>): {
  pumpSlot: number;
  slots: Array<{ circuit_assignment: number; rpm: number }>;
} {
  const pumpSlot = parseByteArgument(fields.pump_slot, "fields.pump_slot");
  const slots = toPumpConfigSlots(fields.slots);
  if (!slots || slots.length !== 8) {
    throw new ProtocolCommandError("Pump info frame did not include 8 decoded slots.", "command_baseline_invalid");
  }

  return { pumpSlot, slots };
}

export const pentairEasyTouchPlugin: ProtocolPlugin = {
  id: "pentair_easytouch",
  status: "active",
  version: "0.1.0",
  decodeFrame(frame, context) {
    return decodePentairFrame(frame, context);
  },
  encodeCommand(intent, protocolConfig) {
    return encodePentairCommand(intent, protocolConfig);
  }
};
