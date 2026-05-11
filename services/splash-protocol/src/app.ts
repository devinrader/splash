import { loadConfig, type ProtocolConfig } from "./config.js";
import { CommandCoordinator } from "./commands/coordinator.js";
import { LocalHttpServer, type HttpServer } from "./http.js";
import { createLogger, type Logger } from "./logger.js";
import type { MessagingSession } from "./messaging.js";
import { NatsSupervisor } from "./nats.js";
import { discoverPlugins, type PluginRegistry } from "./plugins/index.js";
import {
  createDefaultProtocolSelectionProvider,
  type ProtocolSelectionProvider,
} from "./provider.js";
import { ProtocolRuntime } from "./protocol/runtime.js";
import { createInitialSnapshot, type AppSnapshot, type StartupPhase } from "./state.js";

export interface AppOptions {
  config?: ProtocolConfig;
  logger?: Logger;
  provider?: ProtocolSelectionProvider;
  registry?: PluginRegistry;
  httpServer?: HttpServer;
}

export class App {
  private readonly config: ProtocolConfig;
  private readonly logger: Logger;
  private readonly provider: ProtocolSelectionProvider;
  private readonly registry: PluginRegistry;
  private readonly httpServer?: HttpServer;
  private readonly snapshot: AppSnapshot = createInitialSnapshot();
  private readonly nats: NatsSupervisor;
  private readonly commands: CommandCoordinator;
  private readonly protocolRuntime: ProtocolRuntime;

  constructor(options: AppOptions = {}) {
    this.config = options.config ?? loadConfig();
    this.logger = options.logger ?? createLogger();
    this.provider = options.provider ?? createDefaultProtocolSelectionProvider();
    this.registry = options.registry ?? discoverPlugins();
    this.httpServer = options.httpServer;
    this.commands = new CommandCoordinator(this.logger, this.config.commandTimeoutMs, (streamId) => {
      this.snapshot.streamId = streamId;
    });
    this.protocolRuntime = new ProtocolRuntime(this.logger, (streamId) => {
      this.snapshot.streamId = streamId;
    });
    this.nats = new NatsSupervisor(this.config.natsUrl, this.logger, async (session, signal) =>
      this.runNatsSession(session, signal)
    );
  }

  getSnapshot(): AppSnapshot {
    return {
      ...this.snapshot,
      metrics: {
        ...this.snapshot.metrics,
        commandResultsTotal: { ...this.snapshot.metrics.commandResultsTotal }
      }
    };
  }

  async run(signal: AbortSignal): Promise<void> {
    this.transition("loading_plugins");
    this.logger.info("plugin.registry.loaded", "Loaded local protocol plugin registry.", {
      plugin_ids: this.registry.all().map((plugin) => plugin.id)
    });

    this.transition("starting_http");
    const httpServer =
      this.httpServer ?? new LocalHttpServer(this.config.httpBind, () => this.getSnapshot());
    await httpServer.start(signal);
    this.logger.info("http.listen.started", "Started splash-protocol HTTP listener.", {
      bind: this.config.httpBind
    });

    this.transition("starting_nats");
    void this.nats.run(signal);

    await this.refreshSelection(signal);
    this.recomputeStatus();

    while (!signal.aborted) {
      await sleep(signal, 5000);
      await this.refreshSelection(signal);
      this.recomputeStatus();
    }

    this.snapshot.shutdownReason = "signal";
    this.transition("shutting_down");
    this.logger.info("service.shutdown", "Shutting down splash-protocol.", {
      shutdown_reason: this.snapshot.shutdownReason
    });
  }

