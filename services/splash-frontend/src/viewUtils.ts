import type { SplashIconName } from "./components/icons/SplashIcon";
import type { SystemHardwareDetailId } from "./navigation";
import type { ControllerCircuitHardwareRecord, EquipmentRecord, ProtocolFrameEvent } from "./types";

export interface ActivePlatformRequest {
  commandId: string;
  label: string;
  requestedAt: string;
  waitingFor: string;
  replyType: "circuit_configuration" | "controller_datetime" | null;
}

export interface PendingCircuitToggle {
  circuitKey: string;
  commandId: string;
  controllerUpdatedAt: string | null;
}

export interface SidebarStatusSummary {
  tone: "ok" | "warning" | "critical";
  label: string;
  summary: string;
  lastMessage: string;
  uptime: string;
}

export interface TopbarWeatherSummary {
  temperature: string;
  weatherDescription: string;
  precipitationPercent: string;
  precipitationDescription: string;
}

export interface ControllerCircuitDefinition {
  key: string;
  stateKey?: string;
  circuitId: number | null;
  configurationCircuitId: number | null;
  defaultName: string;
  circuitType: string;
  installed: boolean;
  writable: boolean;
  functionValue: number | null;
  functionLabel: string | null;
  nameValue: number | null;
  nameLabel: string | null;
  freezeFlag: boolean | null;
  highFlag: boolean | null;
}

export const CONTROLLER_CIRCUIT_DEFINITIONS: ControllerCircuitDefinition[] = [
  { key: "spa", circuitId: 1, configurationCircuitId: 1, defaultName: "Spa", circuitType: "fixed", installed: false, writable: true, functionValue: null, functionLabel: null, nameValue: null, nameLabel: null, freezeFlag: null, highFlag: null },
  { key: "pool", circuitId: 2, configurationCircuitId: 2, defaultName: "Pool", circuitType: "fixed", installed: true, writable: true, functionValue: null, functionLabel: null, nameValue: null, nameLabel: null, freezeFlag: null, highFlag: null },
  { key: "aux1", circuitId: 3, configurationCircuitId: 3, defaultName: "Aux 1", circuitType: "relay", installed: true, writable: true, functionValue: null, functionLabel: null, nameValue: null, nameLabel: null, freezeFlag: null, highFlag: null },
  { key: "aux2", circuitId: 4, configurationCircuitId: 4, defaultName: "Aux 2", circuitType: "relay", installed: true, writable: true, functionValue: null, functionLabel: null, nameValue: null, nameLabel: null, freezeFlag: null, highFlag: null },
  { key: "aux3", circuitId: 5, configurationCircuitId: 5, defaultName: "Aux 3", circuitType: "relay", installed: true, writable: true, functionValue: null, functionLabel: null, nameValue: null, nameLabel: null, freezeFlag: null, highFlag: null },
  { key: "aux4", circuitId: 6, configurationCircuitId: 6, defaultName: "Aux 4", circuitType: "relay", installed: true, writable: true, functionValue: null, functionLabel: null, nameValue: null, nameLabel: null, freezeFlag: null, highFlag: null },
  { key: "aux5", circuitId: 7, configurationCircuitId: 7, defaultName: "Aux 5", circuitType: "relay", installed: true, writable: true, functionValue: null, functionLabel: null, nameValue: null, nameLabel: null, freezeFlag: null, highFlag: null },
  { key: "aux6", circuitId: 8, configurationCircuitId: 8, defaultName: "Aux 6", circuitType: "relay", installed: true, writable: true, functionValue: null, functionLabel: null, nameValue: null, nameLabel: null, freezeFlag: null, highFlag: null },
  { key: "aux7", circuitId: 9, configurationCircuitId: 9, defaultName: "Aux 7", circuitType: "relay", installed: true, writable: true, functionValue: null, functionLabel: null, nameValue: null, nameLabel: null, freezeFlag: null, highFlag: null },
  { key: "feature1", stateKey: "pool_low", circuitId: 11, configurationCircuitId: 10, defaultName: "Feature 1", circuitType: "feature", installed: true, writable: true, functionValue: null, functionLabel: null, nameValue: null, nameLabel: null, freezeFlag: null, highFlag: null },
  { key: "feature2", stateKey: "pool_high", circuitId: 12, configurationCircuitId: 11, defaultName: "Feature 2", circuitType: "feature", installed: true, writable: true, functionValue: null, functionLabel: null, nameValue: null, nameLabel: null, freezeFlag: null, highFlag: null },
  { key: "feature3", stateKey: "cleaner", circuitId: 13, configurationCircuitId: 12, defaultName: "Feature 3", circuitType: "feature", installed: true, writable: true, functionValue: null, functionLabel: null, nameValue: null, nameLabel: null, freezeFlag: null, highFlag: null },
  { key: "feature4", circuitId: 14, configurationCircuitId: 13, defaultName: "Feature 4", circuitType: "feature", installed: true, writable: true, functionValue: null, functionLabel: null, nameValue: null, nameLabel: null, freezeFlag: null, highFlag: null },
  { key: "feature5", circuitId: 15, configurationCircuitId: 14, defaultName: "Feature 5", circuitType: "feature", installed: true, writable: true, functionValue: null, functionLabel: null, nameValue: null, nameLabel: null, freezeFlag: null, highFlag: null },
  { key: "feature6", circuitId: 16, configurationCircuitId: 15, defaultName: "Feature 6", circuitType: "feature", installed: true, writable: true, functionValue: null, functionLabel: null, nameValue: null, nameLabel: null, freezeFlag: null, highFlag: null },
  { key: "feature7", circuitId: 17, configurationCircuitId: 16, defaultName: "Feature 7", circuitType: "feature", installed: true, writable: true, functionValue: null, functionLabel: null, nameValue: null, nameLabel: null, freezeFlag: null, highFlag: null },
  { key: "feature8", circuitId: 18, configurationCircuitId: 17, defaultName: "Feature 8", circuitType: "feature", installed: true, writable: true, functionValue: null, functionLabel: null, nameValue: null, nameLabel: null, freezeFlag: null, highFlag: null },
  { key: "aux_extra", circuitId: null, configurationCircuitId: 18, defaultName: "Aux Extra", circuitType: "aux_extra", installed: true, writable: false, functionValue: null, functionLabel: null, nameValue: null, nameLabel: null, freezeFlag: null, highFlag: null }
];

