import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import type { EventBroker } from "./events.js";
import type { ProtocolAnnotation, ProtocolAnnotationInput } from "./protocol-annotations.js";
import type { ProtocolPrompt, ProtocolPromptInput } from "./protocol-prompts.js";
import type {
  ProtocolBundleComparison,
  ProtocolFrameBundle,
  ProtocolFrameBundleSummary,
  ProtocolWatchSession,
  ProtocolWatchSessionSummary
} from "./protocol-bundles.js";
import {
  WeatherLocationSettingsUnavailableError,
  WeatherLocationSettingsValidationError
} from "./weather-location-settings.js";
import {
  ChemistryReadingsUnavailableError,
  ChemistryReadingsValidationError,
  type ChemistryHistoryView,
  type ChemistryReadingCreateResult,
  type ChemistryReadingRecord
} from "./chemistry-readings.js";
import {
  PoolCoverEventsUnavailableError,
  PoolCoverEventsValidationError,
  type PoolCoverCurrentView,
  type PoolCoverEventRecord,
  type PoolCoverHistoryView
} from "./pool-cover-events.js";
import {
  PoolChemistrySettingsUnavailableError,
  PoolChemistrySettingsValidationError
} from "./pool-chemistry-settings.js";

export interface HttpServer {
  start(signal: AbortSignal): Promise<void>;
}

export class HttpRequestError extends Error {}

export class HttpResponseError extends Error {
  constructor(
    readonly statusCode: number,
    readonly payload: { data: null; error: unknown }
  ) {
    super(typeof payload.error === "string" ? payload.error : "HTTP response error");
    this.name = "HttpResponseError";
  }
}

export interface HttpHandlers {
  getEquipment(): Array<Record<string, unknown>>;
  getHealth(): Record<string, unknown>;
  getControllerSchedules(): Record<string, unknown>;
  getControllerClock(): Record<string, unknown>;
  updateControllerClock(input: ControllerClockUpdateRequest): Promise<{ commandId: string; clock: Record<string, unknown> }>;
  getControllerPumpConfigurations(): Record<string, unknown>;
  updateControllerPumpConfiguration(input: PumpConfigWriteRequest): Promise<{ commandId: string; pumpConfiguration: Record<string, unknown> }>;
  getControllerHeater(): Record<string, unknown>;
  getTemperatureTelemetryLatest(): Promise<Record<string, unknown>>;
  getTemperatureTelemetryHistory(input: {
    sensorType: string | null;
    start: string | null;
    end: string | null;
    interval: string | null;
  }): Promise<Record<string, unknown>>;
  getPumpTelemetryLatest(input: { pumpId: string | null }): Promise<Record<string, unknown>>;
  getPumpTelemetryHistory(input: {
    pumpId: string | null;
    start: string | null;
    end: string | null;
    interval: string | null;
  }): Promise<Record<string, unknown>>;
  getWeatherForecast(): Promise<Record<string, unknown>>;
  getWeatherHistory(input: {
    metric: string | null;
    start: string | null;
    end: string | null;
    interval: string | null;
  }): Promise<Record<string, unknown>>;
  refreshWeatherForecast(): Promise<Record<string, unknown>>;
  getWeatherLocationSettings(): Promise<Record<string, unknown>>;
  upsertWeatherLocationSettings(input: Record<string, unknown>): Promise<Record<string, unknown>>;
  getPoolChemistrySettings(): Promise<Record<string, unknown>>;
  updatePoolChemistrySettings(input: Record<string, unknown>): Promise<Record<string, unknown>>;
  getLatestChemistryReading(): Promise<ChemistryReadingRecord | null>;
  getChemistryHistory(input: {
    start: string | null;
    end: string | null;
    interval: string | null;
  }): Promise<ChemistryHistoryView>;
  createChemistryReading(input: Record<string, unknown>): Promise<ChemistryReadingCreateResult>;
  getCurrentPoolCover(): Promise<PoolCoverCurrentView>;
  getPoolCoverHistory(input: {
    start: string | null;
    end: string | null;
    limit: string | null;
  }): Promise<PoolCoverHistoryView>;
  createPoolCoverEvent(input: Record<string, unknown>): Promise<PoolCoverEventRecord>;
  getPlatformStatus(): Promise<Record<string, unknown>>;
  getMetrics(): string;
  getEventBroker(): EventBroker;
  getProtocolFrameBroker(): EventBroker;
  listProtocolFrameBundles(): ProtocolFrameBundleSummary[];
  createProtocolFrameBundle(input: { label: string | null }): ProtocolFrameBundleSummary;
  getProtocolFrameBundle(id: string): ProtocolFrameBundle | null;
  startProtocolWatchSession(input: { label: string | null; events: string[] | null }): ProtocolWatchSessionSummary;
  getProtocolWatchSession(id: string): ProtocolWatchSession | null;
  stopProtocolWatchSession(id: string): ProtocolWatchSessionSummary | null;
  compareProtocolFrameBundles(input: {
    baselineBundleId: string;
    comparisonBundleId: string;
  }): ProtocolBundleComparison | null;
  listProtocolAnnotations(bundleId: string | null): ProtocolAnnotation[];
  createProtocolAnnotation(input: ProtocolAnnotationInput): ProtocolAnnotation;
  listProtocolPrompts(bundleId: string | null): ProtocolPrompt[];
  createProtocolPrompt(input: ProtocolPromptInput): ProtocolPrompt;
  publishRemoteLayoutRequest(input: { pageIndex: number }): Promise<{ commandId: string }>;
  publishPumpInfoRequest(input: { pumpSlot: number }): Promise<{ commandId: string }>;
  publishControllerScheduleRequest(input: { scheduleId: number }): Promise<{ commandId: string }>;
  updateControllerSchedule(input: {
    scheduleId: number;
    mode: "repeat" | "egg_timer";
    circuitId: number;
    startTimeMinutes?: number;
    endTimeMinutes?: number;
    daysMask?: number;
    runtimeMinutes?: number;
  }): Promise<{ commandId: string; schedule: Record<string, unknown> }>;
  updateControllerHeaterConfiguration(input: {
    heaterType: "ultratempHeatPumpCom" | "ultratempEtiHybrid";
    coolingEnabled: boolean;
    freezeProtectionEnabled: boolean;
  }): Promise<{ commandId: string; heater: Record<string, unknown> }>;
  updateControllerHeaterSettings(input: {
    poolSetpoint: number;
    spaSetpoint: number;
    poolHeatMode: 0 | 1 | 2 | 3;
    spaHeatMode: 0 | 1 | 2 | 3;
    coolSetpoint: number;
  }): Promise<{ commandId: string; heater: Record<string, unknown> }>;
  publishCircuitConfigRequest(input: { startIndex: number; endIndex: number }): Promise<{ commandId: string }>;
  publishCustomNameRequest(input: { nameIndex: number }): Promise<{ commandId: string }>;
  publishControllerSoftwareVersionRequest(): Promise<{ commandId: string }>;
  publishControllerDatetimeRequest(): Promise<{ commandId: string }>;
  publishControllerDatetimeSync(): Promise<{ commandId: string }>;
  publishPumpConfigWrite(input: PumpConfigWriteRequest): Promise<{ commandId: string }>;
  publishRawFrameCommand(input: { protocolName: string; bytesHex: string }): Promise<{ commandId: string }>;
  publishPumpSpeedCommand(input: { equipmentId: string; rpm: number; circuitKey?: string | null }): Promise<{ commandId: string }>;
  publishCircuitStateCommand(input: { equipmentId: string; circuitKey: string; enabled: boolean }): Promise<{ commandId: string }>;
}

