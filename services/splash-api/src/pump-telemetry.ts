import type { InfluxTelemetryConfig } from "./temperature-telemetry.js";
import { queryInfluxRows } from "./temperature-telemetry.js";

const DEFAULT_SAMPLE_INTERVAL_MS = 60 * 1000;
const DEFAULT_HISTORY_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const DEFAULT_CONTROLLER_ID = "default";
const CIRCULATION_WINDOWS = ["24h", "72h", "7d"] as const;
const MAX_CIRCULATION_GAP_MS = 5 * 60 * 1000;
const AVAILABLE_COVERAGE_PERCENT = 80;
const PARTIAL_COVERAGE_PERCENT = 20;

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

export type CirculationSummaryWindow = (typeof CIRCULATION_WINDOWS)[number];
export type CirculationSummaryStatus = "available" | "partial" | "insufficient_data";

export interface PumpCirculationSummaryItemView {
  window: CirculationSummaryWindow;
  runtime_minutes: number;
  runtime_percent: number;
  sample_coverage_percent: number;
  last_running_at: string | null;
  status: CirculationSummaryStatus;
}

export interface PumpCirculationSummaryView {
  generated_at: string;
  pump_id: string | null;
  summaries: PumpCirculationSummaryItemView[];
}

export interface PumpCirculationSummaryQuery {
  pumpId?: string | null;
  window?: string | null;
  now?: string | null;
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

  async getCirculationSummary(query: PumpCirculationSummaryQuery): Promise<PumpCirculationSummaryView> {
    const now = query.now ?? new Date().toISOString();
    const requestedWindows = normalizeCirculationWindows(query.window);
    const lookbackMs = Math.max(...requestedWindows.map(windowLookbackMs));
    const start = new Date(Date.parse(now) - lookbackMs).toISOString();

    const history = await this.getHistory({
      pumpId: query.pumpId ?? null,
      start,
      end: now,
      interval: null
    });

    return buildCirculationSummaryView({
      pumpId: query.pumpId ?? null,
      generatedAt: now,
      windows: requestedWindows,
      history
    });
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

export function buildCirculationSummaryView(input: {
  pumpId: string | null;
  generatedAt: string;
  windows: readonly CirculationSummaryWindow[];
  history: PumpHistoryView;
}): PumpCirculationSummaryView {
  const generatedAtMs = Date.parse(input.generatedAt);
  const series = input.pumpId
    ? input.history.series.filter((entry) => entry.pump_id === input.pumpId)
    : input.history.series;

  return {
    generated_at: input.generatedAt,
    pump_id: input.pumpId ?? null,
    summaries: input.windows.map((window) => summarizeCirculationWindow(series, generatedAtMs, window))
  };
}

function summarizeCirculationWindow(
  series: PumpHistorySeriesView[],
  generatedAtMs: number,
  window: CirculationSummaryWindow
): PumpCirculationSummaryItemView {
  const windowMs = windowLookbackMs(window);
  const windowStartMs = generatedAtMs - windowMs;
  let runtimeMs = 0;
  let coverageMs = 0;
  let lastRunningAt: string | null = null;

  for (const entry of series) {
    const points = entry.points
      .map((point) => ({ ...point, timestampMs: Date.parse(point.timestamp) }))
      .filter((point) => Number.isFinite(point.timestampMs) && point.timestampMs >= windowStartMs && point.timestampMs <= generatedAtMs)
      .sort((left, right) => left.timestampMs - right.timestampMs);

    for (let index = 0; index < points.length - 1; index += 1) {
      const current = points[index];
      const next = points[index + 1];
      if (!current || !next) {
        continue;
      }
      const deltaMs = next.timestampMs - current.timestampMs;
      if (!Number.isFinite(deltaMs) || deltaMs <= 0) {
        continue;
      }
      const effectiveMs = Math.min(deltaMs, MAX_CIRCULATION_GAP_MS);
      coverageMs += effectiveMs;
      if (current.running || current.rpm > 0) {
        runtimeMs += effectiveMs;
        lastRunningAt = latestIsoTimestamp(lastRunningAt, current.timestamp);
      }
    }

    const finalPoint = points.at(-1);
    if (finalPoint && (finalPoint.running || finalPoint.rpm > 0)) {
      lastRunningAt = latestIsoTimestamp(lastRunningAt, finalPoint.timestamp);
    }
  }

  const runtimeMinutes = roundToSingleDecimal(runtimeMs / (60 * 1000));
  const runtimePercent = roundToSingleDecimal((runtimeMs / windowMs) * 100);
  const coveragePercent = roundToSingleDecimal(Math.min(100, (coverageMs / windowMs) * 100));

  return {
    window,
    runtime_minutes: runtimeMinutes,
    runtime_percent: runtimePercent,
    sample_coverage_percent: coveragePercent,
    last_running_at: lastRunningAt,
    status: circulationStatus(coveragePercent)
  };
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

function normalizeCirculationWindows(value: string | null | undefined): CirculationSummaryWindow[] {
  if (!value) {
    return [...CIRCULATION_WINDOWS];
  }
  return isCirculationWindow(value) ? [value] : [...CIRCULATION_WINDOWS];
}

function isCirculationWindow(value: string): value is CirculationSummaryWindow {
  return (CIRCULATION_WINDOWS as readonly string[]).includes(value);
}

function windowLookbackMs(window: CirculationSummaryWindow): number {
  switch (window) {
    case "24h":
      return 24 * 60 * 60 * 1000;
    case "72h":
      return 72 * 60 * 60 * 1000;
    case "7d":
      return 7 * 24 * 60 * 60 * 1000;
  }
}

function circulationStatus(coveragePercent: number): CirculationSummaryStatus {
  if (coveragePercent >= AVAILABLE_COVERAGE_PERCENT) {
    return "available";
  }
  if (coveragePercent >= PARTIAL_COVERAGE_PERCENT) {
    return "partial";
  }
  return "insufficient_data";
}

function roundToSingleDecimal(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.round(value * 10) / 10;
}

function latestIsoTimestamp(current: string | null, next: string): string {
  if (!current) {
    return next;
  }
  return next > current ? next : current;
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
