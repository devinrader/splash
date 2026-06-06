import type { SqliteDatabase } from "./database.js";
import type { Logger } from "./logger.js";
import {
  GeocodingAmbiguousError,
  GeocodingNoResultError,
  GeocodingProviderUnavailableError,
  type GeocodingResult
} from "./geocoding.js";
import type { GeocodingSettingsService } from "./geocoding-settings.js";

export type WeatherLocationMode = "address" | "coordinates";
export type WeatherLocationStatus = "resolved" | "requires_geocoding";

export interface WeatherLocationSettingsInput {
  locationMode: WeatherLocationMode;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  stateRegion?: string | null;
  postalCode?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  timezone?: string | null;
}

export interface WeatherLocationSettings {
  poolId: string;
  locationMode: WeatherLocationMode;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  stateRegion: string | null;
  postalCode: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
  geocodedLatitude: number | null;
  geocodedLongitude: number | null;
  formattedAddress: string | null;
  geocodeProvider: string | null;
  geocodedAt: string | null;
  activeGeocodingProviderId: string | null;
  locationStatus: WeatherLocationStatus;
}

export interface ActiveWeatherCoordinates {
  status: "resolved" | "requires_geocoding" | "unconfigured";
  source: "manual" | "geocoded" | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
}

interface StoredWeatherLocationSettings extends Omit<WeatherLocationSettings, "locationStatus" | "activeGeocodingProviderId"> {}

export interface WeatherLocationSettingsRepository {
  get(poolId: string): Promise<StoredWeatherLocationSettings | null>;
  upsert(settings: StoredWeatherLocationSettings): Promise<StoredWeatherLocationSettings>;
}

export class WeatherLocationSettingsValidationError extends Error {
  constructor(
    message: string,
    readonly details: Record<string, string>
  ) {
    super(message);
    this.name = "WeatherLocationSettingsValidationError";
  }
}

export class WeatherLocationSettingsUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WeatherLocationSettingsUnavailableError";
  }
}

export class WeatherLocationSettingsService {
  constructor(
    private readonly poolId: string,
    private readonly repository: WeatherLocationSettingsRepository | null,
    private readonly geocodingSettings: GeocodingSettingsService | null = null,
    private readonly logger: Logger | null = null
  ) {}

  async getWeatherLocationSettings(): Promise<WeatherLocationSettings> {
    const repository = this.requireRepository();
    const stored = await repository.get(this.poolId);
    const activeGeocodingProviderId = await this.geocodingSettings?.getEffectiveActiveProviderId() ?? null;
    return withStatus(stored ?? defaultStoredWeatherLocationSettings(this.poolId), activeGeocodingProviderId);
  }

  async upsertWeatherLocationSettings(input: unknown): Promise<WeatherLocationSettings> {
    const repository = this.requireRepository();
    const normalized = validateWeatherLocationSettingsInput(input);
    let storedInput: StoredWeatherLocationSettings;

    if (normalized.locationMode === "coordinates") {
      storedInput = toCoordinateWeatherLocationSettings(this.poolId, normalized);
    } else if (looksLikePhysicalAddress(normalized)) {
      const geocodingSettings = this.requireGeocodingSettings();
      let providerId = "unknown";
      try {
        const provider = await geocodingSettings.getActiveProviderForGeocoding();
        providerId = provider.id;
        const geocoded = await provider.geocode(buildGeocodingQuery(normalized));
        storedInput = toGeocodedWeatherLocationSettings(this.poolId, normalized, provider.id, geocoded);
      } catch (error) {
        this.logger?.warn("weather_location.geocode.failed", "Weather location geocoding failed.", {
          pool_id: this.poolId,
          provider_id: providerId,
          reason: error instanceof Error ? error.message : String(error)
        });
        if (
          error instanceof GeocodingNoResultError
          || error instanceof GeocodingAmbiguousError
          || error instanceof GeocodingProviderUnavailableError
        ) {
          throw new WeatherLocationSettingsValidationError(
            "Unable to geocode this address. Please check the address or enter latitude/longitude.",
            {
              addressLine1: "Unable to geocode this address. Please check the address or enter latitude/longitude."
            }
          );
        }
        if (error instanceof Error && error.message.includes("No geocoding provider is configured")) {
          throw new WeatherLocationSettingsValidationError(error.message, {
            addressLine1: error.message
          });
        }
        throw new WeatherLocationSettingsValidationError(
          "Unable to geocode this address. Please check the address or enter latitude/longitude.",
          {
            addressLine1: "Unable to geocode this address. Please check the address or enter latitude/longitude."
          }
        );
      }
    } else {
      storedInput = toUnresolvedAddressWeatherLocationSettings(this.poolId, normalized);
    }

    const stored = await repository.upsert(storedInput);
    const activeGeocodingProviderId = await this.geocodingSettings?.getEffectiveActiveProviderId() ?? null;
    return withStatus(stored, activeGeocodingProviderId);
  }

