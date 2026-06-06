import type { InfluxTelemetryConfig } from "./temperature-telemetry.js";
import type { PoolSiteConfig, WeatherProviderConfig } from "./config.js";

const DEFAULT_PROVIDER = "openmeteo";
const DAILY_MEASUREMENT = "weather_forecast_daily";
const HOURLY_MEASUREMENT = "weather_forecast_hourly";
const DEFAULT_HISTORY_LOOKBACK_MS = 10 * 24 * 60 * 60 * 1000;

export type WeatherHistoryMetric =
  | "temperature_f"
  | "cloud_cover"
  | "uv_index"
  | "precipitation_probability"
  | "precipitation_amount";

export interface GeoLocation {
  latitude: number;
  longitude: number;
  timezone: string | null;
  name?: string | null;
}

export interface WeatherDailyForecast {
  date: string;
  weather_code: number | null;
  high_temp_f: number | null;
  high_temp_c: number | null;
  low_temp_f: number | null;
  low_temp_c: number | null;
  precipitation_probability_max: number | null;
  precipitation_amount: number | null;
  precipitation_unit: "mm";
  uv_index_max: number | null;
  sunrise: string | null;
  sunset: string | null;
}

export interface WeatherHourlyForecast {
  timestamp: string;
  temperature_f: number | null;
  temperature_c: number | null;
  relative_humidity: number | null;
  dew_point_f: number | null;
  dew_point_c: number | null;
  precipitation_probability: number | null;
  precipitation_amount: number | null;
  precipitation_unit: "mm";
  cloud_cover: number | null;
  wind_speed_mph: number | null;
  wind_speed_kph: number | null;
  wind_gusts_mph: number | null;
  wind_gusts_kph: number | null;
  uv_index: number | null;
}

export interface NormalizedWeatherForecast {
  pool_id: string;
  provider: string;
  fetched_at: string;
  stale: boolean;
  location: {
    latitude: number;
    longitude: number;
    timezone: string | null;
    source: "manual" | "geocoded";
    name: string | null;
  };
  daily: WeatherDailyForecast[];
  hourly: WeatherHourlyForecast[];
}

export interface WeatherForecastView {
  pool_id: string;
  provider: string;
  status: "available" | "empty";
  message: string;
  stale: boolean;
  fetched_at: string | null;
  location: NormalizedWeatherForecast["location"] | null;
  daily: WeatherDailyForecast[];
  hourly: WeatherHourlyForecast[];
}

export interface WeatherHistoryPoint {
  timestamp: string;
  value: number;
}

export interface WeatherHistorySeries {
  metric: WeatherHistoryMetric;
  points: WeatherHistoryPoint[];
}

export interface WeatherHistoryView {
  pool_id: string;
  provider: string;
  metric: WeatherHistoryMetric;
  status: "available" | "empty";
  message: string;
  stale: boolean;
  fetched_at: string | null;
  range: {
    start: string;
    end: string;
  };
  interval: string | null;
  series: WeatherHistorySeries[];
}

export interface WeatherProviderHealthView {
  status: "healthy" | "degraded" | "unhealthy" | "down" | "unknown";
  message: string;
  last_checked: string | null;
  checks: Record<string, { status: "healthy" | "degraded" | "unhealthy" | "down" | "unknown"; message?: string }>;
}

export interface WeatherForecastProvider {
  getForecast(location: GeoLocation): Promise<{
    timezone: string | null;
    daily: WeatherDailyForecast[];
    hourly: WeatherHourlyForecast[];
  }>;
  geocodeAddress(address: string): Promise<GeoLocation | null>;
}

export interface WeatherForecastServiceOptions {
  poolId: string;
  poolSite: PoolSiteConfig;
  weather: WeatherProviderConfig;
  influx?: InfluxTelemetryConfig | null;
  fetchImpl?: typeof fetch;
  onUpdate?: (view: WeatherForecastView) => void;
  locationResolver?: () => Promise<{ location: GeoLocation; source: "manual" | "geocoded" } | null>;
}

