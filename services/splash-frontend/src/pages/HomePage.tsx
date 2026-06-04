import { useEffect, useState } from "react";
import {
  createPoolCoverEvent,
  fetchCurrentPoolCover,
  fetchPoolCoverHistory,
  fetchSwimmability,
  fetchWeatherForecast
} from "../api";
import { Card } from "../components/mockUi";
import type {
  PoolCoverCurrentData,
  PoolCoverEventRecord,
  PoolCoverType,
  SwimmabilityData,
  WeatherForecastData
} from "../types";

export function HomePage() {
  const [forecast, setForecast] = useState<WeatherForecastData | null>(null);
  const [coverCurrent, setCoverCurrent] = useState<PoolCoverCurrentData | null>(null);
  const [coverHistory, setCoverHistory] = useState<PoolCoverEventRecord[]>([]);
  const [coverTypeDraft, setCoverTypeDraft] = useState<PoolCoverType>("solar");
  const [coverPending, setCoverPending] = useState(false);
  const [coverMessage, setCoverMessage] = useState<string | null>(null);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [swimmability, setSwimmability] = useState<SwimmabilityData | null>(null);
  const [swimmabilityError, setSwimmabilityError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const forecastResponse = await fetchWeatherForecast();
        if (!cancelled) {
          setForecast(forecastResponse.data);
        }
      } catch {}
    })();

    void (async () => {
      try {
        const swimmabilityResponse = await fetchSwimmability();
        if (!cancelled) {
          setSwimmability(swimmabilityResponse.data);
          setSwimmabilityError(null);
        }
      } catch (nextError) {
        if (!cancelled) {
          setSwimmability(null);
          setSwimmabilityError(nextError instanceof Error ? nextError.message : String(nextError));
        }
      }
    })();

    void (async () => {
      try {
        const [coverCurrentResponse, coverHistoryResponse] = await Promise.all([
          fetchCurrentPoolCover(),
          fetchPoolCoverHistory({ limit: 5 })
        ]);
        if (!cancelled) {
          setCoverCurrent(coverCurrentResponse.data);
          setCoverHistory(coverHistoryResponse.data.events);
          setCoverError(null);
        }
      } catch (nextError) {
        if (!cancelled) {
          setCoverError(nextError instanceof Error ? nextError.message : String(nextError));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const hasForecast = forecast?.status === "available" && (forecast.daily.length > 0 || forecast.hourly.length > 0);

  async function refreshCoverData(): Promise<void> {
    const [currentResponse, historyResponse] = await Promise.all([
      fetchCurrentPoolCover(),
      fetchPoolCoverHistory({ limit: 5 })
    ]);
    setCoverCurrent(currentResponse.data);
    setCoverHistory(historyResponse.data.events);
  }

  async function handleCoverSave(state: "on" | "off"): Promise<void> {
    setCoverPending(true);
    setCoverMessage(null);
    setCoverError(null);
    try {
      await createPoolCoverEvent({
        state,
        coverType: state === "on" ? coverTypeDraft : undefined
      });
      await refreshCoverData();
      setCoverMessage(state === "on" ? "Cover marked on." : "Cover marked off.");
    } catch (nextError) {
      setCoverError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setCoverPending(false);
    }
  }

  return (
    <section className="automation-shell">
      <div className="automation-grid automation-grid-overview">
        <Card title="Swimmability">
          {swimmability ? (
            <>
              <div className="mock-summary-grid">
                <div><strong>{swimmability.score}</strong><span>Score</span></div>
                <div><strong>{formatSwimmabilityStatus(swimmability.status)}</strong><span>Status</span></div>
              </div>
              <p className="panel-copy" style={{ marginTop: "1rem" }}>{swimmability.summary}</p>
              <div className="automation-record-list" style={{ marginTop: "1rem" }}>
                {swimmability.drivers.slice(0, 4).map((driver) => (
                  <div className="automation-record-row" key={driver.key}>
                    <strong>{formatDriverLabel(driver.key)}</strong>
                    <span>{driver.message}</span>
                  </div>
                ))}
                <div className="automation-record-row">
                  <strong>Updated</strong>
                  <span>{formatTelemetryTimestamp(swimmability.updated_at)}</span>
                </div>
              </div>
            </>
          ) : (
            <p className="chart-empty-state">{swimmabilityError ?? "Swimmability is currently unknown."}</p>
          )}
        </Card>
      </div>

      <div className="automation-grid automation-grid-two-column">
        <Card title="Weather Impact" className="automation-card-table">
          {hasForecast ? (
            <WeatherImpactCard forecast={forecast as WeatherForecastData} />
          ) : (
            <p className="chart-empty-state">{forecast?.message ?? "No weather forecast has been captured yet."}</p>
          )}
        </Card>
        <Card title="Pool Cover">
          {coverCurrent?.current ? (
            <div className="automation-record-list">
              <div className="automation-record-row">
                <strong>Current State</strong>
                <span>{coverCurrent.current.state === "on" ? "Cover On" : "Cover Off"}</span>
              </div>
              <div className="automation-record-row">
                <strong>Cover Type</strong>
                <span>{formatCoverType(coverCurrent.current.cover_type)}</span>
              </div>
              <div className="automation-record-row">
                <strong>Last Updated</strong>
                <span>{formatTelemetryTimestamp(coverCurrent.current.recorded_at)}</span>
              </div>
            </div>
          ) : (
            <p className="chart-empty-state">No cover event has been recorded yet.</p>
          )}

          <div className="settings-form-grid" style={{ marginTop: "1rem" }}>
            <label htmlFor="home-cover-type">
              <span>Cover Type</span>
              <select
                id="home-cover-type"
                value={coverTypeDraft}
                onChange={(event) => setCoverTypeDraft(event.target.value as PoolCoverType)}
                disabled={coverPending}
              >
                <option value="solar">Solar</option>
                <option value="winter">Winter</option>
                <option value="safety">Safety</option>
                <option value="automatic">Automatic</option>
                <option value="unknown">Unknown</option>
              </select>
            </label>
          </div>

          <div className="form-action-row">
            <button type="button" onClick={() => void handleCoverSave("on")} disabled={coverPending}>
              {coverPending ? "Saving..." : "Cover On"}
            </button>
            <button type="button" className="secondary-button" onClick={() => void handleCoverSave("off")} disabled={coverPending}>
              {coverPending ? "Saving..." : "Cover Off"}
            </button>
          </div>

          {coverMessage ? <p className="form-caption">{coverMessage}</p> : null}
          {coverError ? <p className="form-error">{coverError}</p> : null}

          <div className="automation-record-list" style={{ marginTop: "1rem" }}>
            <div className="automation-record-row">
              <strong>Recent Events</strong>
              <span>{coverHistory.length === 0 ? "No cover history yet." : ""}</span>
            </div>
            {coverHistory.map((event) => (
              <div className="automation-record-row" key={event.id}>
                <strong>{event.state === "on" ? "Cover On" : "Cover Off"}</strong>
                <span>{formatCoverType(event.cover_type)} · {formatTelemetryTimestamp(event.recorded_at)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </section>
  );
}

function WeatherImpactCard({ forecast }: { forecast: WeatherForecastData }) {
  const today = forecast.daily[0];
  const upcoming = forecast.daily.slice(1, 4);

  return (
    <div className="weather-impact-card">
      <div className="weather-impact-grid">
        <div className="weather-impact-today">
          <div className="weather-impact-symbol">{weatherCodeIcon(today?.weather_code)}</div>
          <div className="weather-impact-temperature">{formatTemperatureHeadline(today?.high_temp_f)}</div>
          <div className="weather-impact-condition">{weatherCodeLabel(today?.weather_code)}</div>
          <div className="weather-impact-label">{deriveWeatherImpact(today)}</div>
        </div>
        {upcoming.map((entry) => (
          <div className="weather-impact-day" key={entry.date}>
            <div className="weather-impact-day-label">{formatShortDay(entry.date)}</div>
            <div className="weather-impact-day-range">{formatRange(entry.high_temp_f, entry.low_temp_f)}</div>
            <div className="weather-impact-day-symbol">{weatherCodeIcon(entry.weather_code)}</div>
            <div className="weather-impact-day-note">{formatDayImpact(entry)}</div>
          </div>
        ))}
      </div>
      <div className="weather-impact-meta">
        <strong>{forecast.provider}</strong>
        <span>{forecast.stale ? "Stale forecast" : "Forecast current"}</span>
      </div>
    </div>
  );
}

function formatCoverType(value: PoolCoverType): string {
  switch (value) {
    case "solar":
      return "Solar";
    case "winter":
      return "Winter";
    case "safety":
      return "Safety";
    case "automatic":
      return "Automatic";
    default:
      return "Unknown";
  }
}

function formatSwimmabilityStatus(value: SwimmabilityData["status"]): string {
  switch (value) {
    case "good":
      return "Good";
    case "caution":
      return "Caution";
    case "poor":
      return "Poor";
    default:
      return "Unknown";
  }
}

function weatherCodeLabel(value: number | null | undefined): string {
  switch (value) {
    case 0:
      return "Clear skies";
    case 1:
      return "Mostly clear";
    case 2:
      return "Partly cloudy";
    case 3:
      return "Cloudy";
    case 45:
    case 48:
      return "Fog";
    case 51:
    case 53:
    case 55:
    case 61:
    case 63:
    case 65:
    case 80:
    case 81:
    case 82:
      return "Rain";
    case 71:
    case 73:
    case 75:
      return "Snow";
    case 95:
    case 96:
    case 99:
      return "Storms";
    default:
      return "Weather";
  }
}

function weatherCodeIcon(value: number | null | undefined): string {
  switch (value) {
    case 0:
      return "☀️";
    case 1:
      return "🌤️";
    case 2:
      return "⛅";
    case 3:
      return "☁️";
    case 45:
    case 48:
      return "🌫️";
    case 51:
    case 53:
    case 55:
    case 61:
    case 63:
    case 65:
    case 80:
    case 81:
    case 82:
      return "🌦️";
    case 71:
    case 73:
    case 75:
      return "❄️";
    case 95:
    case 96:
    case 99:
      return "⛈️";
    default:
      return "🌤️";
  }
}

function deriveWeatherImpact(
  entry:
    | WeatherForecastData["daily"][number]
    | undefined
): string {
  if (!entry) {
    return "Weather impact unavailable";
  }
  if ((entry.precipitation_probability_max ?? 0) >= 60) {
    return "Rain may dilute chemistry";
  }
  if ((entry.uv_index_max ?? 0) >= 8 || (entry.high_temp_f ?? 0) >= 88) {
    return "Elevated chlorine demand";
  }
  if ((entry.uv_index_max ?? 0) >= 5 || (entry.high_temp_f ?? 0) >= 80) {
    return "Moderate chlorine demand";
  }
  return "Low chlorine demand";
}

function formatDayImpact(
  entry:
    | WeatherForecastData["daily"][number]
    | undefined
): string {
  if (!entry) {
    return "Unknown";
  }
  if ((entry.precipitation_probability_max ?? 0) >= 60) {
    return "Rain";
  }
  if ((entry.uv_index_max ?? 0) >= 8) {
    return "High";
  }
  if ((entry.uv_index_max ?? 0) >= 5) {
    return "Moderate";
  }
  return "Stable";
}

function formatTemperatureHeadline(value: number | null | undefined): string {
  if (typeof value !== "number") {
    return "n/a";
  }
  return `${Math.round(value)}°F`;
}

function formatShortDay(value: string): string {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date);
}

function formatDriverLabel(value: string): string {
  switch (value) {
    case "free_chlorine":
      return "Free Chlorine";
    case "chemistry_recency":
      return "Chemistry Age";
    case "weather_context":
      return "Weather";
    case "cover_state":
      return "Cover";
    case "water_temperature":
      return "Water Temp";
    case "ph":
      return "pH";
    case "cyanuric_acid":
      return "CYA";
    case "combined_chlorine":
      return "Combined Chlorine";
    case "total_alkalinity":
      return "Alkalinity";
    case "calcium_hardness":
      return "Hardness";
    default:
      return value.replaceAll("_", " ");
  }
}

function formatRange(high: number | null | undefined, low: number | null | undefined): string {
  if (typeof high !== "number" || typeof low !== "number") {
    return "Unavailable";
  }
  return `${Math.round(high)}° / ${Math.round(low)}°`;
}

function formatTelemetryTimestamp(value: string | null | undefined): string {
  if (!value) {
    return "Unavailable";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}
