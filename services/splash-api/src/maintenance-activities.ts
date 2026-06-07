import { randomUUID } from "node:crypto";
import type { SqliteDatabase } from "./database.js";

export type MaintenanceActivitySource = "manual";
export type MaintenanceActivityType =
  | "brushed"
  | "vacuumed"
  | "robot_cleaned"
  | "skimmed"
  | "skimmer_basket_cleaned"
  | "pump_basket_cleaned"
  | "filter_cleaned"
  | "filter_backwashed"
  | "other";

export interface MaintenanceActivityRecord {
  id: string;
  pool_id: string;
  activity_type: MaintenanceActivityType;
  notes: string | null;
  source: MaintenanceActivitySource;
  recorded_at: string;
  created_at: string;
}

export interface MaintenanceActivitiesView {
  start: string | null;
  end: string | null;
  limit: number;
  activities: MaintenanceActivityRecord[];
}

export interface MaintenanceActivityCreateInput {
  activity_type?: MaintenanceActivityType;
  notes?: string | null;
  source?: MaintenanceActivitySource;
}

export interface MaintenanceActivitiesQueryInput {
  start: string | null;
  end: string | null;
  limit: string | null;
}

interface ValidatedMaintenanceActivityCreateInput {
  activity_type: MaintenanceActivityType;
  notes: string | null;
  source: MaintenanceActivitySource;
  recorded_at: string;
}

interface ValidatedMaintenanceActivitiesQuery {
  start: string | null;
  end: string | null;
  limit: number;
}

interface MaintenanceActivityStoredRecord {
  poolId: string;
  activityType: MaintenanceActivityType;
  notes: string | null;
  source: MaintenanceActivitySource;
  recordedAt: string;
}

export interface MaintenanceActivitiesRepository {
  create(record: MaintenanceActivityStoredRecord): Promise<MaintenanceActivityRecord>;
  list(poolId: string, query: ValidatedMaintenanceActivitiesQuery): Promise<MaintenanceActivityRecord[]>;
}

export class MaintenanceActivitiesValidationError extends Error {
  constructor(
    message: string,
    readonly details: Record<string, string>
  ) {
    super(message);
    this.name = "MaintenanceActivitiesValidationError";
  }
}

export class MaintenanceActivitiesUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MaintenanceActivitiesUnavailableError";
  }
}

export class MaintenanceActivitiesService {
  constructor(
    private readonly poolId: string,
    private readonly repository: MaintenanceActivitiesRepository | null
  ) {}

  async getMaintenanceActivities(input: MaintenanceActivitiesQueryInput): Promise<MaintenanceActivitiesView> {
    const repository = this.requireRepository();
    const query = validateMaintenanceActivitiesQueryInput(input);
    return {
      start: query.start,
      end: query.end,
      limit: query.limit,
      activities: await repository.list(this.poolId, query)
    };
  }

  async createMaintenanceActivity(input: unknown): Promise<MaintenanceActivityRecord> {
    const repository = this.requireRepository();
    const validated = validateMaintenanceActivityCreateInput(input);
    return repository.create({
      poolId: this.poolId,
      activityType: validated.activity_type,
      notes: validated.notes,
      source: validated.source,
      recordedAt: validated.recorded_at
    });
  }

  private requireRepository(): MaintenanceActivitiesRepository {
    if (!this.repository) {
      throw new MaintenanceActivitiesUnavailableError("SQLite-backed maintenance activities are not configured.");
    }
    return this.repository;
  }
}

export class SqliteMaintenanceActivitiesRepository implements MaintenanceActivitiesRepository {
  constructor(private readonly database: SqliteDatabase) {}