export interface WeatherHistoryQuery {
  metric: WeatherHistoryMetric;
  start?: string | null;
  end?: string | null;
  interval?: string | null;
}

export class WeatherForecastService {
  private readonly fetchImpl: typeof fetch;
  private readonly refreshIntervalMs: number;
  private readonly refreshMinutes: number[] | null;
  private readonly provider: WeatherForecastProvider;
  private readonly influx: InfluxTelemetryConfig | null;
  private readonly onUpdate?: (view: WeatherForecastView) => void;
  private readonly poolId: string;
  private readonly poolSite: PoolSiteConfig;
  private readonly locationResolver?: WeatherForecastServiceOptions["locationResolver"];
  private geocodedLocation: GeoLocation | null = null;
  private cache: WeatherForecastView = emptyWeatherView("No weather forecast has been captured yet.");
  private refreshInFlight: Promise<WeatherForecastView> | null = null;
  private lastRefreshError: string | null = null;
  private hasAttemptedRefresh = false;

  constructor(options: WeatherForecastServiceOptions) {
    this.poolId = options.poolId;
    this.poolSite = options.poolSite;
    this.locationResolver = options.locationResolver;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.refreshMinutes = options.weather.refreshMinutes;
    this.refreshIntervalMs = options.weather.refreshIntervalHours * 60 * 60 * 1000;
    this.provider = new OpenMeteoWeatherProvider({
      baseUrl: options.weather.openMeteoBaseUrl,
      geocodingUrl: options.weather.openMeteoGeocodingUrl,
      fetchImpl: this.fetchImpl
    });
    this.influx = options.influx ?? null;
    this.onUpdate = options.onUpdate;
    this.cache = {
      ...emptyWeatherView("No weather forecast has been captured yet."),
      pool_id: this.poolId
    };
  }

  start(signal: AbortSignal): void {
    void this.refreshNow();
    if (this.refreshMinutes && this.refreshMinutes.length > 0) {
      this.scheduleNextMinuteRefresh(signal);
      return;
    }

    const interval = setInterval(() => {
      void this.refreshIfDue();
    }, this.refreshIntervalMs);
    signal.addEventListener("abort", () => clearInterval(interval), { once: true });
  }

  async getLatest(): Promise<WeatherForecastView> {
    return this.cache;
  }

