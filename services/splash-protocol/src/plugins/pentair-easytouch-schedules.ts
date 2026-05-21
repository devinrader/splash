const EASYTOUCH_SCHEDULE_WRITE_ACTION = 0x91;
const EASYTOUCH_SCHEDULE_PROTOCOL_BYTE = 0x34;
const CONTROLLER_ADDRESS = 0x10;
const SPLASH_REMOTE_ADDRESS = 0x21;
const EASYTOUCH_EGG_TIMER_MARKER = 25;

const EASYTOUCH_DAY_BITS = {
  sunday: 0x01,
  monday: 0x02,
  tuesday: 0x04,
  wednesday: 0x08,
  thursday: 0x10,
  friday: 0x20,
  saturday: 0x40
} as const;

const EASYTOUCH_DAY_ORDER = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday"
] as const;

export type EasyTouchDay = (typeof EASYTOUCH_DAY_ORDER)[number];

export interface EasyTouchSchedulePayloadInput {
  scheduleId: number;
  circuitId: number;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  days: EasyTouchDay[] | number;
}

export interface EasyTouchEggTimerPayloadInput {
  scheduleId: number;
  circuitId: number;
  runtimeHours: number;
  runtimeMinutes: number;
}

export class EasyTouchSchedulePayloadValidationError extends Error {
  readonly code = "schedule_payload_invalid";

  constructor(
    message: string,
    readonly details: Record<string, string>
  ) {
    super(message);
    this.name = "EasyTouchSchedulePayloadValidationError";
  }
}

export function buildEasyTouchDayMask(days: EasyTouchDay[] | number): number {
  if (typeof days === "number") {
    validateIntegerRange(days, "days", 1, 127, "Repeating schedule day mask");
    return days & 0x7f;
  }

  if (!Array.isArray(days) || days.length === 0) {
    throw new EasyTouchSchedulePayloadValidationError("EasyTouch repeating schedules require at least one day.", {
      days: "Provide a non-empty EasyTouch day array."
    });
  }

  const normalizedDays = new Set<EasyTouchDay>();
  for (const day of days) {
    if (!isEasyTouchDay(day)) {
      throw new EasyTouchSchedulePayloadValidationError("EasyTouch repeating schedules received an unknown day label.", {
        days: `Unsupported day '${String(day)}'.`
      });
    }
    normalizedDays.add(day);
  }

  let mask = 0;
  for (const day of normalizedDays) {
    mask |= EASYTOUCH_DAY_BITS[day];
  }

  if (mask < 1 || mask > 127) {
    throw new EasyTouchSchedulePayloadValidationError("EasyTouch repeating schedules require a day mask between 1 and 127.", {
      days: "Resolved day mask was outside the supported 7-bit range."
    });
  }

  return mask;
}

export function parseEasyTouchDayMask(mask: number): EasyTouchDay[] {
  validateIntegerRange(mask, "mask", 0, 127, "EasyTouch day mask");

  return EASYTOUCH_DAY_ORDER.filter((day) => (mask & EASYTOUCH_DAY_BITS[day]) !== 0);
}

export function buildEasyTouchSchedulePayload(input: EasyTouchSchedulePayloadInput): number[] {
  validateScheduleId(input.scheduleId);
  validateCircuitId(input.circuitId);
  validateIntegerRange(input.startHour, "startHour", 0, 23, "EasyTouch schedule start hour");
  validateIntegerRange(input.startMinute, "startMinute", 0, 59, "EasyTouch schedule start minute");
  validateIntegerRange(input.endHour, "endHour", 0, 23, "EasyTouch schedule end hour");
  validateIntegerRange(input.endMinute, "endMinute", 0, 59, "EasyTouch schedule end minute");

  const dayMask = buildEasyTouchDayMask(input.days);

  return [
    input.scheduleId,
    input.circuitId & 0x7f,
    input.startHour,
    input.startMinute,
    input.endHour,
    input.endMinute,
    dayMask
  ];
}

export function buildEasyTouchEggTimerPayload(input: EasyTouchEggTimerPayloadInput): number[] {
  validateScheduleId(input.scheduleId);
  validateCircuitId(input.circuitId);
  validateIntegerRange(input.runtimeHours, "runtimeHours", 0, 23, "EasyTouch egg timer runtime hours");
  validateIntegerRange(input.runtimeMinutes, "runtimeMinutes", 0, 59, "EasyTouch egg timer runtime minutes");

  if (input.runtimeHours === 0 && input.runtimeMinutes === 0) {
    throw new EasyTouchSchedulePayloadValidationError("EasyTouch egg timer runtime must be greater than zero.", {
      runtime: "Provide a non-zero egg timer runtime."
    });
  }

  return [
    input.scheduleId,
    input.circuitId & 0x7f,
    EASYTOUCH_EGG_TIMER_MARKER,
    0,
    input.runtimeHours,
    input.runtimeMinutes,
    0
  ];
}

export function buildEasyTouchScheduleSetCommandFrame(payload: number[]): Uint8Array {
  if (!Array.isArray(payload) || payload.length !== 7) {
    throw new EasyTouchSchedulePayloadValidationError("EasyTouch set-schedule frame payload must contain exactly 7 bytes.", {
      payload: "Provide a validated seven-byte EasyTouch schedule payload."
    });
  }

  for (const [index, value] of payload.entries()) {
    validateIntegerRange(value, `payload[${index}]`, 0, 255, "EasyTouch set-schedule payload byte");
  }

  return buildPentairFrame(
    EASYTOUCH_SCHEDULE_PROTOCOL_BYTE,
    CONTROLLER_ADDRESS,
    SPLASH_REMOTE_ADDRESS,
    EASYTOUCH_SCHEDULE_WRITE_ACTION,
    payload
  );
}

function isEasyTouchDay(value: unknown): value is EasyTouchDay {
  return typeof value === "string" && value in EASYTOUCH_DAY_BITS;
}

function validateScheduleId(scheduleId: number): void {
  validateIntegerRange(scheduleId, "scheduleId", 0, 255, "EasyTouch schedule id");
}

function validateCircuitId(circuitId: number): void {
  validateIntegerRange(circuitId, "circuitId", 1, 255, "EasyTouch circuit id");
  if ((circuitId & 0x7f) === 0) {
    throw new EasyTouchSchedulePayloadValidationError("EasyTouch circuit id must not resolve to 0 after 0x7f masking.", {
      circuitId: "Provide a circuit id whose lower 7 bits are between 1 and 127."
    });
  }
}

function validateIntegerRange(value: number, fieldName: string, min: number, max: number, label: string): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new EasyTouchSchedulePayloadValidationError(`${label} must be an integer between ${min} and ${max}.`, {
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

// TODO: Validate run-once schedule payload construction before supporting it.
// TODO: Validate controller-side delete or disable schedule behavior before adding builders for those operations.
// TODO: IntelliCenter schedule table mutations use a different model and are intentionally excluded here.
