import { randomUUID } from "node:crypto";
import { EquipmentBridge } from "./bridge.js";
import { loadConfig, type ApiConfig } from "./config.js";
import { EventBroker } from "./events.js";
import { LocalHttpServer, type HttpServer } from "./http.js";
import { createLogger, type Logger } from "./logger.js";
import type { MessagingSession } from "./messaging.js";
import { NatsSupervisor } from "./nats.js";
import {
  ProtocolAnnotationStore,
  type ProtocolAnnotation,
  type ProtocolAnnotationInput
} from "./protocol-annotations.js";
import {
  ProtocolPromptStore,
  type ProtocolPrompt,
  type ProtocolPromptInput
} from "./protocol-prompts.js";
import {
  type ProtocolBundleComparison,
  ProtocolFrameBundleStore,
  type ProtocolFrameBundle,
  type ProtocolFrameBundleSummary
} from "./protocol-bundles.js";
import { LatestStateProjection } from "./state.js";

export interface AppOptions {
  config?: ApiConfig;
  logger?: Logger;
  httpServer?: HttpServer;
}

export class App {
  private readonly config: ApiConfig;
  private readonly logger: Logger;
  private readonly bridge = new EquipmentBridge();
  private readonly projection = new LatestStateProjection();
  private readonly events = new EventBroker();
  private readonly protocolFrames = new EventBroker();
  private readonly protocolFrameBundles = new ProtocolFrameBundleStore();
  private readonly protocolAnnotations = new ProtocolAnnotationStore();
  private readonly protocolPrompts = new ProtocolPromptStore();
  private readonly nats: NatsSupervisor;
  private readonly httpServer?: HttpServer;

  constructor(options: AppOptions = {}) {
    this.config = options.config ?? loadConfig();
    this.logger = options.logger ?? createLogger();
    this.httpServer = options.httpServer;
    this.nats = new NatsSupervisor(this.config.natsUrl, this.logger, async (session, signal) =>
      this.runNatsSession(session, signal)
    );
  }

  getEquipment(): Array<Record<string, unknown>> {
    return this.projection.getEquipmentView(this.bridge.all());
  }

  getHealth(): Record<string, unknown> {
    const natsState = this.nats.snapshot();
    return {
      status: natsState.status === "ok" ? "ok" : "degraded",
      data: {
        dependencies: {
          nats: natsState.status
        }
      },
      error: null
    };
  }

  listProtocolFrameBundles(): ProtocolFrameBundleSummary[] {
    return this.protocolFrameBundles.listBundles();
  }

  createProtocolFrameBundle(input: { label: string | null }): ProtocolFrameBundleSummary {
    return this.protocolFrameBundles.createBundle(input.label);
  }

  getProtocolFrameBundle(id: string): ProtocolFrameBundle | null {
    return this.protocolFrameBundles.getBundle(id);
  }

  compareProtocolFrameBundles(input: {
    baselineBundleId: string;
    comparisonBundleId: string;
  }): ProtocolBundleComparison | null {
    return this.protocolFrameBundles.compareBundles(input.baselineBundleId, input.comparisonBundleId);
  }

  listProtocolAnnotations(bundleId: string | null = null): ProtocolAnnotation[] {
    return this.protocolAnnotations.list(bundleId);
  }

  createProtocolAnnotation(input: ProtocolAnnotationInput): ProtocolAnnotation {
    return this.protocolAnnotations.create(input);
  }

  listProtocolPrompts(bundleId: string | null = null): ProtocolPrompt[] {
    return this.protocolPrompts.list(bundleId);
  }

  createProtocolPrompt(input: ProtocolPromptInput): ProtocolPrompt {
    return this.protocolPrompts.create(input);
  }

  async publishPumpSpeedCommand(input: { equipmentId: string; rpm: number }, session: MessagingSession): Promise<{ commandId: string }> {
    const equipment = this.bridge.get(input.equipmentId);
    if (!equipment || equipment.equipmentType !== "pump" || !equipment.busAddress) {
      throw new Error("Unsupported equipment target.");
    }

    const commandId = randomUUID();
    await session.publish("protocol.command.intent", {
      pool_id: this.config.poolId,
      command_id: commandId,
      requested_at: new Date().toISOString(),
      protocol_name: equipment.protocolName,
      target: {
        equipment_id: equipment.id,
        equipment_type: equipment.equipmentType,
        bus_address: equipment.busAddress
      },
      command_type: "set_speed",
      arguments: {
        rpm: input.rpm
      },
      requested_by: "api_control",
      dry_run: false
    });
    return { commandId };
  }

  async run(signal: AbortSignal): Promise<void> {
    const httpServer =
      this.httpServer ??
      new LocalHttpServer(this.config.httpBind, {
        getEquipment: () => this.getEquipment(),
        getHealth: () => this.getHealth(),
        getEventBroker: () => this.events,
        getProtocolFrameBroker: () => this.protocolFrames,
        listProtocolFrameBundles: () => this.listProtocolFrameBundles(),
        createProtocolFrameBundle: ({ label }) => this.createProtocolFrameBundle({ label }),
        getProtocolFrameBundle: (id) => this.getProtocolFrameBundle(id),
        compareProtocolFrameBundles: ({ baselineBundleId, comparisonBundleId }) =>
          this.compareProtocolFrameBundles({ baselineBundleId, comparisonBundleId }),
        listProtocolAnnotations: (bundleId) => this.listProtocolAnnotations(bundleId),
        createProtocolAnnotation: (input) => this.createProtocolAnnotation(input),
        listProtocolPrompts: (bundleId) => this.listProtocolPrompts(bundleId),
        createProtocolPrompt: (input) => this.createProtocolPrompt(input),
        publishPumpSpeedCommand: async ({ equipmentId, rpm }) => {
          const session = this.currentSession;
          if (!session) {
            throw new Error("NATS session unavailable.");
          }
          return this.publishPumpSpeedCommand({ equipmentId, rpm }, session);
        }
      });

    await httpServer.start(signal);
    void this.nats.run(signal);
    await waitForAbort(signal);
  }

  private currentSession: MessagingSession | null = null;

  private async runNatsSession(session: MessagingSession, signal: AbortSignal): Promise<void> {
    this.currentSession = session;
    session.subscribe("equipment.state.controller", async (payload) => {
      this.projection.updateController(payload);
      this.events.publish("equipment.state", payload);
    });
    session.subscribe("equipment.state.pump", async (payload) => {
      this.projection.updatePump(payload);
      this.events.publish("pump.state", payload);
    });
    session.subscribe("equipment.state.chlorinator", async (payload) => {
      this.projection.updateChlorinator(payload);
      this.events.publish("equipment.state", payload);
    });
    session.subscribe("command.result.*", async (payload) => {
      const commandId = typeof payload.command_id === "string" ? payload.command_id : null;
      if (commandId) {
        this.projection.updateCommandResult(commandId, payload);
      }
      this.events.publish("command.result", payload);
    });
    session.subscribe("protocol.frame.raw", async (payload) => {
      this.protocolFrameBundles.recordFrame("protocol.frame.raw", payload);
      this.protocolFrames.publish("protocol.frame.raw", payload);
    });
    session.subscribe("protocol.frame.decoded", async (payload) => {
      this.protocolFrameBundles.recordFrame("protocol.frame.decoded", payload);
      this.protocolFrames.publish("protocol.frame.decoded", payload);
    });

    await waitForAbort(signal);
    this.currentSession = null;
  }
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
