import type { SqliteDatabase } from "./database.js";
import type {
  GeocodingProvider,
  GeocodingProviderConfigMap,
  GeocodingProviderRegistry,
  GeocodingProviderView
} from "./geocoding.js";

interface StoredGeocodingSettings {
  poolId: string;
  activeProviderId: string | null;
  providerConfigs: GeocodingProviderConfigMap;
}

export interface GeocodingSettingsView {
  activeProviderId: string | null;
  activeProviderAvailable: boolean;
  activeProviderUnavailableReason: string | null;
  providers: GeocodingProviderView[];
}

export interface GeocodingSettingsRepository {
  get(poolId: string): Promise<StoredGeocodingSettings | null>;
  upsert(settings: StoredGeocodingSettings): Promise<StoredGeocodingSettings>;
}

export class GeocodingSettingsValidationError extends Error {
  constructor(
    message: string,
    readonly details: Record<string, string>
  ) {
    super(message);
    this.name = "GeocodingSettingsValidationError";
  }
}

export class GeocodingSettingsUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeocodingSettingsUnavailableError";
  }
}

export class GeocodingSettingsService {
  constructor(
    private readonly poolId: string,
    private readonly repository: GeocodingSettingsRepository | null,
    private readonly registry: GeocodingProviderRegistry
  ) {}

  async getGeocodingSettings(): Promise<GeocodingSettingsView> {
    const stored = await this.getStoredSettings();
    const providerConfigs = stored?.providerConfigs ?? {};
    const active = this.registry.describeActiveProvider(stored?.activeProviderId ?? null, providerConfigs);
    return {
      activeProviderId: active.activeProviderId,
      activeProviderAvailable: active.activeProviderAvailable,
      activeProviderUnavailableReason: active.activeProviderUnavailableReason,
      providers: this.registry.listProviders(providerConfigs)
    };
  }

  async updateGeocodingSettings(input: unknown): Promise<GeocodingSettingsView> {
    const repository = this.requireRepository();
    const current = (await this.getStoredSettings()) ?? defaultStoredGeocodingSettings(this.poolId);
    const normalized = validateGeocodingSettingsInput(input);
    const provider = this.registry.getProvider(normalized.activeProviderId, current.providerConfigs);
    if (!provider) {
      throw new GeocodingSettingsValidationError("Geocoding settings are invalid.", {
        activeProviderId: "Active provider must be one of the registered geocoding providers."
      });
    }
    if (!provider.available) {
      throw new GeocodingSettingsValidationError("Geocoding settings are invalid.", {
        activeProviderId: provider.unavailableReason ?? "Selected geocoding provider is unavailable."
      });
    }

    await repository.upsert({
      poolId: this.poolId,
      activeProviderId: normalized.activeProviderId,
      providerConfigs: current.providerConfigs
    });
    return this.getGeocodingSettings();
  }

  async updateGeocodingProviderConfig(providerId: string, input: unknown): Promise<GeocodingSettingsView> {
    const repository = this.requireRepository();
    const current = (await this.getStoredSettings()) ?? defaultStoredGeocodingSettings(this.poolId);
    if (!this.registry.getProviderView(providerId, current.providerConfigs)) {
      throw new GeocodingSettingsValidationError("Geocoding settings are invalid.", {
        providerId: "Provider is not registered."
      });
    }

    const configInput = validateGeocodingProviderConfigInput(input);
    const nextProviderConfig = this.registry.normalizeConfigUpdate(
      providerId,
      configInput.config,
      current.providerConfigs[providerId] ?? {}
    );
    const configErrors = this.registry.validateResolvedConfig(providerId, nextProviderConfig);
    if (Object.keys(configErrors).length > 0) {
      throw new GeocodingSettingsValidationError("Geocoding settings are invalid.", configErrors);
    }

    await repository.upsert({
      poolId: this.poolId,
      activeProviderId: current.activeProviderId,
      providerConfigs: {
        ...current.providerConfigs,
        [providerId]: nextProviderConfig
      }
    });
    return this.getGeocodingSettings();
  }

  async getEffectiveActiveProviderId(): Promise<string | null> {
    const stored = await this.getStoredSettings();
    return this.registry.describeActiveProvider(
      stored?.activeProviderId ?? null,
      stored?.providerConfigs ?? {}
    ).activeProviderId;
  }

  async getActiveProviderForGeocoding(): Promise<GeocodingProvider> {
    const stored = await this.getStoredSettings();
    const storedProviderId = stored?.activeProviderId ?? null;
    const providerConfigs = stored?.providerConfigs ?? {};

    if (storedProviderId) {
      const provider = this.registry.getProvider(storedProviderId, providerConfigs);
      if (!provider) {
        throw new GeocodingSettingsUnavailableError(
          "Configured geocoding provider is no longer registered. Select a provider in Settings."
        );
      }
      if (!provider.available) {
        throw new GeocodingSettingsUnavailableError(
          `Configured geocoding provider is unavailable: ${provider.unavailableReason ?? "missing configuration"}.`
        );
      }
      return provider;
    }

    const preferredProviderId = this.registry.getPreferredProviderId(providerConfigs);
    if (!preferredProviderId) {
      throw new GeocodingSettingsUnavailableError(
        "No geocoding provider is configured. Select a provider in Settings."
      );
    }

    return this.registry.getAvailableProvider(preferredProviderId, providerConfigs) as GeocodingProvider;
  }

