import type { CommandAcceptedResponse, EquipmentResponse, HealthResponse } from "./types";

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

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch(buildApiUrl("/health"));
  if (!response.ok) {
    throw new Error(`Health request failed with HTTP ${response.status}.`);
  }
  return (await response.json()) as HealthResponse;
}

export async function requestPumpSpeed(input: { equipmentId: string; rpm: number }): Promise<CommandAcceptedResponse> {
  const response = await fetch(buildApiUrl(`/equipment/${encodeURIComponent(input.equipmentId)}/control`), {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      command_type: "set_speed",
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

function normalizeBaseUrl(value: string | undefined): string {
  if (!value) {
    return "";
  }

  if (value === "/") {
    return "";
  }

  return value.endsWith("/") ? value.slice(0, -1) : value;
}
