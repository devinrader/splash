import { useEffect, useState, type FormEvent } from "react";
import {
  fetchPoolChemistrySettings,
  fetchWeatherLocationSettings,
  savePoolChemistrySettings,
  saveWeatherLocationSettings
} from "../api";
import { Card } from "../components/mockUi";
import type {
  PoolChemistryKey,
  PoolChemistrySetting,
  WeatherLocationMode,
  WeatherLocationSettingsData,
  WeatherLocationSettingsSaveInput,
  WeatherLocationStatus
} from "../types";

interface WeatherLocationFormState {
  locationMode: WeatherLocationMode;
  addressLine1: string;
  addressLine2: string;
  city: string;
  stateRegion: string;
  postalCode: string;
  country: string;
  latitude: string;
  longitude: string;
  timezone: string;
}

interface ChemistryFormEntry {
  chemicalKey: PoolChemistryKey;
  displayName: string;
  unit: string | null;
  minimum: string;
  target: string;
  maximum: string;
  enabled: boolean;
  sortOrder: number;
}

type ChemistryFieldErrors = Record<string, Record<string, string>>;

export function SettingsPage() {
  const [weatherForm, setWeatherForm] = useState<WeatherLocationFormState>(defaultWeatherFormState());
  const [locationStatus, setLocationStatus] = useState<WeatherLocationStatus>("requires_geocoding");
  const [geocodeProvider, setGeocodeProvider] = useState<string | null>(null);
  const [geocodedAt, setGeocodedAt] = useState<string | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [weatherSaving, setWeatherSaving] = useState(false);
  const [weatherErrorMessage, setWeatherErrorMessage] = useState<string | null>(null);
  const [weatherSuccessMessage, setWeatherSuccessMessage] = useState<string | null>(null);
  const [weatherFieldErrors, setWeatherFieldErrors] = useState<Record<string, string>>({});

  const [chemistryForm, setChemistryForm] = useState<ChemistryFormEntry[]>([]);
  const [chemistrySource, setChemistrySource] = useState<"sqlite" | "defaults">("defaults");
  const [chemistryLoading, setChemistryLoading] = useState(true);
  const [chemistrySaving, setChemistrySaving] = useState(false);
  const [chemistryErrorMessage, setChemistryErrorMessage] = useState<string | null>(null);
  const [chemistrySuccessMessage, setChemistrySuccessMessage] = useState<string | null>(null);
  const [chemistryFieldErrors, setChemistryFieldErrors] = useState<ChemistryFieldErrors>({});

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetchWeatherLocationSettings();
        if (cancelled) {
          return;
        }
        applyLoadedWeatherSettings(response.data);
      } catch (error) {
        if (cancelled) {
          return;
        }
        setWeatherErrorMessage(error instanceof Error ? error.message : String(error));
      } finally {
        if (!cancelled) {
          setWeatherLoading(false);
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
      try {
        const response = await fetchPoolChemistrySettings();
        if (cancelled) {
          return;
        }
        applyLoadedChemistrySettings(response.data.settings, response.data.source);
      } catch (error) {
        if (cancelled) {
          return;
        }
        setChemistryErrorMessage(error instanceof Error ? error.message : String(error));
      } finally {
        if (!cancelled) {
          setChemistryLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  function applyLoadedWeatherSettings(data: WeatherLocationSettingsData) {
    setWeatherForm({
      locationMode: data.locationMode,
      addressLine1: data.addressLine1 ?? "",
      addressLine2: data.addressLine2 ?? "",
      city: data.city ?? "",
      stateRegion: data.stateRegion ?? "",
      postalCode: data.postalCode ?? "",
      country: data.country ?? "",
      latitude: data.latitude !== null ? String(data.latitude) : "",
      longitude: data.longitude !== null ? String(data.longitude) : "",
      timezone: data.timezone ?? ""
    });
    setLocationStatus(data.locationStatus);
    setGeocodeProvider(data.geocodeProvider);
    setGeocodedAt(data.geocodedAt);
    setWeatherErrorMessage(null);
    setWeatherFieldErrors({});
  }

  function applyLoadedChemistrySettings(settings: PoolChemistrySetting[], source: "sqlite" | "defaults") {
    setChemistryForm(
      [...settings]
        .sort((left, right) => left.sortOrder - right.sortOrder || left.displayName.localeCompare(right.displayName))
        .map((setting) => ({
          chemicalKey: setting.chemicalKey,
          displayName: setting.displayName,
          unit: setting.unit,
          minimum: setting.minimum !== null ? String(setting.minimum) : "",
          target: setting.target !== null ? String(setting.target) : "",
          maximum: setting.maximum !== null ? String(setting.maximum) : "",
          enabled: setting.enabled,
          sortOrder: setting.sortOrder
        }))
    );
    setChemistrySource(source);
    setChemistryErrorMessage(null);
    setChemistryFieldErrors({});
  }

  async function handleWeatherSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWeatherSaving(true);
    setWeatherSuccessMessage(null);
    setWeatherErrorMessage(null);
    setWeatherFieldErrors({});

    try {
      const response = await saveWeatherLocationSettings(buildWeatherSaveInput(weatherForm));
      applyLoadedWeatherSettings(response.data);
      setWeatherSuccessMessage("Weather location settings saved.");
    } catch (error) {
      setWeatherErrorMessage(error instanceof Error ? error.message : String(error));
      const details = (error as Error & { details?: { details?: Record<string, string> } }).details;
      if (details && typeof details === "object" && details !== null && "details" in details) {
        const fieldDetail = details.details;
        if (fieldDetail && typeof fieldDetail === "object") {
          setWeatherFieldErrors(fieldDetail);
        }
      }
    } finally {
      setWeatherSaving(false);
    }
  }

  async function handleChemistrySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setChemistrySaving(true);
    setChemistrySuccessMessage(null);
    setChemistryErrorMessage(null);
    setChemistryFieldErrors({});

    try {
      const response = await savePoolChemistrySettings({
        settings: chemistryForm.map((entry) => ({
          chemicalKey: entry.chemicalKey,
          minimum: parseOptionalNumber(entry.minimum),
          target: parseOptionalNumber(entry.target),
          maximum: parseOptionalNumber(entry.maximum),
          enabled: entry.enabled
        }))
      });
      applyLoadedChemistrySettings(response.data.settings, response.data.source);
      setChemistrySuccessMessage("Pool chemistry settings saved.");
    } catch (error) {
      setChemistryErrorMessage(error instanceof Error ? error.message : String(error));
      const details = (error as Error & { details?: { details?: Record<string, Record<string, string>> } }).details;
      if (details && typeof details === "object" && details !== null && "details" in details) {
        const fieldDetail = details.details;
        if (fieldDetail && typeof fieldDetail === "object") {
          setChemistryFieldErrors(fieldDetail);
        }
      }
    } finally {
      setChemistrySaving(false);
    }
  }

  return (
    <section className="settings-shell">
      <div className="settings-grid">
        <Card title="Weather Location" status="Pool forecast source" className="settings-card-form">
          <p className="panel-copy">
            Configure the location Splash should use for weather forecast data. You can store either a physical address for later geocoding or a direct latitude and longitude override.
          </p>
          {weatherLoading ? <p className="chart-empty-state">Loading weather location settings…</p> : null}
          {!weatherLoading ? (
            <form className="settings-form" onSubmit={handleWeatherSubmit}>
              <fieldset className="settings-mode-group">
                <legend>Location Source</legend>
                <label className="settings-mode-option">
                  <input
                    type="radio"
                    name="locationMode"
                    value="address"
                    checked={weatherForm.locationMode === "address"}
                    onChange={() => updateWeatherField("locationMode", "address")}
                  />
                  <span>
                    <strong>Use physical address</strong>
                    <small>Best when the pool site should remain human-readable and geocoding will be handled later.</small>
                  </span>
                </label>
                <label className="settings-mode-option">
                  <input
                    type="radio"
                    name="locationMode"
                    value="coordinates"
                    checked={weatherForm.locationMode === "coordinates"}
                    onChange={() => updateWeatherField("locationMode", "coordinates")}
                  />
                  <span>
                    <strong>Use latitude/longitude</strong>
                    <small>Best when you already know the exact forecast coordinates and want to skip future geocoding.</small>
                  </span>
                </label>
                {renderFieldError(weatherFieldErrors.locationMode)}
              </fieldset>

              {weatherForm.locationMode === "address" ? (
                <div className="settings-field-grid">
                  <label className="settings-field">
                    <span>Address line 1</span>
                    <input value={weatherForm.addressLine1} onChange={(event) => updateWeatherField("addressLine1", event.target.value)} />
                    {renderFieldError(weatherFieldErrors.addressLine1)}
                  </label>
                  <label className="settings-field">
                    <span>Address line 2</span>
                    <input value={weatherForm.addressLine2} onChange={(event) => updateWeatherField("addressLine2", event.target.value)} />
                  </label>
                  <label className="settings-field">
                    <span>City</span>
                    <input value={weatherForm.city} onChange={(event) => updateWeatherField("city", event.target.value)} />
                    {renderFieldError(weatherFieldErrors.city)}
                  </label>
                  <label className="settings-field">
                    <span>State / region</span>
                    <input value={weatherForm.stateRegion} onChange={(event) => updateWeatherField("stateRegion", event.target.value)} />
                    {renderFieldError(weatherFieldErrors.stateRegion)}
                  </label>
                  <label className="settings-field">
                    <span>Postal code</span>
                    <input value={weatherForm.postalCode} onChange={(event) => updateWeatherField("postalCode", event.target.value)} />
                    {renderFieldError(weatherFieldErrors.postalCode)}
                  </label>
                  <label className="settings-field">
                    <span>Country</span>
                    <input value={weatherForm.country} onChange={(event) => updateWeatherField("country", event.target.value)} />
                    {renderFieldError(weatherFieldErrors.country)}
                  </label>
                </div>
              ) : (
                <div className="settings-field-grid">
                  <label className="settings-field">
                    <span>Latitude</span>
                    <input value={weatherForm.latitude} onChange={(event) => updateWeatherField("latitude", event.target.value)} />
                    {renderFieldError(weatherFieldErrors.latitude)}
                  </label>
                  <label className="settings-field">
                    <span>Longitude</span>
                    <input value={weatherForm.longitude} onChange={(event) => updateWeatherField("longitude", event.target.value)} />
                    {renderFieldError(weatherFieldErrors.longitude)}
                  </label>
                  <label className="settings-field settings-field-span-2">
                    <span>Timezone</span>
                    <input value={weatherForm.timezone} onChange={(event) => updateWeatherField("timezone", event.target.value)} placeholder="America/New_York" />
                  </label>
                </div>
              )}

              {weatherErrorMessage ? <p className="settings-message settings-message-error">{weatherErrorMessage}</p> : null}
              {weatherSuccessMessage ? <p className="settings-message settings-message-success">{weatherSuccessMessage}</p> : null}

              <div className="settings-actions">
                <button type="submit" disabled={weatherSaving}>
                  {weatherSaving ? "Saving…" : "Save weather location"}
                </button>
              </div>
            </form>
          ) : null}
        </Card>

        <Card title="Resolution Status" status={locationStatus === "resolved" ? "Ready" : "Pending"} className="settings-card-status">
          <div className="settings-status-list">
            <div>
              <strong>Mode</strong>
              <span>{weatherForm.locationMode === "address" ? "Physical address" : "Coordinates"}</span>
            </div>
            <div>
              <strong>Status</strong>
              <span>{locationStatus === "resolved" ? "Weather location is resolved." : "Location is saved and awaits geocoding."}</span>
            </div>
            <div>
              <strong>Coordinates</strong>
              <span>{formatCoordinates(weatherForm.latitude, weatherForm.longitude)}</span>
            </div>
            <div>
              <strong>Timezone</strong>
              <span>{weatherForm.timezone || "Not set"}</span>
            </div>
            <div>
              <strong>Geocode provider</strong>
              <span>{geocodeProvider ?? "Not geocoded yet"}</span>
            </div>
            <div>
              <strong>Last geocoded</strong>
              <span>{geocodedAt ? new Date(geocodedAt).toLocaleString() : "Never"}</span>
            </div>
          </div>
        </Card>
      </div>

      <Card title="Pool Chemistry" status={chemistrySource === "sqlite" ? "Customized bounds" : "Default bounds"} className="settings-card-chemistry">
        <p className="panel-copy">
          Configure the chemistry targets Splash should use for swimmability and future maintenance recommendations. These values are durable SQLite-backed settings and not time-series telemetry.
        </p>
        {chemistryLoading ? <p className="chart-empty-state">Loading pool chemistry settings…</p> : null}
        {!chemistryLoading ? (
          <form className="settings-form" onSubmit={handleChemistrySubmit}>
            <div className="settings-chemistry-source">
              <strong>Current source</strong>
              <span>{chemistrySource === "sqlite" ? "Customized settings from SQLite" : "Default seeded settings"}</span>
            </div>
            <div className="settings-chemistry-table-shell">
              <table className="system-data-table" aria-label="pool chemistry settings">
                <thead>
                  <tr>
                    <th>Chemistry</th>
                    <th>Unit</th>
                    <th>Minimum</th>
                    <th>Target</th>
                    <th>Maximum</th>
                    <th>Enabled</th>
                  </tr>
                </thead>
                <tbody>
                  {chemistryForm.map((entry, index) => (
                    <tr key={entry.chemicalKey}>
                      <td>
                        <strong>{entry.displayName}</strong>
                      </td>
                      <td>{entry.unit ?? "—"}</td>
                      <td>
                        <label className="settings-chemistry-field">
                          <span className="sr-only">{`${entry.displayName} minimum`}</span>
                          <input
                            aria-label={`${entry.displayName} minimum`}
                            value={entry.minimum}
                            onChange={(event) => updateChemistryField(index, "minimum", event.target.value)}
                          />
                        </label>
                        {renderChemistryFieldError(chemistryFieldErrors, entry.chemicalKey, "minimum")}
                      </td>
                      <td>
                        <label className="settings-chemistry-field">
                          <span className="sr-only">{`${entry.displayName} target`}</span>
                          <input
                            aria-label={`${entry.displayName} target`}
                            value={entry.target}
                            onChange={(event) => updateChemistryField(index, "target", event.target.value)}
                          />
                        </label>
                        {renderChemistryFieldError(chemistryFieldErrors, entry.chemicalKey, "target")}
                      </td>
                      <td>
                        <label className="settings-chemistry-field">
                          <span className="sr-only">{`${entry.displayName} maximum`}</span>
                          <input
                            aria-label={`${entry.displayName} maximum`}
                            value={entry.maximum}
                            onChange={(event) => updateChemistryField(index, "maximum", event.target.value)}
                          />
                        </label>
                        {renderChemistryFieldError(chemistryFieldErrors, entry.chemicalKey, "maximum")}
                      </td>
                      <td>
                        <label className="settings-chemistry-toggle">
                          <input
                            type="checkbox"
                            checked={entry.enabled}
                            onChange={(event) => updateChemistryField(index, "enabled", event.target.checked)}
                          />
                          <span>{entry.enabled ? "On" : "Off"}</span>
                        </label>
                        {renderChemistryFieldError(chemistryFieldErrors, entry.chemicalKey, "enabled")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {chemistryErrorMessage ? <p className="settings-message settings-message-error">{chemistryErrorMessage}</p> : null}
            {chemistrySuccessMessage ? <p className="settings-message settings-message-success">{chemistrySuccessMessage}</p> : null}

            <div className="settings-actions">
              <button type="submit" disabled={chemistrySaving}>
                {chemistrySaving ? "Saving…" : "Save pool chemistry"}
              </button>
            </div>
          </form>
        ) : null}
      </Card>
    </section>
  );

  function updateWeatherField<Key extends keyof WeatherLocationFormState>(key: Key, value: WeatherLocationFormState[Key]) {
    setWeatherForm((current) => ({
      ...current,
      [key]: value
    }));
  }

  function updateChemistryField<Key extends keyof ChemistryFormEntry>(index: number, key: Key, value: ChemistryFormEntry[Key]) {
    setChemistryForm((current) =>
      current.map((entry, entryIndex) => (
        entryIndex === index
          ? {
              ...entry,
              [key]: value
            }
          : entry
      ))
    );
  }
}

function buildWeatherSaveInput(form: WeatherLocationFormState): WeatherLocationSettingsSaveInput {
  if (form.locationMode === "coordinates") {
    return {
      locationMode: "coordinates",
      latitude: form.latitude.trim().length > 0 ? Number.parseFloat(form.latitude) : null,
      longitude: form.longitude.trim().length > 0 ? Number.parseFloat(form.longitude) : null,
      timezone: form.timezone
    };
  }

  return {
    locationMode: "address",
    addressLine1: form.addressLine1,
    addressLine2: form.addressLine2,
    city: form.city,
    stateRegion: form.stateRegion,
    postalCode: form.postalCode,
    country: form.country,
    timezone: form.timezone
  };
}

function defaultWeatherFormState(): WeatherLocationFormState {
  return {
    locationMode: "address",
    addressLine1: "",
    addressLine2: "",
    city: "",
    stateRegion: "",
    postalCode: "",
    country: "",
    latitude: "",
    longitude: "",
    timezone: ""
  };
}

function formatCoordinates(latitude: string, longitude: string): string {
  if (!latitude && !longitude) {
    return "Not configured";
  }
  return `${latitude || "—"}, ${longitude || "—"}`;
}

function renderFieldError(message?: string | null) {
  if (!message) {
    return null;
  }
  return <small className="settings-field-error">{message}</small>;
}

function renderChemistryFieldError(errors: ChemistryFieldErrors, chemicalKey: PoolChemistryKey, field: string) {
  const message = errors[chemicalKey]?.[field];
  if (!message) {
    return null;
  }
  return <small className="settings-field-error">{message}</small>;
}

function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}
