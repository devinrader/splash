const DEFAULT_SAMPLE_INTERVAL_MS = 10 * 60 * 1000;
const DEFAULT_CONTROLLER_ID = "default";
const DEFAULT_HISTORY_LOOKBACK_MS = 24 * 60 * 60 * 1000;

export type TemperatureSensorType = "air" | "pool_water" | "spa_water" | "solar";
export type TemperatureUnit = "F" | "C";

export interface InfluxTelemetryConfig {
  url: string;
  token: string;
  org: string;
  bucket: string;
}

export interface EasyTouchTemperatureTelemetryEvent {
  occurred_at: string;
  source?: {
    service?: string;
    label?: string;
  };
  controller?: {
    controller_id?: string;
    controller_type?: string;
    timestamp?: {
      hour_24?: number | null;
      minute?: number | null;
    };
  };
  temperatures?: Partial<Record<"air" | "pool_water" | "spa_water" | "solar", Record<string, unknown>>>;
  raw_payload?: number[];
}

export interface TemperatureTelemetryPoint {
  controllerId: string;
  controllerType: string;
  sensorType: TemperatureSensorType;
  body: string;
  source: string;
  service: string;
  originalValue: number;
  originalUnit: TemperatureUnit;
  normalizedF: number;
  normalizedC: number;
  rawByte: number | null;
  rawPayloadJson: string | null;
  packetTimestamp: string;
  controllerTimestamp: string | null;
}

export interface TemperatureLatestReadingView {
  timestamp: string;
  original_value: number;
  original_unit: TemperatureUnit;
  normalized_f: number;
  normalized_c: number;
  raw_byte: number | null;
  controller_timestamp: string | null;
}

export interface TemperatureLatestView {
  controller_id: string;
  status: "available" | "empty";
  message: string;
  last_updated: string | null;
  readings: Partial<Record<TemperatureSensorType, TemperatureLatestReadingView>>;
}

export interface TemperatureHistoryPointView {
  timestamp: string;
  value: number;
  normalizedF: number;
  normalizedC: number;
}

export interface TemperatureHistorySeriesView {
  sensor_type: TemperatureSensorType;
  unit: TemperatureUnit;
  points: TemperatureHistoryPointView[];
}

export interface TemperatureHistoryView {
  controller_id: string;
  range: {
    start: string;
    end: string;
  };
  interval: string | null;
  series: TemperatureHistorySeriesView[];
}

export interface TemperatureHistoryQuery {
  controllerId?: string | null;
  sensorType?: TemperatureSensorType | null;
  start?: string | null;
  end?: string | null;
  interval?: string | null;
}

interface TemperatureHistoryReadQuery {
  controllerId: string;
  sensorType: TemperatureSensorType | null;
  start: string;
  end: string;
  interval: string | null;
}

export interface TemperatureTelemetryRepository {
  isConfigured(): boolean;
  checkHealth(): Promise<{ status: "healthy" | "down"; message: string }>;
  writePoints(points: TemperatureTelemetryPoint[]): Promise<void>;
  getLatest(controllerId: string): Promise<TemperatureLatestView>;
  getHistory(query: TemperatureHistoryReadQuery): Promise<TemperatureHistoryView>;
}

export interface TemperatureTelemetryServiceOptions {
  repository?: TemperatureTelemetryRepository;
  influx?: InfluxTelemetryConfig | null;
  fetchImpl?: typeof fetch;
  sampleIntervalMs?: number;
}

export interface InfluxQueryTransportOptions {
  influx: InfluxTelemetryConfig;
  fetchImpl: typeof fetch;
}

export class TemperatureTelemetryService {
  private readonly repository: TemperatureTelemetryRepository;
  private readonly sampleIntervalMs: number;
  private readonly lastWrittenAt = new Map<string, number>();
  private lastErrorMessage: string | null = null;

