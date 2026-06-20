import type { SqliteDatabase } from "./database.js";

export type ChlorinatorProfileChemicalKey =
  | "free_chlorine"
  | "combined_chlorine"
  | "ph"
  | "cyanuric_acid"
  | "total_alkalinity"
  | "calcium_hardness"
  | "tds"
  | "salinity"
  | "phosphates";

export interface ChlorinatorProfileSetting {
  chemicalKey: ChlorinatorProfileChemicalKey;
  displayName: string;
  unit: string | null;
  ideal_min: number | null;
  ideal_max: number | null;
  ideal_target: number | null;
  allowed_min: number | null;
  allowed_max: number | null;
  enabled: boolean;
  sortOrder: number;
}

export interface ChlorinatorProfileSettingsView {
  settings: ChlorinatorProfileSetting[];
  source: "sqlite" | "defaults";
}

export interface ChlorinatorProfileSettingsUpdateItem {
  chemicalKey: ChlorinatorProfileChemicalKey;
  ideal_min?: number | null;
  ideal_max?: number | null;
  ideal_target?: number | null;
  allowed_min?: number | null;
  allowed_max?: number | null;
  enabled?: boolean;
}

interface StoredChlorinatorProfileSettings {
  poolId: string;
  settings: Record<ChlorinatorProfileChemicalKey, ChlorinatorProfileSetting>;
}

export interface ChlorinatorProfileSettingsRepository {
  get(poolId: string): Promise<StoredChlorinatorProfileSettings | null>;
  upsert(settings: StoredChlorinatorProfileSettings): Promise<StoredChlorinatorProfileSettings>;
}

export class ChlorinatorProfileSettingsValidationError extends Error {
  constructor(
    message: string,
    readonly details: Record<string, string | Record<string, string>>
  ) {
    super(message);
    this.name = "ChlorinatorProfileSettingsValidationError";
  }
}

export class ChlorinatorProfileSettingsUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChlorinatorProfileSettingsUnavailableError";
  }
}

const DEFAULT_CHLORINATOR_PROFILE_SETTINGS: ChlorinatorProfileSetting[] = [
  {
    chemicalKey: "free_chlorine",
    displayName: "Free Chlorine",
    unit: "ppm",
    ideal_min: 2,
    ideal_max: 4,
    ideal_target: null,
    allowed_min: 1,
    allowed_max: 4,
    enabled: true,
    sortOrder: 10
  },
  {
    chemicalKey: "combined_chlorine",
    displayName: "Combined Chlorine",
    unit: "ppm",
    ideal_min: 0,
    ideal_max: 0,
    ideal_target: 0,
    allowed_min: 0,
    allowed_max: 0,
    enabled: true,
    sortOrder: 20
  },
  {
    chemicalKey: "ph",
    displayName: "pH",
    unit: null,
    ideal_min: 7.4,
    ideal_max: 7.6,
    ideal_target: null,
    allowed_min: 7.2,
    allowed_max: 7.8,
    enabled: true,
    sortOrder: 30
  },
  {
    chemicalKey: "cyanuric_acid",
    displayName: "Cyanuric Acid",
    unit: "ppm",
    ideal_min: 0,
    ideal_max: 50,
    ideal_target: null,
    allowed_min: null,
    allowed_max: null,
    enabled: true,
    sortOrder: 40
  },
  {
    chemicalKey: "total_alkalinity",
    displayName: "Total Alkalinity",
    unit: "ppm",
    ideal_min: 80,
    ideal_max: 120,
    ideal_target: null,
    allowed_min: null,
    allowed_max: null,
    enabled: true,
    sortOrder: 50
  },
  {
    chemicalKey: "calcium_hardness",
    displayName: "Calcium Hardness",
    unit: "ppm",
    ideal_min: 200,
    ideal_max: 400,
    ideal_target: null,
    allowed_min: null,
    allowed_max: null,
    enabled: true,
    sortOrder: 60
  },
  {
    chemicalKey: "tds",
    displayName: "TDS",
    unit: "ppm",
    ideal_min: 3000,
    ideal_max: 6000,
    ideal_target: null,
    allowed_min: null,
    allowed_max: null,
    enabled: false,
    sortOrder: 70
  },
  {
    chemicalKey: "salinity",
    displayName: "Salinity",
    unit: "ppm",
    ideal_min: null,
    ideal_max: null,
    ideal_target: 3600,
    allowed_min: 2600,
    allowed_max: 4500,
    enabled: true,
    sortOrder: 80
  },
  {
    chemicalKey: "phosphates",
    displayName: "Phosphates",
    unit: "ppb",
    ideal_min: 0,
    ideal_max: 125,
    ideal_target: null,
    allowed_min: null,
    allowed_max: null,
    enabled: false,
    sortOrder: 90
  }
];

