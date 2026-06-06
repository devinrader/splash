import { randomUUID } from "node:crypto";
import type { SqliteDatabase } from "./database.js";

export type ChemicalAdditionSource = "manual";
export type ChemicalAdditionType =
  | "liquid_chlorine"
  | "cal_hypo"
  | "trichlor"
  | "dichlor"
  | "muriatic_acid"
  | "soda_ash"
  | "baking_soda"
  | "calcium_chloride"
  | "stabilizer"
  | "salt"
  | "algaecide"
  | "other";

export type ChemicalAdditionUnit = "gal" | "qt" | "oz" | "lb" | "kg" | "g" | "L";

export interface ChemicalAdditionRecord {
  id: string;
  pool_id: string;
  chemical_type: ChemicalAdditionType;
  amount: number;
  unit: ChemicalAdditionUnit;
  notes: string | null;
  source: ChemicalAdditionSource;
  recorded_at: string;
  created_at: string;
}

export interface ChemicalAdditionsView {
  start: string | null;
  end: string | null;
  limit: number;
  additions: ChemicalAdditionRecord[];
}

export interface ChemicalAdditionCreateInput {
  chemical_type?: ChemicalAdditionType;
  amount?: number;
  unit?: ChemicalAdditionUnit;
  notes?: string | null;
  source?: ChemicalAdditionSource;
}

export interface ChemicalAdditionsQueryInput {
  start: string | null;
  end: string | null;
  limit: string | null;
}

interface ValidatedChemicalAdditionCreateInput {
  chemical_type: ChemicalAdditionType;
  amount: number;
  unit: ChemicalAdditionUnit;
  notes: string | null;
  source: ChemicalAdditionSource;
  recorded_at: string;
}

interface ValidatedChemicalAdditionsQuery {
  start: string | null;
  end: string | null;
  limit: number;
}

interface ChemicalAdditionStoredRecord {
  poolId: string;
  chemicalType: ChemicalAdditionType;
  amount: number;
  unit: ChemicalAdditionUnit;
  notes: string | null;
  source: ChemicalAdditionSource;
  recordedAt: string;
}

export interface ChemicalAdditionsRepository {
  create(record: ChemicalAdditionStoredRecord): Promise<ChemicalAdditionRecord>;
  list(poolId: string, query: ValidatedChemicalAdditionsQuery): Promise<ChemicalAdditionRecord[]>;
}

export class ChemicalAdditionsValidationError extends Error {
  constructor(
    message: string,
    readonly details: Record<string, string>
  ) {
    super(message);
    this.name = "ChemicalAdditionsValidationError";
  }
}

export class ChemicalAdditionsUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChemicalAdditionsUnavailableError";
  }
}

export class ChemicalAdditionsService {
  constructor(
    private readonly poolId: string,
    private readonly repository: ChemicalAdditionsRepository | null
  ) {}

  async getChemicalAdditions(input: ChemicalAdditionsQueryInput): Promise<ChemicalAdditionsView> {
    const repository = this.requireRepository();
    const query = validateChemicalAdditionsQueryInput(input);
    return {
      start: query.start,
      end: query.end,
      limit: query.limit,
      additions: await repository.list(this.poolId, query)
    };
  }

  async createChemicalAddition(input: unknown): Promise<ChemicalAdditionRecord> {
    const repository = this.requireRepository();
    const validated = validateChemicalAdditionCreateInput(input);
    return repository.create({
      poolId: this.poolId,
      chemicalType: validated.chemical_type,
      amount: validated.amount,
      unit: validated.unit,
      notes: validated.notes,
      source: validated.source,
      recordedAt: validated.recorded_at
    });
  }

  private requireRepository(): ChemicalAdditionsRepository {
    if (!this.repository) {
      throw new ChemicalAdditionsUnavailableError("SQLite-backed chemical additions are not configured.");
    }
    return this.repository;
  }
}

export class SqliteChemicalAdditionsRepository implements ChemicalAdditionsRepository {
  constructor(private readonly database: SqliteDatabase) {}

