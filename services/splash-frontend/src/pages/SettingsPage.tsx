import { useEffect, useState, type FormEvent } from "react";
import {
  fetchGeocodingSettings,
  fetchPoolChemistrySettings,
  fetchWaterTestingSchedule,
  fetchWeatherLocationSettings,
  resetWaterTestingSchedule,
  saveGeocodingProviderConfig,
  saveGeocodingSettings,
  savePoolChemistrySettings,
  saveWaterTestingSchedule,
  saveWeatherLocationSettings
} from "../api";
import { Card } from "../components/mockUi";
import type {
  PoolChemistryAvailableSource,
  PoolChemistryKey,
  PoolChemistrySetting,
  PoolChemistrySourceBinding,
  PoolChemistrySourceMode,
  GeocodingProviderConfigFieldView,
  GeocodingProviderView,
  WaterTestingFreshnessStatus,
  WaterTestingIntervalUnit,
  WaterTestingScheduleChemicalKey,
  WaterTestingScheduleItem,
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
  sourceMode: PoolChemistrySourceMode;
  sourceBinding: PoolChemistrySourceBinding | null;
  availableSources: PoolChemistryAvailableSource[];
}

type ChemistryFieldErrors = Record<string, Record<string, string> | string>;

interface WaterTestingScheduleFormEntry {
  chemicalKey: WaterTestingScheduleChemicalKey;
  displayName: string;
  enabled: boolean;
  expectedIntervalValue: string;
  expectedIntervalUnit: WaterTestingIntervalUnit;
  staleThresholdValue: string;
  staleThresholdUnit: WaterTestingIntervalUnit;
  unavailableThresholdValue: string;
  unavailableThresholdUnit: WaterTestingIntervalUnit;
  status: WaterTestingFreshnessStatus;
  lastObservedAt: string | null;
  updatedAt: string | null;
}

interface GeocodingProviderFormEntry extends GeocodingProviderView {
  configFields: Array<GeocodingProviderConfigFieldView & { inputValue: string }>;
}

