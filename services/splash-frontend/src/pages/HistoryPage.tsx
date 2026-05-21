import { useEffect, useRef, useState } from "react";
import { Line } from "@nivo/line";
import { fetchPumpTelemetryHistory, fetchTemperatureTelemetryHistory, fetchWeatherHistory } from "../api";
import { Card } from "../components/mockUi";
import type {
  PumpTelemetryHistoryData,
  PumpTelemetryHistorySeries,
  TemperatureTelemetryHistoryData,
  TemperatureTelemetryHistorySeries,
  WeatherHistoryData,
  WeatherHistoryMetric,
  WeatherHistorySeries
} from "../types";

const CHART_HEIGHT = 260;
const DEFAULT_CHART_WIDTH = 960;
const MIN_CHART_WIDTH = 320;
const HISTORY_LOOKBACK_MS = 36 * 60 * 60 * 1000;
const TEMPERATURE_HISTORY_INTERVAL = "10m";
const PUMP_HISTORY_INTERVAL = "10m";
const DEFAULT_PUMP_ID = "pump-main";
const HISTORY_X_AXIS_LABEL_STEP = 10;
const HISTORY_MAX_X_AXIS_LABELS = 8;
const TEMPERATURE_SENSORS: Array<TemperatureTelemetryHistorySeries["sensor_type"]> = [
  "air",
  "pool_water",
  "spa_water",
  "solar"
];
const WEATHER_METRICS: WeatherHistoryMetric[] = [
  "temperature_f",
  "cloud_cover",
  "uv_index",
  "precipitation_probability",
  "precipitation_amount"
];
const HISTORY_TABS = [
  { id: "temperature", label: "Temperature" },
  { id: "pump", label: "Pump" },
  { id: "weather", label: "Weather" }
] as const;

type HistoryTabId = (typeof HISTORY_TABS)[number]["id"];

