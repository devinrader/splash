import { useEffect, useRef, useState } from "react";
import { Line } from "@nivo/line";
import { fetchChemistryHistory, fetchPoolCoverHistory, fetchPumpCirculationSummary, fetchPumpTelemetryHistory, fetchTemperatureTelemetryHistory, fetchWeatherHistory } from "../api";
import { Card } from "../components/mockUi";
import type {
  ChemistryHistoryData,
  ChemistryHistoryMetric,
  PoolCoverEventRecord,
  PumpCirculationSummaryData,
  PumpCirculationSummaryItem,
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
const CHEMISTRY_METRICS: Array<{ metric: ChemistryHistoryMetric; title: string; axis: string; color: string }> = [
  { metric: "ph", title: "pH", axis: "pH", color: "var(--color-sky-500, #2f6fed)" },
  { metric: "free_chlorine", title: "Free Chlorine", axis: "Free Chlorine ppm", color: "var(--color-water-500, #1f9fb2)" },
  { metric: "total_chlorine", title: "Total Chlorine", axis: "Total Chlorine ppm", color: "var(--color-sand-600, #b76a2a)" }
];
const HISTORY_TABS = [
  { id: "temperature", label: "Temperature" },
  { id: "pump", label: "Pump" },
  { id: "weather", label: "Weather" },
  { id: "chemistry", label: "Chemistry" }
] as const;
const HISTORY_RANGE_OPTIONS = [
  { id: "1h", label: "Last hour", lookbackMs: 1 * 60 * 60 * 1000, interval: "5m" },
  { id: "6h", label: "Last 6 hours", lookbackMs: 6 * 60 * 60 * 1000, interval: "15m" },
  { id: "12h", label: "Last 12 hours", lookbackMs: 12 * 60 * 60 * 1000, interval: "15m" },
  { id: "24h", label: "Last 24 hours", lookbackMs: 24 * 60 * 60 * 1000, interval: "15m" },
  { id: "36h", label: "Last 36 hours", lookbackMs: 36 * 60 * 60 * 1000, interval: "15m" },
  { id: "3d", label: "Last 3 days", lookbackMs: 3 * 24 * 60 * 60 * 1000, interval: "1h" },
  { id: "7d", label: "Last 7 days", lookbackMs: 7 * 24 * 60 * 60 * 1000, interval: "4h" }
] as const;

type HistoryTabId = (typeof HISTORY_TABS)[number]["id"];
type HistoryRangeId = (typeof HISTORY_RANGE_OPTIONS)[number]["id"];
const DEFAULT_HISTORY_RANGE_ID: HistoryRangeId = "36h";

function resolveHistoryRange(rangeId: HistoryRangeId) {
  return (
    HISTORY_RANGE_OPTIONS.find((option) => option.id === rangeId) ??
    HISTORY_RANGE_OPTIONS.find((option) => option.id === DEFAULT_HISTORY_RANGE_ID) ??
    HISTORY_RANGE_OPTIONS[0]
  );
}

export function HistoryPage() {
  const [activeTab, setActiveTab] = useState<HistoryTabId>("temperature");
  const [selectedRangeId, setSelectedRangeId] = useState<HistoryRangeId>(DEFAULT_HISTORY_RANGE_ID);
  const [loadedKeys, setLoadedKeys] = useState<string[]>([]);
  const [loadingTab, setLoadingTab] = useState<HistoryTabId | null>(null);
  const [temperatureHistoryByRange, setTemperatureHistoryByRange] = useState<Partial<Record<HistoryRangeId, TemperatureTelemetryHistoryData>>>({});
  const [temperatureErrorByRange, setTemperatureErrorByRange] = useState<Partial<Record<HistoryRangeId, string | null>>>({});
  const [pumpHistoryByRange, setPumpHistoryByRange] = useState<Partial<Record<HistoryRangeId, PumpTelemetryHistoryData>>>({});
  const [pumpCirculationSummary, setPumpCirculationSummary] = useState<PumpCirculationSummaryData | null>(null);
  const [pumpErrorByRange, setPumpErrorByRange] = useState<Partial<Record<HistoryRangeId, string | null>>>({});
  const [pumpSummaryError, setPumpSummaryError] = useState<string | null>(null);
  const [weatherHistoryByRange, setWeatherHistoryByRange] = useState<Partial<Record<HistoryRangeId, Record<WeatherHistoryMetric, WeatherHistoryData>>>>({});
  const [weatherErrorByRange, setWeatherErrorByRange] = useState<Partial<Record<HistoryRangeId, string | null>>>({});
  const [chemistryHistoryByRange, setChemistryHistoryByRange] = useState<Partial<Record<HistoryRangeId, ChemistryHistoryData>>>({});
  const [chemistryErrorByRange, setChemistryErrorByRange] = useState<Partial<Record<HistoryRangeId, string | null>>>({});
  const [coverHistoryByRange, setCoverHistoryByRange] = useState<Partial<Record<HistoryRangeId, PoolCoverEventRecord[]>>>({});
  const [coverErrorByRange, setCoverErrorByRange] = useState<Partial<Record<HistoryRangeId, string | null>>>({});

  useEffect(() => {
    let cancelled = false;
    const selectedRange = resolveHistoryRange(selectedRangeId);
    const loadKey = `${activeTab}:${selectedRangeId}`;

    void (async () => {
      if (loadedKeys.includes(loadKey)) {
        return;
      }

      const end = new Date().toISOString();
      const start = new Date(Date.now() - selectedRange.lookbackMs).toISOString();
      setLoadingTab(activeTab);

      if (activeTab === "temperature") {
        const result = await fetchTemperatureTelemetryHistory({ start, end, interval: selectedRange.interval })
          .then((value) => ({ status: "fulfilled" as const, value }))
          .catch((reason) => ({ status: "rejected" as const, reason }));

        if (cancelled) {
          return;
        }

        if (result.status === "fulfilled") {
          setTemperatureHistoryByRange((current) => ({ ...current, [selectedRangeId]: result.value.data }));
          setTemperatureErrorByRange((current) => ({ ...current, [selectedRangeId]: null }));
        } else {
          setTemperatureErrorByRange((current) => ({
            ...current,
            [selectedRangeId]: result.reason instanceof Error ? result.reason.message : String(result.reason)
          }));
        }
      }

      if (activeTab === "pump") {
        const [historyResult, summaryResult] = await Promise.all([
          fetchPumpTelemetryHistory({ pumpId: DEFAULT_PUMP_ID, start, end, interval: selectedRange.interval })
            .then((value) => ({ status: "fulfilled" as const, value }))
            .catch((reason) => ({ status: "rejected" as const, reason })),
          fetchPumpCirculationSummary({ pumpId: DEFAULT_PUMP_ID })
            .then((value) => ({ status: "fulfilled" as const, value }))
            .catch((reason) => ({ status: "rejected" as const, reason }))
        ]);

        if (cancelled) {
          return;
        }

        if (historyResult.status === "fulfilled") {
          setPumpHistoryByRange((current) => ({ ...current, [selectedRangeId]: historyResult.value.data }));
          setPumpErrorByRange((current) => ({ ...current, [selectedRangeId]: null }));
        } else {
          setPumpErrorByRange((current) => ({
            ...current,
            [selectedRangeId]: historyResult.reason instanceof Error ? historyResult.reason.message : String(historyResult.reason)
          }));
        }

        if (summaryResult.status === "fulfilled") {
          setPumpCirculationSummary(summaryResult.value.data);
          setPumpSummaryError(null);
        } else {
          setPumpSummaryError(summaryResult.reason instanceof Error ? summaryResult.reason.message : String(summaryResult.reason));
        }
      }

      if (activeTab === "weather") {
        const weatherResults = await Promise.allSettled(
          WEATHER_METRICS.map((metric) => fetchWeatherHistory({ metric, start, end, interval: selectedRange.interval }))
        );

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
        setWeatherHistoryByRange((current) => ({ ...current, [selectedRangeId]: nextWeatherHistory }));
        setWeatherErrorByRange((current) => ({ ...current, [selectedRangeId]: nextWeatherError }));
      }

      if (activeTab === "chemistry") {
        const chemistryInterval = selectedRange.interval === "5m" ? "raw" : "1d";
        const [chemistryResult, coverResult] = await Promise.allSettled([
          fetchChemistryHistory({ start, end, interval: chemistryInterval }),
          fetchPoolCoverHistory({ start, end, limit: 100 })
        ]);

        if (cancelled) {
          return;
        }

        if (chemistryResult.status === "fulfilled") {
          setChemistryHistoryByRange((current) => ({ ...current, [selectedRangeId]: chemistryResult.value.data }));
          setChemistryErrorByRange((current) => ({ ...current, [selectedRangeId]: null }));
        } else {
          setChemistryErrorByRange((current) => ({
            ...current,
            [selectedRangeId]: chemistryResult.reason instanceof Error ? chemistryResult.reason.message : String(chemistryResult.reason)
          }));
        }

        if (coverResult.status === "fulfilled") {
          setCoverHistoryByRange((current) => ({ ...current, [selectedRangeId]: coverResult.value.data.events }));
          setCoverErrorByRange((current) => ({ ...current, [selectedRangeId]: null }));
        } else {
          setCoverErrorByRange((current) => ({
            ...current,
            [selectedRangeId]: coverResult.reason instanceof Error ? coverResult.reason.message : String(coverResult.reason)
          }));
        }
      }

      if (cancelled) {
        return;
      }

      setLoadedKeys((current) => (current.includes(loadKey) ? current : [...current, loadKey]));
      setLoadingTab((current) => (current === activeTab ? null : current));
    })();

    return () => {
      cancelled = true;
    };
  }, [activeTab, loadedKeys, selectedRangeId]);

  const temperatureHistory = temperatureHistoryByRange[selectedRangeId] ?? null;
  const pumpHistory = pumpHistoryByRange[selectedRangeId] ?? null;
  const weatherHistory = weatherHistoryByRange[selectedRangeId] ?? ({} as Record<WeatherHistoryMetric, WeatherHistoryData>);
  const chemistryHistory = chemistryHistoryByRange[selectedRangeId] ?? null;
  const coverHistory = coverHistoryByRange[selectedRangeId] ?? [];
  const temperatureError = temperatureErrorByRange[selectedRangeId] ?? null;
  const pumpError = pumpErrorByRange[selectedRangeId] ?? null;
  const weatherError = weatherErrorByRange[selectedRangeId] ?? null;
  const chemistryError = chemistryErrorByRange[selectedRangeId] ?? null;
  const coverError = coverErrorByRange[selectedRangeId] ?? null;
  const currentError =
    activeTab === "temperature"
      ? temperatureError
      : activeTab === "pump"
        ? (pumpError ?? pumpSummaryError)
        : activeTab === "weather"
          ? weatherError
          : (chemistryError ?? coverError);
  const selectedRange = resolveHistoryRange(selectedRangeId);
  const currentLoadKey = `${activeTab}:${selectedRangeId}`;

  return (
    <section className="automation-shell">
      <div className="automation-grid automation-grid-overview">
        <Card title="History Trends" status="Temperature and weather history" className="automation-card-hero">
          <p className="panel-copy">
            The History dashboard shows persistence-backed EasyTouch temperature trends and normalized weather history sourced from Splash API.
          </p>
          <div className="control-form">
            <label htmlFor="history-range">Time range</label>
            <select
              id="history-range"
              value={selectedRangeId}
              onChange={(event) => setSelectedRangeId(event.target.value as HistoryRangeId)}
            >
              {HISTORY_RANGE_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
            <p className="form-caption">Selected range: {selectedRange.label} · {selectedRange.interval} aggregation</p>
          </div>
        </Card>
        <Card title="Coverage">
          <div className="automation-record-list">
            <div className="automation-record-row"><strong>Temperature series</strong><span>{loadedKeys.includes(`temperature:${selectedRangeId}`) ? countAvailableTemperatureSeries(temperatureHistory?.series ?? []) : "On demand"}</span></div>
            <div className="automation-record-row"><strong>Pump charts</strong><span>{loadedKeys.includes(`pump:${selectedRangeId}`) ? countAvailablePumpCharts(pumpHistory) : "On demand"}</span></div>
            <div className="automation-record-row"><strong>Weather charts</strong><span>{loadedKeys.includes(`weather:${selectedRangeId}`) ? countAvailableWeatherCharts(weatherHistory) : "On demand"}</span></div>
            <div className="automation-record-row"><strong>Chemistry charts</strong><span>{loadedKeys.includes(`chemistry:${selectedRangeId}`) ? countAvailableChemistryCharts(chemistryHistory) : "On demand"}</span></div>
            <div className="automation-record-row"><strong>Weather freshness</strong><span>{loadedKeys.includes(`weather:${selectedRangeId}`) ? summarizeWeatherFreshness(weatherHistory) : "On demand"}</span></div>
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
        {loadingTab === activeTab && !loadedKeys.includes(currentLoadKey) ? (
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
                  <Card title="Circulation Summary">
                    {pumpCirculationSummary?.summaries.length ? (
                      <div className="automation-record-list">
                        {pumpCirculationSummary.summaries.map((summary) => (
                          <div className="automation-record-row" key={summary.window}>
                            <strong>{formatCirculationWindow(summary.window)}</strong>
                            <span>{formatCirculationSummary(summary)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="chart-empty-state">Circulation summary is not available yet.</p>
                    )}
                  </Card>
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

        {activeTab === "chemistry" ? (
          <div className="automation-grid automation-grid-two-column">
            <Card title="Cover Overlay Legend" className="automation-card-table">
              <div className="history-cover-legend" aria-label="Cover overlay legend">
                <span className="history-cover-legend-item">
                  <span className="history-cover-marker-dot history-cover-marker-dot-on" aria-hidden="true" />
                  Cover On marker
                </span>
                <span className="history-cover-legend-item">
                  <span className="history-cover-marker-dot history-cover-marker-dot-off" aria-hidden="true" />
                  Cover Off marker
                </span>
              </div>
            </Card>
            {CHEMISTRY_METRICS.map((entry) => {
              const chartSeries = buildChemistryChartSeries(chemistryHistory, entry.metric, entry.title, entry.color);
              return (
                <Card key={entry.metric} title={entry.title} className="automation-card-table">
                  {chartSeries.length ? (
                    <HistoryTrendChart
                      ariaLabel={`${entry.title} history chart`}
                      yLegend={entry.axis}
                      series={chartSeries}
                      xTickValues={buildEveryNthTickValues(chartSeries, HISTORY_X_AXIS_LABEL_STEP)}
                      overlayEvents={coverHistory}
                    />
                  ) : (
                    <p className="chart-empty-state">No chemistry history has been captured yet.</p>
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
  xTickValues,
  overlayEvents
}: {
  ariaLabel: string;
  yLegend: string;
  series: HistoryChartSeries[];
  xTickValues?: string[];
  overlayEvents?: PoolCoverEventRecord[];
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

  const overlayMarkers = buildCoverOverlayMarkers(series, overlayEvents ?? []);

  return (
    <div ref={containerRef} className="metric-trend-chart-shell">
      <div className="metric-trend-chart-frame" role="img" aria-label={ariaLabel}>
        {overlayMarkers.length ? (
          <div className="history-cover-overlay" aria-hidden="true">
            {overlayMarkers.map((marker) => (
              <div
                key={marker.id}
                className={`history-cover-overlay-marker history-cover-overlay-marker-${marker.state}`}
                style={{ left: `${marker.positionPercent}%` }}
                title={marker.title}
              >
                <span className={`history-cover-overlay-line history-cover-overlay-line-${marker.state}`} />
                <span className={`history-cover-overlay-label history-cover-overlay-label-${marker.state}`}>{marker.label}</span>
              </div>
            ))}
          </div>
        ) : null}
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

function buildChemistryChartSeries(
  history: ChemistryHistoryData | null,
  metric: ChemistryHistoryMetric,
  title: string,
  color: string
): HistoryChartSeries[] {
  const series = history?.series.find((entry) => entry.metric === metric);
  const data = (series?.points ?? []).map((point) => ({
    x: formatSampleTime(point.recorded_at),
    y: point.value,
    timestamp: point.recorded_at
  }));
  return data.length ? [{ id: title, color, data }] : [];
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
  series: HistoryChartSeries[],
  step: number
): string[] | undefined {
  const values = series[0]?.data.map((point) => point.x) ?? [];
  if (values.length <= step) {
    return undefined;
  }

  const effectiveStep = Math.max(step, Math.ceil(values.length / HISTORY_MAX_X_AXIS_LABELS));
  return values.filter((_, index) => index % effectiveStep === 0);
}

interface HistoryChartPoint {
  x: string;
  y: number;
  timestamp?: string;
}

interface HistoryChartSeries {
  id: string;
  color: string;
  data: HistoryChartPoint[];
}

interface CoverOverlayMarker {
  id: string;
  state: "on" | "off";
  label: string;
  title: string;
  positionPercent: number;
}

function buildCoverOverlayMarkers(series: HistoryChartSeries[], events: PoolCoverEventRecord[]): CoverOverlayMarker[] {
  const timestamps = series.flatMap((entry) =>
    entry.data
      .map((point) => point.timestamp)
      .filter((value): value is string => typeof value === "string")
      .map((value) => Date.parse(value))
      .filter((value) => Number.isFinite(value))
  );

  if (timestamps.length === 0) {
    return [];
  }

  const minTimestamp = Math.min(...timestamps);
  const maxTimestamp = Math.max(...timestamps);

  return events
    .map((event) => {
      const parsed = Date.parse(event.recorded_at);
      if (!Number.isFinite(parsed) || parsed < minTimestamp || parsed > maxTimestamp) {
        return null;
      }

      const positionPercent =
        minTimestamp === maxTimestamp
          ? 50
          : ((parsed - minTimestamp) / (maxTimestamp - minTimestamp)) * 100;

      return {
        id: event.id,
        state: event.state,
        label: `${event.state === "on" ? "On" : "Off"} · ${formatCoverTypeLabel(event.cover_type)}`,
        title: `${event.state === "on" ? "Cover On" : "Cover Off"} · ${formatCoverTypeLabel(event.cover_type)} · ${formatSampleTime(event.recorded_at)}`,
        positionPercent
      } satisfies CoverOverlayMarker;
    })
    .filter((value): value is CoverOverlayMarker => value !== null);
}

function formatCoverTypeLabel(value: PoolCoverEventRecord["cover_type"]): string {
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

function countAvailableChemistryCharts(history: ChemistryHistoryData | null): string {
  const available = CHEMISTRY_METRICS.filter((entry) =>
    (history?.series.find((series) => series.metric === entry.metric)?.points.length ?? 0) > 0
  ).length;
  return `${available} / ${CHEMISTRY_METRICS.length}`;
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

function formatCirculationWindow(window: PumpCirculationSummaryItem["window"]): string {
  switch (window) {
    case "24h":
      return "Last 24h";
    case "72h":
      return "Last 72h";
    case "7d":
      return "Last 7d";
  }
}

function formatCirculationSummary(summary: PumpCirculationSummaryItem): string {
  const runtimeHours = roundSingleDecimal(summary.runtime_minutes / 60);
  const status = formatCirculationStatus(summary.status);
  const coverage = `${roundSingleDecimal(summary.sample_coverage_percent)}% coverage`;
  return `${runtimeHours}h runtime · ${roundSingleDecimal(summary.runtime_percent)}% of window · ${coverage} · ${status}`;
}

function formatCirculationStatus(status: PumpCirculationSummaryItem["status"]): string {
  switch (status) {
    case "available":
      return "Available";
    case "partial":
      return "Partial";
    case "insufficient_data":
      return "Insufficient data";
  }
}

function roundSingleDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}
