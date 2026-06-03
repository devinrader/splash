import type { SqliteDatabase } from "./database.js";

export type PoolChemistryKey =
  | "free_chlorine"
  | "combined_chlorine"
  | "ph"
  | "total_alkalinity"
  | "cyanuric_acid"
  | "calcium_hardness"
  | "salt"
  | "water_temperature"
  | "phosphates"
  | "borates";

export interface PoolChemistrySetting {
  chemicalKey: PoolChemistryKey;
  displayName: string;
  unit: string | null;
  minimum: number | null;
  target: number | null;
  maximum: number | null;
  enabled: boolean;
  sortOrder: number;
}

export interface PoolChemistrySettingsView {
  settings: PoolChemistrySetting[];
  source: "sqlite" | "defaults";
}

export interface PoolChemistrySettingsUpdateItem {
  chemicalKey: PoolChemistryKey;
  minimum?: number | null;
  target?: number | null;
  maximum?: number | null;
  enabled?: boolean;
}

export interface PoolChemistryBoundsRecord {
  min: number | null;
  target: number | null;
  max: number | null;
  unit: string | null;
}

export interface PoolChemistryRecommendationBounds {
  freeChlorine?: PoolChemistryBoundsRecord;
  combinedChlorine?: PoolChemistryBoundsRecord;
  ph?: PoolChemistryBoundsRecord;
  totalAlkalinity?: PoolChemistryBoundsRecord;
  cyanuricAcid?: PoolChemistryBoundsRecord;
  calciumHardness?: PoolChemistryBoundsRecord;
  salt?: PoolChemistryBoundsRecord;
  waterTemperature?: PoolChemistryBoundsRecord;
  phosphates?: PoolChemistryBoundsRecord;
  borates?: PoolChemistryBoundsRecord;
}

interface StoredPoolChemistrySettings {
  poolId: string;
  settings: Record<PoolChemistryKey, PoolChemistrySetting>;
}

export interface PoolChemistrySettingsRepository {
  get(poolId: string): Promise<StoredPoolChemistrySettings | null>;
  upsert(settings: StoredPoolChemistrySettings): Promise<StoredPoolChemistrySettings>;
}

export class PoolChemistrySettingsValidationError extends Error {
  constructor(
    message: string,
    readonly details: Record<string, string | Record<string, string>>
  ) {
    super(message);
    this.name = "PoolChemistrySettingsValidationError";
  }
}

export class PoolChemistrySettingsUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PoolChemistrySettingsUnavailableError";
  }
}

const DEFAULT_POOL_CHEMISTRY_SETTINGS: PoolChemistrySetting[] = [
  {
    chemicalKey: "free_chlorine",
    displayName: "Free Chlorine",
    unit: "ppm",
    minimum: 3,
    target: 5,
    maximum: 10,
    enabled: true,
    sortOrder: 10
  },
  {
    chemicalKey: "combined_chlorine",
    displayName: "Combined Chlorine",
    unit: "ppm",
    minimum: 0,
    target: 0,
    maximum: 0.5,
    enabled: true,
    sortOrder: 20
  },
  {
    chemicalKey: "ph",
    displayName: "pH",
    unit: null,
    minimum: 7.2,
    target: 7.6,
    maximum: 7.8,
    enabled: true,
    sortOrder: 30
  },
  {
    chemicalKey: "total_alkalinity",
    displayName: "Total Alkalinity",
    unit: "ppm",
    minimum: 60,
    target: 80,
    maximum: 100,
    enabled: true,
    sortOrder: 40
  },
  {
    chemicalKey: "cyanuric_acid",
    displayName: "Cyanuric Acid",
    unit: "ppm",
    minimum: 60,
    target: 70,
    maximum: 80,
    enabled: true,
    sortOrder: 50
  },
  {
    chemicalKey: "calcium_hardness",
    displayName: "Calcium Hardness",
    unit: "ppm",
    minimum: 200,
    target: 300,
    maximum: 400,
    enabled: true,
    sortOrder: 60
  },
  {
    chemicalKey: "salt",
    displayName: "Salt",
    unit: "ppm",
    minimum: 3000,
    target: 3400,
    maximum: 4000,
    enabled: true,
    sortOrder: 70
  },
  {
    chemicalKey: "water_temperature",
    displayName: "Water Temperature",
    unit: "F",
    minimum: 70,
    target: 84,
    maximum: 92,
    enabled: true,
    sortOrder: 80
  },
  {
    chemicalKey: "phosphates",
    displayName: "Phosphates",
    unit: "ppb",
    minimum: 0,
    target: 0,
    maximum: 200,
    enabled: false,
    sortOrder: 90
  },
  {
    chemicalKey: "borates",
    displayName: "Borates",
    unit: "ppm",
    minimum: 30,
    target: 50,
    maximum: 60,
    enabled: false,
    sortOrder: 100
  }
];

