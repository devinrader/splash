import { randomUUID } from "node:crypto";
import type { SqliteDatabase } from "./database.js";

export type ChemistryObservationSource = "manual";
export type WaterClarity = "clear" | "slightly_hazy" | "cloudy" | "opaque";
export type AlgaePresence = "absent" | "suspected" | "visible";
export type DebrisLevel = "none" | "light" | "moderate" | "heavy";
export type BatherLoadEstimate = "none" | "light" | "moderate" | "heavy";

export interface ChemistryObservationRecord {
  id: string;
  pool_id: string;
  clarity: WaterClarity | null;
  algae_presence: AlgaePresence | null;
  debris_level: DebrisLevel | null;
  bather_load_estimate: BatherLoadEstimate | null;
  notes: string | null;
  source: ChemistryObservationSource;
  recorded_at: string;
  created_at: string;
}

export interface ChemistryObservationsView {
  start: string | null;
  end: string | null;
  limit: number;
  observations: ChemistryObservationRecord[];
}

export interface ChemistryObservationCreateInput {
  clarity?: WaterClarity | null;
  algae_presence?: AlgaePresence | null;
  debris_level?: DebrisLevel | null;
  bather_load_estimate?: BatherLoadEstimate | null;
  notes?: string | null;
  source?: ChemistryObservationSource;
}

export interface ChemistryObservationsQueryInput {
  start: string | null;
  end: string | null;
  limit: string | null;
}

interface ValidatedChemistryObservationCreateInput {
  clarity: WaterClarity | null;
  algae_presence: AlgaePresence | null;
  debris_level: DebrisLevel | null;
  bather_load_estimate: BatherLoadEstimate | null;
  notes: string | null;
  source: ChemistryObservationSource;
  recorded_at: string;
}

interface ValidatedChemistryObservationsQuery {
  start: string | null;
  end: string | null;
  limit: number;
}

interface ChemistryObservationStoredRecord {
  poolId: string;
  clarity: WaterClarity | null;
  algaePresence: AlgaePresence | null;
  debrisLevel: DebrisLevel | null;
  batherLoadEstimate: BatherLoadEstimate | null;
  notes: string | null;
  source: ChemistryObservationSource;
  recordedAt: string;
}

export interface ChemistryObservationsRepository {
  create(record: ChemistryObservationStoredRecord): Promise<ChemistryObservationRecord>;
  list(poolId: string, query: ValidatedChemistryObservationsQuery): Promise<ChemistryObservationRecord[]>;
}

export class ChemistryObservationsValidationError extends Error {
  constructor(
    message: string,
    readonly details: Record<string, string>
  ) {
    super(message);
    this.name = "ChemistryObservationsValidationError";
  }
}

export class ChemistryObservationsUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChemistryObservationsUnavailableError";
  }
}

export class ChemistryObservationsService {
  constructor(
    private readonly poolId: string,
    private readonly repository: ChemistryObservationsRepository | null
  ) {}

  async getChemistryObservations(input: ChemistryObservationsQueryInput): Promise<ChemistryObservationsView> {
    const repository = this.requireRepository();
    const query = validateChemistryObservationsQueryInput(input);
    return {
      start: query.start,
      end: query.end,
      limit: query.limit,
      observations: await repository.list(this.poolId, query)
    };
  }

  async createChemistryObservation(input: unknown): Promise<ChemistryObservationRecord> {
    const repository = this.requireRepository();
    const validated = validateChemistryObservationCreateInput(input);
    return repository.create({
      poolId: this.poolId,
      clarity: validated.clarity,
      algaePresence: validated.algae_presence,
      debrisLevel: validated.debris_level,
      batherLoadEstimate: validated.bather_load_estimate,
      notes: validated.notes,
      source: validated.source,
      recordedAt: validated.recorded_at
    });
  }

  private requireRepository(): ChemistryObservationsRepository {
    if (!this.repository) {
      throw new ChemistryObservationsUnavailableError("SQLite-backed chemistry observations are not configured.");
    }
    return this.repository;
  }
}

export class SqliteChemistryObservationsRepository implements ChemistryObservationsRepository {
  constructor(private readonly database: SqliteDatabase) {}