export interface PumpConfigWriteSlot {
  circuit_assignment: number;
  rpm: number;
}

export interface PumpConfigWriteRequest {
  pumpId: number;
  pumpType: number;
  primingTime: number;
  unknown3: number;
  unknown4: number;
  slots: PumpConfigWriteSlot[];
  primingSpeed: number;
  trailingBytes: number[];
}

interface ControllerScheduleUpdateRequest {
  scheduleId: number;
  mode: "repeat" | "egg_timer";
  circuitId: number;
  startTimeMinutes?: number;
  endTimeMinutes?: number;
  daysMask?: number;
  runtimeMinutes?: number;
}

interface ControllerHeaterConfigurationUpdateRequest {
  heaterType: "ultratempHeatPumpCom" | "ultratempEtiHybrid";
  coolingEnabled: boolean;
  freezeProtectionEnabled: boolean;
}

interface ControllerHeaterSettingsUpdateRequest {
  poolSetpoint: number;
  spaSetpoint: number;
  poolHeatMode: 0 | 1 | 2 | 3;
  spaHeatMode: 0 | 1 | 2 | 3;
  coolSetpoint: number;
}

interface ControllerClockUpdateRequest {
  month: number;
  day: number;
  year: number;
  dayOfWeek: number;
  hour24: number;
  minute: number;
  daylightSavingsAuto: boolean | null;
  clockAdvance: number | null;
}

export class LocalHttpServer implements HttpServer {
  private readonly host: string;
  private readonly port: number;
  private server: Server | null = null;

  constructor(bind: string, private readonly handlers: HttpHandlers) {
    const index = bind.lastIndexOf(":");
    this.host = bind.slice(0, index);
    this.port = Number.parseInt(bind.slice(index + 1), 10);
  }

  async start(signal: AbortSignal): Promise<void> {
    if (this.server) {
      return;
    }

    this.server = createServer((req, res) => {
      void this.route(req, res);
    });
    signal.addEventListener("abort", () => {
      this.server?.close();
    });

    await new Promise<void>((resolve, reject) => {
      this.server?.once("error", reject);
      this.server?.listen(this.port, this.host, () => {
        this.server?.off("error", reject);
        resolve();
      });
    });
  }

  private async route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      if (req.method === "OPTIONS") {
        return preflight(res, req);
      }

      if (req.method === "GET" && req.url === "/equipment") {
        return json(req, res, 200, { data: this.handlers.getEquipment(), error: null });
      }

      if (req.method === "GET" && req.url === "/controller/schedules") {
        return json(req, res, 200, { data: this.handlers.getControllerSchedules(), error: null });
      }

      if (req.method === "GET" && req.url === "/controller/clock") {
        return json(req, res, 200, { data: this.handlers.getControllerClock(), error: null });
      }

      if (req.method === "GET" && req.url === "/controller/pumps/configuration") {
        return json(req, res, 200, { data: this.handlers.getControllerPumpConfigurations(), error: null });
      }

      if (req.method === "GET" && req.url === "/controller/heater") {
        return json(req, res, 200, { data: this.handlers.getControllerHeater(), error: null });
      }

      if (req.method === "GET" && req.url === "/telemetry/temperatures/latest") {
        return json(req, res, 200, { data: await this.handlers.getTemperatureTelemetryLatest(), error: null });
      }

      if (req.method === "GET" && req.url?.startsWith("/telemetry/temperatures/history")) {
        const url = new URL(req.url, "http://localhost");
        return json(req, res, 200, {
          data: await this.handlers.getTemperatureTelemetryHistory({
            sensorType: url.searchParams.get("sensorType"),
            start: url.searchParams.get("start"),
            end: url.searchParams.get("end"),
            interval: url.searchParams.get("interval")
          }),
          error: null
        });
      }

      if (req.method === "GET" && req.url?.startsWith("/telemetry/pumps/latest")) {
        const url = new URL(req.url, "http://localhost");
        return json(req, res, 200, {
          data: await this.handlers.getPumpTelemetryLatest({
            pumpId: url.searchParams.get("pumpId")
          }),
          error: null
        });
      }

      if (req.method === "GET" && req.url?.startsWith("/telemetry/pumps/history")) {
        const url = new URL(req.url, "http://localhost");
        return json(req, res, 200, {
          data: await this.handlers.getPumpTelemetryHistory({
            pumpId: url.searchParams.get("pumpId"),
            start: url.searchParams.get("start"),
            end: url.searchParams.get("end"),
            interval: url.searchParams.get("interval")
          }),
          error: null
        });
      }

      if (req.method === "GET" && req.url === "/weather/forecast") {
        return json(req, res, 200, { data: await this.handlers.getWeatherForecast(), error: null });
      }

