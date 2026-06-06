import type { ChemistryReadingRecord } from "./chemistry-readings.js";
import type { SqliteDatabase } from "./database.js";
import type { TemperatureLatestView } from "./temperature-telemetry.js";

export type WaterTestingScheduleChemicalKey =
  | "free_chlorine"
  | "ph"
  | "total_alkalinity"
  | "combined_chlorine"
  | "calcium_hardness"
  | "cyanuric_acid"
  | "salt"
  | "water_temperature";

export type WaterTestingIntervalUnit = "hours" | "days";
export type WaterTestingFreshnessStatus = "current" | "stale" | "unavailable" | "disabled";

export interface WaterTestingScheduleItem {
  chemicalKey: WaterTestingScheduleChemicalKey;
  displayName: string;
  enabled: boolean;
  expectedIntervalValue: number;
  expectedIntervalUnit: WaterTestingIntervalUnit;
  staleThresholdValue: number;
  staleThresholdUnit: WaterTestingIntervalUnit;
  unavailableThresholdValue: number;
  unavailableThresholdUnit: WaterTestingIntervalUnit;
  updatedAt: string | null;
}

export interface WaterTestingScheduleItemView extends WaterTestingScheduleItem {
  status: WaterTestingFreshnessStatus;
  lastObservedAt: string | null;
}

export interface WaterTestingScheduleView {
  items: WaterTestingScheduleItem[];
  source: "sqlite" | "defaults";
}

export interface WaterTestingScheduleStatusView {
  items: WaterTestingScheduleItemView[];
  source: "sqlite" | "defaults";
}

interface StoredWaterTestingSchedule {
  poolId: string;
  items: Record<WaterTestingScheduleChemicalKey, WaterTestingScheduleItem>;
}

export interface WaterTestingScheduleRepository {
  get(poolId: string): Promise<StoredWaterTestingSchedule | null>;
  upsert(schedule: StoredWaterTestingSchedule): Promise<StoredWaterTestingSchedule>;
}

export interface WaterTestingScheduleUpdateItem {
  chemicalKey: WaterTestingScheduleChemicalKey;
  enabled?: boolean;
  expectedIntervalValue?: number;
  expectedIntervalUnit?: WaterTestingIntervalUnit;
  staleThresholdValue?: number;
  staleThresholdUnit?: WaterTestingIntervalUnit;
  unavailableThresholdValue?: number;
  unavailableThresholdUnit?: WaterTestingIntervalUnit;
}

export interface WaterTestingFreshnessInput {
  chemistryReadings: ChemistryReadingRecord[];
  latestTemperatures: TemperatureLatestView;
  saltTelemetry: {
    saltPpm: number | null;
    updatedAt: string | null;
  } | null;
  now?: string;
}

export interface WaterTestingFreshnessItem {
  chemicalKey: WaterTestingScheduleChemicalKey;
  displayName: string;
  enabled: boolean;
  status: WaterTestingFreshnessStatus;
  lastObservedAt: string | null;
  expectedIntervalValue: number;
  expectedIntervalUnit: WaterTestingIntervalUnit;
  staleThresholdValue: number;
  staleThresholdUnit: WaterTestingIntervalUnit;
  unavailableThresholdValue: number;
  unavailableThresholdUnit: WaterTestingIntervalUnit;
}

export interface WaterTestingFreshnessView {
  items: WaterTestingFreshnessItem[];
  generatedAt: string;
}

interface WaterTestingScheduleRow extends Record<string, unknown> {
  pool_id: string;
  water_testing_schedule: Record<string, unknown> | string | null;
}