export const KNOWN_CIRCUIT_FUNCTION_LABELS = [
  "Generic",
  "Spa",
  "Pool",
  "Spillway",
  "Master Cleaner",
  "MSTR CLEANER",
  "Solar",
  "Heat Boost",
  "Heat Enable",
  "Light",
  "SAM LIGHT",
  "SAL LIGHT",
  "PHOTON GEN",
  "COLOR WHEEL",
  "VALVE",
  "INTELLIBRITE",
  "MAGICSTREAM",
  "FLOOR CLEANER",
  "NOT USED",
  "LO-TEMP",
  "HI-TEMP",
  "Jets",
  "Aux",
  "Feature",
  "Laminar",
  "Waterfall",
  "Fountain",
  "Blower",
  "Pool Light",
  "Spa Light",
  "Landscape Light",
  "Booster Pump",
  "Heater",
  "Heat Pump",
  "Dimmer",
  "Unknown / Reserved",
  "Egg Timer Only"
] as const;

const BUILT_IN_CIRCUIT_NAME_LABELS = [
  "AERATOR",
  "AIR BLOWER",
  "AUX 10",
  "AUX 1",
  "AUX 2",
  "AUX 3",
  "AUX 4",
  "AUX 5",
  "AUX 6",
  "AUX 7",
  "AUX 8",
  "AUX 9",
  "AUX EXTRA",
  "BACK LIGHT",
  "BACKWASH",
  "BBQ LIGHT",
  "BEACH LIGHT",
  "BOOSTER PUMP",
  "BUG LIGHT",
  "CABANA LTS",
  "CHEM. FEEDER",
  "CHLORINATOR",
  "CLEANER",
  "COLOR WHEEL",
  "DECK LIGHT",
  "DRAIN LINE",
  "DRIVE LIGHT",
  "EDGE PUMP",
  "ENTRY LIGHT",
  "FAN",
  "FEATURE 1",
  "FEATURE 2",
  "FEATURE 3",
  "FEATURE 4",
  "FEATURE 5",
  "FEATURE 6",
  "FEATURE 7",
  "FEATURE 8",
  "FIBER OPTIC",
  "FIBER WORKS",
  "FILL LINE",
  "FLOOR CLNR",
  "FOGGER",
  "FOUNTAIN 1",
  "FOUNTAIN 2",
  "FOUNTAIN 3",
  "FOUNTAINS",
  "FOUNTAIN",
  "FRONT LIGHT",
  "GARDEN LTS",
  "GAZEBO LTS",
  "HI-TEMP",
  "HIGH SPEED",
  "HOUSE LIGHT",
  "JETS",
  "LIGHTS",
  "LO-TEMP",
  "LOW SPEED",
  "MALIBU LTS",
  "MIST",
  "MUSIC",
  "NOT USED",
  "OZONATOR",
  "PATH LIGHTS",
  "PATIO LTS",
  "PERIMETER L",
  "PG2000",
  "POND LIGHT",
  "POOL",
  "POOL HIGH",
  "POOL LIGHT",
  "POOL LOW",
  "POOL PUMP",
  "POOL SAM 1",
  "POOL SAM 2",
  "POOL SAM 3",
  "POOL SAM",
  "SECURITY LT",
  "SLIDE",
  "SOLAR",
  "SPA HIGH",
  "SPA LIGHT",
  "SPA LOW",
  "SPA SAL",
  "SPA SAM",
  "SPA WTRFLL",
  "SPA",
  "SPILLWAY",
  "SPRINKLERS",
  "STATUE LT",
  "STREAM",
  "SWIM JETS",
  "WATERFALL 1",
  "WATERFALL 2",
  "WATERFALL 3",
  "WATERFALL",
  "WHIRLPOOL",
  "WTR FEAT LT",
  "WTR FEATURE",
  "WTRFL LGHT",
  "YARD LIGHT"
] as const;

