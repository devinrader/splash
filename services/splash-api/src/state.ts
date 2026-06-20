import type { EquipmentBridgeEntry } from "./bridge.js";

export interface ControllerLatestState {
  controllerHour24: number | null;
  controllerMinute: number | null;
  controllerDateReply: ControllerDatetimeReply | null;
  controllerClockAdvance: number | null;
  controllerSoftwareVersionReply: ControllerSoftwareVersionReply | null;
  controllerSchedules: Record<string, ControllerScheduleRecord>;
  controllerScheduleObservations: ControllerScheduleObservation[];
  pumpConfigurations: Record<string, ControllerPumpConfiguration>;
  controllerSubModelByte: number | null;
  controllerModelByte: number | null;
  controllerModelFamily: string | null;
  controllerModelLabel: string | null;
  airTempF: number | null;
  waterTempF: number | null;
  heaterEnabled: boolean | null;
  heatSettingByte: number | null;
  poolHeatMode: string | null;
  spaHeatMode: string | null;
  heaterConfiguration: ControllerHeaterConfiguration | null;
  heaterSettings: ControllerHeaterSettings | null;
  mode: string | null;
  controllerModeByte: number | null;
  controllerModeLabel: string | null;
  activeCircuitKeys: string[];
  circuits: Record<string, boolean>;
  circuitConfigurations: Record<string, ControllerCircuitConfiguration>;
  customNameBank: Record<string, ControllerCustomName>;
  updatedAt: string | null;
}

export interface ControllerHeaterConfiguration {
  solarOrHeatPumpEnabled: boolean | null;
  heatingEnabled: boolean | null;
  coolingEnabled: boolean | null;
  freezeProtectionEnabled: boolean | null;
  detectedHeaterType: string | null;
  rawPayload: number[];
  updatedAt: string | null;
}

export interface ControllerHeaterSettings {
  poolSetpoint: number | null;
  spaSetpoint: number | null;
  coolSetpoint: number | null;
  poolHeatMode: string | null;
  spaHeatMode: string | null;
  heatSettingByte: number | null;
  source: "controller_status" | "command_cache";
  updatedAt: string | null;
}

