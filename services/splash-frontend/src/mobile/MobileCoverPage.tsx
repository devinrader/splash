import { useEffect, useState } from "react";
import { createPoolCoverEvent, fetchCurrentPoolCover } from "../api";
import type { PoolCoverCurrentData, PoolCoverType } from "../types";
import { formatCoverState, formatCoverType, formatTimestamp } from "./mobileUtils";

export function MobileCoverPage() {
  const [cover, setCover] = useState<PoolCoverCurrentData | null>(null);
  const [coverType, setCoverType] = useState<PoolCoverType>("solar");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    void refreshCover();
  }, []);

  async function refreshCover() {
    try {
      const response = await fetchCurrentPoolCover();
      setCover(response.data);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleSetCover(state: "on" | "off") {
    setSaving(true);
    setMessage(null);
    setErrorMessage(null);
    try {
      await createPoolCoverEvent({
        state,
        coverType: state === "on" ? coverType : undefined
      });
      await refreshCover();
      setMessage(state === "on" ? "Cover marked covered." : "Cover marked open.");
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
          <strong>Cover Control</strong>
          <span>{formatCoverState(cover?.current ?? null)}</span>
        </div>
        <div className="mobile-meta-row">
          <span>{formatCoverType(cover?.current ?? null)}</span>
          <span>{formatTimestamp(cover?.current?.recorded_at)}</span>
        </div>

        <label className="mobile-form">
          <span>Cover Type</span>
          <select value={coverType} onChange={(event) => setCoverType(event.target.value as PoolCoverType)} disabled={saving}>
            <option value="solar">Solar</option>
            <option value="winter">Winter</option>
            <option value="safety">Safety</option>
            <option value="automatic">Automatic</option>
            <option value="unknown">Unknown</option>
          </select>
        </label>

        <div className="mobile-button-row">
          <button type="button" className="mobile-primary-button" onClick={() => void handleSetCover("on")} disabled={saving}>
            {saving ? "Saving..." : "Mark Covered"}
          </button>
          <button type="button" className="mobile-secondary-button" onClick={() => void handleSetCover("off")} disabled={saving}>
            {saving ? "Saving..." : "Mark Open"}
          </button>
        </div>

        {message ? <p className="mobile-success">{message}</p> : null}
        {errorMessage ? <p className="mobile-error">{errorMessage}</p> : null}
      </section>
    </div>
  );
}