const DEFAULT_SCHEDULE: WaterTestingScheduleItem[] = [
  {
    chemicalKey: "free_chlorine",
    displayName: "Free Chlorine",
    enabled: true,
    expectedIntervalValue: 3,
    expectedIntervalUnit: "days",
    staleThresholdValue: 3,
    staleThresholdUnit: "days",
    unavailableThresholdValue: 7,
    unavailableThresholdUnit: "days",
    updatedAt: null
  },
  {
    chemicalKey: "ph",
    displayName: "pH",
    enabled: true,
    expectedIntervalValue: 3,
    expectedIntervalUnit: "days",
    staleThresholdValue: 3,
    staleThresholdUnit: "days",
    unavailableThresholdValue: 7,
    unavailableThresholdUnit: "days",
    updatedAt: null
  },
  {
    chemicalKey: "total_alkalinity",
    displayName: "Total Alkalinity",
    enabled: true,
    expectedIntervalValue: 7,
    expectedIntervalUnit: "days",
    staleThresholdValue: 7,
    staleThresholdUnit: "days",
    unavailableThresholdValue: 14,
    unavailableThresholdUnit: "days",
    updatedAt: null
  },
  {
    chemicalKey: "combined_chlorine",
    displayName: "Combined Chlorine",
    enabled: true,
    expectedIntervalValue: 7,
    expectedIntervalUnit: "days",
    staleThresholdValue: 7,
    staleThresholdUnit: "days",
    unavailableThresholdValue: 14,
    unavailableThresholdUnit: "days",
    updatedAt: null
  },
  {
    chemicalKey: "calcium_hardness",
    displayName: "Calcium Hardness",
    enabled: true,
    expectedIntervalValue: 30,
    expectedIntervalUnit: "days",
    staleThresholdValue: 30,
    staleThresholdUnit: "days",
    unavailableThresholdValue: 60,
    unavailableThresholdUnit: "days",
    updatedAt: null
  },
  {
    chemicalKey: "cyanuric_acid",
    displayName: "Cyanuric Acid",
    enabled: true,
    expectedIntervalValue: 30,
    expectedIntervalUnit: "days",
    staleThresholdValue: 30,
    staleThresholdUnit: "days",
    unavailableThresholdValue: 60,
    unavailableThresholdUnit: "days",
    updatedAt: null
  },
  {
    chemicalKey: "salt",
    displayName: "Salt",
    enabled: true,
    expectedIntervalValue: 30,
    expectedIntervalUnit: "days",
    staleThresholdValue: 30,
    staleThresholdUnit: "days",
    unavailableThresholdValue: 60,
    unavailableThresholdUnit: "days",
    updatedAt: null
  },
  {
    chemicalKey: "water_temperature",
    displayName: "Water Temperature",
    enabled: true,
    expectedIntervalValue: 1,
    expectedIntervalUnit: "hours",
    staleThresholdValue: 1,
    staleThresholdUnit: "hours",
    unavailableThresholdValue: 1,
    unavailableThresholdUnit: "hours",
    updatedAt: null
  }
];

const KNOWN_KEYS = new Set<WaterTestingScheduleChemicalKey>(DEFAULT_SCHEDULE.map((item) => item.chemicalKey));

export class WaterTestingScheduleValidationError extends Error {
  constructor(
    message: string,
    readonly details: Record<string, string | Record<string, string>>
  ) {
    super(message);
    this.name = "WaterTestingScheduleValidationError";
  }
}

export class WaterTestingScheduleUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WaterTestingScheduleUnavailableError";
  }
}

export class WaterTestingScheduleService {
  constructor(
    private readonly poolId: string,
    private readonly repository: WaterTestingScheduleRepository | null
  ) {}

  async getSchedule(): Promise<WaterTestingScheduleView> {
    if (!this.repository) {
      return {
        items: listScheduleItems(defaultWaterTestingScheduleMap()),
        source: "defaults"
      };
    }

    const stored = await this.repository.get(this.poolId);
    return {
      items: listScheduleItems(stored?.items ?? defaultWaterTestingScheduleMap()),
      source: stored ? "sqlite" : "defaults"
    };
  }

