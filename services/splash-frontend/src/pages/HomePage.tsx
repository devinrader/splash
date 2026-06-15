import { useEffect, useState } from "react";
import {
  createPoolCoverEvent,
  fetchCurrentPoolCover,
  fetchPredictedSwimmability,
  fetchPoolCoverHistory,
  fetchSwimmability,
  fetchWeatherForecast
} from "../api";
import { Card } from "../components/mockUi";
import type {
  PoolCoverCurrentData,
  PoolCoverEventRecord,
  PoolCoverType,
  PredictedSwimmabilityData,
  SwimmabilityData,
  ValueProvenanceData,
  WeatherForecastData
} from "../types";

export function HomePage() {
  const [forecast, setForecast] = useState<WeatherForecastData | null>(null);
  const [coverCurrent, setCoverCurrent] = useState<PoolCoverCurrentData | null>(null);
  const [coverHistory, setCoverHistory] = useState<PoolCoverEventRecord[]>([]);
  const [coverTypeDraft, setCoverTypeDraft] = useState<PoolCoverType>("solar");
  const [retroactiveCoverState, setRetroactiveCoverState] = useState<"on" | "off">("on");
  const [retroactiveCoverType, setRetroactiveCoverType] = useState<PoolCoverType>("solar");
  const [retroactiveRecordedAt, setRetroactiveRecordedAt] = useState("");
  const [coverPending, setCoverPending] = useState(false);
  const [coverMessage, setCoverMessage] = useState<string | null>(null);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [swimmability, setSwimmability] = useState<SwimmabilityData | null>(null);
  const [swimmabilityError, setSwimmabilityError] = useState<string | null>(null);
  const [predictedSwimmability, setPredictedSwimmability] = useState<PredictedSwimmabilityData | null>(null);

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
        const predictedResponse = await fetchPredictedSwimmability();
        if (!cancelled) {
          setPredictedSwimmability(predictedResponse.data);
        }
      } catch {
        if (!cancelled) {
          setPredictedSwimmability(null);
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

  async function handleRetroactiveCoverSave(): Promise<void> {
    if (!retroactiveRecordedAt) {
      setCoverError("Choose the effective cover date and time.");
      return;
    }

    setCoverPending(true);
    setCoverMessage(null);
    setCoverError(null);
    try {
      await createPoolCoverEvent({
        state: retroactiveCoverState,
        coverType: retroactiveCoverState === "on" ? retroactiveCoverType : undefined,
        recordedAt: convertDatetimeLocalToIso(retroactiveRecordedAt)
      });
      await refreshCoverData();
      setCoverMessage("Retroactive cover event saved.");
      setRetroactiveRecordedAt("");
    } catch (nextError) {
      setCoverError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setCoverPending(false);
    }
  }

  return (
    <section className="automation-shell">
      <div className="automation-grid automation-grid-overview">
        <Card title="Swimmability" showHeader={false} shadowless={true}>
          {swimmability ? (
            <div className="swim-card-content">
              <div className="swim-score-layout">
                <div
                  className={`swim-score-ring swim-score-ring-${swimmability.status}`}
                  style={{ ["--swim-score" as string]: String(swimmability.score) }}
                >
                  <div>
                    <strong>{swimmability.score}</strong>
                    <span>{formatSwimmabilityStatus(swimmability.status)}</span>
                  </div>
                </div>
                <div className="swim-status">
                  <h3>{swimmability.headline}</h3>
                  <p className="panel-copy">{swimmability.summary}</p>
                  <div className="swim-meta">
                    <div>
                      <span>Last Chemistry </span>
                      <strong>{swimmability.last_chemistry_age_label ?? "Unavailable"}</strong>
                    </div>
                    <div>
                      <span>Confidence </span>
                      <strong>{formatSwimmabilityConfidence(swimmability.confidence)}</strong>
                    </div>
                  </div>
                </div>
              </div>
              {swimmability.input_provenance ? (
                <div className="swim-provenance-list" aria-label="Swimmability input provenance">
                  {buildSwimmabilityProvenanceRows(swimmability).map((entry) => (
                    <div className="swim-provenance-item" key={entry.label}>
                      <strong>{entry.label}</strong>
                      <span>{entry.summary}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              {predictedSwimmability?.predictions.length ? (
                <div className="swim-prediction-list" aria-label="Predicted swimmability">
                  {predictedSwimmability.predictions.slice(0, 3).map((prediction) => (
                    <div className="swim-prediction-item" key={prediction.horizon}>
                      <strong>{formatPredictionHorizon(prediction.horizon)}</strong>
                      <span>{formatSwimmabilityStatus(prediction.status)} · {prediction.score}</span>
                      <span>{formatSwimmabilityConfidence(prediction.confidence)} confidence</span>
                    </div>
                  ))}
                </div>
              ) : null}
              {/* <div className="swim-highlights">
                {swimmability.highlights.map((highlight, index) => (
                  <div className={`swim-highlight swim-highlight-${highlight.tone}`} key={`${highlight.label}-${index}`}>
                    {highlight.label}
                  </div>
                ))}
              </div>
              <div className="swim-supporting-meta">
                <div className="automation-record-row">
                  <strong>Updated</strong>
                  <span>{formatTelemetryTimestamp(swimmability.updated_at)}</span>
                </div>
              </div> */}
            </div>
          ) : (
            <p className="chart-empty-state">{swimmabilityError ?? "Swimmability is currently unknown."}</p>
          )}
        </Card>
        <Card title="Weather Impact" showHeader={false} shadowless={true} borderless={true} className="automation-card-table">
          {hasForecast ? (
            <WeatherImpactCard forecast={forecast as WeatherForecastData} />
          ) : (
            <p className="chart-empty-state">{forecast?.message ?? "No weather forecast has been captured yet."}</p>
          )}
        </Card>
      </div>

      <div className="automation-grid automation-grid-two-column">
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
              <span>Real-Time Cover Type</span>
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

          <div className="settings-form-grid" style={{ marginTop: "1rem" }}>
            <label htmlFor="home-retroactive-cover-state">
              <span>Retroactive State</span>
              <select
                id="home-retroactive-cover-state"
                value={retroactiveCoverState}
                onChange={(event) => setRetroactiveCoverState(event.target.value as "on" | "off")}
                disabled={coverPending}
              >
                <option value="on">Cover On</option>
                <option value="off">Cover Off</option>
              </select>
            </label>
            <label htmlFor="home-retroactive-cover-type">
              <span>Retroactive Cover Type</span>
              <select
                id="home-retroactive-cover-type"
                value={retroactiveCoverType}
                onChange={(event) => setRetroactiveCoverType(event.target.value as PoolCoverType)}
                disabled={coverPending || retroactiveCoverState === "off"}
              >
                <option value="solar">Solar</option>
                <option value="winter">Winter</option>
                <option value="safety">Safety</option>
                <option value="automatic">Automatic</option>
                <option value="unknown">Unknown</option>
              </select>
            </label>
            <label htmlFor="home-retroactive-recorded-at">
              <span>Effective Date and Time</span>
              <input
                id="home-retroactive-recorded-at"
                type="datetime-local"
                value={retroactiveRecordedAt}
                onChange={(event) => setRetroactiveRecordedAt(event.target.value)}
                disabled={coverPending}
              />
            </label>
          </div>

          <div className="form-action-row">
            <button type="button" className="secondary-button" onClick={() => void handleRetroactiveCoverSave()} disabled={coverPending}>
              {coverPending ? "Saving..." : "Save Retroactive Event"}
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

function convertDatetimeLocalToIso(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Cover date and time must be valid.");
  }
  return parsed.toISOString();
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
          <div className="weather-impact-day-note">{formatUvIndex(today?.uv_index_max)}</div>
        </div>
        {upcoming.map((entry) => (
          <div className="weather-impact-day" key={entry.date}>
            <div className="weather-impact-day-label">{formatShortDay(entry.date)}</div>
            <div className="weather-impact-day-range">{formatRange(entry.high_temp_f, entry.low_temp_f)}</div>
            <div className="weather-impact-day-symbol">{weatherCodeIcon(entry.weather_code)}</div>
            <div className="weather-impact-day-note">{formatDayImpact(entry)}</div>
            <div className="weather-impact-day-note">{formatUvIndex(entry.uv_index_max)}</div>
          </div>
        ))}
      </div>
      {/* <div className="weather-impact-meta">
        <strong>{forecast.provider}</strong>
        <span>{forecast.stale ? "Stale forecast" : "Forecast current"}</span>
      </div> */}
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

function formatSwimmabilityConfidence(value: SwimmabilityData["confidence"]): string {
  switch (value) {
    case "high":
      return "High";
    case "medium":
      return "Medium";
    case "low":
      return "Low";
    default:
      return "Unknown";
  }
}

function formatPredictionHorizon(value: PredictedSwimmabilityData["predictions"][number]["horizon"]): string {
  switch (value) {
    case "24h":
      return "Tomorrow";
    case "48h":
      return "48 Hours";
    case "72h":
      return "72 Hours";
    default:
      return "7 Days";
  }
}

function buildSwimmabilityProvenanceRows(swimmability: SwimmabilityData): Array<{ label: string; summary: string }> {
  const provenance = swimmability.input_provenance;
  if (!provenance) {
    return [];
  }

  return [
    summarizeProvenance("Chemistry", provenance.chemistry),
    summarizeProvenance("Weather", provenance.weather_forecast),
    summarizeProvenance("Water Temp", provenance.water_temperature),
    summarizeProvenance("Rain Context", provenance.rainfall_since_chemistry)
  ];
}

function summarizeProvenance(label: string, provenance: ValueProvenanceData): { label: string; summary: string } {
  return {
    label,
    summary: `${formatSourceType(provenance.source_type)} · ${formatFreshnessState(provenance.freshness_state)} · ${formatConfidenceBand(provenance.confidence_band)} confidence`
  };
}

function formatSourceType(value: ValueProvenanceData["source_type"]): string {
  switch (value) {
    case "manual_test":
      return "Manual test";
    case "manual_observation":
      return "Manual observation";
    case "manual_log":
      return "Manual log";
    case "sensor":
      return "Sensor";
    case "weather_provider":
      return "Weather provider";
    case "controller":
      return "Controller";
    case "direct_device":
      return "Direct device";
    case "derived_calculation":
      return "Derived";
    case "prediction_model":
      return "Prediction model";
    case "user_estimate":
      return "User estimate";
    case "default":
      return "Default";
    default:
      return "Unknown";
  }
}

function formatFreshnessState(value: ValueProvenanceData["freshness_state"]): string {
  switch (value) {
    case "fresh":
      return "Fresh";
    case "aging":
      return "Aging";
    case "stale":
      return "Stale";
    case "missing":
      return "Missing";
    case "unavailable":
      return "Unavailable";
    case "estimated":
      return "Estimated";
    default:
      return "Unknown";
  }
}

function formatConfidenceBand(value: ValueProvenanceData["confidence_band"]): string {
  switch (value) {
    case "high":
      return "High";
    case "medium":
      return "Medium";
    case "low":
      return "Low";
    case "unknown":
      return "Unknown";
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

function formatUvIndex(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) {
    return "UV unavailable";
  }

  return `UV ${value.toFixed(1)}`;
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
