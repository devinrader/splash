import { randomUUID } from "node:crypto";
import type { SqliteDatabase } from "./database.js";

export type ChemistryReadingSource = "manual" | "sensor";
export type ChemistryHistoryInterval = "raw" | "1d";
export type ChemistryHistoryMetric =
  | "ph"
  | "free_chlorine"
  | "total_chlorine"
  | "total_alkalinity"
  | "calcium_hardness"
  | "cyanuric_acid";

export interface ChemistryReadingRecord {
  id: string;
  pool_id: string;
  ph: number | null;
  free_chlorine: number | null;
  total_chlorine: number | null;
  total_alkalinity: number | null;
  calcium_hardness: number | null;
  cyanuric_acid: number | null;
  source: ChemistryReadingSource;
  recorded_at: string;
  created_at: string;
}

export interface ChemistryHistoryPoint {
  recorded_at: string;
  value: number;
}

export interface ChemistryHistorySeries {
  metric: ChemistryHistoryMetric;
  points: ChemistryHistoryPoint[];
}

export interface ChemistryHistoryView {
  start: string;
  end: string;
  interval: ChemistryHistoryInterval;
  readings: ChemistryReadingRecord[];
  series: ChemistryHistorySeries[];
}

export interface ChemistryReadingCreateResult {
  reading: ChemistryReadingRecord;
  warnings: string[];
}

export interface ChemistryReadingCreateInput {
  ph?: number | null;
  free_chlorine?: number | null;
  total_chlorine?: number | null;
  total_alkalinity?: number | null;
  calcium_hardness?: number | null;
  cyanuric_acid?: number | null;
  source?: ChemistryReadingSource;
}

export interface ChemistryHistoryQueryInput {
  start: string | null;
  end: string | null;
  interval: string | null;
}

interface ValidatedChemistryReadingCreateInput {
  ph: number | null;
  free_chlorine: number | null;
  total_chlorine: number | null;
  total_alkalinity: number | null;
  calcium_hardness: number | null;
  cyanuric_acid: number | null;
  source: ChemistryReadingSource;
  recorded_at: string;
}

interface ValidatedChemistryHistoryQuery {
  start: string;
  end: string;
  interval: ChemistryHistoryInterval;
}

interface ChemistryReadingStoredRecord {
  poolId: string;
  ph: number | null;
  freeChlorine: number | null;
  totalChlorine: number | null;
  totalAlkalinity: number | null;
  calciumHardness: number | null;
  cyanuricAcid: number | null;
  source: ChemistryReadingSource;
  recordedAt: string;
}

interface AggregatedChemistryRow {
  [key: string]: unknown;
  bucket_date: string;
  ph: number | null;
  free_chlorine: number | null;
  total_chlorine: number | null;
  total_alkalinity: number | null;
  calcium_hardness: number | null;
  cyanuric_acid: number | null;
}

export interface ChemistryReadingsRepository {
  getLatest(poolId: string): Promise<ChemistryReadingRecord | null>;
  create(record: ChemistryReadingStoredRecord): Promise<ChemistryReadingRecord>;
  listRecent(poolId: string, limit: number): Promise<ChemistryReadingRecord[]>;
  listRaw(poolId: string, start: string, end: string): Promise<ChemistryReadingRecord[]>;
  listDailyAverage(poolId: string, start: string, end: string): Promise<AggregatedChemistryRow[]>;
}

export class ChemistryReadingsValidationError extends Error {
  constructor(
    message: string,
    readonly details: Record<string, string>
  ) {
    super(message);
    this.name = "ChemistryReadingsValidationError";
  }
}

export class ChemistryReadingsUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChemistryReadingsUnavailableError";
  }
}

export class ChemistryReadingsService {
  constructor(
    private readonly poolId: string,
    private readonly repository: ChemistryReadingsRepository | null
  ) {}

  async getLatestChemistryReading(): Promise<ChemistryReadingRecord | null> {
    return this.requireRepository().getLatest(this.poolId);
  }

  async getChemistryHistory(input: ChemistryHistoryQueryInput): Promise<ChemistryHistoryView> {
    const repository = this.requireRepository();
    const query = validateChemistryHistoryQueryInput(input);
    if (query.interval === "raw") {
      const readings = await repository.listRaw(this.poolId, query.start, query.end);
      return {
        start: query.start,
        end: query.end,
        interval: query.interval,
        readings,
        series: buildSeriesFromReadings(readings)
      };
    }

    const readings = await repository.listRaw(this.poolId, query.start, query.end);
    const rows = await repository.listDailyAverage(this.poolId, query.start, query.end);
    return {
      start: query.start,
      end: query.end,
      interval: query.interval,
      readings,
      series: buildSeriesFromAggregateRows(rows)
    };
  }

  async getRecentChemistryReadings(limit = 200): Promise<ChemistryReadingRecord[]> {
    return this.requireRepository().listRecent(this.poolId, limit);
  }

