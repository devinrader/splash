export type CommandResultStatus =
  | "accepted"
  | "encoded"
  | "transmitted"
  | "completed"
  | "timed_out"
  | "failed";

export interface CommandTarget {
  equipment_id?: string;
  equipment_type?: string;
  bus_address?: string;
  circuit_key?: string;
}

export interface NormalizedCommandIntent {
  pool_id: string;
  command_id: string;
  requested_at: string;
  protocol_name: string;
  target: CommandTarget;
  command_type: string;
  arguments: Record<string, unknown>;
  requested_by?: string;
  dry_run?: boolean;
}

export interface EncodedWrite {
  bytes: Uint8Array;
  bytesHex: string;
  busRequirements: {
    requires_idle_ms: number;
  };
}

export interface CommandCorrelationExpectation {
  kind: "pump_rpm" | "transport_ack" | "controller_ack" | "controller_circuit_speed" | "controller_circuit_config" | "controller_schedule_write" | "controller_heater_configuration" | "controller_heater_settings";
  targetRpm?: number;
  busAddress?: string;
  pumpSlot?: number;
  selectorValue?: number;
  circuitKey?: string;
  startIndex?: number;
  endIndex?: number;
  scheduleId?: number;
  mode?: "repeat" | "egg_timer";
  circuitId?: number;
  startTimeMinutes?: number;
  endTimeMinutes?: number;
  daysMask?: number;
  runtimeMinutes?: number;
  heaterType?: "ultratempHeatPumpCom" | "ultratempEtiHybrid";
  coolingEnabled?: boolean;
  freezeProtectionEnabled?: boolean;
  poolSetpoint?: number;
  spaSetpoint?: number;
  poolHeatMode?: number;
  spaHeatMode?: number;
  coolSetpoint?: number;
}

export interface CommandEncodingPlan {
  protocolName: string;
  writes: EncodedWrite[];
  correlation: CommandCorrelationExpectation | null;
}

export class ProtocolCommandError extends Error {
  constructor(
    message: string,
    readonly errorCode: string
  ) {
    super(message);
  }
}
