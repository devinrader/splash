import type { Logger } from "../logger.js";
import type { MessagingSession } from "../messaging.js";
import {
  encodePentairPumpConfigWriteFromBaseline,
  encodePentairPumpInfoRequest
} from "../plugins/pentair-easytouch.js";
import type { ProtocolPlugin } from "../plugins/types.js";
import type { SelectedProtocolConfig } from "../provider.js";
import { ProtocolCommandError, type CommandEncodingPlan, type CommandResultStatus, type NormalizedCommandIntent } from "./types.js";

interface ActiveContext {
  selection: SelectedProtocolConfig;
  plugin: ProtocolPlugin;
}

interface PendingCommand {
  intent: NormalizedCommandIntent;
  encoded: CommandEncodingPlan;
  acknowledgedWrites: number;
  timeout: NodeJS.Timeout | null;
  workflow:
    | null
    | {
        kind: "controller_circuit_speed";
        phase: "awaiting_baseline" | "awaiting_write_transport" | "awaiting_verification";
        pumpSlot: number;
        selectorValue: number;
        targetRpm: number;
      };
}

export class CommandCoordinator {
  private activeContext: ActiveContext | null = null;
  private session: MessagingSession | null = null;
  private streamId: string | null = null;
  private readonly pending = new Map<string, PendingCommand>();

  constructor(
    private readonly logger: Logger,
    private readonly commandTimeoutMs: number,
    private readonly onStreamIdChange?: (streamId: string | null) => void
  ) {}

  setActiveSelection(selection: SelectedProtocolConfig, plugin: ProtocolPlugin): void {
    this.activeContext = { selection, plugin };
  }

  clearActiveSelection(): void {
    this.activeContext = null;
  }

  getStreamId(): string | null {
    return this.streamId;
  }

  attach(session: MessagingSession): void {
    this.session = session;
    this.streamId = null;
    this.onStreamIdChange?.(null);
    session.subscribe("protocol.command.intent", (payload) => this.handleIntent(payload));
    session.subscribe("serial.port.status", (payload) => this.handlePortStatus(payload));
    session.subscribe("serial.rx.raw", (payload) => this.handleRawChunk(payload));
    session.subscribe("serial.tx.raw", (payload) => this.handleTransportResult(payload));
    session.subscribe("equipment.state.pump", (payload) => this.handlePumpState(payload));
    session.subscribe("protocol.frame.decoded", (payload) => this.handleDecodedFrame(payload));
  }

  private async handleIntent(payload: Record<string, unknown>): Promise<void> {
    let intent: NormalizedCommandIntent;
    try {
      intent = parseIntent(payload);
    } catch (error) {
      const commandError = normalizeCommandError(error);
      this.logger.warn("command.intent.invalid", "Received invalid command intent payload.", {
        error_code: commandError.errorCode,
        detail: commandError.message
      });
      return;
    }

    const context = this.activeContext;

    if (!context) {
      await this.publishResult(intent.pool_id, intent.command_id, "failed", "selection_unavailable", "command_rejected", "No active protocol selection is available.");
      return;
    }

    if (context.selection.poolId !== intent.pool_id) {
      await this.publishResult(intent.pool_id, intent.command_id, "failed", "command_pool_mismatch", "command_rejected", "Command pool does not match the active selection.");
      return;
    }

    if (context.plugin.id !== intent.protocol_name) {
      await this.publishResult(intent.pool_id, intent.command_id, "failed", "command_protocol_mismatch", "command_rejected", "Command protocol does not match the active plugin.");
      return;
    }

    if (!intent.dry_run && !this.streamId) {
      await this.publishResult(intent.pool_id, intent.command_id, "failed", "command_stream_unavailable", "command_rejected", "No active serial stream is available for command transmission.");
      return;
    }

    await this.publishResult(intent.pool_id, intent.command_id, "accepted", null, "command_accepted", "Command intent passed initial validation.");

    try {
      const encoded = context.plugin.encodeCommand(intent, context.selection.protocolConfig);
      for (const [index, write] of encoded.writes.entries()) {
        await this.publishEncoded(intent, encoded, write, index);
      }
      await this.publishResult(intent.pool_id, intent.command_id, "encoded", null, "command_encoded", "Command bytes encoded successfully.");

      if (intent.dry_run) {
        await this.publishResult(intent.pool_id, intent.command_id, "completed", null, "dry_run_completed", "Dry-run command encoded without bus transmission.");
        return;
      }

      const pending: PendingCommand = {
        intent,
        encoded,
        acknowledgedWrites: 0,
        workflow:
          encoded.correlation?.kind === "controller_circuit_speed"
            ? {
                kind: "controller_circuit_speed",
                phase: "awaiting_baseline",
                pumpSlot: encoded.correlation.pumpSlot ?? 0,
                selectorValue: encoded.correlation.selectorValue ?? 0,
                targetRpm: encoded.correlation.targetRpm ?? 0
              }
            : null,
        timeout: setTimeout(() => {
          void this.endPending(
            intent.command_id,
            "timed_out",
            "command_timed_out",
            "command_timeout",
            "Command confirmation was not observed before timeout."
          );
        }, this.commandTimeoutMs)
      };
      this.pending.set(intent.command_id, pending);

      for (const [index, write] of encoded.writes.entries()) {
        await this.publishWriteRequest(intent, encoded, write, index);
      }
    } catch (error) {
      const commandError = normalizeCommandError(error);
      await this.publishResult(intent.pool_id, intent.command_id, "failed", commandError.errorCode, "command_encode_failed", commandError.message);
    }
  }

