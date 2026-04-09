export interface EquipmentRecord {
  id: string;
  equipment_type: "controller" | "pump" | "chlorinator";
  display_name: string;
  protocol_name: string;
  bus_address?: string | null;
  control_circuit_keys?: string[];
  default_control_circuit_key?: string | null;
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