export function getCircuitFunctionOptions(currentLabel: string | null): string[] {
  return buildCircuitOptionList(currentLabel, KNOWN_CIRCUIT_FUNCTION_LABELS);
}

export function getCircuitNameOptions(currentLabel: string | null): string[] {
  return buildCircuitOptionList(currentLabel, [
    ...BUILT_IN_CIRCUIT_NAME_LABELS,
    "Custom Name 1",
    "Custom Name 2",
    "Custom Name 3",
    "Custom Name 4",
    "Custom Name 5",
    "Custom Name 6",
    "Custom Name 7",
    "Custom Name 8",
    "Custom Name 9",
    "Custom Name 10"
  ]);
}

function buildCircuitOptionList(currentLabel: string | null, options: readonly string[]): string[] {
  const labels = new Set<string>();
  const normalizedCurrent = typeof currentLabel === "string" && currentLabel.length > 0 ? currentLabel : null;
  if (normalizedCurrent !== null) {
    labels.add(normalizedCurrent);
  }
  for (const option of options) {
    labels.add(option);
  }
  return Array.from(labels);
}

export function getSidebarStatus(input: {
  healthStatus: "healthy" | "degraded" | "unhealthy" | "down" | "unknown";
  sseStatus: "connecting" | "connected" | "disconnected";
  errorMessage: string | null;
  commandStatus: string | null;
  commandDetail: string | null;
  lastMessageTime: string;
}): SidebarStatusSummary {
  if (
    input.errorMessage ||
    input.healthStatus === "degraded" ||
    input.healthStatus === "unhealthy" ||
    input.healthStatus === "down" ||
    input.sseStatus === "disconnected" ||
    input.commandStatus === "failed" ||
    input.commandStatus === "timed_out"
  ) {
    return {
      tone: "critical",
      label: "System failing",
      summary: "Immediate attention needed",
      lastMessage: input.lastMessageTime !== "Unavailable" ? input.lastMessageTime : "10:24 AM",
      uptime: "7d 14h"
    };
  }
  return {
    tone:
      input.healthStatus === "unknown" || input.sseStatus === "connecting" || input.commandStatus === "accepted" ? "warning" : "ok",
    label: "Online",
    summary: "All systems normal",
    lastMessage: input.lastMessageTime !== "Unavailable" ? input.lastMessageTime : "10:24 AM",
    uptime: "7d 14h"
  };
}

export function getTopbarWeatherSummary(): TopbarWeatherSummary {
  return {
    temperature: "78°F",
    weatherDescription: "Partly Cloudy",
    precipitationPercent: "0%",
    precipitationDescription: "Rain today"
  };
}

