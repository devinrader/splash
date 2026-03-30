export interface EquipmentRecord {
  id: string;
  equipment_type: "controller" | "pump" | "chlorinator";
  display_name: string;
  protocol_name: string;
  bus_address?: string | null;
  latest_state: Record<string, unknown>;
}

export interface EquipmentResponse {
  data: EquipmentRecord[];
  error: unknown;
}

export interface HealthResponse {
  status: "ok" | "degraded";
  data?: {
    dependencies?: Record<string, string>;
  };
  error: unknown;
}

export interface CommandAcceptedResponse {
  data: {
    command_id: string;
    status: string;
  };
  error: unknown;
}

export interface CommandResultEvent {
  command_id?: string;
  status?: string;
  detail?: string;
  error_code?: string | null;
  reported_at?: string;
}

export interface DashboardCardValue {
  value: number | null;
  unit: string;
  label: string;
}