  async getActiveWeatherCoordinates(): Promise<ActiveWeatherCoordinates> {
    const repository = this.requireRepository();
    const stored = await repository.get(this.poolId);
    if (!stored) {
      return {
        status: "unconfigured",
        source: null,
        latitude: null,
        longitude: null,
        timezone: null
      };
    }

    if (stored.locationMode === "coordinates" && stored.latitude !== null && stored.longitude !== null) {
      return {
        status: "resolved",
        source: "manual",
        latitude: stored.latitude,
        longitude: stored.longitude,
        timezone: stored.timezone
      };
    }

    if (stored.geocodedLatitude !== null && stored.geocodedLongitude !== null) {
      return {
        status: "resolved",
        source: "geocoded",
        latitude: stored.geocodedLatitude,
        longitude: stored.geocodedLongitude,
        timezone: stored.timezone
      };
    }

    return {
      status: "requires_geocoding",
      source: null,
      latitude: null,
      longitude: null,
      timezone: stored.timezone
    };
  }

  private requireRepository(): WeatherLocationSettingsRepository {
    if (!this.repository) {
      throw new WeatherLocationSettingsUnavailableError("SQLite-backed weather location settings are not configured.");
    }
    return this.repository;
  }

  private requireGeocodingSettings(): GeocodingSettingsService {
    if (!this.geocodingSettings) {
      throw new WeatherLocationSettingsUnavailableError("Geocoding-backed weather location settings are not configured.");
    }
    return this.geocodingSettings;
  }
}

export class SqliteWeatherLocationSettingsRepository implements WeatherLocationSettingsRepository {
  constructor(private readonly database: SqliteDatabase) {}

  async get(poolId: string): Promise<StoredWeatherLocationSettings | null> {
    const row = this.database.get<WeatherLocationSettingsRow>(
      `
        SELECT
          pool_id,
          weather_location_mode,
          weather_location_address_line1,
          weather_location_address_line2,
          weather_location_city,
          weather_location_state_region,
          weather_location_postal_code,
          weather_location_country,
          weather_location_latitude,
          weather_location_longitude,
          weather_location_timezone,
          weather_geocoded_latitude,
          weather_geocoded_longitude,
          weather_geocoded_formatted_address,
          weather_geocode_provider,
          weather_geocoded_at
        FROM pool_settings
        WHERE pool_id = ?
      `,
      [poolId]
    );

    if (!row) {
      return null;
    }

    return mapWeatherLocationSettingsRow(row);
  }

