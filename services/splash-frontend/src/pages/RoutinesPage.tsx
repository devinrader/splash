import { useEffect, useState } from "react";
import { fetchChemistryHistory, fetchMaintenanceRecommendations, fetchSwimmability, fetchWaterTestingSchedule } from "../api";
import { Card } from "../components/mockUi";
import type {
  ChemistryReadingRecord,
  EquipmentRecord,
  MaintenanceRecommendationItemData,
  MaintenanceRecommendationsData,
  SwimmabilityData,
  SwimmabilityConfidence,
  ValueProvenanceData,
  WaterTestingScheduleChemicalKey,
  WaterTestingScheduleData,
  WaterTestingScheduleItem
} from "../types";
import { useFrontendStore } from "../store";
import { AlertsPage } from "./AlertsPage";

export function RoutinesPage() {
  const [recommendations, setRecommendations] = useState<MaintenanceRecommendationsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [swimmability, setSwimmability] = useState<SwimmabilityData | null>(null);
  const [chemistryHistory, setChemistryHistory] = useState<ChemistryReadingRecord[]>([]);
  const [waterTestingSchedule, setWaterTestingSchedule] = useState<WaterTestingScheduleData | null>(null);
  const [detailLoading, setDetailLoading] = useState(true);
  const [detailErrorMessage, setDetailErrorMessage] = useState<string | null>(null);
  const equipment = useFrontendStore((state) => state.equipment);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      try {
        const response = await fetchMaintenanceRecommendations();
        if (cancelled) {
          return;
        }
        setRecommendations(response.data);
        setErrorMessage(null);
      } catch (error) {
        if (cancelled) {
          return;
        }
        setRecommendations(null);
        setErrorMessage(error instanceof Error ? error.message : String(error));
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setDetailLoading(true);
      try {
        const end = new Date().toISOString();
        const start = new Date(Date.now() - (120 * 24 * 60 * 60 * 1000)).toISOString();
        const [swimmabilityResponse, chemistryHistoryResponse, waterTestingScheduleResponse] = await Promise.all([
          fetchSwimmability(),
          fetchChemistryHistory({ start, end, interval: "raw" }),
          fetchWaterTestingSchedule()
        ]);
        if (cancelled) {
          return;
        }
        setSwimmability(swimmabilityResponse.data);
        setChemistryHistory(chemistryHistoryResponse.data.readings);
        setWaterTestingSchedule(waterTestingScheduleResponse.data);
        setDetailErrorMessage(null);
      } catch (error) {
        if (cancelled) {
          return;
        }
        setSwimmability(null);
        setChemistryHistory([]);
        setWaterTestingSchedule(null);
        setDetailErrorMessage(error instanceof Error ? error.message : String(error));
      } finally {
        if (!cancelled) {
          setDetailLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const swimmabilityInputRows = buildSwimmabilityInputRows({
    swimmability,
    chemistryHistory,
    waterTestingSchedule,
    equipment
  });

  return (
    <>
      <section className="automation-shell">
        <div className="automation-grid">
          <Card title="Recommended Next Steps">
            {loading ? <p className="chart-empty-state">Loading recommendations…</p> : null}
            {!loading && errorMessage ? <p className="settings-message settings-message-error">{errorMessage}</p> : null}
            {!loading && !errorMessage && recommendations ? (
              <div className="recommendation-list" aria-label="maintenance recommendations">
                {recommendations.recommendations.map((recommendation) => (
                  <article
                    className={`recommendation-item recommendation-priority-${recommendation.priority}`}
                    key={recommendation.id}
                  >
                    <div className="recommendation-item-header">
                      <div className="recommendation-item-copy">
                        <span className={`recommendation-priority-pill recommendation-priority-pill-${recommendation.priority}`}>
                          {formatPriority(recommendation.priority)}
                        </span>
                        <strong>{recommendation.title}</strong>
                      </div>
                      <span className="recommendation-confidence">
                        {formatConfidence(recommendation.confidence)} confidence
                      </span>
                    </div>
                    <p className="panel-copy">{recommendation.summary}</p>
                    <div className="automation-record-list">
                      <div className="automation-record-row">
                        <strong>Action</strong>
                        <span>{recommendation.recommended_action}</span>
                      </div>
                      <div className="automation-record-row">
                        <strong>Category</strong>
                        <span>{formatCategory(recommendation.category)}</span>
                      </div>
                    </div>
                    {recommendation.why.length > 0 ? (
                      <div>
                        <strong className="recommendation-subheading">Why</strong>
                        <ul className="recommendation-reason-list">
                          {recommendation.why.map((reason) => (
                            <li key={reason}>{reason}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {recommendation.blocking_factors.length > 0 ? (
                      <div>
                        <strong className="recommendation-subheading">Blocking Factors</strong>
                        <ul className="recommendation-reason-list">
                          {recommendation.blocking_factors.map((factor) => (
                            <li key={factor}>{factor}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {recommendation.supporting_inputs.length > 0 ? (
                      <div className="automation-record-list">
                        {recommendation.supporting_inputs.map((item) => (
                          <div className="automation-record-row" key={`${recommendation.id}-${item.key}`}>
                            <strong>{item.label}</strong>
                            <span>{item.detail}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            ) : null}
          </Card>
          <Card title="Current Swimmability Inputs" status={swimmability ? `${formatConfidence(swimmability.confidence)} confidence` : undefined}>
            {detailLoading ? <p className="chart-empty-state">Loading swimmability inputs…</p> : null}
            {!detailLoading && detailErrorMessage ? <p className="settings-message settings-message-error">{detailErrorMessage}</p> : null}
            {!detailLoading && !detailErrorMessage ? (
              <div className="settings-chemistry-table-shell">
                <table aria-label="current swimmability inputs">
                  <thead>
                    <tr>
                      <th>Parameter</th>
                      <th>Current value</th>
                      <th>Type</th>
                      <th>Last observed</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {swimmabilityInputRows.map((row) => (
                      <tr key={row.label}>
                        <td>{row.label}</td>
                        <td>{row.value}</td>
                        <td>{row.kind}</td>
                        <td>{row.lastObserved}</td>
                        <td>{row.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </Card>
        </div>
      </section>
      <AlertsPage />
    </>
  );
}

function formatPriority(priority: MaintenanceRecommendationItemData["priority"]): string {
  switch (priority) {
    case "now":
      return "Do this now";
    case "soon":
      return "Do this soon";
    case "monitor":
      return "Monitor";
  }
}

function formatConfidence(confidence: SwimmabilityConfidence): string {
  switch (confidence) {
    case "high":
      return "High";
    case "medium":
      return "Medium";
    case "low":
      return "Low";
    case "unknown":
      return "Unknown";
  }
}

function formatCategory(category: MaintenanceRecommendationItemData["category"]): string {
  switch (category) {
    case "retest":
      return "Retest";
    case "chemistry_adjustment":
      return "Chemistry adjustment";
    case "circulation":
      return "Circulation";
    case "cover_usage":
      return "Cover usage";
    case "cleaning":
      return "Cleaning";
    case "inspection":
      return "Inspection";
    case "wait":
      return "Wait";
  }
}

function buildSwimmabilityInputRows(input: {
  swimmability: SwimmabilityData | null;
  chemistryHistory: ChemistryReadingRecord[];
  waterTestingSchedule: WaterTestingScheduleData | null;
  equipment: Record<string, EquipmentRecord>;
}): Array<{ label: string; value: string; kind: string; lastObserved: string; notes: string }> {
  const controller = Object.values(input.equipment).find((entry) => entry.equipment_type === "controller");
  const chlorinator = Object.values(input.equipment).find((entry) => entry.equipment_type === "chlorinator");
  const chemistry = buildLatestChemistryValues(input.chemistryHistory);
  const swimmability = input.swimmability;
  const scheduleByKey = buildScheduleMap(input.waterTestingSchedule);
  const chemistryProvenance = swimmability?.input_provenance?.chemistry;
  const waterTemperatureProvenance = swimmability?.input_provenance?.water_temperature;
  const weatherForecastProvenance = swimmability?.input_provenance?.weather_forecast;
  const rainfallProvenance = swimmability?.input_provenance?.rainfall_since_chemistry;
  const combinedChlorine =
    chemistry?.total_chlorine != null && chemistry.free_chlorine != null
      ? Math.max(0, chemistry.total_chlorine - chemistry.free_chlorine)
      : null;

  return [
    createSwimmabilityRow("Free chlorine", formatChemistryValue(chemistry.free_chlorine, "ppm"), "Measured", formatObservedAt(chemistry.free_chlorine_recorded_at), chemistryValueNote(scheduleByKey.free_chlorine, chemistryProvenance)),
    createSwimmabilityRow("Total chlorine", formatChemistryValue(chemistry.total_chlorine, "ppm"), "Measured", formatObservedAt(chemistry.total_chlorine_recorded_at), chemistryValueNote(undefined, chemistryProvenance)),
    createSwimmabilityRow("Combined chlorine", formatChemistryValue(combinedChlorine, "ppm"), "Derived", formatObservedAt(chemistry.combined_chlorine_recorded_at), combinedChlorineNote(chemistry)),
    createSwimmabilityRow("pH", formatChemistryValue(chemistry.ph, null), "Measured", formatObservedAt(chemistry.ph_recorded_at), chemistryValueNote(scheduleByKey.ph, chemistryProvenance)),
    createSwimmabilityRow("Alkalinity", formatChemistryValue(chemistry.total_alkalinity, "ppm"), "Measured", formatObservedAt(chemistry.total_alkalinity_recorded_at), chemistryValueNote(scheduleByKey.total_alkalinity, chemistryProvenance)),
    createSwimmabilityRow("Calcium hardness", formatChemistryValue(chemistry.calcium_hardness, "ppm"), "Measured", formatObservedAt(chemistry.calcium_hardness_recorded_at), chemistryValueNote(scheduleByKey.calcium_hardness, chemistryProvenance)),
    createSwimmabilityRow("Cyanuric acid", formatChemistryValue(chemistry.cyanuric_acid, "ppm"), "Measured", formatObservedAt(chemistry.cyanuric_acid_recorded_at), chemistryValueNote(scheduleByKey.cyanuric_acid, chemistryProvenance)),
    createSwimmabilityRow("Salt", formatMetric(readNumber(chlorinator?.latest_state?.salt_ppm), "ppm"), "Measured", formatObservedAt(asNullableString(chlorinator?.latest_state?.updated_at)), chemistryValueNote(scheduleByKey.salt, undefined, "Current chlorinator salt telemetry.")),
    createSwimmabilityRow("Water temperature", formatMetric(readNumber(controller?.latest_state?.water_temp_f), "°F"), "Measured", formatObservedAt(waterTemperatureProvenance?.measured_at ?? null), provenanceNote(waterTemperatureProvenance)),
    createSwimmabilityRow("Chemistry freshness", swimmability?.last_chemistry_age_label ?? "Unavailable", "Derived", formatObservedAt(chemistryProvenance?.measured_at ?? null), provenanceNote(chemistryProvenance)),
    createSwimmabilityRow("Weather forecast context", formatFreshnessLabel(weatherForecastProvenance?.freshness_state), "Contextual", formatObservedAt(weatherForecastProvenance?.measured_at ?? null), provenanceNote(weatherForecastProvenance)),
    createSwimmabilityRow("Rainfall since chemistry", formatFreshnessLabel(rainfallProvenance?.freshness_state), "Contextual", formatObservedAt(rainfallProvenance?.measured_at ?? null), provenanceNote(rainfallProvenance))
  ];
}

function createSwimmabilityRow(label: string, value: string, kind: string, lastObserved: string, notes: string) {
  return { label, value, kind, lastObserved, notes };
}

function formatChemistryValue(value: number | null | undefined, unit: string | null): string {
  if (typeof value !== "number") {
    return "Unavailable";
  }
  return unit ? `${trimTrailingZero(value)} ${unit}` : trimTrailingZero(value);
}

function formatMetric(value: number | null, unit: string): string {
  if (value == null) {
    return "Unavailable";
  }
  return `${trimTrailingZero(value)} ${unit}`;
}

function trimTrailingZero(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function formatFreshnessLabel(value: ValueProvenanceData["freshness_state"] | undefined): string {
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
      return "Unavailable";
  }
}

function combinedChlorineNote(chemistry: LatestChemistryValues): string {
  if (chemistry.total_chlorine != null && chemistry.free_chlorine != null) {
    return `Derived from total chlorine minus free chlorine. Last derived from ${formatObservedAt(chemistry.combined_chlorine_recorded_at)}.`;
  }
  return "Requires both total chlorine and free chlorine.";
}

function provenanceNote(
  provenance: ValueProvenanceData | undefined
): string {
  if (!provenance) {
    return "No provenance available.";
  }

  const reasons = provenance.reasons[0] ?? null;
  const freshness = formatFreshnessLabel(provenance.freshness_state);
  const confidence = formatConfidence(provenance.confidence_band);
  return reasons ? `${freshness} · ${confidence} confidence · ${reasons}` : `${freshness} · ${confidence} confidence`;
}

interface LatestChemistryValues {
  free_chlorine: number | null;
  free_chlorine_recorded_at: string | null;
  total_chlorine: number | null;
  total_chlorine_recorded_at: string | null;
  ph: number | null;
  ph_recorded_at: string | null;
  total_alkalinity: number | null;
  total_alkalinity_recorded_at: string | null;
  calcium_hardness: number | null;
  calcium_hardness_recorded_at: string | null;
  cyanuric_acid: number | null;
  cyanuric_acid_recorded_at: string | null;
  combined_chlorine_recorded_at: string | null;
}

function buildLatestChemistryValues(readings: ChemistryReadingRecord[]): LatestChemistryValues {
  return {
    free_chlorine: latestChemistryValue(readings, (reading) => reading.free_chlorine),
    free_chlorine_recorded_at: latestChemistryRecordedAt(readings, (reading) => reading.free_chlorine),
    total_chlorine: latestChemistryValue(readings, (reading) => reading.total_chlorine),
    total_chlorine_recorded_at: latestChemistryRecordedAt(readings, (reading) => reading.total_chlorine),
    ph: latestChemistryValue(readings, (reading) => reading.ph),
    ph_recorded_at: latestChemistryRecordedAt(readings, (reading) => reading.ph),
    total_alkalinity: latestChemistryValue(readings, (reading) => reading.total_alkalinity),
    total_alkalinity_recorded_at: latestChemistryRecordedAt(readings, (reading) => reading.total_alkalinity),
    calcium_hardness: latestChemistryValue(readings, (reading) => reading.calcium_hardness),
    calcium_hardness_recorded_at: latestChemistryRecordedAt(readings, (reading) => reading.calcium_hardness),
    cyanuric_acid: latestChemistryValue(readings, (reading) => reading.cyanuric_acid),
    cyanuric_acid_recorded_at: latestChemistryRecordedAt(readings, (reading) => reading.cyanuric_acid),
    combined_chlorine_recorded_at: latestChemistryRecordedAt(
      readings,
      (reading) => reading.total_chlorine != null && reading.free_chlorine != null ? Math.max(0, reading.total_chlorine - reading.free_chlorine) : null
    )
  };
}

function latestChemistryValue(
  readings: ChemistryReadingRecord[],
  selector: (reading: ChemistryReadingRecord) => number | null
): number | null {
  const latest = [...readings]
    .filter((reading) => selector(reading) != null)
    .sort((left, right) => Date.parse(right.recorded_at) - Date.parse(left.recorded_at))[0];
  return latest ? selector(latest) : null;
}

function latestChemistryRecordedAt(
  readings: ChemistryReadingRecord[],
  selector: (reading: ChemistryReadingRecord) => number | null
): string | null {
  const latest = [...readings]
    .filter((reading) => selector(reading) != null)
    .sort((left, right) => Date.parse(right.recorded_at) - Date.parse(left.recorded_at))[0];
  return latest?.recorded_at ?? null;
}

function buildScheduleMap(schedule: WaterTestingScheduleData | null): Partial<Record<WaterTestingScheduleChemicalKey, WaterTestingScheduleItem>> {
  return Object.fromEntries((schedule?.items ?? []).map((item) => [item.chemicalKey, item])) as Partial<Record<WaterTestingScheduleChemicalKey, WaterTestingScheduleItem>>;
}

function chemistryValueNote(
  scheduleItem: WaterTestingScheduleItem | undefined,
  fallbackProvenance?: ValueProvenanceData,
  fallbackPrefix?: string
): string {
  const parts: string[] = [];
  if (fallbackPrefix) {
    parts.push(fallbackPrefix);
  }
  if (scheduleItem) {
    parts.push(`${formatScheduleStatus(scheduleItem.status)} by ${scheduleItem.displayName} cadence`);
  } else if (fallbackProvenance) {
    parts.push(provenanceNote(fallbackProvenance));
  }
  return parts.length > 0 ? parts.join(" · ") : "No recorded value is available.";
}

function formatScheduleStatus(status: WaterTestingScheduleItem["status"]): string {
  switch (status) {
    case "current":
      return "Current";
    case "stale":
      return "Stale";
    case "unavailable":
      return "Unavailable";
    case "disabled":
      return "Disabled";
  }
}

function formatObservedAt(value: string | null): string {
  if (!value) {
    return "unknown time";
  }
  return new Date(value).toLocaleString();
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
