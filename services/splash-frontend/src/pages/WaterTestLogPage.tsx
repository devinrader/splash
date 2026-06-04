import type { Dispatch, FormEvent, SetStateAction } from "react";
import { useEffect, useState } from "react";
import { createChemistryReading, fetchChemistryHistory } from "../api";
import { Card } from "../components/mockUi";
import type {
  ChemistryHistoryData,
  ChemistryReadingCreateInput
} from "../types";

const CHEMISTRY_RANGE_OPTIONS = [
  { id: "7d", label: "Last 7 days", lookbackMs: 7 * 24 * 60 * 60 * 1000, interval: "raw" as const },
  { id: "30d", label: "Last 30 days", lookbackMs: 30 * 24 * 60 * 60 * 1000, interval: "1d" as const },
  { id: "90d", label: "Last 90 days", lookbackMs: 90 * 24 * 60 * 60 * 1000, interval: "1d" as const }
] as const;

type ChemistryRangeId = (typeof CHEMISTRY_RANGE_OPTIONS)[number]["id"];

interface ChemistryFormState {
  ph: string;
  freeChlorine: string;
  totalChlorine: string;
  totalAlkalinity: string;
  calciumHardness: string;
  cyanuricAcid: string;
}

const EMPTY_FORM: ChemistryFormState = {
  ph: "",
  freeChlorine: "",
  totalChlorine: "",
  totalAlkalinity: "",
  calciumHardness: "",
  cyanuricAcid: ""
};

export function WaterTestLogPage() {
  const [selectedRangeId, setSelectedRangeId] = useState<ChemistryRangeId>("30d");
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
        const historyResponse = await fetchChemistryHistory({
          start,
          end,
          interval: selectedRange.interval
        });

        if (cancelled) {
          return;
        }

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
      const historyResponse = await fetchChemistryHistory({
        start,
        end,
        interval: selectedRange.interval
      });
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
      <div className="automation-grid water-test-log-grid">
        <Card title="Prior Logs" className="automation-card-table">
          {loading ? <p className="chart-empty-state">Loading chemistry history…</p> : null}
          {!loading && history?.readings.length ? (
            <div className="settings-chemistry-table-shell">
              <table className="system-data-table" aria-label="recent chemistry readings">
                <thead>
                  <tr>
                    <th>Recorded</th>
                    <th>pH</th>
                    <th>FC</th>
                    <th>TC</th>
                    <th>TA</th>
                    <th>CH</th>
                    <th>CYA</th>
                  </tr>
                </thead>
                <tbody>
                  {[...history.readings].reverse().slice(0, 10).map((reading) => (
                    <tr key={reading.id}>
                      <td>{formatReadingTimestamp(reading.recorded_at)}</td>
                      <td>{formatOptionalValue(reading.ph)}</td>
                      <td>{formatOptionalValue(reading.free_chlorine)}</td>
                      <td>{formatOptionalValue(reading.total_chlorine)}</td>
                      <td>{formatOptionalValue(reading.total_alkalinity)}</td>
                      <td>{formatOptionalValue(reading.calcium_hardness)}</td>
                      <td>{formatOptionalValue(reading.cyanuric_acid)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {!loading && !history?.readings.length ? <p className="chart-empty-state">No chemistry readings are available for this range yet.</p> : null}
        </Card>

        <Card title="Log Chemistry Reading" className="automation-card-table">
          <form className="control-form" onSubmit={handleSubmit}>
            <label htmlFor="chemistry-free-chlorine">Free Chlorine (ppm)</label>
            <input
              id="chemistry-free-chlorine"
              type="number"
              step="0.1"
              value={formState.freeChlorine}
              onChange={(event) => updateFormState(setFormState, "freeChlorine", event.target.value)}
            />

            <label htmlFor="chemistry-total-chlorine">Total Chlorine (ppm)</label>
            <input
              id="chemistry-total-chlorine"
              type="number"
              step="0.1"
              value={formState.totalChlorine}
              onChange={(event) => updateFormState(setFormState, "totalChlorine", event.target.value)}
            />

            <label htmlFor="chemistry-ph">pH</label>
            <input id="chemistry-ph" type="number" step="0.1" value={formState.ph} onChange={(event) => updateFormState(setFormState, "ph", event.target.value)} />

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

            <button type="submit" disabled={saving}>{saving ? "Saving…" : "Save chemistry reading"}</button>
          </form>
        </Card>
      </div>
    </section>
  );
}

function buildCreateInput(formState: ChemistryFormState): ChemistryReadingCreateInput {
  return {
    ph: parseOptionalNumber(formState.ph),
    freeChlorine: parseOptionalNumber(formState.freeChlorine),
    totalChlorine: parseOptionalNumber(formState.totalChlorine),
    totalAlkalinity: parseOptionalNumber(formState.totalAlkalinity),
    calciumHardness: parseOptionalNumber(formState.calciumHardness),
    cyanuricAcid: parseOptionalNumber(formState.cyanuricAcid)
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
