import { randomUUID } from "node:crypto";
import type { SqliteDatabase } from "./database.js";

export type WaterAdditionSource = "manual";
export type WaterAdditionSourceType = "well" | "municipal" | "truck" | "unknown";
export type WaterAdditionReason = "top_up" | "post_backwash_refill" | "partial_refill" | "full_refill" | "other";
export type WaterAdditionUnit = "gal" | "qt" | "oz" | "lb" | "kg" | "g" | "L";

export interface WaterAdditionRecord {
  id: string;
  pool_id: string;
  water_source: WaterAdditionSourceType;
  amount: number;
  unit: WaterAdditionUnit;
  reason: WaterAdditionReason;
  notes: string | null;
  source: WaterAdditionSource;
  recorded_at: string;
  created_at: string;
}

export interface WaterAdditionsView {
  start: string | null;
  end: string | null;
  limit: number;
  additions: WaterAdditionRecord[];
}

export interface WaterAdditionCreateInput {
  water_source?: WaterAdditionSourceType;
  amount?: number;
  unit?: WaterAdditionUnit;
  reason?: WaterAdditionReason;
  notes?: string | null;
  source?: WaterAdditionSource;
}

export interface WaterAdditionsQueryInput {
  start: string | null;
  end: string | null;
  limit: string | null;
}

interface ValidatedWaterAdditionCreateInput {
  water_source: WaterAdditionSourceType;
  amount: number;
  unit: WaterAdditionUnit;
  reason: WaterAdditionReason;
  notes: string | null;
  source: WaterAdditionSource;
  recorded_at: string;
}

interface ValidatedWaterAdditionsQuery {
  start: string | null;
  end: string | null;
  limit: number;
}

interface WaterAdditionStoredRecord {
  poolId: string;
  waterSource: WaterAdditionSourceType;
  amount: number;
  unit: WaterAdditionUnit;
  reason: WaterAdditionReason;
  notes: string | null;
  source: WaterAdditionSource;
  recordedAt: string;
}

export interface WaterAdditionsRepository {
  create(record: WaterAdditionStoredRecord): Promise<WaterAdditionRecord>;
  list(poolId: string, query: ValidatedWaterAdditionsQuery): Promise<WaterAdditionRecord[]>;
}

export class WaterAdditionsValidationError extends Error {
  constructor(
    message: string,
    readonly details: Record<string, string>
  ) {
    super(message);
    this.name = "WaterAdditionsValidationError";
  }
}

export class WaterAdditionsUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WaterAdditionsUnavailableError";
  }
}

export class WaterAdditionsService {
  constructor(
    private readonly poolId: string,
    private readonly repository: WaterAdditionsRepository | null
  ) {}

  async getWaterAdditions(input: WaterAdditionsQueryInput): Promise<WaterAdditionsView> {
    const repository = this.requireRepository();
    const query = validateWaterAdditionsQueryInput(input);
    return {
      start: query.start,
      end: query.end,
      limit: query.limit,
      additions: await repository.list(this.poolId, query)
    };
  }

  async createWaterAddition(input: unknown): Promise<WaterAdditionRecord> {
    const repository = this.requireRepository();
    const validated = validateWaterAdditionCreateInput(input);
    return repository.create({
      poolId: this.poolId,
      waterSource: validated.water_source,
      amount: validated.amount,
      unit: validated.unit,
      reason: validated.reason,
      notes: validated.notes,
      source: validated.source,
      recordedAt: validated.recorded_at
    });
  }

  private requireRepository(): WaterAdditionsRepository {
    if (!this.repository) {
      throw new WaterAdditionsUnavailableError("SQLite-backed water additions are not configured.");
    }
    return this.repository;
  }
}

export class SqliteWaterAdditionsRepository implements WaterAdditionsRepository {
  constructor(private readonly database: SqliteDatabase) {}

