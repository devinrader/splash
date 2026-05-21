import type { InfluxTelemetryConfig } from "./temperature-telemetry.js";
import { queryInfluxRows } from "./temperature-telemetry.js";

const DEFAULT_SAMPLE_INTERVAL_MS = 60 * 1000;
const DEFAULT_HISTORY_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const DEFAULT_CONTROLLER_ID = "default";

export interface EasyTouchPumpTelemetryEvent {
  occurred_at: string;
  source?: {
    service?: string;
    label?: string;
  };
  pump?: {
    pump_id?: string;
    controller_id?: string;
    controller_type?: string;
    bus_address?: string | null;
  };
  metrics?: {
    running?: boolean | null;
    rpm?: number | null;
    watts?: number | null;
  };
}

export interface PumpTelemetryPoint {
  pumpId: string;
  controllerId: string;
  controllerType: string;
  busAddress: string;
  source: string;
  service: string;
  running: boolean;
  rpm: number;
  watts: number;
  packetTimestamp: string;
}

export interface PumpLatestReadingView {
  pump_id: string;
  controller_id: string;
  controller_type: string;
  bus_address: string;
  timestamp: string;
  running: boolean;
  rpm: number;
  watts: number;
}

export interface PumpLatestView {
  status: "available" | "empty";
  message: string;
  last_updated: string | null;
  pumps: PumpLatestReadingView[];
}

export interface PumpHistoryPointView {
  timestamp: string;
  running: boolean;
  rpm: number;
  watts: number;
}

export interface PumpHistorySeriesView {
  pump_id: string;
  controller_id: string;
  controller_type: string;
  bus_address: string;
  points: PumpHistoryPointView[];
}

export interface PumpHistoryView {
  range: {
    start: string;
    end: string;
  };
  interval: string | null;
  series: PumpHistorySeriesView[];
}

export interface PumpHistoryQuery {
  pumpId?: string | null;
  start?: string | null;
  end?: string | null;
  interval?: string | null;
}

interface PumpHistoryReadQuery {
  pumpId: string | null;
  start: string;
  end: string;
  interval: string | null;
}

export interface PumpTelemetryRepository {
  isConfigured(): boolean;
  checkHealth(): Promise<{ status: "healthy" | "down"; message: string }>;
  writePoints(points: PumpTelemetryPoint[]): Promise<void>;
  getLatest(pumpId: string | null): Promise<PumpLatestView>;
  getHistory(query: PumpHistoryReadQuery): Promise<PumpHistoryView>;
}

export interface PumpTelemetryServiceOptions {
  repository?: PumpTelemetryRepository;
  influx?: InfluxTelemetryConfig | null;
  fetchImpl?: typeof fetch;
  sampleIntervalMs?: number;
}

export class PumpTelemetryService {
  private readonly repository: PumpTelemetryRepository;
  private readonly sampleIntervalMs: number;
  private readonly lastWrittenAt = new Map<string, number>();
  private lastErrorMessage: string | null = null;

  constructor(options: PumpTelemetryServiceOptions = {}) {
    this.repository =
      options.repository ??
      new InfluxPumpTelemetryRepository(options.influx ?? null, options.fetchImpl ?? fetch);
    this.sampleIntervalMs = options.sampleIntervalMs ?? DEFAULT_SAMPLE_INTERVAL_MS;
  }

  isConfigured(): boolean {
    return this.repository.isConfigured();
  }

  async checkHealth(): Promise<{ status: "healthy" | "down"; message: string }> {
    if (!this.repository.isConfigured()) {
      return {
        status: "healthy",
        message: "Telemetry persistence is not configured"
      };
    }
    if (this.lastErrorMessage) {
      return {
        status: "down",
        message: this.lastErrorMessage
      };
    }
    return this.repository.checkHealth();
  }