  async create(record: ChemistryObservationStoredRecord): Promise<ChemistryObservationRecord> {
    const createdAt = new Date().toISOString();
    const id = randomUUID();
    this.database.run(
      `
        INSERT INTO chemistry_observations (
          id,
          pool_id,
          clarity,
          algae_presence,
          debris_level,
          bather_load_estimate,
          notes,
          source,
          recorded_at,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        id,
        record.poolId,
        record.clarity,
        record.algaePresence,
        record.debrisLevel,
        record.batherLoadEstimate,
        record.notes,
        record.source,
        record.recordedAt,
        createdAt
      ]
    );

    return {
      id,
      pool_id: record.poolId,
      clarity: record.clarity,
      algae_presence: record.algaePresence,
      debris_level: record.debrisLevel,
      bather_load_estimate: record.batherLoadEstimate,
      notes: record.notes,
      source: record.source,
      recorded_at: record.recordedAt,
      created_at: createdAt
    };
  }

  async list(poolId: string, query: ValidatedChemistryObservationsQuery): Promise<ChemistryObservationRecord[]> {
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
      .all<ChemistryObservationRow>(
        `
          SELECT
            id,
            pool_id,
            clarity,
            algae_presence,
            debris_level,
            bather_load_estimate,
            notes,
            source,
            recorded_at,
            created_at
          FROM chemistry_observations
          WHERE ${whereClauses.join(" AND ")}
          ORDER BY recorded_at DESC, created_at DESC
          LIMIT ?
        `,
        params
      )
      .map(mapChemistryObservationRow);
  }
}

interface ChemistryObservationRow {
  [key: string]: unknown;
  id: string;
  pool_id: string;
  clarity: WaterClarity | null;
  algae_presence: AlgaePresence | null;
  debris_level: DebrisLevel | null;
  bather_load_estimate: BatherLoadEstimate | null;
  notes: string | null;
  source: ChemistryObservationSource;
  recorded_at: string;
  created_at: string;
}

function mapChemistryObservationRow(row: ChemistryObservationRow): ChemistryObservationRecord {
  return {
    id: row.id,
    pool_id: row.pool_id,
    clarity: normalizeNullableString<WaterClarity>(row.clarity),
    algae_presence: normalizeNullableString<AlgaePresence>(row.algae_presence),
    debris_level: normalizeNullableString<DebrisLevel>(row.debris_level),
    bather_load_estimate: normalizeNullableString<BatherLoadEstimate>(row.bather_load_estimate),
    notes: typeof row.notes === "string" ? row.notes : null,
    source: row.source,
    recorded_at: row.recorded_at,
    created_at: row.created_at
  };
}

const CLARITY_VALUES: WaterClarity[] = ["clear", "slightly_hazy", "cloudy", "opaque"];
const ALGAE_VALUES: AlgaePresence[] = ["absent", "suspected", "visible"];
const LEVEL_VALUES: Array<DebrisLevel | BatherLoadEstimate> = ["none", "light", "moderate", "heavy"];
const OBSERVATION_SOURCES: ChemistryObservationSource[] = ["manual"];

function validateChemistryObservationCreateInput(input: unknown): ValidatedChemistryObservationCreateInput {
  const object = toRecord(input);
  const details: Record<string, string> = {};

  const clarity = validateNullableEnumValue(
    object.clarity,
    CLARITY_VALUES,
    "clarity must be one of the supported clarity values.",
    details,
    "clarity"
  );
  const algaePresence = validateNullableEnumValue(
    object.algae_presence,
    ALGAE_VALUES,
    "algae_presence must be one of the supported algae values.",
    details,
    "algae_presence"
  );
  const debrisLevel = validateNullableEnumValue(
    object.debris_level,
    LEVEL_VALUES,
    "debris_level must be one of the supported debris values.",
    details,
    "debris_level"
  ) as DebrisLevel | null;
  const batherLoadEstimate = validateNullableEnumValue(
    object.bather_load_estimate,
    LEVEL_VALUES,
    "bather_load_estimate must be one of the supported bather load values.",
    details,
    "bather_load_estimate"
  ) as BatherLoadEstimate | null;
  const source = validateNullableEnumValue(
    object.source,
    OBSERVATION_SOURCES,
    "source must be one of the supported observation sources.",
    details,
    "source"
  ) as ChemistryObservationSource | null;

  if (!clarity && !algaePresence && !debrisLevel && !batherLoadEstimate) {
    details.observation = "At least one observational field must be provided.";
  }

  if (Object.keys(details).length > 0) {
    throw new ChemistryObservationsValidationError("Chemistry observation validation failed.", details);
  }

  return {
    clarity,
    algae_presence: algaePresence,
    debris_level: debrisLevel,
    bather_load_estimate: batherLoadEstimate,
    notes: normalizeOptionalNotes(object.notes),
    source: source ?? "manual",
    recorded_at: new Date().toISOString()
  };
}

function validateChemistryObservationsQueryInput(input: ChemistryObservationsQueryInput): ValidatedChemistryObservationsQuery {
  const details: Record<string, string> = {};
  const start = normalizeNullableString(input.start);
  const end = normalizeNullableString(input.end);
  const limit = normalizeLimit(input.limit, details);

  if (Object.keys(details).length > 0) {
    throw new ChemistryObservationsValidationError("Chemistry observations query validation failed.", details);
  }

  return { start, end, limit };
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

function validateNullableEnumValue<T extends string>(
  value: unknown,
  supportedValues: readonly T[],
  message: string,
  details: Record<string, string>,
  field: string
): T | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value !== "string" || !supportedValues.includes(value as T)) {
    details[field] = message;
    return null;
  }
  return value as T;
}

function toRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function normalizeNullableString<T extends string>(value: unknown): T | null {
  return typeof value === "string" ? (value as T) : null;
}