const KNOWN_CHEMICAL_KEYS = new Set<ChlorinatorProfileChemicalKey>(
  DEFAULT_CHLORINATOR_PROFILE_SETTINGS.map((setting) => setting.chemicalKey)
);

export class ChlorinatorProfileSettingsService {
  constructor(
    private readonly poolId: string,
    private readonly repository: ChlorinatorProfileSettingsRepository | null
  ) {}

  async getChlorinatorProfileSettings(): Promise<ChlorinatorProfileSettingsView> {
    if (!this.repository) {
      return {
        settings: listChlorinatorProfileSettings(defaultChlorinatorProfileSettingsMap()),
        source: "defaults"
      };
    }

    const stored = await this.repository.get(this.poolId);
    if (!stored) {
      return {
        settings: listChlorinatorProfileSettings(defaultChlorinatorProfileSettingsMap()),
        source: "defaults"
      };
    }

    return {
      settings: listChlorinatorProfileSettings(stored.settings),
      source: "sqlite"
    };
  }

  async updateChlorinatorProfileSettings(input: unknown): Promise<ChlorinatorProfileSettingsView> {
    const repository = this.requireRepository();
    const normalized = validateChlorinatorProfileSettingsUpdateInput(input);
    const stored = (await repository.get(this.poolId))?.settings ?? defaultChlorinatorProfileSettingsMap();
    const next = cloneChlorinatorProfileSettingsMap(stored);

    for (const entry of normalized.settings) {
      const current = next[entry.chemicalKey];
      next[entry.chemicalKey] = {
        ...current,
        ideal_min: "ideal_min" in entry ? entry.ideal_min ?? null : current.ideal_min,
        ideal_max: "ideal_max" in entry ? entry.ideal_max ?? null : current.ideal_max,
        ideal_target: "ideal_target" in entry ? entry.ideal_target ?? null : current.ideal_target,
        allowed_min: "allowed_min" in entry ? entry.allowed_min ?? null : current.allowed_min,
        allowed_max: "allowed_max" in entry ? entry.allowed_max ?? null : current.allowed_max,
        enabled: "enabled" in entry ? entry.enabled ?? current.enabled : current.enabled
      };
    }

    const saved = await repository.upsert({
      poolId: this.poolId,
      settings: next
    });

    return {
      settings: listChlorinatorProfileSettings(saved.settings),
      source: "sqlite"
    };
  }

  private requireRepository(): ChlorinatorProfileSettingsRepository {
    if (!this.repository) {
      throw new ChlorinatorProfileSettingsUnavailableError("SQLite-backed chlorinator operating profile is not configured.");
    }
    return this.repository;
  }
}

export class SqliteChlorinatorProfileSettingsRepository implements ChlorinatorProfileSettingsRepository {
  constructor(private readonly database: SqliteDatabase) {}

  async get(poolId: string): Promise<StoredChlorinatorProfileSettings | null> {
    const row = this.database.get<ChlorinatorProfileSettingsRow>(
      `
        SELECT pool_id, profile_json
        FROM chlorinator_profiles
        WHERE pool_id = ?
      `,
      [poolId]
    );

    if (!row) {
      return null;
    }

    return {
      poolId: row.pool_id,
      settings: normalizeStoredSettings(row.profile_json)
    };
  }

