import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import {
  createChemicalAddition,
  createChemistryObservation,
  createMaintenanceActivity,
  fetchChemicalAdditions,
  fetchChemistryObservations,
  fetchMaintenanceActivities
} from "../api";
import { Card } from "../components/mockUi";
import type {
  ChemicalAdditionCreateInput,
  ChemicalAdditionRecord,
  ChemicalAdditionType,
  ChemicalAdditionUnit,
  ChemicalAdditionsData,
  ChemistryObservationAlgaePresence,
  ChemistryObservationClarity,
  ChemistryObservationCreateInput,
  ChemistryObservationLevel,
  ChemistryObservationRecord,
  ChemistryObservationsData,
  MaintenanceActivitiesData,
  MaintenanceActivityCreateInput,
  MaintenanceActivityRecord,
  MaintenanceActivityType
} from "../types";
import { WaterTestLogPage } from "./WaterTestLogPage";

const CLARITY_OPTIONS: Array<{ value: ChemistryObservationClarity; label: string }> = [
  { value: "clear", label: "Clear" },
  { value: "slightly_hazy", label: "Slightly Hazy" },
  { value: "cloudy", label: "Cloudy" },
  { value: "opaque", label: "Opaque" }
];

const ALGAE_OPTIONS: Array<{ value: ChemistryObservationAlgaePresence; label: string }> = [
  { value: "absent", label: "Absent" },
  { value: "suspected", label: "Suspected" },
  { value: "visible", label: "Visible" }
];

const LEVEL_OPTIONS: Array<{ value: ChemistryObservationLevel; label: string }> = [
  { value: "none", label: "None" },
  { value: "light", label: "Light" },
  { value: "moderate", label: "Moderate" },
  { value: "heavy", label: "Heavy" }
];

const CHEMICAL_TYPE_OPTIONS: Array<{ value: ChemicalAdditionType; label: string }> = [
  { value: "liquid_chlorine", label: "Liquid Chlorine" },
  { value: "cal_hypo", label: "Cal-Hypo" },
  { value: "trichlor", label: "Trichlor" },
  { value: "dichlor", label: "Dichlor" },
  { value: "muriatic_acid", label: "Muriatic Acid" },
  { value: "soda_ash", label: "Soda Ash" },
  { value: "baking_soda", label: "Baking Soda" },
  { value: "calcium_chloride", label: "Calcium Chloride" },
  { value: "stabilizer", label: "Stabilizer" },
  { value: "salt", label: "Salt" },
  { value: "algaecide", label: "Algaecide" },
  { value: "other", label: "Other" }
];

const CHEMICAL_UNIT_OPTIONS: ChemicalAdditionUnit[] = ["gal", "qt", "oz", "lb", "kg", "g", "L"];

const MAINTENANCE_ACTIVITY_OPTIONS: Array<{ value: MaintenanceActivityType; label: string }> = [
  { value: "brushed", label: "Brushed" },
  { value: "vacuumed", label: "Vacuumed" },
  { value: "robot_cleaned", label: "Robot Cleaned" },
  { value: "skimmed", label: "Skimmed" },
  { value: "skimmer_basket_cleaned", label: "Skimmer Basket Cleaned" },
  { value: "pump_basket_cleaned", label: "Pump Basket Cleaned" },
  { value: "filter_cleaned", label: "Filter Cleaned" },
  { value: "filter_backwashed", label: "Filter Backwashed" },
  { value: "other", label: "Other" }
];

interface ObservationFormState {
  clarity: string;
  algaePresence: string;
  debrisLevel: string;
  batherLoadEstimate: string;
  notes: string;
}

interface ChemicalAdditionFormState {
  chemicalType: ChemicalAdditionType;
  amount: string;
  unit: ChemicalAdditionUnit;
  notes: string;
}

interface MaintenanceActivityFormState {
  activityType: MaintenanceActivityType;
  notes: string;
}

const EMPTY_OBSERVATION_FORM: ObservationFormState = {
  clarity: "",
  algaePresence: "",
  debrisLevel: "",
  batherLoadEstimate: "",
  notes: ""
};