  async observe(event: EasyTouchPumpTelemetryEvent): Promise<void> {
    if (!this.repository.isConfigured()) {
      return;
    }

    const points = mapPumpTelemetryEvent(event);
    if (points.length === 0) {
      return;
    }

    const eligible = points.filter((point) => this.shouldWrite(point));
    if (eligible.length === 0) {
      return;
    }

    try {
      await this.repository.writePoints(eligible);
      this.lastErrorMessage = null;
      for (const point of eligible) {
        this.lastWrittenAt.set(pointKey(point.pumpId), Date.parse(point.packetTimestamp));
      }
    } catch (error) {
      this.lastErrorMessage = errorMessage(error, "Pump telemetry write failed.");
    }
  }

  async getLatest(pumpId: string | null = null): Promise<PumpLatestView> {
    if (!this.repository.isConfigured()) {
      return emptyLatestView("Pump telemetry persistence is not configured.");
    }
    try {
      const view = await this.repository.getLatest(pumpId);
      this.lastErrorMessage = null;
      return view;
    } catch (error) {
      this.lastErrorMessage = errorMessage(error, "Pump telemetry latest query failed.");
      return emptyLatestView(`EasyTouch pump telemetry is temporarily unavailable: ${this.lastErrorMessage}`);
    }
  }

  async getHistory(query: PumpHistoryQuery): Promise<PumpHistoryView> {
    const start = query.start ?? new Date(Date.now() - DEFAULT_HISTORY_LOOKBACK_MS).toISOString();
    const end = query.end ?? new Date().toISOString();
    const interval = query.interval ?? "5m";

    if (!this.repository.isConfigured()) {
      return {
        range: { start, end },
        interval,
        series: []
      };
    }

    try {
      const view = await this.repository.getHistory({
        pumpId: query.pumpId ?? null,
        start,
        end,
        interval
      });
      this.lastErrorMessage = null;
      return view;
    } catch (error) {
      this.lastErrorMessage = errorMessage(error, "Pump telemetry history query failed.");
      return {
        range: { start, end },
        interval,
        series: []
      };
    }
  }

  private shouldWrite(point: PumpTelemetryPoint): boolean {
    const key = pointKey(point.pumpId);
    const packetMs = Date.parse(point.packetTimestamp);
    const lastWrittenMs = this.lastWrittenAt.get(key);
    if (lastWrittenMs == null) {
      return true;
    }
    if (!Number.isFinite(packetMs)) {
      return false;
    }
    return packetMs - lastWrittenMs >= this.sampleIntervalMs;
  }
}

class InfluxPumpTelemetryRepository implements PumpTelemetryRepository {
  constructor(
    private readonly influx: InfluxTelemetryConfig | null,
    private readonly fetchImpl: typeof fetch
  ) {}

  isConfigured(): boolean {
    return this.influx !== null;
  }