export function readMetric(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

export function readNullableNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

export function readNullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function formatMetric(value: number | null, unit: string): string {
  return value == null ? "Unavailable" : `${value} ${unit}`;
}

export function formatBoolean(value: unknown): string {
  if (typeof value !== "boolean") {
    return "Unavailable";
  }
  return value ? "Yes" : "No";
}

export function formatControllerTime(hour: unknown, minute: unknown): string {
  if (
    typeof hour !== "number" ||
    typeof minute !== "number" ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return "Unavailable";
  }
  return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
}

export function formatControllerDatetimeReply(value: unknown): string {
  const normalized = normalizeControllerDatetimeReply(value);
  if (!normalized) {
    return "Unavailable";
  }
  return `${normalized.month.toString().padStart(2, "0")}/${normalized.day
    .toString()
    .padStart(2, "0")}/${normalized.year.toString().padStart(2, "0")} ${normalized.hour
    .toString()
    .padStart(2, "0")}:${normalized.minute.toString().padStart(2, "0")}`;
}

export function formatTopbarDate(value: unknown): string {
  const normalized = normalizeControllerDatetimeReply(value);
  if (!normalized) {
    return "May 17, 2025";
  }
  const year = normalized.year >= 100 ? normalized.year : 2000 + normalized.year;
  const date = new Date(Date.UTC(year, normalized.month - 1, normalized.day));
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date);
}

export function formatTopbarTime(value: unknown): string {
  const normalized = normalizeControllerDatetimeReply(value);
  if (!normalized) {
    return "10:24 AM";
  }
  const date = new Date(Date.UTC(2025, 0, 1, normalized.hour, normalized.minute));
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC"
  }).format(date);
}

function normalizeControllerDatetimeReply(value: unknown): { month: number; day: number; year: number; hour: number; minute: number } | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const direct = {
    month: typeof record.month === "number" ? record.month : null,
    day: typeof record.day === "number" ? record.day : null,
    year: typeof record.year === "number" ? record.year : null,
    hour: typeof record.hour_24 === "number" ? record.hour_24 : null,
    minute: typeof record.minute === "number" ? record.minute : null
  };
  if (isValidControllerDatetimeReply(direct)) {
    return direct;
  }
  const legacy = {
    hour: typeof record.month === "number" ? record.month : null,
    minute: typeof record.day === "number" ? record.day : null,
    day: typeof record.day_of_week === "number" ? record.day_of_week : null,
    month: typeof record.hour_24 === "number" ? record.hour_24 : null,
    year: typeof record.minute === "number" ? record.minute : null
  };
  return isValidControllerDatetimeReply(legacy) ? legacy : null;
}

function isValidControllerDatetimeReply(value: {
  month: number | null;
  day: number | null;
  year: number | null;
  hour: number | null;
  minute: number | null;
}): value is { month: number; day: number; year: number; hour: number; minute: number } {
  return !(
    value.month == null ||
    value.day == null ||
    value.year == null ||
    value.hour == null ||
    value.minute == null ||
    value.month < 1 ||
    value.month > 12 ||
    value.day < 1 ||
    value.day > 31 ||
    value.hour < 0 ||
    value.hour > 23 ||
    value.minute < 0 ||
    value.minute > 59
  );
}

export function formatHexByte(value: unknown): string {
  return typeof value === "number" ? `0x${value.toString(16).padStart(2, "0")}` : "Unavailable";
}

export function formatLabel(value: unknown): string {
  return typeof value === "string" && value.length > 0 ? value : "Unavailable";
}

export function formatValueWithLabel(value: number | null, label: string | null): string {
  if (value === null && label === null) {
    return "Unavailable";
  }
  return `${value === null ? "Unavailable" : value.toString()} (${label ?? "Unavailable"})`;
}

export function formatCircuitKey(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatRequestTimestamp(value: string): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return value;
  }
  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

export function formatMessageLogTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--";
  }
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
    hour12: true
  }).format(date);
}

export function getMessageLogDirection(frame: ProtocolFrameEvent): "RX" | "TX" {
  return frame.event === "protocol.command.encoded" || frame.event === "serial.tx.raw" ? "TX" : "RX";
}

export function getMessageLogDirectionTone(frame: ProtocolFrameEvent): "rx" | "tx" {
  return getMessageLogDirection(frame).toLowerCase() as "rx" | "tx";
}