  async updateSchedule(input: unknown): Promise<WaterTestingScheduleView> {
    const repository = this.requireRepository();
    const update = validateWaterTestingScheduleUpdateInput(input);
    const stored = await repository.get(this.poolId);
    const merged = applyScheduleUpdates(stored?.items ?? defaultWaterTestingScheduleMap(), update.items);
    const saved = await repository.upsert({
      poolId: this.poolId,
      items: merged
    });
    return {
      items: listScheduleItems(saved.items),
      source: "sqlite"
    };
  }

  async updateScheduleItem(chemicalKey: string, input: unknown): Promise<WaterTestingScheduleView> {
    const repository = this.requireRepository();
    const update = validateSingleWaterTestingScheduleUpdateInput(chemicalKey, input);
    const stored = await repository.get(this.poolId);
    const merged = applyScheduleUpdates(stored?.items ?? defaultWaterTestingScheduleMap(), [update]);
    const saved = await repository.upsert({
      poolId: this.poolId,
      items: merged
    });
    return {
      items: listScheduleItems(saved.items),
      source: "sqlite"
    };
  }

  async resetSchedule(): Promise<WaterTestingScheduleView> {
    const repository = this.requireRepository();
    const saved = await repository.upsert({
      poolId: this.poolId,
      items: defaultWaterTestingScheduleMap()
    });
    return {
      items: listScheduleItems(saved.items),
      source: "sqlite"
    };
  }

  private requireRepository(): WaterTestingScheduleRepository {
    if (!this.repository) {
      throw new WaterTestingScheduleUnavailableError("SQLite-backed water testing schedule is not configured.");
    }
    return this.repository;
  }
}

export class SqliteWaterTestingScheduleRepository implements WaterTestingScheduleRepository {
  constructor(private readonly database: SqliteDatabase) {}