      if (req.method === "GET" && req.url === "/api/settings/weather-location") {
        return json(req, res, 200, { data: await this.handlers.getWeatherLocationSettings(), error: null });
      }

      if (req.method === "GET" && req.url?.startsWith("/weather/history")) {
        const url = new URL(req.url, "http://localhost");
        return json(req, res, 200, {
          data: await this.handlers.getWeatherHistory({
            metric: url.searchParams.get("metric"),
            start: url.searchParams.get("start"),
            end: url.searchParams.get("end"),
            interval: url.searchParams.get("interval")
          }),
          error: null
        });
      }

      if (req.method === "POST" && req.url === "/weather/forecast/refresh") {
        return json(req, res, 200, { data: await this.handlers.refreshWeatherForecast(), error: null });
      }

      if (req.method === "PUT" && req.url === "/api/settings/weather-location") {
        const body = await readJsonBody(req);
        return json(req, res, 200, { data: await this.handlers.upsertWeatherLocationSettings(body), error: null });
      }

      if (req.method === "GET" && req.url === "/api/settings/pool-chemistry") {
        return json(req, res, 200, { data: await this.handlers.getPoolChemistrySettings(), error: null });
      }

      if (req.method === "PUT" && req.url === "/api/settings/pool-chemistry") {
        const body = await readJsonBody(req);
        return json(req, res, 200, { data: await this.handlers.updatePoolChemistrySettings(body), error: null });
      }

      if (req.method === "GET" && req.url === "/chemistry/latest") {
        return json(req, res, 200, { data: await this.handlers.getLatestChemistryReading(), error: null });
      }

      if (req.method === "GET" && req.url?.startsWith("/chemistry/history")) {
        const url = new URL(req.url, "http://localhost");
        return json(req, res, 200, {
          data: await this.handlers.getChemistryHistory({
            start: url.searchParams.get("start"),
            end: url.searchParams.get("end"),
            interval: url.searchParams.get("interval")
          }),
          error: null
        });
      }

      if (req.method === "POST" && req.url === "/chemistry") {
        const body = await readJsonBody(req);
        return json(req, res, 201, { data: await this.handlers.createChemistryReading(body), error: null });
      }

      if (req.method === "GET" && req.url === "/pool/cover") {
        return json(req, res, 200, { data: await this.handlers.getCurrentPoolCover(), error: null });
      }

      if (req.method === "GET" && req.url?.startsWith("/pool/cover/history")) {
        const url = new URL(req.url, "http://localhost");
        return json(req, res, 200, {
          data: await this.handlers.getPoolCoverHistory({
            start: url.searchParams.get("start"),
            end: url.searchParams.get("end"),
            limit: url.searchParams.get("limit")
          }),
          error: null
        });
      }

      if (req.method === "POST" && req.url === "/pool/cover") {
        const body = await readJsonBody(req);
        return json(req, res, 201, { data: await this.handlers.createPoolCoverEvent(body), error: null });
      }

      const controllerScheduleUpdateMatch = req.url?.match(/^\/controller\/schedules\/([^/]+)$/);
      if (req.method === "PUT" && controllerScheduleUpdateMatch) {
        const body = await readJsonBody(req);
        const result = await this.handlers.updateControllerSchedule(
          readControllerScheduleUpdateRequest(decodeURIComponent(controllerScheduleUpdateMatch[1]), body)
        );
        return json(req, res, 200, {
          data: {
            command_id: result.commandId,
            status: "completed",
            schedule: result.schedule
          },
          error: null
        });
      }

      if (req.method === "PUT" && req.url === "/controller/heater/configuration") {
        const body = await readJsonBody(req);
        const result = await this.handlers.updateControllerHeaterConfiguration(readControllerHeaterConfigurationUpdateRequest(body));
        return json(req, res, 200, {
          data: {
            command_id: result.commandId,
            status: "completed",
            heater: result.heater
          },
          error: null
        });
      }

      if (req.method === "PUT" && req.url === "/controller/heater/settings") {
        const body = await readJsonBody(req);
        const result = await this.handlers.updateControllerHeaterSettings(readControllerHeaterSettingsUpdateRequest(body));
        return json(req, res, 200, {
          data: {
            command_id: result.commandId,
            status: "completed",
            heater: result.heater
          },
          error: null
        });
      }

      if (req.method === "PUT" && req.url === "/controller/clock") {
        const body = await readJsonBody(req);
        const result = await this.handlers.updateControllerClock(readControllerClockUpdateRequest(body));
        return json(req, res, 200, {
          data: {
            command_id: result.commandId,
            status: "completed",
            clock: result.clock
          },
          error: null
        });
      }

      const pumpConfigurationUpdateMatch = req.url?.match(/^\/controller\/pumps\/([^/]+)\/configuration$/);
      if (req.method === "PUT" && pumpConfigurationUpdateMatch) {
        const body = await readJsonBody(req);
        const input = readPumpConfigWriteRequest(body);
        const pumpId = Number.parseInt(decodeURIComponent(pumpConfigurationUpdateMatch[1]), 10);
        if (!Number.isInteger(pumpId) || pumpId < 1 || pumpId > 255) {
          throw new HttpRequestError("Pump configuration update requires pump_id path parameter between 1 and 255.");
        }
        const result = await this.handlers.updateControllerPumpConfiguration({ ...input, pumpId });
        return json(req, res, 200, {
          data: {
            command_id: result.commandId,
            status: "completed",
            pump_configuration: result.pumpConfiguration
          },
          error: null
        });
      }

      if (req.method === "GET" && req.url === "/health") {
        return json(req, res, 200, this.handlers.getHealth());
      }

      if (req.method === "GET" && req.url === "/healthz") {
        return json(req, res, 200, {
          status: "healthy",
          message: "Process alive"
        });
      }

      if (req.method === "GET" && req.url === "/readyz") {
        const health = this.handlers.getHealth();
        const ready = health.ready === true;
        return json(req, res, ready ? 200 : 503, {
          status: ready ? "healthy" : "unhealthy",
          ready
        });
      }

      if (req.method === "GET" && req.url === "/platform/status") {
        return json(req, res, 200, await this.handlers.getPlatformStatus());
      }