export function getMessageLogSource(frame: ProtocolFrameEvent): string {
  const source =
    readNullableString(frame.payload.source) ??
    readNullableString(frame.payload.source_name) ??
    readNullableString(frame.payload.device) ??
    readNullableString(frame.payload.origin);
  if (source) {
    return humanizeMessageToken(source);
  }
  if (frame.event === "protocol.command.encoded" || frame.event === "serial.tx.raw") {
    return "App / Client";
  }
  if (frame.event === "protocol.frame.raw" || frame.event === "protocol.frame.decoded") {
    return "Controller";
  }
  return "System";
}

export function getMessageLogType(frame: ProtocolFrameEvent): string {
  const messageType = readNullableString(frame.payload.message_type);
  if (messageType) {
    return humanizeMessageToken(messageType).toUpperCase();
  }
  if (frame.event === "protocol.command.encoded") {
    return "COMMAND";
  }
  if (frame.event === "serial.tx.raw") {
    return "TX RAW";
  }
  if (frame.event === "protocol.frame.raw") {
    return "RX RAW";
  }
  return "DATA";
}

export function getMessageLogIdData(frame: ProtocolFrameEvent): string {
  const actionCode = readNullableString(frame.payload.action_code);
  const frameId = readNullableString(frame.payload.frame_id);
  const bytesHex = readNullableString(frame.payload.bytes_hex) ?? readNullableString(frame.payload.payload_hex);
  const detail = readNullableString(frame.payload.detail);
  const segments = [actionCode ?? frameId, detail ?? summarizeFrameData(frame.payload), bytesHex].filter(
    (segment): segment is string => typeof segment === "string" && segment.length > 0
  );
  return segments.length > 0 ? segments.join(" · ") : "No additional data";
}

export function getMessageLogStatus(frame: ProtocolFrameEvent): string {
  const status = readNullableString(frame.payload.status);
  if (status) {
    return humanizeMessageToken(status).toUpperCase();
  }
  return readNullableString(frame.payload.error_code) ? "ERROR" : "OK";
}

export function getMessageLogStatusTone(frame: ProtocolFrameEvent): "ok" | "warn" | "error" {
  const status = readNullableString(frame.payload.status);
  if (status === "failed" || status === "timed_out") {
    return "error";
  }
  if (status === "pending" || status === "accepted") {
    return "warn";
  }
  return "ok";
}

export function formatMessagesPerSecond(frames: ProtocolFrameEvent[]): string {
  if (frames.length === 0) {
    return "0.0";
  }
  const cutoff = Date.now() - 1000;
  const count = frames.filter((frame) => {
    const time = new Date(frame.received_at).getTime();
    return !Number.isNaN(time) && time >= cutoff;
  }).length;
  return count.toFixed(1);
}

function humanizeMessageToken(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function isControllerCircuitMetadataMissing(controller: EquipmentRecord): boolean {
  const hardwareCircuits = controller.hardware?.circuits;
  if (!Array.isArray(hardwareCircuits) || hardwareCircuits.length === 0) {
    return false;
  }
  const circuitConfigurations =
    controller.latest_state.circuit_configurations != null &&
    typeof controller.latest_state.circuit_configurations === "object" &&
    !Array.isArray(controller.latest_state.circuit_configurations)
      ? (controller.latest_state.circuit_configurations as Record<string, unknown>)
      : {};
  return hardwareCircuits.some((circuit) => {
    if (!circuit.installed || typeof circuit.configuration_circuit_index !== "number") {
      return false;
    }
    const configuration = circuitConfigurations[String(circuit.configuration_circuit_index)];
    if (configuration == null || typeof configuration !== "object" || Array.isArray(configuration)) {
      return true;
    }
    const record = configuration as Record<string, unknown>;
    return readNullableNumber(record.function_value ?? record.functionValue) === null ||
      readNullableNumber(record.name_value ?? record.nameValue) === null;
  });
}

export function getControllerCircuitStates(
  hardwareCircuitsValue: ControllerCircuitHardwareRecord[] | undefined,
  circuitsValue: unknown,
  activeKeysValue: unknown,
  modeValue: unknown,
  circuitConfigurationsValue: unknown
): Array<{ circuit: ControllerCircuitDefinition; state: boolean | null }> {
  const circuits =
    circuitsValue != null && typeof circuitsValue === "object" && !Array.isArray(circuitsValue)
      ? (circuitsValue as Record<string, unknown>)
      : {};
  const activeKeys = new Set(readStringArray(activeKeysValue));
  const mode = typeof modeValue === "string" ? modeValue : null;
  const circuitConfigurations =
    circuitConfigurationsValue != null && typeof circuitConfigurationsValue === "object" && !Array.isArray(circuitConfigurationsValue)
      ? (circuitConfigurationsValue as Record<string, unknown>)
      : {};
  const hardwareCircuits =
    Array.isArray(hardwareCircuitsValue) && hardwareCircuitsValue.length > 0
      ? hardwareCircuitsValue.map((circuit) => mapHardwareCircuit(circuit))
      : CONTROLLER_CIRCUIT_DEFINITIONS;
  return hardwareCircuits.map((circuit) => {
    const configurationKey = typeof circuit.configurationCircuitId === "number" ? String(circuit.configurationCircuitId) : null;
    const configuredCircuit = configurationKey === null ? circuit : applyCircuitConfiguration(circuit, circuitConfigurations[configurationKey]);
    const stateKey = configuredCircuit.stateKey ?? configuredCircuit.key;
    const value = circuits[stateKey];
    if (typeof value === "boolean") {
      return {
        circuit: configuredCircuit,
        state: value || activeKeys.has(stateKey)
      };
    }
    const modeOverride = getModeOverrideForCircuit(configuredCircuit.key, mode);
    if (modeOverride !== null) {
      return { circuit: configuredCircuit, state: modeOverride };
    }
    return { circuit: configuredCircuit, state: activeKeys.has(stateKey) ? true : null };
  });
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === "string");
}

