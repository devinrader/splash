import type { InfluxTelemetryConfig } from "./temperature-telemetry.js";

export interface WeatherProviderConfig {
  provider: "openmeteo";
  refreshMinutes: number[] | null;
  refreshIntervalHours: number;
  openMeteoBaseUrl: string;
  openMeteoGeocodingUrl: string;
}

export interface GeocodingConfig {
  geoapifyApiKey: string | null;
  geoapifyBaseUrl: string;
  osmBaseUrl: string;
  osmUserAgent: string | null;
  osmEmail: string | null;
}

export interface SqliteConfig {
  path: string;
  migrationsDir: string;
  busyTimeoutMs: number;
  journalMode: "DELETE" | "TRUNCATE" | "PERSIST" | "MEMORY" | "WAL" | "OFF";
}

export interface PoolSiteConfig {
  streetAddress: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
}

export interface ApiConfig {
  poolId: string;
  poolSite?: PoolSiteConfig;
  natsUrl: string;
  natsMonitoringUrl: string | null;
  serialHealthUrl?: string | null;
  protocolHealthUrl?: string | null;
  frontendUrl?: string | null;
  prometheusUrl?: string | null;
  grafanaUrl?: string | null;
  influx?: InfluxTelemetryConfig | null;
  sqlite?: SqliteConfig | null;
  weather?: WeatherProviderConfig;
  geocoding?: GeocodingConfig;
  httpBind: string;
  healthPollIntervalMs?: number;
  healthTimeoutMs?: number;
  logLevel: string;
  timezone: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  return {
    poolId: required(env, "API_POOL_ID"),
    poolSite: loadPoolSite(env),
    natsUrl: required(env, "NATS_URL"),
    natsMonitoringUrl: optionalUrl(env, "API_NATS_MONITORING_URL"),
    serialHealthUrl: optionalUrl(env, "API_SERIAL_HEALTH_URL"),
    protocolHealthUrl: optionalUrl(env, "API_PROTOCOL_HEALTH_URL"),
    frontendUrl: optionalUrl(env, "API_FRONTEND_URL"),
    prometheusUrl: optionalUrl(env, "API_PROMETHEUS_URL"),
    grafanaUrl: optionalUrl(env, "API_GRAFANA_URL"),
    influx: optionalInflux(env),
    sqlite: loadSqliteConfig(env),
    weather: loadWeatherProvider(env),
    geocoding: loadGeocodingConfig(env),
    httpBind: required(env, "API_HTTP_BIND"),
    healthPollIntervalMs: optionalInteger(env, "API_HEALTH_POLL_INTERVAL_MS", 5000),
    healthTimeoutMs: optionalInteger(env, "API_HEALTH_TIMEOUT_MS", 2000),
    logLevel: env.LOG_LEVEL ?? "info",
    timezone: env.TZ ?? "UTC"
  };
}

export function loadSqliteConfig(env: NodeJS.ProcessEnv = process.env): SqliteConfig | null {
  const sqlitePath = optionalString(env, "SQLITE_PATH");
  const migrationsDir = optionalString(env, "DATABASE_MIGRATIONS_DIR") ?? "migrations";
  const busyTimeoutMs = optionalInteger(env, "SQLITE_BUSY_TIMEOUT_MS", 5000);
  const journalMode = loadSqliteJournalMode(env);

  if (!sqlitePath) {
    return null;
  }

  return {
    path: sqlitePath,
    migrationsDir,
    busyTimeoutMs,
    journalMode
  };
}

export function defaultPoolSite(timezone: string = "UTC"): PoolSiteConfig {
  return {
    streetAddress: null,
    city: null,
    state: null,
    postalCode: null,
    latitude: null,
    longitude: null,
    timezone
  };
}

export function defaultWeatherProviderConfig(): WeatherProviderConfig {
  return {
    provider: "openmeteo",
    refreshMinutes: null,
    refreshIntervalHours: 6,
    openMeteoBaseUrl: "https://api.open-meteo.com/v1",
    openMeteoGeocodingUrl: "https://geocoding-api.open-meteo.com/v1"
  };
}

export function defaultGeocodingConfig(): GeocodingConfig {
  return {
    geoapifyApiKey: null,
    geoapifyBaseUrl: "https://api.geoapify.com/v1",
    osmBaseUrl: "https://nominatim.openstreetmap.org",
    osmUserAgent: null,
    osmEmail: null
  };
}

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  if (!value) {
    throw new Error(`${key} is required`);
  }
  return value;
}

function optionalUrl(env: NodeJS.ProcessEnv, key: string): string | null {
  const value = env[key];
  return value && value.length > 0 ? value : null;
}

