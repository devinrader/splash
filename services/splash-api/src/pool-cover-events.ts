import { randomUUID } from "node:crypto";
import type { SqliteDatabase } from "./database.js";

export type PoolCoverState = "on" | "off";
export type PoolCoverType = "unknown" | "solar" | "winter" | "safety" | "automatic";
export type PoolCoverEventSource = "manual";

export interface PoolCoverEventRecord {
  id: string;
  pool_id: string;
  state: PoolCoverState;
  cover_type: PoolCoverType;
  source: PoolCoverEventSource;
  recorded_at: string;
  created_at: string;
}

export interface PoolCoverCurrentView {
  current: PoolCoverEventRecord | null;
}

export interface PoolCoverHistoryView {
  start: string | null;
  end: string | null;
  limit: number;
  events: PoolCoverEventRecord[];
}

export interface PoolCoverEventCreateInput {
  state?: PoolCoverState;
  cover_type?: PoolCoverType | null;
}

export interface PoolCoverHistoryQueryInput {
  start: string | null;
  end: string | null;
  limit: string | null;
}

interface PoolCoverEventStoredRecord {
  poolId: string;
  state: PoolCoverState;
  coverType: PoolCoverType;
  source: PoolCoverEventSource;
  recordedAt: string;
}

interface ValidatedPoolCoverEventCreateInput {
  state: PoolCoverState;
  cover_type: PoolCoverType;
  source: PoolCoverEventSource;
  recorded_at: string;
}

interface ValidatedPoolCoverHistoryQuery {
  start: string | null;
  end: string | null;
  limit: number;
}

export interface PoolCoverEventsRepository {
  getLatest(poolId: string): Promise<PoolCoverEventRecord | null>;
  create(record: PoolCoverEventStoredRecord): Promise<PoolCoverEventRecord>;
  list(poolId: string, query: ValidatedPoolCoverHistoryQuery): Promise<PoolCoverEventRecord[]>;
}

export class PoolCoverEventsValidationError extends Error {
  constructor(
    message: string,
    readonly details: Record<string, string>
  ) {
    super(message);
    this.name = "PoolCoverEventsValidationError";
  }
}

export class PoolCoverEventsUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PoolCoverEventsUnavailableError";
  }
}

export class PoolCoverEventsService {
  constructor(
    private readonly poolId: string,
    private readonly repository: PoolCoverEventsRepository | null
  ) {}

  async getCurrentPoolCover(): Promise<PoolCoverCurrentView> {
    return {
      current: await this.requireRepository().getLatest(this.poolId)
    };
  }

  async getPoolCoverHistory(input: PoolCoverHistoryQueryInput): Promise<PoolCoverHistoryView> {
    const query = validatePoolCoverHistoryQueryInput(input);
    return {
      start: query.start,
      end: query.end,
      limit: query.limit,
      events: await this.requireRepository().list(this.poolId, query)
    };
  }

  async createPoolCoverEvent(input: unknown): Promise<PoolCoverEventRecord> {
    const validated = validatePoolCoverEventCreateInput(input);
    return this.requireRepository().create({
      poolId: this.poolId,
      state: validated.state,
      coverType: validated.cover_type,
      source: validated.source,
      recordedAt: validated.recorded_at
    });
  }

  private requireRepository(): PoolCoverEventsRepository {
    if (!this.repository) {
      throw new PoolCoverEventsUnavailableError("SQLite-backed pool cover events are not configured.");
    }
    return this.repository;
  }
}

export class SqlitePoolCoverEventsRepository implements PoolCoverEventsRepository {
  constructor(private readonly database: SqliteDatabase) {}

  async getLatest(poolId: string): Promise<PoolCoverEventRecord | null> {
    const row = this.database.get<PoolCoverEventRow>(
      `
        SELECT
          id,
          pool_id,
          state,
          cover_type,
          source,
          recorded_at,
          created_at
        FROM pool_cover_events
        WHERE pool_id = ?
        ORDER BY recorded_at DESC, created_at DESC
        LIMIT 1
      `,
      [poolId]
    );
    return row ? mapPoolCoverEventRow(row) : null;
  }

