import { useEffect, useRef, useState } from "react";
import { Line } from "@nivo/line";
import { fetchTemperatureTelemetryHistory, fetchTemperatureTelemetryLatest } from "../api";
import { Card } from "../components/mockUi";
import type {
  TemperatureTelemetryHistoryData,
  TemperatureTelemetryHistorySeries,
  TemperatureTelemetryLatestData
} from "../types";

const CHART_HEIGHT = 240;
const DEFAULT_CHART_WIDTH = 960;
const MIN_CHART_WIDTH = 320;

export function HomePage() {
  const [latest, setLatest] = useState<TemperatureTelemetryLatestData | null>(null);
  const [history, setHistory] = useState<TemperatureTelemetryHistoryData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const end = new Date().toISOString();
        const start = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const [latestResponse, historyResponse] = await Promise.all([
          fetchTemperatureTelemetryLatest(),
          fetchTemperatureTelemetryHistory({ start, end, interval: "1h" })
        ]);
        if (!cancelled) {
          setLatest(latestResponse.data);
          setHistory(historyResponse.data);
          setError(null);
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : String(nextError));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const latestReadings = latest?.readings ?? {};
  const hasLatestReadings = Object.keys(latestReadings).length > 0;

  return (
    <section className="automation-shell">
      <div className="automation-grid automation-grid-overview">
        <Card title="Home Telemetry" status="EasyTouch temperature history" className="automation-card-hero">
          <p className="panel-copy">
            The Home dashboard now shows persisted EasyTouch temperature telemetry captured from controller status broadcasts and stored for future maintenance and swimmability analysis.
          </p>
        </Card>
        <Card title="Last Updated">
          <div className="automation-record-list">
            <div className="automation-record-row">
              <strong>Telemetry timestamp</strong>
              <span>{formatTelemetryTimestamp(latest?.last_updated)}</span>
            </div>
            <div className="automation-record-row">
              <strong>Source</strong>
              <span>EasyTouch Action 2 controller-status broadcast</span>
            </div>
          </div>
        </Card>
      </div>

      {error ? (
        <Card title="Temperature Telemetry">
          <p className="chart-empty-state">{error}</p>
        </Card>
      ) : !hasLatestReadings ? (
        <Card title="Temperature Telemetry">
          <p className="chart-empty-state">No EasyTouch temperature history has been captured yet.</p>
        </Card>
      ) : (
        <>
          <div className="automation-grid automation-grid-two-column">
            <Card title="Latest Temperatures" className="automation-card-table">
              <div className="mock-summary-grid">
                <div><strong>{formatReading(latestReadings.air?.normalized_f)}</strong><span>Air</span></div>
                <div><strong>{formatReading(latestReadings.pool_water?.normalized_f)}</strong><span>Pool Water</span></div>
                <div><strong>{formatReading(latestReadings.spa_water?.normalized_f)}</strong><span>Spa Water</span></div>
                <div><strong>{formatReading(latestReadings.solar?.normalized_f)}</strong><span>Solar</span></div>
              </div>
            </Card>
            <Card title="Telemetry Detail">
              <div className="automation-record-list">
                {renderDetailRow("Air", latestReadings.air)}
                {renderDetailRow("Pool Water", latestReadings.pool_water)}
                {renderDetailRow("Spa Water", latestReadings.spa_water)}
                {renderDetailRow("Solar", latestReadings.solar)}
              </div>
            </Card>
          </div>
          <Card title="Temperature History" className="automation-card-table">
            <TemperatureHistoryChart series={history?.series ?? []} />
          </Card>
        </>
      )}
    </section>
  );
}

function renderDetailRow(
  label: string,
  reading:
    | TemperatureTelemetryLatestData["readings"]["air"]
    | TemperatureTelemetryLatestData["readings"]["pool_water"]
    | TemperatureTelemetryLatestData["readings"]["spa_water"]
    | TemperatureTelemetryLatestData["readings"]["solar"]
) {
  return (
    <div className="automation-record-row" key={label}>
      <strong>{label}</strong>
      <span>
        {reading ? `${formatReading(reading.normalized_f)} · updated ${formatTelemetryTimestamp(reading.timestamp)}` : "Unavailable"}
      </span>
    </div>
  );
}

function TemperatureHistoryChart({ series }: { series: TemperatureTelemetryHistorySeries[] }) {
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

  const chartData = buildChartData(series);
  if (chartData.length === 0) {
    return <p className="chart-empty-state">No EasyTouch temperature history has been captured yet.</p>;
  }

  return (
    <div ref={containerRef} className="metric-trend-chart-shell">
      <div className="metric-trend-chart-frame" role="img" aria-label="Temperature history chart">
        <Line
          width={chartWidth}
          height={CHART_HEIGHT}
          data={chartData}
          margin={{ top: 20, right: 24, bottom: 56, left: 56 }}
          xScale={{ type: "point" }}
          yScale={{ type: "linear", min: "auto", max: "auto" }}
          colors={["var(--color-water-500, #1f9fb2)", "var(--color-sky-500, #2f6fed)"]}
          axisTop={null}
          axisRight={null}
          axisBottom={{
            tickRotation: -30,
            legend: "Time",
            legendOffset: 44,
            legendPosition: "middle"
          }}
          axisLeft={{
            legend: "Temperature °F",
            legendOffset: -44,
            legendPosition: "middle"
          }}
          pointSize={8}
          pointBorderWidth={2}
          pointBorderColor={{ from: "serieColor" }}
          enableGridX={false}
          useMesh
          enableSlices="x"
          legends={[
            {
              anchor: "bottom",
              direction: "row",
              translateY: 56,
              itemsSpacing: 12,
              itemWidth: 84,
              itemHeight: 14,
              symbolSize: 10,
              symbolShape: "circle"
            }
          ]}
          theme={{
            text: {
              fill: "#425466",
              fontSize: 12
            },
            axis: {
              ticks: {
                line: {
                  stroke: "#c9d3df"
                }
              },
              domain: {
                line: {
                  stroke: "#c9d3df"
                }
              }
            },
            grid: {
              line: {
                stroke: "#e2e8f0",
                strokeDasharray: "4 4"
              }
            },
            tooltip: {
              container: {
                background: "#ffffff",
                color: "#142130",
                border: "1px solid #d8e1eb",
                borderRadius: "12px",
                boxShadow: "0 10px 24px rgba(20, 33, 48, 0.12)"
              }
            }
          }}
        />
      </div>
    </div>
  );
}

function buildChartData(series: TemperatureTelemetryHistorySeries[]) {
  return series
    .filter((entry) => entry.sensor_type === "air" || entry.sensor_type === "pool_water")
    .map((entry) => ({
      id: entry.sensor_type === "pool_water" ? "Pool Water" : "Air",
      data: entry.points.map((point) => ({
        x: formatChartTime(point.timestamp),
        y: point.normalizedF
      }))
    }))
    .filter((entry) => entry.data.length > 0);
}

function formatReading(value: number | undefined): string {
  return typeof value === "number" ? `${Math.round(value * 10) / 10} °F` : "Unavailable";
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

function formatChartTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit"
  });
}
