import type { SqliteDatabase } from "./database.js";

export interface PoolProfileSettingsView {
  volume_gallons: number | null;
  source: "sqlite";
}

interface StoredPoolProfileSettings {
  poolId: string;
  volumeGallons: number | null;
}

export interface PoolProfileSettingsRepository {
  get(poolId: string): Promise<StoredPoolProfileSettings | null>;
  upsert(settings: StoredPoolProfileSettings): Promise<StoredPoolProfileSettings>;
}

export class PoolProfileSettingsValidationError extends Error {
  constructor(
    message: string,
    readonly details: Record<string, string>
  ) {
    super(message);
    this.name = "PoolProfileSettingsValidationError";
  }
}

export class PoolProfileSettingsUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PoolProfileSettingsUnavailableError";
  }
}

export class PoolProfileSettingsService {
  constructor(
    private readonly poolId: string,
    private readonly repository: PoolProfileSettingsRepository | null
  ) {}

  async getPoolProfileSettings(): Promise<PoolProfileSettingsView> {
    const repository = this.requireRepository();
    const stored = await repository.get(this.poolId);
    return {
      volume_gallons: stored?.volumeGallons ?? null,
      source: "sqlite"
    };
  }

  async updatePoolProfileSettings(input: unknown): Promise<PoolProfileSettingsView> {
    const repository = this.requireRepository();
    const normalized = validatePoolProfileSettingsUpdateInput(input);
    const stored = await repository.upsert({
      poolId: this.poolId,
      volumeGallons: normalized.volume_gallons
    });
    return {
      volume_gallons: stored.volumeGallons,
      source: "sqlite"
    };
  }

  private requireRepository(): PoolProfileSettingsRepository {
    if (!this.repository) {
      throw new PoolProfileSettingsUnavailableError("SQLite-backed pool profile settings are not configured.");
    }
    return this.repository;
  }
}

export class SqlitePoolProfileSettingsRepository implements PoolProfileSettingsRepository {
  constructor(private readonly database: SqliteDatabase) {}

  async get(poolId: string): Promise<StoredPoolProfileSettings | null> {
    const row = this.database.get<PoolProfileSettingsRow>(
      `
        SELECT
          id,
          volume_gallons
        FROM pools
        WHERE id = ?
      `,
      [poolId]
    );

    if (!row) {
      return null;
    }

    return {
      poolId: row.id,
      volumeGallons: normalizeNullablePositiveNumber(row.volume_gallons)
    };
  }

  async upsert(settings: StoredPoolProfileSettings): Promise<StoredPoolProfileSettings> {
    const row = this.database.get<PoolProfileSettingsRow>(
      `
        INSERT INTO pools (
          id,
          volume_gallons,
          updated_at
        )
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT (id) DO UPDATE SET
          volume_gallons = EXCLUDED.volume_gallons,
          updated_at = CURRENT_TIMESTAMP
        RETURNING id, volume_gallons
      `,
      [settings.poolId, settings.volumeGallons]
    );

    if (!row) {
      throw new Error("SQLite pool profile settings upsert did not return a row.");
    }

    return {
      poolId: row.id,
      volumeGallons: normalizeNullablePositiveNumber(row.volume_gallons)
    };
  }
}

interface PoolProfileSettingsRow extends Record<string, unknown> {
  id: string;
  volume_gallons: number | null;
}

export function validatePoolProfileSettingsUpdateInput(input: unknown): {
  volume_gallons: number;
} {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new PoolProfileSettingsValidationError("Pool profile settings must be an object.", {
      volume_gallons: "volume_gallons is required."
    });
  }

  const volumeGallons = (input as Record<string, unknown>).volume_gallons;
  if (typeof volumeGallons !== "number" || !Number.isFinite(volumeGallons) || volumeGallons <= 0) {
    throw new PoolProfileSettingsValidationError("Pool volume must be a positive number of gallons.", {
      volume_gallons: "volume_gallons must be a positive number."
    });
  }

  return {
    volume_gallons: volumeGallons
  };
}

function normalizeNullablePositiveNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}