  async createChemistryReading(input: unknown): Promise<ChemistryReadingCreateResult> {
    const repository = this.requireRepository();
    const validated = validateChemistryReadingCreateInput(input);
    const reading = await repository.create({
      poolId: this.poolId,
      ph: validated.ph,
      freeChlorine: validated.free_chlorine,
      totalChlorine: validated.total_chlorine,
      totalAlkalinity: validated.total_alkalinity,
      calciumHardness: validated.calcium_hardness,
      cyanuricAcid: validated.cyanuric_acid,
      source: validated.source,
      recordedAt: validated.recorded_at
    });

    const warnings =
      validated.ph === null && validated.free_chlorine === null
        ? ["Manual reading omitted both pH and Free Chlorine."]
        : [];

    return {
      reading,
      warnings
    };
  }

  private requireRepository(): ChemistryReadingsRepository {
    if (!this.repository) {
      throw new ChemistryReadingsUnavailableError("SQLite-backed chemistry readings are not configured.");
    }
    return this.repository;
  }
}

export class SqliteChemistryReadingsRepository implements ChemistryReadingsRepository {
  constructor(private readonly database: SqliteDatabase) {}

  async getLatest(poolId: string): Promise<ChemistryReadingRecord | null> {
    const row = this.database.get<ChemistryReadingRow>(
      `
        SELECT
          id,
          pool_id,
          ph,
          free_chlorine,
          total_chlorine,
          total_alkalinity,
          calcium_hardness,
          cyanuric_acid,
          source,
          recorded_at,
          created_at
        FROM chemistry_readings
        WHERE pool_id = ?
        ORDER BY recorded_at DESC, created_at DESC
        LIMIT 1
      `,
      [poolId]
    );

    return row ? mapChemistryReadingRow(row) : null;
  }