export interface ControllerHeaterView {
  source: "controller_native";
  controller_type: "easytouch";
  status: "available" | "unavailable";
  message: string;
  last_checked: string | null;
  configuration: {
    detected_heater_type: string | null;
    solar_or_heat_pump_enabled: boolean | null;
    heating_enabled: boolean | null;
    cooling_enabled: boolean | null;
    freeze_protection_enabled: boolean | null;
    raw_payload: number[];
    updated_at: string | null;
  };
  settings: {
    pool_setpoint: number | null;
    spa_setpoint: number | null;
    cool_setpoint: number | null;
    pool_heat_mode: string | null;
    spa_heat_mode: string | null;
    heat_setting_byte: number | null;
    source: "controller_status" | "command_cache" | null;
    updated_at: string | null;
  };
  capabilities: {
    editable_configuration_fields: string[];
    editable_setting_fields: string[];
  };
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

export interface ControllerClockView {
  source: "controller_native";
  controller_type: "easytouch";
  status: "available" | "unavailable";
  message: string;
  last_checked: string | null;
  summary: {
    month: number | null;
    day: number | null;
    year: number | null;
    day_of_week: number | null;
    hour_24: number | null;
    minute: number | null;
    daylight_savings_auto: boolean | null;
    clock_advance: number | null;
    source: "controller_status" | "controller_datetime_reply" | "combined" | null;
    updated_at: string | null;
  };
  capabilities: {
    editable_fields: string[];
    provisional_fields: string[];
  };
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

export interface ControllerScheduleObservation {
  payloadHex: string | null;
  payloadLength: number | null;
  updatedAt: string | null;
}

export interface ControllerScheduleObservationView {
  payload_hex: string | null;
  payload_length: number | null;
  updated_at: string | null;
}

export interface ControllerScheduleRecord {
  controllerFamily: "EasyTouch";
  frameType: "easytouch_schedule" | "easytouch_egg_timer";
  action: number | null;
  scheduleId: number | null;
  circuitId: number | null;
  active: boolean | null;
  scheduleType: number | null;
  scheduleTypeLabel: string | null;
  startTimeMinutes: number | null;
  endTimeMinutes: number | null;
  scheduleDays: number | null;
  eggTimerRunTimeMinutes: number | null;
  parseConfidence: "high" | "medium" | "invalid" | null;
  warnings: string[];
  rawPayload: number[];
  updatedAt: string | null;
}

export interface ControllerScheduleRecordView {
  controller_family: "EasyTouch";
  frame_type: "easytouch_schedule" | "easytouch_egg_timer";
  action: number | null;
  schedule_id: number | null;
  circuit_id?: number | null;
  active: boolean | null;
  schedule_type?: number | null;
  schedule_type_label?: string | null;
  start_time_minutes?: number | null;
  end_time_minutes?: number | null;
  schedule_days?: number | null;
  egg_timer_run_time_minutes?: number | null;
  parse_confidence: "high" | "medium" | "invalid" | null;
  warnings: string[];
  raw_payload: number[];
  updated_at: string | null;
}

export interface ControllerSchedulesView {
  source: "controller_native";
  controller_type: "easytouch";
  status: "available" | "unavailable" | "stale";
  message: string;
  last_checked: string | null;
  schedules: ControllerScheduleRecordView[];
  observed_payloads: ControllerScheduleObservationView[];
}

export interface ControllerPumpConfigurationSlotView {
  slot: number;
  circuit_assignment: number | null;
  rpm: number | null;
}

export interface ControllerPumpConfiguration {
  pumpId: number;
  pumpType: number | null;
  primingTime: number | null;
  unknown3: number | null;
  unknown4: number | null;
  primingSpeed: number | null;
  slots: ControllerPumpConfigurationSlotView[];
  trailingBytes: number[];
  updatedAt: string | null;
}

export interface ControllerPumpConfigurationView {
  pump_id: number;
  installed: boolean;
  pump_type: number | null;
  pump_type_label: string | null;
  supported_branch: "vf" | "vs" | "unknown" | null;
  priming_time: number | null;
  unknown_3: number | null;
  unknown_4: number | null;
  priming_speed: number | null;
  slots: ControllerPumpConfigurationSlotView[];
  trailing_bytes: number[];
  updated_at: string | null;
}

export interface ControllerPumpConfigurationsView {
  source: "controller_native";
  controller_type: "easytouch";
  status: "available" | "unavailable";
  message: string;
  last_checked: string | null;
  pumps: ControllerPumpConfigurationView[];
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
  flowGpm: number | null;
  filterPressurePsi: number | null;
  filterCondition: string | null;
  updatedAt: string | null;
}

export interface ChlorinatorLatestState {
  saltPpm: number | null;
  outputPercent: number | null;
  currentOutputPercent?: number | null;
  targetOutputPercent?: number | null;
  runState: string | null;
  status: string | null;
  statusCode?: number | null;
  waterTempF?: number | null;
  model?: string | null;
  connected?: boolean | null;
  commsLost?: boolean | null;
  lastComm?: string | null;
  productionLbPerDay?: number | null;
  productionLbPerSecond?: number | null;
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
    controllerClockAdvance: null,
    controllerSoftwareVersionReply: null,
    controllerSchedules: {},
    controllerScheduleObservations: [],
    pumpConfigurations: {},
    controllerSubModelByte: null,
    controllerModelByte: null,
    controllerModelFamily: null,
    controllerModelLabel: null,
    airTempF: null,
    waterTempF: null,
    heaterEnabled: null,
    heatSettingByte: null,
    poolHeatMode: null,
    spaHeatMode: null,
    heaterConfiguration: null,
    heaterSettings: null,
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
    flowGpm: null,
    filterPressurePsi: null,
    filterCondition: null,
    updatedAt: null
  };

  private chlorinator: ChlorinatorLatestState = {
    saltPpm: null,
    outputPercent: null,
    currentOutputPercent: null,
    targetOutputPercent: null,
    runState: null,
    status: null,
    statusCode: null,
    waterTempF: null,
    model: null,
    connected: null,
    commsLost: null,
    lastComm: null,
    productionLbPerDay: null,
    productionLbPerSecond: null,
    updatedAt: null
  };

