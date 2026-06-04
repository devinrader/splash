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
        <Card title="Weather Forecast" className="automation-card-table">
          {hasForecast ? (
            <WeatherForecastSummary forecast={forecast as WeatherForecastData} />
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

      <div className="automation-grid automation-grid-two-column">
        <Card title="Weather Detail">
          {hasForecast ? (
            <WeatherForecastDetail forecast={forecast as WeatherForecastData} />
          ) : (
            <p className="chart-empty-state">{forecast?.stale ? "Latest forecast is stale." : "Weather data unavailable."}</p>
          )}
        </Card>
      </div>
    </section>
  );
}

function WeatherForecastSummary({ forecast }: { forecast: WeatherForecastData }) {
  const today = forecast.daily[0];
  const tomorrow = forecast.daily[1];

  return (
    <div className="automation-record-list">
      <div className="automation-record-row">
        <strong>{today?.date ?? "Today"}</strong>
        <span>{formatRange(today?.high_temp_f, today?.low_temp_f)} · UV {formatNullableNumber(today?.uv_index_max)} · Rain {formatPercent(today?.precipitation_probability_max)}</span>
      </div>
      {tomorrow ? (
        <div className="automation-record-row">
          <strong>{tomorrow.date}</strong>
          <span>{formatRange(tomorrow.high_temp_f, tomorrow.low_temp_f)} · UV {formatNullableNumber(tomorrow.uv_index_max)} · Rain {formatPercent(tomorrow.precipitation_probability_max)}</span>
        </div>
      ) : null}
      <div className="automation-record-row">
        <strong>Provider</strong>
        <span>{forecast.provider}{forecast.stale ? " · stale" : ""}</span>
      </div>
    </div>
  );
}

function WeatherForecastDetail({ forecast }: { forecast: WeatherForecastData }) {
  return (
    <div className="automation-record-list">
      {forecast.daily.slice(0, 10).map((entry) => (
        <div className="automation-record-row" key={entry.date}>
          <strong>{entry.date}</strong>
          <span>{formatRange(entry.high_temp_f, entry.low_temp_f)} · UV {formatNullableNumber(entry.uv_index_max)} · Rain {formatPercent(entry.precipitation_probability_max)}</span>
        </div>
      ))}
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
  return `${Math.round(high)} °F / ${Math.round(low)} °F`;
}

function formatPercent(value: number | null | undefined): string {
  return typeof value === "number" ? `${Math.round(value)}%` : "n/a";
}

function formatNullableNumber(value: number | null | undefined): string {
  return typeof value === "number" ? String(Math.round(value * 10) / 10) : "n/a";
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