  async get(poolId: string): Promise<StoredWaterTestingSchedule | null> {
    const row = this.database.get<WaterTestingScheduleRow>(
      `
        SELECT pool_id, water_testing_schedule
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
      items: mapStoredSchedule(row.water_testing_schedule)
    };
  }

  async upsert(schedule: StoredWaterTestingSchedule): Promise<StoredWaterTestingSchedule> {
    const row = this.database.get<WaterTestingScheduleRow>(
      `
        INSERT INTO pool_settings (
          pool_id,
          weather_location_mode,
          weather_location_address_line1,
          weather_location_city,
          weather_location_state_region,
          weather_location_postal_code,
          weather_location_country,
          water_testing_schedule,
          updated_at
        )
        VALUES (?, 'address', '', '', '', '', '', ?, CURRENT_TIMESTAMP)
        ON CONFLICT (pool_id) DO UPDATE SET
          water_testing_schedule = EXCLUDED.water_testing_schedule,
          updated_at = CURRENT_TIMESTAMP
        RETURNING pool_id, water_testing_schedule
      `,
      [schedule.poolId, JSON.stringify(schedule.items)]
    );

    if (!row) {
      throw new Error("SQLite water testing schedule upsert did not return a row.");
    }

    return {
      poolId: row.pool_id,
      items: mapStoredSchedule(row.water_testing_schedule)
    };
  }
}

export function defaultWaterTestingScheduleMap(): Record<WaterTestingScheduleChemicalKey, WaterTestingScheduleItem> {
  return DEFAULT_SCHEDULE.reduce(
    (accumulator, item) => {
      accumulator[item.chemicalKey] = { ...item };
      return accumulator;
    },
    {} as Record<WaterTestingScheduleChemicalKey, WaterTestingScheduleItem>
  );
}

export function validateWaterTestingScheduleUpdateInput(input: unknown): {
  items: WaterTestingScheduleUpdateItem[];
} {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new WaterTestingScheduleValidationError("Water testing schedule is invalid.", {
      form: "Request body must be a JSON object."
    });
  }

  const record = input as Record<string, unknown>;
  if (!Array.isArray(record.items) || record.items.length === 0) {
    throw new WaterTestingScheduleValidationError("Water testing schedule is invalid.", {
      items: "Items must be a non-empty array."
    });
  }

  return {
    items: record.items.map((item, index) => validateWaterTestingScheduleItem(item, `item_${index}`))
  };
}

export function validateSingleWaterTestingScheduleUpdateInput(
  chemicalKey: string,
  input: unknown
): WaterTestingScheduleUpdateItem {
  if (!KNOWN_KEYS.has(chemicalKey as WaterTestingScheduleChemicalKey)) {
    throw new WaterTestingScheduleValidationError("Water testing schedule is invalid.", {
      chemicalKey: "chemicalKey must be one of the supported tracked values."
    });
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new WaterTestingScheduleValidationError("Water testing schedule is invalid.", {
      form: "Request body must be a JSON object."
    });
  }

  return validateWaterTestingScheduleItem(
    { chemicalKey, ...(input as Record<string, unknown>) },
    chemicalKey
  );
}

export function evaluateWaterTestingFreshness(
  schedule: WaterTestingScheduleItem[],
  input: WaterTestingFreshnessInput
): WaterTestingFreshnessView {
  const generatedAt = input.now ?? new Date().toISOString();
  const items = schedule.map((item) => evaluateScheduleItem(item, input, generatedAt));
  return {
    items,
    generatedAt
  };
}

function evaluateScheduleItem(
  item: WaterTestingScheduleItem,
  input: WaterTestingFreshnessInput,
  nowIso: string
): WaterTestingFreshnessItem {
  if (!item.enabled) {
    return {
      ...item,
      enabled: false,
      status: "disabled",
      lastObservedAt: null
    };
  }

  const lastObservedAt = deriveLastObservedAt(item.chemicalKey, input);
  if (!lastObservedAt) {
    return {
      ...item,
      status: "unavailable",
      lastObservedAt: null
    };
  }

  const ageHours = Math.max(0, (Date.parse(nowIso) - Date.parse(lastObservedAt)) / (60 * 60 * 1000));
  const staleThresholdHours = toHours(item.staleThresholdValue, item.staleThresholdUnit);
  const unavailableThresholdHours = toHours(item.unavailableThresholdValue, item.unavailableThresholdUnit);

  let status: WaterTestingFreshnessStatus = "current";
  if (isHardwareDerivedKey(item.chemicalKey) && ageHours >= unavailableThresholdHours) {
    status = "unavailable";
  } else if (ageHours >= staleThresholdHours) {
    status = "stale";
  }

  return {
    ...item,
    status,
    lastObservedAt
  };
}

function deriveLastObservedAt(
  chemicalKey: WaterTestingScheduleChemicalKey,
  input: WaterTestingFreshnessInput
): string | null {
  switch (chemicalKey) {
    case "free_chlorine":
      return latestChemistryTimestamp(input.chemistryReadings, (reading) => reading.free_chlorine != null);
    case "ph":
      return latestChemistryTimestamp(input.chemistryReadings, (reading) => reading.ph != null);
    case "total_alkalinity":
      return latestChemistryTimestamp(input.chemistryReadings, (reading) => reading.total_alkalinity != null);
    case "combined_chlorine":
      return latestChemistryTimestamp(
        input.chemistryReadings,
        (reading) => reading.total_chlorine != null && reading.free_chlorine != null
      );
    case "calcium_hardness":
      return latestChemistryTimestamp(input.chemistryReadings, (reading) => reading.calcium_hardness != null);
    case "cyanuric_acid":
      return latestChemistryTimestamp(input.chemistryReadings, (reading) => reading.cyanuric_acid != null);
    case "salt":
      return input.saltTelemetry?.saltPpm != null ? input.saltTelemetry.updatedAt : null;
    case "water_temperature":
      return input.latestTemperatures.readings.pool_water?.timestamp ?? null;
  }
}

function latestChemistryTimestamp(
  readings: ChemistryReadingRecord[],
  predicate: (reading: ChemistryReadingRecord) => boolean
): string | null {
  for (const reading of readings) {
    if (predicate(reading)) {
      return reading.recorded_at;
    }
  }
  return null;
}

function validateWaterTestingScheduleItem(
  item: unknown,
  detailKey: string
): WaterTestingScheduleUpdateItem {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    throw new WaterTestingScheduleValidationError("Water testing schedule is invalid.", {
      [detailKey]: "Each schedule item must be a JSON object."
    });
  }

  const record = item as Record<string, unknown>;
  const chemicalKey = record.chemicalKey;
  const details: Record<string, string> = {};

  if (typeof chemicalKey !== "string" || !KNOWN_KEYS.has(chemicalKey as WaterTestingScheduleChemicalKey)) {
    details.chemicalKey = "chemicalKey must be one of the supported tracked values.";
  }

  const enabled = optionalBoolean(record.enabled);
  if (record.enabled !== undefined && enabled === null) {
    details.enabled = "Enabled must be a boolean.";
  }

  const expectedIntervalValue = optionalPositiveInteger(record.expectedIntervalValue);
  const staleThresholdValue = optionalPositiveInteger(record.staleThresholdValue);
  const unavailableThresholdValue = optionalPositiveInteger(record.unavailableThresholdValue);
  const expectedIntervalUnit = optionalIntervalUnit(record.expectedIntervalUnit);
  const staleThresholdUnit = optionalIntervalUnit(record.staleThresholdUnit);
  const unavailableThresholdUnit = optionalIntervalUnit(record.unavailableThresholdUnit);

  if (record.expectedIntervalValue !== undefined && expectedIntervalValue === null) {
    details.expectedIntervalValue = "Expected interval value must be a positive integer.";
  }
  if (record.staleThresholdValue !== undefined && staleThresholdValue === null) {
    details.staleThresholdValue = "Stale threshold value must be a positive integer.";
  }
  if (record.unavailableThresholdValue !== undefined && unavailableThresholdValue === null) {
    details.unavailableThresholdValue = "Unavailable threshold value must be a positive integer.";
  }
  if (record.expectedIntervalUnit !== undefined && expectedIntervalUnit === null) {
    details.expectedIntervalUnit = "Expected interval unit must be either 'hours' or 'days'.";
  }
  if (record.staleThresholdUnit !== undefined && staleThresholdUnit === null) {
    details.staleThresholdUnit = "Stale threshold unit must be either 'hours' or 'days'.";
  }
  if (record.unavailableThresholdUnit !== undefined && unavailableThresholdUnit === null) {
    details.unavailableThresholdUnit = "Unavailable threshold unit must be either 'hours' or 'days'.";
  }

  if (Object.keys(details).length > 0) {
    throw new WaterTestingScheduleValidationError("Water testing schedule is invalid.", {
      [typeof chemicalKey === "string" ? chemicalKey : detailKey]: details
    });
  }

  return {
    chemicalKey: chemicalKey as WaterTestingScheduleChemicalKey,
    enabled: enabled ?? undefined,
    expectedIntervalValue: expectedIntervalValue ?? undefined,
    expectedIntervalUnit: expectedIntervalUnit ?? undefined,
    staleThresholdValue: staleThresholdValue ?? undefined,
    staleThresholdUnit: staleThresholdUnit ?? undefined,
    unavailableThresholdValue: unavailableThresholdValue ?? undefined,
    unavailableThresholdUnit: unavailableThresholdUnit ?? undefined
  };
}

function applyScheduleUpdates(
  current: Record<WaterTestingScheduleChemicalKey, WaterTestingScheduleItem>,
  updates: WaterTestingScheduleUpdateItem[]
): Record<WaterTestingScheduleChemicalKey, WaterTestingScheduleItem> {
  const next = Object.fromEntries(
    Object.entries(current).map(([key, value]) => [key, { ...value }])
  ) as Record<WaterTestingScheduleChemicalKey, WaterTestingScheduleItem>;

  const updatedAt = new Date().toISOString();

  for (const update of updates) {
    next[update.chemicalKey] = {
      ...next[update.chemicalKey],
      enabled: update.enabled ?? next[update.chemicalKey].enabled,
      expectedIntervalValue: update.expectedIntervalValue ?? next[update.chemicalKey].expectedIntervalValue,
      expectedIntervalUnit: update.expectedIntervalUnit ?? next[update.chemicalKey].expectedIntervalUnit,
      staleThresholdValue: update.staleThresholdValue ?? next[update.chemicalKey].staleThresholdValue,
      staleThresholdUnit: update.staleThresholdUnit ?? next[update.chemicalKey].staleThresholdUnit,
      unavailableThresholdValue:
        update.unavailableThresholdValue ?? next[update.chemicalKey].unavailableThresholdValue,
      unavailableThresholdUnit:
        update.unavailableThresholdUnit ?? next[update.chemicalKey].unavailableThresholdUnit,
      updatedAt
    };
  }

  return next;
}

function listScheduleItems(
  items: Record<WaterTestingScheduleChemicalKey, WaterTestingScheduleItem>
): WaterTestingScheduleItem[] {
  return Object.values(items).sort(
    (left, right) => DEFAULT_SCHEDULE.findIndex((value) => value.chemicalKey === left.chemicalKey)
      - DEFAULT_SCHEDULE.findIndex((value) => value.chemicalKey === right.chemicalKey)
  );
}

function mapStoredSchedule(
  value: Record<string, unknown> | string | null
): Record<WaterTestingScheduleChemicalKey, WaterTestingScheduleItem> {
  const defaults = defaultWaterTestingScheduleMap();
  if (!value) {
    return defaults;
  }

  const parsed = typeof value === "string" ? safeJsonParse(value) : value;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return defaults;
  }

  const result = defaultWaterTestingScheduleMap();
  for (const [key, rawItem] of Object.entries(parsed)) {
    if (!KNOWN_KEYS.has(key as WaterTestingScheduleChemicalKey)) {
      continue;
    }
    if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) {
      continue;
    }

    const record = rawItem as Record<string, unknown>;
    const base = result[key as WaterTestingScheduleChemicalKey];
    result[key as WaterTestingScheduleChemicalKey] = {
      chemicalKey: base.chemicalKey,
      displayName:
        typeof record.displayName === "string" && record.displayName.trim().length > 0
          ? record.displayName
          : base.displayName,
      enabled: typeof record.enabled === "boolean" ? record.enabled : base.enabled,
      expectedIntervalValue: optionalPositiveInteger(record.expectedIntervalValue) ?? base.expectedIntervalValue,
      expectedIntervalUnit: optionalIntervalUnit(record.expectedIntervalUnit) ?? base.expectedIntervalUnit,
      staleThresholdValue: optionalPositiveInteger(record.staleThresholdValue) ?? base.staleThresholdValue,
      staleThresholdUnit: optionalIntervalUnit(record.staleThresholdUnit) ?? base.staleThresholdUnit,
      unavailableThresholdValue:
        optionalPositiveInteger(record.unavailableThresholdValue) ?? base.unavailableThresholdValue,
      unavailableThresholdUnit:
        optionalIntervalUnit(record.unavailableThresholdUnit) ?? base.unavailableThresholdUnit,
      updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : base.updatedAt
    };
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

function optionalBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function optionalPositiveInteger(value: unknown): number | null {
  if (value === undefined) {
    return null;
  }
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function optionalIntervalUnit(value: unknown): WaterTestingIntervalUnit | null {
  return value === "hours" || value === "days" ? value : null;
}

function toHours(value: number, unit: WaterTestingIntervalUnit): number {
  return unit === "days" ? value * 24 : value;
}

function isHardwareDerivedKey(key: WaterTestingScheduleChemicalKey): boolean {
  return key === "salt" || key === "water_temperature";
}