  async create(record: ChemicalAdditionStoredRecord): Promise<ChemicalAdditionRecord> {
    const createdAt = new Date().toISOString();
    const id = randomUUID();
    this.database.run(
      `
        INSERT INTO chemical_additions (
          id,
          pool_id,
          chemical_type,
          amount,
          unit,
          notes,
          source,
          recorded_at,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        id,
        record.poolId,
        record.chemicalType,
        record.amount,
        record.unit,
        record.notes,
        record.source,
        record.recordedAt,
        createdAt
      ]
    );

    return {
      id,
      pool_id: record.poolId,
      chemical_type: record.chemicalType,
      amount: record.amount,
      unit: record.unit,
      notes: record.notes,
      source: record.source,
      recorded_at: record.recordedAt,
      created_at: createdAt
    };
  }

  async list(poolId: string, query: ValidatedChemicalAdditionsQuery): Promise<ChemicalAdditionRecord[]> {
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
      .all<ChemicalAdditionRow>(
        `
          SELECT
            id,
            pool_id,
            chemical_type,
            amount,
            unit,
            notes,
            source,
            recorded_at,
            created_at
          FROM chemical_additions
          WHERE ${whereClauses.join(" AND ")}
          ORDER BY recorded_at DESC, created_at DESC
          LIMIT ?
        `,
        params
      )
      .map(mapChemicalAdditionRow);
  }
}

interface ChemicalAdditionRow {
  [key: string]: unknown;
  id: string;
  pool_id: string;
  chemical_type: ChemicalAdditionType;
  amount: number;
  unit: ChemicalAdditionUnit;
  notes: string | null;
  source: ChemicalAdditionSource;
  recorded_at: string;
  created_at: string;
}

function mapChemicalAdditionRow(row: ChemicalAdditionRow): ChemicalAdditionRecord {
  return {
    id: row.id,
    pool_id: row.pool_id,
    chemical_type: row.chemical_type,
    amount: normalizeNumber(row.amount),
    unit: row.unit,
    notes: typeof row.notes === "string" ? row.notes : null,
    source: row.source,
    recorded_at: row.recorded_at,
    created_at: row.created_at
  };
}

const CHEMICAL_TYPES: ChemicalAdditionType[] = [
  "liquid_chlorine",
  "cal_hypo",
  "trichlor",
  "dichlor",
  "muriatic_acid",
  "soda_ash",
  "baking_soda",
  "calcium_chloride",
  "stabilizer",
  "salt",
  "algaecide",
  "other"
];

const CHEMICAL_UNITS: ChemicalAdditionUnit[] = ["gal", "qt", "oz", "lb", "kg", "g", "L"];

function validateChemicalAdditionCreateInput(input: unknown): ValidatedChemicalAdditionCreateInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ChemicalAdditionsValidationError("Chemical addition is invalid.", {
      body: "Request body must be a JSON object."
    });
  }

  const record = input as Record<string, unknown>;
  const details: Record<string, string> = {};
  const chemicalType = record.chemical_type;
  const amount = record.amount;
  const unit = record.unit;
  const notes = record.notes;
  const source = record.source;

  if (!CHEMICAL_TYPES.includes(chemicalType as ChemicalAdditionType)) {
    details.chemical_type = "chemical_type must be one of the supported addition types.";
  }

  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    details.amount = "amount must be a positive number.";
  }

  if (!CHEMICAL_UNITS.includes(unit as ChemicalAdditionUnit)) {
    details.unit = "unit must be one of the supported addition units.";
  }

  if (notes !== undefined && notes !== null && typeof notes !== "string") {
    details.notes = "notes must be a string when provided.";
  }

  if (source !== undefined && source !== "manual") {
    details.source = "Only manual chemical additions are accepted in the first slice.";
  }

  if (Object.keys(details).length > 0) {
    throw new ChemicalAdditionsValidationError("Chemical addition is invalid.", details);
  }

  return {
    chemical_type: chemicalType as ChemicalAdditionType,
    amount: amount as number,
    unit: unit as ChemicalAdditionUnit,
    notes: typeof notes === "string" && notes.trim().length > 0 ? notes.trim() : null,
    source: "manual",
    recorded_at: new Date().toISOString()
  };
}

function validateChemicalAdditionsQueryInput(input: ChemicalAdditionsQueryInput): ValidatedChemicalAdditionsQuery {
  const details: Record<string, string> = {};
  const start = normalizeDateInput(input.start, "start", details);
  const end = normalizeDateInput(input.end, "end", details);

  if (start && end && start.getTime() > end.getTime()) {
    details.range = "start must be less than or equal to end.";
  }

  let limit = 25;
  if (input.limit !== null && input.limit !== undefined && input.limit !== "") {
    const parsed = Number.parseInt(input.limit, 10);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 200) {
      details.limit = "limit must be an integer between 1 and 200.";
    } else {
      limit = parsed;
    }
  }

  if (Object.keys(details).length > 0) {
    throw new ChemicalAdditionsValidationError("Chemical additions query is invalid.", details);
  }

  return {
    start: start?.toISOString() ?? null,
    end: end?.toISOString() ?? null,
    limit
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

function normalizeNumber(value: unknown): number {
  return typeof value === "number" ? value : Number(value);
}