  async upsert(settings: StoredChlorinatorProfileSettings): Promise<StoredChlorinatorProfileSettings> {
    const row = this.database.get<ChlorinatorProfileSettingsRow>(
      `
        INSERT INTO chlorinator_profiles (
          pool_id,
          profile_json,
          updated_at
        )
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT (pool_id) DO UPDATE SET
          profile_json = EXCLUDED.profile_json,
          updated_at = CURRENT_TIMESTAMP
        RETURNING pool_id, profile_json
      `,
      [settings.poolId, JSON.stringify(listChlorinatorProfileSettings(settings.settings))]
    );

    if (!row) {
      throw new Error("SQLite chlorinator profile upsert did not return a row.");
    }

    return {
      poolId: row.pool_id,
      settings: normalizeStoredSettings(row.profile_json)
    };
  }
}

interface ChlorinatorProfileSettingsRow extends Record<string, unknown> {
  pool_id: string;
  profile_json: string | null;
}

export function validateChlorinatorProfileSettingsUpdateInput(input: unknown): {
  settings: ChlorinatorProfileSettingsUpdateItem[];
} {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ChlorinatorProfileSettingsValidationError("Chlorinator profile settings are invalid.", {
      settings: "settings must be an array."
    });
  }

  const record = input as Record<string, unknown>;
  if (!Array.isArray(record.settings)) {
    throw new ChlorinatorProfileSettingsValidationError("Chlorinator profile settings are invalid.", {
      settings: "settings must be an array."
    });
  }

  const details: Record<string, string | Record<string, string>> = {};
  const normalized: ChlorinatorProfileSettingsUpdateItem[] = [];

  for (const [index, value] of record.settings.entries()) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      details[`item_${index}`] = "Each chlorinator profile entry must be a JSON object.";
      continue;
    }
    const entry = value as Record<string, unknown>;
    const chemicalKey = parseChemicalKey(entry.chemicalKey);
    if (!chemicalKey) {
      details[`item_${index}`] = "chemicalKey is required and must be supported.";
      continue;
    }

    const itemDetails: Record<string, string> = {};
    const idealMin = parseNullableNumber(entry.ideal_min);
    const idealMax = parseNullableNumber(entry.ideal_max);
    const idealTarget = parseNullableNumber(entry.ideal_target);
    const allowedMin = parseNullableNumber(entry.allowed_min);
    const allowedMax = parseNullableNumber(entry.allowed_max);

    if (entry.ideal_min !== undefined && idealMin === undefined) {
      itemDetails.ideal_min = "ideal_min must be numeric or null.";
    }
    if (entry.ideal_max !== undefined && idealMax === undefined) {
      itemDetails.ideal_max = "ideal_max must be numeric or null.";
    }
    if (entry.ideal_target !== undefined && idealTarget === undefined) {
      itemDetails.ideal_target = "ideal_target must be numeric or null.";
    }
    if (entry.allowed_min !== undefined && allowedMin === undefined) {
      itemDetails.allowed_min = "allowed_min must be numeric or null.";
    }
    if (entry.allowed_max !== undefined && allowedMax === undefined) {
      itemDetails.allowed_max = "allowed_max must be numeric or null.";
    }
    if (idealMin != null && idealMax != null && idealMin > idealMax) {
      itemDetails.ideal_range = "ideal_min must be less than or equal to ideal_max.";
    }
    if (allowedMin != null && allowedMax != null && allowedMin > allowedMax) {
      itemDetails.allowed_range = "allowed_min must be less than or equal to allowed_max.";
    }

    const enabled = entry.enabled;
    if (enabled !== undefined && typeof enabled !== "boolean") {
      itemDetails.enabled = "enabled must be a boolean.";
    }

    if (Object.keys(itemDetails).length > 0) {
      details[chemicalKey] = itemDetails;
      continue;
    }

    normalized.push({
      chemicalKey,
      ...(entry.ideal_min !== undefined ? { ideal_min: idealMin ?? null } : {}),
      ...(entry.ideal_max !== undefined ? { ideal_max: idealMax ?? null } : {}),
      ...(entry.ideal_target !== undefined ? { ideal_target: idealTarget ?? null } : {}),
      ...(entry.allowed_min !== undefined ? { allowed_min: allowedMin ?? null } : {}),
      ...(entry.allowed_max !== undefined ? { allowed_max: allowedMax ?? null } : {}),
      ...(typeof enabled === "boolean" ? { enabled } : {})
    });
  }

  if (Object.keys(details).length > 0) {
    throw new ChlorinatorProfileSettingsValidationError("Chlorinator profile settings are invalid.", details);
  }

  return { settings: normalized };
}