  async create(record: WaterAdditionStoredRecord): Promise<WaterAdditionRecord> {
    const createdAt = new Date().toISOString();
    const id = randomUUID();
    this.database.run(
      `
        INSERT INTO water_additions (
          id,
          pool_id,
          water_source,
          amount,
          unit,
          reason,
          notes,
          source,
          recorded_at,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        id,
        record.poolId,
        record.waterSource,
        record.amount,
        record.unit,
        record.reason,
        record.notes,
        record.source,
        record.recordedAt,
        createdAt
      ]
    );

    return {
      id,
      pool_id: record.poolId,
      water_source: record.waterSource,
      amount: record.amount,
      unit: record.unit,
      reason: record.reason,
      notes: record.notes,
      source: record.source,
      recorded_at: record.recordedAt,
      created_at: createdAt
    };
  }

  async list(poolId: string, query: ValidatedWaterAdditionsQuery): Promise<WaterAdditionRecord[]> {
    const whereClauses = ["pool_id = ?"];
    const params: Array<string | number> = [poolId];

    if (query.start) {
      whereClauses.push("recorded_at >= ?");
      params.push(query.start);
    }

    if (query.end) {
      whereClauses.push("recorded_at <= ?");
      params.push(query.end);
    }

    params.push(query.limit);

    return this.database
      .all<WaterAdditionRow>(
        `
          SELECT
            id,
            pool_id,
            water_source,
            amount,
            unit,
            reason,
            notes,
            source,
            recorded_at,
            created_at
          FROM water_additions
          WHERE ${whereClauses.join(" AND ")}
          ORDER BY recorded_at DESC, created_at DESC
          LIMIT ?
        `,
        params
      )
      .map(mapWaterAdditionRow);
  }
}

interface WaterAdditionRow {
  [key: string]: unknown;
  id: string;
  pool_id: string;
  water_source: WaterAdditionSourceType;
  amount: number;
  unit: WaterAdditionUnit;
  reason: WaterAdditionReason;
  notes: string | null;
  source: WaterAdditionSource;
  recorded_at: string;
  created_at: string;
}

function mapWaterAdditionRow(row: WaterAdditionRow): WaterAdditionRecord {
  return {
    id: row.id,
    pool_id: row.pool_id,
    water_source: row.water_source,
    amount: normalizeNumber(row.amount),
    unit: row.unit,
    reason: row.reason,
    notes: typeof row.notes === "string" ? row.notes : null,
    source: row.source,
    recorded_at: row.recorded_at,
    created_at: row.created_at
  };
}

const WATER_SOURCES: WaterAdditionSourceType[] = ["well", "municipal", "truck", "unknown"];
const WATER_REASONS: WaterAdditionReason[] = ["top_up", "post_backwash_refill", "partial_refill", "full_refill", "other"];
const WATER_UNITS: WaterAdditionUnit[] = ["gal", "qt", "oz", "lb", "kg", "g", "L"];

function validateWaterAdditionCreateInput(input: unknown): ValidatedWaterAdditionCreateInput {
  const record = isRecord(input) ? input : {};
  const details: Record<string, string> = {};

  const waterSource = typeof record.water_source === "string" ? record.water_source : "";
  if (!isWaterSourceType(waterSource)) {
    details.water_source = "water_source must be one of the supported source-water values.";
  }

  const amount = normalizeNumber(record.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    details.amount = "amount must be a positive number.";
  }

  const unit = typeof record.unit === "string" ? record.unit : "";
  if (!isWaterUnit(unit)) {
    details.unit = "unit must be one of the supported water-addition units.";
  }

  const reason = typeof record.reason === "string" ? record.reason : "";
  if (!isWaterReason(reason)) {
    details.reason = "reason must be one of the supported water-addition reasons.";
  }

  const notes = typeof record.notes === "string" ? record.notes.trim() : "";
  const source = record.source;
  if (source != null && source !== "manual") {
    details.source = "Only manual water additions are accepted in the first slice.";
  }

  if (Object.keys(details).length > 0) {
    throw new WaterAdditionsValidationError("Water addition validation failed.", details);
  }

  return {
    water_source: waterSource as WaterAdditionSourceType,
    amount,
    unit: unit as WaterAdditionUnit,
    reason: reason as WaterAdditionReason,
    notes: notes.length > 0 ? notes : null,
    source: "manual",
    recorded_at: new Date().toISOString()
  };
}

function validateWaterAdditionsQueryInput(input: WaterAdditionsQueryInput): ValidatedWaterAdditionsQuery {
  const details: Record<string, string> = {};
  const start = normalizeOptionalIso(input.start, "start", details);
  const end = normalizeOptionalIso(input.end, "end", details);

  let limit = 25;
  if (input.limit != null) {
    const parsedLimit = Number.parseInt(input.limit, 10);
    if (Number.isNaN(parsedLimit) || parsedLimit <= 0 || parsedLimit > 200) {
      details.limit = "limit must be an integer between 1 and 200.";
    } else {
      limit = parsedLimit;
    }
  }

  if (Object.keys(details).length > 0) {
    throw new WaterAdditionsValidationError("Water additions query validation failed.", details);
  }

  return { start, end, limit };
}

function normalizeOptionalIso(value: string | null, fieldName: string, details: Record<string, string>): string | null {
  if (value == null || value.length === 0) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    details[fieldName] = `${fieldName} must be a valid ISO-8601 timestamp.`;
    return null;
  }
  return parsed.toISOString();
}

function normalizeNumber(value: unknown): number {
  return typeof value === "number" ? value : Number.parseFloat(String(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isWaterSourceType(value: string): value is WaterAdditionSourceType {
  return WATER_SOURCES.includes(value as WaterAdditionSourceType);
}

function isWaterReason(value: string): value is WaterAdditionReason {
  return WATER_REASONS.includes(value as WaterAdditionReason);
}

function isWaterUnit(value: string): value is WaterAdditionUnit {
  return WATER_UNITS.includes(value as WaterAdditionUnit);
}