      if (req.method === "GET" && req.url === "/metrics") {
        return text(req, res, 200, this.handlers.getMetrics(), "text/plain; version=0.0.4");
      }

      if (req.method === "GET" && req.url === "/events") {
        return this.handleEvents(req, res, this.handlers.getEventBroker());
      }

      if (req.method === "GET" && req.url === "/protocol/frames") {
        return this.handleEvents(req, res, this.handlers.getProtocolFrameBroker());
      }

      if (req.method === "GET" && req.url === "/protocol/bundles") {
        return json(req, res, 200, { data: this.handlers.listProtocolFrameBundles(), error: null });
      }

      if (req.method === "GET" && req.url?.startsWith("/protocol/annotations")) {
        const url = new URL(req.url, "http://localhost");
        const bundleId = url.searchParams.get("bundle_id");
        return json(req, res, 200, { data: this.handlers.listProtocolAnnotations(bundleId), error: null });
      }

      if (req.method === "GET" && req.url?.startsWith("/protocol/prompts")) {
        const url = new URL(req.url, "http://localhost");
        const bundleId = url.searchParams.get("bundle_id");
        return json(req, res, 200, { data: this.handlers.listProtocolPrompts(bundleId), error: null });
      }

      if (req.method === "POST" && req.url === "/protocol/bundles") {
        const body = await readJsonBody(req);
        const result = this.handlers.createProtocolFrameBundle({
          label: readOptionalLabel(body)
        });
        return json(req, res, 201, { data: result, error: null });
      }

      if (req.method === "POST" && req.url === "/protocol/watch-sessions") {
        const body = await readJsonBody(req);
        const result = this.handlers.startProtocolWatchSession(readWatchSessionRequest(body));
        return json(req, res, 201, { data: result, error: null });
      }

      if (req.method === "POST" && req.url === "/protocol/bundles/compare") {
        const body = await readJsonBody(req);
        const result = this.handlers.compareProtocolFrameBundles(readBundleCompareRequest(body));
        if (!result) {
          return json(req, res, 404, { data: null, error: "One or both protocol frame bundles were not found." });
        }
        return json(req, res, 200, { data: result, error: null });
      }

      if (req.method === "POST" && req.url === "/protocol/annotations") {
        const body = await readJsonBody(req);
        const result = this.handlers.createProtocolAnnotation(readProtocolAnnotation(body));
        return json(req, res, 201, { data: result, error: null });
      }

      if (req.method === "POST" && req.url === "/protocol/prompts") {
        const body = await readJsonBody(req);
        const result = this.handlers.createProtocolPrompt(readProtocolPrompt(body));
        return json(req, res, 201, { data: result, error: null });
      }

      if (req.method === "POST" && req.url === "/protocol/remote-layout/request") {
        const body = await readJsonBody(req);
        const result = await this.handlers.publishRemoteLayoutRequest({
          pageIndex: readPageIndex(body)
        });
        return json(req, res, 202, {
          data: {
            command_id: result.commandId,
            status: "accepted"
          },
          error: null
        });
      }

      if (req.method === "POST" && req.url === "/protocol/pump-info/request") {
        const body = await readJsonBody(req);
        const result = await this.handlers.publishPumpInfoRequest({
          pumpSlot: readPumpSlot(body)
        });
        return json(req, res, 202, {
          data: {
            command_id: result.commandId,
            status: "accepted"
          },
          error: null
        });
      }

      if (req.method === "POST" && req.url === "/protocol/controller-schedule/request") {
        const body = await readJsonBody(req);
        const result = await this.handlers.publishControllerScheduleRequest({
          scheduleId: readScheduleIndex(body)
        });
        return json(req, res, 202, {
          data: {
            command_id: result.commandId,
            status: "accepted"
          },
          error: null
        });
      }

      if (req.method === "POST" && req.url === "/protocol/circuit-config/request") {
        const body = await readJsonBody(req);
        const result = await this.handlers.publishCircuitConfigRequest(readCircuitConfigRange(body));
        return json(req, res, 202, {
          data: {
            command_id: result.commandId,
            status: "accepted"
          },
          error: null
        });
      }

      if (req.method === "POST" && req.url === "/protocol/custom-name/request") {
        const body = await readJsonBody(req);
        const result = await this.handlers.publishCustomNameRequest(readCustomNameIndex(body));
        return json(req, res, 202, {
          data: {
            command_id: result.commandId,
            status: "accepted"
          },
          error: null
        });
      }

      if (req.method === "POST" && req.url === "/protocol/software-version/request") {
        await readJsonBody(req);
        const result = await this.handlers.publishControllerSoftwareVersionRequest();
        return json(req, res, 202, {
          data: {
            command_id: result.commandId,
            status: "accepted"
          },
          error: null
        });
      }

      if (req.method === "POST" && req.url === "/protocol/controller-datetime/request") {
        await readJsonBody(req);
        const result = await this.handlers.publishControllerDatetimeRequest();
        return json(req, res, 202, {
          data: {
            command_id: result.commandId,
            status: "accepted"
          },
          error: null
        });
      }

      if (req.method === "POST" && req.url === "/protocol/controller-datetime/sync") {
        await readJsonBody(req);
        const result = await this.handlers.publishControllerDatetimeSync();
        return json(req, res, 202, {
          data: {
            command_id: result.commandId,
            status: "accepted"
          },
          error: null
        });
      }

      if (req.method === "POST" && req.url === "/protocol/pump-config/write") {
        const body = await readJsonBody(req);
        const result = await this.handlers.publishPumpConfigWrite(readPumpConfigWriteRequest(body));
        return json(req, res, 202, {
          data: {
            command_id: result.commandId,
            status: "accepted"
          },
          error: null
        });
      }

      if (req.method === "POST" && req.url === "/protocol/raw-frame/send") {
        const body = await readJsonBody(req);
        const result = await this.handlers.publishRawFrameCommand(readRawFrameRequest(body));
        return json(req, res, 202, {
          data: {
            command_id: result.commandId,
            status: "accepted"
          },
          error: null
        });
      }