  async upsert(settings: StoredWeatherLocationSettings): Promise<StoredWeatherLocationSettings> {
    const row = this.database.get<WeatherLocationSettingsRow>(
      `
        INSERT INTO pool_settings (
          pool_id,
          weather_location_mode,
          weather_location_address_line1,
          weather_location_address_line2,
          weather_location_city,
          weather_location_state_region,
          weather_location_postal_code,
          weather_location_country,
          weather_location_latitude,
          weather_location_longitude,
          weather_location_timezone,
          weather_geocoded_latitude,
          weather_geocoded_longitude,
          weather_geocoded_formatted_address,
          weather_geocode_provider,
          weather_geocoded_at,
          updated_at
        )
        VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP
        )
        ON CONFLICT (pool_id) DO UPDATE SET
          weather_location_mode = EXCLUDED.weather_location_mode,
          weather_location_address_line1 = EXCLUDED.weather_location_address_line1,
          weather_location_address_line2 = EXCLUDED.weather_location_address_line2,
          weather_location_city = EXCLUDED.weather_location_city,
          weather_location_state_region = EXCLUDED.weather_location_state_region,
          weather_location_postal_code = EXCLUDED.weather_location_postal_code,
          weather_location_country = EXCLUDED.weather_location_country,
          weather_location_latitude = EXCLUDED.weather_location_latitude,
          weather_location_longitude = EXCLUDED.weather_location_longitude,
          weather_location_timezone = EXCLUDED.weather_location_timezone,
          weather_geocoded_latitude = EXCLUDED.weather_geocoded_latitude,
          weather_geocoded_longitude = EXCLUDED.weather_geocoded_longitude,
          weather_geocoded_formatted_address = EXCLUDED.weather_geocoded_formatted_address,
          weather_geocode_provider = EXCLUDED.weather_geocode_provider,
          weather_geocoded_at = EXCLUDED.weather_geocoded_at,
          updated_at = CURRENT_TIMESTAMP
        RETURNING
          pool_id,
          weather_location_mode,
          weather_location_address_line1,
          weather_location_address_line2,
          weather_location_city,
          weather_location_state_region,
          weather_location_postal_code,
          weather_location_country,
          weather_location_latitude,
          weather_location_longitude,
          weather_location_timezone,
          weather_geocoded_latitude,
          weather_geocoded_longitude,
          weather_geocoded_formatted_address,
          weather_geocode_provider,
          weather_geocoded_at
      `,
      [
        settings.poolId,
        settings.locationMode,
        settings.addressLine1,
        settings.addressLine2,
        settings.city,
        settings.stateRegion,
        settings.postalCode,
        settings.country,
        settings.latitude,
        settings.longitude,
        settings.timezone,
        settings.geocodedLatitude,
        settings.geocodedLongitude,
        settings.formattedAddress,
        settings.geocodeProvider,
        settings.geocodedAt
      ]
    );

    if (!row) {
      throw new Error("SQLite weather location upsert did not return a row.");
    }

    return mapWeatherLocationSettingsRow(row);
  }
}

interface WeatherLocationSettingsRow extends Record<string, unknown> {
  pool_id: string;
  weather_location_mode: WeatherLocationMode;
  weather_location_address_line1: string | null;
  weather_location_address_line2: string | null;
  weather_location_city: string | null;
  weather_location_state_region: string | null;
  weather_location_postal_code: string | null;
  weather_location_country: string | null;
  weather_location_latitude: number | string | null;
  weather_location_longitude: number | string | null;
  weather_location_timezone: string | null;
  weather_geocoded_latitude: number | string | null;
  weather_geocoded_longitude: number | string | null;
  weather_geocoded_formatted_address: string | null;
  weather_geocode_provider: string | null;
  weather_geocoded_at: string | Date | null;
}