  async create(record: MaintenanceActivityStoredRecord): Promise<MaintenanceActivityRecord> {
    const createdAt = new Date().toISOString();
    const id = randomUUID();
    this.database.run(
      `
        INSERT INTO maintenance_activities (
          id,
          pool_id,
          activity_type,
          notes,
          source,
          recorded_at,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [id, record.poolId, record.activityType, record.notes, record.source, record.recordedAt, createdAt]
    );

    return {
      id,
      pool_id: record.poolId,
      activity_type: record.activityType,
      notes: record.notes,
      source: record.source,
      recorded_at: record.recordedAt,
      created_at: createdAt
    };
  }

  async list(poolId: string, query: ValidatedMaintenanceActivitiesQuery): Promise<MaintenanceActivityRecord[]> {
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
      .all<MaintenanceActivityRow>(
        `
          SELECT
            id,
            pool_id,
            activity_type,
            notes,
            source,
            recorded_at,
            created_at
          FROM maintenance_activities
          WHERE ${whereClauses.join(" AND ")}
          ORDER BY recorded_at DESC, created_at DESC
          LIMIT ?
        `,
        params
      )
      .map(mapMaintenanceActivityRow);
  }
}

interface MaintenanceActivityRow {
  [key: string]: unknown;
  id: string;
  pool_id: string;
  activity_type: MaintenanceActivityType;
  notes: string | null;
  source: MaintenanceActivitySource;
  recorded_at: string;
  created_at: string;
}

function mapMaintenanceActivityRow(row: MaintenanceActivityRow): MaintenanceActivityRecord {
  return {
    id: row.id,
    pool_id: row.pool_id,
    activity_type: row.activity_type,
    notes: typeof row.notes === "string" ? row.notes : null,
    source: row.source,
    recorded_at: row.recorded_at,
    created_at: row.created_at
  };
}

const MAINTENANCE_ACTIVITY_TYPES: MaintenanceActivityType[] = [
  "brushed",
  "vacuumed",
  "robot_cleaned",
  "skimmed",
  "skimmer_basket_cleaned",
  "pump_basket_cleaned",
  "filter_cleaned",
  "filter_backwashed",
  "other"
];

const MAINTENANCE_SOURCES: MaintenanceActivitySource[] = ["manual"];

function validateMaintenanceActivityCreateInput(input: unknown): ValidatedMaintenanceActivityCreateInput {
  const object = toRecord(input);
  const details: Record<string, string> = {};

  const activityType = validateRequiredEnumValue(
    object.activity_type,
    MAINTENANCE_ACTIVITY_TYPES,
    "activity_type must be one of the supported maintenance activity values.",
    details,
    "activity_type"
  );
  const source = validateOptionalEnumValue(
    object.source,
    MAINTENANCE_SOURCES,
    "source must be one of the supported maintenance activity sources.",
    details,
    "source"
  ) as MaintenanceActivitySource | null;

  if (Object.keys(details).length > 0) {
    throw new MaintenanceActivitiesValidationError("Maintenance activity validation failed.", details);
  }

  return {
    activity_type: activityType as MaintenanceActivityType,
    notes: normalizeOptionalNotes(object.notes),
    source: source ?? "manual",
    recorded_at: new Date().toISOString()
  };
}

function validateMaintenanceActivitiesQueryInput(input: MaintenanceActivitiesQueryInput): ValidatedMaintenanceActivitiesQuery {
  const details: Record<string, string> = {};
  const start = normalizeNullableString(input.start);
  const end = normalizeNullableString(input.end);
  const limit = normalizeLimit(input.limit, details);

  if (Object.keys(details).length > 0) {
    throw new MaintenanceActivitiesValidationError("Maintenance activities query validation failed.", details);
  }

  return { start, end, limit };
}

function validateRequiredEnumValue<T extends string>(
  value: unknown,
  supportedValues: readonly T[],
  message: string,
  details: Record<string, string>,
  field: string
): T | null {
  if (typeof value !== "string" || !supportedValues.includes(value as T)) {
    details[field] = message;
    return null;
  }
  return value as T;
}

function validateOptionalEnumValue<T extends string>(
  value: unknown,
  supportedValues: readonly T[],
  message: string,
  details: Record<string, string>,
  field: string
): T | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  return validateRequiredEnumValue(value, supportedValues, message, details, field);
}

function normalizeOptionalNotes(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeLimit(value: string | null, details: Record<string, string>): number {
  if (value === null || value.trim().length === 0) {
    return 25;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    details.limit = "limit must be a positive integer.";
    return 25;
  }

  return Math.min(parsed, 100);
}

function toRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function normalizeNullableString(value: string | null): string | null {
  return typeof value === "string" ? value : null;
}
