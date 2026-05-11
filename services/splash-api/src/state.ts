import type { EquipmentBridgeEntry } from "./bridge.js";

export interface ControllerLatestState {
  controllerHour24: number | null;
  controllerMinute: number | null;
  controllerDateReply: ControllerDatetimeReply | null;
  controllerSoftwareVersionReply: ControllerSoftwareVersionReply | null;
  controllerSubModelByte: number | null;
  controllerModelByte: number | null;
  controllerModelFamily: string | null;
  controllerModelLabel: string | null;
  airTempF: number | null;
  waterTempF: number | null;
  heaterEnabled: boolean | null;
  mode: string | null;
  controllerModeByte: number | null;
  controllerModeLabel: string | null;
  activeCircuitKeys: string[];
  circuits: Record<string, boolean>;
  circuitConfigurations: Record<string, ControllerCircuitConfiguration>;
  customNameBank: Record<string, ControllerCustomName>;
  updatedAt: string | null;
}

export interface ControllerCustomName {
  nameIndex: number;
  customNameBytes: number[];
  customNameText: string | null;
  updatedAt: string | null;
}

export interface ControllerCircuitConfiguration {
  circuitId: number;
  functionValue: number | null;
  functionLabel: string | null;
  nameValue: number | null;
  nameLabel: string | null;
  freezeFlag: boolean | null;
  highFlag: boolean | null;
  updatedAt: string | null;
}

export interface ControllerCircuitConfigurationView {
  circuit_id: number;
  function_value: number | null;
  function_label: string | null;
  name_value: number | null;
  name_label: string | null;
  freeze_flag: boolean | null;
  high_flag: boolean | null;
  updated_at: string | null;
}

export interface ControllerDatetimeReply {
  month: number | null;
  day: number | null;
  year: number | null;
  dayOfWeek: number | null;
  hour24: number | null;
  minute: number | null;
  daylightSavingsAuto: boolean | null;
  updatedAt: string | null;
}

export interface ControllerDatetimeReplyView {
  month: number | null;
  day: number | null;
  year: number | null;
  day_of_week: number | null;
  hour_24: number | null;
  minute: number | null;
  daylight_savings_auto: boolean | null;
  updated_at: string | null;
}

export interface ControllerSoftwareVersionReply {
  controllerFirmwareMajor: number | null;
  controllerFirmwareMinor: number | null;
  bootloaderMajor: number | null;
  bootloaderMinor: number | null;
  updatedAt: string | null;
}

export interface ControllerSoftwareVersionReplyView {
  controller_firmware_major: number | null;
  controller_firmware_minor: number | null;
  bootloader_major: number | null;
  bootloader_minor: number | null;
  updated_at: string | null;
}

export interface ControllerCustomNameView {
  name_index: number;
  custom_name_bytes: number[];
  custom_name_text: string | null;
  updated_at: string | null;
}

export interface PumpLatestState {
  rpm: number | null;
  running: boolean | null;
  updatedAt: string | null;
}

export interface ChlorinatorLatestState {
  saltPpm: number | null;
  updatedAt: string | null;
}

export interface LatestProjectionSnapshot {
  controller: ControllerLatestState;
  pump: PumpLatestState;
  chlorinator: ChlorinatorLatestState;
  commandResults: Record<string, Record<string, unknown>>;
}

export class LatestStateProjection {
  private controller: ControllerLatestState = {
    controllerHour24: null,
    controllerMinute: null,
    controllerDateReply: null,
    controllerSoftwareVersionReply: null,
    controllerSubModelByte: null,
    controllerModelByte: null,
    controllerModelFamily: null,
    controllerModelLabel: null,
    airTempF: null,
    waterTempF: null,
    heaterEnabled: null,
    mode: null,
    controllerModeByte: null,
    controllerModeLabel: null,
    activeCircuitKeys: [],
    circuits: {},
    circuitConfigurations: {},
    customNameBank: {},
    updatedAt: null
  };

  private pump: PumpLatestState = {
    rpm: null,
    running: null,
    updatedAt: null
  };

  private chlorinator: ChlorinatorLatestState = {
    saltPpm: null,
    updatedAt: null
  };

  private readonly commandResults = new Map<string, Record<string, unknown>>();

  updateController(payload: Record<string, unknown>): void {
    this.controller = {
      controllerHour24: readNumber(payload, "controller_hour_24"),
      controllerMinute: readNumber(payload, "controller_minute"),
      controllerDateReply: this.controller.controllerDateReply == null ? null : { ...this.controller.controllerDateReply },
      controllerSoftwareVersionReply:
        this.controller.controllerSoftwareVersionReply == null ? null : { ...this.controller.controllerSoftwareVersionReply },
      controllerSubModelByte: readNumber(payload, "controller_sub_model_byte"),
      controllerModelByte: readNumber(payload, "controller_model_byte"),
      controllerModelFamily: readString(payload, "controller_model_family"),
      controllerModelLabel: readString(payload, "controller_model_label"),
      airTempF: readNumber(payload, "air_temp_f"),
      waterTempF: readNumber(payload, "water_temp_f"),
      heaterEnabled: readNestedBoolean(payload, ["heater", "enabled"]),
      mode: readString(payload, "mode"),
      controllerModeByte: readNumber(payload, "controller_mode_byte"),
      controllerModeLabel: readString(payload, "controller_mode_label"),
      activeCircuitKeys: readStringArray(payload, "active_circuit_keys"),
      circuits: readBooleanRecord(payload, "circuits"),
      circuitConfigurations: { ...this.controller.circuitConfigurations },
      customNameBank: { ...this.controller.customNameBank },
      updatedAt: readString(payload, "occurred_at")
    };
  }

