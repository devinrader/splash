import { useEffect, useRef, useState } from "react";
import { Line } from "@nivo/line";
import { fetchTemperatureTelemetryHistory, fetchWeatherHistory } from "../api";
import { Card } from "../components/mockUi";
import type {
  TemperatureTelemetryHistoryData,
  TemperatureTelemetryHistorySeries,
  WeatherHistoryData,
  WeatherHistoryMetric,
  WeatherHistorySeries
} from "../types";

const CHART_HEIGHT = 260;
const DEFAULT_CHART_WIDTH = 960;
const MIN_CHART_WIDTH = 320;
const WEATHER_METRICS: WeatherHistoryMetric[] = [
  "temperature_f",
  "cloud_cover",
  "uv_index",
  "precipitation_probability",
  "precipitation_amount"
];

export function HistoryPage() {
  const [temperatureHistory, setTemperatureHistory] = useState<TemperatureTelemetryHistoryData | null>(null);
  const [weatherHistory, setWeatherHistory] = useState<Record<WeatherHistoryMetric, WeatherHistoryData>>({} as Record<WeatherHistoryMetric, WeatherHistoryData>);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const end = new Date().toISOString();
      const start = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
      const [temperatureResult, ...weatherResults] = await Promise.allSettled([
        fetchTemperatureTelemetryHistory({ start, end, interval: "6h" }),
        ...WEATHER_METRICS.map((metric) => fetchWeatherHistory({ metric, start, end, interval: "6h" }))
      ]);

      if (cancelled) {
        return;
      }

      if (temperatureResult.status === "fulfilled") {
        setTemperatureHistory(temperatureResult.value.data);
      } else {
        setError(temperatureResult.reason instanceof Error ? temperatureResult.reason.message : String(temperatureResult.reason));
      }

      const nextWeatherHistory = {} as Record<WeatherHistoryMetric, WeatherHistoryData>;
      weatherResults.forEach((result, index) => {
        const metric = WEATHER_METRICS[index] as WeatherHistoryMetric;
        if (result.status === "fulfilled") {
          nextWeatherHistory[metric] = result.value.data;
        }
      });
      setWeatherHistory(nextWeatherHistory);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="automation-shell">
      <div className="automation-grid automation-grid-overview">
        <Card title="History Trends" status="Temperature and weather history" className="automation-card-hero">
          <p className="panel-copy">
            The History dashboard shows persistence-backed EasyTouch temperature trends and normalized weather history sourced from Splash API.
          </p>
        </Card>
        <Card title="Coverage">
          <div className="automation-record-list">
            <div className="automation-record-row"><strong>Temperature series</strong><span>{countAvailableTemperatureSeries(temperatureHistory?.series ?? [])}</span></div>
            <div className="automation-record-row"><strong>Weather charts</strong><span>{countAvailableWeatherCharts(weatherHistory)}</span></div>
            <div className="automation-record-row"><strong>Weather freshness</strong><span>{summarizeWeatherFreshness(weatherHistory)}</span></div>
          </div>
        </Card>
      </div>

      {error ? (
        <Card title="History Error">
          <p className="chart-empty-state">{error}</p>
        </Card>
      ) : null}

      <Card title="Temperature History" className="automation-card-table">
        {(temperatureHistory?.series ?? []).length > 0 ? (
          <HistoryTrendChart
            ariaLabel="Temperature history chart"
            yLegend="Temperature °F"
            series={buildTemperatureChartSeries(temperatureHistory?.series ?? [])}
          />
        ) : (
          <p className="chart-empty-state">No EasyTouch temperature history has been captured yet.</p>
        )}
      </Card>

      <div className="automation-grid automation-grid-two-column">
        {WEATHER_METRICS.map((metric) => {
          const data = weatherHistory[metric];
          return (
            <Card key={metric} title={formatWeatherMetricTitle(metric)} className="automation-card-table">
              {data?.series?.length ? (
                <>
                  <div className="automation-record-row">
                    <strong>{data.provider}</strong>
                    <span>{data.stale ? "Stale forecast snapshot" : "Current cached snapshot"}</span>
                  </div>
                  <HistoryTrendChart
                    ariaLabel={`${formatWeatherMetricTitle(metric)} history chart`}
                    yLegend={formatWeatherMetricAxis(metric)}
                    series={buildWeatherChartSeries(data.series)}
                  />
                </>
              ) : (
                <p className="chart-empty-state">{data?.message ?? "No weather history has been captured yet."}</p>
              )}
            </Card>
          );
        })}
      </div>
    </section>
  );
}