  private async handlePortStatus(payload: Record<string, unknown>): Promise<void> {
    await this.updateStreamId(typeof payload.stream_id === "string" ? payload.stream_id : null);
  }

  private async handleRawChunk(payload: Record<string, unknown>): Promise<void> {
    const streamId = typeof payload.stream_id === "string" ? payload.stream_id : null;
    if (!streamId) {
      return;
    }

    await this.updateStreamId(streamId);
  }

  private async updateStreamId(streamId: string | null): Promise<void> {
    const previousStreamId = this.streamId;
    if (this.streamId === streamId) {
      return;
    }

    this.streamId = streamId;
    this.onStreamIdChange?.(streamId);

    if (streamId) {
      this.logger.info("command.stream.updated", "Updated active stream for command correlation.", {
        stream_id: streamId
      });
    }

    if (previousStreamId && streamId !== previousStreamId) {
      for (const commandId of [...this.pending.keys()]) {
        await this.endPending(
          commandId,
          "failed",
          "command_stream_reset",
          "command_stream_reset",
          "The active serial stream changed before the command completed."
        );
      }
    }
  }

  private async handleTransportResult(payload: Record<string, unknown>): Promise<void> {
    const commandId = typeof payload.command_id === "string" ? payload.command_id : null;
    if (!commandId) {
      return;
    }

    const pending = this.pending.get(commandId);
    if (!pending) {
      return;
    }

    const writeResult = typeof payload.write_result === "string" ? payload.write_result : null;
    const errorCode = typeof payload.error_code === "string" ? payload.error_code : null;
    const detail = typeof payload.detail === "string" ? payload.detail : null;

    if (writeResult !== "ok") {
      await this.endPending(
        commandId,
        "failed",
        errorCode ?? "command_transport_failed",
        "command_transmit_failed",
        detail ?? `Transport write failed with result '${writeResult ?? "unknown"}'.`
      );
      return;
    }

    pending.acknowledgedWrites += 1;
    if (pending.acknowledgedWrites === pending.encoded.writes.length) {
      if (pending.workflow?.kind === "controller_circuit_speed") {
        await this.handleControllerCircuitTransportAck(commandId, pending);
        return;
      }

      await this.publishResult(pending.intent.pool_id, pending.intent.command_id, "transmitted", null, "transport_write_observed", "All command writes reached the transport layer.");
      if (pending.encoded.correlation?.kind === "transport_ack") {
        await this.completePending(commandId, "transport_write_observed", "Command completed after transport acknowledgement.");
      }
    }
  }