  async create(record: ChemistryReadingStoredRecord): Promise<ChemistryReadingRecord> {
    const createdAt = new Date().toISOString();
    const id = randomUUID();
    this.database.run(
      `
        INSERT INTO chemistry_readings (
          id,
          pool_id,
          ph,
          free_chlorine,
          total_chlorine,
          total_alkalinity,
          calcium_hardness,
          cyanuric_acid,
          source,
          recorded_at,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        id,
        record.poolId,
        record.ph,
        record.freeChlorine,
        record.totalChlorine,
        record.totalAlkalinity,
        record.calciumHardness,
        record.cyanuricAcid,
        record.source,
        record.recordedAt,
        createdAt
      ]
    );

    return {
      id,
      pool_id: record.poolId,
      ph: record.ph,
      free_chlorine: record.freeChlorine,
      total_chlorine: record.totalChlorine,
      total_alkalinity: record.totalAlkalinity,
      calcium_hardness: record.calciumHardness,
      cyanuric_acid: record.cyanuricAcid,
      source: record.source,
      recorded_at: record.recordedAt,
      created_at: createdAt
    };
  }

  async listRecent(poolId: string, limit: number): Promise<ChemistryReadingRecord[]> {
    return this.database.all<ChemistryReadingRow>(
      `
        SELECT
          id,
          pool_id,
          ph,
          free_chlorine,
          total_chlorine,
          total_alkalinity,
          calcium_hardness,
          cyanuric_acid,
          source,
          recorded_at,
          created_at
        FROM chemistry_readings
        WHERE pool_id = ?
        ORDER BY recorded_at DESC, created_at DESC
        LIMIT ?
      `,
      [poolId, limit]
    ).map(mapChemistryReadingRow);
  }

  async listRaw(poolId: string, start: string, end: string): Promise<ChemistryReadingRecord[]> {
    return this.database.all<ChemistryReadingRow>(
      `
        SELECT
          id,
          pool_id,
          ph,
          free_chlorine,
          total_chlorine,
          total_alkalinity,
          calcium_hardness,
          cyanuric_acid,
          source,
          recorded_at,
          created_at
        FROM chemistry_readings
        WHERE pool_id = ?
          AND recorded_at >= ?
          AND recorded_at <= ?
        ORDER BY recorded_at ASC, created_at ASC
      `,
      [poolId, start, end]
    ).map(mapChemistryReadingRow);
  }

  async listDailyAverage(poolId: string, start: string, end: string): Promise<AggregatedChemistryRow[]> {
    return this.database.all<AggregatedChemistryRow>(
      `
        SELECT
          date(recorded_at) AS bucket_date,
          AVG(ph) AS ph,
          AVG(free_chlorine) AS free_chlorine,
          AVG(total_chlorine) AS total_chlorine,
          AVG(total_alkalinity) AS total_alkalinity,
          AVG(calcium_hardness) AS calcium_hardness,
          AVG(cyanuric_acid) AS cyanuric_acid
        FROM chemistry_readings
        WHERE pool_id = ?
          AND recorded_at >= ?
          AND recorded_at <= ?
        GROUP BY date(recorded_at)
        ORDER BY bucket_date ASC
      `,
      [poolId, start, end]
    );
  }
}

interface ChemistryReadingRow {
  [key: string]: unknown;
  id: string;
  pool_id: string;
  ph: number | null;
  free_chlorine: number | null;
  total_chlorine: number | null;
  total_alkalinity: number | null;
  calcium_hardness: number | null;
  cyanuric_acid: number | null;
  source: ChemistryReadingSource;
  recorded_at: string;
  created_at: string;
}

function mapChemistryReadingRow(row: ChemistryReadingRow): ChemistryReadingRecord {
  return {
    id: row.id,
    pool_id: row.pool_id,
    ph: normalizeNullableNumber(row.ph),
    free_chlorine: normalizeNullableNumber(row.free_chlorine),
    total_chlorine: normalizeNullableNumber(row.total_chlorine),
    total_alkalinity: normalizeNullableNumber(row.total_alkalinity),
    calcium_hardness: normalizeNullableNumber(row.calcium_hardness),
    cyanuric_acid: normalizeNullableNumber(row.cyanuric_acid),
    source: row.source,
    recorded_at: row.recorded_at,
    created_at: row.created_at
  };
}

function buildSeriesFromReadings(readings: ChemistryReadingRecord[]): ChemistryHistorySeries[] {
  return HISTORY_METRICS.map((metric) => ({
    metric,
    points: readings
      .flatMap((reading) => {
        const value = reading[metric];
        return typeof value === "number" ? [{ recorded_at: reading.recorded_at, value }] : [];
      })
  }));
}

function buildSeriesFromAggregateRows(rows: AggregatedChemistryRow[]): ChemistryHistorySeries[] {
  return HISTORY_METRICS.map((metric) => ({
    metric,
    points: rows
      .flatMap((row) => {
        const value = row[metric];
        return typeof value === "number" ? [{ recorded_at: `${row.bucket_date}T00:00:00.000Z`, value }] : [];
      })
  }));
}

const HISTORY_METRICS: ChemistryHistoryMetric[] = [
  "ph",
  "free_chlorine",
  "total_chlorine",
  "total_alkalinity",
  "calcium_hardness",
  "cyanuric_acid"
];

const READING_NUMERIC_FIELDS = [
  "ph",
  "free_chlorine",
  "total_chlorine",
  "total_alkalinity",
  "calcium_hardness",
  "cyanuric_acid"
] as const;

function validateChemistryReadingCreateInput(input: unknown): ValidatedChemistryReadingCreateInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ChemistryReadingsValidationError("Chemistry reading is invalid.", {
      body: "Request body must be a JSON object."
    });
  }

  const record = input as Record<string, unknown>;
  const details: Record<string, string> = {};
  const values = Object.fromEntries(
    READING_NUMERIC_FIELDS.map((field) => [field, readOptionalNumber(record, field, details)])
  ) as Record<(typeof READING_NUMERIC_FIELDS)[number], number | null>;

  const hasAnyValue = READING_NUMERIC_FIELDS.some((field) => values[field] !== null);
  if (!hasAnyValue) {
    details.reading = "At least one manual chemistry field must be provided.";
  }

  const source = record.source;
  if (source !== undefined && source !== "manual") {
    details.source = "Only manual chemistry readings are accepted in the first slice.";
  }

  if (Object.keys(details).length > 0) {
    throw new ChemistryReadingsValidationError("Chemistry reading is invalid.", details);
  }

  return {
    ph: values.ph,
    free_chlorine: values.free_chlorine,
    total_chlorine: values.total_chlorine,
    total_alkalinity: values.total_alkalinity,
    calcium_hardness: values.calcium_hardness,
    cyanuric_acid: values.cyanuric_acid,
    source: "manual",
    recorded_at: new Date().toISOString()
  };
}

function validateChemistryHistoryQueryInput(input: ChemistryHistoryQueryInput): ValidatedChemistryHistoryQuery {
  const details: Record<string, string> = {};
  const end = normalizeDateInput(input.end, "end", details) ?? new Date();
  const start = normalizeDateInput(input.start, "start", details) ?? new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

  if (start.getTime() > end.getTime()) {
    details.range = "start must be less than or equal to end.";
  }

  const requestedInterval = input.interval === null || input.interval === undefined || input.interval === "" ? "raw" : input.interval;
  if (requestedInterval !== "raw" && requestedInterval !== "1d") {
    details.interval = "interval must be either raw or 1d.";
  }

  if (Object.keys(details).length > 0) {
    throw new ChemistryReadingsValidationError("Chemistry history query is invalid.", details);
  }

  return {
    start: start.toISOString(),
    end: end.toISOString(),
    interval: requestedInterval === "1d" ? "1d" : "raw"
  };
}

function normalizeDateInput(
  value: string | null,
  field: "start" | "end",
  details: Record<string, string>
): Date | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    details[field] = `${field} must be a valid ISO 8601 timestamp.`;
    return null;
  }
  return new Date(parsed);
}

function readOptionalNumber(
  record: Record<string, unknown>,
  field: (typeof READING_NUMERIC_FIELDS)[number],
  details: Record<string, string>
): number | null {
  const value = record[field];
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    details[field] = `${field} must be a finite number when provided.`;
    return null;
  }
  return value;
}

function normalizeNullableNumber(value: number | null): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