const EMPTY_ADDITION_FORM: ChemicalAdditionFormState = {
  chemicalType: "liquid_chlorine",
  amount: "",
  unit: "gal",
  notes: ""
};

const EMPTY_MAINTENANCE_FORM: MaintenanceActivityFormState = {
  activityType: "brushed",
  notes: ""
};

const CHEMISTRY_TABS = [
  { id: "water-test-log", label: "Water Test Log" },
  { id: "water-condition", label: "Water Condition" },
  { id: "chemical-additions", label: "Chemical Additions" },
  { id: "maintenance-activity", label: "Maintenance Activity" }
] as const;

type ChemistryTabId = (typeof CHEMISTRY_TABS)[number]["id"];

export function ChemistryPage() {
  const [activeTab, setActiveTab] = useState<ChemistryTabId>("water-test-log");
  const [observations, setObservations] = useState<ChemistryObservationsData | null>(null);
  const [observationsLoading, setObservationsLoading] = useState(true);
  const [observationSaving, setObservationSaving] = useState(false);
  const [observationErrorMessage, setObservationErrorMessage] = useState<string | null>(null);
  const [observationSuccessMessage, setObservationSuccessMessage] = useState<string | null>(null);
  const [observationFormState, setObservationFormState] = useState<ObservationFormState>(EMPTY_OBSERVATION_FORM);

  const [maintenance, setMaintenance] = useState<MaintenanceActivitiesData | null>(null);
  const [maintenanceLoading, setMaintenanceLoading] = useState(true);
  const [maintenanceSaving, setMaintenanceSaving] = useState(false);
  const [maintenanceErrorMessage, setMaintenanceErrorMessage] = useState<string | null>(null);
  const [maintenanceSuccessMessage, setMaintenanceSuccessMessage] = useState<string | null>(null);
  const [maintenanceFormState, setMaintenanceFormState] = useState<MaintenanceActivityFormState>(EMPTY_MAINTENANCE_FORM);

  const [additions, setAdditions] = useState<ChemicalAdditionsData | null>(null);
  const [additionsLoading, setAdditionsLoading] = useState(true);
  const [additionSaving, setAdditionSaving] = useState(false);
  const [additionErrorMessage, setAdditionErrorMessage] = useState<string | null>(null);
  const [additionSuccessMessage, setAdditionSuccessMessage] = useState<string | null>(null);
  const [additionFormState, setAdditionFormState] = useState<ChemicalAdditionFormState>(EMPTY_ADDITION_FORM);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setObservationsLoading(true);
      setMaintenanceLoading(true);
      setAdditionsLoading(true);
      try {
        const [observationsResponse, maintenanceResponse, additionsResponse] = await Promise.all([
          fetchChemistryObservations({ limit: 10 }),
          fetchMaintenanceActivities({ limit: 10 }),
          fetchChemicalAdditions({ limit: 10 })
        ]);

        if (cancelled) {
          return;
        }

        setObservations(observationsResponse.data);
        setMaintenance(maintenanceResponse.data);
        setAdditions(additionsResponse.data);
        setObservationErrorMessage(null);
        setMaintenanceErrorMessage(null);
        setAdditionErrorMessage(null);
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : String(error);
          setObservationErrorMessage(message);
          setMaintenanceErrorMessage(message);
          setAdditionErrorMessage(message);
        }
      } finally {
        if (!cancelled) {
          setObservationsLoading(false);
          setMaintenanceLoading(false);
          setAdditionsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleObservationSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setObservationSaving(true);
    setObservationErrorMessage(null);
    setObservationSuccessMessage(null);

    try {
      const input = buildObservationCreateInput(observationFormState);
      await createChemistryObservation(input);
      const response = await fetchChemistryObservations({ limit: 10 });
      setObservations(response.data);
      setObservationFormState(EMPTY_OBSERVATION_FORM);
      setObservationSuccessMessage("Water condition saved.");
    } catch (error) {
      setObservationErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setObservationSaving(false);
    }
  }

  async function handleMaintenanceSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMaintenanceSaving(true);
    setMaintenanceErrorMessage(null);
    setMaintenanceSuccessMessage(null);

    try {
      const input = buildMaintenanceCreateInput(maintenanceFormState);
      await createMaintenanceActivity(input);
      const response = await fetchMaintenanceActivities({ limit: 10 });
      setMaintenance(response.data);
      setMaintenanceFormState(EMPTY_MAINTENANCE_FORM);
      setMaintenanceSuccessMessage("Maintenance activity saved.");
    } catch (error) {
      setMaintenanceErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setMaintenanceSaving(false);
    }
  }

  async function handleAdditionSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAdditionSaving(true);
    setAdditionErrorMessage(null);
    setAdditionSuccessMessage(null);

    try {
      const input = buildAdditionCreateInput(additionFormState);
      await createChemicalAddition(input);
      const response = await fetchChemicalAdditions({ limit: 10 });
      setAdditions(response.data);
      setAdditionFormState(EMPTY_ADDITION_FORM);
      setAdditionSuccessMessage("Chemical addition saved.");
    } catch (error) {
      setAdditionErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setAdditionSaving(false);
    }
  }

  return (
    <section className="automation-shell">
      <div className="automation-tabs" role="tablist" aria-label="Chemistry tabs">
        {CHEMISTRY_TABS.map((tab) => (
          <button
            key={tab.id}
            id={`chemistry-tab-${tab.id}`}
            className={`automation-tab ${activeTab === tab.id ? "automation-tab-active" : ""}`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`chemistry-panel-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div
        id={`chemistry-panel-${activeTab}`}
        className="automation-tab-panel"
        role="tabpanel"
        aria-labelledby={`chemistry-tab-${activeTab}`}
      >
        {activeTab === "water-test-log" ? <WaterTestLogPage /> : null}

        {activeTab === "water-condition" ? (
          <div className="automation-grid">
            <Card title="Water Condition" className="automation-card-table">
              <form className="control-form" onSubmit={handleObservationSubmit}>
                <label htmlFor="chemistry-observation-clarity">Water Clarity</label>
                <select
                  id="chemistry-observation-clarity"
                  value={observationFormState.clarity}
                  onChange={(event) => setObservationFormState((current) => ({ ...current, clarity: event.target.value }))}
                >
                  <option value="">Not recorded</option>
                  {CLARITY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>

                <label htmlFor="chemistry-observation-algae">Algae Presence</label>
                <select
                  id="chemistry-observation-algae"
                  value={observationFormState.algaePresence}
                  onChange={(event) => setObservationFormState((current) => ({ ...current, algaePresence: event.target.value }))}
                >
                  <option value="">Not recorded</option>
                  {ALGAE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>

                <label htmlFor="chemistry-observation-debris">Debris Level</label>
                <select
                  id="chemistry-observation-debris"
                  value={observationFormState.debrisLevel}
                  onChange={(event) => setObservationFormState((current) => ({ ...current, debrisLevel: event.target.value }))}
                >
                  <option value="">Not recorded</option>
                  {LEVEL_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>

                <label htmlFor="chemistry-observation-bather-load">Bather Load Estimate</label>
                <select
                  id="chemistry-observation-bather-load"
                  value={observationFormState.batherLoadEstimate}
                  onChange={(event) => setObservationFormState((current) => ({ ...current, batherLoadEstimate: event.target.value }))}
                >
                  <option value="">Not recorded</option>
                  {LEVEL_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>

                <label htmlFor="chemistry-observation-notes">Condition Notes</label>
                <textarea
                  id="chemistry-observation-notes"
                  value={observationFormState.notes}
                  onChange={(event) => setObservationFormState((current) => ({ ...current, notes: event.target.value }))}
                  rows={3}
                />

                <button type="submit" disabled={observationSaving}>
                  {observationSaving ? "Saving…" : "Save water condition"}
                </button>
              </form>

              {observationSuccessMessage ? <p className="inline-success-message">{observationSuccessMessage}</p> : null}
              {observationErrorMessage ? <p className="inline-error-message">{observationErrorMessage}</p> : null}
              {observationsLoading ? <p className="chart-empty-state">Loading water conditions…</p> : null}
              {!observationsLoading && observations?.observations.length ? (
                <div className="settings-chemistry-table-shell">
                  <table className="system-data-table" aria-label="recent water conditions">
                    <thead>
                      <tr>
                        <th>Recorded</th>
                        <th>Clarity</th>
                        <th>Algae</th>
                        <th>Debris</th>
                        <th>Bather Load</th>
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {observations.observations.map((observation) => (
                        <tr key={observation.id}>
                          <td>{formatTimestamp(observation.recorded_at)}</td>
                          <td>{formatObservationClarity(observation.clarity)}</td>
                          <td>{formatObservationAlgae(observation.algae_presence)}</td>
                          <td>{formatObservationLevel(observation.debris_level)}</td>
                          <td>{formatObservationLevel(observation.bather_load_estimate)}</td>
                          <td>{observation.notes || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              {!observationsLoading && !observations?.observations.length ? (
                <p className="chart-empty-state">No water conditions have been logged yet.</p>
              ) : null}
            </Card>
          </div>
        ) : null}

        {activeTab === "maintenance-activity" ? (
          <div className="automation-grid">
            <Card title="Maintenance Activity" className="automation-card-table">
              <form className="control-form" onSubmit={handleMaintenanceSubmit}>
                <label htmlFor="chemistry-maintenance-type">Activity Type</label>
                <select
                  id="chemistry-maintenance-type"
                  value={maintenanceFormState.activityType}
                  onChange={(event) =>
                    setMaintenanceFormState((current) => ({ ...current, activityType: event.target.value as MaintenanceActivityType }))
                  }
                >
                  {MAINTENANCE_ACTIVITY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>

                <label htmlFor="chemistry-maintenance-notes">Maintenance Notes</label>
                <textarea
                  id="chemistry-maintenance-notes"
                  value={maintenanceFormState.notes}
                  onChange={(event) => setMaintenanceFormState((current) => ({ ...current, notes: event.target.value }))}
                  rows={3}
                />

                <button type="submit" disabled={maintenanceSaving}>
                  {maintenanceSaving ? "Saving…" : "Save maintenance activity"}
                </button>
              </form>

              {maintenanceSuccessMessage ? <p className="inline-success-message">{maintenanceSuccessMessage}</p> : null}
              {maintenanceErrorMessage ? <p className="inline-error-message">{maintenanceErrorMessage}</p> : null}
              {maintenanceLoading ? <p className="chart-empty-state">Loading maintenance history…</p> : null}
              {!maintenanceLoading && maintenance?.activities.length ? (
                <div className="settings-chemistry-table-shell">
                  <table className="system-data-table" aria-label="recent maintenance activities">
                    <thead>
                      <tr>
                        <th>Recorded</th>
                        <th>Activity</th>
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {maintenance.activities.map((activity) => (
                        <tr key={activity.id}>
                          <td>{formatTimestamp(activity.recorded_at)}</td>
                          <td>{formatMaintenanceActivityType(activity.activity_type)}</td>
                          <td>{activity.notes || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              {!maintenanceLoading && !maintenance?.activities.length ? (
                <p className="chart-empty-state">No maintenance activities have been logged yet.</p>
              ) : null}
            </Card>
          </div>
        ) : null}

        {activeTab === "chemical-additions" ? (
          <div className="automation-grid">
            <Card title="Chemical Additions" className="automation-card-table">
              <form className="control-form" onSubmit={handleAdditionSubmit}>
                <label htmlFor="chemical-addition-type">Chemical Type</label>
                <select
                  id="chemical-addition-type"
                  value={additionFormState.chemicalType}
                  onChange={(event) =>
                    setAdditionFormState((current) => ({ ...current, chemicalType: event.target.value as ChemicalAdditionType }))
                  }
                >
                  {CHEMICAL_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>

                <label htmlFor="chemical-addition-amount">Amount</label>
                <input
                  id="chemical-addition-amount"
                  type="number"
                  step="0.1"
                  value={additionFormState.amount}
                  onChange={(event) => setAdditionFormState((current) => ({ ...current, amount: event.target.value }))}
                />

                <label htmlFor="chemical-addition-unit">Unit</label>
                <select
                  id="chemical-addition-unit"
                  value={additionFormState.unit}
                  onChange={(event) =>
                    setAdditionFormState((current) => ({ ...current, unit: event.target.value as ChemicalAdditionUnit }))
                  }
                >
                  {CHEMICAL_UNIT_OPTIONS.map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </select>

                <label htmlFor="chemical-addition-notes">Addition Notes</label>
                <textarea
                  id="chemical-addition-notes"
                  value={additionFormState.notes}
                  onChange={(event) => setAdditionFormState((current) => ({ ...current, notes: event.target.value }))}
                  rows={3}
                />

                <button type="submit" disabled={additionSaving}>
                  {additionSaving ? "Saving…" : "Save chemical addition"}
                </button>
              </form>

              {additionSuccessMessage ? <p className="inline-success-message">{additionSuccessMessage}</p> : null}
              {additionErrorMessage ? <p className="inline-error-message">{additionErrorMessage}</p> : null}
              {additionsLoading ? <p className="chart-empty-state">Loading chemical additions…</p> : null}
              {!additionsLoading && additions?.additions.length ? (
                <div className="settings-chemistry-table-shell">
                  <table className="system-data-table" aria-label="recent chemical additions">
                    <thead>
                      <tr>
                        <th>Recorded</th>
                        <th>Chemical</th>
                        <th>Amount</th>
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {additions.additions.map((addition) => (
                        <tr key={addition.id}>
                          <td>{formatTimestamp(addition.recorded_at)}</td>
                          <td>{formatChemicalType(addition.chemical_type)}</td>
                          <td>{`${addition.amount} ${addition.unit}`}</td>
                          <td>{addition.notes || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              {!additionsLoading && !additions?.additions.length ? (
                <p className="chart-empty-state">No chemical additions have been logged yet.</p>
              ) : null}
            </Card>
          </div>
        ) : null}

      </div>
    </section>
  );
}

function buildObservationCreateInput(formState: ObservationFormState): ChemistryObservationCreateInput {
  return {
    clarity: normalizeOptionalValue<ChemistryObservationClarity>(formState.clarity),
    algaePresence: normalizeOptionalValue<ChemistryObservationAlgaePresence>(formState.algaePresence),
    debrisLevel: normalizeOptionalValue<ChemistryObservationLevel>(formState.debrisLevel),
    batherLoadEstimate: normalizeOptionalValue<ChemistryObservationLevel>(formState.batherLoadEstimate),
    notes: formState.notes.trim() ? formState.notes.trim() : null
  };
}

function buildAdditionCreateInput(formState: ChemicalAdditionFormState): ChemicalAdditionCreateInput {
  return {
    chemicalType: formState.chemicalType,
    amount: Number.parseFloat(formState.amount),
    unit: formState.unit,
    notes: formState.notes.trim() ? formState.notes.trim() : null
  };
}

function buildMaintenanceCreateInput(formState: MaintenanceActivityFormState): MaintenanceActivityCreateInput {
  return {
    activityType: formState.activityType,
    notes: formState.notes.trim() ? formState.notes.trim() : null
  };
}

function normalizeOptionalValue<T extends string>(value: string): T | null {
  return value.trim() ? (value as T) : null;
}

function formatTimestamp(value: string): string {
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

function formatChemicalType(value: ChemicalAdditionRecord["chemical_type"]): string {
  const match = CHEMICAL_TYPE_OPTIONS.find((option) => option.value === value);
  return match?.label ?? value;
}

function formatMaintenanceActivityType(value: MaintenanceActivityRecord["activity_type"]): string {
  const match = MAINTENANCE_ACTIVITY_OPTIONS.find((option) => option.value === value);
  return match?.label ?? value;
}

function formatObservationClarity(value: ChemistryObservationRecord["clarity"]): string {
  const match = CLARITY_OPTIONS.find((option) => option.value === value);
  return match?.label ?? "—";
}

function formatObservationAlgae(value: ChemistryObservationRecord["algae_presence"]): string {
  const match = ALGAE_OPTIONS.find((option) => option.value === value);
  return match?.label ?? "—";
}

function formatObservationLevel(
  value: ChemistryObservationRecord["debris_level"] | ChemistryObservationRecord["bather_load_estimate"]
): string {
  const match = LEVEL_OPTIONS.find((option) => option.value === value);
  return match?.label ?? "—";
}