  private async handleDecodedFrame(payload: Record<string, unknown>): Promise<void> {
    const messageType = readString(payload, "message_type");
    if (messageType !== "pump_info") {
      return;
    }

    const fields = readObject(payload, "fields");
    const pumpSlot = readNumber(fields, "pump_slot");

    for (const [commandId, pending] of this.pending.entries()) {
      const workflow = pending.workflow;
      if (!workflow || workflow.kind !== "controller_circuit_speed" || workflow.pumpSlot !== pumpSlot) {
        continue;
      }

      if (workflow.phase === "awaiting_baseline") {
        const encoded = encodePentairPumpConfigWriteFromBaseline({
          poolId: pending.intent.pool_id,
          commandId,
          targetRpm: workflow.targetRpm,
          selectorValue: workflow.selectorValue,
          pumpSlot: workflow.pumpSlot,
          fields
        });
        pending.encoded = encoded;
        pending.acknowledgedWrites = 0;
        pending.workflow = {
          ...workflow,
          phase: "awaiting_write_transport"
        };

        for (const [index, write] of encoded.writes.entries()) {
          await this.publishEncoded(pending.intent, encoded, write, index);
        }
        await this.publishResult(
          pending.intent.pool_id,
          pending.intent.command_id,
          "encoded",
          null,
          "controller_config_write_encoded",
          "Controller pump config write encoded from a fresh live baseline."
        );
        for (const [index, write] of encoded.writes.entries()) {
          await this.publishWriteRequest(pending.intent, encoded, write, index);
        }
        continue;
      }

      if (workflow.phase === "awaiting_verification") {
        const slotsValue = fields.slots;
        if (!Array.isArray(slotsValue)) {
          continue;
        }

        const matched = slotsValue.some((slot) => {
          if (!slot || typeof slot !== "object" || Array.isArray(slot)) {
            return false;
          }

          const record = slot as Record<string, unknown>;
          return readNumber(record, "circuit_assignment") === workflow.selectorValue && readNumber(record, "rpm") === workflow.targetRpm;
        });

        if (matched) {
          await this.completePending(commandId, "command_completed", "Verified controller pump config reflects the requested RPM.");
        }
      }
    }
  }

  private async handlePumpState(payload: Record<string, unknown>): Promise<void> {
    for (const [commandId, pending] of this.pending.entries()) {
      const expectation = pending.encoded.correlation;
      if (!expectation || expectation.kind !== "pump_rpm") {
        continue;
      }

      const busAddress = readString(payload, "bus_address");
      const rpm = readNumber(payload, "rpm");
      if (busAddress !== expectation.busAddress || rpm !== expectation.targetRpm) {
        continue;
      }

      await this.completePending(commandId, "command_completed", "Observed pump state matched the requested RPM.");
    }
  }

  private async publishEncoded(
    intent: NormalizedCommandIntent,
    plan: CommandEncodingPlan,
    write: CommandEncodingPlan["writes"][number],
    index: number
  ): Promise<void> {
    if (!this.session) {
      return;
    }

    await this.session.publish("protocol.command.encoded", {
      pool_id: intent.pool_id,
      command_id: intent.command_id,
      write_index: index + 1,
      write_count: plan.writes.length,
      encoded_at: new Date().toISOString(),
      protocol_name: plan.protocolName,
      bytes_hex: write.bytesHex,
      byte_count: write.bytes.length,
      bus_requirements: write.busRequirements
    });
  }

  private async publishWriteRequest(
    intent: NormalizedCommandIntent,
    plan: CommandEncodingPlan,
    write: CommandEncodingPlan["writes"][number],
    index: number
  ): Promise<void> {
    if (!this.session || !this.streamId) {
      return;
    }

    await this.session.publish("serial.write.request", {
      pool_id: intent.pool_id,
      stream_id: this.streamId,
      command_id: intent.command_id,
      write_index: index + 1,
      write_count: plan.writes.length,
      requested_at: new Date().toISOString(),
      protocol_name: plan.protocolName,
      bytes_hex: write.bytesHex,
      byte_count: write.bytes.length,
      bus_requirements: write.busRequirements
    });
  }