function applyCircuitConfiguration(circuit: ControllerCircuitDefinition, configurationValue: unknown): ControllerCircuitDefinition {
  if (configurationValue == null || typeof configurationValue !== "object" || Array.isArray(configurationValue)) {
    return circuit;
  }
  const configuration = configurationValue as Record<string, unknown>;
  return {
    ...circuit,
    functionValue: readNullableNumber(configuration.functionValue ?? configuration.function_value),
    functionLabel: readNullableString(configuration.functionLabel ?? configuration.function_label),
    nameValue: readNullableNumber(configuration.nameValue ?? configuration.name_value),
    nameLabel: readNullableString(configuration.nameLabel ?? configuration.name_label),
    freezeFlag:
      typeof (configuration.freezeFlag ?? configuration.freeze_flag) === "boolean"
        ? (configuration.freezeFlag ?? configuration.freeze_flag) as boolean
        : null,
    highFlag:
      typeof (configuration.highFlag ?? configuration.high_flag) === "boolean"
        ? (configuration.highFlag ?? configuration.high_flag) as boolean
        : null
  };
}

function getModeOverrideForCircuit(key: string, mode: string | null): boolean | null {
  if (key === "pool") {
    if (mode === "pool" || mode === "pool_spa") {
      return true;
    }
    if (mode === "spa") {
      return false;
    }
  }
  if (key === "spa") {
    if (mode === "spa" || mode === "pool_spa") {
      return true;
    }
    if (mode === "pool") {
      return false;
    }
  }
  return null;
}

export function formatCircuitStatePill(state: boolean | null): string {
  if (state === true) {
    return "On";
  }
  if (state === false) {
    return "Off";
  }
  return "Unavailable";
}

export function getCircuitStateClassName(state: boolean | null): string {
  if (state === true) {
    return "circuit-state-on";
  }
  if (state === false) {
    return "circuit-state-off";
  }
  return "circuit-state-unknown";
}

export function getStatusChipClassName(tone: "good" | "watch" | "muted"): string {
  if (tone === "good") {
    return "system-status-chip-good";
  }
  if (tone === "watch") {
    return "system-status-chip-watch";
  }
  return "system-status-chip-muted";
}

export function getHardwareDetailTitle(
  detail: SystemHardwareDetailId,
  controllerName: string | undefined,
  pumpName: string | undefined,
  chlorinatorName: string | undefined
): string {
  switch (detail) {
    case "easytouch8":
      return controllerName ?? "EasyTouch 8 Controller";
    case "intelliflo":
      return pumpName ?? "IntelliFlo Variable Speed Pump";
    case "intellichlor":
      return chlorinatorName ?? "IntelliChlor Salt Chlorinator";
    case "ultratemp":
      return "UltraTemp Pool Heat Pump";
  }
}

export function getHardwareDetailCode(detail: SystemHardwareDetailId): string {
  return detail === "easytouch8" ? "ET" : detail === "intelliflo" ? "IF" : detail === "intellichlor" ? "IC" : "UT";
}