export function SettingsPage() {
  const [weatherForm, setWeatherForm] = useState<WeatherLocationFormState>(defaultWeatherFormState());
  const [locationStatus, setLocationStatus] = useState<WeatherLocationStatus>("requires_geocoding");
  const [resolvedLatitude, setResolvedLatitude] = useState<number | null>(null);
  const [resolvedLongitude, setResolvedLongitude] = useState<number | null>(null);
  const [formattedAddress, setFormattedAddress] = useState<string | null>(null);
  const [geocodeProvider, setGeocodeProvider] = useState<string | null>(null);
  const [geocodedAt, setGeocodedAt] = useState<string | null>(null);
  const [activeGeocodingProviderId, setActiveGeocodingProviderId] = useState<string | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [weatherSaving, setWeatherSaving] = useState(false);
  const [weatherErrorMessage, setWeatherErrorMessage] = useState<string | null>(null);
  const [weatherSuccessMessage, setWeatherSuccessMessage] = useState<string | null>(null);
  const [weatherFieldErrors, setWeatherFieldErrors] = useState<Record<string, string>>({});

  const [geocodingProviders, setGeocodingProviders] = useState<GeocodingProviderFormEntry[]>([]);
  const [geocodingProviderSelection, setGeocodingProviderSelection] = useState<string>("");
  const [geocodingProviderAvailable, setGeocodingProviderAvailable] = useState(false);
  const [geocodingProviderUnavailableReason, setGeocodingProviderUnavailableReason] = useState<string | null>(null);
  const [geocodingLoading, setGeocodingLoading] = useState(true);
  const [geocodingSaving, setGeocodingSaving] = useState(false);
  const [geocodingConfigSavingProviderId, setGeocodingConfigSavingProviderId] = useState<string | null>(null);
  const [geocodingErrorMessage, setGeocodingErrorMessage] = useState<string | null>(null);
  const [geocodingSuccessMessage, setGeocodingSuccessMessage] = useState<string | null>(null);

  const [chemistryForm, setChemistryForm] = useState<ChemistryFormEntry[]>([]);
  const [chemistrySource, setChemistrySource] = useState<"sqlite" | "defaults">("defaults");
  const [chemistryPromptIntervalDays, setChemistryPromptIntervalDays] = useState("3");
  const [chemistryLoading, setChemistryLoading] = useState(true);
  const [chemistrySaving, setChemistrySaving] = useState(false);
  const [chemistryErrorMessage, setChemistryErrorMessage] = useState<string | null>(null);
  const [chemistrySuccessMessage, setChemistrySuccessMessage] = useState<string | null>(null);
  const [chemistryFieldErrors, setChemistryFieldErrors] = useState<ChemistryFieldErrors>({});

  const [testingScheduleForm, setTestingScheduleForm] = useState<WaterTestingScheduleFormEntry[]>([]);
  const [testingScheduleSource, setTestingScheduleSource] = useState<"sqlite" | "defaults">("defaults");
  const [testingScheduleLoading, setTestingScheduleLoading] = useState(true);
  const [testingScheduleSaving, setTestingScheduleSaving] = useState(false);
  const [testingScheduleErrorMessage, setTestingScheduleErrorMessage] = useState<string | null>(null);
  const [testingScheduleSuccessMessage, setTestingScheduleSuccessMessage] = useState<string | null>(null);
  const [testingScheduleFieldErrors, setTestingScheduleFieldErrors] = useState<Record<string, Record<string, string> | string>>({});

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
        const response = await fetchWaterTestingSchedule();
        if (cancelled) {
          return;
        }
        applyLoadedTestingSchedule(response.data.items, response.data.source);
      } catch (error) {
        if (cancelled) {
          return;
        }
        setTestingScheduleErrorMessage(error instanceof Error ? error.message : String(error));
      } finally {
        if (!cancelled) {
          setTestingScheduleLoading(false);
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
        const response = await fetchGeocodingSettings();
        if (cancelled) {
          return;
        }
        applyLoadedGeocodingSettings(response.data);
      } catch (error) {
        if (cancelled) {
          return;
        }
        setGeocodingErrorMessage(error instanceof Error ? error.message : String(error));
      } finally {
        if (!cancelled) {
          setGeocodingLoading(false);
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
        applyLoadedChemistrySettings(
          response.data.settings,
          response.data.source,
          response.data.chemistry_prompt_interval_days
        );
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
    setResolvedLatitude(data.locationMode === "coordinates" ? data.latitude : data.geocodedLatitude);
    setResolvedLongitude(data.locationMode === "coordinates" ? data.longitude : data.geocodedLongitude);
    setFormattedAddress(data.formattedAddress);
    setGeocodeProvider(data.geocodeProvider);
    setGeocodedAt(data.geocodedAt);
    setActiveGeocodingProviderId(data.activeGeocodingProviderId);
    setWeatherErrorMessage(null);
    setWeatherFieldErrors({});
  }

  function applyLoadedGeocodingSettings(data: {
    activeProviderId: string | null;
    activeProviderAvailable: boolean;
    activeProviderUnavailableReason: string | null;
    providers: GeocodingProviderView[];
  }) {
    setGeocodingProviders(
      data.providers.map((provider) => ({
        ...provider,
        configFields: provider.configFields.map((field) => ({
          ...field,
          inputValue: field.value ?? ""
        }))
      }))
    );
    setGeocodingProviderSelection(data.activeProviderId ?? "");
    setGeocodingProviderAvailable(data.activeProviderAvailable);
    setGeocodingProviderUnavailableReason(data.activeProviderUnavailableReason);
    setActiveGeocodingProviderId(data.activeProviderId);
    setGeocodingErrorMessage(null);
  }

  function applyLoadedChemistrySettings(
    settings: PoolChemistrySetting[],
    source: "sqlite" | "defaults",
    chemistryPromptIntervalDaysValue: number
  ) {
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
          sortOrder: setting.sortOrder,
          sourceMode: setting.source_mode,
          sourceBinding: setting.source_binding,
          availableSources: setting.available_sources
        }))
    );
    setChemistryPromptIntervalDays(String(chemistryPromptIntervalDaysValue));
    setChemistrySource(source);
    setChemistryErrorMessage(null);
    setChemistryFieldErrors({});
  }

  function applyLoadedTestingSchedule(items: WaterTestingScheduleItem[], source: "sqlite" | "defaults") {
    setTestingScheduleForm(
      items.map((item) => ({
        chemicalKey: item.chemicalKey,
        displayName: item.displayName,
        enabled: item.enabled,
        expectedIntervalValue: String(item.expectedIntervalValue),
        expectedIntervalUnit: item.expectedIntervalUnit,
        staleThresholdValue: String(item.staleThresholdValue),
        staleThresholdUnit: item.staleThresholdUnit,
        unavailableThresholdValue: String(item.unavailableThresholdValue),
        unavailableThresholdUnit: item.unavailableThresholdUnit,
        status: item.status,
        lastObservedAt: item.lastObservedAt,
        updatedAt: item.updatedAt
      }))
    );
    setTestingScheduleSource(source);
    setTestingScheduleErrorMessage(null);
    setTestingScheduleFieldErrors({});
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
          enabled: entry.enabled,
          sourceMode: entry.sourceMode,
          sourceBinding: entry.sourceBinding
        })),
        chemistryPromptIntervalDays: parseIntegerOrUndefined(chemistryPromptIntervalDays)
      });
      applyLoadedChemistrySettings(
        response.data.settings,
        response.data.source,
        response.data.chemistry_prompt_interval_days
      );
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

  async function handleGeocodingSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setGeocodingSaving(true);
    setGeocodingSuccessMessage(null);
    setGeocodingErrorMessage(null);

    try {
      const response = await saveGeocodingSettings({
        activeProviderId: geocodingProviderSelection
      });
      applyLoadedGeocodingSettings(response.data);
      setGeocodingSuccessMessage("Geocoding provider settings saved.");
    } catch (error) {
      setGeocodingErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setGeocodingSaving(false);
    }
  }

  function updateGeocodingProviderField(providerId: string, fieldKey: string, value: string) {
    setGeocodingProviders((current) =>
      current.map((provider) =>
        provider.id !== providerId
          ? provider
          : {
              ...provider,
              configFields: provider.configFields.map((field) =>
                field.key === fieldKey
                  ? {
                      ...field,
                      inputValue: value
                    }
                  : field
              )
            }
      )
    );
  }

  async function handleGeocodingProviderConfigSave(providerId: string) {
    const provider = geocodingProviders.find((entry) => entry.id === providerId);
    if (!provider) {
      return;
    }

    setGeocodingConfigSavingProviderId(providerId);
    setGeocodingSuccessMessage(null);
    setGeocodingErrorMessage(null);

    try {
      const response = await saveGeocodingProviderConfig({
        providerId,
        config: Object.fromEntries(provider.configFields.map((field) => [field.key, field.inputValue]))
      });
      applyLoadedGeocodingSettings(response.data);
      setGeocodingSuccessMessage(`${provider.displayName} configuration saved.`);
    } catch (error) {
      setGeocodingErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setGeocodingConfigSavingProviderId(null);
    }
  }

  async function handleTestingScheduleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTestingScheduleSaving(true);
    setTestingScheduleSuccessMessage(null);
    setTestingScheduleErrorMessage(null);
    setTestingScheduleFieldErrors({});

    try {
      const response = await saveWaterTestingSchedule({
        items: testingScheduleForm.map((entry) => ({
          chemicalKey: entry.chemicalKey,
          enabled: entry.enabled,
          expectedIntervalValue: parseIntegerOrUndefined(entry.expectedIntervalValue),
          expectedIntervalUnit: entry.expectedIntervalUnit,
          staleThresholdValue: parseIntegerOrUndefined(entry.staleThresholdValue),
          staleThresholdUnit: entry.staleThresholdUnit,
          unavailableThresholdValue: parseIntegerOrUndefined(entry.unavailableThresholdValue),
          unavailableThresholdUnit: entry.unavailableThresholdUnit
        }))
      });
      applyLoadedTestingSchedule(response.data.items, response.data.source);
      setTestingScheduleSuccessMessage("Water testing schedule saved.");
    } catch (error) {
      setTestingScheduleErrorMessage(error instanceof Error ? error.message : String(error));
      const details = (error as Error & { details?: { details?: Record<string, Record<string, string>> } }).details;
      if (details && typeof details === "object" && details !== null && "details" in details) {
        const fieldDetail = details.details;
        if (fieldDetail && typeof fieldDetail === "object") {
          setTestingScheduleFieldErrors(fieldDetail);
        }
      }
    } finally {
      setTestingScheduleSaving(false);
    }
  }

  async function handleTestingScheduleReset() {
    setTestingScheduleSaving(true);
    setTestingScheduleSuccessMessage(null);
    setTestingScheduleErrorMessage(null);
    setTestingScheduleFieldErrors({});

    try {
      const response = await resetWaterTestingSchedule();
      applyLoadedTestingSchedule(response.data.items, response.data.source);
      setTestingScheduleSuccessMessage("Water testing schedule reset to defaults.");
    } catch (error) {
      setTestingScheduleErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setTestingScheduleSaving(false);
    }
  }

  function renderScheduleIntervalEditor(
    entry: WaterTestingScheduleFormEntry,
    index: number,
    mode: "expected" | "stale" | "unavailable"
  ) {
    const numberKey =
      mode === "expected"
        ? "expectedIntervalValue"
        : mode === "stale"
          ? "staleThresholdValue"
          : "unavailableThresholdValue";
    const unitKey =
      mode === "expected"
        ? "expectedIntervalUnit"
        : mode === "stale"
          ? "staleThresholdUnit"
          : "unavailableThresholdUnit";
    const labelPrefix =
      mode === "expected"
        ? "expected interval"
        : mode === "stale"
          ? "stale threshold"
          : "unavailable threshold";

    return (
      <div className="settings-inline-field-group">
        <label className="settings-chemistry-field">
          <span className="sr-only">{`${entry.displayName} ${labelPrefix} value`}</span>
          <input
            aria-label={`${entry.displayName} ${labelPrefix} value`}
            value={entry[numberKey]}
            onChange={(event) => updateTestingScheduleField(index, numberKey, event.target.value)}
          />
        </label>
        <label className="settings-chemistry-field">
          <span className="sr-only">{`${entry.displayName} ${labelPrefix} unit`}</span>
          <select
            aria-label={`${entry.displayName} ${labelPrefix} unit`}
            value={entry[unitKey]}
            onChange={(event) => updateTestingScheduleField(index, unitKey, event.target.value as WaterTestingIntervalUnit)}
          >
            <option value="hours">Hours</option>
            <option value="days">Days</option>
          </select>
        </label>
        {renderTestingScheduleFieldError(testingScheduleFieldErrors, entry.chemicalKey, numberKey)}
        {renderTestingScheduleFieldError(testingScheduleFieldErrors, entry.chemicalKey, unitKey)}
      </div>
    );
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
                    <small>Best when the pool site should remain human-readable and Splash should geocode it on save.</small>
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
              <span>{formatNumericCoordinates(resolvedLatitude, resolvedLongitude)}</span>
            </div>
            <div>
              <strong>Timezone</strong>
              <span>{weatherForm.timezone || "Not set"}</span>
            </div>
            <div>
              <strong>Resolved address</strong>
              <span>{formattedAddress ?? "Not resolved"}</span>
            </div>
            <div>
              <strong>Geocode provider</strong>
              <span>{geocodeProvider ?? "Not geocoded yet"}</span>
            </div>
            <div>
              <strong>Active provider</strong>
              <span>{activeGeocodingProviderId ?? "Not configured"}</span>
            </div>
            <div>
              <strong>Last geocoded</strong>
              <span>{geocodedAt ? new Date(geocodedAt).toLocaleString() : "Never"}</span>
            </div>
          </div>
        </Card>
      </div>

      <Card title="Geocoding" status={geocodingProviderAvailable ? "Configured" : "Needs attention"} className="settings-card-form">
        <p className="panel-copy">
          Choose which geocoding provider Splash should use when saving a physical street address for weather location settings.
        </p>
        {geocodingLoading ? <p className="chart-empty-state">Loading geocoding providers…</p> : null}
        {!geocodingLoading ? (
          <form className="settings-form" onSubmit={handleGeocodingSubmit}>
            {!geocodingProviderAvailable ? (
              <p className="settings-message settings-message-error">
                {geocodingProviderUnavailableReason ?? "No geocoding provider is configured."}
              </p>
            ) : null}
            <div className="settings-field-grid">
              <label className="settings-field settings-field-span-2">
                <span>Active provider</span>
                <select
                  aria-label="Active geocoding provider"
                  value={geocodingProviderSelection}
                  onChange={(event) => setGeocodingProviderSelection(event.target.value)}
                >
                  <option value="" disabled>Select a geocoding provider</option>
                  {geocodingProviders.map((provider) => (
                    <option key={provider.id} value={provider.id} disabled={!provider.available}>
                      {provider.displayName}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="settings-provider-list" aria-label="registered geocoding providers">
              {geocodingProviders.map((provider) => (
                <div key={provider.id} className={`settings-provider-item ${provider.available ? "is-available" : "is-unavailable"}`}>
                  <div className="settings-provider-item-header">
                    <strong>{provider.displayName}</strong>
                    <span>{provider.available ? "Available" : "Unavailable"}</span>
                  </div>
                  <p>{provider.description}</p>
                  {!provider.available && provider.unavailableReason ? (
                    <p className="settings-provider-warning">{provider.unavailableReason}</p>
                  ) : null}
                  {provider.configurationRequirements.length > 0 ? (
                    <p className="settings-provider-meta">
                      Requires: {provider.configurationRequirements.join(", ")}
                    </p>
                  ) : null}
                  <div className="settings-provider-config-grid">
                    {provider.configFields.map((field) => (
                      <label
                        key={`${provider.id}:${field.key}`}
                        className={`settings-field ${field.type === "password" ? "settings-field-span-2" : ""}`}
                      >
                        <span>{field.label}</span>
                        <input
                          type={
                            field.type === "password"
                              ? "password"
                              : field.type === "email"
                                ? "email"
                                : field.type === "url"
                                  ? "url"
                                  : "text"
                          }
                          aria-label={`${provider.displayName} ${field.label}`}
                          value={field.inputValue}
                          placeholder={field.secret && field.configured ? "Stored value configured" : field.placeholder ?? ""}
                          onChange={(event) => updateGeocodingProviderField(provider.id, field.key, event.target.value)}
                        />
                        <small>{field.description}</small>
                      </label>
                    ))}
                  </div>
                  <div className="settings-actions">
                    <button
                      type="button"
                      onClick={() => void handleGeocodingProviderConfigSave(provider.id)}
                      disabled={geocodingSaving || geocodingConfigSavingProviderId !== null}
                    >
                      {geocodingConfigSavingProviderId === provider.id ? "Saving…" : `Save ${provider.displayName} config`}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {geocodingErrorMessage ? <p className="settings-message settings-message-error">{geocodingErrorMessage}</p> : null}
            {geocodingSuccessMessage ? <p className="settings-message settings-message-success">{geocodingSuccessMessage}</p> : null}

            <div className="settings-actions">
              <button type="submit" disabled={geocodingSaving || geocodingProviderSelection.length === 0}>
                {geocodingSaving ? "Saving…" : "Save geocoding provider"}
              </button>
            </div>
          </form>
        ) : null}
      </Card>

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
            <div className="settings-field-grid">
              <label className="settings-field">
                <span>Chemistry prompt interval (days)</span>
                <input
                  aria-label="Chemistry prompt interval (days)"
                  value={chemistryPromptIntervalDays}
                  onChange={(event) => setChemistryPromptIntervalDays(event.target.value)}
                />
                {renderFieldError(typeof chemistryFieldErrors.chemistry_prompt_interval_days === "string" ? chemistryFieldErrors.chemistry_prompt_interval_days : undefined)}
              </label>
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
                    <th>Source</th>
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
                        <label className="settings-chemistry-field">
                          <span className="sr-only">{`${entry.displayName} source`}</span>
                          <select
                            aria-label={`${entry.displayName} source`}
                            value={serializeChemistrySourceSelection(entry.sourceMode, entry.sourceBinding)}
                            onChange={(event) => updateChemistrySource(index, event.target.value)}
                          >
                            <option value="manual">Manual</option>
                            {entry.availableSources.map((source) => (
                              <option
                                key={`${source.provider_type}:${source.provider_id}:${source.measurement_key}`}
                                value={serializeAvailableSource(source)}
                              >
                                {source.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        {renderChemistryFieldError(chemistryFieldErrors, entry.chemicalKey, "source_mode")}
                        {renderChemistryFieldError(chemistryFieldErrors, entry.chemicalKey, "source_binding")}
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

      <Card
        title="Water Testing Schedule"
        status={testingScheduleSource === "sqlite" ? "Customized schedule" : "Default schedule"}
        className="settings-card-chemistry"
      >
        <p className="panel-copy">
          Configure how often Splash expects each water value to be tested or observed. These settings drive freshness alerts and swimmability confidence, not the raw chemistry values themselves.
        </p>
        {testingScheduleLoading ? <p className="chart-empty-state">Loading water testing schedule…</p> : null}
        {!testingScheduleLoading ? (
          <form className="settings-form" onSubmit={handleTestingScheduleSubmit}>
            <div className="settings-chemistry-source">
              <strong>Current source</strong>
              <span>{testingScheduleSource === "sqlite" ? "Customized schedule from SQLite" : "Default seeded schedule"}</span>
            </div>
            <div className="settings-chemistry-table-shell">
              <table className="system-data-table" aria-label="water testing schedule">
                <thead>
                  <tr>
                    <th>Value</th>
                    <th>Expected Interval</th>
                    <th>Stale Threshold</th>
                    <th>Unavailable Threshold</th>
                    <th>Status</th>
                    <th>Enabled</th>
                  </tr>
                </thead>
                <tbody>
                  {testingScheduleForm.map((entry, index) => (
                    <tr key={entry.chemicalKey}>
                      <td>
                        <strong>{entry.displayName}</strong>
                        <div className="settings-provider-meta">
                          Last observed: {entry.lastObservedAt ?? "Never"}
                        </div>
                      </td>
                      <td>{renderScheduleIntervalEditor(entry, index, "expected")}</td>
                      <td>{renderScheduleIntervalEditor(entry, index, "stale")}</td>
                      <td>{renderScheduleIntervalEditor(entry, index, "unavailable")}</td>
                      <td>
                        <span className={`settings-status-pill settings-status-${entry.status}`}>{formatFreshnessStatus(entry.status)}</span>
                      </td>
                      <td>
                        <label className="settings-chemistry-toggle">
                          <input
                            type="checkbox"
                            checked={entry.enabled}
                            onChange={(event) => updateTestingScheduleField(index, "enabled", event.target.checked)}
                          />
                          <span>{entry.enabled ? "On" : "Off"}</span>
                        </label>
                        {renderTestingScheduleFieldError(testingScheduleFieldErrors, entry.chemicalKey, "enabled")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {testingScheduleErrorMessage ? <p className="settings-message settings-message-error">{testingScheduleErrorMessage}</p> : null}
            {testingScheduleSuccessMessage ? <p className="settings-message settings-message-success">{testingScheduleSuccessMessage}</p> : null}

            <div className="settings-actions">
              <button type="button" onClick={handleTestingScheduleReset} disabled={testingScheduleSaving}>
                Reset to defaults
              </button>
              <button type="submit" disabled={testingScheduleSaving}>
                {testingScheduleSaving ? "Saving…" : "Save testing schedule"}
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

  function updateChemistrySource(index: number, value: string) {
    setChemistryForm((current) =>
      current.map((entry, entryIndex) => {
        if (entryIndex !== index) {
          return entry;
        }

        if (value === "manual") {
          return {
            ...entry,
            sourceMode: "manual",
            sourceBinding: null
          };
        }

        const selectedSource = entry.availableSources.find((source) => serializeAvailableSource(source) === value);
        if (!selectedSource) {
          return entry;
        }

        return {
          ...entry,
          sourceMode: "hardware",
          sourceBinding: {
            provider_type: selectedSource.provider_type,
            provider_id: selectedSource.provider_id,
            measurement_key: selectedSource.measurement_key
          }
        };
      })
    );
  }

  function updateTestingScheduleField<Key extends keyof WaterTestingScheduleFormEntry>(
    index: number,
    key: Key,
    value: WaterTestingScheduleFormEntry[Key]
  ) {
    setTestingScheduleForm((current) =>
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

function formatNumericCoordinates(latitude: number | null, longitude: number | null): string {
  if (latitude === null && longitude === null) {
    return "Not configured";
  }
  return `${latitude ?? "—"}, ${longitude ?? "—"}`;
}

function renderFieldError(message?: string | null) {
  if (!message) {
    return null;
  }
  return <small className="settings-field-error">{message}</small>;
}

function renderChemistryFieldError(errors: ChemistryFieldErrors, chemicalKey: PoolChemistryKey, field: string) {
  const fieldErrors = errors[chemicalKey];
  const message = fieldErrors && typeof fieldErrors === "object" ? fieldErrors[field] : undefined;
  if (!message) {
    return null;
  }
  return <small className="settings-field-error">{message}</small>;
}

function renderTestingScheduleFieldError(
  errors: Record<string, Record<string, string> | string>,
  chemicalKey: WaterTestingScheduleChemicalKey,
  field: string
) {
  const fieldErrors = errors[chemicalKey];
  const message = fieldErrors && typeof fieldErrors === "object" ? fieldErrors[field] : undefined;
  if (!message) {
    return null;
  }
  return <small className="settings-field-error">{message}</small>;
}

function formatFreshnessStatus(status: WaterTestingFreshnessStatus): string {
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

function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseIntegerOrUndefined(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  const parsed = Number.parseInt(trimmed, 10);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function serializeAvailableSource(source: PoolChemistryAvailableSource): string {
  return `hardware:${source.provider_type}:${source.provider_id}:${source.measurement_key}`;
}

function serializeChemistrySourceSelection(
  sourceMode: PoolChemistrySourceMode,
  sourceBinding: PoolChemistrySourceBinding | null
): string {
  if (sourceMode === "hardware" && sourceBinding) {
    return `hardware:${sourceBinding.provider_type}:${sourceBinding.provider_id}:${sourceBinding.measurement_key}`;
  }

  return "manual";
}
