const EASYTOUCH_HEAT_PUMP_PROTOCOL_BYTE = 0x34;
const CONTROLLER_ADDRESS = 0x10;
const SPLASH_REMOTE_ADDRESS = 0x21;

export const EASYTOUCH_ACTION_HEAT_STATUS = 0x08;
export const EASYTOUCH_ACTION_SOLAR_HEAT_PUMP_STATUS = 0x22;
export const EASYTOUCH_ACTION_SET_HEAT_TEMPERATURE = 0x88;
export const EASYTOUCH_ACTION_SET_SOLAR_HEAT_PUMP = 0xa2;

export const HEATER_TYPE_GAS = 1;
export const HEATER_TYPE_SOLAR = 2;
export const HEATER_TYPE_ULTRATEMP_HEATPUMP_COM = 3;
export const HEATER_TYPE_ULTRATEMP_ETI_HYBRID = 4;

const DEFAULT_MINIMUM_SETPOINT_F = 40;
const DEFAULT_MAXIMUM_SETPOINT_F = 104;
const ULTRATEMP_HEAT_PUMP_COM_BYTE_0 = 0x02;
const ULTRATEMP_HEAT_PUMP_COM_BYTE_1 = 0x10;
const ULTRATEMP_COOLING_ENABLED_BIT = 0x20;
const ULTRATEMP_HEATING_ENABLED_BIT = 0x01;
const ULTRATEMP_COOLING_STATUS_BIT = 0x02;
const ULTRATEMP_FREEZE_PROTECTION_BIT = 0x80;
const ULTRATEMP_ETI_HYBRID_PAYLOAD = [0x05, 0x10, 0x76] as const;

export type EasyTouchHeaterType =
  | "gas"
  | "solar"
  | "ultratempHeatPumpCom"
  | "ultratempEtiHybrid";

export interface EasyTouchSetHeatTemperatureInput {
  poolSetpoint: number;
  spaSetpoint: number;
  poolHeatMode: number;
  spaHeatMode: number;
  coolSetpoint?: number;
}

export interface EasyTouchSetHeatTemperatureValidationOptions {
  minimumSetpointF?: number;
  maximumSetpointF?: number;
}

export interface EasyTouchSetSolarHeatPumpInput {
  heaterType: EasyTouchHeaterType;
  coolingEnabled?: boolean;
  freezeProtectionEnabled?: boolean;
}

export interface EasyTouchSolarHeatPumpStatus {
  solarOrHeatPumpEnabled: boolean;
  heatingEnabled?: boolean;
  coolingEnabled?: boolean;
  freezeProtectionEnabled?: boolean;
  detectedHeaterType?: EasyTouchHeaterType | "unknown";
  raw: number[];
}

export class EasyTouchHeatPumpPayloadValidationError extends Error {
  readonly code = "heat_pump_payload_invalid";

  constructor(
    message: string,
    readonly details: Record<string, string>
  ) {
    super(message);
    this.name = "EasyTouchHeatPumpPayloadValidationError";
  }
}

export class EasyTouchHeatPumpUnsupportedOperationError extends Error {
  readonly code = "heat_pump_operation_unsupported";

  constructor(
    message: string,
    readonly details: Record<string, string>
  ) {
    super(message);
    this.name = "EasyTouchHeatPumpUnsupportedOperationError";
  }
}

export function buildEasyTouchSetHeatTemperaturePayload(
  input: EasyTouchSetHeatTemperatureInput,
  options: EasyTouchSetHeatTemperatureValidationOptions = {}
): number[] {
  const minimumSetpointF = options.minimumSetpointF ?? DEFAULT_MINIMUM_SETPOINT_F;
  const maximumSetpointF = options.maximumSetpointF ?? DEFAULT_MAXIMUM_SETPOINT_F;

  validateIntegerRange(minimumSetpointF, "minimumSetpointF", 0, 255, "Minimum setpoint");
  validateIntegerRange(maximumSetpointF, "maximumSetpointF", 0, 255, "Maximum setpoint");

  if (minimumSetpointF > maximumSetpointF) {
    throw new EasyTouchHeatPumpPayloadValidationError("EasyTouch heat setpoint validation range is invalid.", {
      minimumSetpointF: "minimumSetpointF must be less than or equal to maximumSetpointF.",
      maximumSetpointF: "maximumSetpointF must be greater than or equal to minimumSetpointF."
    });
  }

  validateIntegerRange(input.poolSetpoint, "poolSetpoint", minimumSetpointF, maximumSetpointF, "Pool heat setpoint");
  validateIntegerRange(input.spaSetpoint, "spaSetpoint", minimumSetpointF, maximumSetpointF, "Spa heat setpoint");
  validateHeatMode(input.poolHeatMode, "poolHeatMode");
  validateHeatMode(input.spaHeatMode, "spaHeatMode");

  const coolSetpoint = input.coolSetpoint ?? 0;
  validateIntegerRange(coolSetpoint, "coolSetpoint", 0, 255, "Cool setpoint");

  return [
    input.poolSetpoint,
    input.spaSetpoint,
    ((input.spaHeatMode & 0x03) << 2) | (input.poolHeatMode & 0x03),
    coolSetpoint
  ];
}