function HistoryTrendChart({
  ariaLabel,
  yLegend,
  series
}: {
  ariaLabel: string;
  yLegend: string;
  series: Array<{ id: string; color: string; data: Array<{ x: string; y: number }> }>;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [chartWidth, setChartWidth] = useState(DEFAULT_CHART_WIDTH);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) {
      return;
    }

    const updateWidth = () => {
      setChartWidth(Math.max(node.clientWidth || DEFAULT_CHART_WIDTH, MIN_CHART_WIDTH));
    };

    updateWidth();

    if (typeof ResizeObserver !== "function") {
      return;
    }

    const observer = new ResizeObserver(updateWidth);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  if (series.length === 0) {
    return <p className="chart-empty-state">No chart data is available yet.</p>;
  }

  return (
    <div ref={containerRef} className="metric-trend-chart-shell">
      <div className="metric-trend-chart-frame" role="img" aria-label={ariaLabel}>
        <Line
          width={chartWidth}
          height={CHART_HEIGHT}
          data={series}
          margin={{ top: 20, right: 24, bottom: 56, left: 56 }}
          xScale={{ type: "point" }}
          yScale={{ type: "linear", min: "auto", max: "auto" }}
          colors={series.map((entry) => entry.color)}
          axisTop={null}
          axisRight={null}
          axisBottom={{
            tickRotation: -30,
            legend: "Time",
            legendOffset: 44,
            legendPosition: "middle"
          }}
          axisLeft={{
            legend: yLegend,
            legendOffset: -44,
            legendPosition: "middle"
          }}
          pointSize={8}
          pointBorderWidth={2}
          pointBorderColor={{ from: "serieColor" }}
          enableGridX={false}
          useMesh
          enableSlices="x"
        />
      </div>
    </div>
  );
}

function buildTemperatureChartSeries(series: TemperatureTelemetryHistorySeries[]) {
  const palette: Record<string, string> = {
    air: "var(--color-sky-500, #2f6fed)",
    pool_water: "var(--color-water-500, #1f9fb2)",
    spa_water: "var(--color-pump-500, #0b7a43)",
    solar: "var(--color-sand-600, #b76a2a)"
  };
  return series
    .map((entry) => ({
      id: formatTemperatureSeriesLabel(entry.sensor_type),
      color: palette[entry.sensor_type] ?? "var(--color-slate-500, #64748b)",
      data: entry.points.map((point) => ({
        x: formatSampleTime(point.timestamp),
        y: point.normalizedF
      }))
    }))
    .filter((entry) => entry.data.length > 0);
}

function buildWeatherChartSeries(series: WeatherHistorySeries[]) {
  return series
    .map((entry) => ({
      id: formatWeatherMetricTitle(entry.metric),
      color: "var(--color-sky-500, #2f6fed)",
      data: entry.points.map((point) => ({
        x: formatSampleTime(point.timestamp),
        y: point.value
      }))
    }))
    .filter((entry) => entry.data.length > 0);
}

function formatTemperatureSeriesLabel(value: string): string {
  switch (value) {
    case "pool_water":
      return "Pool Water";
    case "spa_water":
      return "Spa Water";
    default:
      return value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
  }
}

function formatWeatherMetricTitle(metric: WeatherHistoryMetric): string {
  switch (metric) {
    case "temperature_f":
      return "Weather Temperature";
    case "cloud_cover":
      return "Cloud Cover";
    case "uv_index":
      return "UV Index";
    case "precipitation_probability":
      return "Rain Chance";
    case "precipitation_amount":
      return "Rain Amount";
  }
}

function formatWeatherMetricAxis(metric: WeatherHistoryMetric): string {
  switch (metric) {
    case "temperature_f":
      return "Temperature °F";
    case "cloud_cover":
      return "Cloud Cover %";
    case "uv_index":
      return "UV Index";
    case "precipitation_probability":
      return "Rain Chance %";
    case "precipitation_amount":
      return "Rainfall mm";
  }
}

function formatSampleTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString([], {
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function countAvailableTemperatureSeries(series: TemperatureTelemetryHistorySeries[]): string {
  return `${series.filter((entry) => entry.points.length > 0).length} / 4`;
}

function countAvailableWeatherCharts(history: Partial<Record<WeatherHistoryMetric, WeatherHistoryData>>): string {
  const available = WEATHER_METRICS.filter((metric) => (history[metric]?.series ?? []).some((entry) => entry.points.length > 0)).length;
  return `${available} / ${WEATHER_METRICS.length}`;
}

function summarizeWeatherFreshness(history: Partial<Record<WeatherHistoryMetric, WeatherHistoryData>>): string {
  const stale = WEATHER_METRICS.some((metric) => history[metric]?.stale);
  const available = WEATHER_METRICS.some((metric) => history[metric]?.status === "available");
  if (!available) {
    return "Unavailable";
  }
  return stale ? "Stale" : "Current";
}