  updateControllerCircuitConfiguration(payload: Record<string, unknown>): Record<string, ControllerCircuitConfigurationView> {
    const circuitId = readNumber(payload, "circuit_id");
    if (circuitId === null) {
      return this.getControllerCircuitConfigurations();
    }

    const key = String(circuitId);
    this.controller = {
      ...this.controller,
      circuitConfigurations: {
        ...this.controller.circuitConfigurations,
        [key]: {
          circuitId,
          functionValue: readNumber(payload, "function_id"),
          functionLabel: readString(payload, "base_function_label"),
          nameValue: readNumber(payload, "name_id"),
          nameLabel: readString(payload, "name_label"),
          freezeFlag: readBoolean(payload, "freeze_flag"),
          highFlag: readBoolean(payload, "high_flag"),
          updatedAt: readString(payload, "occurred_at")
        }
      }
    };

    return this.getControllerCircuitConfigurations();
  }

  updateControllerDatetimeReply(payload: Record<string, unknown>): ControllerDatetimeReplyView | null {
    this.controller = {
      ...this.controller,
      controllerDateReply: {
        month: readNumber(payload, "month"),
        day: readNumber(payload, "day"),
        year: readNumber(payload, "year"),
        dayOfWeek: readNumber(payload, "day_of_week"),
        hour24: readNumber(payload, "hour_24"),
        minute: readNumber(payload, "minute"),
        daylightSavingsAuto: readBoolean(payload, "daylight_savings_auto"),
        updatedAt: readString(payload, "occurred_at")
      }
    };

    return this.getControllerDatetimeReply();
  }

  updateControllerSoftwareVersionReply(payload: Record<string, unknown>): ControllerSoftwareVersionReplyView | null {
    this.controller = {
      ...this.controller,
      controllerSoftwareVersionReply: {
        controllerFirmwareMajor: readNumber(payload, "controller_firmware_major"),
        controllerFirmwareMinor: readNumber(payload, "controller_firmware_minor"),
        bootloaderMajor: readNumber(payload, "bootloader_major"),
        bootloaderMinor: readNumber(payload, "bootloader_minor"),
        updatedAt: readString(payload, "occurred_at")
      }
    };

    return this.getControllerSoftwareVersionReply();
  }

  updateControllerCustomName(payload: Record<string, unknown>): Record<string, ControllerCustomNameView> {
    const nameIndex = readNumber(payload, "name_index");
    if (nameIndex === null) {
      return this.getControllerCustomNameBank();
    }

    this.controller = {
      ...this.controller,
      customNameBank: {
        ...this.controller.customNameBank,
        [String(nameIndex)]: {
          nameIndex,
          customNameBytes: readNumberArray(payload, "custom_name_bytes"),
          customNameText: readString(payload, "custom_name_text"),
          updatedAt: readString(payload, "occurred_at")
        }
      }
    };

    return this.getControllerCustomNameBank();
  }

  updatePump(payload: Record<string, unknown>): void {
    this.pump = {
      rpm: readNumber(payload, "rpm"),
      running: readBoolean(payload, "running"),
      updatedAt: readString(payload, "occurred_at")
    };
  }

  updateChlorinator(payload: Record<string, unknown>): void {
    this.chlorinator = {
      saltPpm: readNumber(payload, "salt_ppm"),
      updatedAt: readString(payload, "occurred_at")
    };
  }

  updateCommandResult(commandId: string, payload: Record<string, unknown>): void {
    this.commandResults.set(commandId, payload);
  }

  getSnapshot(): LatestProjectionSnapshot {
    return {
      controller: { ...this.controller },
      pump: { ...this.pump },
      chlorinator: { ...this.chlorinator },
      commandResults: Object.fromEntries(this.commandResults.entries())
    };
  }