const KNOWN_CHEMICAL_KEYS = new Set<PoolChemistryKey>(DEFAULT_POOL_CHEMISTRY_SETTINGS.map((setting) => setting.chemicalKey));

export class PoolChemistrySettingsService {
  constructor(
    private readonly poolId: string,
    private readonly repository: PoolChemistrySettingsRepository | null
  ) {}

  async getPoolChemistrySettings(): Promise<PoolChemistrySettingsView> {
    if (!this.repository) {
      return {
        settings: listPoolChemistrySettings(defaultPoolChemistrySettingsMap()),
        source: "defaults"
      };
    }

    const stored = await this.repository.get(this.poolId);
      return {
        settings: listPoolChemistrySettings(stored?.settings ?? defaultPoolChemistrySettingsMap()),
        source: stored ? "sqlite" : "defaults"
      };
  }

  async updatePoolChemistrySettings(input: unknown): Promise<PoolChemistrySettingsView> {
    const repository = this.requireRepository();
    const update = validatePoolChemistrySettingsUpdateInput(input);
    const stored = await repository.get(this.poolId);
    const base = stored?.settings ?? defaultPoolChemistrySettingsMap();
    const merged = applyPoolChemistrySettingsUpdate(base, update.settings);
    const saved = await repository.upsert({
      poolId: this.poolId,
      settings: merged
    });
    return {
      settings: listPoolChemistrySettings(saved.settings),
      source: "sqlite"
    };
  }

  async getChemistryBoundsForRecommendations(): Promise<PoolChemistryRecommendationBounds> {
    if (!this.repository) {
      return toRecommendationBounds(defaultPoolChemistrySettingsMap());
    }

    const stored = await this.repository.get(this.poolId);
    return toRecommendationBounds(stored?.settings ?? defaultPoolChemistrySettingsMap());
  }

  private requireRepository(): PoolChemistrySettingsRepository {
    if (!this.repository) {
      throw new PoolChemistrySettingsUnavailableError("SQLite-backed pool chemistry settings are not configured.");
    }
    return this.repository;
  }
}

export class SqlitePoolChemistrySettingsRepository implements PoolChemistrySettingsRepository {
  constructor(private readonly database: SqliteDatabase) {}

  async get(poolId: string): Promise<StoredPoolChemistrySettings | null> {
    const row = this.database.get<PoolChemistrySettingsRow>(
      `
        SELECT pool_id, chemistry_bounds
        FROM pool_settings
        WHERE pool_id = ?
      `,
      [poolId]
    );

    if (!row) {
      return null;
    }

    return {
      poolId: row.pool_id,
      settings: mapStoredChemistryBounds(row.chemistry_bounds)
    };
  }

  async upsert(settings: StoredPoolChemistrySettings): Promise<StoredPoolChemistrySettings> {
    const row = this.database.get<PoolChemistrySettingsRow>(
      `
        INSERT INTO pool_settings (
          pool_id,
          weather_location_mode,
          weather_location_address_line1,
          weather_location_city,
          weather_location_state_region,
          weather_location_postal_code,
          weather_location_country,
          chemistry_bounds,
          updated_at
        )
        VALUES (?, 'address', '', '', '', '', '', ?, CURRENT_TIMESTAMP)
        ON CONFLICT (pool_id) DO UPDATE SET
          chemistry_bounds = EXCLUDED.chemistry_bounds,
          updated_at = CURRENT_TIMESTAMP
        RETURNING pool_id, chemistry_bounds
      `,
      [settings.poolId, JSON.stringify(settings.settings)]
    );

    if (!row) {
      throw new Error("SQLite chemistry settings upsert did not return a row.");
    }

    return {
      poolId: row.pool_id,
      settings: mapStoredChemistryBounds(row.chemistry_bounds)
    };
  }
}