export function buildEasyTouchSetSolarHeatPumpPayload(input: EasyTouchSetSolarHeatPumpInput): number[] {
  switch (input.heaterType) {
    case "gas":
      throw new EasyTouchHeatPumpUnsupportedOperationError("Gas heater EasyTouch config payload construction is not yet documented.", {
        heaterType: "gas"
      });
    case "solar":
      throw new EasyTouchHeatPumpUnsupportedOperationError("Solar-only EasyTouch config payload construction is not yet documented.", {
        heaterType: "solar"
      });
    case "ultratempHeatPumpCom":
      return [
        ULTRATEMP_HEAT_PUMP_COM_BYTE_0,
        ULTRATEMP_HEAT_PUMP_COM_BYTE_1 |
          (input.coolingEnabled ? ULTRATEMP_COOLING_ENABLED_BIT : 0) |
          (input.freezeProtectionEnabled ? ULTRATEMP_FREEZE_PROTECTION_BIT : 0),
        0
      ];
    case "ultratempEtiHybrid":
      return [...ULTRATEMP_ETI_HYBRID_PAYLOAD];
    default:
      throw new EasyTouchHeatPumpUnsupportedOperationError("Unsupported EasyTouch heater type for solar/heat pump configuration.", {
        heaterType: String((input as { heaterType?: unknown }).heaterType ?? "unknown")
      });
  }
}

export function parseEasyTouchSolarHeatPumpStatusPayload(payload: Uint8Array | number[]): EasyTouchSolarHeatPumpStatus {
  const raw = Array.isArray(payload) ? [...payload] : [...payload];
  if (raw.length < 2) {
    throw new EasyTouchHeatPumpPayloadValidationError("EasyTouch solar/heat pump status payload must contain at least two bytes.", {
      payload: "Provide at least payload bytes 0 and 1."
    });
  }

  const byte0 = raw[0] ?? 0;
  const byte1 = raw[1] ?? 0;
  const byte2 = raw[2] ?? 0;
  const solarOrHeatPumpEnabled = (byte0 & ULTRATEMP_HEAT_PUMP_COM_BYTE_0) !== 0;
  const heatingEnabled = (byte1 & ULTRATEMP_HEATING_ENABLED_BIT) !== 0;
  const coolingEnabled = (byte1 & ULTRATEMP_COOLING_STATUS_BIT) !== 0;
  const freezeProtectionEnabled = (byte1 & ULTRATEMP_FREEZE_PROTECTION_BIT) !== 0;

  let detectedHeaterType: EasyTouchSolarHeatPumpStatus["detectedHeaterType"] = "unknown";

  if (byte0 === ULTRATEMP_ETI_HYBRID_PAYLOAD[0] && byte1 === ULTRATEMP_ETI_HYBRID_PAYLOAD[1] && byte2 === ULTRATEMP_ETI_HYBRID_PAYLOAD[2]) {
    detectedHeaterType = "ultratempEtiHybrid";
  } else if (solarOrHeatPumpEnabled && (byte1 & ULTRATEMP_HEAT_PUMP_COM_BYTE_1) !== 0) {
    detectedHeaterType = "ultratempHeatPumpCom";
  } else if (solarOrHeatPumpEnabled) {
    detectedHeaterType = "solar";
  } else if (!solarOrHeatPumpEnabled && (byte1 & (ULTRATEMP_HEAT_PUMP_COM_BYTE_1 | ULTRATEMP_COOLING_ENABLED_BIT)) === 0) {
    detectedHeaterType = "gas";
  }

  return {
    solarOrHeatPumpEnabled,
    heatingEnabled,
    coolingEnabled,
    freezeProtectionEnabled,
    detectedHeaterType,
    raw
  };
}

export function createSetHeatTemperatureFrame(
  input: EasyTouchSetHeatTemperatureInput,
  options: EasyTouchSetHeatTemperatureValidationOptions = {}
): Uint8Array {
  return buildPentairFrame(
    EASYTOUCH_HEAT_PUMP_PROTOCOL_BYTE,
    CONTROLLER_ADDRESS,
    SPLASH_REMOTE_ADDRESS,
    EASYTOUCH_ACTION_SET_HEAT_TEMPERATURE,
    buildEasyTouchSetHeatTemperaturePayload(input, options)
  );
}

export function createSetSolarHeatPumpFrame(input: EasyTouchSetSolarHeatPumpInput): Uint8Array {
  return buildPentairFrame(
    EASYTOUCH_HEAT_PUMP_PROTOCOL_BYTE,
    CONTROLLER_ADDRESS,
    SPLASH_REMOTE_ADDRESS,
    EASYTOUCH_ACTION_SET_SOLAR_HEAT_PUMP,
    buildEasyTouchSetSolarHeatPumpPayload(input)
  );
}

function validateHeatMode(value: number, fieldName: string): void {
  validateIntegerRange(value, fieldName, 0, 3, `${fieldName} heat mode`);
}

function validateIntegerRange(value: number, fieldName: string, min: number, max: number, label: string): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new EasyTouchHeatPumpPayloadValidationError(`${label} must be an integer between ${min} and ${max}.`, {
      [fieldName]: `${fieldName} must be an integer between ${min} and ${max}.`
    });
  }
}

function buildPentairFrame(
  protocolByte: number,
  destination: number,
  source: number,
  actionCode: number,
  payload: number[]
): Uint8Array {
  const frame = [
    0xff,
    0x00,
    0xff,
    0xa5,
    protocolByte,
    destination,
    source,
    actionCode,
    payload.length,
    ...payload
  ];
  const checksum = frame.slice(3).reduce((sum, byte) => (sum + byte) & 0xffff, 0);
  frame.push((checksum >> 8) & 0xff, checksum & 0xff);
  return Uint8Array.from(frame);
}

// TODO: Validate additional EasyTouch action 162 payload variants before supporting gas or solar-only config writes.
// TODO: Direct UltraTemp action 114/115 transmission remains research-only until packet captures validate safe ownership transfer from EasyTouch.
