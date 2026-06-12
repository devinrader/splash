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

const COVER_EXPOSURE_WINDOWS = ["24h", "72h", "7d"] as const;
const AVAILABLE_COVERAGE_PERCENT = 80;
const PARTIAL_COVERAGE_PERCENT = 20;
const DAYLIGHT_SAMPLE_MS = 15 * 60 * 1000;

export type PoolCoverExposureSummaryWindow = (typeof COVER_EXPOSURE_WINDOWS)[number];
export type PoolCoverExposureSummaryStatus = "available" | "partial" | "insufficient_data";

export interface PoolCoverExposureSummaryItemView {
  window: PoolCoverExposureSummaryWindow;
  covered_minutes: number;
  uncovered_minutes: number;
  covered_percent: number;
  uncovered_percent: number;
  daylight_uncovered_minutes: number;
  last_cover_change_at: string | null;
  status: PoolCoverExposureSummaryStatus;
}

export interface PoolCoverExposureSummaryView {
  generated_at: string;
  summaries: PoolCoverExposureSummaryItemView[];
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

export interface PoolCoverExposureSummaryQueryInput {
  window: string | null;
  now?: string | null;
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

interface ValidatedPoolCoverExposureSummaryQuery {
  windows: PoolCoverExposureSummaryWindow[];
  now: string;
}

export interface PoolCoverEventsRepository {
  getLatest(poolId: string): Promise<PoolCoverEventRecord | null>;
  getLatestBefore(poolId: string, before: string): Promise<PoolCoverEventRecord | null>;
  create(record: PoolCoverEventStoredRecord): Promise<PoolCoverEventRecord>;
  list(poolId: string, query: ValidatedPoolCoverHistoryQuery): Promise<PoolCoverEventRecord[]>;
  listRange(poolId: string, range: { start: string; end: string }): Promise<PoolCoverEventRecord[]>;
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
    private readonly repository: PoolCoverEventsRepository | null,
    private readonly timezone = "UTC"
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

