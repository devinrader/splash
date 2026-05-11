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
  type ProtocolFrameBundleSummary,
  type ProtocolWatchSession,
  type ProtocolWatchSessionSummary
} from "./protocol-bundles.js";
import { LatestStateProjection } from "./state.js";
import { NatsVarzMonitor, PlatformServiceHealthMonitor, RollingMessageRate } from "./rates.js";

export interface AppOptions {
  config?: ApiConfig;
  logger?: Logger;
  httpServer?: HttpServer;
  fetchImpl?: typeof fetch;
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
  private readonly serialRxRate = new RollingMessageRate();
  private readonly serialTxRate = new RollingMessageRate();
  private readonly natsVarzMonitor: NatsVarzMonitor;
  private readonly serialHealthMonitor: PlatformServiceHealthMonitor;
  private readonly protocolHealthMonitor: PlatformServiceHealthMonitor;
  private readonly nats: NatsSupervisor;
  private readonly httpServer?: HttpServer;

  constructor(options: AppOptions = {}) {
    this.config = options.config ?? loadConfig();
    this.logger = options.logger ?? createLogger();
    this.httpServer = options.httpServer;
    this.natsVarzMonitor = new NatsVarzMonitor({
      monitoringUrl: this.config.natsMonitoringUrl,
      fetchImpl: options.fetchImpl
    });
    this.serialHealthMonitor = new PlatformServiceHealthMonitor({
      healthUrl: this.config.serialHealthUrl ?? null,
      fetchImpl: options.fetchImpl,
      parser: parseSerialHealthSnapshot
    });
    this.protocolHealthMonitor = new PlatformServiceHealthMonitor({
      healthUrl: this.config.protocolHealthUrl ?? null,
      fetchImpl: options.fetchImpl,
      parser: parseProtocolHealthSnapshot
    });
    this.nats = new NatsSupervisor(this.config.natsUrl, this.logger, async (session, signal) =>
      this.runNatsSession(session, signal)
    );
  }

  getEquipment(): Array<Record<string, unknown>> {
    return this.projection.getEquipmentView(this.bridge.all());
  }

  getHealth(): Record<string, unknown> {
    const natsState = this.nats.snapshot();
    const brokerRates = this.natsVarzMonitor.getSnapshot();
    const serialHealth = this.serialHealthMonitor.getSnapshot();
    const protocolHealth = this.protocolHealthMonitor.getSnapshot();
    return {
      status: natsState.status === "ok" ? "ok" : "degraded",
      data: {
        dependencies: {
          nats: natsState.status
        },
        rates: {
          rs485: {
            status: serialHealth.status,
            rx_messages_per_second: this.serialRxRate.getMessagesPerSecond(),
            tx_messages_per_second: this.serialTxRate.getMessagesPerSecond(),
            updated_at: serialHealth.updatedAt
          },
          nats_broker: {
            status: brokerRates.status,
            subscriptions: brokerRates.subscriptions,
            in_messages_per_second: brokerRates.inMessagesPerSecond,
            out_messages_per_second: brokerRates.outMessagesPerSecond,
            last_sample_at: brokerRates.lastSampleAt,
            error_code: brokerRates.errorCode
          }
        },
        platform_services: {
          splash_serial: {
            status: serialHealth.status,
            summary: serialHealth.summary,
            detail: serialHealth.detail,
            updated_at: serialHealth.updatedAt
          },
          nats: {
            status: natsState.status === "ok" ? "ok" : "error",
            summary: natsState.status === "ok" ? "Connected" : "Disconnected",
            detail: null,
            updated_at: null
          },
          splash_protocol: {
            status: protocolHealth.status,
            summary: protocolHealth.summary,
            detail: protocolHealth.detail,
            updated_at: protocolHealth.updatedAt
          },
          splash_frontend: {
            status: "ok",
            summary: "Browser session active",
            detail: "Frontend shell is serving the current operator session.",
            updated_at: new Date().toISOString()
          }
        }
      },
      error: null
    };
  }