      const bundleMatch = req.url?.match(/^\/protocol\/bundles\/([^/]+)$/);
      if (req.method === "GET" && bundleMatch) {
        const bundle = this.handlers.getProtocolFrameBundle(decodeURIComponent(bundleMatch[1]));
        if (!bundle) {
          return json(req, res, 404, { data: null, error: "Protocol frame bundle not found." });
        }
        return json(req, res, 200, { data: bundle, error: null });
      }

      const watchMatch = req.url?.match(/^\/protocol\/watch-sessions\/([^/]+)$/);
      if (req.method === "GET" && watchMatch) {
        const session = this.handlers.getProtocolWatchSession(decodeURIComponent(watchMatch[1]));
        if (!session) {
          return json(req, res, 404, { data: null, error: "Protocol watch session not found." });
        }
        return json(req, res, 200, { data: session, error: null });
      }

      const watchStopMatch = req.url?.match(/^\/protocol\/watch-sessions\/([^/]+)\/stop$/);
      if (req.method === "POST" && watchStopMatch) {
        const result = this.handlers.stopProtocolWatchSession(decodeURIComponent(watchStopMatch[1]));
        if (!result) {
          return json(req, res, 404, { data: null, error: "Protocol watch session not found." });
        }
        return json(req, res, 200, { data: result, error: null });
      }

      const controlMatch = req.url?.match(/^\/equipment\/([^/]+)\/control$/);
      if (req.method === "POST" && controlMatch) {
        const body = await readJsonBody(req);
        const equipmentId = decodeURIComponent(controlMatch[1]);
        const controlRequest = readEquipmentControlRequest(body);
        const result =
          controlRequest.commandType === "set_speed"
            ? await this.handlers.publishPumpSpeedCommand({
                equipmentId,
                rpm: controlRequest.rpm,
                circuitKey: controlRequest.circuitKey
              })
            : await this.handlers.publishCircuitStateCommand({
                equipmentId,
                circuitKey: controlRequest.circuitKey,
                enabled: controlRequest.enabled
              });
        return json(req, res, 202, {
          data: {
            command_id: result.commandId,
            status: "accepted"
          },
          error: null
        });
      }

      res.writeHead(404, corsHeaders(req));
      res.end();
    } catch (error) {
      if (error instanceof HttpResponseError) {
        return json(req, res, error.statusCode, error.payload);
      }
      if (error instanceof HttpRequestError) {
        return json(req, res, 400, { data: null, error: error.message });
      }
      if (error instanceof WeatherLocationSettingsValidationError) {
        return json(req, res, 400, {
          data: null,
          error: {
            code: "validation_error",
            message: error.message,
            details: error.details
          }
        });
      }
      if (error instanceof WeatherLocationSettingsUnavailableError) {
        return json(req, res, 503, {
          data: null,
          error: {
            code: "service_unavailable",
            message: error.message
          }
        });
      }

      if (error instanceof PoolChemistrySettingsValidationError) {
        return json(req, res, 400, {
          data: null,
          error: {
            code: "validation_error",
            message: error.message,
            details: error.details
          }
        });
      }

      if (error instanceof PoolChemistrySettingsUnavailableError) {
        return json(req, res, 503, {
          data: null,
          error: {
            code: "service_unavailable",
            message: error.message
          }
        });
      }

      if (error instanceof ChemistryReadingsValidationError) {
        return json(req, res, 400, {
          data: null,
          error: {
            code: "validation_error",
            message: error.message,
            details: error.details
          }
        });
      }

      if (error instanceof ChemistryReadingsUnavailableError) {
        return json(req, res, 503, {
          data: null,
          error: {
            code: "service_unavailable",
            message: error.message
          }
        });
      }

      if (error instanceof PoolCoverEventsValidationError) {
        return json(req, res, 400, {
          data: null,
          error: {
            code: "validation_error",
            message: error.message,
            details: error.details
          }
        });
      }

      if (error instanceof PoolCoverEventsUnavailableError) {
        return json(req, res, 503, {
          data: null,
          error: {
            code: "service_unavailable",
            message: error.message
          }
        });
      }

      return json(req, res, 500, { data: null, error: "Internal server error." });
    }
  }

  private handleEvents(req: IncomingMessage, res: ServerResponse, broker: EventBroker): void {
    res.writeHead(200, {
      ...corsHeaders(req),
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive"
    });

    const clientId = randomUUID();
    const unsubscribe = broker.addClient({
      send(event, payload) {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      }
    });

    res.write(`event: ready\n`);
    res.write(`data: ${JSON.stringify({ client_id: clientId })}\n\n`);

    res.on("close", () => {
      unsubscribe();
      res.end();
    });
  }
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  const body = Buffer.concat(chunks).toString("utf8");
  if (!body) {
    return {};
  }

  const parsed = JSON.parse(body);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new HttpRequestError("Request body must be a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

function readEquipmentControlRequest(
  body: Record<string, unknown>
):
  | { commandType: "set_speed"; rpm: number; circuitKey: string | null }
  | { commandType: "set_circuit_state"; circuitKey: string; enabled: boolean } {
  const commandType = body.command_type;
  const args = body.arguments;
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    throw new HttpRequestError("Control payload must provide a supported command_type and arguments.");
  }

  if (commandType === "set_speed") {
    const rpm = (args as Record<string, unknown>).rpm;
    if (typeof rpm !== "number" || !Number.isInteger(rpm)) {
      throw new HttpRequestError("Pump speed control requires an integer rpm.");
    }

    const circuitKey = body.circuit_key;
    if (circuitKey != null && (typeof circuitKey !== "string" || circuitKey.trim().length === 0)) {
      throw new HttpRequestError("Pump speed control circuit_key must be a non-empty string when provided.");
    }

    return {
      commandType,
      rpm,
      circuitKey: typeof circuitKey === "string" ? circuitKey.trim() : null
    };
  }

  const circuitKey = body.circuit_key;
  if (commandType === "set_circuit_state") {
    if (typeof circuitKey !== "string" || circuitKey.trim().length === 0) {
      throw new HttpRequestError("Circuit state control requires a non-empty circuit_key.");
    }
    const enabled = (args as Record<string, unknown>).enabled;
    if (typeof enabled !== "boolean") {
      throw new HttpRequestError("Circuit state control requires boolean arguments.enabled.");
    }
    return {
      commandType,
      circuitKey: circuitKey.trim(),
      enabled
    };
  }

  throw new HttpRequestError("Control payload must provide command_type 'set_speed' or 'set_circuit_state'.");
}

