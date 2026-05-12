import type {
  CommandAcceptedResponse,
  CircuitConfigRequestResponse,
  ControllerSchedulesResponse,
  EquipmentResponse,
  PlatformStatusResponse,
  ProtocolAnnotationConfidence,
  ProtocolAnnotationResponse,
  ProtocolBundleComparisonResponse,
  ProtocolBundleCreatedResponse,
  ProtocolBundleSummaryResponse,
  ProtocolPromptInputType,
  ProtocolPromptResponse,
  RawFrameSendResponse,
  RemoteLayoutRequestResponse
} from "./types";

const apiBaseUrl = normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL);

export function buildApiUrl(path: string): string {
  if (!path.startsWith("/")) {
    throw new Error(`API path must start with '/': ${path}`);
  }

  return `${apiBaseUrl}${path}`;
}

export async function fetchEquipment(): Promise<EquipmentResponse> {
  const response = await fetch(buildApiUrl("/equipment"));
  if (!response.ok) {
    throw new Error(`Equipment request failed with HTTP ${response.status}.`);
  }
  return (await response.json()) as EquipmentResponse;
}

export async function fetchPlatformStatus(): Promise<PlatformStatusResponse> {
  const response = await fetch(buildApiUrl("/platform/status"));
  if (!response.ok) {
    throw new Error(`Platform status request failed with HTTP ${response.status}.`);
  }
  return (await response.json()) as PlatformStatusResponse;
}

export async function fetchControllerSchedules(): Promise<ControllerSchedulesResponse> {
  const response = await fetch(buildApiUrl("/controller/schedules"));
  if (!response.ok) {
    throw new Error(`Controller schedules request failed with HTTP ${response.status}.`);
  }
  return (await response.json()) as ControllerSchedulesResponse;
}

export async function requestPumpSpeed(input: {
  equipmentId: string;
  rpm: number;
  circuitKey?: string | null;
}): Promise<CommandAcceptedResponse> {
  const response = await fetch(buildApiUrl(`/equipment/${encodeURIComponent(input.equipmentId)}/control`), {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      command_type: "set_speed",
      circuit_key: input.circuitKey ?? null,
      arguments: {
        rpm: input.rpm
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Pump speed request failed with HTTP ${response.status}.`);
  }

  return (await response.json()) as CommandAcceptedResponse;
}

export async function requestCircuitState(input: {
  equipmentId: string;
  circuitKey: string;
  enabled: boolean;
}): Promise<CommandAcceptedResponse> {
  const response = await fetch(buildApiUrl(`/equipment/${encodeURIComponent(input.equipmentId)}/control`), {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      command_type: "set_circuit_state",
      circuit_key: input.circuitKey,
      arguments: {
        enabled: input.enabled
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Circuit state request failed with HTTP ${response.status}.`);
  }

  return (await response.json()) as CommandAcceptedResponse;
}

export async function fetchProtocolBundles(): Promise<ProtocolBundleSummaryResponse> {
  const response = await fetch(buildApiUrl("/protocol/bundles"));
  if (!response.ok) {
    throw new Error(`Protocol bundles request failed with HTTP ${response.status}.`);
  }
  return (await response.json()) as ProtocolBundleSummaryResponse;
}

export async function createProtocolBundle(input: { label: string | null }): Promise<ProtocolBundleCreatedResponse> {
  const response = await fetch(buildApiUrl("/protocol/bundles"), {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      label: input.label
    })
  });

  if (!response.ok) {
    throw new Error(`Protocol bundle creation failed with HTTP ${response.status}.`);
  }

  return (await response.json()) as ProtocolBundleCreatedResponse;
}

export async function requestCircuitConfig(input: {
  startIndex?: number;
  endIndex?: number;
} = {}): Promise<CircuitConfigRequestResponse> {
  const response = await fetch(buildApiUrl("/protocol/circuit-config/request"), {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      start_index: input.startIndex ?? 1,
      end_index: input.endIndex ?? 20
    })
  });

  if (!response.ok) {
    throw new Error(`Circuit config request failed with HTTP ${response.status}.`);
  }

  return (await response.json()) as CircuitConfigRequestResponse;
}

export async function requestControllerDatetime(): Promise<CommandAcceptedResponse> {
  const response = await fetch(buildApiUrl("/protocol/controller-datetime/request"), {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({})
  });

  if (!response.ok) {
    throw new Error(`Controller datetime request failed with HTTP ${response.status}.`);
  }

  return (await response.json()) as CommandAcceptedResponse;
}