  async checkHealth(): Promise<{ status: "healthy" | "down"; message: string }> {
    if (!this.influx) {
      return {
        status: "healthy",
        message: "Telemetry persistence is not configured"
      };
    }

    const response = await this.fetchImpl(`${trimTrailingSlash(this.influx.url)}/health`, {
      headers: {
        Authorization: `Token ${this.influx.token}`
      }
    });
    if (!response.ok) {
      return {
        status: "down",
        message: `InfluxDB health returned HTTP ${response.status}`
      };
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const status = typeof payload.status === "string" ? payload.status.toLowerCase() : "pass";
    return {
      status: status === "pass" ? "healthy" : "down",
      message: status === "pass" ? "InfluxDB health endpoint responded" : `InfluxDB health is ${status}`
    };
  }

  async writePoints(points: PumpTelemetryPoint[]): Promise<void> {
    if (!this.influx || points.length === 0) {
      return;
    }

    const lineProtocol = points.map(formatPumpLineProtocolPoint).join("\n");
    const response = await this.fetchImpl(
      `${trimTrailingSlash(this.influx.url)}/api/v2/write?org=${encodeURIComponent(this.influx.org)}&bucket=${encodeURIComponent(this.influx.bucket)}&precision=ns`,
      {
        method: "POST",
        headers: {
          Authorization: `Token ${this.influx.token}`,
          "Content-Type": "text/plain; charset=utf-8"
        },
        body: lineProtocol
      }
    );

    if (!response.ok) {
      throw new Error(`InfluxDB write failed with HTTP ${response.status}.`);
    }
  }

  async getLatest(pumpId: string | null): Promise<PumpLatestView> {
    if (!this.influx) {
      return emptyLatestView("Pump telemetry persistence is not configured.");
    }

    const rows = await queryInfluxRows({
      influx: this.influx,
      fetchImpl: this.fetchImpl,
      flux: buildLatestFluxQuery(this.influx.bucket, pumpId)
    });

    if (rows.length === 0) {
      return emptyLatestView("No EasyTouch pump telemetry has been captured yet.");
    }

    const pumps = rows
      .map((row) => {
        const timestamp = row._time ?? null;
        const pump = readPumpLatest(row, timestamp);
        return pump;
      })
      .filter((pump): pump is PumpLatestReadingView => pump !== null);

    if (pumps.length === 0) {
      return emptyLatestView("No EasyTouch pump telemetry has been captured yet.");
    }

    return {
      status: "available",
      message: "EasyTouch pump telemetry is available.",
      last_updated: pumps.reduce<string | null>((latest, pump) => (!latest || pump.timestamp > latest ? pump.timestamp : latest), null),
      pumps
    };
  }

  async getHistory(query: PumpHistoryReadQuery): Promise<PumpHistoryView> {
    if (!this.influx) {
      return {
        range: { start: query.start, end: query.end },
        interval: query.interval,
        series: []
      };
    }

    const rows = await queryInfluxRows({
      influx: this.influx,
      fetchImpl: this.fetchImpl,
      flux: buildHistoryFluxQuery(this.influx.bucket, query)
    });

    const seriesMap = new Map<string, PumpHistorySeriesView>();
    for (const row of rows) {
      const pumpId = row.pump_id ?? null;
      const timestamp = row._time ?? null;
      const rpm = readNumber(row.rpm);
      const watts = readNumber(row.watts);
      const running = readBoolean(row.running);
      if (!pumpId || !timestamp || rpm == null || watts == null || running == null) {
        continue;
      }
      const existing =
        seriesMap.get(pumpId) ??
        {
          pump_id: pumpId,
          controller_id: row.controller_id ?? DEFAULT_CONTROLLER_ID,
          controller_type: row.controller_type ?? "easytouch",
          bus_address: row.bus_address ?? "unknown",
          points: []
        };
      existing.points.push({
        timestamp,
        running,
        rpm,
        watts
      });
      seriesMap.set(pumpId, existing);
    }

    return {
      range: { start: query.start, end: query.end },
      interval: query.interval,
      series: [...seriesMap.values()]
    };
  }
}

export function mapPumpTelemetryEvent(event: EasyTouchPumpTelemetryEvent): PumpTelemetryPoint[] {
  const packetTimestamp = typeof event.occurred_at === "string" ? event.occurred_at : null;
  const pumpId = event.pump?.pump_id ?? null;
  const busAddress = event.pump?.bus_address ?? null;
  const running = event.metrics?.running;
  const rpm = event.metrics?.rpm;
  const watts = event.metrics?.watts;

  if (!packetTimestamp || !pumpId || !busAddress || typeof running !== "boolean" || !Number.isFinite(rpm) || !Number.isFinite(watts)) {
    return [];
  }

  return [
    {
      pumpId,
      controllerId: event.pump?.controller_id ?? DEFAULT_CONTROLLER_ID,
      controllerType: event.pump?.controller_type ?? "easytouch",
      busAddress,
      source: event.source?.label ?? "easytouch.action7",
      service: event.source?.service ?? "splash-api",
      running,
      rpm: Number(rpm),
      watts: Number(watts),
      packetTimestamp
    }
  ];
}

export function formatPumpLineProtocolPoint(point: PumpTelemetryPoint): string {
  const tags = [
    `pump_id=${escapeLineProtocolValue(point.pumpId)}`,
    `controller_id=${escapeLineProtocolValue(point.controllerId)}`,
    `controller_type=${escapeLineProtocolValue(point.controllerType)}`,
    `bus_address=${escapeLineProtocolValue(point.busAddress)}`,
    `source=${escapeLineProtocolValue(point.source)}`,
    `service=${escapeLineProtocolValue(point.service)}`
  ].join(",");

  const fields = [
    `running=${point.running ? "true" : "false"}`,
    `rpm=${Math.trunc(point.rpm)}i`,
    `watts=${Math.trunc(point.watts)}i`,
    `packet_timestamp="${escapeLineProtocolString(point.packetTimestamp)}"`
  ].join(",");

  return `easy_touch_pump,${tags} ${fields} ${toInfluxTimestamp(point.packetTimestamp)}`;
}

function buildLatestFluxQuery(bucket: string, pumpId: string | null): string {
  const pumpFilter = pumpId ? `\n  |> filter(fn: (r) => r.pump_id == "${escapeFluxString(pumpId)}")` : "";
  return `
from(bucket: "${escapeFluxString(bucket)}")
  |> range(start: 1970-01-01T00:00:00Z)
  |> filter(fn: (r) => r._measurement == "easy_touch_pump")
  |> filter(fn: (r) => r._field == "running" or r._field == "rpm" or r._field == "watts")
${pumpFilter}
  |> pivot(rowKey: ["_time", "pump_id", "controller_id", "controller_type", "bus_address"], columnKey: ["_field"], valueColumn: "_value")
  |> group(columns: ["pump_id"])
  |> sort(columns: ["_time"], desc: true)
  |> limit(n: 1)
  |> sort(columns: ["pump_id"])
`.trim();
}

function buildHistoryFluxQuery(bucket: string, query: PumpHistoryReadQuery): string {
  const pumpFilter = query.pumpId ? `\n  |> filter(fn: (r) => r.pump_id == "${escapeFluxString(query.pumpId)}")` : "";
  const aggregate = query.interval
    ? `\n  |> aggregateWindow(every: ${query.interval}, fn: last, createEmpty: false)`
    : "";
  return `
from(bucket: "${escapeFluxString(bucket)}")
  |> range(start: time(v: "${escapeFluxString(query.start)}"), stop: time(v: "${escapeFluxString(query.end)}"))
  |> filter(fn: (r) => r._measurement == "easy_touch_pump")
  |> filter(fn: (r) => r._field == "running" or r._field == "rpm" or r._field == "watts")
${pumpFilter}${aggregate}
  |> pivot(rowKey: ["_time", "pump_id", "controller_id", "controller_type", "bus_address"], columnKey: ["_field"], valueColumn: "_value")
  |> sort(columns: ["_time"])
`.trim();
}

function readPumpLatest(row: Record<string, string>, timestamp: string | null): PumpLatestReadingView | null {
  const running = readBoolean(row.running);
  const rpm = readNumber(row.rpm);
  const watts = readNumber(row.watts);
  if (!timestamp || !row.pump_id || running == null || rpm == null || watts == null) {
    return null;
  }
  return {
    pump_id: row.pump_id,
    controller_id: row.controller_id ?? DEFAULT_CONTROLLER_ID,
    controller_type: row.controller_type ?? "easytouch",
    bus_address: row.bus_address ?? "unknown",
    timestamp,
    running,
    rpm,
    watts
  };
}

function emptyLatestView(message: string): PumpLatestView {
  return {
    status: "empty",
    message,
    last_updated: null,
    pumps: []
  };
}

function pointKey(pumpId: string): string {
  return pumpId;
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return fallback;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    if (value === "true") {
      return true;
    }
    if (value === "false") {
      return false;
    }
  }
  return null;
}

function toInfluxTimestamp(value: string): string {
  const millis = Date.parse(value);
  if (!Number.isFinite(millis)) {
    return "0";
  }
  return `${BigInt(millis) * 1000000n}`;
}

function escapeLineProtocolValue(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll(",", "\\,").replaceAll(" ", "\\ ").replaceAll("=", "\\=");
}

function escapeLineProtocolString(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"");
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function escapeFluxString(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"");
}
