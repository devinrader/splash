import { useEffect, useRef, useState } from "react";
import { Line } from "@nivo/line";
import type { ConnectivityHistorySample } from "../types";

interface MetricTrendChartProps {
  samples: ConnectivityHistorySample[];
}

const CHART_HEIGHT = 280;
const DEFAULT_CHART_WIDTH = 960;
const MIN_CHART_WIDTH = 320;
const SERIES_DEFINITIONS = [
  {
    id: "RS485 In",
    color: "var(--color-sky-500, #2f6fed)",
    sampleKey: "rs485_in_messages_per_second"
  },
  {
    id: "RS485 Out",
    color: "var(--color-water-500, #1f9fb2)",
    sampleKey: "rs485_out_messages_per_second"
  },
  {
    id: "NATS In",
    color: "var(--color-sand-600, #b76a2a)",
    sampleKey: "nats_in_messages_per_second"
  },
  {
    id: "NATS Out",
    color: "var(--color-pump-500, #0b7a43)",
    sampleKey: "nats_out_messages_per_second"
  }
] as const;

type SampleKey = (typeof SERIES_DEFINITIONS)[number]["sampleKey"];

export function MetricTrendChart({ samples }: MetricTrendChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [chartWidth, setChartWidth] = useState(DEFAULT_CHART_WIDTH);
  const chartData = buildChartData(samples);

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

  if (chartData.length === 0) {
    return <p className="chart-empty-state">Trend data will appear after live rate samples are collected.</p>;
  }

  return (
    <div ref={containerRef} className="metric-trend-chart-shell">
      <div className="metric-trend-chart-frame" role="img" aria-label="Connectivity message activity chart">
        <Line
          width={chartWidth}
          height={CHART_HEIGHT}
          data={chartData}
          margin={{ top: 20, right: 24, bottom: 56, left: 56 }}
          xScale={{ type: "point" }}
          yScale={{ type: "linear", min: 0, max: "auto" }}
          colors={SERIES_DEFINITIONS.map((definition) => definition.color)}
          axisTop={null}
          axisRight={null}
          axisBottom={{
            tickRotation: -30,
            legend: "Time",
            legendOffset: 44,
            legendPosition: "middle"
          }}
          axisLeft={{
            legend: "Messages / 10s",
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
              justify: false,
              translateY: 56,
              itemsSpacing: 12,
              itemWidth: 84,
              itemHeight: 14,
              itemDirection: "left-to-right",
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

function buildChartData(samples: ConnectivityHistorySample[]) {
  return SERIES_DEFINITIONS.map((definition) => ({
    id: definition.id,
    color: definition.color,
    data: samples
      .map((sample) => {
        const value = sample[definition.sampleKey as SampleKey];
        if (typeof value !== "number") {
          return null;
        }
        return {
          x: formatSampleTime(sample.recorded_at),
          y: roundBucketValue(value * 10)
        };
      })
      .filter((point): point is { x: string; y: number } => point !== null)
  })).filter((series) => series.data.length > 0);
}

function formatSampleTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit"
  });
}

function roundBucketValue(value: number): number {
  return Math.round(value * 10) / 10;
}
