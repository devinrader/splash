import type { EquipmentBridgeEntry } from "./bridge.js";

export interface ControllerLatestState {
  airTempF: number | null;
  waterTempF: number | null;
  updatedAt: string | null;
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
    airTempF: null,
    waterTempF: null,
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
      airTempF: readNumber(payload, "air_temp_f"),
      waterTempF: readNumber(payload, "water_temp_f"),
      updatedAt: readString(payload, "occurred_at")
    };
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
            latest_state: {
              air_temp_f: this.controller.airTempF,
              water_temp_f: this.controller.waterTempF,
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