export function getHardwareDetailSubtitle(detail: SystemHardwareDetailId): string {
  return detail === "easytouch8"
    ? "EasyTouch"
    : detail === "intelliflo"
      ? "IntelliFlo VSF"
      : detail === "intellichlor"
        ? "IntelliChlor Salt System"
        : "UltraTemp Heat Pump";
}

export function getHardwareDetailStatus(
  detail: SystemHardwareDetailId,
  pumpRunning: unknown,
  chlorinatorRunState?: unknown
): string {
  if (detail === "easytouch8") {
    return "Online";
  }
  if (detail === "intelliflo") {
    return typeof pumpRunning === "boolean" && pumpRunning ? "Running" : "Idle";
  }
  if (detail === "intellichlor") {
    return formatChlorinatorRunState(chlorinatorRunState);
  }
  return "Heating";
}

export function getChlorinatorStatusTone(value: unknown): "good" | "watch" | "muted" {
  switch (value) {
    case "ok":
      return "good";
    case "unknown":
    case "offline":
      return "muted";
    default:
      return "watch";
  }
}

export function formatChlorinatorRunState(value: unknown): string {
  switch (value) {
    case "producing":
      return "Producing";
    case "idle":
      return "Idle";
    case "off":
      return "Off";
    case "unknown":
      return "Unknown";
    default:
      return "Unknown";
  }
}

export function formatChlorinatorStatus(value: unknown): string {
  switch (value) {
    case "ok":
      return "OK";
    case "low_flow":
      return "Low Flow";
    case "low_salt":
      return "Low Salt";
    case "very_low_salt":
      return "Very Low Salt";
    case "high_salt":
      return "High Salt";
    case "high_current":
      return "High Current";
    case "clean_cell":
      return "Clean Cell";
    case "low_voltage":
      return "Low Voltage";
    case "low_water_temp":
      return "Low Water Temp";
    case "communication_lost":
      return "Communication Lost";
    case "fault":
      return "Fault";
    case "offline":
      return "Offline";
    case "unknown":
      return "Unknown";
    default:
      return "Unknown";
  }
}

export function formatFilterCondition(value: unknown): string {
  switch (value) {
    case "clean":
      return "Clean";
    case "watch":
      return "Watch";
    case "dirty":
      return "Dirty";
    case "unknown":
      return "Unknown";
    default:
      return "Unknown";
  }
}

export function getHardwareDetailTone(_: SystemHardwareDetailId): "good" | "muted" {
  return "good";
}

export function humanizeCircuitType(value: string): string {
  if (value === "fixed") {
    return "POOL/SPA";
  }
  if (value === "relay") {
    return "AUX";
  }
  return value.replace(/_/g, " ").toUpperCase();
}

export function getCircuitTypeClassName(value: string): "pool-spa" | "aux" | "feature" {
  if (value === "fixed") {
    return "pool-spa";
  }
  return value === "feature" ? "feature" : "aux";
}

export function getHardwareDetailFacts(
  detail: SystemHardwareDetailId,
  input: {
    pump: EquipmentRecord | undefined;
    controllerTime: string;
    waterTemp: string;
    saltLevel: string;
    chlorinatorOutput: string;
    chlorinatorCurrentOutput: string;
    chlorinatorTargetOutput: string;
    chlorinatorRunState: string;
    chlorinatorStatus: string;
    chlorinatorModel: string;
    chlorinatorAddress: string;
    chlorinatorLastComm: string;
    pumpRpm: string;
    flowRate: string;
    filterPressure: string;
    filterCondition: string;
  }
): Array<{ label: string; value: string }> {
  switch (detail) {
    case "easytouch8":
      return [
        { label: "Model", value: "EasyTouch 8" },
        { label: "Firmware Version", value: "2.190" },
        { label: "Protocol", value: "Pentair RS485" },
        { label: "Last Message", value: input.controllerTime },
        { label: "Message Rate", value: "120 / min" },
        { label: "Installed", value: "May 16, 2025" }
      ];
    case "intelliflo":
      return [
        { label: "Model", value: "IntelliFlo VSF" },
        { label: "Current RPM", value: input.pumpRpm },
        { label: "Firmware Version", value: "3.04" },
        { label: "Power Usage", value: "740 W" },
        { label: "Protocol", value: "Pentair RS485" },
        { label: "Flow Rate", value: input.flowRate },
        { label: "Filter Pressure", value: input.filterPressure },
        { label: "Filter Condition", value: input.filterCondition },
        { label: "Address", value: readNullableString(input.pump?.bus_address) ?? "0x60" },
        { label: "Last Message", value: "1s ago" }
      ];
    case "intellichlor":
      return [
        { label: "Model", value: input.chlorinatorModel },
        { label: "Salt Level", value: input.saltLevel },
        { label: "Current Output", value: input.chlorinatorCurrentOutput },
        { label: "Target Output", value: input.chlorinatorTargetOutput },
        { label: "Protocol", value: "Pentair RS485" },
        { label: "Cell Status", value: input.chlorinatorRunState },
        { label: "Status Detail", value: input.chlorinatorStatus },
        { label: "Address", value: input.chlorinatorAddress },
        { label: "Last Message", value: input.chlorinatorLastComm }
      ];
    case "ultratemp":
      return [
        { label: "Model", value: "UltraTemp 120" },
        { label: "Water Temperature", value: input.waterTemp },
        { label: "Firmware Version", value: "2.11" },
        { label: "Set Point", value: "82 °F" },
        { label: "Protocol", value: "Pentair RS485" },
        { label: "Heat Mode", value: "Heat" },
        { label: "Address", value: "0x20" },
        { label: "Last Message", value: "3s ago" }
      ];
  }
}

