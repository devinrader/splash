import type { SqliteDatabase } from "./database.js";

export type PoolChemistryKey =
  | "free_chlorine"
  | "total_chlorine"
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
  source_mode: PoolChemistrySourceMode;
  source_binding: PoolChemistrySourceBinding | null;
  available_sources: PoolChemistryAvailableSource[];
}

export type PoolChemistrySourceMode = "manual" | "hardware";

export interface PoolChemistrySourceBinding {
  provider_type: "controller" | "chlorinator";
  provider_id: string;
  measurement_key: "salt" | "water_temperature";
}

export interface PoolChemistryAvailableSource extends PoolChemistrySourceBinding {
  label: string;
}

export interface PoolChemistrySettingsView {
  settings: PoolChemistrySetting[];
  chemistry_prompt_interval_days: number;
  source: "sqlite" | "defaults";
}

export interface PoolChemistrySettingsUpdateItem {
  chemicalKey: PoolChemistryKey;
  minimum?: number | null;
  target?: number | null;
  maximum?: number | null;
  enabled?: boolean;
  source_mode?: PoolChemistrySourceMode;
  source_binding?: PoolChemistrySourceBinding | null;
}

export interface SwimmabilityPolicyBoundsRecord {
  min: number | null;
  target: number | null;
  max: number | null;
  unit: string | null;
}

export interface SwimmabilityPolicyBounds {
  freeChlorine?: SwimmabilityPolicyBoundsRecord;
  totalChlorine?: SwimmabilityPolicyBoundsRecord;
  ph?: SwimmabilityPolicyBoundsRecord;
  totalAlkalinity?: SwimmabilityPolicyBoundsRecord;
  cyanuricAcid?: SwimmabilityPolicyBoundsRecord;
  calciumHardness?: SwimmabilityPolicyBoundsRecord;
  salt?: SwimmabilityPolicyBoundsRecord;
  waterTemperature?: SwimmabilityPolicyBoundsRecord;
  phosphates?: SwimmabilityPolicyBoundsRecord;
  borates?: SwimmabilityPolicyBoundsRecord;
}

export type PoolChemistryBoundsRecord = SwimmabilityPolicyBoundsRecord;
export type PoolChemistryRecommendationBounds = SwimmabilityPolicyBounds;