  async getHistory(query: WeatherHistoryQuery): Promise<WeatherHistoryView> {
    const start = query.start ?? new Date(Date.now() - DEFAULT_HISTORY_LOOKBACK_MS).toISOString();
    const end = query.end ?? new Date().toISOString();
    const interval = query.interval ?? inferWeatherRefreshInterval(this.refreshMinutes, this.refreshIntervalMs);

    if (!this.influx) {
      return emptyWeatherHistoryView(this.poolId, query.metric, start, end, interval, "Weather history persistence is not configured.");
    }

    try {
      const rows = await queryForecastHistoryRows(this.influx, this.fetchImpl, this.poolId, query.metric, start, end, query.interval ?? null);
      if (rows.length === 0) {
        const fallback = this.buildHistoryFromCachedForecast(query.metric, start, end, interval);
        if (fallback) {
          return fallback;
        }
        return emptyWeatherHistoryView(this.poolId, query.metric, start, end, interval, "No weather history has been captured yet.");
      }

      const points = rows.flatMap((row) => {
        const timestamp = readString(row._time);
        const value = readNumber(parseInfluxNumber(row._value));
        if (!timestamp || value == null) {
          return [];
        }
        return [{ timestamp, value }];
      });
      if (points.length === 0) {
        return emptyWeatherHistoryView(this.poolId, query.metric, start, end, interval, "No weather history has been captured yet.");
      }

      return {
        pool_id: this.poolId,
        provider: readString(rows[0]?.provider) ?? this.cache.provider,
        metric: query.metric,
        status: "available",
        message: "Weather history is available.",
        stale: this.cache.stale,
        fetched_at: this.cache.fetched_at,
        range: { start, end },
        interval,
        series: [
          {
            metric: query.metric,
            points
          }
        ]
      };
    } catch (error) {
      return emptyWeatherHistoryView(
        this.poolId,
        query.metric,
        start,
        end,
        interval,
        `Weather history is temporarily unavailable: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async checkHealth(): Promise<WeatherProviderHealthView> {
    const lastChecked = new Date().toISOString();
    const hasLocation =
      (typeof this.poolSite.latitude === "number" && typeof this.poolSite.longitude === "number")
      || [this.poolSite.streetAddress, this.poolSite.city, this.poolSite.state, this.poolSite.postalCode].some(
        (value) => Boolean(value && value.trim().length > 0)
      );

    if (!hasLocation) {
      return {
        status: "unhealthy",
        message: "Pool site location is not configured for weather forecasts",
        last_checked: lastChecked,
        checks: {
          configuration: {
            status: "unhealthy",
            message: "No manual latitude/longitude or geocodable pool address is configured"
          }
        }
      };
    }

    if (!this.hasAttemptedRefresh) {
      return {
        status: "unknown",
        message: "Weather forecast refresh has not completed yet",
        last_checked: lastChecked,
        checks: {
          configuration: {
            status: "healthy",
            message: "Weather provider is configured"
          },
          provider: {
            status: "unknown",
            message: "Waiting for first refresh"
          }
        }
      };
    }

    if (this.cache.status === "available" && !this.cache.stale) {
      return {
        status: "healthy",
        message: "Weather forecast cache is current",
        last_checked: lastChecked,
        checks: {
          configuration: {
            status: "healthy",
            message: "Weather provider is configured"
          },
          provider: {
            status: "healthy",
            message: "Latest forecast refresh succeeded"
          },
          cache: {
            status: "healthy",
            message: "Normalized forecast cache is current"
          }
        }
      };
    }

    if (this.cache.status === "available" && this.cache.stale) {
      return {
        status: "degraded",
        message: this.cache.message,
        last_checked: lastChecked,
        checks: {
          configuration: {
            status: "healthy",
            message: "Weather provider is configured"
          },
          provider: {
            status: "degraded",
            message: this.lastRefreshError ?? "Latest refresh failed but cached forecast is still available"
          },
          cache: {
            status: "degraded",
            message: "Showing last known valid forecast"
          }
        }
      };
    }

    return {
      status: "down",
      message: this.cache.message,
      last_checked: lastChecked,
      checks: {
        configuration: {
          status: "healthy",
          message: "Weather provider is configured"
        },
        provider: {
          status: "down",
          message: this.lastRefreshError ?? this.cache.message
        }
      }
    };
  }

  async refreshNow(): Promise<WeatherForecastView> {
    if (this.refreshInFlight) {
      return this.refreshInFlight;
    }

    this.refreshInFlight = this.performRefresh().finally(() => {
      this.refreshInFlight = null;
    });
    return this.refreshInFlight;
  }

  private async refreshIfDue(): Promise<void> {
    const fetchedAt = this.cache.fetched_at ? Date.parse(this.cache.fetched_at) : null;
    if (fetchedAt != null && Number.isFinite(fetchedAt) && Date.now() - fetchedAt < this.refreshIntervalMs && !this.cache.stale) {
      return;
    }
    await this.refreshNow();
  }

  private scheduleNextMinuteRefresh(signal: AbortSignal): void {
    if (!this.refreshMinutes || this.refreshMinutes.length === 0 || signal.aborted) {
      return;
    }

    const timeout = setTimeout(() => {
      void this.refreshNow().finally(() => {
        this.scheduleNextMinuteRefresh(signal);
      });
    }, computeNextMinuteRefreshDelay(Date.now(), this.refreshMinutes));

    signal.addEventListener("abort", () => clearTimeout(timeout), { once: true });
  }

  private async performRefresh(): Promise<WeatherForecastView> {
    this.hasAttemptedRefresh = true;
    try {
      const resolvedLocation = await this.resolveLocation();
      if (!resolvedLocation) {
        this.cache = emptyWeatherView("No pool site location is configured for weather forecast refresh.");
        this.lastRefreshError = this.cache.message;
        return this.cache;
      }

      const forecast = await this.provider.getForecast(resolvedLocation.location);
      const fetchedAt = new Date().toISOString();
      const nextView: WeatherForecastView = {
        pool_id: this.poolId,
        provider: DEFAULT_PROVIDER,
        status: "available",
        message: "Weather forecast is available.",
        stale: false,
        fetched_at: fetchedAt,
        location: {
          latitude: resolvedLocation.location.latitude,
          longitude: resolvedLocation.location.longitude,
          timezone: forecast.timezone ?? resolvedLocation.location.timezone ?? this.poolSite.timezone,
          source: resolvedLocation.source,
          name: resolvedLocation.location.name ?? null
        },
        daily: forecast.daily,
        hourly: forecast.hourly
      };
      this.cache = nextView;
      this.lastRefreshError = null;
      void writeForecastSnapshots(this.influx, this.fetchImpl, nextView);
      this.onUpdate?.(nextView);
      return nextView;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.lastRefreshError = message;
      if (this.cache.status === "available") {
        this.cache = {
          ...this.cache,
          stale: true,
          message: `Weather forecast is stale: ${message}`
        };
        this.onUpdate?.(this.cache);
        return this.cache;
      }

      this.cache = emptyWeatherView(`Weather forecast is unavailable: ${message}`);
      return this.cache;
    }
  }

  private async resolveLocation(): Promise<{ location: GeoLocation; source: "manual" | "geocoded" } | null> {
    if (this.locationResolver) {
      const resolved = await this.locationResolver();
      if (resolved) {
        return resolved;
      }
    }

    if (typeof this.poolSite.latitude === "number" && typeof this.poolSite.longitude === "number") {
      return {
        location: {
          latitude: this.poolSite.latitude,
          longitude: this.poolSite.longitude,
          timezone: this.poolSite.timezone,
          name: null
        },
        source: "manual"
      };
    }

    if (this.geocodedLocation) {
      return {
        location: this.geocodedLocation,
        source: "geocoded"
      };
    }

    const address = [this.poolSite.streetAddress, this.poolSite.city, this.poolSite.state, this.poolSite.postalCode]
      .filter((value) => value && value.trim().length > 0)
      .join(", ");

    if (address.length === 0) {
      return null;
    }

    const geocoded = await this.provider.geocodeAddress(address);
    if (!geocoded) {
      return null;
    }

    this.geocodedLocation = geocoded;
    return {
      location: geocoded,
      source: "geocoded"
    };
  }

  private buildHistoryFromCachedForecast(
    metric: WeatherHistoryMetric,
    start: string,
    end: string,
    interval: string | null
  ): WeatherHistoryView | null {
    if (this.cache.status !== "available" || this.cache.hourly.length === 0) {
      return null;
    }

    const points = this.cache.hourly.flatMap((entry) => {
      const value = readWeatherHistoryMetric(entry, metric);
      if (value == null) {
        return [];
      }
      return [{
        timestamp: entry.timestamp,
        value
      }];
    });

    if (points.length === 0) {
      return null;
    }

    return {
      pool_id: this.poolId,
      provider: this.cache.provider,
      metric,
      status: "available",
      message: "Weather history is available from the latest cached forecast snapshot.",
      stale: this.cache.stale,
      fetched_at: this.cache.fetched_at,
      range: { start, end },
      interval,
      series: [
        {
          metric,
          points
        }
      ]
    };
  }
}

interface OpenMeteoWeatherProviderOptions {
  baseUrl: string;
  geocodingUrl: string;
  fetchImpl: typeof fetch;
}

export class OpenMeteoWeatherProvider implements WeatherForecastProvider {
  constructor(private readonly options: OpenMeteoWeatherProviderOptions) {}

  async getForecast(location: GeoLocation): Promise<{ timezone: string | null; daily: WeatherDailyForecast[]; hourly: WeatherHourlyForecast[] }> {
    const url = new URL(`${trimTrailingSlash(this.options.baseUrl)}/forecast`);
    url.searchParams.set("latitude", String(location.latitude));
    url.searchParams.set("longitude", String(location.longitude));
    url.searchParams.set("forecast_days", "10");
    url.searchParams.set("temperature_unit", "fahrenheit");
    url.searchParams.set("wind_speed_unit", "mph");
    url.searchParams.set("timezone", location.timezone ?? "auto");
    url.searchParams.set(
      "hourly",
      [
        "temperature_2m",
        "relative_humidity_2m",
        "dew_point_2m",
        "precipitation_probability",
        "precipitation",
        "cloud_cover",
        "wind_speed_10m",
        "wind_gusts_10m",
        "uv_index"
      ].join(",")
    );
    url.searchParams.set(
      "daily",
      [
        "weather_code",
        "temperature_2m_max",
        "temperature_2m_min",
        "precipitation_probability_max",
        "precipitation_sum",
        "uv_index_max",
        "sunrise",
        "sunset"
      ].join(",")
    );

    const response = await this.options.fetchImpl(url, {
      headers: {
        Accept: "application/json"
      }
    });
    if (!response.ok) {
      throw new Error(`Open-Meteo forecast request failed with HTTP ${response.status}`);
    }
    const payload = (await response.json()) as Record<string, unknown>;
    return normalizeOpenMeteoForecast(payload);
  }

  async geocodeAddress(address: string): Promise<GeoLocation | null> {
    const url = new URL(`${trimTrailingSlash(this.options.geocodingUrl)}/search`);
    url.searchParams.set("name", address);
    url.searchParams.set("count", "1");
    url.searchParams.set("format", "json");

    const response = await this.options.fetchImpl(url, {
      headers: {
        Accept: "application/json"
      }
    });
    if (!response.ok) {
      throw new Error(`Open-Meteo geocoding request failed with HTTP ${response.status}`);
    }
    const payload = (await response.json()) as Record<string, unknown>;
    const results = Array.isArray(payload.results) ? payload.results : [];
    const first = results[0];
    if (!first || typeof first !== "object") {
      return null;
    }

    const latitude = readNumber(first.latitude);
    const longitude = readNumber(first.longitude);
    if (latitude == null || longitude == null) {
      return null;
    }

    return {
      latitude,
      longitude,
      timezone: readString(first.timezone),
      name: readString(first.name)
    };
  }
}

function normalizeOpenMeteoForecast(payload: Record<string, unknown>): {
  timezone: string | null;
  daily: WeatherDailyForecast[];
  hourly: WeatherHourlyForecast[];
} {
  const daily = (payload.daily ?? {}) as Record<string, unknown>;
  const hourly = (payload.hourly ?? {}) as Record<string, unknown>;
  const dailyTime = readStringArray(daily.time);
  const hourlyTime = readStringArray(hourly.time);

  return {
    timezone: readString(payload.timezone),
    daily: dailyTime.map((date, index) => ({
      date,
      weather_code: readArrayNumber(daily.weather_code, index),
      high_temp_f: readArrayNumber(daily.temperature_2m_max, index),
      high_temp_c: toCelsius(readArrayNumber(daily.temperature_2m_max, index)),
      low_temp_f: readArrayNumber(daily.temperature_2m_min, index),
      low_temp_c: toCelsius(readArrayNumber(daily.temperature_2m_min, index)),
      precipitation_probability_max: readArrayNumber(daily.precipitation_probability_max, index),
      precipitation_amount: readArrayNumber(daily.precipitation_sum, index),
      precipitation_unit: "mm",
      uv_index_max: readArrayNumber(daily.uv_index_max, index),
      sunrise: readArrayString(daily.sunrise, index),
      sunset: readArrayString(daily.sunset, index)
    })),
    hourly: hourlyTime.map((timestamp, index) => ({
      timestamp,
      temperature_f: readArrayNumber(hourly.temperature_2m, index),
      temperature_c: toCelsius(readArrayNumber(hourly.temperature_2m, index)),
      relative_humidity: readArrayNumber(hourly.relative_humidity_2m, index),
      dew_point_f: readArrayNumber(hourly.dew_point_2m, index),
      dew_point_c: toCelsius(readArrayNumber(hourly.dew_point_2m, index)),
      precipitation_probability: readArrayNumber(hourly.precipitation_probability, index),
      precipitation_amount: readArrayNumber(hourly.precipitation, index),
      precipitation_unit: "mm",
      cloud_cover: readArrayNumber(hourly.cloud_cover, index),
      wind_speed_mph: readArrayNumber(hourly.wind_speed_10m, index),
      wind_speed_kph: toKilometersPerHour(readArrayNumber(hourly.wind_speed_10m, index)),
      wind_gusts_mph: readArrayNumber(hourly.wind_gusts_10m, index),
      wind_gusts_kph: toKilometersPerHour(readArrayNumber(hourly.wind_gusts_10m, index)),
      uv_index: readArrayNumber(hourly.uv_index, index)
    }))
  };
}

function emptyWeatherView(message: string): WeatherForecastView {
  return {
    pool_id: "",
    provider: DEFAULT_PROVIDER,
    status: "empty",
    message,
    stale: false,
    fetched_at: null,
    location: null,
    daily: [],
    hourly: []
  };
}

function emptyWeatherHistoryView(
  poolId: string,
  metric: WeatherHistoryMetric,
  start: string,
  end: string,
  interval: string | null,
  message: string
): WeatherHistoryView {
  return {
    pool_id: poolId,
    provider: DEFAULT_PROVIDER,
    metric,
    status: "empty",
    message,
    stale: false,
    fetched_at: null,
    range: { start, end },
    interval,
    series: []
  };
}

async function queryForecastHistoryRows(
  influx: InfluxTelemetryConfig,
  fetchImpl: typeof fetch,
  poolId: string,
  metric: WeatherHistoryMetric,
  start: string,
  end: string,
  interval: string | null
): Promise<Array<Record<string, string>>> {
  const aggregateWindow = interval && interval.trim().length > 0
    ? `\n  |> aggregateWindow(every: ${interval}, fn: last, createEmpty: false)`
    : "";
  const flux = `
from(bucket: "${escapeFluxString(influx.bucket)}")
  |> range(start: time(v: "${escapeFluxString(start)}"), stop: time(v: "${escapeFluxString(end)}"))
  |> filter(fn: (r) => r._measurement == "${HOURLY_MEASUREMENT}")
  |> filter(fn: (r) => r.pool_id == "${escapeFluxString(poolId)}")
  |> filter(fn: (r) => r._field == "${escapeFluxString(metric)}")
${aggregateWindow}
  |> keep(columns: ["_time", "_value", "provider"])
  |> sort(columns: ["_time"])
`.trim();
  return queryInfluxRows(influx, fetchImpl, flux);
}

export function computeNextMinuteRefreshDelay(nowMs: number, refreshMinutes: number[]): number {
  const now = new Date(nowMs);
  const baseline = new Date(nowMs);
  baseline.setSeconds(0, 0);

  for (const minute of refreshMinutes) {
    const candidate = new Date(baseline.getTime());
    candidate.setMinutes(minute, 0, 0);
    if (candidate.getTime() > now.getTime()) {
      return candidate.getTime() - now.getTime();
    }
  }

  baseline.setHours(baseline.getHours() + 1, refreshMinutes[0] as number, 0, 0);
  return baseline.getTime() - now.getTime();
}

function inferWeatherRefreshInterval(refreshMinutes: number[] | null, refreshIntervalMs: number): string {
  if (refreshMinutes && refreshMinutes.length > 1) {
    const gaps = refreshMinutes.map((minute, index) => {
      const next = refreshMinutes[(index + 1) % refreshMinutes.length] as number;
      const delta = next > minute ? next - minute : 60 - minute + next;
      return delta;
    });
    const smallestGap = Math.min(...gaps);
    return smallestGap % 60 === 0 ? `${smallestGap / 60}h` : `${smallestGap}m`;
  }

  if (refreshMinutes && refreshMinutes.length === 1) {
    return "1h";
  }

  const minutes = Math.max(1, Math.round(refreshIntervalMs / 60000));
  if (minutes % 60 === 0) {
    return `${minutes / 60}h`;
  }
  return `${minutes}m`;
}

async function writeForecastSnapshots(
  influx: InfluxTelemetryConfig | null,
  fetchImpl: typeof fetch,
  forecast: WeatherForecastView
): Promise<void> {
  if (!influx || forecast.status !== "available") {
    return;
  }

  const lines = [
    ...forecast.daily.map((entry) => formatDailyLine(forecast, entry)),
    ...forecast.hourly.map((entry) => formatHourlyLine(forecast, entry))
  ].filter((value) => value.length > 0);

  if (lines.length === 0) {
    return;
  }

  try {
    const response = await fetchImpl(
      `${trimTrailingSlash(influx.url)}/api/v2/write?org=${encodeURIComponent(influx.org)}&bucket=${encodeURIComponent(influx.bucket)}&precision=ns`,
      {
        method: "POST",
        headers: {
          Authorization: `Token ${influx.token}`,
          "Content-Type": "text/plain; charset=utf-8"
        },
        body: lines.join("\n")
      }
    );
    if (!response.ok) {
      void response.text();
    }
  } catch {
    // Weather forecast persistence is best-effort and should not fail API operation.
  }
}

function formatDailyLine(forecast: WeatherForecastView, entry: WeatherDailyForecast): string {
  const timestamp = toUnixNs(`${entry.date}T00:00:00Z`);
  if (!timestamp) {
    return "";
  }

  const tags = [
    `pool_id=${escapeTagValue(forecast.pool_id)}`,
    `provider=${escapeTagValue(forecast.provider)}`
  ];
  const fields = [
    numberField("weather_code", entry.weather_code),
    numberField("high_temp_f", entry.high_temp_f),
    numberField("high_temp_c", entry.high_temp_c),
    numberField("low_temp_f", entry.low_temp_f),
    numberField("low_temp_c", entry.low_temp_c),
    numberField("precipitation_probability_max", entry.precipitation_probability_max),
    numberField("precipitation_amount", entry.precipitation_amount),
    numberField("uv_index_max", entry.uv_index_max),
    stringField("sunrise", entry.sunrise),
    stringField("sunset", entry.sunset),
    stringField("fetched_at", forecast.fetched_at),
    stringField("forecast_generated_at", forecast.fetched_at)
  ].filter(Boolean);

  return `${DAILY_MEASUREMENT},${tags.join(",")} ${fields.join(",")} ${timestamp}`;
}

function formatHourlyLine(forecast: WeatherForecastView, entry: WeatherHourlyForecast): string {
  const timestamp = toUnixNs(entry.timestamp);
  if (!timestamp) {
    return "";
  }

  const tags = [
    `pool_id=${escapeTagValue(forecast.pool_id)}`,
    `provider=${escapeTagValue(forecast.provider)}`
  ];
  const fields = [
    numberField("temperature_f", entry.temperature_f),
    numberField("temperature_c", entry.temperature_c),
    numberField("relative_humidity", entry.relative_humidity),
    numberField("dew_point_f", entry.dew_point_f),
    numberField("dew_point_c", entry.dew_point_c),
    numberField("precipitation_probability", entry.precipitation_probability),
    numberField("precipitation_amount", entry.precipitation_amount),
    numberField("cloud_cover", entry.cloud_cover),
    numberField("wind_speed_mph", entry.wind_speed_mph),
    numberField("wind_speed_kph", entry.wind_speed_kph),
    numberField("wind_gusts_mph", entry.wind_gusts_mph),
    numberField("wind_gusts_kph", entry.wind_gusts_kph),
    numberField("uv_index", entry.uv_index),
    stringField("fetched_at", forecast.fetched_at),
    stringField("forecast_generated_at", forecast.fetched_at)
  ].filter(Boolean);

  return `${HOURLY_MEASUREMENT},${tags.join(",")} ${fields.join(",")} ${timestamp}`;
}

function numberField(name: string, value: number | null): string {
  return typeof value === "number" && Number.isFinite(value) ? `${name}=${value}` : "";
}

function stringField(name: string, value: string | null): string {
  return value ? `${name}="${escapeFieldString(value)}"` : "";
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function readArrayNumber(value: unknown, index: number): number | null {
  return Array.isArray(value) ? readNumber(value[index]) : null;
}

function readArrayString(value: unknown, index: number): string | null {
  return Array.isArray(value) ? readString(value[index]) : null;
}

function parseInfluxNumber(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readWeatherHistoryMetric(entry: WeatherHourlyForecast, metric: WeatherHistoryMetric): number | null {
  switch (metric) {
    case "temperature_f":
      return entry.temperature_f;
    case "cloud_cover":
      return entry.cloud_cover;
    case "uv_index":
      return entry.uv_index;
    case "precipitation_probability":
      return entry.precipitation_probability;
    case "precipitation_amount":
      return entry.precipitation_amount;
  }
}

function toCelsius(value: number | null): number | null {
  return typeof value === "number" ? Math.round(((value - 32) * 5) / 9 * 10) / 10 : null;
}

function toKilometersPerHour(value: number | null): number | null {
  return typeof value === "number" ? Math.round(value * 1.609344 * 10) / 10 : null;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/u, "");
}

function escapeFluxString(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"");
}

function escapeTagValue(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll(",", "\\,").replaceAll(" ", "\\ ").replaceAll("=", "\\=");
}

function escapeFieldString(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"");
}

async function queryInfluxRows(
  influx: InfluxTelemetryConfig,
  fetchImpl: typeof fetch,
  flux: string
): Promise<Array<Record<string, string>>> {
  const response = await fetchImpl(`${trimTrailingSlash(influx.url)}/api/v2/query?org=${encodeURIComponent(influx.org)}`, {
    method: "POST",
    headers: {
      Authorization: `Token ${influx.token}`,
      "Content-Type": "application/vnd.flux",
      Accept: "application/csv"
    },
    body: flux
  });
  if (!response.ok) {
    const detail = (await response.text()).trim();
    throw new Error(
      detail.length > 0 ? `InfluxDB query failed with HTTP ${response.status}: ${detail}` : `InfluxDB query failed with HTTP ${response.status}.`
    );
  }
  return parseCsv(await response.text());
}

function parseCsv(input: string): Array<Record<string, string>> {
  const lines = input
    .split(/\r?\n/u)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
  if (lines.length === 0) {
    return [];
  }

  const rows: Array<Record<string, string>> = [];
  let header: string[] | null = null;
  for (const line of lines) {
    const values = splitCsvLine(line);
    if (values[0] === "" && values[1] === "result" && values[2] === "table") {
      header = values;
      continue;
    }
    if (!header) {
      continue;
    }
    const row: Record<string, string> = {};
    header.forEach((key, index) => {
      if (key.length > 0) {
        row[key] = values[index] ?? "";
      }
    });
    rows.push(row);
  }
  return rows;
}

function splitCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "\"") {
      if (inQuotes && line[index + 1] === "\"") {
        current += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  values.push(current);
  return values;
}

function toUnixNs(value: string): string | null {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) {
    return null;
  }
  return `${Math.trunc(ms * 1_000_000)}`;
}