  private readonly commandResults = new Map<string, Record<string, unknown>>();

  updateController(payload: Record<string, unknown>): void {
    this.controller = {
      controllerHour24: readNumber(payload, "controller_hour_24"),
      controllerMinute: readNumber(payload, "controller_minute"),
      controllerDateReply: this.controller.controllerDateReply == null ? null : { ...this.controller.controllerDateReply },
      controllerClockAdvance: this.controller.controllerClockAdvance,
      controllerSoftwareVersionReply:
        this.controller.controllerSoftwareVersionReply == null ? null : { ...this.controller.controllerSoftwareVersionReply },
      controllerSchedules: { ...this.controller.controllerSchedules },
      controllerScheduleObservations: [...this.controller.controllerScheduleObservations],
      pumpConfigurations: { ...this.controller.pumpConfigurations },
      controllerSubModelByte: readNumber(payload, "controller_sub_model_byte"),
      controllerModelByte: readNumber(payload, "controller_model_byte"),
      controllerModelFamily: readString(payload, "controller_model_family"),
      controllerModelLabel: readString(payload, "controller_model_label"),
      airTempF: readNumber(payload, "air_temp_f"),
      waterTempF: readNumber(payload, "water_temp_f"),
      heaterEnabled: readNestedBoolean(payload, ["heater", "enabled"]),
      heatSettingByte: readNumber(payload, "heat_setting_byte"),
      poolHeatMode: readString(payload, "pool_heat_mode"),
      spaHeatMode: readString(payload, "spa_heat_mode"),
      heaterConfiguration: this.controller.heaterConfiguration == null ? null : { ...this.controller.heaterConfiguration },
      heaterSettings: {
        poolSetpoint: this.controller.heaterSettings?.poolSetpoint ?? null,
        spaSetpoint: this.controller.heaterSettings?.spaSetpoint ?? null,
        coolSetpoint: this.controller.heaterSettings?.coolSetpoint ?? null,
        poolHeatMode: readString(payload, "pool_heat_mode"),
        spaHeatMode: readString(payload, "spa_heat_mode"),
        heatSettingByte: readNumber(payload, "heat_setting_byte"),
        source: this.controller.heaterSettings?.source ?? "controller_status",
        updatedAt: readString(payload, "occurred_at")
      },
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

  cacheControllerClock(payload: {
    month: number;
    day: number;
    year: number;
    dayOfWeek: number;
    hour24: number;
    minute: number;
    daylightSavingsAuto: boolean | null;
    clockAdvance: number | null;
    updatedAt: string;
  }): ControllerClockView {
    this.controller = {
      ...this.controller,
      controllerHour24: payload.hour24,
      controllerMinute: payload.minute,
      controllerClockAdvance: payload.clockAdvance,
      controllerDateReply: {
        month: payload.month,
        day: payload.day,
        year: payload.year,
        dayOfWeek: payload.dayOfWeek,
        hour24: payload.hour24,
        minute: payload.minute,
        daylightSavingsAuto: payload.daylightSavingsAuto,
        updatedAt: payload.updatedAt
      }
    };

    return this.getControllerClockView();
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

  updateControllerHeaterConfiguration(payload: Record<string, unknown>): ControllerHeaterView {
    this.controller = {
      ...this.controller,
      heaterConfiguration: {
        solarOrHeatPumpEnabled: readBoolean(payload, "solar_or_heat_pump_enabled"),
        heatingEnabled: readBoolean(payload, "heating_enabled"),
        coolingEnabled: readBoolean(payload, "cooling_enabled"),
        freezeProtectionEnabled: readBoolean(payload, "freeze_protection_enabled"),
        detectedHeaterType: readString(payload, "detected_heater_type"),
        rawPayload: readNumberArray(payload, "raw_payload"),
        updatedAt: readString(payload, "occurred_at")
      }
    };

    return this.getControllerHeaterView();
  }

  updateControllerPumpConfiguration(payload: Record<string, unknown>): ControllerPumpConfigurationsView {
    const pumpId = readNumber(payload, "pump_slot") ?? readNumber(payload, "pump_id");
    if (pumpId === null) {
      return this.getControllerPumpConfigurationsView();
    }

    const slotsValue = readObjectArray(payload, "slots")
      .map((slot, index) => ({
        slot: readNumber(slot, "slot") ?? index + 1,
        circuit_assignment: readNumber(slot, "circuit_assignment"),
        rpm: readNumber(slot, "rpm")
      }));

    this.controller = {
      ...this.controller,
      pumpConfigurations: {
        ...this.controller.pumpConfigurations,
        [String(pumpId)]: {
          pumpId,
          pumpType: readNumber(payload, "pump_type"),
          primingTime: readNumber(payload, "priming_time"),
          unknown3: readNumber(payload, "unknown_3"),
          unknown4: readNumber(payload, "unknown_4"),
          primingSpeed: readNumber(payload, "priming_speed"),
          slots: slotsValue,
          trailingBytes: readNumberArray(payload, "trailing_bytes"),
          updatedAt: readString(payload, "occurred_at")
        }
      }
    };

    return this.getControllerPumpConfigurationsView();
  }

  cacheControllerHeaterSettings(payload: {
    poolSetpoint: number;
    spaSetpoint: number;
    coolSetpoint: number;
    poolHeatMode: string;
    spaHeatMode: string;
    heatSettingByte: number;
    updatedAt: string;
  }): ControllerHeaterView {
    this.controller = {
      ...this.controller,
      heatSettingByte: payload.heatSettingByte,
      poolHeatMode: payload.poolHeatMode,
      spaHeatMode: payload.spaHeatMode,
      heaterSettings: {
        poolSetpoint: payload.poolSetpoint,
        spaSetpoint: payload.spaSetpoint,
        coolSetpoint: payload.coolSetpoint,
        poolHeatMode: payload.poolHeatMode,
        spaHeatMode: payload.spaHeatMode,
        heatSettingByte: payload.heatSettingByte,
        source: "command_cache",
        updatedAt: payload.updatedAt
      }
    };

    return this.getControllerHeaterView();
  }

  updateControllerScheduleObservation(payload: Record<string, unknown>): ControllerSchedulesView {
    const nextObservation: ControllerScheduleObservation = {
      payloadHex: readString(payload, "payload_hex"),
      payloadLength: readNumber(payload, "payload_length"),
      updatedAt: readString(payload, "occurred_at")
    };
    const scheduleId = readNumber(payload, "schedule_id");
    const frameType = readString(payload, "frame_type");
    const parseConfidence = readParseConfidence(payload, "parse_confidence");
    const rawPayload = readNumberArray(payload, "raw_payload");
    const warnings = readStringArray(payload, "warnings");
    const controllerFamily = readString(payload, "controller_family");
    const nextSchedules = { ...this.controller.controllerSchedules };

    if (
      scheduleId !== null &&
      controllerFamily === "EasyTouch" &&
      (frameType === "easytouch_schedule" || frameType === "easytouch_egg_timer") &&
      parseConfidence !== "invalid"
    ) {
      nextSchedules[String(scheduleId)] = {
        controllerFamily: "EasyTouch",
        frameType,
        action: readNumber(payload, "action"),
        scheduleId,
        circuitId: readNumber(payload, "circuit_id"),
        active: readBoolean(payload, "active"),
        scheduleType: readNumber(payload, "schedule_type"),
        scheduleTypeLabel: readString(payload, "schedule_type_label"),
        startTimeMinutes: readNumber(payload, "start_time_minutes"),
        endTimeMinutes: readNumber(payload, "end_time_minutes"),
        scheduleDays: readNumber(payload, "schedule_days"),
        eggTimerRunTimeMinutes: readNumber(payload, "egg_timer_run_time_minutes"),
        parseConfidence,
        warnings,
        rawPayload,
        updatedAt: readString(payload, "occurred_at")
      };
    }

    this.controller = {
      ...this.controller,
      controllerSchedules: nextSchedules,
      controllerScheduleObservations: [nextObservation, ...this.controller.controllerScheduleObservations].slice(0, 4)
    };

    return this.getControllerSchedulesView();
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
      flowGpm: readNumber(payload, "flow_gpm"),
      filterPressurePsi: readNumber(payload, "filter_pressure_psi"),
      filterCondition: normalizeFilterCondition(readString(payload, "filter_condition")),
      updatedAt: readString(payload, "occurred_at")
    };
  }

  updateChlorinator(payload: Record<string, unknown>): void {
    this.chlorinator = {
      saltPpm: hasPayloadKey(payload, "salt_ppm") ? readNumber(payload, "salt_ppm") : this.chlorinator.saltPpm,
      outputPercent: hasPayloadKey(payload, "output_percent") ? readNumber(payload, "output_percent") : this.chlorinator.outputPercent,
      currentOutputPercent: hasPayloadKey(payload, "current_output_percent")
        ? readNumber(payload, "current_output_percent")
        : this.chlorinator.currentOutputPercent,
      targetOutputPercent: hasPayloadKey(payload, "target_output_percent")
        ? readNumber(payload, "target_output_percent")
        : this.chlorinator.targetOutputPercent,
      runState: hasPayloadKey(payload, "run_state")
        ? normalizeChlorinatorRunState(readString(payload, "run_state"))
        : this.chlorinator.runState,
      status: hasPayloadKey(payload, "status")
        ? normalizeChlorinatorStatus(readString(payload, "status"))
        : this.chlorinator.status,
      statusCode: hasPayloadKey(payload, "status_code") ? readNumber(payload, "status_code") : this.chlorinator.statusCode,
      waterTempF: hasPayloadKey(payload, "water_temp_f") ? readNumber(payload, "water_temp_f") : this.chlorinator.waterTempF,
      model: hasPayloadKey(payload, "model") ? readString(payload, "model") : this.chlorinator.model,
      connected: hasPayloadKey(payload, "connected") ? readBoolean(payload, "connected") : this.chlorinator.connected,
      commsLost: hasPayloadKey(payload, "comms_lost") ? readBoolean(payload, "comms_lost") : this.chlorinator.commsLost,
      lastComm: hasPayloadKey(payload, "last_comm") ? readString(payload, "last_comm") : this.chlorinator.lastComm,
      productionLbPerDay: hasPayloadKey(payload, "production_lb_per_day")
        ? readNumber(payload, "production_lb_per_day")
        : this.chlorinator.productionLbPerDay,
      productionLbPerSecond: hasPayloadKey(payload, "production_lb_per_second")
        ? readNumber(payload, "production_lb_per_second")
        : this.chlorinator.productionLbPerSecond,
      updatedAt: hasPayloadKey(payload, "occurred_at") ? readString(payload, "occurred_at") : this.chlorinator.updatedAt
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
              controller_clock: this.getControllerClockView().summary,
              controller_software_version_reply: this.getControllerSoftwareVersionReply(),
              controller_sub_model_byte: this.controller.controllerSubModelByte,
              controller_model_byte: this.controller.controllerModelByte,
              controller_model_family: this.controller.controllerModelFamily,
              controller_model_label: this.controller.controllerModelLabel,
              air_temp_f: this.controller.airTempF,
              water_temp_f: this.controller.waterTempF,
              heater_enabled: this.controller.heaterEnabled,
              heat_setting_byte: this.controller.heatSettingByte,
              pool_heat_mode: this.controller.poolHeatMode,
              spa_heat_mode: this.controller.spaHeatMode,
              heater_configuration: this.controller.heaterConfiguration == null ? null : {
                detected_heater_type: this.controller.heaterConfiguration.detectedHeaterType,
                solar_or_heat_pump_enabled: this.controller.heaterConfiguration.solarOrHeatPumpEnabled,
                heating_enabled: this.controller.heaterConfiguration.heatingEnabled,
                cooling_enabled: this.controller.heaterConfiguration.coolingEnabled,
                freeze_protection_enabled: this.controller.heaterConfiguration.freezeProtectionEnabled,
                raw_payload: [...this.controller.heaterConfiguration.rawPayload],
                updated_at: this.controller.heaterConfiguration.updatedAt
              },
              heater_settings: this.controller.heaterSettings == null ? null : {
                pool_setpoint: this.controller.heaterSettings.poolSetpoint,
                spa_setpoint: this.controller.heaterSettings.spaSetpoint,
                cool_setpoint: this.controller.heaterSettings.coolSetpoint,
                pool_heat_mode: this.controller.heaterSettings.poolHeatMode,
                spa_heat_mode: this.controller.heaterSettings.spaHeatMode,
                heat_setting_byte: this.controller.heaterSettings.heatSettingByte,
                source: this.controller.heaterSettings.source,
                updated_at: this.controller.heaterSettings.updatedAt
              },
              mode: this.controller.mode,
              controller_mode_byte: this.controller.controllerModeByte,
              controller_mode_label: this.controller.controllerModeLabel,
              active_circuit_keys: [...this.controller.activeCircuitKeys],
              circuits: { ...this.controller.circuits },
              circuit_configurations: this.getControllerCircuitConfigurations(),
              custom_name_bank: this.getControllerCustomNameBank(),
              pump_configurations: this.getControllerPumpConfigurationsView().pumps,
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
              flow_gpm: this.pump.flowGpm,
              filter_pressure_psi: this.pump.filterPressurePsi,
              filter_condition: this.pump.filterCondition,
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
              output_percent: this.chlorinator.outputPercent,
              current_output_percent: this.chlorinator.currentOutputPercent,
              target_output_percent: this.chlorinator.targetOutputPercent,
              run_state: this.chlorinator.runState,
              status: this.chlorinator.status,
              status_code: this.chlorinator.statusCode,
              water_temp_f: this.chlorinator.waterTempF,
              model: this.chlorinator.model,
              connected: this.chlorinator.connected,
              comms_lost: this.chlorinator.commsLost,
              last_comm: this.chlorinator.lastComm,
              production_lb_per_day: this.chlorinator.productionLbPerDay,
              production_lb_per_second: this.chlorinator.productionLbPerSecond,
              updated_at: this.chlorinator.updatedAt
            }
          };
      }
    });
  }

  getControllerSchedulesView(): ControllerSchedulesView {
    const schedules = Object.values(this.controller.controllerSchedules)
      .sort((left, right) => (left.scheduleId ?? 0) - (right.scheduleId ?? 0))
      .map((value) => this.toControllerScheduleView(value));
    const observedPayloads = this.controller.controllerScheduleObservations.map((value) => ({
      payload_hex: value.payloadHex,
      payload_length: value.payloadLength,
      updated_at: value.updatedAt
    }));
    const lastChecked =
      schedules.at(-1)?.updated_at ??
      observedPayloads[0]?.updated_at ??
      null;

    if (schedules.length > 0) {
      return {
        source: "controller_native",
        controller_type: "easytouch",
        status: "available",
        message: "Validated EasyTouch controller schedule frames observed.",
        last_checked: lastChecked,
        schedules,
        observed_payloads: observedPayloads
      };
    }

    if (observedPayloads.length > 0) {
      return {
        source: "controller_native",
        controller_type: "easytouch",
        status: "unavailable",
        message: "Observed EasyTouch schedule payloads, but no validated schedule records are available yet.",
        last_checked: lastChecked,
        schedules: [],
        observed_payloads: observedPayloads
      };
    }

    return {
      source: "controller_native",
      controller_type: "easytouch",
      status: "unavailable",
      message: "EasyTouch schedule payload is not yet fully decoded.",
      last_checked: null,
      schedules: [],
      observed_payloads: []
    };
  }

  getControllerHeaterView(): ControllerHeaterView {
    const configuration = this.controller.heaterConfiguration;
    const settings = this.controller.heaterSettings;
    const lastChecked = configuration?.updatedAt ?? settings?.updatedAt ?? this.controller.updatedAt ?? null;
    const available = configuration != null || settings != null || this.controller.heatSettingByte !== null;

    return {
      source: "controller_native",
      controller_type: "easytouch",
      status: available ? "available" : "unavailable",
      message: available
        ? "EasyTouch-owned heater state is available."
        : "EasyTouch heater state has not been observed yet.",
      last_checked: lastChecked,
      configuration: {
        detected_heater_type: configuration?.detectedHeaterType ?? null,
        solar_or_heat_pump_enabled: configuration?.solarOrHeatPumpEnabled ?? null,
        heating_enabled: configuration?.heatingEnabled ?? null,
        cooling_enabled: configuration?.coolingEnabled ?? null,
        freeze_protection_enabled: configuration?.freezeProtectionEnabled ?? null,
        raw_payload: configuration ? [...configuration.rawPayload] : [],
        updated_at: configuration?.updatedAt ?? null
      },
      settings: {
        pool_setpoint: settings?.poolSetpoint ?? null,
        spa_setpoint: settings?.spaSetpoint ?? null,
        cool_setpoint: settings?.coolSetpoint ?? null,
        pool_heat_mode: settings?.poolHeatMode ?? this.controller.poolHeatMode,
        spa_heat_mode: settings?.spaHeatMode ?? this.controller.spaHeatMode,
        heat_setting_byte: settings?.heatSettingByte ?? this.controller.heatSettingByte,
        source: settings?.source ?? (this.controller.heatSettingByte !== null ? "controller_status" : null),
        updated_at: settings?.updatedAt ?? this.controller.updatedAt
      },
      capabilities: {
        editable_configuration_fields: ["heater_type", "cooling_enabled", "freeze_protection_enabled"],
        editable_setting_fields: ["pool_setpoint", "spa_setpoint", "pool_heat_mode", "spa_heat_mode", "cool_setpoint"]
      }
    };
  }

  getControllerClockView(): ControllerClockView {
    const reply = this.controller.controllerDateReply;
    const hasStatusTime = this.controller.controllerHour24 !== null || this.controller.controllerMinute !== null;
    const hasReply = reply !== null;
    const status = hasStatusTime || hasReply ? "available" : "unavailable";
    const source =
      hasStatusTime && hasReply
        ? "combined"
        : hasReply
          ? "controller_datetime_reply"
          : hasStatusTime
            ? "controller_status"
            : null;

    return {
      source: "controller_native",
      controller_type: "easytouch",
      status,
      message:
        status === "available"
          ? "Controller clock data is available."
          : "No controller clock data has been observed yet.",
      last_checked: reply?.updatedAt ?? this.controller.updatedAt,
      summary: {
        month: reply?.month ?? null,
        day: reply?.day ?? null,
        year: reply?.year ?? null,
        day_of_week: reply?.dayOfWeek ?? null,
        hour_24: reply?.hour24 ?? this.controller.controllerHour24,
        minute: reply?.minute ?? this.controller.controllerMinute,
        daylight_savings_auto: reply?.daylightSavingsAuto ?? null,
        clock_advance: this.controller.controllerClockAdvance,
        source,
        updated_at: reply?.updatedAt ?? this.controller.updatedAt
      },
      capabilities: {
        editable_fields: ["month", "day", "year", "day_of_week", "hour_24", "minute", "daylight_savings_auto", "clock_advance"],
        provisional_fields: ["daylight_savings_auto", "clock_advance"]
      }
    };
  }

  getControllerPumpConfigurationsView(): ControllerPumpConfigurationsView {
    const pumps = Object.values(this.controller.pumpConfigurations)
      .filter((pump) => (pump.pumpType ?? 0) > 0)
      .sort((left, right) => left.pumpId - right.pumpId)
      .map((pump) => ({
        pump_id: pump.pumpId,
        installed: true,
        pump_type: pump.pumpType,
        pump_type_label: formatPumpTypeLabel(pump.pumpType),
        supported_branch: mapPumpTypeBranch(pump.pumpType),
        priming_time: pump.primingTime,
        unknown_3: pump.unknown3,
        unknown_4: pump.unknown4,
        priming_speed: pump.primingSpeed,
        slots: pump.slots.map((slot) => ({ ...slot })),
        trailing_bytes: [...pump.trailingBytes],
        updated_at: pump.updatedAt
      }));

    return {
      source: "controller_native",
      controller_type: "easytouch",
      status: pumps.length > 0 ? "available" : "unavailable",
      message:
        pumps.length > 0
          ? "Live installed-pump configuration is available."
          : "No installed EasyTouch pump configuration has been observed yet.",
      last_checked: pumps[0]?.updated_at ?? null,
      pumps
    };
  }

  getControllerPumpConfiguration(pumpId: number): ControllerPumpConfigurationView | null {
    return this.getControllerPumpConfigurationsView().pumps.find((pump) => pump.pump_id === pumpId) ?? null;
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

  private toControllerScheduleView(value: ControllerScheduleRecord): ControllerScheduleRecordView {
    const view: ControllerScheduleRecordView = {
      controller_family: value.controllerFamily,
      frame_type: value.frameType,
      action: value.action,
      schedule_id: value.scheduleId,
      active: value.active,
      parse_confidence: value.parseConfidence,
      warnings: [...value.warnings],
      raw_payload: [...value.rawPayload],
      updated_at: value.updatedAt
    };

    if (value.circuitId !== null) {
      view.circuit_id = value.circuitId;
    }
    if (value.scheduleType !== null) {
      view.schedule_type = value.scheduleType;
    }
    if (value.scheduleTypeLabel !== null) {
      view.schedule_type_label = value.scheduleTypeLabel;
    }
    if (value.startTimeMinutes !== null) {
      view.start_time_minutes = value.startTimeMinutes;
    }
    if (value.endTimeMinutes !== null) {
      view.end_time_minutes = value.endTimeMinutes;
    }
    if (value.scheduleDays !== null) {
      view.schedule_days = value.scheduleDays;
    }
    if (value.eggTimerRunTimeMinutes !== null) {
      view.egg_timer_run_time_minutes = value.eggTimerRunTimeMinutes;
    }

    return view;
  }
}