  getMetrics(): string {
    const natsState = this.nats.snapshot();
    const brokerRates = this.natsVarzMonitor.getSnapshot();
    const serialHealth = this.serialHealthMonitor.getSnapshot();
    const protocolHealth = this.protocolHealthMonitor.getSnapshot();
    const rs485RxRate = this.serialRxRate.getMessagesPerSecond();
    const rs485TxRate = this.serialTxRate.getMessagesPerSecond();
    const now = Date.now() / 1000;

    const metricLines = [
      "# HELP splash_api_service_status API service status gauge.",
      "# TYPE splash_api_service_status gauge",
      renderStatusSeries("splash_api_service_status", ["ok", "degraded", "error"], natsState.status === "ok" ? "ok" : "degraded").trimEnd(),
      "# HELP splash_api_rs485_status RS485 connectivity status derived from splash-serial health.",
      "# TYPE splash_api_rs485_status gauge",
      renderStatusSeries("splash_api_rs485_status", ["ok", "degraded", "error", "unavailable"], serialHealth.status).trimEnd(),
      "# HELP splash_api_nats_broker_status NATS broker monitoring status derived from /varz polling.",
      "# TYPE splash_api_nats_broker_status gauge",
      renderStatusSeries("splash_api_nats_broker_status", ["ok", "unavailable", "error"], brokerRates.status).trimEnd(),
      "# HELP splash_api_platform_service_status Aggregated platform service status gauge.",
      "# TYPE splash_api_platform_service_status gauge",
      renderStatusSeries("splash_api_platform_service_status", ["ok", "degraded", "error", "unavailable"], serialHealth.status, {
        service: "splash_serial"
      }).trimEnd(),
      renderStatusSeries("splash_api_platform_service_status", ["ok", "degraded", "error", "unavailable"], natsState.status === "ok" ? "ok" : "error", {
        service: "nats"
      }).trimEnd(),
      renderStatusSeries("splash_api_platform_service_status", ["ok", "degraded", "error", "unavailable"], protocolHealth.status, {
        service: "splash_protocol"
      }).trimEnd(),
      "# HELP splash_api_rs485_rx_messages_per_second Rolling 10-second average RS485 receive messages per second observed by splash-api.",
      "# TYPE splash_api_rs485_rx_messages_per_second gauge",
      `splash_api_rs485_rx_messages_per_second ${formatNumber(rs485RxRate)}`,
      "# HELP splash_api_rs485_tx_messages_per_second Rolling 10-second average RS485 transmit messages per second observed by splash-api.",
      "# TYPE splash_api_rs485_tx_messages_per_second gauge",
      `splash_api_rs485_tx_messages_per_second ${formatNumber(rs485TxRate)}`,
      "# HELP splash_api_nats_dependency_up Whether the splash-api NATS client dependency is currently connected.",
      "# TYPE splash_api_nats_dependency_up gauge",
      `splash_api_nats_dependency_up ${natsState.status === "ok" ? 1 : 0}`,
      "# HELP splash_api_nats_broker_subscriptions Observed NATS broker subscription count when monitoring is available.",
      "# TYPE splash_api_nats_broker_subscriptions gauge",
      `splash_api_nats_broker_subscriptions ${formatNullableMetric(brokerRates.subscriptions)}`,
      "# HELP splash_api_nats_broker_in_messages_per_second Observed NATS broker inbound messages per second when monitoring is available.",
      "# TYPE splash_api_nats_broker_in_messages_per_second gauge",
      `splash_api_nats_broker_in_messages_per_second ${formatNullableMetric(brokerRates.inMessagesPerSecond)}`,
      "# HELP splash_api_nats_broker_out_messages_per_second Observed NATS broker outbound messages per second when monitoring is available.",
      "# TYPE splash_api_nats_broker_out_messages_per_second gauge",
      `splash_api_nats_broker_out_messages_per_second ${formatNullableMetric(brokerRates.outMessagesPerSecond)}`,
      "# HELP splash_api_platform_service_last_updated_seconds Unix timestamp of the last successful platform service health poll.",
      "# TYPE splash_api_platform_service_last_updated_seconds gauge",
      `splash_api_platform_service_last_updated_seconds{service="splash_serial"} ${formatNullableTimestamp(serialHealth.updatedAt)}`,
      `splash_api_platform_service_last_updated_seconds{service="splash_protocol"} ${formatNullableTimestamp(protocolHealth.updatedAt)}`,
      `splash_api_platform_service_last_updated_seconds{service="splash_api"} ${formatNumber(now)}`
    ];

    return `${metricLines.join("\n")}\n`;
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

  startProtocolWatchSession(input: { label: string | null; events: string[] | null }): ProtocolWatchSessionSummary {
    return this.protocolFrameBundles.startWatchSession(input.label, input.events);
  }

  getProtocolWatchSession(id: string): ProtocolWatchSession | null {
    return this.protocolFrameBundles.getWatchSession(id);
  }

  stopProtocolWatchSession(id: string): ProtocolWatchSessionSummary | null {
    return this.protocolFrameBundles.stopWatchSession(id);
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

  async publishRawFrameCommand(input: { protocolName: string; bytesHex: string }, session: MessagingSession): Promise<{ commandId: string }> {
    const commandId = randomUUID();
    await session.publish("protocol.command.intent", {
      pool_id: this.config.poolId,
      command_id: commandId,
      requested_at: new Date().toISOString(),
      protocol_name: input.protocolName,
      target: {},
      command_type: "send_raw_frame",
      arguments: {
        bytes_hex: input.bytesHex
      },
      requested_by: "protocol_explorer",
      dry_run: false
    });
    return { commandId };
  }

  async publishPumpSpeedCommand(
    input: { equipmentId: string; rpm: number; circuitKey?: string | null },
    session: MessagingSession
  ): Promise<{ commandId: string }> {
    const equipment = this.bridge.get(input.equipmentId);
    if (!equipment || equipment.equipmentType !== "pump") {
      throw new Error("Unsupported equipment target.");
    }

    const circuitKey = input.circuitKey ?? equipment.defaultControlCircuitKey ?? null;
    if (!circuitKey) {
      throw new Error("No controller circuit is configured for pump speed changes.");
    }

    if (equipment.controlCircuitKeys && !equipment.controlCircuitKeys.includes(circuitKey)) {
      throw new Error(`Unsupported controller circuit '${circuitKey}'.`);
    }

    const commandId = randomUUID();
    await session.publish("protocol.command.intent", {
      pool_id: this.config.poolId,
      command_id: commandId,
      requested_at: new Date().toISOString(),
      protocol_name: equipment.protocolName,
      target: {
        equipment_id: equipment.id,
        equipment_type: "circuit",
        circuit_key: circuitKey
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

  async publishCircuitStateCommand(
    input: { equipmentId: string; circuitKey: string; enabled: boolean },
    session: MessagingSession
  ): Promise<{ commandId: string }> {
    const equipment = this.bridge.get(input.equipmentId);
    if (!equipment || equipment.equipmentType !== "controller") {
      throw new Error("Unsupported controller target.");
    }

    const circuitId = this.bridge.getControllerCircuitId(input.circuitKey);
    if (circuitId === null) {
      throw new Error(`Unsupported controller circuit '${input.circuitKey}'.`);
    }

    const commandId = randomUUID();
    await session.publish("protocol.command.intent", {
      pool_id: this.config.poolId,
      command_id: commandId,
      requested_at: new Date().toISOString(),
      protocol_name: equipment.protocolName,
      target: {
        equipment_id: equipment.id,
        equipment_type: "circuit",
        circuit_key: input.circuitKey
      },
      command_type: "set_circuit_state",
      arguments: {
        circuit_id: circuitId,
        enabled: input.enabled
      },
      requested_by: "dashboard",
      dry_run: false
    });
    return { commandId };
  }

  async publishRemoteLayoutRequest(input: { pageIndex: number }, session: MessagingSession): Promise<{ commandId: string }> {
    const commandId = randomUUID();
    await session.publish("protocol.command.intent", {
      pool_id: this.config.poolId,
      command_id: commandId,
      requested_at: new Date().toISOString(),
      protocol_name: "pentair_easytouch",
      target: {
        equipment_type: "controller",
        bus_address: "0x10"
      },
      command_type: "request_remote_layout_page",
      arguments: {
        page_index: input.pageIndex
      },
      requested_by: "protocol_explorer",
      dry_run: false
    });
    return { commandId };
  }

  async publishPumpInfoRequest(input: { pumpSlot: number }, session: MessagingSession): Promise<{ commandId: string }> {
    const commandId = randomUUID();
    await session.publish("protocol.command.intent", {
      pool_id: this.config.poolId,
      command_id: commandId,
      requested_at: new Date().toISOString(),
      protocol_name: "pentair_easytouch",
      target: {
        equipment_type: "controller",
        bus_address: "0x10"
      },
      command_type: "request_pump_info",
      arguments: {
        pump_slot: input.pumpSlot
      },
      requested_by: "protocol_explorer",
      dry_run: false
    });
    return { commandId };
  }

  async publishCircuitConfigRequest(
    input: { startIndex: number; endIndex: number },
    session: MessagingSession
  ): Promise<{ commandId: string }> {
    const commandId = randomUUID();
    await session.publish("protocol.command.intent", {
      pool_id: this.config.poolId,
      command_id: commandId,
      requested_at: new Date().toISOString(),
      protocol_name: "pentair_easytouch",
      target: {
        equipment_type: "controller",
        bus_address: "0x10"
      },
      command_type: "request_circuit_config",
      arguments: {
        start_index: input.startIndex,
        end_index: input.endIndex
      },
      requested_by: "protocol_explorer",
      dry_run: false
    });
    return { commandId };
  }

  async publishCustomNameRequest(input: { nameIndex: number }, session: MessagingSession): Promise<{ commandId: string }> {
    const commandId = randomUUID();
    await session.publish("protocol.command.intent", {
      pool_id: this.config.poolId,
      command_id: commandId,
      requested_at: new Date().toISOString(),
      protocol_name: "pentair_easytouch",
      target: {
        equipment_type: "controller",
        bus_address: "0x10"
      },
      command_type: "request_custom_name",
      arguments: {
        name_index: input.nameIndex
      },
      requested_by: "protocol_explorer",
      dry_run: false
    });
    return { commandId };
  }

  async publishControllerSoftwareVersionRequest(session: MessagingSession): Promise<{ commandId: string }> {
    const commandId = randomUUID();
    await session.publish("protocol.command.intent", {
      pool_id: this.config.poolId,
      command_id: commandId,
      requested_at: new Date().toISOString(),
      protocol_name: "pentair_easytouch",
      target: {
        equipment_type: "controller",
        bus_address: "0x10"
      },
      command_type: "request_controller_software_version",
      arguments: {},
      requested_by: "protocol_explorer",
      dry_run: false
    });
    return { commandId };
  }

  async publishControllerDatetimeRequest(session: MessagingSession): Promise<{ commandId: string }> {
    const commandId = randomUUID();
    await session.publish("protocol.command.intent", {
      pool_id: this.config.poolId,
      command_id: commandId,
      requested_at: new Date().toISOString(),
      protocol_name: "pentair_easytouch",
      target: {
        equipment_type: "controller",
        bus_address: "0x10"
      },
      command_type: "request_controller_datetime",
      arguments: {},
      requested_by: "dashboard",
      dry_run: false
    });
    return { commandId };
  }

  async publishControllerDatetimeSync(session: MessagingSession): Promise<{ commandId: string }> {
    const now = new Date();
    const commandId = randomUUID();
    await session.publish("protocol.command.intent", {
      pool_id: this.config.poolId,
      command_id: commandId,
      requested_at: now.toISOString(),
      protocol_name: "pentair_easytouch",
      target: {
        equipment_type: "controller",
        bus_address: "0x10"
      },
      command_type: "sync_controller_datetime",
      arguments: {
        month: now.getMonth() + 1,
        day: now.getDate(),
        year: now.getFullYear() % 100,
        day_of_week: now.getDay(),
        hour_24: now.getHours(),
        minute: now.getMinutes()
      },
      requested_by: "dashboard",
      dry_run: false
    });
    return { commandId };
  }

  async publishPumpConfigWrite(
    input: {
      pumpId: number;
      pumpType: number;
      primingTime: number;
      unknown3: number;
      unknown4: number;
      slots: Array<{ circuit_assignment: number; rpm: number }>;
      primingSpeed: number;
      trailingBytes: number[];
    },
    session: MessagingSession
  ): Promise<{ commandId: string }> {
    const commandId = randomUUID();
    await session.publish("protocol.command.intent", {
      pool_id: this.config.poolId,
      command_id: commandId,
      requested_at: new Date().toISOString(),
      protocol_name: "pentair_easytouch",
      target: {
        equipment_type: "controller",
        bus_address: "0x10"
      },
      command_type: "write_pump_config",
      arguments: {
        pump_id: input.pumpId,
        pump_type: input.pumpType,
        priming_time: input.primingTime,
        unknown_3: input.unknown3,
        unknown_4: input.unknown4,
        slots: input.slots,
        priming_speed: input.primingSpeed,
        trailing_bytes: input.trailingBytes
      },
      requested_by: "protocol_explorer",
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
        getMetrics: () => this.getMetrics(),
        getEventBroker: () => this.events,
        getProtocolFrameBroker: () => this.protocolFrames,
        listProtocolFrameBundles: () => this.listProtocolFrameBundles(),
        createProtocolFrameBundle: ({ label }) => this.createProtocolFrameBundle({ label }),
        getProtocolFrameBundle: (id) => this.getProtocolFrameBundle(id),
        startProtocolWatchSession: ({ label, events }) => this.startProtocolWatchSession({ label, events }),
        getProtocolWatchSession: (id) => this.getProtocolWatchSession(id),
        stopProtocolWatchSession: (id) => this.stopProtocolWatchSession(id),
        compareProtocolFrameBundles: ({ baselineBundleId, comparisonBundleId }) =>
          this.compareProtocolFrameBundles({ baselineBundleId, comparisonBundleId }),
        listProtocolAnnotations: (bundleId) => this.listProtocolAnnotations(bundleId),
        createProtocolAnnotation: (input) => this.createProtocolAnnotation(input),
        listProtocolPrompts: (bundleId) => this.listProtocolPrompts(bundleId),
        createProtocolPrompt: (input) => this.createProtocolPrompt(input),
        publishRemoteLayoutRequest: async ({ pageIndex }) => {
          const session = this.currentSession;
          if (!session) {
            throw new Error("NATS session unavailable.");
          }
          return this.publishRemoteLayoutRequest({ pageIndex }, session);
        },
        publishPumpInfoRequest: async ({ pumpSlot }) => {
          const session = this.currentSession;
          if (!session) {
            throw new Error("NATS session unavailable.");
          }
          return this.publishPumpInfoRequest({ pumpSlot }, session);
        },
        publishCircuitConfigRequest: async ({ startIndex, endIndex }) => {
          const session = this.currentSession;
          if (!session) {
            throw new Error("NATS session unavailable.");
          }
          return this.publishCircuitConfigRequest({ startIndex, endIndex }, session);
        },
        publishCustomNameRequest: async ({ nameIndex }) => {
          const session = this.currentSession;
          if (!session) {
            throw new Error("NATS session unavailable.");
          }
          return this.publishCustomNameRequest({ nameIndex }, session);
        },
        publishControllerSoftwareVersionRequest: async () => {
          const session = this.currentSession;
          if (!session) {
            throw new Error("NATS session unavailable.");
          }
          return this.publishControllerSoftwareVersionRequest(session);
        },
        publishControllerDatetimeRequest: async () => {
          const session = this.currentSession;
          if (!session) {
            throw new Error("NATS session unavailable.");
          }
          return this.publishControllerDatetimeRequest(session);
        },
        publishControllerDatetimeSync: async () => {
          const session = this.currentSession;
          if (!session) {
            throw new Error("NATS session unavailable.");
          }
          return this.publishControllerDatetimeSync(session);
        },
        publishPumpConfigWrite: async (input) => {
          const session = this.currentSession;
          if (!session) {
            throw new Error("NATS session unavailable.");
          }
          return this.publishPumpConfigWrite(input, session);
        },
        publishRawFrameCommand: async ({ protocolName, bytesHex }) => {
          const session = this.currentSession;
          if (!session) {
            throw new Error("NATS session unavailable.");
          }
          return this.publishRawFrameCommand({ protocolName, bytesHex }, session);
        },
        publishPumpSpeedCommand: async ({ equipmentId, rpm, circuitKey }) => {
          const session = this.currentSession;
          if (!session) {
            throw new Error("NATS session unavailable.");
          }
          return this.publishPumpSpeedCommand({ equipmentId, rpm, circuitKey }, session);
        },
        publishCircuitStateCommand: async ({ equipmentId, circuitKey, enabled }) => {
          const session = this.currentSession;
          if (!session) {
            throw new Error("NATS session unavailable.");
          }
          return this.publishCircuitStateCommand({ equipmentId, circuitKey, enabled }, session);
        }
      });

    await httpServer.start(signal);
    void this.natsVarzMonitor.start(signal);
    void this.serialHealthMonitor.start(signal);
    void this.protocolHealthMonitor.start(signal);
    void this.nats.run(signal);
    await waitForAbort(signal);
  }

  private currentSession: MessagingSession | null = null;
  private hasRequestedStartupCustomNames = false;

  private async runNatsSession(session: MessagingSession, signal: AbortSignal): Promise<void> {
    this.currentSession = session;
    session.subscribe("equipment.state.controller", async (payload) => {
      this.projection.updateController(payload);
      this.events.publish("equipment.state", payload);
      if (!this.hasRequestedStartupCustomNames && this.shouldRequestStartupCustomNames()) {
        this.hasRequestedStartupCustomNames = true;
        await this.requestAllCustomNames(session);
      }
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
    session.subscribe("protocol.frame.buffered", async (payload) => {
      this.protocolFrameBundles.recordFrame("protocol.frame.buffered", payload);
      this.protocolFrames.publish("protocol.frame.buffered", payload);
    });
    session.subscribe("protocol.frame.unidentified", async (payload) => {
      this.protocolFrameBundles.recordFrame("protocol.frame.unidentified", payload);
      this.protocolFrames.publish("protocol.frame.unidentified", payload);
    });
    session.subscribe("protocol.frame.decoded", async (payload) => {
      this.protocolFrameBundles.recordFrame("protocol.frame.decoded", payload);
      this.protocolFrames.publish("protocol.frame.decoded", payload);
      if (payload.message_type === "circuit_configuration") {
        const fields = payload.fields;
        if (fields && typeof fields === "object" && !Array.isArray(fields)) {
          const circuitConfigurations = this.projection.updateControllerCircuitConfiguration({
            ...(fields as Record<string, unknown>),
            occurred_at: typeof payload.decoded_at === "string" ? payload.decoded_at : null
          });
          this.events.publish("equipment.state", {
            circuit_configurations: circuitConfigurations
          });
        }
      }
      if (payload.message_type === "controller_datetime") {
        const fields = payload.fields;
        if (fields && typeof fields === "object" && !Array.isArray(fields)) {
          const controllerDatetimeReply = this.projection.updateControllerDatetimeReply({
            ...(fields as Record<string, unknown>),
            occurred_at: typeof payload.decoded_at === "string" ? payload.decoded_at : null
          });
          this.events.publish("equipment.state", {
            controller_datetime_reply: controllerDatetimeReply
          });
        }
      }
      if (payload.message_type === "controller_software_version") {
        const fields = payload.fields;
        if (fields && typeof fields === "object" && !Array.isArray(fields)) {
          const controllerSoftwareVersionReply = this.projection.updateControllerSoftwareVersionReply({
            ...(fields as Record<string, unknown>),
            occurred_at: typeof payload.decoded_at === "string" ? payload.decoded_at : null
          });
          this.events.publish("equipment.state", {
            controller_software_version_reply: controllerSoftwareVersionReply
          });
        }
      }
      if (payload.message_type === "custom_name") {
        const fields = payload.fields;
        if (fields && typeof fields === "object" && !Array.isArray(fields)) {
          const customNameBank = this.projection.updateControllerCustomName({
            ...(fields as Record<string, unknown>),
            occurred_at: typeof payload.decoded_at === "string" ? payload.decoded_at : null
          });
          this.events.publish("equipment.state", {
            custom_name_bank: customNameBank
          });
        }
      }
    });
    session.subscribe("protocol.command.encoded", async (payload) => {
      this.protocolFrameBundles.recordFrame("protocol.command.encoded", payload);
      this.protocolFrames.publish("protocol.command.encoded", payload);
    });
    session.subscribe("serial.tx.raw", async (payload) => {
      this.serialTxRate.record();
      this.protocolFrameBundles.recordFrame("serial.tx.raw", payload);
      this.protocolFrames.publish("serial.tx.raw", payload);
    });
    session.subscribe("serial.rx.raw", async (payload) => {
      this.serialRxRate.record();
      this.protocolFrameBundles.recordFrame("serial.rx.raw", payload);
      this.protocolFrames.publish("serial.rx.raw", payload);
    });

    await waitForAbort(signal);
    this.currentSession = null;
  }

  private shouldRequestStartupCustomNames(): boolean {
    const controller = this.getEquipment().find((entry) => entry.equipment_type === "controller");
    if (!controller || controller.latest_state == null || typeof controller.latest_state !== "object" || Array.isArray(controller.latest_state)) {
      return false;
    }

    const customNameBank = (controller.latest_state as Record<string, unknown>).custom_name_bank;
    return customNameBank == null
      || (typeof customNameBank === "object" && !Array.isArray(customNameBank) && Object.keys(customNameBank).length === 0);
  }

  private async requestAllCustomNames(session: MessagingSession): Promise<void> {
    for (let nameIndex = 0; nameIndex <= 9; nameIndex += 1) {
      await this.publishCustomNameRequest({ nameIndex }, session);
    }
  }
}

function parseSerialHealthSnapshot(payload: Record<string, unknown>) {
  const status = readPlatformStatus(payload.status);
  const connectionState = typeof payload.connection_state === "string" ? payload.connection_state : "unknown";
  const serialDevice = typeof payload.serial_device === "string" ? payload.serial_device : "unknown device";
  const streamId = typeof payload.stream_id === "string" ? payload.stream_id : null;
  const nats = typeof payload.nats === "string" ? payload.nats : "unknown";

  return {
    status,
    summary: `${connectionState} · ${nats === "ok" ? "NATS connected" : "NATS degraded"}`,
    detail: `Device ${serialDevice}${streamId ? ` · stream ${streamId}` : ""}`
  };
}

function parseProtocolHealthSnapshot(payload: Record<string, unknown>) {
  const status = readPlatformStatus(payload.status);
  const activePlugin = typeof payload.active_plugin === "string" ? payload.active_plugin : "unknown plugin";
  const streamId = typeof payload.stream_id === "string" ? payload.stream_id : null;
  const startupPhase = typeof payload.startup_phase === "string" ? payload.startup_phase : "unknown";

  return {
    status,
    summary: `${startupPhase} · ${activePlugin}`,
    detail: streamId ? `Active stream ${streamId}` : "No active serial stream"
  };
}

function readPlatformStatus(value: unknown): "ok" | "degraded" | "error" | "unavailable" {
  if (value === "ok" || value === "degraded" || value === "error" || value === "unavailable") {
    return value;
  }
  return "unavailable";
}

function renderStatusSeries(
  metricName: string,
  allowedStatuses: readonly string[],
  activeStatus: string,
  labels: Record<string, string> = {}
): string {
  return allowedStatuses
    .map((status) => `${metricName}${formatLabels({ ...labels, status })} ${status === activeStatus ? 1 : 0}`)
    .join("\n")
    .concat("\n");
}

function formatLabels(labels: Record<string, string>): string {
  const entries = Object.entries(labels);
  if (entries.length === 0) {
    return "";
  }
  return `{${entries.map(([key, value]) => `${key}="${value}"`).join(",")}}`;
}

function formatNumber(value: number): string {
  return Number.isFinite(value) ? value.toFixed(6) : "0";
}

function formatNullableMetric(value: number | null): string {
  return value === null ? "NaN" : formatNumber(value);
}

function formatNullableTimestamp(value: string | null): string {
  if (!value) {
    return "NaN";
  }
  const unixSeconds = Date.parse(value) / 1000;
  return Number.isFinite(unixSeconds) ? unixSeconds.toFixed(3) : "NaN";
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