  async getPoolCoverExposureSummary(input: PoolCoverExposureSummaryQueryInput): Promise<PoolCoverExposureSummaryView> {
    const query = validatePoolCoverExposureSummaryQueryInput(input);
    const generatedAtMs = Date.parse(query.now);
    const earliestStart = new Date(generatedAtMs - Math.max(...query.windows.map(windowLookbackMs))).toISOString();
    const repository = this.requireRepository();
    const [initialEvent, events] = await Promise.all([
      repository.getLatestBefore(this.poolId, earliestStart),
      repository.listRange(this.poolId, {
        start: earliestStart,
        end: query.now
      })
    ]);

    return buildPoolCoverExposureSummaryView({
      generatedAt: query.now,
      windows: query.windows,
      initialEvent,
      events,
      timezone: this.timezone
    });
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

  async getLatestBefore(poolId: string, before: string): Promise<PoolCoverEventRecord | null> {
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
          AND recorded_at <= ?
        ORDER BY recorded_at DESC, created_at DESC
        LIMIT 1
      `,
      [poolId, before]
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

  async listRange(poolId: string, range: { start: string; end: string }): Promise<PoolCoverEventRecord[]> {
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
        WHERE pool_id = ?
          AND recorded_at >= ?
          AND recorded_at <= ?
        ORDER BY recorded_at ASC, created_at ASC
      `,
      [poolId, range.start, range.end]
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

function validatePoolCoverExposureSummaryQueryInput(
  input: PoolCoverExposureSummaryQueryInput
): ValidatedPoolCoverExposureSummaryQuery {
  const now = input.now ? requireIsoDateTime(input.now, "now") : new Date().toISOString();
  return {
    windows: normalizeExposureSummaryWindows(input.window),
    now
  };
}

function normalizeExposureSummaryWindows(window: string | null): PoolCoverExposureSummaryWindow[] {
  if (window === null) {
    return [...COVER_EXPOSURE_WINDOWS];
  }
  if (window === "24h" || window === "72h" || window === "7d") {
    return [window];
  }
  throw new PoolCoverEventsValidationError("Pool cover exposure summary validation failed.", {
    window: "Window must be one of '24h', '72h', or '7d'."
  });
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

function buildPoolCoverExposureSummaryView(input: {
  generatedAt: string;
  windows: readonly PoolCoverExposureSummaryWindow[];
  initialEvent: PoolCoverEventRecord | null;
  events: PoolCoverEventRecord[];
  timezone: string;
}): PoolCoverExposureSummaryView {
  const generatedAtMs = Date.parse(input.generatedAt);
  const normalizedEvents = input.events
    .map((event) => ({ event, timestampMs: Date.parse(event.recorded_at) }))
    .filter((entry) => Number.isFinite(entry.timestampMs))
    .sort((left, right) => left.timestampMs - right.timestampMs);

  return {
    generated_at: input.generatedAt,
    summaries: input.windows.map((window) =>
      summarizeExposureWindow({
        window,
        generatedAtMs,
        initialEvent: input.initialEvent,
        events: normalizedEvents,
        timezone: input.timezone
      })
    )
  };
}

function summarizeExposureWindow(input: {
  window: PoolCoverExposureSummaryWindow;
  generatedAtMs: number;
  initialEvent: PoolCoverEventRecord | null;
  events: Array<{ event: PoolCoverEventRecord; timestampMs: number }>;
  timezone: string;
}): PoolCoverExposureSummaryItemView {
  const windowMs = windowLookbackMs(input.window);
  const windowStartMs = input.generatedAtMs - windowMs;
  let cursorMs = windowStartMs;
  let activeState: PoolCoverState | null =
    input.initialEvent && Date.parse(input.initialEvent.recorded_at) <= windowStartMs ? input.initialEvent.state : null;
  let coveredMs = 0;
  let uncoveredMs = 0;
  let knownMs = 0;
  let daylightUncoveredMs = 0;
  let lastCoverChangeAt = input.initialEvent?.recorded_at ?? null;

  for (const entry of input.events) {
    if (entry.timestampMs < windowStartMs || entry.timestampMs > input.generatedAtMs) {
      continue;
    }

    if (entry.timestampMs > cursorMs && activeState) {
      const interval = entry.timestampMs - cursorMs;
      knownMs += interval;
      if (activeState === "on") {
        coveredMs += interval;
      } else {
        uncoveredMs += interval;
        daylightUncoveredMs += calculateDaylightExposureMs(cursorMs, entry.timestampMs, input.timezone);
      }
    }

    activeState = entry.event.state;
    cursorMs = Math.max(cursorMs, entry.timestampMs);
    lastCoverChangeAt = entry.event.recorded_at;
  }

  if (activeState && input.generatedAtMs > cursorMs) {
    const interval = input.generatedAtMs - cursorMs;
    knownMs += interval;
    if (activeState === "on") {
      coveredMs += interval;
    } else {
      uncoveredMs += interval;
      daylightUncoveredMs += calculateDaylightExposureMs(cursorMs, input.generatedAtMs, input.timezone);
    }
  }

  const coveragePercent = windowMs > 0 ? (knownMs / windowMs) * 100 : 0;

  return {
    window: input.window,
    covered_minutes: roundSingleDecimal(coveredMs / 60000),
    uncovered_minutes: roundSingleDecimal(uncoveredMs / 60000),
    covered_percent: roundSingleDecimal((coveredMs / windowMs) * 100),
    uncovered_percent: roundSingleDecimal((uncoveredMs / windowMs) * 100),
    daylight_uncovered_minutes: roundSingleDecimal(daylightUncoveredMs / 60000),
    last_cover_change_at: lastCoverChangeAt,
    status: summarizeCoverageStatus(coveragePercent)
  };
}

function summarizeCoverageStatus(coveragePercent: number): PoolCoverExposureSummaryStatus {
  if (coveragePercent >= AVAILABLE_COVERAGE_PERCENT) {
    return "available";
  }
  if (coveragePercent >= PARTIAL_COVERAGE_PERCENT) {
    return "partial";
  }
  return "insufficient_data";
}

function calculateDaylightExposureMs(startMs: number, endMs: number, timezone: string): number {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return 0;
  }

  let totalMs = 0;
  let cursorMs = startMs;
  while (cursorMs < endMs) {
    const nextMs = Math.min(cursorMs + DAYLIGHT_SAMPLE_MS, endMs);
    const midpointMs = cursorMs + (nextMs - cursorMs) / 2;
    if (isApproximateDaylight(midpointMs, timezone)) {
      totalMs += nextMs - cursorMs;
    }
    cursorMs = nextMs;
  }
  return totalMs;
}

function isApproximateDaylight(timestampMs: number, timezone: string): boolean {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    hour12: false
  });
  const hourPart = formatter.formatToParts(new Date(timestampMs)).find((part) => part.type === "hour")?.value;
  const hour = Number.parseInt(hourPart ?? "", 10);
  return Number.isFinite(hour) && hour >= 6 && hour < 18;
}

function windowLookbackMs(window: PoolCoverExposureSummaryWindow): number {
  switch (window) {
    case "24h":
      return 24 * 60 * 60 * 1000;
    case "72h":
      return 72 * 60 * 60 * 1000;
    case "7d":
      return 7 * 24 * 60 * 60 * 1000;
  }
}

function roundSingleDecimal(value: number): number {
  return Math.round(value * 10) / 10;
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
