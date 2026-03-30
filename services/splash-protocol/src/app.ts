import { loadConfig, type ProtocolConfig } from "./config.js";
import { CommandCoordinator } from "./commands/coordinator.js";
import { LocalHttpServer, type HttpServer } from "./http.js";
import { createLogger, type Logger } from "./logger.js";
import type { MessagingSession } from "./messaging.js";
import { NatsSupervisor } from "./nats.js";
import { discoverPlugins, type PluginRegistry } from "./plugins/index.js";
import {
  type ProtocolSelectionProvider,
  UnavailableProtocolSelectionProvider
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
    this.provider = options.provider ?? new UnavailableProtocolSelectionProvider();
    this.registry = options.registry ?? discoverPlugins();
    this.httpServer = options.httpServer;
    this.commands = new CommandCoordinator(this.logger, this.config.commandTimeoutMs, (streamId) => {
      this.snapshot.streamId = streamId;
    });
    this.protocolRuntime = new ProtocolRuntime(this.logger);
    this.nats = new NatsSupervisor(this.config.natsUrl, this.logger, async (session, signal) =>
      this.runNatsSession(session, signal)
    );
  }

  getSnapshot(): AppSnapshot {
    return { ...this.snapshot };
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
    this.protocolRuntime.setActivePlugin(plugin);
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
    this.commands.attach(session);
    this.protocolRuntime.attach(session);
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