  constructor(options: TemperatureTelemetryServiceOptions = {}) {
    this.repository =
      options.repository ??
      new InfluxTemperatureTelemetryRepository(options.influx ?? null, options.fetchImpl ?? fetch);
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

  async observe(event: Record<string, unknown>): Promise<void> {
    if (!this.repository.isConfigured()) {
      return;
    }

    const points = mapTemperatureEvent(event as unknown as EasyTouchTemperatureTelemetryEvent);
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
        this.lastWrittenAt.set(pointKey(point.controllerId, point.sensorType), Date.parse(point.packetTimestamp));
      }
    } catch (error) {
      this.lastErrorMessage = errorMessage(error, "Temperature telemetry write failed.");
    }
  }

  async getLatest(): Promise<TemperatureLatestView> {
    if (!this.repository.isConfigured()) {
      return emptyLatestView("Temperature telemetry persistence is not configured.");
    }
    try {
      const view = await this.repository.getLatest(DEFAULT_CONTROLLER_ID);
      this.lastErrorMessage = null;
      return view;
    } catch (error) {
      this.lastErrorMessage = errorMessage(error, "Temperature telemetry latest query failed.");
      return emptyLatestView(`EasyTouch temperature history is temporarily unavailable: ${this.lastErrorMessage}`);
    }
  }

  async getHistory(query: TemperatureHistoryQuery): Promise<TemperatureHistoryView> {
    const start = query.start ?? new Date(Date.now() - DEFAULT_HISTORY_LOOKBACK_MS).toISOString();
    const end = query.end ?? new Date().toISOString();
    const interval = query.interval ?? "1h";
    const controllerId = query.controllerId ?? DEFAULT_CONTROLLER_ID;

    if (!this.repository.isConfigured()) {
      return {
        controller_id: controllerId,
        range: { start, end },
        interval,
        series: []
      };
    }

    try {
      const view = await this.repository.getHistory({
        controllerId,
        sensorType: query.sensorType ?? null,
        start,
        end,
        interval
      });
      this.lastErrorMessage = null;
      return view;
    } catch (error) {
      this.lastErrorMessage = errorMessage(error, "Temperature telemetry history query failed.");
      return {
        controller_id: controllerId,
        range: { start, end },
        interval,
        series: []
      };
    }
  }

  private shouldWrite(point: TemperatureTelemetryPoint): boolean {
    const key = pointKey(point.controllerId, point.sensorType);
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

class InfluxTemperatureTelemetryRepository implements TemperatureTelemetryRepository {
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

  async writePoints(points: TemperatureTelemetryPoint[]): Promise<void> {
    if (!this.influx || points.length === 0) {
      return;
    }

    const lineProtocol = points.map(formatLineProtocolPoint).join("\n");
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

  async getLatest(controllerId: string): Promise<TemperatureLatestView> {
    if (!this.influx) {
      return emptyLatestView("Temperature telemetry persistence is not configured.");
    }

    const rows = await this.queryRows(buildLatestFluxQuery(this.influx.bucket, controllerId));
    if (rows.length === 0) {
      return emptyLatestView("No EasyTouch temperature history has been captured yet.");
    }

    const readings: Partial<Record<TemperatureSensorType, TemperatureLatestReadingView>> = {};
    let lastUpdated: string | null = null;

    for (const row of rows) {
      const sensorType = readSensorType(row.sensor_type);
      if (!sensorType) {
        continue;
      }
      const timestamp = row._time ?? null;
      if (!timestamp) {
        continue;
      }
      readings[sensorType] = {
        timestamp,
        original_value: readNumber(row.original_value) ?? 0,
        original_unit: readTemperatureUnit(row.original_unit) ?? "F",
        normalized_f: readNumber(row.normalized_f) ?? 0,
        normalized_c: readNumber(row.normalized_c) ?? 0,
        raw_byte: readNumber(row.raw_byte),
        controller_timestamp: row.controller_timestamp ?? null
      };
      if (!lastUpdated || timestamp > lastUpdated) {
        lastUpdated = timestamp;
      }
    }

    if (Object.keys(readings).length === 0) {
      return emptyLatestView("No EasyTouch temperature history has been captured yet.");
    }

    return {
      controller_id: controllerId,
      status: "available",
      message: "EasyTouch temperature history is available.",
      last_updated: lastUpdated,
      readings
    };
  }

  async getHistory(query: TemperatureHistoryReadQuery): Promise<TemperatureHistoryView> {
    if (!this.influx) {
      return {
        controller_id: query.controllerId,
        range: { start: query.start, end: query.end },
        interval: query.interval,
        series: []
      };
    }

    const rows = await this.queryRows(
      buildHistoryFluxQuery(this.influx.bucket, query.controllerId, query.start, query.end, query.interval, query.sensorType)
    );

    const seriesMap = new Map<TemperatureSensorType, TemperatureHistoryPointView[]>();
    const unitMap = new Map<TemperatureSensorType, TemperatureUnit>();

    for (const row of rows) {
      const sensorType = readSensorType(row.sensor_type);
      if (!sensorType) {
        continue;
      }
      const timestamp = row._time ?? null;
      const value = readNumber(row.original_value);
      const normalizedF = readNumber(row.normalized_f);
      const normalizedC = readNumber(row.normalized_c);
      const unit = readTemperatureUnit(row.original_unit) ?? "F";
      if (!timestamp || value == null || normalizedF == null || normalizedC == null) {
        continue;
      }

      const points = seriesMap.get(sensorType) ?? [];
      points.push({
        timestamp,
        value,
        normalizedF,
        normalizedC
      });
      seriesMap.set(sensorType, points);
      unitMap.set(sensorType, unit);
    }

    return {
      controller_id: query.controllerId,
      range: {
        start: query.start,
        end: query.end
      },
      interval: query.interval,
      series: [...seriesMap.entries()].map(([sensorType, points]) => ({
        sensor_type: sensorType,
        unit: unitMap.get(sensorType) ?? "F",
        points
      }))
    };
  }

  private async queryRows(flux: string): Promise<Array<Record<string, string>>> {
    if (!this.influx) {
      return [];
    }

    return queryInfluxRows({
      influx: this.influx,
      fetchImpl: this.fetchImpl,
      flux
    });
  }
}

export async function queryInfluxRows({
  influx,
  fetchImpl,
  flux
}: InfluxQueryTransportOptions & { flux: string }): Promise<Array<Record<string, string>>> {
  const response = await fetchImpl(`${trimTrailingSlash(influx.url)}/api/v2/query?org=${encodeURIComponent(influx.org)}`, {
    method: "POST",
    headers: {
      Authorization: `Token ${influx.token}`,
      "Content-Type": "application/vnd.flux",
      Accept: "application/csv"
    },
    body: flux
  });
  if (!response.ok) {
    const detail = (await response.text()).trim();
    throw new Error(
      detail.length > 0 ? `InfluxDB query failed with HTTP ${response.status}: ${detail}` : `InfluxDB query failed with HTTP ${response.status}.`
    );
  }

  return parseCsv(await response.text());
}

export function mapTemperatureEvent(event: EasyTouchTemperatureTelemetryEvent): TemperatureTelemetryPoint[] {
  const packetTimestamp = typeof event.occurred_at === "string" ? event.occurred_at : null;
  if (!packetTimestamp) {
    return [];
  }

  const controllerId = event.controller?.controller_id ?? DEFAULT_CONTROLLER_ID;
  const controllerType = event.controller?.controller_type ?? "easytouch";
  const source = event.source?.label ?? "easytouch.action2";
  const service = event.source?.service ?? "splash-protocol";
  const controllerTimestamp = formatControllerTimestamp(event.controller?.timestamp);
  const rawPayloadJson = Array.isArray(event.raw_payload) ? JSON.stringify(event.raw_payload) : null;
  const temperatures = event.temperatures ?? {};
  const sensorMappings: Array<[TemperatureSensorType, string]> = [
    ["air", "air"],
    ["pool_water", "poolWater"],
    ["spa_water", "spaWater"],
    ["solar", "solar"]
  ];

  return sensorMappings.flatMap(([sensorType, legacyKey]) => {
    const candidate = temperatures[sensorType] ?? temperatures[legacyKey as keyof typeof temperatures];
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      return [];
    }
    const originalValue = readNumber((candidate as Record<string, unknown>).original_value) ?? readNumber((candidate as Record<string, unknown>).value);
    const originalUnit = readTemperatureUnit((candidate as Record<string, unknown>).original_unit) ?? readTemperatureUnit((candidate as Record<string, unknown>).unit);
    const normalizedF = readNumber((candidate as Record<string, unknown>).normalized_f);
    const normalizedC = readNumber((candidate as Record<string, unknown>).normalized_c);
    if (originalValue == null || !originalUnit || normalizedF == null || normalizedC == null) {
      return [];
    }
    return [
      {
        controllerId,
        controllerType,
        sensorType,
        body: bodyForSensorType(sensorType),
        source,
        service,
        originalValue,
        originalUnit,
        normalizedF,
        normalizedC,
        rawByte: readNumber((candidate as Record<string, unknown>).raw_byte),
        rawPayloadJson,
        packetTimestamp,
        controllerTimestamp
      }
    ];
  });
}

function buildLatestFluxQuery(bucket: string, controllerId: string): string {
  return `
from(bucket: "${escapeFluxString(bucket)}")
  |> range(start: 1970-01-01T00:00:00Z)
  |> filter(fn: (r) => r._measurement == "easy_touch_temperature")
  |> filter(fn: (r) => r.controller_id == "${escapeFluxString(controllerId)}")
  |> filter(fn: (r) => r._field == "original_value" or r._field == "original_unit" or r._field == "normalized_f" or r._field == "normalized_c" or r._field == "raw_byte" or r._field == "controller_timestamp")
  |> pivot(rowKey: ["_time", "sensor_type", "controller_id"], columnKey: ["_field"], valueColumn: "_value")
  |> group(columns: ["sensor_type"])
  |> sort(columns: ["_time"], desc: true)
  |> limit(n: 1)
  |> sort(columns: ["sensor_type"])
`.trim();
}

function buildHistoryFluxQuery(
  bucket: string,
  controllerId: string,
  start: string,
  end: string,
  interval: string | null,
  sensorType: TemperatureSensorType | null
): string {
  const sensorFilter = sensorType
    ? `\n  |> filter(fn: (r) => r.sensor_type == "${escapeFluxString(sensorType)}")`
    : "";
  const aggregate = interval
    ? `\n  |> aggregateWindow(every: ${interval}, fn: last, createEmpty: false)`
    : "";

  return `
from(bucket: "${escapeFluxString(bucket)}")
  |> range(start: time(v: "${escapeFluxString(start)}"), stop: time(v: "${escapeFluxString(end)}"))
  |> filter(fn: (r) => r._measurement == "easy_touch_temperature")
  |> filter(fn: (r) => r.controller_id == "${escapeFluxString(controllerId)}")
  |> filter(fn: (r) => r._field == "original_value" or r._field == "original_unit" or r._field == "normalized_f" or r._field == "normalized_c")
${sensorFilter}${aggregate}
  |> pivot(rowKey: ["_time", "sensor_type", "controller_id"], columnKey: ["_field"], valueColumn: "_value")
  |> sort(columns: ["_time"])
`.trim();
}

function emptyLatestView(message: string): TemperatureLatestView {
  return {
    controller_id: DEFAULT_CONTROLLER_ID,
    status: "empty",
    message,
    last_updated: null,
    readings: {}
  };
}

function pointKey(controllerId: string, sensorType: TemperatureSensorType): string {
  return `${controllerId}:${sensorType}`;
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return fallback;
}

function bodyForSensorType(sensorType: TemperatureSensorType): string {
  switch (sensorType) {
    case "pool_water":
      return "pool";
    case "spa_water":
      return "spa";
    default:
      return sensorType;
  }
}

function formatControllerTimestamp(value: { hour_24?: number | null; minute?: number | null } | undefined): string | null {
  if (!value || typeof value.hour_24 !== "number" || typeof value.minute !== "number") {
    return null;
  }
  return `${String(value.hour_24).padStart(2, "0")}:${String(value.minute).padStart(2, "0")}`;
}

export function formatLineProtocolPoint(point: TemperatureTelemetryPoint): string {
  const tags = [
    `controller_id=${escapeLineProtocolValue(point.controllerId)}`,
    `controller_type=${escapeLineProtocolValue(point.controllerType)}`,
    `sensor_type=${escapeLineProtocolValue(point.sensorType)}`,
    `body=${escapeLineProtocolValue(point.body)}`,
    `source=${escapeLineProtocolValue(point.source)}`,
    `service=${escapeLineProtocolValue(point.service)}`
  ].join(",");

  const fields = [
    `original_value=${point.originalValue}`,
    `original_unit="${escapeLineProtocolString(point.originalUnit)}"`,
    `normalized_f=${point.normalizedF}`,
    `normalized_c=${point.normalizedC}`,
    `raw_byte=${point.rawByte == null ? "0i" : `${Math.trunc(point.rawByte)}i`}`,
    `raw_payload_json="${escapeLineProtocolString(point.rawPayloadJson ?? "")}"`,
    `packet_timestamp="${escapeLineProtocolString(point.packetTimestamp)}"`,
    `controller_timestamp="${escapeLineProtocolString(point.controllerTimestamp ?? "")}"`
  ].join(",");

  return `easy_touch_temperature,${tags} ${fields} ${toInfluxTimestamp(point.packetTimestamp)}`;
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

function parseCsv(input: string): Array<Record<string, string>> {
  const lines = input
    .split(/\r?\n/u)
    .filter((line) => line.length > 0);
  if (lines.length === 0) {
    return [];
  }
  const headers = parseCsvLine(lines[0] ?? "");
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
  });
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === "\"") {
      if (inQuotes && line[index + 1] === "\"") {
        current += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (character === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }
    current += character;
  }

  values.push(current);
  return values;
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

function readSensorType(value: unknown): TemperatureSensorType | null {
  return value === "air" || value === "pool_water" || value === "spa_water" || value === "solar" ? value : null;
}

function readTemperatureUnit(value: unknown): TemperatureUnit | null {
  return value === "F" || value === "C" ? value : null;
}

export function normalizeTemperature(value: number, unit: TemperatureUnit): { normalizedF: number; normalizedC: number } {
  if (unit === "F") {
    return {
      normalizedF: roundTemperature(value),
      normalizedC: roundTemperature((value - 32) * (5 / 9))
    };
  }
  return {
    normalizedF: roundTemperature((value * 9) / 5 + 32),
    normalizedC: roundTemperature(value)
  };
}

function roundTemperature(value: number): number {
  return Math.round(value * 10) / 10;
}