function readPageIndex(body: Record<string, unknown>): number {
  const pageIndex = body.page_index;
  if (typeof pageIndex !== "number" || !Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex > 255) {
    throw new HttpRequestError("Remote Layout request requires an integer page_index between 0 and 255.");
  }

  return pageIndex;
}

function readPumpSlot(body: Record<string, unknown>): number {
  const pumpSlot = body.pump_slot;
  if (typeof pumpSlot !== "number" || !Number.isInteger(pumpSlot) || pumpSlot < 1 || pumpSlot > 2) {
    throw new HttpRequestError("Pump info request requires an integer pump_slot of 1 or 2.");
  }

  return pumpSlot;
}

function readScheduleIndex(body: Record<string, unknown>): number {
  const scheduleId = body.schedule_id;
  if (typeof scheduleId !== "number" || !Number.isInteger(scheduleId) || scheduleId < 1 || scheduleId > 12) {
    throw new HttpRequestError("Controller schedule request requires integer schedule_id between 1 and 12.");
  }

  return scheduleId;
}

function readCircuitConfigRange(body: Record<string, unknown>): { startIndex: number; endIndex: number } {
  const startIndex = body.start_index ?? 1;
  const endIndex = body.end_index ?? 20;

  if (typeof startIndex !== "number" || !Number.isInteger(startIndex) || startIndex < 1 || startIndex > 255) {
    throw new HttpRequestError("Circuit config request requires start_index to be an integer between 1 and 255.");
  }
  if (typeof endIndex !== "number" || !Number.isInteger(endIndex) || endIndex < 1 || endIndex > 255) {
    throw new HttpRequestError("Circuit config request requires end_index to be an integer between 1 and 255.");
  }
  if (endIndex < startIndex) {
    throw new HttpRequestError("Circuit config request requires end_index to be greater than or equal to start_index.");
  }
  if (endIndex - startIndex + 1 > 32) {
    throw new HttpRequestError("Circuit config request is limited to 32 indexes at a time.");
  }

  return { startIndex, endIndex };
}

function readControllerScheduleUpdateRequest(
  scheduleIdParam: string,
  body: Record<string, unknown>
): ControllerScheduleUpdateRequest {
  const scheduleId = Number.parseInt(scheduleIdParam, 10);
  if (!Number.isInteger(scheduleId) || scheduleId < 1 || scheduleId > 12) {
    throw new HttpRequestError("Controller schedule update requires schedule_id path parameter between 1 and 12.");
  }

  const mode = body.mode;
  if (mode !== "repeat" && mode !== "egg_timer") {
    throw new HttpRequestError("Controller schedule update requires mode 'repeat' or 'egg_timer'.");
  }

  const circuitId = body.circuit_id;
  if (typeof circuitId !== "number" || !Number.isInteger(circuitId) || circuitId < 1 || circuitId > 255) {
    throw new HttpRequestError("Controller schedule update requires integer circuit_id between 1 and 255.");
  }

  if (mode === "repeat") {
    const startTimeMinutes = body.start_time_minutes;
    const endTimeMinutes = body.end_time_minutes;
    const daysMask = body.days_mask;
    if (typeof startTimeMinutes !== "number" || !Number.isInteger(startTimeMinutes) || startTimeMinutes < 0 || startTimeMinutes > 1439) {
      throw new HttpRequestError("Controller repeat schedule update requires integer start_time_minutes between 0 and 1439.");
    }
    if (typeof endTimeMinutes !== "number" || !Number.isInteger(endTimeMinutes) || endTimeMinutes < 0 || endTimeMinutes > 1439) {
      throw new HttpRequestError("Controller repeat schedule update requires integer end_time_minutes between 0 and 1439.");
    }
    if (typeof daysMask !== "number" || !Number.isInteger(daysMask) || daysMask < 1 || daysMask > 127) {
      throw new HttpRequestError("Controller repeat schedule update requires integer days_mask between 1 and 127.");
    }
    return {
      scheduleId,
      mode,
      circuitId,
      startTimeMinutes,
      endTimeMinutes,
      daysMask
    };
  }

  const runtimeMinutes = body.runtime_minutes;
  if (typeof runtimeMinutes !== "number" || !Number.isInteger(runtimeMinutes) || runtimeMinutes < 1 || runtimeMinutes > 1439) {
    throw new HttpRequestError("Controller egg timer update requires integer runtime_minutes between 1 and 1439.");
  }
  return {
    scheduleId,
    mode,
    circuitId,
    runtimeMinutes
  };
}

function readControllerHeaterConfigurationUpdateRequest(
  body: Record<string, unknown>
): ControllerHeaterConfigurationUpdateRequest {
  const heaterType = body.heater_type;
  if (heaterType !== "ultratempHeatPumpCom" && heaterType !== "ultratempEtiHybrid") {
    throw new HttpRequestError("Controller heater configuration requires heater_type 'ultratempHeatPumpCom' or 'ultratempEtiHybrid'.");
  }

  const coolingEnabled = body.cooling_enabled;
  if (typeof coolingEnabled !== "boolean") {
    throw new HttpRequestError("Controller heater configuration requires boolean cooling_enabled.");
  }

  const freezeProtectionEnabled = body.freeze_protection_enabled;
  if (typeof freezeProtectionEnabled !== "boolean") {
    throw new HttpRequestError("Controller heater configuration requires boolean freeze_protection_enabled.");
  }

  return {
    heaterType,
    coolingEnabled,
    freezeProtectionEnabled
  };
}

function readControllerHeaterSettingsUpdateRequest(
  body: Record<string, unknown>
): ControllerHeaterSettingsUpdateRequest {
  const poolSetpoint = readIntegerRange(body.pool_setpoint, "pool_setpoint", 40, 104);
  const spaSetpoint = readIntegerRange(body.spa_setpoint, "spa_setpoint", 40, 104);
  const poolHeatMode = readHeatMode(body.pool_heat_mode, "pool_heat_mode");
  const spaHeatMode = readHeatMode(body.spa_heat_mode, "spa_heat_mode");
  const coolSetpoint = body.cool_setpoint == null ? 0 : readIntegerRange(body.cool_setpoint, "cool_setpoint", 0, 255);

  return {
    poolSetpoint,
    spaSetpoint,
    poolHeatMode,
    spaHeatMode,
    coolSetpoint
  };
}