export function validateWeatherLocationSettingsInput(input: unknown): WeatherLocationSettingsInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new WeatherLocationSettingsValidationError("Weather location settings are invalid.", {
      form: "Request body must be a JSON object."
    });
  }

  const record = input as Record<string, unknown>;
  const locationMode = record.locationMode;
  const details: Record<string, string> = {};

  if (locationMode !== "address" && locationMode !== "coordinates") {
    details.locationMode = "Location mode must be either 'address' or 'coordinates'.";
  }

  const normalized: WeatherLocationSettingsInput = {
    locationMode: (locationMode === "address" || locationMode === "coordinates" ? locationMode : "address") as WeatherLocationMode,
    addressLine1: optionalTrimmedString(record.addressLine1),
    addressLine2: optionalTrimmedString(record.addressLine2),
    city: optionalTrimmedString(record.city),
    stateRegion: optionalTrimmedString(record.stateRegion),
    postalCode: optionalTrimmedString(record.postalCode),
    country: optionalTrimmedString(record.country),
    latitude: optionalNumber(record.latitude),
    longitude: optionalNumber(record.longitude),
    timezone: optionalTrimmedString(record.timezone)
  };

  if (locationMode === "coordinates") {
    const latitude = normalized.latitude ?? null;
    const longitude = normalized.longitude ?? null;

    if (latitude === null || Number.isNaN(latitude)) {
      details.latitude = "Latitude is required when using coordinates.";
    } else if (latitude < -90 || latitude > 90) {
      details.latitude = "Latitude must be between -90 and 90.";
    }

    if (longitude === null || Number.isNaN(longitude)) {
      details.longitude = "Longitude is required when using coordinates.";
    } else if (longitude < -180 || longitude > 180) {
      details.longitude = "Longitude must be between -180 and 180.";
    }
  }

  if (locationMode === "address") {
    if (!normalized.addressLine1) {
      details.addressLine1 = "Address line 1 is required when using a physical address.";
    }
    if (!normalized.city) {
      details.city = "City is required when using a physical address.";
    }
    if (!normalized.stateRegion) {
      details.stateRegion = "State or region is required when using a physical address.";
    }
    if (!normalized.postalCode) {
      details.postalCode = "Postal code is required when using a physical address.";
    }
    if (!normalized.country) {
      details.country = "Country is required when using a physical address.";
    }
  }

  if (Object.keys(details).length > 0) {
    throw new WeatherLocationSettingsValidationError("Weather location settings are invalid.", details);
  }

  return normalized;
}

export function looksLikePhysicalAddress(input: WeatherLocationSettingsInput): boolean {
  if (input.locationMode !== "address") {
    return false;
  }

  const addressLine1 = input.addressLine1?.trim() ?? "";
  const addressLine2 = input.addressLine2?.trim() ?? "";
  const city = input.city?.trim() ?? "";
  const stateRegion = input.stateRegion?.trim() ?? "";
  const postalCode = input.postalCode?.trim() ?? "";

  const hasStreetNumber = /\d/.test(addressLine1);
  const hasStreetLikeText = /\b(st|street|rd|road|dr|drive|ln|lane|ave|avenue|blvd|boulevard|ct|court|way|pl|place|pkwy|parkway|cir|circle)\b/i.test(addressLine1);
  const hasCityStatePostal = city.length > 0 && stateRegion.length > 0 && postalCode.length > 0;

  return Boolean(addressLine2 || hasStreetNumber || hasStreetLikeText || hasCityStatePostal);
}

export function defaultWeatherLocationSettings(poolId: string): WeatherLocationSettings {
  return withStatus(defaultStoredWeatherLocationSettings(poolId), null);
}

function defaultStoredWeatherLocationSettings(poolId: string): StoredWeatherLocationSettings {
  return {
    poolId,
    locationMode: "address",
    addressLine1: null,
    addressLine2: null,
    city: null,
    stateRegion: null,
    postalCode: null,
    country: null,
    latitude: null,
    longitude: null,
    timezone: null,
    geocodedLatitude: null,
    geocodedLongitude: null,
    formattedAddress: null,
    geocodeProvider: null,
    geocodedAt: null
  };
}