function normalizeChlorinatorRunState(value: string | null): string | null {
  switch (value) {
    case "producing":
    case "idle":
    case "off":
    case "unknown":
      return value;
    default:
      return value == null ? null : "unknown";
  }
}

function normalizeChlorinatorStatus(value: string | null): string | null {
  switch (value) {
    case "ok":
    case "low_flow":
    case "low_salt":
    case "very_low_salt":
    case "high_salt":
    case "high_current":
    case "clean_cell":
    case "low_voltage":
    case "low_water_temp":
    case "communication_lost":
    case "fault":
    case "offline":
    case "unknown":
      return value;
    default:
      return value == null ? null : "unknown";
  }
}

function normalizeFilterCondition(value: string | null): string | null {
  switch (value) {
    case "clean":
    case "watch":
    case "dirty":
    case "unknown":
      return value;
    default:
      return value == null ? null : "unknown";
  }
}

function formatPumpTypeLabel(pumpType: number | null): string | null {
  switch (pumpType) {
    case 0:
      return "None";
    case 1:
      return "Single Speed";
    case 2:
      return "Two Speed";
    case 4:
      return "Solar / Booster";
    case 8:
      return "Feature / Aux";
    case 16:
      return "VF";
    case 32:
      return "VS";
    case 128:
      return "Variable Speed";
    default:
      return pumpType === null ? null : `Unknown (${pumpType})`;
  }
}

function mapPumpTypeBranch(pumpType: number | null): "vf" | "vs" | "unknown" | null {
  switch (pumpType) {
    case 16:
      return "vf";
    case 32:
    case 128:
      return "vs";
    default:
      return pumpType === null ? null : "unknown";
  }
}

function readNumber(payload: Record<string, unknown>, key: string): number | null {
  const value = payload[key];
  return typeof value === "number" ? value : null;
}

function hasPayloadKey(payload: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(payload, key);
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

function readObjectArray(payload: Record<string, unknown>, key: string): Array<Record<string, unknown>> {
  const value = payload[key];
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is Record<string, unknown> => entry != null && typeof entry === "object" && !Array.isArray(entry));
}

function readParseConfidence(
  payload: Record<string, unknown>,
  key: string
): "high" | "medium" | "invalid" | null {
  const value = payload[key];
  return value === "high" || value === "medium" || value === "invalid" ? value : null;
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