function readControllerClockUpdateRequest(
  body: Record<string, unknown>
): ControllerClockUpdateRequest {
  return {
    month: readByte(body.month, "month"),
    day: readByte(body.day, "day"),
    year: readByte(body.year, "year"),
    dayOfWeek: readByte(body.day_of_week, "day_of_week"),
    hour24: readByte(body.hour_24, "hour_24"),
    minute: readByte(body.minute, "minute"),
    daylightSavingsAuto: readNullableBoolean(body.daylight_savings_auto, "daylight_savings_auto"),
    clockAdvance: readNullableByte(body.clock_advance, "clock_advance")
  };
}

function readIntegerRange(value: unknown, fieldName: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new HttpRequestError(`Controller heater settings require integer ${fieldName} between ${min} and ${max}.`);
  }

  return value;
}

function readHeatMode(value: unknown, fieldName: string): 0 | 1 | 2 | 3 {
  const nextValue = readIntegerRange(value, fieldName, 0, 3);
  return nextValue as 0 | 1 | 2 | 3;
}

export function readCustomNameIndex(body: Record<string, unknown>): { nameIndex: number } {
  const nameIndex = body.name_index;
  if (typeof nameIndex !== "number" || !Number.isInteger(nameIndex) || nameIndex < 0 || nameIndex > 9) {
    throw new HttpRequestError("Custom name request requires name_index to be an integer between 0 and 9.");
  }

  return { nameIndex };
}

function readOptionalLabel(body: Record<string, unknown>): string | null {
  const label = body.label;
  if (label == null) {
    return null;
  }

  if (typeof label !== "string") {
    throw new HttpRequestError("Protocol frame bundle label must be a string when provided.");
  }

  const trimmed = label.trim();
  return trimmed.length > 0 ? trimmed : null;
}

const ALLOWED_WATCH_EVENTS = [
  "protocol.frame.raw",
  "protocol.frame.buffered",
  "protocol.frame.unidentified",
  "protocol.frame.decoded",
  "protocol.command.encoded",
  "serial.rx.raw",
  "serial.tx.raw"
] as const;

export function readWatchSessionRequest(body: Record<string, unknown>): {
  label: string | null;
  events: string[] | null;
} {
  const label = readOptionalLabel(body);
  const events = body.events;
  if (events == null) {
    return { label, events: null };
  }

  if (!Array.isArray(events) || events.some((value) => typeof value !== "string")) {
    throw new HttpRequestError("Protocol watch session events must be an array of strings when provided.");
  }

  const normalized = [...new Set(events.map((value) => value.trim()).filter((value) => value.length > 0))];
  if (normalized.length === 0) {
    return { label, events: null };
  }

  for (const event of normalized) {
    if (!(ALLOWED_WATCH_EVENTS as readonly string[]).includes(event)) {
      throw new HttpRequestError(
        `Protocol watch session event '${event}' is unsupported. Allowed values: ${ALLOWED_WATCH_EVENTS.join(", ")}.`
      );
    }
  }

  return { label, events: normalized };
}

export function readBundleCompareRequest(body: Record<string, unknown>): {
  baselineBundleId: string;
  comparisonBundleId: string;
} {
  const baselineBundleId = body.baseline_bundle_id;
  const comparisonBundleId = body.comparison_bundle_id;
  if (typeof baselineBundleId !== "string" || typeof comparisonBundleId !== "string") {
    throw new HttpRequestError("Bundle comparison requires string baseline_bundle_id and comparison_bundle_id.");
  }

  return {
    baselineBundleId,
    comparisonBundleId
  };
}

export function readRawFrameRequest(body: Record<string, unknown>): {
  protocolName: string;
  bytesHex: string;
} {
  const protocolName = body.protocol_name;
  const bytesHex = body.bytes_hex;
  if (typeof protocolName !== "string" || protocolName.trim().length === 0) {
    throw new HttpRequestError("Raw frame request requires a non-empty string protocol_name.");
  }
  if (typeof bytesHex !== "string" || bytesHex.length === 0) {
    throw new HttpRequestError("Raw frame request requires a non-empty string bytes_hex.");
  }
  if (!/^[0-9a-f]+$/.test(bytesHex) || bytesHex.length % 2 !== 0) {
    throw new HttpRequestError("Raw frame request bytes_hex must be even-length lowercase hex.");
  }

  return {
    protocolName: protocolName.trim(),
    bytesHex
  };
}

function readByte(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 255) {
    throw new HttpRequestError(`${fieldName} must be an integer byte between 0 and 255.`);
  }
  return value;
}

function readRpmValue(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 3450) {
    throw new HttpRequestError(`${fieldName} must be an integer RPM between 0 and 3450.`);
  }
  return value;
}

function readNullableBoolean(value: unknown, fieldName: string): boolean | null {
  if (value == null) {
    return null;
  }
  if (typeof value !== "boolean") {
    throw new HttpRequestError(`${fieldName} must be a boolean when provided.`);
  }
  return value;
}

function readNullableByte(value: unknown, fieldName: string): number | null {
  if (value == null) {
    return null;
  }
  return readByte(value, fieldName);
}