  async create(record: PoolCoverEventStoredRecord): Promise<PoolCoverEventRecord> {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    this.database.run(
      `
        INSERT INTO pool_cover_events (
          id,
          pool_id,
          state,
          cover_type,
          source,
          recorded_at,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        id,
        record.poolId,
        record.state,
        record.coverType,
        record.source,
        record.recordedAt,
        createdAt
      ]
    );

    return {
      id,
      pool_id: record.poolId,
      state: record.state,
      cover_type: record.coverType,
      source: record.source,
      recorded_at: record.recordedAt,
      created_at: createdAt
    };
  }

  async list(poolId: string, query: ValidatedPoolCoverHistoryQuery): Promise<PoolCoverEventRecord[]> {
    const clauses = ["pool_id = ?"];
    const params: unknown[] = [poolId];

    if (query.start) {
      clauses.push("recorded_at >= ?");
      params.push(query.start);
    }
    if (query.end) {
      clauses.push("recorded_at <= ?");
      params.push(query.end);
    }

    params.push(query.limit);
    const rows = this.database.all<PoolCoverEventRow>(
      `
        SELECT
          id,
          pool_id,
          state,
          cover_type,
          source,
          recorded_at,
          created_at
        FROM pool_cover_events
        WHERE ${clauses.join(" AND ")}
        ORDER BY recorded_at DESC, created_at DESC
        LIMIT ?
      `,
      params
    );

    return rows.map(mapPoolCoverEventRow);
  }
}

interface PoolCoverEventRow extends Record<string, unknown> {
  id: string;
  pool_id: string;
  state: PoolCoverState;
  cover_type: PoolCoverType;
  source: PoolCoverEventSource;
  recorded_at: string;
  created_at: string;
}

function validatePoolCoverEventCreateInput(input: unknown): ValidatedPoolCoverEventCreateInput {
  const payload = ensureRecord(input);
  const state = payload.state;
  if (state !== "on" && state !== "off") {
    throw new PoolCoverEventsValidationError("Pool cover event validation failed.", {
      state: "State must be either 'on' or 'off'."
    });
  }

  const coverType =
    state === "off"
      ? normalizeCoverType(payload.cover_type) ?? "unknown"
      : normalizeCoverType(payload.cover_type);

  if (state === "on" && !coverType) {
    throw new PoolCoverEventsValidationError("Pool cover event validation failed.", {
      cover_type: "Cover type is required when recording Cover On."
    });
  }

  return {
    state,
    cover_type: coverType ?? "unknown",
    source: "manual",
    recorded_at: new Date().toISOString()
  };
}

function validatePoolCoverHistoryQueryInput(input: PoolCoverHistoryQueryInput): ValidatedPoolCoverHistoryQuery {
  const start = input.start ? requireIsoDateTime(input.start, "start") : null;
  const end = input.end ? requireIsoDateTime(input.end, "end") : null;
  const limit = input.limit ? Number.parseInt(input.limit, 10) : 100;

  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
    throw new PoolCoverEventsValidationError("Pool cover history query validation failed.", {
      limit: "Limit must be an integer between 1 and 1000."
    });
  }

  if (start && end && new Date(start).getTime() > new Date(end).getTime()) {
    throw new PoolCoverEventsValidationError("Pool cover history query validation failed.", {
      range: "Start must be less than or equal to end."
    });
  }

  return {
    start,
    end,
    limit
  };
}

function normalizeCoverType(value: unknown): PoolCoverType | null {
  return value === "unknown"
    || value === "solar"
    || value === "winter"
    || value === "safety"
    || value === "automatic"
    ? value
    : null;
}

function mapPoolCoverEventRow(row: PoolCoverEventRow): PoolCoverEventRecord {
  return {
    id: row.id,
    pool_id: row.pool_id,
    state: row.state,
    cover_type: row.cover_type,
    source: row.source,
    recorded_at: row.recorded_at,
    created_at: row.created_at
  };
}

function requireIsoDateTime(value: string, field: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new PoolCoverEventsValidationError("Pool cover history query validation failed.", {
      [field]: `${field} must be a valid ISO-8601 timestamp.`
    });
  }
  return new Date(parsed).toISOString();
}

function ensureRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PoolCoverEventsValidationError("Pool cover event validation failed.", {
      body: "Request body must be a JSON object."
    });
  }
  return value as Record<string, unknown>;
}