function optionalInflux(env: NodeJS.ProcessEnv): InfluxTelemetryConfig | null {
  const url = env.INFLUX_URL ?? "";
  const token = env.INFLUX_TOKEN ?? "";
  const org = env.INFLUX_ORG ?? "";
  const bucket = env.INFLUX_BUCKET ?? "";
  const values = [url, token, org, bucket].map((value) => value.trim());
  const populated = values.filter((value) => value.length > 0).length;
  if (populated === 0) {
    return null;
  }
  if (populated !== 4) {
    throw new Error("INFLUX_URL, INFLUX_TOKEN, INFLUX_ORG, and INFLUX_BUCKET must all be set together");
  }
  return {
    url: values[0] as string,
    token: values[1] as string,
    org: values[2] as string,
    bucket: values[3] as string
  };
}

function loadPoolSite(env: NodeJS.ProcessEnv): PoolSiteConfig {
  return {
    streetAddress: optionalString(env, "POOL_STREET_ADDRESS"),
    city: optionalString(env, "POOL_CITY"),
    state: optionalString(env, "POOL_STATE"),
    postalCode: optionalString(env, "POOL_POSTAL_CODE") ?? optionalString(env, "POOL_ZIP_CODE"),
    latitude: optionalNumber(env, "POOL_LATITUDE"),
    longitude: optionalNumber(env, "POOL_LONGITUDE"),
    timezone: optionalString(env, "POOL_TIMEZONE") ?? env.TZ ?? "UTC"
  };
}

function loadWeatherProvider(env: NodeJS.ProcessEnv): WeatherProviderConfig {
  const provider = (optionalString(env, "WEATHER_PROVIDER") ?? "openmeteo").toLowerCase();
  if (provider !== "openmeteo") {
    throw new Error(`Unsupported WEATHER_PROVIDER: ${provider}`);
  }

  return {
    provider: "openmeteo",
    refreshMinutes: optionalMinuteList(env, "WEATHER_REFRESH_MINUTES"),
    refreshIntervalHours: optionalInteger(env, "WEATHER_REFRESH_INTERVAL_HOURS", 6),
    openMeteoBaseUrl: optionalString(env, "OPEN_METEO_BASE_URL") ?? "https://api.open-meteo.com/v1",
    openMeteoGeocodingUrl: optionalString(env, "OPEN_METEO_GEOCODING_URL") ?? "https://geocoding-api.open-meteo.com/v1"
  };
}

function loadGeocodingConfig(env: NodeJS.ProcessEnv): GeocodingConfig {
  return {
    geoapifyApiKey: optionalString(env, "GEOCODING_GEOAPIFY_API_KEY"),
    geoapifyBaseUrl: optionalString(env, "GEOCODING_GEOAPIFY_BASE_URL") ?? "https://api.geoapify.com/v1",
    osmBaseUrl: optionalString(env, "GEOCODING_OSM_BASE_URL") ?? "https://nominatim.openstreetmap.org",
    osmUserAgent: optionalString(env, "GEOCODING_OSM_USER_AGENT"),
    osmEmail: optionalString(env, "GEOCODING_OSM_EMAIL")
  };
}

function optionalString(env: NodeJS.ProcessEnv, key: string): string | null {
  const value = env[key]?.trim();
  return value ? value : null;
}

function optionalNumber(env: NodeJS.ProcessEnv, key: string): number | null {
  const value = optionalString(env, key);
  if (!value) {
    return null;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function optionalInteger(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const value = env[key];
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optionalMinuteList(env: NodeJS.ProcessEnv, key: string): number[] | null {
  const value = optionalString(env, key);
  if (!value) {
    return null;
  }

  const minutes = value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      const parsed = Number.parseInt(entry, 10);
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 59) {
        throw new Error(`${key} must contain comma-separated minute values between 0 and 59.`);
      }
      return parsed;
    });

  if (minutes.length === 0) {
    return null;
  }

  return Array.from(new Set(minutes)).sort((left, right) => left - right);
}

function loadSqliteJournalMode(env: NodeJS.ProcessEnv): SqliteConfig["journalMode"] {
  const value = (optionalString(env, "SQLITE_JOURNAL_MODE") ?? "WAL").toUpperCase();
  switch (value) {
    case "DELETE":
    case "TRUNCATE":
    case "PERSIST":
    case "MEMORY":
    case "WAL":
    case "OFF":
      return value;
    default:
      throw new Error(`Unsupported SQLITE_JOURNAL_MODE: ${value}`);
  }
}
