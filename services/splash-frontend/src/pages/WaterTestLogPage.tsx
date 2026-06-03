import type { Dispatch, FormEvent, SetStateAction } from "react";
import { useEffect, useRef, useState } from "react";
import { Line } from "@nivo/line";
import { createChemistryReading, fetchChemistryHistory, fetchChemistryLatest } from "../api";
import { Card } from "../components/mockUi";
import type {
  ChemistryHistoryData,
  ChemistryHistoryMetric,
  ChemistryReadingCreateInput,
  ChemistryReadingRecord
} from "../types";

const CHART_HEIGHT = 240;
const DEFAULT_CHART_WIDTH = 960;
const MIN_CHART_WIDTH = 320;
const CHEMISTRY_RANGE_OPTIONS = [
  { id: "7d", label: "Last 7 days", lookbackMs: 7 * 24 * 60 * 60 * 1000, interval: "raw" as const },
  { id: "30d", label: "Last 30 days", lookbackMs: 30 * 24 * 60 * 60 * 1000, interval: "1d" as const },
  { id: "90d", label: "Last 90 days", lookbackMs: 90 * 24 * 60 * 60 * 1000, interval: "1d" as const }
] as const;
const CHART_METRICS: Array<{ metric: ChemistryHistoryMetric; label: string; axis: string; color: string }> = [
  { metric: "ph", label: "pH", axis: "pH", color: "var(--color-sky-500, #2f6fed)" },
  { metric: "free_chlorine", label: "Free Chlorine", axis: "Free Chlorine ppm", color: "var(--color-water-500, #1f9fb2)" },
  { metric: "salt_level", label: "Salt", axis: "Salt ppm", color: "var(--color-sand-600, #b76a2a)" }
];

type ChemistryRangeId = (typeof CHEMISTRY_RANGE_OPTIONS)[number]["id"];

interface ChemistryFormState {
  ph: string;
  freeChlorine: string;
  totalAlkalinity: string;
  calciumHardness: string;
  cyanuricAcid: string;
  saltLevel: string;
  rainfallInches: string;
  recordedAt: string;
}

const EMPTY_FORM: ChemistryFormState = {
  ph: "",
  freeChlorine: "",
  totalAlkalinity: "",
  calciumHardness: "",
  cyanuricAcid: "",
  saltLevel: "",
  rainfallInches: "",
  recordedAt: ""
};

