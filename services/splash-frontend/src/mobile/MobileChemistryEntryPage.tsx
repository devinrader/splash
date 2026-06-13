import type { FormEvent } from "react";
import { useState } from "react";
import { createChemistryReading } from "../api";
import type { ChemistryReadingCreateInput } from "../types";

interface MobileChemistryFormState {
  freeChlorine: string;
  totalChlorine: string;
  ph: string;
  totalAlkalinity: string;
  cyanuricAcid: string;
  calciumHardness: string;
}

const EMPTY_FORM: MobileChemistryFormState = {
  freeChlorine: "",
  totalChlorine: "",
  ph: "",
  totalAlkalinity: "",
  cyanuricAcid: "",
  calciumHardness: ""
};

export function MobileChemistryEntryPage() {
  const [formState, setFormState] = useState<MobileChemistryFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      await createChemistryReading(buildChemistryInput(formState));
      setFormState(EMPTY_FORM);
      setSuccessMessage("Chemistry reading saved.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mobile-stack">
      <section className="mobile-card">
        <div className="mobile-card-header">
          <strong>New Chemistry Test</strong>
        </div>
        <p className="mobile-muted">Uses the existing manual chemistry API. Salt, water temperature, and notes are not supported by the current manual entry contract.</p>
        <form className="mobile-form" onSubmit={handleSubmit}>
          <label>
            <span>Free Chlorine</span>
            <input
              inputMode="decimal"
              value={formState.freeChlorine}
              onChange={(event) => setFormState((current) => ({ ...current, freeChlorine: event.target.value }))}
            />
          </label>
          <label>
            <span>Total Chlorine</span>
            <input
              inputMode="decimal"
              value={formState.totalChlorine}
              onChange={(event) => setFormState((current) => ({ ...current, totalChlorine: event.target.value }))}
            />
          </label>
          <label>
            <span>pH</span>
            <input
              inputMode="decimal"
              value={formState.ph}
              onChange={(event) => setFormState((current) => ({ ...current, ph: event.target.value }))}
            />
          </label>
          <label>
            <span>Total Alkalinity</span>
            <input
              inputMode="decimal"
              value={formState.totalAlkalinity}
              onChange={(event) => setFormState((current) => ({ ...current, totalAlkalinity: event.target.value }))}
            />
          </label>
          <label>
            <span>CYA</span>
            <input
              inputMode="decimal"
              value={formState.cyanuricAcid}
              onChange={(event) => setFormState((current) => ({ ...current, cyanuricAcid: event.target.value }))}
            />
          </label>
          <label>
            <span>Calcium Hardness</span>
            <input
              inputMode="decimal"
              value={formState.calciumHardness}
              onChange={(event) => setFormState((current) => ({ ...current, calciumHardness: event.target.value }))}
            />
          </label>
          <button type="submit" className="mobile-primary-button" disabled={saving}>
            {saving ? "Saving..." : "Save Test"}
          </button>
        </form>
        {successMessage ? <p className="mobile-success">{successMessage}</p> : null}
        {errorMessage ? <p className="mobile-error">{errorMessage}</p> : null}
      </section>
    </div>
  );
}

function buildChemistryInput(formState: MobileChemistryFormState): ChemistryReadingCreateInput {
  return {
    freeChlorine: normalizeNumber(formState.freeChlorine),
    totalChlorine: normalizeNumber(formState.totalChlorine),
    ph: normalizeNumber(formState.ph),
    totalAlkalinity: normalizeNumber(formState.totalAlkalinity),
    cyanuricAcid: normalizeNumber(formState.cyanuricAcid),
    calciumHardness: normalizeNumber(formState.calciumHardness)
  };
}

function normalizeNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return Number.parseFloat(trimmed);
}