export function getStatusIconName(status: string): SplashIconName {
  switch (status) {
    case "ok":
    case "connected":
    case "completed":
    case "succeeded":
      return "good";
    case "disconnected":
    case "failed":
    case "timed_out":
    case "timeout":
      return "critical";
    case "connecting":
    case "degraded":
    case "transmitted":
    case "encoded":
    case "accepted":
      return "warning";
    case "pending":
      return "pending";
    default:
      return "unknown";
  }
}

export function resolveCircuitIconName(circuit: ControllerCircuitDefinition): SplashIconName {
  const functionLabel = (circuit.functionLabel ?? "").toLowerCase();
  const nameLabel = (circuit.nameLabel ?? "").toLowerCase();
  const defaultName = circuit.defaultName.toLowerCase();
  if (functionLabel.includes("heater") || nameLabel.includes("heater")) {
    return "heater";
  }
  if (functionLabel.includes("cleaner") || nameLabel.includes("cleaner")) {
    return "cleaner";
  }
  if (functionLabel.includes("light") || nameLabel.includes("light")) {
    return "pool-light";
  }
  if (functionLabel.includes("waterfall") || functionLabel.includes("fountain") || nameLabel.includes("waterfall")) {
    return "water-feature";
  }
  if (defaultName.includes("spa")) {
    return "spa-blower";
  }
  if (defaultName.includes("pool")) {
    return "water-feature";
  }
  return circuit.circuitType === "relay" ? "valve" : "circuit";
}

function mapHardwareCircuit(circuit: ControllerCircuitHardwareRecord): ControllerCircuitDefinition {
  return {
    key: circuit.circuit_key,
    stateKey: mapStateKey(circuit.circuit_key),
    circuitId: circuit.write_circuit_id,
    configurationCircuitId: circuit.configuration_circuit_index,
    defaultName: circuit.display_name,
    circuitType: circuit.circuit_type,
    installed: circuit.installed,
    writable: circuit.writable,
    functionValue: null,
    functionLabel: null,
    nameValue: null,
    nameLabel: null,
    freezeFlag: null,
    highFlag: null
  };
}

function mapStateKey(circuitKey: string): string | undefined {
  if (circuitKey === "feature1") {
    return "pool_low";
  }
  if (circuitKey === "feature2") {
    return "pool_high";
  }
  if (circuitKey === "feature3") {
    return "cleaner";
  }
  return undefined;
}

function summarizeFrameData(payload: Record<string, unknown>): string {
  if (typeof payload.action_code === "string") {
    return payload.action_code;
  }
  if (typeof payload.frame_id === "string") {
    return payload.frame_id;
  }
  return "frame";
}

export function formatCommandStatus(status: string | null): string {
  switch (status) {
    case "completed":
      return "Command completed";
    case "failed":
      return "Command failed";
    case "timed_out":
      return "Command timed out";
    case "transmitted":
      return "Command transmitted";
    case "encoded":
      return "Command encoded";
    case "accepted":
      return "Command accepted";
    default:
      return "Command update";
  }
}