export function WaterTestLogPage() {
  const [selectedRangeId, setSelectedRangeId] = useState<ChemistryRangeId>("30d");
  const [latestReading, setLatestReading] = useState<ChemistryReadingRecord | null>(null);
  const [history, setHistory] = useState<ChemistryHistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [warningMessages, setWarningMessages] = useState<string[]>([]);
  const [formState, setFormState] = useState<ChemistryFormState>(EMPTY_FORM);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      try {
        const selectedRange = CHEMISTRY_RANGE_OPTIONS.find((option) => option.id === selectedRangeId) ?? CHEMISTRY_RANGE_OPTIONS[1];
        const end = new Date().toISOString();
        const start = new Date(Date.now() - selectedRange.lookbackMs).toISOString();
        const [latestResponse, historyResponse] = await Promise.all([
          fetchChemistryLatest(),
          fetchChemistryHistory({
            start,
            end,
            interval: selectedRange.interval
          })
        ]);

        if (cancelled) {
          return;
        }

        setLatestReading(latestResponse.data);
        setHistory(historyResponse.data);
        setErrorMessage(null);
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedRangeId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSuccessMessage(null);
    setWarningMessages([]);
    setErrorMessage(null);

    try {
      const input = buildCreateInput(formState);
      const response = await createChemistryReading(input);
      const selectedRange = CHEMISTRY_RANGE_OPTIONS.find((option) => option.id === selectedRangeId) ?? CHEMISTRY_RANGE_OPTIONS[1];
      const end = new Date().toISOString();
      const start = new Date(Date.now() - selectedRange.lookbackMs).toISOString();
      const [latestResponse, historyResponse] = await Promise.all([
        fetchChemistryLatest(),
        fetchChemistryHistory({
          start,
          end,
          interval: selectedRange.interval
        })
      ]);
      setLatestReading(latestResponse.data);
      setHistory(historyResponse.data);
      setWarningMessages(response.data.warnings);
      setSuccessMessage("Chemistry reading saved.");
      setFormState(EMPTY_FORM);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="automation-shell">
      <div className="automation-grid automation-grid-overview">
        <Card title="Chemistry Entries" status="Manual water test log" className="automation-card-hero">
          <p className="panel-copy">
            Record manual chemistry readings, review the latest water test, and watch core chemistry trends over time.
          </p>
          <div className="control-form">
            <label htmlFor="chemistry-range">Time range</label>
            <select
              id="chemistry-range"
              value={selectedRangeId}
              onChange={(event) => setSelectedRangeId(event.target.value as ChemistryRangeId)}
            >
              {CHEMISTRY_RANGE_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </div>
        </Card>
        <Card title="Latest Reading" status={latestReading ? formatReadingTimestamp(latestReading.recorded_at) : "No entries"}>
          {latestReading ? (
            <dl className="network-stat-list">
              <div><dt>pH</dt><dd>{formatOptionalValue(latestReading.ph)}</dd></div>
              <div><dt>Free Chlorine</dt><dd>{formatOptionalValue(latestReading.free_chlorine, "ppm")}</dd></div>
              <div><dt>Total Alkalinity</dt><dd>{formatOptionalValue(latestReading.total_alkalinity, "ppm")}</dd></div>
              <div><dt>Cyanuric Acid</dt><dd>{formatOptionalValue(latestReading.cyanuric_acid, "ppm")}</dd></div>
              <div><dt>Calcium Hardness</dt><dd>{formatOptionalValue(latestReading.calcium_hardness, "ppm")}</dd></div>
              <div><dt>Salt</dt><dd>{formatOptionalValue(latestReading.salt_level, "ppm")}</dd></div>
              <div><dt>Rainfall</dt><dd>{formatOptionalValue(latestReading.rainfall_inches, "in")}</dd></div>
            </dl>
          ) : (
            <p className="chart-empty-state">No chemistry readings have been captured yet.</p>
          )}
        </Card>
      </div>

      {errorMessage ? (
        <Card title="Chemistry Error">
          <p className="chart-empty-state">{errorMessage}</p>
        </Card>
      ) : null}

      {successMessage || warningMessages.length ? (
        <Card title="Save Status">
          {successMessage ? <p className="settings-message settings-message-success">{successMessage}</p> : null}
          {warningMessages.map((warning) => (
            <p key={warning} className="settings-message settings-message-error">{warning}</p>
          ))}
        </Card>
      ) : null}

      <div className="automation-grid automation-grid-two-column">
        <Card title="Log Chemistry Reading" className="automation-card-table">
          <form className="control-form" onSubmit={handleSubmit}>
            <label htmlFor="chemistry-ph">pH</label>
            <input id="chemistry-ph" type="number" step="0.1" value={formState.ph} onChange={(event) => updateFormState(setFormState, "ph", event.target.value)} />

            <label htmlFor="chemistry-free-chlorine">Free Chlorine (ppm)</label>
            <input
              id="chemistry-free-chlorine"
              type="number"
              step="0.1"
              value={formState.freeChlorine}
              onChange={(event) => updateFormState(setFormState, "freeChlorine", event.target.value)}
            />

            <label htmlFor="chemistry-total-alkalinity">Total Alkalinity (ppm)</label>
            <input
              id="chemistry-total-alkalinity"
              type="number"
              step="1"
              value={formState.totalAlkalinity}
              onChange={(event) => updateFormState(setFormState, "totalAlkalinity", event.target.value)}
            />

            <label htmlFor="chemistry-calcium-hardness">Calcium Hardness (ppm)</label>
            <input
              id="chemistry-calcium-hardness"
              type="number"
              step="1"
              value={formState.calciumHardness}
              onChange={(event) => updateFormState(setFormState, "calciumHardness", event.target.value)}
            />

            <label htmlFor="chemistry-cyanuric-acid">Cyanuric Acid (ppm)</label>
            <input
              id="chemistry-cyanuric-acid"
              type="number"
              step="1"
              value={formState.cyanuricAcid}
              onChange={(event) => updateFormState(setFormState, "cyanuricAcid", event.target.value)}
            />

            <label htmlFor="chemistry-salt">Salt (ppm)</label>
            <input
              id="chemistry-salt"
              type="number"
              step="1"
              value={formState.saltLevel}
              onChange={(event) => updateFormState(setFormState, "saltLevel", event.target.value)}
            />

            <label htmlFor="chemistry-rainfall">Rainfall (in)</label>
            <input
              id="chemistry-rainfall"
              type="number"
              step="0.01"
              value={formState.rainfallInches}
              onChange={(event) => updateFormState(setFormState, "rainfallInches", event.target.value)}
            />

            <label htmlFor="chemistry-recorded-at">Recorded at</label>
            <input
              id="chemistry-recorded-at"
              type="datetime-local"
              value={formState.recordedAt}
              onChange={(event) => updateFormState(setFormState, "recordedAt", event.target.value)}
            />

            <button type="submit" disabled={saving}>{saving ? "Saving…" : "Save chemistry reading"}</button>
          </form>
        </Card>

        <Card title="Recent Readings" className="automation-card-table">
          {loading ? <p className="chart-empty-state">Loading chemistry history…</p> : null}
          {!loading && history?.readings.length ? (
            <div className="settings-chemistry-table-shell">
              <table className="system-data-table" aria-label="recent chemistry readings">
                <thead>
                  <tr>
                    <th>Recorded</th>
                    <th>pH</th>
                    <th>FC</th>
                    <th>TA</th>
                    <th>CH</th>
                    <th>CYA</th>
                    <th>Salt</th>
                    <th>Rain</th>
                  </tr>
                </thead>
                <tbody>
                  {[...history.readings].reverse().slice(0, 10).map((reading) => (
                    <tr key={reading.id}>
                      <td>{formatReadingTimestamp(reading.recorded_at)}</td>
                      <td>{formatOptionalValue(reading.ph)}</td>
                      <td>{formatOptionalValue(reading.free_chlorine)}</td>
                      <td>{formatOptionalValue(reading.total_alkalinity)}</td>
                      <td>{formatOptionalValue(reading.calcium_hardness)}</td>
                      <td>{formatOptionalValue(reading.cyanuric_acid)}</td>
                      <td>{formatOptionalValue(reading.salt_level)}</td>
                      <td>{formatOptionalValue(reading.rainfall_inches)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {!loading && !history?.readings.length ? <p className="chart-empty-state">No chemistry readings are available for this range yet.</p> : null}
        </Card>
      </div>

      <div className="automation-grid automation-grid-two-column">
        {CHART_METRICS.map((entry) => (
          <Card key={entry.metric} title={`${entry.label} Trend`} className="automation-card-table">
            <ChemistryTrendChart
              ariaLabel={`${entry.label} history chart`}
              yLegend={entry.axis}
              color={entry.color}
              series={buildChemistryChartSeries(history, entry.metric)}
            />
          </Card>
        ))}
      </div>
    </section>
  );
}

function ChemistryTrendChart({
  ariaLabel,
  yLegend,
  color,
  series
}: {
  ariaLabel: string;
  yLegend: string;
  color: string;
  series: Array<{ x: string; y: number }>;
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
          data={[{ id: ariaLabel, color, data: series }]}
          margin={{ top: 20, right: 24, bottom: 56, left: 56 }}
          xScale={{ type: "point" }}
          yScale={{ type: "linear", min: "auto", max: "auto" }}
          colors={[color]}
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

function buildCreateInput(formState: ChemistryFormState): ChemistryReadingCreateInput {
  return {
    ph: parseOptionalNumber(formState.ph),
    freeChlorine: parseOptionalNumber(formState.freeChlorine),
    totalAlkalinity: parseOptionalNumber(formState.totalAlkalinity),
    calciumHardness: parseOptionalNumber(formState.calciumHardness),
    cyanuricAcid: parseOptionalNumber(formState.cyanuricAcid),
    saltLevel: parseOptionalNumber(formState.saltLevel),
    rainfallInches: parseOptionalNumber(formState.rainfallInches),
    recordedAt: formState.recordedAt ? new Date(formState.recordedAt).toISOString() : null
  };
}

function parseOptionalNumber(value: string): number | null {
  if (!value.trim()) {
    return null;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function updateFormState(
  setFormState: Dispatch<SetStateAction<ChemistryFormState>>,
  key: keyof ChemistryFormState,
  value: string
) {
  setFormState((current) => ({
    ...current,
    [key]: value
  }));
}

function buildChemistryChartSeries(history: ChemistryHistoryData | null, metric: ChemistryHistoryMetric) {
  const series = history?.series.find((entry) => entry.metric === metric);
  return (series?.points ?? []).map((point) => ({
    x: formatChartTime(point.recorded_at),
    y: point.value
  }));
}

function formatChartTime(value: string): string {
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

function formatReadingTimestamp(value: string): string {
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

function formatOptionalValue(value: number | null, unit?: string): string {
  if (value === null || value === undefined) {
    return "—";
  }
  return unit ? `${value} ${unit}` : String(value);
}