  private async refreshSelection(signal: AbortSignal): Promise<void> {
    const result = await this.provider.getSelection(signal);

    if (result.kind === "unavailable") {
      this.snapshot.poolId = null;
      this.snapshot.activePlugin = null;
      this.commands.clearActiveSelection();
      this.protocolRuntime.clearActivePlugin();
      this.snapshot.configuration = "error";
      this.snapshot.configErrorCode = result.errorCode;
      this.snapshot.decode = "error";
      this.snapshot.commands = "error";
      this.snapshot.decodeErrorCode = "decode_blocked_no_active_plugin";
      this.snapshot.commandErrorCode = "command_blocked_no_active_plugin";
      this.transition("config_degraded");
      return;
    }

    if (result.kind === "invalid") {
      throw new Error(result.detail);
    }

    const plugin = this.registry.get(result.selection.protocolPlugin);
    if (!plugin) {
      throw new Error(`Selected plugin '${result.selection.protocolPlugin}' is not locally available`);
    }

    this.commands.setActiveSelection(result.selection, plugin);
    this.protocolRuntime.setActiveSelection(result.selection.poolId, plugin);
    this.snapshot.poolId = result.selection.poolId;
    this.snapshot.activePlugin = result.selection.protocolPlugin;
    this.snapshot.configuration = "valid";
    this.snapshot.configErrorCode = null;
    this.snapshot.decode = "ok";
    this.snapshot.commands = "ok";
    this.snapshot.decodeErrorCode = null;
    this.snapshot.commandErrorCode = null;
    this.logger.info("plugin.selected", "Resolved active protocol plugin.", {
      pool_id: result.selection.poolId,
      active_plugin: result.selection.protocolPlugin
    });
  }

  private recomputeStatus(): void {
    const natsState = this.nats.snapshot();
    this.snapshot.nats = natsState.status;

    if (this.snapshot.configuration === "valid" && natsState.status === "ok") {
      this.snapshot.status = "ok";
      this.transition("running_ok");
      return;
    }

    this.snapshot.status = "degraded";
    if (this.snapshot.configuration === "valid") {
      this.transition("running_degraded");
    }
  }

  private transition(phase: StartupPhase): void {
    this.snapshot.startupPhase = phase;
    this.snapshot.lastTransitionAt = new Date().toISOString();
  }

  private async runNatsSession(session: MessagingSession, signal: AbortSignal): Promise<void> {
    const handlerRegistry = new Map<string, Array<(payload: Record<string, unknown>) => Promise<void> | void>>();
    const instrumentedSession: MessagingSession = {
      publish: async (subject, payload) => {
        this.snapshot.metrics.natsMessagesPublishedTotal += 1;
        if (subject === "protocol.frame.raw") {
          this.snapshot.metrics.framesAssembledTotal += 1;
        }
        if (subject === "protocol.frame.decoded") {
          this.snapshot.metrics.protocolFramesDecodedTotal += 1;
        }
        if (subject === "protocol.frame.unidentified") {
          this.snapshot.metrics.protocolFramesUnidentifiedTotal += 1;
          if (payload.reason === "stream_reset") {
            this.snapshot.metrics.streamResetsTotal += 1;
          } else {
            this.snapshot.metrics.frameValidationFailuresTotal += 1;
          }
        }
        if (subject.startsWith("equipment.state.")) {
          this.snapshot.metrics.normalizedEventsTotal += 1;
        }
        if (subject.startsWith("command.result.")) {
          const status = typeof payload.status === "string" ? payload.status : null;
          if (status && status in this.snapshot.metrics.commandResultsTotal) {
            this.snapshot.metrics.commandResultsTotal[status as keyof typeof this.snapshot.metrics.commandResultsTotal] += 1;
            if (status === "accepted") {
              this.snapshot.metrics.commandsAcceptedTotal += 1;
            }
            if (status === "timed_out") {
              this.snapshot.metrics.correlationTimeoutsTotal += 1;
            }
          }
        }
        await session.publish(subject, payload);
      },
      subscribe: (subject, handler) => {
        const handlers = handlerRegistry.get(subject);
        if (handlers) {
          handlers.push(handler);
          return;
        }
        handlerRegistry.set(subject, [handler]);
        session.subscribe(subject, async (payload) => {
          this.snapshot.metrics.natsMessagesReceivedTotal += 1;
          if (subject === "serial.rx.raw") {
            this.snapshot.metrics.serialRxMessagesTotal += 1;
          }
          if (subject === "serial.tx.raw") {
            this.snapshot.metrics.serialTxMessagesTotal += 1;
          }
          for (const registeredHandler of handlerRegistry.get(subject) ?? []) {
            await registeredHandler(payload);
          }
        });
      }
    };
    this.commands.attach(instrumentedSession);
    this.protocolRuntime.attach(instrumentedSession);
    await waitForAbort(signal);
  }
}

async function sleep(signal: AbortSignal, ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true }
    );
  });
}

async function waitForAbort(signal: AbortSignal): Promise<void> {
  await new Promise<void>((resolve) => {
    signal.addEventListener(
      "abort",
      () => {
        resolve();
      },
      { once: true }
    );
  });
}
