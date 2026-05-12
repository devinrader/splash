export interface EquipmentRecord {
  id: string;
  equipment_type: "controller" | "pump" | "chlorinator";
  display_name: string;
  protocol_name: string;
  bus_address?: string | null;
  control_circuit_keys?: string[];
  default_control_circuit_key?: string | null;
  hardware?: {
    circuits?: ControllerCircuitHardwareRecord[];
  };
  latest_state: Record<string, unknown>;
}

export interface ControllerCircuitHardwareRecord {
  circuit_key: string;
  display_name: string;
  circuit_type: string;
  installed: boolean;
  writable: boolean;
  configuration_circuit_index: number | null;
  write_circuit_id: number | null;
}

export interface EquipmentResponse {
  data: EquipmentRecord[];
  error: unknown;
}

export interface HealthResponse {
  status: "healthy" | "degraded" | "unhealthy" | "down" | "unknown";
  message?: string;
  checks?: Record<string, { status: string; message?: string }>;
  error: unknown;
}

export interface PlatformStatusResponse {
  overall: "healthy" | "degraded" | "unhealthy" | "down" | "unknown";
  generatedAt: string;
  connectivity?: {
    rs485?: {
      rx_messages_per_second?: number | null;
      tx_messages_per_second?: number | null;
    };
    nats_broker?: {
      status?: "ok" | "unavailable" | "error";
      subscriptions?: number | null;
      in_messages_per_second?: number | null;
      out_messages_per_second?: number | null;
      last_sample_at?: string | null;
      error_code?: string | null;
    };
  };
  services: PlatformServiceHealthRecord[];
}

export interface ControllerScheduleRecord {
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

export interface ControllerSchedulesData {
  source: "controller_native";
  controller_type: "easytouch";
  status: "available" | "unavailable" | "stale";
  message: string;
  last_checked: string | null;
  schedules: ControllerScheduleRecord[];
  observed_payloads?: Array<{
    payload_hex: string | null;
    payload_length: number | null;
    updated_at: string | null;
  }>;
}

export interface ControllerSchedulesResponse {
  data: ControllerSchedulesData;
  error: unknown;
}

export interface PlatformServiceHealthRecord {
  name: string;
  type: "splash" | "third-party";
  criticality: "critical" | "important" | "optional";
  status: "healthy" | "degraded" | "unhealthy" | "down" | "unknown";
  message: string;
  lastChecked: string | null;
  responseTimeMs: number | null;
  checks?: Record<string, { status: string; message?: string }>;
}

export interface ConnectivityHistorySample {
  recorded_at: string;
  rs485_in_messages_per_second: number | null;
  rs485_out_messages_per_second: number | null;
  nats_in_messages_per_second: number | null;
  nats_out_messages_per_second: number | null;
}

export interface CommandAcceptedResponse {
  data: {
    command_id: string;
    status: string;
  };
  error: unknown;
}

export interface RemoteLayoutRequestResponse {
  data: {
    command_id: string;
    status: string;
  };
  error: unknown;
}

export interface RawFrameSendResponse {
  data: {
    command_id: string;
    status: string;
  };
  error: unknown;
}

export interface CircuitConfigRequestResponse {
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

export interface ProtocolFrameEvent {
  event: string;
  payload: Record<string, unknown>;
  received_at: string;
}

export interface ProtocolBundleSummary {
  id: string;
  label: string | null;
  frame_count: number;
  created_at: string;
}

export interface ProtocolBundleSummaryResponse {
  data: ProtocolBundleSummary[];
  error: unknown;
}

export interface ProtocolBundleCreatedResponse {
  data: ProtocolBundleSummary;
  error: unknown;
}

export interface ProtocolFieldByteChange {
  byte_index: number;
  baseline: string;
  comparison: string;
}

export interface ProtocolChangedField {
  field: string;
  byte_changes: ProtocolFieldByteChange[];
}

export interface ProtocolFramePairDiff {
  index: number;
  baseline_event: string | null;
  comparison_event: string | null;
  baseline_payload: Record<string, unknown> | null;
  comparison_payload: Record<string, unknown> | null;
  changed_fields: ProtocolChangedField[];
}

export interface ProtocolBundleComparison {
  baseline_bundle_id: string;
  comparison_bundle_id: string;
  frame_pairs: ProtocolFramePairDiff[];
}

export interface ProtocolBundleComparisonResponse {
  data: ProtocolBundleComparison;
  error: unknown;
}

export type ProtocolAnnotationConfidence = "known" | "inferred" | "unknown";

export interface ProtocolAnnotation {
  id: string;
  bundle_id: string;
  frame_index: number;
  field_name: string;
  byte_start: number;
  byte_end: number;
  confidence: ProtocolAnnotationConfidence;
  label: string;
  notes: string | null;
  created_at: string;
}

export interface ProtocolAnnotationResponse {
  data: ProtocolAnnotation[];
  error: unknown;
}

export type ProtocolPromptInputType =
  | "controller_menu_state"
  | "equipment_behavior"
  | "circuit_name"
  | "configured_rpm";

export interface ProtocolPrompt {
  id: string;
  bundle_id: string;
  frame_index: number;
  field_name: string | null;
  prompt: string;
  why: string;
  input_type: ProtocolPromptInputType;
  operator_response: string | null;
  status: "open" | "answered";
  created_at: string;
  resolved_at: string | null;
}

export interface ProtocolPromptResponse {
  data: ProtocolPrompt[];
  error: unknown;
}