interface PoolChemistrySettingsRow extends Record<string, unknown> {
  pool_id: string;
  chemistry_bounds: Record<string, unknown> | string | null;
}

export function validatePoolChemistrySettingsUpdateInput(input: unknown): { settings: PoolChemistrySettingsUpdateItem[] } {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new PoolChemistrySettingsValidationError("Pool chemistry settings are invalid.", {
      form: "Request body must be a JSON object."
    });
  }

  const record = input as Record<string, unknown>;
  if (!Array.isArray(record.settings) || record.settings.length === 0) {
    throw new PoolChemistrySettingsValidationError("Pool chemistry settings are invalid.", {
      settings: "Settings must be a non-empty array."
    });
  }

  const details: Record<string, string | Record<string, string>> = {};
  const normalized: PoolChemistrySettingsUpdateItem[] = [];

  for (const item of record.settings) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      details[`item_${normalized.length}`] = "Each chemistry settings entry must be a JSON object.";
      continue;
    }

    const itemRecord = item as Record<string, unknown>;
    const chemicalKey = itemRecord.chemicalKey;
    const itemDetails: Record<string, string> = {};

    if (typeof chemicalKey !== "string" || !KNOWN_CHEMICAL_KEYS.has(chemicalKey as PoolChemistryKey)) {
      itemDetails.chemicalKey = "chemicalKey must be one of the supported built-in chemistry keys.";
    }

    const minimum = optionalFiniteNumber(itemRecord.minimum);
    const target = optionalFiniteNumber(itemRecord.target);
    const maximum = optionalFiniteNumber(itemRecord.maximum);
    const enabled = optionalBoolean(itemRecord.enabled);

    if (itemRecord.minimum !== undefined && minimum === null) {
      itemDetails.minimum = "Minimum must be a valid number.";
    }
    if (itemRecord.target !== undefined && target === null) {
      itemDetails.target = "Target must be a valid number.";
    }
    if (itemRecord.maximum !== undefined && maximum === null) {
      itemDetails.maximum = "Maximum must be a valid number.";
    }
    if (itemRecord.enabled !== undefined && enabled === null) {
      itemDetails.enabled = "Enabled must be a boolean.";
    }

    if (Object.keys(itemDetails).length > 0) {
      details[String(chemicalKey ?? `item_${normalized.length}`)] = itemDetails;
      continue;
    }

    normalized.push({
      chemicalKey: chemicalKey as PoolChemistryKey,
      minimum,
      target,
      maximum,
      enabled: enabled ?? undefined
    });
  }

  if (Object.keys(details).length > 0) {
    throw new PoolChemistrySettingsValidationError("Pool chemistry settings are invalid.", details);
  }

  return { settings: normalized };
}

export function defaultPoolChemistrySettingsMap(): Record<PoolChemistryKey, PoolChemistrySetting> {
  return DEFAULT_POOL_CHEMISTRY_SETTINGS.reduce(
    (accumulator, setting) => {
      accumulator[setting.chemicalKey] = { ...setting };
      return accumulator;
    },
    {} as Record<PoolChemistryKey, PoolChemistrySetting>
  );
}

function applyPoolChemistrySettingsUpdate(
  current: Record<PoolChemistryKey, PoolChemistrySetting>,
  updates: PoolChemistrySettingsUpdateItem[]
): Record<PoolChemistryKey, PoolChemistrySetting> {
  const next: Record<PoolChemistryKey, PoolChemistrySetting> = Object.fromEntries(
    Object.entries(current).map(([key, value]) => [key, { ...value }])
  ) as Record<PoolChemistryKey, PoolChemistrySetting>;

  const details: Record<string, string | Record<string, string>> = {};

  for (const update of updates) {
    const currentSetting = next[update.chemicalKey];
    const merged: PoolChemistrySetting = {
      ...currentSetting,
      minimum: update.minimum !== undefined ? update.minimum : currentSetting.minimum,
      target: update.target !== undefined ? update.target : currentSetting.target,
      maximum: update.maximum !== undefined ? update.maximum : currentSetting.maximum,
      enabled: update.enabled !== undefined ? update.enabled : currentSetting.enabled
    };

    const relationError = validateBoundOrdering(merged);
    if (relationError) {
      details[update.chemicalKey] = relationError;
      continue;
    }

    next[update.chemicalKey] = merged;
  }

  if (Object.keys(details).length > 0) {
    throw new PoolChemistrySettingsValidationError("Pool chemistry settings are invalid.", details);
  }

  return next;
}