export function readPumpConfigWriteRequest(body: Record<string, unknown>): PumpConfigWriteRequest {
  const slotsValue = body.slots;
  if (!Array.isArray(slotsValue) || slotsValue.length !== 8) {
    throw new HttpRequestError("Pump config write requires slots as an array of 8 entries.");
  }

  const trailingBytesValue = body.trailing_bytes;
  const trailingBytes =
    trailingBytesValue == null
      ? []
      : Array.isArray(trailingBytesValue)
        ? trailingBytesValue.map((value, index) => readByte(value, `trailing_bytes[${index}]`))
        : (() => {
            throw new HttpRequestError("Pump config write trailing_bytes must be an array of bytes when provided.");
          })();

  return {
    pumpId: readByte(body.pump_id, "pump_id"),
    pumpType: readByte(body.pump_type, "pump_type"),
    primingTime: readByte(body.priming_time, "priming_time"),
    unknown3: readByte(body.unknown_3, "unknown_3"),
    unknown4: readByte(body.unknown_4, "unknown_4"),
    slots: slotsValue.map((slotValue, index) => {
      if (!slotValue || typeof slotValue !== "object" || Array.isArray(slotValue)) {
        throw new HttpRequestError(`slots[${index}] must be an object.`);
      }
      const slot = slotValue as Record<string, unknown>;
      return {
        circuit_assignment: readByte(slot.circuit_assignment, `slots[${index}].circuit_assignment`),
        rpm: readRpmValue(slot.rpm, `slots[${index}].rpm`)
      };
    }),
    primingSpeed: readRpmValue(body.priming_speed, "priming_speed"),
    trailingBytes
  };
}

function readProtocolAnnotation(body: Record<string, unknown>): ProtocolAnnotationInput {
  const bundleId = body.bundle_id;
  const frameIndex = body.frame_index;
  const fieldName = body.field_name;
  const byteStart = body.byte_start;
  const byteEnd = body.byte_end;
  const confidence = body.confidence;
  const label = body.label;
  const notes = body.notes;

  if (typeof bundleId !== "string" || bundleId.length === 0) {
    throw new HttpRequestError("Protocol annotation requires a string bundle_id.");
  }
  if (typeof frameIndex !== "number" || !Number.isInteger(frameIndex) || frameIndex < 0) {
    throw new HttpRequestError("Protocol annotation requires a non-negative integer frame_index.");
  }
  if (typeof fieldName !== "string" || fieldName.trim().length === 0) {
    throw new HttpRequestError("Protocol annotation requires a non-empty string field_name.");
  }
  if (typeof byteStart !== "number" || !Number.isInteger(byteStart) || byteStart < 0) {
    throw new HttpRequestError("Protocol annotation requires a non-negative integer byte_start.");
  }
  if (typeof byteEnd !== "number" || !Number.isInteger(byteEnd) || byteEnd < byteStart) {
    throw new HttpRequestError("Protocol annotation requires byte_end greater than or equal to byte_start.");
  }
  if (confidence !== "known" && confidence !== "inferred" && confidence !== "unknown") {
    throw new HttpRequestError("Protocol annotation confidence must be one of known, inferred, or unknown.");
  }
  if (typeof label !== "string" || label.trim().length === 0) {
    throw new HttpRequestError("Protocol annotation requires a non-empty string label.");
  }
  if (notes != null && typeof notes !== "string") {
    throw new HttpRequestError("Protocol annotation notes must be a string when provided.");
  }

  return {
    bundle_id: bundleId,
    frame_index: frameIndex,
    field_name: fieldName.trim(),
    byte_start: byteStart,
    byte_end: byteEnd,
    confidence,
    label: label.trim(),
    notes: typeof notes === "string" && notes.trim().length > 0 ? notes : null
  };
}

function readProtocolPrompt(body: Record<string, unknown>): ProtocolPromptInput {
  const bundleId = body.bundle_id;
  const frameIndex = body.frame_index;
  const fieldName = body.field_name;
  const prompt = body.prompt;
  const why = body.why;
  const inputType = body.input_type;
  const operatorResponse = body.operator_response;

  if (typeof bundleId !== "string" || bundleId.length === 0) {
    throw new HttpRequestError("Protocol prompt requires a string bundle_id.");
  }
  if (typeof frameIndex !== "number" || !Number.isInteger(frameIndex) || frameIndex < 0) {
    throw new HttpRequestError("Protocol prompt requires a non-negative integer frame_index.");
  }
  if (fieldName != null && (typeof fieldName !== "string" || fieldName.trim().length === 0)) {
    throw new HttpRequestError("Protocol prompt field_name must be a non-empty string when provided.");
  }
  if (typeof prompt !== "string" || prompt.trim().length === 0) {
    throw new HttpRequestError("Protocol prompt requires a non-empty string prompt.");
  }
  if (typeof why !== "string" || why.trim().length === 0) {
    throw new HttpRequestError("Protocol prompt requires a non-empty string why.");
  }
  if (
    inputType !== "controller_menu_state" &&
    inputType !== "equipment_behavior" &&
    inputType !== "circuit_name" &&
    inputType !== "configured_rpm"
  ) {
    throw new HttpRequestError(
      "Protocol prompt input_type must be one of controller_menu_state, equipment_behavior, circuit_name, or configured_rpm."
    );
  }
  if (operatorResponse != null && typeof operatorResponse !== "string") {
    throw new HttpRequestError("Protocol prompt operator_response must be a string when provided.");
  }

  return {
    bundle_id: bundleId,
    frame_index: frameIndex,
    field_name: typeof fieldName === "string" ? fieldName.trim() : null,
    prompt: prompt.trim(),
    why: why.trim(),
    input_type: inputType,
    operator_response:
      typeof operatorResponse === "string" && operatorResponse.trim().length > 0 ? operatorResponse : null
  };
}

function json(req: IncomingMessage, res: ServerResponse, status: number, payload: Record<string, unknown>): void {
  res.writeHead(status, {
    ...corsHeaders(req),
    "content-type": "application/json"
  });
  res.end(JSON.stringify(payload));
}

function text(req: IncomingMessage, res: ServerResponse, status: number, payload: string, contentType: string): void {
  res.writeHead(status, {
    ...corsHeaders(req),
    "content-type": contentType
  });
  res.end(payload);
}

function preflight(res: ServerResponse, req: IncomingMessage): void {
  res.writeHead(204, corsHeaders(req));
  res.end();
}

export function corsHeaders(req: Pick<IncomingMessage, "headers">): Record<string, string> {
  const origin = req.headers.origin;
  return {
    "access-control-allow-origin": typeof origin === "string" && origin.length > 0 ? origin : "*",
    "access-control-allow-methods": "GET,POST,PUT,OPTIONS",
    "access-control-allow-headers": "content-type",
    vary: "Origin"
  };
}