export function HistoryPage() {
  const [activeTab, setActiveTab] = useState<HistoryTabId>("temperature");
  const [loadedTabs, setLoadedTabs] = useState<HistoryTabId[]>([]);
  const [loadingTab, setLoadingTab] = useState<HistoryTabId | null>(null);
  const [temperatureHistory, setTemperatureHistory] = useState<TemperatureTelemetryHistoryData | null>(null);
  const [temperatureError, setTemperatureError] = useState<string | null>(null);
  const [pumpHistory, setPumpHistory] = useState<PumpTelemetryHistoryData | null>(null);
  const [pumpError, setPumpError] = useState<string | null>(null);
  const [weatherHistory, setWeatherHistory] = useState<Record<WeatherHistoryMetric, WeatherHistoryData>>({} as Record<WeatherHistoryMetric, WeatherHistoryData>);
  const [weatherError, setWeatherError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (loadedTabs.includes(activeTab)) {
        return;
      }

      const end = new Date().toISOString();
      const start = new Date(Date.now() - HISTORY_LOOKBACK_MS).toISOString();
      setLoadingTab(activeTab);

      if (activeTab === "temperature") {
        const result = await fetchTemperatureTelemetryHistory({ start, end, interval: TEMPERATURE_HISTORY_INTERVAL })
          .then((value) => ({ status: "fulfilled" as const, value }))
          .catch((reason) => ({ status: "rejected" as const, reason }));

        if (cancelled) {
          return;
        }

        if (result.status === "fulfilled") {
          setTemperatureHistory(result.value.data);
          setTemperatureError(null);
        } else {
          setTemperatureError(result.reason instanceof Error ? result.reason.message : String(result.reason));
        }
      }

      if (activeTab === "pump") {
        const result = await fetchPumpTelemetryHistory({ pumpId: DEFAULT_PUMP_ID, start, end, interval: PUMP_HISTORY_INTERVAL })
          .then((value) => ({ status: "fulfilled" as const, value }))
          .catch((reason) => ({ status: "rejected" as const, reason }));

        if (cancelled) {
          return;
        }

        if (result.status === "fulfilled") {
          setPumpHistory(result.value.data);
          setPumpError(null);
        } else {
          setPumpError(result.reason instanceof Error ? result.reason.message : String(result.reason));
        }
      }

      if (activeTab === "weather") {
        const weatherResults = await Promise.allSettled(WEATHER_METRICS.map((metric) => fetchWeatherHistory({ metric, start, end })));

        if (cancelled) {
          return;
        }

        const nextWeatherHistory = {} as Record<WeatherHistoryMetric, WeatherHistoryData>;
        let nextWeatherError: string | null = null;
        weatherResults.forEach((result, index) => {
          const metric = WEATHER_METRICS[index] as WeatherHistoryMetric;
          if (result.status === "fulfilled") {
            nextWeatherHistory[metric] = result.value.data;
          } else if (!nextWeatherError) {
            nextWeatherError = result.reason instanceof Error ? result.reason.message : String(result.reason);
          }
        });
        setWeatherHistory(nextWeatherHistory);
        setWeatherError(nextWeatherError);
      }

      if (cancelled) {
        return;
      }

      setLoadedTabs((current) => (current.includes(activeTab) ? current : [...current, activeTab]));
      setLoadingTab((current) => (current === activeTab ? null : current));
    })();

    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  const currentError = activeTab === "temperature" ? temperatureError : activeTab === "pump" ? pumpError : weatherError;

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
            <div className="automation-record-row"><strong>Temperature series</strong><span>{loadedTabs.includes("temperature") ? countAvailableTemperatureSeries(temperatureHistory?.series ?? []) : "On demand"}</span></div>
            <div className="automation-record-row"><strong>Pump charts</strong><span>{loadedTabs.includes("pump") ? countAvailablePumpCharts(pumpHistory) : "On demand"}</span></div>
            <div className="automation-record-row"><strong>Weather charts</strong><span>{loadedTabs.includes("weather") ? countAvailableWeatherCharts(weatherHistory) : "On demand"}</span></div>
            <div className="automation-record-row"><strong>Weather freshness</strong><span>{loadedTabs.includes("weather") ? summarizeWeatherFreshness(weatherHistory) : "On demand"}</span></div>
          </div>
        </Card>
      </div>

      <div className="automation-tabs" role="tablist" aria-label="History tabs">
        {HISTORY_TABS.map((tab) => (
          <button
            key={tab.id}
            id={`history-tab-${tab.id}`}
            className={`automation-tab ${activeTab === tab.id ? "automation-tab-active" : ""}`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`history-panel-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {currentError ? (
        <Card title="History Error">
          <p className="chart-empty-state">{currentError}</p>
        </Card>
      ) : null}

      <div id={`history-panel-${activeTab}`} className="automation-tab-panel" role="tabpanel" aria-labelledby={`history-tab-${activeTab}`}>
        {loadingTab === activeTab && !loadedTabs.includes(activeTab) ? (
          <Card title="Loading History">
            <p className="chart-empty-state">Loading {formatHistoryTabLabel(activeTab)} history…</p>
          </Card>
        ) : null}

        {activeTab === "temperature" ? (
          <div className="automation-grid automation-grid-two-column">
            {TEMPERATURE_SENSORS.map((sensorType) => {
              const series = findTemperatureSeries(temperatureHistory?.series ?? [], sensorType);
              const chartSeries = series ? buildTemperatureChartSeries([series]) : [];
              return (
                <Card key={sensorType} title={formatTemperatureSeriesLabel(sensorType)} className="automation-card-table">
                  {chartSeries.length ? (
                    <HistoryTrendChart
                      ariaLabel={`${formatTemperatureSeriesLabel(sensorType)} history chart`}
                      yLegend="Temperature °F"
                      series={chartSeries}
                      xTickValues={buildEveryNthTickValues(chartSeries, HISTORY_X_AXIS_LABEL_STEP)}
                    />
                  ) : (
                    <p className="chart-empty-state">{formatTemperatureSeriesLabel(sensorType)} history is not available yet.</p>
                  )}
                </Card>
              );
            })}
          </div>
        ) : null}

        {activeTab === "pump" ? (
          <div className="automation-grid automation-grid-two-column">
            {(() => {
              const rpmSeries = buildPumpMetricChartSeries(pumpHistory?.series ?? [], DEFAULT_PUMP_ID, "rpm");
              const wattSeries = buildPumpMetricChartSeries(pumpHistory?.series ?? [], DEFAULT_PUMP_ID, "watts");
              return (
                <>
                  <Card title="Pump RPM" className="automation-card-table">
                    {rpmSeries.length ? (
                      <HistoryTrendChart
                        ariaLabel="Pump RPM history chart"
                        yLegend="RPM"
                        series={rpmSeries}
                        xTickValues={buildEveryNthTickValues(rpmSeries, HISTORY_X_AXIS_LABEL_STEP)}
                      />
                    ) : (
                      <p className="chart-empty-state">Pump RPM history is not available yet.</p>
                    )}
                  </Card>
                  <Card title="Pump Watts" className="automation-card-table">
                    {wattSeries.length ? (
                      <HistoryTrendChart
                        ariaLabel="Pump watt history chart"
                        yLegend="Watts"
                        series={wattSeries}
                        xTickValues={buildEveryNthTickValues(wattSeries, HISTORY_X_AXIS_LABEL_STEP)}
                      />
                    ) : (
                      <p className="chart-empty-state">Pump watt history is not available yet.</p>
                    )}
                  </Card>
                </>
              );
            })()}
          </div>
        ) : null}

        {activeTab === "weather" ? (
          <div className="automation-grid automation-grid-two-column">
            {WEATHER_METRICS.map((metric) => {
              const data = weatherHistory[metric];
              const chartSeries = data?.series ? buildWeatherChartSeries(data.series) : [];
              return (
                <Card key={metric} title={formatWeatherMetricTitle(metric)} className="automation-card-table">
                  {chartSeries.length ? (
                    <HistoryTrendChart
                      ariaLabel={`${formatWeatherMetricTitle(metric)} history chart`}
                      yLegend={formatWeatherMetricAxis(metric)}
                      series={chartSeries}
                      xTickValues={buildEveryNthTickValues(chartSeries, HISTORY_X_AXIS_LABEL_STEP)}
                    />
                  ) : (
                    <p className="chart-empty-state">{data?.message ?? "No weather history has been captured yet."}</p>
                  )}
                </Card>
              );
            })}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function HistoryTrendChart({
  ariaLabel,
  yLegend,
  series,
  xTickValues
}: {
  ariaLabel: string;
  yLegend: string;
  series: Array<{ id: string; color: string; data: Array<{ x: string; y: number }> }>;
  xTickValues?: string[];
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
            tickValues: xTickValues,
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

function findTemperatureSeries(
  series: TemperatureTelemetryHistorySeries[],
  sensorType: TemperatureTelemetryHistorySeries["sensor_type"]
): TemperatureTelemetryHistorySeries | null {
  return series.find((entry) => entry.sensor_type === sensorType) ?? null;
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

function buildPumpMetricChartSeries(
  series: PumpTelemetryHistorySeries[],
  pumpId: string,
  metric: "rpm" | "watts"
) {
  return series
    .filter((entry) => entry.pump_id === pumpId)
    .map((entry) => ({
      id: metric === "rpm" ? "Pump RPM" : "Pump Watts",
      color: metric === "rpm" ? "var(--color-water-500, #1f9fb2)" : "var(--color-pump-500, #0b7a43)",
      data: entry.points.map((point) => ({
        x: formatSampleTime(point.timestamp),
        y: metric === "rpm" ? point.rpm : point.watts
      }))
    }))
    .filter((entry) => entry.data.length > 0);
}

function buildEveryNthTickValues(
  series: Array<{ id: string; color: string; data: Array<{ x: string; y: number }> }>,
  step: number
): string[] | undefined {
  const values = series[0]?.data.map((point) => point.x) ?? [];
  if (values.length <= step) {
    return undefined;
  }

  const effectiveStep = Math.max(step, Math.ceil(values.length / HISTORY_MAX_X_AXIS_LABELS));
  return values.filter((_, index) => index % effectiveStep === 0);
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

function formatHistoryTabLabel(tab: HistoryTabId): string {
  return HISTORY_TABS.find((entry) => entry.id === tab)?.label ?? tab;
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

function countAvailablePumpCharts(history: PumpTelemetryHistoryData | null): string {
  return hasPumpHistoryPoints(history, DEFAULT_PUMP_ID) ? "2 / 2" : "0 / 2";
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

function hasPumpHistoryPoints(history: PumpTelemetryHistoryData | null, pumpId: string): boolean {
  return (history?.series ?? []).some((entry) => entry.pump_id === pumpId && entry.points.length > 0);
}