interface StoredPoolChemistrySettings {
  poolId: string;
  settings: Record<PoolChemistryKey, PoolChemistrySetting>;
  chemistryPromptIntervalDays: number;
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
    sortOrder: 10,
    source_mode: "manual",
    source_binding: null,
    available_sources: []
  },
  {
    chemicalKey: "total_chlorine",
    displayName: "Total Chlorine",
    unit: "ppm",
    minimum: 0,
    target: 5,
    maximum: 10,
      enabled: true,
    sortOrder: 20,
    source_mode: "manual",
    source_binding: null,
    available_sources: []
  },
  {
    chemicalKey: "ph",
    displayName: "pH",
    unit: null,
    minimum: 7.2,
    target: 7.6,
    maximum: 7.8,
      enabled: true,
    sortOrder: 30,
    source_mode: "manual",
    source_binding: null,
    available_sources: []
  },
  {
    chemicalKey: "total_alkalinity",
    displayName: "Total Alkalinity",
    unit: "ppm",
    minimum: 60,
    target: 80,
    maximum: 100,
      enabled: true,
    sortOrder: 40,
    source_mode: "manual",
    source_binding: null,
    available_sources: []
  },
  {
    chemicalKey: "cyanuric_acid",
    displayName: "Cyanuric Acid",
    unit: "ppm",
    minimum: 60,
    target: 70,
    maximum: 80,
      enabled: true,
    sortOrder: 50,
    source_mode: "manual",
    source_binding: null,
    available_sources: []
  },
  {
    chemicalKey: "calcium_hardness",
    displayName: "Calcium Hardness",
    unit: "ppm",
    minimum: 200,
    target: 300,
    maximum: 400,
      enabled: true,
    sortOrder: 60,
    source_mode: "manual",
    source_binding: null,
    available_sources: []
  },
  {
    chemicalKey: "salt",
    displayName: "Salt",
    unit: "ppm",
    minimum: 3000,
    target: 3400,
    maximum: 4000,
      enabled: true,
    sortOrder: 70,
    source_mode: "hardware",
    source_binding: {
      provider_type: "chlorinator",
      provider_id: "chlorinator-1",
      measurement_key: "salt"
    },
    available_sources: []
  },
  {
    chemicalKey: "water_temperature",
    displayName: "Water Temperature",
    unit: "F",
    minimum: 70,
    target: 84,
    maximum: 92,
      enabled: true,
    sortOrder: 80,
    source_mode: "hardware",
    source_binding: {
      provider_type: "controller",
      provider_id: "controller-1",
      measurement_key: "water_temperature"
    },
    available_sources: []
  },
  {
    chemicalKey: "phosphates",
    displayName: "Phosphates",
    unit: "ppb",
    minimum: 0,
    target: 0,
    maximum: 200,
      enabled: false,
    sortOrder: 90,
    source_mode: "manual",
    source_binding: null,
    available_sources: []
  },
  {
    chemicalKey: "borates",
    displayName: "Borates",
    unit: "ppm",
    minimum: 30,
    target: 50,
    maximum: 60,
      enabled: false,
    sortOrder: 100,
    source_mode: "manual",
    source_binding: null,
    available_sources: []
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
        chemistry_prompt_interval_days: 3,
        source: "defaults"
      };
    }

    const stored = await this.repository.get(this.poolId);
    return {
      settings: listPoolChemistrySettings(stored?.settings ?? defaultPoolChemistrySettingsMap()),
      chemistry_prompt_interval_days: stored?.chemistryPromptIntervalDays ?? 3,
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
      settings: merged,
      chemistryPromptIntervalDays: update.chemistry_prompt_interval_days ?? stored?.chemistryPromptIntervalDays ?? 3
    });
    return {
      settings: listPoolChemistrySettings(saved.settings),
      chemistry_prompt_interval_days: saved.chemistryPromptIntervalDays,
      source: "sqlite"
    };
  }

  async getChemistryBoundsForRecommendations(): Promise<SwimmabilityPolicyBounds> {
    return this.getSwimmabilityPolicyBounds();
  }

  async getSwimmabilityPolicyBounds(): Promise<SwimmabilityPolicyBounds> {
    if (!this.repository) {
      return toRecommendationBounds(defaultPoolChemistrySettingsMap());
    }

    const stored = await this.repository.get(this.poolId);
    return toRecommendationBounds(stored?.settings ?? defaultPoolChemistrySettingsMap());
  }

  async getChemistryPromptIntervalDays(): Promise<number> {
    if (!this.repository) {
      return 3;
    }

    const stored = await this.repository.get(this.poolId);
    return stored?.chemistryPromptIntervalDays ?? 3;
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
        SELECT pool_id, chemistry_bounds, chemistry_prompt_interval_days
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
      settings: mapStoredChemistryBounds(row.chemistry_bounds),
      chemistryPromptIntervalDays: normalizePromptInterval(row.chemistry_prompt_interval_days)
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
          chemistry_prompt_interval_days,
          updated_at
        )
        VALUES (?, 'address', '', '', '', '', '', ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT (pool_id) DO UPDATE SET
          chemistry_bounds = EXCLUDED.chemistry_bounds,
          chemistry_prompt_interval_days = EXCLUDED.chemistry_prompt_interval_days,
          updated_at = CURRENT_TIMESTAMP
        RETURNING pool_id, chemistry_bounds, chemistry_prompt_interval_days
      `,
      [settings.poolId, JSON.stringify(settings.settings), settings.chemistryPromptIntervalDays]
    );

    if (!row) {
      throw new Error("SQLite chemistry settings upsert did not return a row.");
    }

    return {
      poolId: row.pool_id,
      settings: mapStoredChemistryBounds(row.chemistry_bounds),
      chemistryPromptIntervalDays: normalizePromptInterval(row.chemistry_prompt_interval_days)
    };
  }
}

interface PoolChemistrySettingsRow extends Record<string, unknown> {
  pool_id: string;
  chemistry_bounds: Record<string, unknown> | string | null;
  chemistry_prompt_interval_days: number | null;
}

export function validatePoolChemistrySettingsUpdateInput(
  input: unknown
): { settings: PoolChemistrySettingsUpdateItem[]; chemistry_prompt_interval_days?: number } {
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
    const sourceMode = optionalSourceMode(itemRecord.source_mode);
    const sourceBinding = normalizeSourceBinding(itemRecord.source_binding);

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
    if (itemRecord.source_mode !== undefined && sourceMode === null) {
      itemDetails.source_mode = "Source mode must be either 'manual' or 'hardware'.";
    }
    if (itemRecord.source_binding !== undefined && sourceBinding === undefined) {
      itemDetails.source_binding = "Source binding must be null or a valid hardware binding.";
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
      enabled: enabled ?? undefined,
      source_mode: sourceMode ?? undefined,
      source_binding: sourceBinding
    });
  }

  if (Object.keys(details).length > 0) {
    throw new PoolChemistrySettingsValidationError("Pool chemistry settings are invalid.", details);
  }

  const chemistryPromptIntervalDays = parsePositiveInteger(record.chemistry_prompt_interval_days);
  if (record.chemistry_prompt_interval_days !== undefined && chemistryPromptIntervalDays === null) {
    throw new PoolChemistrySettingsValidationError("Pool chemistry settings are invalid.", {
      ...details,
      chemistry_prompt_interval_days: "Chemistry prompt interval must be a positive integer."
    });
  }

  return {
    settings: normalized,
    ...(chemistryPromptIntervalDays != null ? { chemistry_prompt_interval_days: chemistryPromptIntervalDays } : {})
  };
}

export function defaultPoolChemistrySettingsMap(): Record<PoolChemistryKey, PoolChemistrySetting> {
  return DEFAULT_POOL_CHEMISTRY_SETTINGS.reduce(
    (accumulator, setting) => {
      accumulator[setting.chemicalKey] = {
        ...setting,
        available_sources: deriveAvailableSources(setting.chemicalKey)
      };
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
      enabled: update.enabled !== undefined ? update.enabled : currentSetting.enabled,
      source_mode: update.source_mode !== undefined ? update.source_mode : currentSetting.source_mode,
      source_binding: update.source_binding !== undefined ? update.source_binding : currentSetting.source_binding,
      available_sources: deriveAvailableSources(update.chemicalKey)
    };

    const relationError = validateBoundOrdering(merged);
    if (relationError) {
      details[update.chemicalKey] = relationError;
      continue;
    }

    const sourceError = validateSourceSelection(merged);
    if (sourceError) {
      details[update.chemicalKey] = {
        ...(typeof details[update.chemicalKey] === "object" ? details[update.chemicalKey] as Record<string, string> : {}),
        ...sourceError
      };
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

function toRecommendationBounds(settings: Record<PoolChemistryKey, PoolChemistrySetting>): SwimmabilityPolicyBounds {
  const result: SwimmabilityPolicyBounds = {};

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
      case "total_chlorine":
        result.totalChlorine = value;
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
    const normalizedKey = normalizeStoredChemistryKey(key);
    if (!normalizedKey) {
      continue;
    }
    if (!rawSetting || typeof rawSetting !== "object" || Array.isArray(rawSetting)) {
      continue;
    }

    const settingRecord = rawSetting as Record<string, unknown>;
    const base = result[normalizedKey];
    const isLegacyCombinedChlorine = key === "combined_chlorine";
    const merged: PoolChemistrySetting = {
      chemicalKey: base.chemicalKey,
      displayName: isLegacyCombinedChlorine
        ? base.displayName
        : typeof settingRecord.displayName === "string" && settingRecord.displayName.trim().length > 0
          ? settingRecord.displayName
          : base.displayName,
      unit: isLegacyCombinedChlorine ? base.unit : typeof settingRecord.unit === "string" ? settingRecord.unit : base.unit,
      minimum: isLegacyCombinedChlorine ? base.minimum : optionalFiniteNumber(settingRecord.minimum),
      target: isLegacyCombinedChlorine ? base.target : optionalFiniteNumber(settingRecord.target),
      maximum: isLegacyCombinedChlorine ? base.maximum : optionalFiniteNumber(settingRecord.maximum),
      enabled: typeof settingRecord.enabled === "boolean" ? settingRecord.enabled : base.enabled,
      sortOrder: typeof settingRecord.sortOrder === "number" && Number.isFinite(settingRecord.sortOrder) ? settingRecord.sortOrder : base.sortOrder,
      source_mode: optionalSourceMode(settingRecord.source_mode) ?? base.source_mode,
      source_binding: normalizeSourceBinding(settingRecord.source_binding) ?? base.source_binding,
      available_sources: deriveAvailableSources(base.chemicalKey)
    };

    const relationError = validateBoundOrdering(merged);
    const sourceError = validateSourceSelection(merged);
    if (!relationError && !sourceError) {
      result[normalizedKey] = merged;
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

function optionalSourceMode(value: unknown): PoolChemistrySourceMode | null {
  return value === "manual" || value === "hardware" ? value : null;
}

function normalizeStoredChemistryKey(value: string): PoolChemistryKey | null {
  if (value === "combined_chlorine") {
    return "total_chlorine";
  }
  return KNOWN_CHEMICAL_KEYS.has(value as PoolChemistryKey) ? (value as PoolChemistryKey) : null;
}

function normalizeSourceBinding(value: unknown): PoolChemistrySourceBinding | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const providerType = record.provider_type;
  const providerId = record.provider_id;
  const measurementKey = record.measurement_key;
  if (
    (providerType !== "controller" && providerType !== "chlorinator")
    || typeof providerId !== "string"
    || providerId.trim().length === 0
    || (measurementKey !== "salt" && measurementKey !== "water_temperature")
  ) {
    return undefined;
  }

  return {
    provider_type: providerType,
    provider_id: providerId.trim(),
    measurement_key: measurementKey
  };
}

function parsePositiveInteger(value: unknown): number | null {
  if (value === undefined) {
    return null;
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return null;
  }
  return value;
}

function normalizePromptInterval(value: number | null | undefined): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : 3;
}

function deriveAvailableSources(chemicalKey: PoolChemistryKey): PoolChemistryAvailableSource[] {
  switch (chemicalKey) {
    case "salt":
      return [
        {
          provider_type: "chlorinator",
          provider_id: "chlorinator-1",
          measurement_key: "salt",
          label: "EasyTouch Chlorinator Salt"
        }
      ];
    case "water_temperature":
      return [
        {
          provider_type: "controller",
          provider_id: "controller-1",
          measurement_key: "water_temperature",
          label: "EasyTouch Controller Water Temperature"
        }
      ];
    default:
      return [];
  }
}

function validateSourceSelection(setting: PoolChemistrySetting): Record<string, string> | null {
  if (setting.source_mode === "manual") {
    if (setting.source_binding !== null) {
      return {
        source_binding: "Manual source mode must not keep a hardware binding."
      };
    }
    return null;
  }

  if (!setting.source_binding) {
    return {
      source_binding: "A hardware source must be selected when source mode is hardware."
    };
  }

  const match = setting.available_sources.some((source) =>
    source.provider_type === setting.source_binding?.provider_type
    && source.provider_id === setting.source_binding?.provider_id
    && source.measurement_key === setting.source_binding?.measurement_key
  );

  if (!match) {
    return {
      source_binding: "Selected hardware source is not compatible with this chemistry key."
    };
  }

  return null;
}
