import { create } from "zustand";
import type { CommandResultEvent, EquipmentRecord, PlatformStatusResponse } from "./types";

export type HealthStatus = "healthy" | "degraded" | "unhealthy" | "down" | "unknown";
export type SseStatus = "connecting" | "connected" | "disconnected";

export interface CommandUiState {
  commandId: string | null;
  requestedRpm: number | null;
  status: string | null;
  detail: string | null;
  errorCode: string | null;
}

export interface FrontendState {
  equipment: Record<string, EquipmentRecord>;
  healthStatus: HealthStatus;
  healthData: PlatformStatusResponse | null;
  sseStatus: SseStatus;
  errorMessage: string | null;
  command: CommandUiState;
  setEquipment: (records: EquipmentRecord[]) => void;
  setHealthStatus: (status: HealthStatus) => void;
  setHealthData: (data: PlatformStatusResponse | null) => void;
  setSseStatus: (status: SseStatus) => void;
  setErrorMessage: (message: string | null) => void;
  beginPumpCommand: (input: { commandId: string; rpm: number }) => void;
  applyCommandResult: (payload: CommandResultEvent) => void;
  applyEquipmentStateEvent: (payload: Record<string, unknown>) => void;
  applyPumpStateEvent: (payload: Record<string, unknown>) => void;
}

const initialCommandState: CommandUiState = {
  commandId: null,
  requestedRpm: null,
  status: null,
  detail: null,
  errorCode: null
};

export const useFrontendStore = create<FrontendState>((set) => ({
  equipment: {},
  healthStatus: "unknown",
  healthData: null,
  sseStatus: "connecting",
  errorMessage: null,
  command: initialCommandState,
  setEquipment(records) {
    set(() => ({
      equipment: Object.fromEntries(records.map((record) => [record.id, record]))
    }));
  },
  setHealthStatus(status) {
    set(() => ({ healthStatus: status }));
  },
  setHealthData(data) {
    set(() => ({ healthData: data }));
  },
  setSseStatus(status) {
    set(() => ({ sseStatus: status }));
  },
  setErrorMessage(message) {
    set(() => ({ errorMessage: message }));
  },
  beginPumpCommand({ commandId, rpm }) {
    set(() => ({
      command: {
        commandId,
        requestedRpm: rpm,
        status: "accepted",
        detail: "Pump speed request accepted by the API.",
        errorCode: null
      }
    }));
  },
  applyCommandResult(payload) {
    set((state) => {
      if (!payload.command_id || state.command.commandId !== payload.command_id) {
        return state;
      }

      const terminal = payload.status === "completed" || payload.status === "failed" || payload.status === "timed_out";
      return {
        ...state,
        command: {
          commandId: terminal ? null : payload.command_id,
          requestedRpm: terminal ? null : state.command.requestedRpm,
          status: payload.status ?? state.command.status,
          detail: payload.detail ?? state.command.detail,
          errorCode: payload.error_code ?? null
        }
      };
    });
  },
  applyEquipmentStateEvent(payload) {
    set((state) => {
      if (
        "salt_ppm" in payload
        || "output_percent" in payload
        || "run_state" in payload
        || "status" in payload
      ) {
        return mergeLatestState(state, "chlorinator-main", payload);
      }

      return mergeLatestState(state, "controller-main", payload);
    });
  },
  applyPumpStateEvent(payload) {
    set((state) => mergeLatestState(state, "pump-main", payload));
  }
}));

function mergeLatestState(
  state: FrontendState,
  equipmentId: string,
  payload: Record<string, unknown>
): Pick<FrontendState, "equipment"> {
  const existing = state.equipment[equipmentId];
  if (!existing) {
    return {
      equipment: state.equipment
    };
  }

  const normalizedPayload =
    typeof payload.occurred_at === "string" && typeof payload.updated_at !== "string"
      ? {
          ...payload,
          updated_at: payload.occurred_at
        }
      : payload;

  return {
    equipment: {
      ...state.equipment,
      [equipmentId]: {
        ...existing,
        latest_state: {
          ...existing.latest_state,
          ...normalizedPayload
        }
      }
    }
  };
}
