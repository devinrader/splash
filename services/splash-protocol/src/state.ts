export type StartupPhase =
  | "booting"
  | "config_invalid"
  | "starting_http"
  | "starting_nats"
  | "loading_plugins"
  | "config_degraded"
  | "decode_degraded"
  | "command_degraded"
  | "running_degraded"
  | "running_ok"
  | "fatal"
  | "shutting_down";

export interface AppSnapshot {
  status: "ok" | "degraded" | "error";
  startupPhase: StartupPhase;
  poolId: string | null;
  activePlugin: string | null;
  streamId: string | null;
  nats: "ok" | "error";
  configuration: "valid" | "error";
  decode: "ok" | "error";
  commands: "ok" | "error";
  configErrorCode: string | null;
  decodeErrorCode: string | null;
  commandErrorCode: string | null;
  shutdownReason: string | null;
  lastTransitionAt: string;
}

export function createInitialSnapshot(): AppSnapshot {
  return {
    status: "degraded",
    startupPhase: "booting",
    poolId: null,
    activePlugin: null,
    streamId: null,
    nats: "error",
    configuration: "error",
    decode: "error",
    commands: "error",
    configErrorCode: "config_provider_unavailable",
    decodeErrorCode: "decode_blocked_no_active_plugin",
    commandErrorCode: "command_blocked_no_active_plugin",
    shutdownReason: null,
    lastTransitionAt: new Date().toISOString()
  };
}