function validateBoundOrdering(setting: PoolChemistrySetting): Record<string, string> | null {
  const details: Record<string, string> = {};

  if (
    setting.minimum !== null &&
    setting.target !== null &&
    setting.minimum > setting.target
  ) {
    details.target = "Target must be greater than or equal to minimum and less than or equal to maximum.";
  }

  if (
    setting.target !== null &&
    setting.maximum !== null &&
    setting.target > setting.maximum
  ) {
    details.target = "Target must be greater than or equal to minimum and less than or equal to maximum.";
  }

  if (
    setting.minimum !== null &&
    setting.maximum !== null &&
    setting.minimum > setting.maximum
  ) {
    details.minimum = "Minimum must be less than or equal to maximum.";
  }

  return Object.keys(details).length > 0 ? details : null;
}

function toRecommendationBounds(settings: Record<PoolChemistryKey, PoolChemistrySetting>): PoolChemistryRecommendationBounds {
  const result: PoolChemistryRecommendationBounds = {};

  for (const setting of listPoolChemistrySettings(settings)) {
    if (!setting.enabled) {
      continue;
    }

    const value = {
      min: setting.minimum,
      target: setting.target,
      max: setting.maximum,
      unit: setting.unit
    };

    switch (setting.chemicalKey) {
      case "free_chlorine":
        result.freeChlorine = value;
        break;
      case "combined_chlorine":
        result.combinedChlorine = value;
        break;
      case "ph":
        result.ph = value;
        break;
      case "total_alkalinity":
        result.totalAlkalinity = value;
        break;
      case "cyanuric_acid":
        result.cyanuricAcid = value;
        break;
      case "calcium_hardness":
        result.calciumHardness = value;
        break;
      case "salt":
        result.salt = value;
        break;
      case "water_temperature":
        result.waterTemperature = value;
        break;
      case "phosphates":
        result.phosphates = value;
        break;
      case "borates":
        result.borates = value;
        break;
    }
  }

  return result;
}

function listPoolChemistrySettings(settings: Record<PoolChemistryKey, PoolChemistrySetting>): PoolChemistrySetting[] {
  return Object.values(settings).sort((left, right) => left.sortOrder - right.sortOrder || left.displayName.localeCompare(right.displayName));
}

function mapStoredChemistryBounds(value: Record<string, unknown> | string | null): Record<PoolChemistryKey, PoolChemistrySetting> {
  const defaults = defaultPoolChemistrySettingsMap();
  if (!value) {
    return defaults;
  }

  const parsed = typeof value === "string" ? safeJsonParse(value) : value;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return defaults;
  }

  const result = defaultPoolChemistrySettingsMap();
  for (const [key, rawSetting] of Object.entries(parsed)) {
    if (!KNOWN_CHEMICAL_KEYS.has(key as PoolChemistryKey)) {
      continue;
    }
    if (!rawSetting || typeof rawSetting !== "object" || Array.isArray(rawSetting)) {
      continue;
    }

    const settingRecord = rawSetting as Record<string, unknown>;
    const base = result[key as PoolChemistryKey];
    const merged: PoolChemistrySetting = {
      chemicalKey: base.chemicalKey,
      displayName: typeof settingRecord.displayName === "string" && settingRecord.displayName.trim().length > 0 ? settingRecord.displayName : base.displayName,
      unit: typeof settingRecord.unit === "string" ? settingRecord.unit : base.unit,
      minimum: optionalFiniteNumber(settingRecord.minimum),
      target: optionalFiniteNumber(settingRecord.target),
      maximum: optionalFiniteNumber(settingRecord.maximum),
      enabled: typeof settingRecord.enabled === "boolean" ? settingRecord.enabled : base.enabled,
      sortOrder: typeof settingRecord.sortOrder === "number" && Number.isFinite(settingRecord.sortOrder) ? settingRecord.sortOrder : base.sortOrder
    };

    const relationError = validateBoundOrdering(merged);
    if (!relationError) {
      result[key as PoolChemistryKey] = merged;
    }
  }

  return result;
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function optionalFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function optionalBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }
  return null;
}