  private async publishResult(
    poolId: string,
    commandId: string,
    status: CommandResultStatus,
    errorCode: string | null,
    stage: string,
    detail: string
  ): Promise<void> {
    if (!this.session) {
      return;
    }

    await this.session.publish(`command.result.${commandId}`, {
      pool_id: poolId,
      command_id: commandId,
      status,
      reported_at: new Date().toISOString(),
      stage,
      protocol_name: this.activeContext?.plugin.id ?? null,
      error_code: errorCode,
      detail,
      related_frame_ids: []
    });
  }

  private async endPending(
    commandId: string,
    status: "timed_out" | "failed",
    errorCode: string,
    stage: string,
    detail: string
  ): Promise<void> {
    const pending = this.pending.get(commandId);
    if (!pending) {
      return;
    }

    if (pending.timeout) {
      clearTimeout(pending.timeout);
    }
    this.pending.delete(commandId);
    await this.publishResult(pending.intent.pool_id, pending.intent.command_id, status, errorCode, stage, detail);
  }

  private async completePending(commandId: string, stage: string, detail: string): Promise<void> {
    const pending = this.pending.get(commandId);
    if (!pending) {
      return;
    }

    if (pending.timeout) {
      clearTimeout(pending.timeout);
    }
    this.pending.delete(commandId);
    await this.publishResult(pending.intent.pool_id, pending.intent.command_id, "completed", null, stage, detail);
  }

  private async handleControllerCircuitTransportAck(commandId: string, pending: PendingCommand): Promise<void> {
    const workflow = pending.workflow;
    if (!workflow || workflow.kind !== "controller_circuit_speed") {
      return;
    }

    if (workflow.phase === "awaiting_baseline") {
      return;
    }

    if (workflow.phase === "awaiting_write_transport") {
      const verificationPlan = encodePentairPumpInfoRequest({
        poolId: pending.intent.pool_id,
        commandId,
        pumpSlot: workflow.pumpSlot
      });
      pending.encoded = verificationPlan;
      pending.acknowledgedWrites = 0;
      pending.workflow = {
        ...workflow,
        phase: "awaiting_verification"
      };

      for (const [index, write] of verificationPlan.writes.entries()) {
        await this.publishEncoded(pending.intent, verificationPlan, write, index);
      }
      for (const [index, write] of verificationPlan.writes.entries()) {
        await this.publishWriteRequest(pending.intent, verificationPlan, write, index);
      }
      return;
    }

    if (workflow.phase === "awaiting_verification") {
      await this.publishResult(
        pending.intent.pool_id,
        pending.intent.command_id,
        "transmitted",
        null,
        "transport_write_observed",
        "Controller config write and verification request reached the transport layer."
      );
    }
  }
}

function normalizeCommandError(error: unknown): ProtocolCommandError {
  if (error instanceof ProtocolCommandError) {
    return error;
  }

  if (error instanceof Error) {
    return new ProtocolCommandError(error.message, "command_encode_failed");
  }

  return new ProtocolCommandError(String(error), "command_encode_failed");
}

function parseIntent(payload: Record<string, unknown>): NormalizedCommandIntent {
  return {
    pool_id: readRequiredString(payload, "pool_id"),
    command_id: readRequiredString(payload, "command_id"),
    requested_at: readRequiredString(payload, "requested_at"),
    protocol_name: readRequiredString(payload, "protocol_name"),
    target: readObject(payload, "target"),
    command_type: readRequiredString(payload, "command_type"),
    arguments: readObject(payload, "arguments"),
    requested_by: readOptionalString(payload, "requested_by"),
    dry_run: readOptionalBoolean(payload, "dry_run") ?? false
  };
}

function readObject(payload: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = payload[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProtocolCommandError(`Command payload field '${key}' must be an object.`, "command_payload_invalid");
  }
  return value as Record<string, unknown>;
}

function readRequiredString(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new ProtocolCommandError(`Command payload field '${key}' must be a non-empty string.`, "command_payload_invalid");
  }
  return value;
}

function readOptionalString(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  return typeof value === "string" ? value : undefined;
}

function readOptionalBoolean(payload: Record<string, unknown>, key: string): boolean | undefined {
  const value = payload[key];
  return typeof value === "boolean" ? value : undefined;
}

function readString(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" ? value : null;
}

function readNumber(payload: Record<string, unknown>, key: string): number | null {
  const value = payload[key];
  return typeof value === "number" ? value : null;
}