export async function syncControllerDatetime(): Promise<CommandAcceptedResponse> {
  const response = await fetch(buildApiUrl("/protocol/controller-datetime/sync"), {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({})
  });

  if (!response.ok) {
    throw new Error(`Controller datetime sync failed with HTTP ${response.status}.`);
  }

  return (await response.json()) as CommandAcceptedResponse;
}

export async function compareProtocolBundles(input: {
  baselineBundleId: string;
  comparisonBundleId: string;
}): Promise<ProtocolBundleComparisonResponse> {
  const response = await fetch(buildApiUrl("/protocol/bundles/compare"), {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      baseline_bundle_id: input.baselineBundleId,
      comparison_bundle_id: input.comparisonBundleId
    })
  });

  if (!response.ok) {
    throw new Error(`Protocol bundle comparison failed with HTTP ${response.status}.`);
  }

  return (await response.json()) as ProtocolBundleComparisonResponse;
}

export async function fetchProtocolAnnotations(bundleId: string): Promise<ProtocolAnnotationResponse> {
  const response = await fetch(buildApiUrl(`/protocol/annotations?bundle_id=${encodeURIComponent(bundleId)}`));
  if (!response.ok) {
    throw new Error(`Protocol annotations request failed with HTTP ${response.status}.`);
  }
  return (await response.json()) as ProtocolAnnotationResponse;
}

export async function createProtocolAnnotation(input: {
  bundleId: string;
  frameIndex: number;
  fieldName: string;
  byteStart: number;
  byteEnd: number;
  confidence: ProtocolAnnotationConfidence;
  label: string;
  notes: string | null;
}): Promise<{ data: unknown; error: unknown }> {
  const response = await fetch(buildApiUrl("/protocol/annotations"), {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      bundle_id: input.bundleId,
      frame_index: input.frameIndex,
      field_name: input.fieldName,
      byte_start: input.byteStart,
      byte_end: input.byteEnd,
      confidence: input.confidence,
      label: input.label,
      notes: input.notes
    })
  });

  if (!response.ok) {
    throw new Error(`Protocol annotation creation failed with HTTP ${response.status}.`);
  }

  return (await response.json()) as { data: unknown; error: unknown };
}

export async function fetchProtocolPrompts(bundleId: string): Promise<ProtocolPromptResponse> {
  const response = await fetch(buildApiUrl(`/protocol/prompts?bundle_id=${encodeURIComponent(bundleId)}`));
  if (!response.ok) {
    throw new Error(`Protocol prompts request failed with HTTP ${response.status}.`);
  }
  return (await response.json()) as ProtocolPromptResponse;
}

export async function createProtocolPrompt(input: {
  bundleId: string;
  frameIndex: number;
  fieldName: string | null;
  prompt: string;
  why: string;
  inputType: ProtocolPromptInputType;
  operatorResponse: string | null;
}): Promise<{ data: unknown; error: unknown }> {
  const response = await fetch(buildApiUrl("/protocol/prompts"), {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      bundle_id: input.bundleId,
      frame_index: input.frameIndex,
      field_name: input.fieldName,
      prompt: input.prompt,
      why: input.why,
      input_type: input.inputType,
      operator_response: input.operatorResponse
    })
  });

  if (!response.ok) {
    throw new Error(`Protocol prompt creation failed with HTTP ${response.status}.`);
  }

  return (await response.json()) as { data: unknown; error: unknown };
}

export async function requestRemoteLayoutPage(input: { pageIndex: number }): Promise<RemoteLayoutRequestResponse> {
  const response = await fetch(buildApiUrl("/protocol/remote-layout/request"), {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      page_index: input.pageIndex
    })
  });

  if (!response.ok) {
    throw new Error(`Remote Layout request failed with HTTP ${response.status}.`);
  }

  return (await response.json()) as RemoteLayoutRequestResponse;
}

export async function sendRawProtocolFrame(input: {
  protocolName: string;
  bytesHex: string;
}): Promise<RawFrameSendResponse> {
  const response = await fetch(buildApiUrl("/protocol/raw-frame/send"), {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      protocol_name: input.protocolName,
      bytes_hex: input.bytesHex
    })
  });

  if (!response.ok) {
    throw new Error(`Raw frame send failed with HTTP ${response.status}.`);
  }

  return (await response.json()) as RawFrameSendResponse;
}

function normalizeBaseUrl(value: string | undefined): string {
  if (!value) {
    return "";
  }

  if (value === "/") {
    return "";
  }

  return value.endsWith("/") ? value.slice(0, -1) : value;
}