  getEquipmentView(entries: EquipmentBridgeEntry[]): Array<Record<string, unknown>> {
    return entries.map((entry) => {
      switch (entry.equipmentType) {
        case "controller":
          return {
            id: entry.id,
            equipment_type: entry.equipmentType,
            display_name: entry.displayName,
            protocol_name: entry.protocolName,
            hardware: {
              circuits: (entry.controllerCircuits ?? []).map((circuit) => ({
                circuit_key: circuit.circuitKey,
                display_name: circuit.displayName,
                circuit_type: circuit.circuitType,
                installed: circuit.installed,
                writable: circuit.writable,
                configuration_circuit_index: circuit.configurationCircuitIndex,
                write_circuit_id: circuit.writeCircuitId
              }))
            },
            latest_state: {
              controller_hour_24: this.controller.controllerHour24,
              controller_minute: this.controller.controllerMinute,
              controller_datetime_reply: this.getControllerDatetimeReply(),
              controller_software_version_reply: this.getControllerSoftwareVersionReply(),
              controller_sub_model_byte: this.controller.controllerSubModelByte,
              controller_model_byte: this.controller.controllerModelByte,
              controller_model_family: this.controller.controllerModelFamily,
              controller_model_label: this.controller.controllerModelLabel,
              air_temp_f: this.controller.airTempF,
              water_temp_f: this.controller.waterTempF,
              heater_enabled: this.controller.heaterEnabled,
              mode: this.controller.mode,
              controller_mode_byte: this.controller.controllerModeByte,
              controller_mode_label: this.controller.controllerModeLabel,
              active_circuit_keys: [...this.controller.activeCircuitKeys],
              circuits: { ...this.controller.circuits },
              circuit_configurations: this.getControllerCircuitConfigurations(),
              custom_name_bank: this.getControllerCustomNameBank(),
              updated_at: this.controller.updatedAt
            }
          };
        case "pump":
          return {
            id: entry.id,
            equipment_type: entry.equipmentType,
            display_name: entry.displayName,
            protocol_name: entry.protocolName,
            bus_address: entry.busAddress,
            control_circuit_keys: entry.controlCircuitKeys ?? [],
            default_control_circuit_key: entry.defaultControlCircuitKey ?? null,
            latest_state: {
              rpm: this.pump.rpm,
              running: this.pump.running,
              updated_at: this.pump.updatedAt
            }
          };
        case "chlorinator":
          return {
            id: entry.id,
            equipment_type: entry.equipmentType,
            display_name: entry.displayName,
            protocol_name: entry.protocolName,
            latest_state: {
              salt_ppm: this.chlorinator.saltPpm,
              updated_at: this.chlorinator.updatedAt
            }
          };
      }
    });
  }

  private getControllerCircuitConfigurations(): Record<string, ControllerCircuitConfigurationView> {
    return Object.fromEntries(
      Object.entries(this.controller.circuitConfigurations).map(([key, value]) => [
        key,
        {
          circuit_id: value.circuitId,
          function_value: value.functionValue,
          function_label: value.functionLabel,
          name_value: value.nameValue,
          name_label: value.nameLabel,
          freeze_flag: value.freezeFlag,
          high_flag: value.highFlag,
          updated_at: value.updatedAt
        }
      ])
    );
  }

  private getControllerDatetimeReply(): ControllerDatetimeReplyView | null {
    const value = this.controller.controllerDateReply;
    if (value == null) {
      return null;
    }

    return {
      month: value.month,
      day: value.day,
      year: value.year,
      day_of_week: value.dayOfWeek,
      hour_24: value.hour24,
      minute: value.minute,
      daylight_savings_auto: value.daylightSavingsAuto,
      updated_at: value.updatedAt
    };
  }

  private getControllerSoftwareVersionReply(): ControllerSoftwareVersionReplyView | null {
    const value = this.controller.controllerSoftwareVersionReply;
    if (value == null) {
      return null;
    }

    return {
      controller_firmware_major: value.controllerFirmwareMajor,
      controller_firmware_minor: value.controllerFirmwareMinor,
      bootloader_major: value.bootloaderMajor,
      bootloader_minor: value.bootloaderMinor,
      updated_at: value.updatedAt
    };
  }

  private getControllerCustomNameBank(): Record<string, ControllerCustomNameView> {
    return Object.fromEntries(
      Object.entries(this.controller.customNameBank).map(([key, value]) => [
        key,
        {
          name_index: value.nameIndex,
          custom_name_bytes: [...value.customNameBytes],
          custom_name_text: value.customNameText,
          updated_at: value.updatedAt
        }
      ])
    );
  }
}

function readNumber(payload: Record<string, unknown>, key: string): number | null {
  const value = payload[key];
  return typeof value === "number" ? value : null;
}

function readBoolean(payload: Record<string, unknown>, key: string): boolean | null {
  const value = payload[key];
  return typeof value === "boolean" ? value : null;
}

function readString(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" ? value : null;
}

function readStringArray(payload: Record<string, unknown>, key: string): string[] {
  const value = payload[key];
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string");
}

function readNumberArray(payload: Record<string, unknown>, key: string): number[] {
  const value = payload[key];
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is number => typeof entry === "number");
}

function readBooleanRecord(payload: Record<string, unknown>, key: string): Record<string, boolean> {
  const value = payload[key];
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean")
  );
}

function readNestedBoolean(payload: Record<string, unknown>, path: string[]): boolean | null {
  let current: unknown = payload;
  for (const segment of path) {
    if (current == null || typeof current !== "object" || Array.isArray(current)) {
      return null;
    }
    current = (current as Record<string, unknown>)[segment];
  }

  return typeof current === "boolean" ? current : null;
}