function parseChemicalKey(value: unknown): ChlorinatorProfileChemicalKey | null {
  return typeof value === "string" && KNOWN_CHEMICAL_KEYS.has(value as ChlorinatorProfileChemicalKey)
    ? (value as ChlorinatorProfileChemicalKey)
    : null;
}

function parseNullableNumber(value: unknown): number | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || value === "") {
    return null;
  }
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function defaultChlorinatorProfileSettingsMap(): Record<ChlorinatorProfileChemicalKey, ChlorinatorProfileSetting> {
  return Object.fromEntries(
    DEFAULT_CHLORINATOR_PROFILE_SETTINGS.map((setting) => [setting.chemicalKey, { ...setting }])
  ) as Record<ChlorinatorProfileChemicalKey, ChlorinatorProfileSetting>;
}

function cloneChlorinatorProfileSettingsMap(
  settings: Record<ChlorinatorProfileChemicalKey, ChlorinatorProfileSetting>
): Record<ChlorinatorProfileChemicalKey, ChlorinatorProfileSetting> {
  return Object.fromEntries(
    Object.values(settings).map((setting) => [setting.chemicalKey, { ...setting }])
  ) as Record<ChlorinatorProfileChemicalKey, ChlorinatorProfileSetting>;
}

function listChlorinatorProfileSettings(
  settings: Record<ChlorinatorProfileChemicalKey, ChlorinatorProfileSetting>
): ChlorinatorProfileSetting[] {
  return Object.values(settings).sort(
    (left, right) => left.sortOrder - right.sortOrder || left.displayName.localeCompare(right.displayName)
  );
}

function normalizeStoredSettings(value: string | null): Record<ChlorinatorProfileChemicalKey, ChlorinatorProfileSetting> {
  const defaults = defaultChlorinatorProfileSettingsMap();
  if (!value) {
    return defaults;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return defaults;
  }

  if (!Array.isArray(parsed)) {
    return defaults;
  }

  const result = defaultChlorinatorProfileSettingsMap();
  for (const item of parsed) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const record = item as Record<string, unknown>;
    const chemicalKey = parseChemicalKey(record.chemicalKey);
    if (!chemicalKey) {
      continue;
    }
    const current = result[chemicalKey];
    result[chemicalKey] = {
      ...current,
      ideal_min: Object.hasOwn(record, "ideal_min") ? parseNullableNumber(record.ideal_min) ?? null : current.ideal_min,
      ideal_max: Object.hasOwn(record, "ideal_max") ? parseNullableNumber(record.ideal_max) ?? null : current.ideal_max,
      ideal_target: Object.hasOwn(record, "ideal_target") ? parseNullableNumber(record.ideal_target) ?? null : current.ideal_target,
      allowed_min: Object.hasOwn(record, "allowed_min") ? parseNullableNumber(record.allowed_min) ?? null : current.allowed_min,
      allowed_max: Object.hasOwn(record, "allowed_max") ? parseNullableNumber(record.allowed_max) ?? null : current.allowed_max,
      enabled: typeof record.enabled === "boolean" ? record.enabled : current.enabled
    };
  }
  return result;
}
