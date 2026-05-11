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
  metrics: {
    framesAssembledTotal: number;
    frameValidationFailuresTotal: number;
    normalizedEventsTotal: number;
    commandsAcceptedTotal: number;
    commandResultsTotal: Record<"accepted" | "encoded" | "transmitted" | "completed" | "timed_out" | "failed", number>;
    streamResetsTotal: number;
    correlationTimeoutsTotal: number;
    serialRxMessagesTotal: number;
    serialTxMessagesTotal: number;
    protocolFramesDecodedTotal: number;
    protocolFramesUnidentifiedTotal: number;
    natsMessagesReceivedTotal: number;
    natsMessagesPublishedTotal: number;
  };
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
    lastTransitionAt: new Date().toISOString(),
    metrics: {
      framesAssembledTotal: 0,
      frameValidationFailuresTotal: 0,
      normalizedEventsTotal: 0,
      commandsAcceptedTotal: 0,
      commandResultsTotal: {
        accepted: 0,
        encoded: 0,
        transmitted: 0,
        completed: 0,
        timed_out: 0,
        failed: 0
      },
      streamResetsTotal: 0,
      correlationTimeoutsTotal: 0,
      serialRxMessagesTotal: 0,
      serialTxMessagesTotal: 0,
      protocolFramesDecodedTotal: 0,
      protocolFramesUnidentifiedTotal: 0,
      natsMessagesReceivedTotal: 0,
      natsMessagesPublishedTotal: 0
    }
  };
}