function toCoordinateWeatherLocationSettings(poolId: string, input: WeatherLocationSettingsInput): StoredWeatherLocationSettings {
  return {
    poolId,
    locationMode: "coordinates",
    addressLine1: null,
    addressLine2: null,
    city: null,
    stateRegion: null,
    postalCode: null,
    country: null,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    timezone: input.timezone ?? null,
    geocodedLatitude: null,
    geocodedLongitude: null,
    formattedAddress: null,
    geocodeProvider: null,
    geocodedAt: null
  };
}

function toGeocodedWeatherLocationSettings(
  poolId: string,
  input: WeatherLocationSettingsInput,
  providerId: string,
  geocoded: GeocodingResult
): StoredWeatherLocationSettings {
  return {
    poolId,
    locationMode: "address",
    addressLine1: input.addressLine1 ?? null,
    addressLine2: input.addressLine2 ?? null,
    city: input.city ?? null,
    stateRegion: input.stateRegion ?? null,
    postalCode: input.postalCode ?? null,
    country: input.country ?? null,
    latitude: null,
    longitude: null,
    timezone: input.timezone ?? geocoded.timezone ?? null,
    geocodedLatitude: geocoded.latitude,
    geocodedLongitude: geocoded.longitude,
    formattedAddress: geocoded.formattedAddress,
    geocodeProvider: providerId,
    geocodedAt: new Date().toISOString()
  };
}

function toUnresolvedAddressWeatherLocationSettings(poolId: string, input: WeatherLocationSettingsInput): StoredWeatherLocationSettings {
  return {
    poolId,
    locationMode: "address",
    addressLine1: input.addressLine1 ?? null,
    addressLine2: input.addressLine2 ?? null,
    city: input.city ?? null,
    stateRegion: input.stateRegion ?? null,
    postalCode: input.postalCode ?? null,
    country: input.country ?? null,
    latitude: null,
    longitude: null,
    timezone: input.timezone ?? null,
    geocodedLatitude: null,
    geocodedLongitude: null,
    formattedAddress: null,
    geocodeProvider: null,
    geocodedAt: null
  };
}

function mapWeatherLocationSettingsRow(row: WeatherLocationSettingsRow): StoredWeatherLocationSettings {
  return {
    poolId: row.pool_id,
    locationMode: row.weather_location_mode,
    addressLine1: normalizeNullableText(row.weather_location_address_line1),
    addressLine2: normalizeNullableText(row.weather_location_address_line2),
    city: normalizeNullableText(row.weather_location_city),
    stateRegion: normalizeNullableText(row.weather_location_state_region),
    postalCode: normalizeNullableText(row.weather_location_postal_code),
    country: normalizeNullableText(row.weather_location_country),
    latitude: coerceNullableNumber(row.weather_location_latitude),
    longitude: coerceNullableNumber(row.weather_location_longitude),
    timezone: normalizeNullableText(row.weather_location_timezone),
    geocodedLatitude: coerceNullableNumber(row.weather_geocoded_latitude),
    geocodedLongitude: coerceNullableNumber(row.weather_geocoded_longitude),
    formattedAddress: normalizeNullableText(row.weather_geocoded_formatted_address),
    geocodeProvider: normalizeNullableText(row.weather_geocode_provider),
    geocodedAt: row.weather_geocoded_at ? new Date(row.weather_geocoded_at).toISOString() : null
  };
}

function withStatus(settings: StoredWeatherLocationSettings, activeGeocodingProviderId: string | null): WeatherLocationSettings {
  return {
    ...settings,
    activeGeocodingProviderId,
    locationStatus:
      settings.locationMode === "coordinates" || (settings.geocodedLatitude !== null && settings.geocodedLongitude !== null)
        ? "resolved"
        : "requires_geocoding"
  };
}

function buildGeocodingQuery(input: WeatherLocationSettingsInput): string {
  return [
    input.addressLine1,
    input.addressLine2,
    input.city,
    input.stateRegion,
    input.postalCode,
    input.country
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(", ");
}

function optionalTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function optionalNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function coerceNullableNumber(value: number | string | null): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeNullableText(value: string | null): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