  async getProviderAvailabilitySnapshot(): Promise<GeocodingProviderView[]> {
    const stored = await this.getStoredSettings();
    return this.registry.listProviders(stored?.providerConfigs ?? {});
  }

  private async getStoredSettings(): Promise<StoredGeocodingSettings | null> {
    if (!this.repository) {
      return null;
    }
    return this.repository.get(this.poolId);
  }

  private requireRepository(): GeocodingSettingsRepository {
    if (!this.repository) {
      throw new GeocodingSettingsUnavailableError("SQLite-backed geocoding settings are not configured.");
    }
    return this.repository;
  }
}

export class SqliteGeocodingSettingsRepository implements GeocodingSettingsRepository {
  constructor(private readonly database: SqliteDatabase) {}

  async get(poolId: string): Promise<StoredGeocodingSettings | null> {
    const row = this.database.get<GeocodingSettingsRow>(
      `
        SELECT pool_id, weather_active_geocoding_provider, weather_geocoding_provider_configs
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
      activeProviderId: normalizeNullableText(row.weather_active_geocoding_provider),
      providerConfigs: normalizeProviderConfigs(row.weather_geocoding_provider_configs)
    };
  }

  async upsert(settings: StoredGeocodingSettings): Promise<StoredGeocodingSettings> {
    const row = this.database.get<GeocodingSettingsRow>(
      `
        INSERT INTO pool_settings (
          pool_id,
          weather_location_mode,
          weather_location_address_line1,
          weather_location_city,
          weather_location_state_region,
          weather_location_postal_code,
          weather_location_country,
          weather_active_geocoding_provider,
          weather_geocoding_provider_configs,
          updated_at
        )
        VALUES (?, 'address', '', '', '', '', '', ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT (pool_id) DO UPDATE SET
          weather_active_geocoding_provider = EXCLUDED.weather_active_geocoding_provider,
          weather_geocoding_provider_configs = EXCLUDED.weather_geocoding_provider_configs,
          updated_at = CURRENT_TIMESTAMP
        RETURNING pool_id, weather_active_geocoding_provider, weather_geocoding_provider_configs
      `,
      [settings.poolId, settings.activeProviderId, JSON.stringify(settings.providerConfigs)]
    );

    if (!row) {
      throw new Error("SQLite geocoding settings upsert did not return a row.");
    }

    return {
      poolId: row.pool_id,
      activeProviderId: normalizeNullableText(row.weather_active_geocoding_provider),
      providerConfigs: normalizeProviderConfigs(row.weather_geocoding_provider_configs)
    };
  }
}

interface GeocodingSettingsRow extends Record<string, unknown> {
  pool_id: string;
  weather_active_geocoding_provider: string | null;
  weather_geocoding_provider_configs: string | null;
}

export function validateGeocodingSettingsInput(input: unknown): { activeProviderId: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new GeocodingSettingsValidationError("Geocoding settings are invalid.", {
      form: "Request body must be a JSON object."
    });
  }

  const record = input as Record<string, unknown>;
  const activeProviderId = typeof record.activeProviderId === "string" ? record.activeProviderId.trim() : "";
  if (activeProviderId.length === 0) {
    throw new GeocodingSettingsValidationError("Geocoding settings are invalid.", {
      activeProviderId: "Active provider id is required."
    });
  }

  return { activeProviderId };
}

export function validateGeocodingProviderConfigInput(input: unknown): { config: Record<string, unknown> } {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new GeocodingSettingsValidationError("Geocoding settings are invalid.", {
      form: "Request body must be a JSON object."
    });
  }

  const record = input as Record<string, unknown>;
  const rawConfig = record.config;
  if (!rawConfig || typeof rawConfig !== "object" || Array.isArray(rawConfig)) {
    throw new GeocodingSettingsValidationError("Geocoding settings are invalid.", {
      config: "Config must be a JSON object."
    });
  }

  return { config: rawConfig as Record<string, unknown> };
}

function defaultStoredGeocodingSettings(poolId: string): StoredGeocodingSettings {
  return {
    poolId,
    activeProviderId: null,
    providerConfigs: {}
  };
}

function normalizeProviderConfigs(value: unknown): GeocodingProviderConfigMap {
  if (typeof value !== "string" || value.trim().length === 0) {
    return {};
  }

  const parsed = safeJsonParse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }

  const result: GeocodingProviderConfigMap = {};
  for (const [providerId, rawConfig] of Object.entries(parsed)) {
    if (!rawConfig || typeof rawConfig !== "object" || Array.isArray(rawConfig)) {
      continue;
    }

    const configRecord: Record<string, unknown> = rawConfig;
    result[providerId] = Object.fromEntries(
      Object.entries(configRecord)
        .filter(([, rawValue]) => typeof rawValue === "string" || rawValue === null)
        .map(([key, rawValue]) => [key, normalizeNullableText(rawValue)])
    );
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

function normalizeNullableText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
