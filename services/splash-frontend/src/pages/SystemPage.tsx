import { useEffect, useState } from "react";
import type React from "react";
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  fetchControllerClock,
  fetchControllerHeater,
  fetchControllerPumpConfigurations,
  fetchCurrentPoolCover,
  fetchPoolProfileSettings,
  requestChlorinatorOutput,
  requestControllerClockRefresh,
  requestPumpInfo,
  savePoolProfileSettings,
  updateControllerClock,
  updateControllerHeaterConfiguration,
  updateControllerHeaterSettings,
  updateControllerPumpConfiguration
} from "../api";
import { MetricTrendChart } from "../components/MetricTrendChart";
import { SplashIcon } from "../components/icons/SplashIcon";
import { Card, MetricCard, MockEntityRow, MockModeRow } from "../components/mockUi";
import type { SystemHardwareDetailId } from "../navigation";
import { SYSTEM_TABS, getActiveSystemTab } from "../navigation";
import type {
  ConnectivityHistorySample,
  ControllerClockData,
  ControllerHeaterData,
  ControllerPumpConfigurationData,
  EquipmentRecord,
  PoolCoverCurrentData,
  PoolProfileSettingsData,
  PlatformStatusResponse,
  PlatformServiceHealthRecord
} from "../types";
import type { ControllerCircuitDefinition, PendingCircuitToggle } from "../viewUtils";
import {
  formatBoolean,
  formatCircuitKey,
  formatCircuitStatePill,
  formatControllerDatetimeReply,
  formatControllerTime,
  formatChlorinatorRunState,
  formatChlorinatorStatus,
  formatFilterCondition,
  formatHexByte,
  formatLabel,
  formatMetric,
  formatRequestTimestamp,
  formatValueWithLabel,
  getCircuitFunctionOptions,
  getCircuitStateClassName,
  getChlorinatorStatusTone,
  getCircuitNameOptions,
  getHardwareDetailCode,
  getHardwareDetailFacts,
  getHardwareDetailStatus,
  getHardwareDetailSubtitle,
  getHardwareDetailTitle,
  getStatusChipClassName,
  humanizeCircuitType,
  readMetric,
  readNullableString,
  resolveCircuitIconName
} from "../viewUtils";

export function SystemPage(props: SystemPageProps) {
  const location = useLocation();
  const activeTab = getActiveSystemTab(location.pathname);

  return (
    <section className="system-page-shell">
      <div className="system-tabs" role="tablist" aria-label="System tabs">
        {SYSTEM_TABS.map((tab) => (
          <NavLink
            key={tab.id}
            id={`system-tab-${tab.id}`}
            className={`system-tab ${activeTab === tab.id ? "system-tab-active" : ""}`}
            to={tab.path}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`system-panel-${tab.id}`}
          >
            {tab.label}
          </NavLink>
        ))}
      </div>
      <div id={`system-panel-${activeTab}`} className="system-tab-panel" role="tabpanel" aria-labelledby={`system-tab-${activeTab}`}>
        <Routes>
          <Route index element={<Navigate to="overview" replace />} />
          <Route path="overview" element={<SystemOverviewTab {...props} />} />
          <Route path="hardware" element={<HardwareListTab {...props} />} />
          <Route path="hardware/:hardwareId" element={<HardwareDetailTab {...props} />} />
          <Route path="sensors" element={<SensorsTab {...props} />} />
          <Route path="control" element={<ControlTab {...props} />} />
          <Route path="connectivity" element={<ConnectivityTab {...props} />} />
          <Route path="platform" element={<PlatformTab {...props} />} />
          <Route path="*" element={<Navigate to="overview" replace />} />
        </Routes>
      </div>
    </section>
  );
}

function SystemOverviewTab({ controller, pump, chlorinator, installedCircuits, activeCircuitCount, controllerMode, rpmInput }: SystemPageProps) {
  const hardwareRows = getHardwareRows(controller, pump, chlorinator);
  const navigate = useNavigate();

  return (
    <section className="mock-system-page">
      <section className="mock-system-grid">
        <Card title="Control Surfaces" className="mock-card-span-2">
          <div className="mock-entity-list">
            <MockEntityRow
              badge="HW"
              badgeTone="hardware"
              title={controller?.display_name ?? "EasyTouch 8 Controller"}
              summary="Hardware controller · RS485 connected"
              statusLabel="Online"
              statusTone="good"
              actionLabel="Details"
            />
            <MockEntityRow
              badge="SW"
              badgeTone="software"
              title="Splash Software Controller"
              summary="Software control layer · automation engine available"
              statusLabel="Ready"
              statusTone="good"
              actionLabel="Details"
            />
          </div>
          <p className="ownership-note">
            Manual controls below resolve to the correct source: hardware controller, Splash software control, or direct device control.
          </p>
        </Card>

        <Card title="Control Summary">
          <div className="mock-summary-grid">
            <div><strong>{installedCircuits.length}</strong><span>Circuits</span></div>
            <div><strong>{activeCircuitCount}</strong><span>Active</span></div>
            <div><strong>3</strong><span>Modes</span></div>
            <div><strong>2</strong><span>Sources</span></div>
          </div>
        </Card>

        <Card title="Circuits" className="mock-card-span-2" status="Manage circuits">
          <div className="mock-circuit-list">
            {installedCircuits.slice(0, 4).map((entry) => (
              <div className="mock-circuit-row" key={entry.circuit.key}>
                <div>
                  <strong>{entry.circuit.nameLabel ?? entry.circuit.defaultName}</strong>
                  <span>{entry.circuit.defaultName} · {entry.circuit.functionLabel ?? "Controller circuit"}</span>
                </div>
                <span className={`mock-state-label ${entry.state ? "mock-state-label-on" : "mock-state-label-off"}`}>{formatCircuitStatePill(entry.state)}</span>
                <span className={`mock-switch ${entry.state ? "mock-switch-on" : ""}`} aria-hidden="true"><span /></span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Modes" status="View mode details">
          <div className="mock-mode-list">
            <MockModeRow title="Pool Mode" summary="Default circulation and heating behavior" active={controllerMode === "pool" || controllerMode === "pool_spa"} />
            <MockModeRow title="Spa Mode" summary="Valves, heat, and pump target change together" active={controllerMode === "spa"} />
            <MockModeRow title="Night Swim" summary="Lights on, heater enabled, pump quiet profile" active={false} />
          </div>
        </Card>

        <Card title="Advanced Controls" status="Use carefully">
          <div className="mock-advanced-list">
            <details className="mock-advanced-details">
              <summary>Pump override</summary>
              <div className="mock-advanced-body">
                <div className="simple-row"><span>Current speed</span><strong>{formatMetric(readMetric(pump?.latest_state.rpm), "RPM")}</strong></div>
                <div className="simple-row"><span>Desired speed</span><strong>{rpmInput} RPM</strong></div>
              </div>
            </details>
            <details className="mock-advanced-details">
              <summary>Heater setpoint</summary>
              <div className="mock-advanced-body">
                <div className="simple-row"><span>Current setpoint</span><strong>{formatMetric(readMetric(controller?.latest_state.water_temp_f), "°F")}</strong></div>
                <div className="simple-row"><span>Current temp</span><strong>{formatMetric(readMetric(controller?.latest_state.air_temp_f), "°F")}</strong></div>
              </div>
            </details>
            <details className="mock-advanced-details">
              <summary>Manual relay command</summary>
              <div className="mock-advanced-body"><p className="panel-copy">Send a direct command to a mapped circuit or relay.</p></div>
            </details>
          </div>
        </Card>

        <Card title="Installed Hardware" className="mock-card-span-2">
          <div className="mock-entity-list">
            {hardwareRows.map((hardware) => (
              <MockEntityRow
                key={hardware.id}
                badge={hardware.shortCode}
                badgeTone={hardware.id === "intelliflo" ? "software" : "hardware"}
                title={hardware.title}
                summary={hardware.summary}
                statusLabel={hardware.status}
                statusTone={hardware.status === "Idle" ? "muted" : "good"}
                actionLabel="Details"
                onAction={() => navigate(`/system/hardware/${hardware.id}`)}
              />
            ))}
          </div>
        </Card>
      </section>
    </section>
  );
}

function HardwareListTab({ controller, pump, chlorinator }: SystemPageProps) {
  const navigate = useNavigate();
  const hardwareRows = getHardwareRows(controller, pump, chlorinator);

  return (
    <section className="mock-system-page">
      <Card title="Installed Hardware">
        <div className="mock-entity-list">
          {hardwareRows.map((hardware) => (
            <MockEntityRow
              key={hardware.id}
              badge={hardware.shortCode}
              badgeTone={hardware.id === "intelliflo" ? "software" : "hardware"}
              title={hardware.title}
              summary={hardware.summary}
              statusLabel={hardware.status}
              statusTone={hardware.status === "Idle" ? "muted" : "good"}
              actionLabel="Details"
              onAction={() => navigate(`/system/hardware/${hardware.id}`)}
            />
          ))}
        </div>
        <div className="mock-card-footer">
          <button className="mock-link-button" type="button">Add hardware</button>
        </div>
      </Card>
    </section>
  );
}

function HardwareDetailTab({
  controller,
  pump,
  chlorinator,
  installedCircuits,
  controllerCircuitStates,
  isRequestingCircuitConfig,
  handleCircuitConfigRequest,
  circuitConfigRequestMessage
}: SystemPageProps) {
  const params = useParams<{ hardwareId: string }>();
  const detail = isHardwareDetailId(params.hardwareId) ? params.hardwareId : "easytouch8";
  const [draftRows, setDraftRows] = useState<EditableCircuitConfigRow[]>(() => getEditableCircuitRows(controllerCircuitStates));
  const [controllerClock, setControllerClock] = useState<ControllerClockData | null>(null);
  const [controllerClockError, setControllerClockError] = useState<string | null>(null);
  const [controllerClockDraft, setControllerClockDraft] = useState({
    month: "",
    day: "",
    year: "",
    dayOfWeek: "",
    hour24: "",
    minute: "",
    daylightSavingsAuto: "auto",
    clockAdvance: ""
  });
  const [controllerClockPending, setControllerClockPending] = useState(false);
  const [controllerClockRefreshPending, setControllerClockRefreshPending] = useState(false);
  const [controllerClockMessage, setControllerClockMessage] = useState<string | null>(null);
  const [pumpConfigurations, setPumpConfigurations] = useState<ControllerPumpConfigurationData[]>([]);
  const [pumpConfigurationError, setPumpConfigurationError] = useState<string | null>(null);
  const [pumpConfigurationDrafts, setPumpConfigurationDrafts] = useState<Record<number, PumpConfigurationDraft>>({});
  const [pumpConfigurationPending, setPumpConfigurationPending] = useState<Record<number, boolean>>({});
  const [pumpConfigurationMessages, setPumpConfigurationMessages] = useState<Record<number, string | null>>({});
  const [pumpConfigurationRefreshPending, setPumpConfigurationRefreshPending] = useState(false);
  const [heater, setHeater] = useState<ControllerHeaterData | null>(null);
  const [heaterError, setHeaterError] = useState<string | null>(null);
  const [heaterConfigDraft, setHeaterConfigDraft] = useState({
    heaterType: "ultratempHeatPumpCom" as "ultratempHeatPumpCom" | "ultratempEtiHybrid",
    coolingEnabled: false,
    freezeProtectionEnabled: false
  });
  const [heaterSettingsDraft, setHeaterSettingsDraft] = useState({
    poolSetpoint: "84",
    spaSetpoint: "100",
    poolHeatMode: "0",
    spaHeatMode: "0",
    coolSetpoint: "0"
  });
  const [heaterConfigPending, setHeaterConfigPending] = useState(false);
  const [heaterSettingsPending, setHeaterSettingsPending] = useState(false);
  const [heaterConfigMessage, setHeaterConfigMessage] = useState<string | null>(null);
  const [heaterSettingsMessage, setHeaterSettingsMessage] = useState<string | null>(null);
  const [chlorinatorOutputDraft, setChlorinatorOutputDraft] = useState("");
  const [chlorinatorOutputPending, setChlorinatorOutputPending] = useState(false);
  const [chlorinatorOutputMessage, setChlorinatorOutputMessage] = useState<string | null>(null);
  const [poolProfile, setPoolProfile] = useState<PoolProfileSettingsData | null>(null);
  const [poolProfileError, setPoolProfileError] = useState<string | null>(null);
  const [poolVolumeDraft, setPoolVolumeDraft] = useState("");
  const [poolVolumePending, setPoolVolumePending] = useState(false);
  const [poolVolumeMessage, setPoolVolumeMessage] = useState<string | null>(null);
  const [coverCurrent, setCoverCurrent] = useState<PoolCoverCurrentData | null>(null);

  useEffect(() => {
    setDraftRows(getEditableCircuitRows(controllerCircuitStates));
  }, [controllerCircuitStates]);

  useEffect(() => {
    if (detail !== "easytouch8") {
      return;
    }
    void (async () => {
      try {
        const [heaterResponse, clockResponse, pumpConfigurationResponse] = await Promise.all([
          fetchControllerHeater(),
          fetchControllerClock(),
          fetchControllerPumpConfigurations()
        ]);
        setHeater(heaterResponse.data);
        setHeaterError(null);
        setControllerClock(clockResponse.data);
        setControllerClockError(null);
        setPumpConfigurations(pumpConfigurationResponse.data.pumps);
        setPumpConfigurationError(null);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to load EasyTouch8 controller state.";
        setHeaterError(message);
        setControllerClockError(message);
        setPumpConfigurationError(message);
      }
    })();
  }, [detail]);

  useEffect(() => {
    if (detail !== "intellichlor") {
      return;
    }
    void (async () => {
      try {
        const [profileResponse, coverResponse] = await Promise.all([
          fetchPoolProfileSettings(),
          fetchCurrentPoolCover()
        ]);
        setPoolProfile(profileResponse.data);
        setCoverCurrent(coverResponse.data);
        setPoolProfileError(null);
      } catch (error) {
        setPoolProfileError(error instanceof Error ? error.message : "Failed to load pool profile settings.");
      }
    })();
  }, [detail]);

  useEffect(() => {
    if (!controllerClock) {
      return;
    }
    setControllerClockDraft({
      month: controllerClock.summary.month == null ? "" : String(controllerClock.summary.month),
      day: controllerClock.summary.day == null ? "" : String(controllerClock.summary.day),
      year: controllerClock.summary.year == null ? "" : String(controllerClock.summary.year),
      dayOfWeek: controllerClock.summary.day_of_week == null ? "" : String(controllerClock.summary.day_of_week),
      hour24: controllerClock.summary.hour_24 == null ? "" : String(controllerClock.summary.hour_24),
      minute: controllerClock.summary.minute == null ? "" : String(controllerClock.summary.minute),
      daylightSavingsAuto: controllerClock.summary.daylight_savings_auto === false ? "manual" : "auto",
      clockAdvance: controllerClock.summary.clock_advance == null ? "" : String(controllerClock.summary.clock_advance)
    });
  }, [controllerClock]);

  useEffect(() => {
    setPumpConfigurationDrafts(Object.fromEntries(pumpConfigurations.map((pumpConfiguration) => [pumpConfiguration.pump_id, createPumpConfigurationDraft(pumpConfiguration)])));
  }, [pumpConfigurations]);

  useEffect(() => {
    if (!heater) {
      return;
    }
    setHeaterConfigDraft({
      heaterType: heater.configuration.detected_heater_type === "ultratempEtiHybrid" ? "ultratempEtiHybrid" : "ultratempHeatPumpCom",
      coolingEnabled: heater.configuration.cooling_enabled === true,
      freezeProtectionEnabled: heater.configuration.freeze_protection_enabled === true
    });
    setHeaterSettingsDraft({
      poolSetpoint: String(heater.settings.pool_setpoint ?? 84),
      spaSetpoint: String(heater.settings.spa_setpoint ?? 100),
      poolHeatMode: String(parseHeatModeNumber(heater.settings.pool_heat_mode)),
      spaHeatMode: String(parseHeatModeNumber(heater.settings.spa_heat_mode)),
      coolSetpoint: String(heater.settings.cool_setpoint ?? 0)
    });
  }, [heater]);

  useEffect(() => {
    const configuredOutput = readMetric(
      chlorinator?.latest_state.output_percent
        ?? chlorinator?.latest_state.target_output_percent
    );
    setChlorinatorOutputDraft(configuredOutput == null ? "" : String(configuredOutput));
  }, [
    chlorinator?.latest_state.output_percent,
    chlorinator?.latest_state.target_output_percent
  ]);

  useEffect(() => {
    setPoolVolumeDraft(poolProfile?.volume_gallons == null ? "" : String(poolProfile.volume_gallons));
  }, [poolProfile?.volume_gallons]);

  async function handleHeaterConfigurationSave(): Promise<void> {
    setHeaterConfigPending(true);
    setHeaterConfigMessage(null);
    try {
      const response = await updateControllerHeaterConfiguration(heaterConfigDraft);
      setHeater(response.data.heater);
      setHeaterConfigMessage("Heater configuration saved.");
      setHeaterError(null);
    } catch (error) {
      setHeaterConfigMessage(error instanceof Error ? error.message : "Failed to save heater configuration.");
    } finally {
      setHeaterConfigPending(false);
    }
  }

  async function handleHeaterSettingsSave(): Promise<void> {
    const poolSetpoint = Number.parseInt(heaterSettingsDraft.poolSetpoint, 10);
    const spaSetpoint = Number.parseInt(heaterSettingsDraft.spaSetpoint, 10);
    const poolHeatMode = Number.parseInt(heaterSettingsDraft.poolHeatMode, 10);
    const spaHeatMode = Number.parseInt(heaterSettingsDraft.spaHeatMode, 10);
    const coolSetpoint = Number.parseInt(heaterSettingsDraft.coolSetpoint, 10);

    if ([poolSetpoint, spaSetpoint, poolHeatMode, spaHeatMode, coolSetpoint].some((value) => Number.isNaN(value))) {
      setHeaterSettingsMessage("Enter valid numeric heater settings.");
      return;
    }

    setHeaterSettingsPending(true);
    setHeaterSettingsMessage(null);
    try {
      const response = await updateControllerHeaterSettings({
        poolSetpoint,
        spaSetpoint,
        poolHeatMode: poolHeatMode as 0 | 1 | 2 | 3,
        spaHeatMode: spaHeatMode as 0 | 1 | 2 | 3,
        coolSetpoint
      });
      setHeater(response.data.heater);
      setHeaterSettingsMessage("Heat settings saved.");
      setHeaterError(null);
    } catch (error) {
      setHeaterSettingsMessage(error instanceof Error ? error.message : "Failed to save heater settings.");
    } finally {
      setHeaterSettingsPending(false);
    }
  }

  async function handleControllerClockRefresh(): Promise<void> {
    setControllerClockRefreshPending(true);
    setControllerClockMessage(null);
    try {
      await requestControllerClockRefresh();
      setControllerClockMessage("Controller clock refresh requested.");
    } catch (error) {
      setControllerClockMessage(error instanceof Error ? error.message : "Failed to request controller clock refresh.");
    } finally {
      setControllerClockRefreshPending(false);
    }
  }

  async function handleControllerClockSave(): Promise<void> {
    const month = Number.parseInt(controllerClockDraft.month, 10);
    const day = Number.parseInt(controllerClockDraft.day, 10);
    const year = Number.parseInt(controllerClockDraft.year, 10);
    const dayOfWeek = Number.parseInt(controllerClockDraft.dayOfWeek, 10);
    const hour24 = Number.parseInt(controllerClockDraft.hour24, 10);
    const minute = Number.parseInt(controllerClockDraft.minute, 10);
    const clockAdvance =
      controllerClockDraft.clockAdvance.trim().length === 0 ? null : Number.parseInt(controllerClockDraft.clockAdvance, 10);
    if ([month, day, year, dayOfWeek, hour24, minute].some((value) => Number.isNaN(value)) || (clockAdvance !== null && Number.isNaN(clockAdvance))) {
      setControllerClockMessage("Enter valid numeric controller clock values.");
      return;
    }

    setControllerClockPending(true);
    setControllerClockMessage(null);
    try {
      const response = await updateControllerClock({
        month,
        day,
        year,
        dayOfWeek,
        hour24,
        minute,
        daylightSavingsAuto: controllerClockDraft.daylightSavingsAuto === "auto",
        clockAdvance
      });
      setControllerClock(response.data.clock);
      setControllerClockError(null);
      setControllerClockMessage("Controller clock configuration saved.");
    } catch (error) {
      setControllerClockMessage(error instanceof Error ? error.message : "Failed to save controller clock configuration.");
    } finally {
      setControllerClockPending(false);
    }
  }

  async function handlePumpConfigurationRefresh(): Promise<void> {
    setPumpConfigurationRefreshPending(true);
    try {
      await requestPumpInfo(1);
      await requestPumpInfo(2);
      const response = await fetchControllerPumpConfigurations();
      setPumpConfigurations(response.data.pumps);
      setPumpConfigurationError(null);
    } catch (error) {
      setPumpConfigurationError(error instanceof Error ? error.message : "Failed to refresh controller pump configuration.");
    } finally {
      setPumpConfigurationRefreshPending(false);
    }
  }

  async function handlePumpConfigurationSave(pumpId: number): Promise<void> {
    const draft = pumpConfigurationDrafts[pumpId];
    if (!draft) {
      return;
    }
    const normalized = normalizePumpConfigurationDraft(draft);
    if (!normalized) {
      setPumpConfigurationMessages((current) => ({ ...current, [pumpId]: "Enter valid numeric pump configuration values." }));
      return;
    }

    setPumpConfigurationPending((current) => ({ ...current, [pumpId]: true }));
    setPumpConfigurationMessages((current) => ({ ...current, [pumpId]: null }));
    try {
      const response = await updateControllerPumpConfiguration({
        pumpId,
        ...normalized
      });
      setPumpConfigurations((current) => current.map((entry) => entry.pump_id === pumpId ? response.data.pump_configuration : entry));
      setPumpConfigurationMessages((current) => ({ ...current, [pumpId]: "Pump configuration saved." }));
      setPumpConfigurationError(null);
    } catch (error) {
      setPumpConfigurationMessages((current) => ({ ...current, [pumpId]: error instanceof Error ? error.message : "Failed to save pump configuration." }));
    } finally {
      setPumpConfigurationPending((current) => ({ ...current, [pumpId]: false }));
    }
  }

  async function handleChlorinatorOutputSave(): Promise<void> {
    if (!chlorinator) {
      setChlorinatorOutputMessage("No IntelliChlor equipment record is available.");
      return;
    }

    const outputPercent = Number.parseInt(chlorinatorOutputDraft, 10);
    if (Number.isNaN(outputPercent) || outputPercent < 0 || outputPercent > 100) {
      setChlorinatorOutputMessage("Enter an output percent from 0 to 100.");
      return;
    }

    setChlorinatorOutputPending(true);
    setChlorinatorOutputMessage(null);
    try {
      await requestChlorinatorOutput({
        equipmentId: chlorinator.id,
        outputPercent
      });
      setChlorinatorOutputMessage("Output command accepted. Awaiting refreshed IntelliChlor telemetry.");
    } catch (error) {
      setChlorinatorOutputMessage(error instanceof Error ? error.message : "Failed to send IntelliChlor output command.");
    } finally {
      setChlorinatorOutputPending(false);
    }
  }

  async function handlePoolVolumeSave(): Promise<void> {
    const volumeGallons = Number.parseFloat(poolVolumeDraft);
    if (!Number.isFinite(volumeGallons) || volumeGallons <= 0) {
      setPoolVolumeMessage("Enter a positive pool volume in gallons.");
      return;
    }

    setPoolVolumePending(true);
    setPoolVolumeMessage(null);
    try {
      const response = await savePoolProfileSettings({
        volumeGallons
      });
      setPoolProfile(response.data);
      setPoolProfileError(null);
      setPoolVolumeMessage("Pool volume saved.");
    } catch (error) {
      setPoolVolumeMessage(error instanceof Error ? error.message : "Failed to save pool volume.");
    } finally {
      setPoolVolumePending(false);
    }
  }

  const chlorinatorStatus = chlorinator?.latest_state.status;
  const chlorinatorStatusLabel = formatChlorinatorStatus(chlorinatorStatus);
  const chlorinatorStatusTone = getChlorinatorStatusTone(chlorinatorStatus);
  const chlorinatorWarnings = getChlorinatorWarnings(chlorinator);
  const chlorinatorModel = readNullableString(chlorinator?.latest_state.model) ?? "Unknown";
  const chlorinatorAddress = readNullableString(chlorinator?.bus_address) ?? "0x50";
  const chlorinatorLastComm =
    typeof chlorinator?.latest_state.last_comm === "string"
      ? formatRequestTimestamp(chlorinator.latest_state.last_comm)
      : "Unavailable";
  const chlorinatorConfiguredOutputValue = readMetric(
    chlorinator?.latest_state.output_percent
      ?? chlorinator?.latest_state.target_output_percent
  );
  const chlorinatorConfiguredOutput = formatMetric(
    chlorinatorConfiguredOutputValue,
    "%"
  );
  const chlorinatorProductionLbPerDay = readMetric(chlorinator?.latest_state.production_lb_per_day);
  const chlorinatorSuperChlorRemainingSeconds = readMetric(chlorinator?.latest_state.super_chlor_remaining_seconds);
  const controllerWaterTempF = readMetric(controller?.latest_state.water_temp_f);
  const estimateWaterTempF = controllerWaterTempF;
  const estimateCoverState = coverCurrent?.current?.state ?? null;
  const swgSupportEstimate = buildSwgSupportEstimate({
    volumeGallons: poolProfile?.volume_gallons ?? null,
    productionLbPerDay: chlorinatorProductionLbPerDay,
    targetOutputPercent: chlorinatorConfiguredOutputValue,
    waterTempF: estimateWaterTempF,
    coverState: estimateCoverState
  });

  return (
    <section className="mock-system-page">
      <Card title={getHardwareDetailTitle(detail, controller?.display_name, pump?.display_name, chlorinator?.display_name)} className="mock-hardware-hero-card">
        <div className="mock-hardware-hero">
          <div className="mock-hardware-mark">
            <div className="mock-hardware-mark-box">{getHardwareDetailCode(detail)}</div>
            <small>{getHardwareDetailSubtitle(detail)}</small>
          </div>
          <div className="mock-hardware-main">
            <div className="mock-hardware-heading">
              <h2>{getHardwareDetailTitle(detail, controller?.display_name, pump?.display_name, chlorinator?.display_name)}</h2>
              <span className={`system-status-chip ${getStatusChipClassName("good")}`}>
                {getHardwareDetailStatus(detail, pump?.latest_state.running, chlorinator?.latest_state.run_state)}
              </span>
            </div>
            <div className="mock-hardware-info-grid">
              {getHardwareDetailFacts(detail, {
                pump,
                controllerTime: formatControllerTime(controller?.latest_state.controller_hour_24, controller?.latest_state.controller_minute),
                waterTemp: formatMetric(readMetric(controller?.latest_state.water_temp_f), "°F"),
                saltLevel: formatMetric(readMetric(chlorinator?.latest_state.salt_ppm), "ppm"),
                chlorinatorOutput: chlorinatorConfiguredOutput,
                chlorinatorCurrentOutput: chlorinatorConfiguredOutput,
                chlorinatorTargetOutput: chlorinatorConfiguredOutput,
                chlorinatorRunState: formatChlorinatorRunState(chlorinator?.latest_state.run_state),
                chlorinatorStatus: chlorinatorStatusLabel,
                chlorinatorModel,
                chlorinatorAddress,
                chlorinatorLastComm,
                pumpRpm: formatMetric(readMetric(pump?.latest_state.rpm), "RPM"),
                flowRate: formatMetric(readMetric(pump?.latest_state.flow_gpm), "GPM"),
                filterPressure: formatMetric(readMetric(pump?.latest_state.filter_pressure_psi), "psi"),
                filterCondition: formatFilterCondition(pump?.latest_state.filter_condition)
              }).map((fact) => (
                <div key={fact.label}><span>{fact.label}</span><strong>{fact.value}</strong></div>
              ))}
            </div>
          </div>
        </div>
        <NavLink className="page-back-link" to="/system/hardware">Back to System (Hardware)</NavLink>
      </Card>

      {detail === "intellichlor" ? (
        <>
          <section className="mock-kpi-grid">
            <MetricCard label="Configured Output" value={chlorinatorConfiguredOutput} accent="pump" icon="chlorinator" />
            <MetricCard label="Salt Level" value={formatMetric(readMetric(chlorinator?.latest_state.salt_ppm), "ppm")} accent="sand" icon="salt" />
            <MetricCard label="Water Temp" value={formatMetric(controllerWaterTempF, "°F")} accent="water" icon="temperature" />
            <MetricCard label="Connection" value={String(chlorinator?.latest_state.comms_lost) === "true" ? "Lost" : "Online"} accent="sand" icon="system" />
            <MetricCard label="Status" value={chlorinatorStatusLabel} accent="sky" icon="good" />
            <MetricCard label="Model" value={chlorinatorModel} accent="water" icon="system" />
          </section>
          <section className="mock-system-grid">
            <Card title="Runtime Status" status={chlorinatorStatusLabel}>
              <dl className="system-summary-list">
                <div><dt>Model</dt><dd>{chlorinatorModel}</dd></div>
                <div><dt>Status</dt><dd><span className={`system-status-chip ${getStatusChipClassName(chlorinatorStatusTone)}`}>{chlorinatorStatusLabel}</span></dd></div>
                <div><dt>Configured output</dt><dd>{chlorinatorConfiguredOutput}</dd></div>
                <div><dt>Salt ppm</dt><dd>{formatMetric(readMetric(chlorinator?.latest_state.salt_ppm), "ppm")}</dd></div>
                <div><dt>Water temp (controller)</dt><dd>{formatMetric(controllerWaterTempF, "°F")}</dd></div>
                <div><dt>Last communication</dt><dd>{chlorinatorLastComm}</dd></div>
                <div><dt>Comms lost</dt><dd>{String(chlorinator?.latest_state.comms_lost) === "true" ? "Yes" : "No"}</dd></div>
                <div><dt>Address</dt><dd>{chlorinatorAddress}</dd></div>
              </dl>
            </Card>
            <Card title="Output Control" status="Direct control">
              <p className="panel-copy">This writes the current IntelliChlor output target through the existing equipment control path. In observed-only mode, Splash API should reject the request clearly.</p>
              <div className="control-form">
                <label htmlFor="chlorinator-output">Target output percent</label>
                <input
                  id="chlorinator-output"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={chlorinatorOutputDraft}
                  onChange={(event) => setChlorinatorOutputDraft(event.target.value)}
                  disabled={chlorinatorOutputPending || !chlorinator}
                />
                <div className="panel-actions">
                  <button type="button" className="secondary-action" onClick={() => setChlorinatorOutputDraft("0")} disabled={chlorinatorOutputPending || !chlorinator}>
                    Set 0%
                  </button>
                  <button type="button" className="secondary-action" onClick={() => setChlorinatorOutputDraft("50")} disabled={chlorinatorOutputPending || !chlorinator}>
                    Set 50%
                  </button>
                  <button type="button" className="secondary-action" onClick={() => setChlorinatorOutputDraft("100")} disabled={chlorinatorOutputPending || !chlorinator}>
                    Set 100%
                  </button>
                  <button type="button" onClick={() => void handleChlorinatorOutputSave()} disabled={chlorinatorOutputPending || !chlorinator}>
                    {chlorinatorOutputPending ? "Sending..." : "Set chlorinator output"}
                  </button>
                </div>
                {chlorinatorOutputMessage ? <p className="form-caption">{chlorinatorOutputMessage}</p> : null}
              </div>
            </Card>
            <Card title="Pool Volume" status="Prediction input">
              <p className="panel-copy">Pool volume is stored as durable pool-profile configuration and is required for future ppm-normalized SWG support estimates.</p>
              <div className="control-form">
                <label htmlFor="pool-volume-gallons">Pool volume (gallons)</label>
                <input
                  id="pool-volume-gallons"
                  inputMode="decimal"
                  value={poolVolumeDraft}
                  onChange={(event) => setPoolVolumeDraft(event.target.value)}
                  disabled={poolVolumePending}
                />
                <div className="panel-actions">
                  <button type="button" onClick={() => void handlePoolVolumeSave()} disabled={poolVolumePending}>
                    {poolVolumePending ? "Saving..." : "Save pool volume"}
                  </button>
                </div>
                {poolProfileError ? <p className="form-caption">{poolProfileError}</p> : null}
                {poolVolumeMessage ? <p className="form-caption">{poolVolumeMessage}</p> : null}
              </div>
            </Card>
            <Card title="24h Chlorine Support" status="Estimated">
              {swgSupportEstimate ? (
                <>
                  <dl className="system-summary-list">
                    <div><dt>Estimated FC change</dt><dd>{formatEstimatedPpmDelta(swgSupportEstimate.ppm)}</dd></div>
                    <div><dt>Configured output</dt><dd>{chlorinatorConfiguredOutput}</dd></div>
                    <div><dt>Pool volume</dt><dd>{poolProfile?.volume_gallons == null ? "Unavailable" : `${poolProfile.volume_gallons} gal`}</dd></div>
                    <div><dt>Water temp (controller)</dt><dd>{formatMetric(estimateWaterTempF, "°F")}</dd></div>
                    <div><dt>Cover state</dt><dd>{formatCoverStateSummary(estimateCoverState)}</dd></div>
                  </dl>
                  <p className="form-caption">{swgSupportEstimate.summary}</p>
                </>
              ) : (
                <p className="panel-copy">
                  {buildSwgSupportUnavailableMessage({
                    volumeGallons: poolProfile?.volume_gallons ?? null,
                    productionLbPerDay: chlorinatorProductionLbPerDay,
                    targetOutputPercent: chlorinatorConfiguredOutputValue
                  })}
                </p>
              )}
            </Card>
            <Card title="Warnings & Guidance" status={chlorinatorWarnings.length > 0 ? "Operator attention" : "Normal"}>
              {chlorinatorWarnings.length > 0 ? (
                <div className="record-list">
                  {chlorinatorWarnings.map((warning) => (
                    <div className="record-card" key={warning.title}>
                      <strong>{warning.title}</strong>
                      <span>{warning.summary}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="panel-copy">No active IntelliChlor warning conditions are present in the current latest-state snapshot.</p>
              )}
            </Card>
            <Card title="Production & Diagnostics" status="Runtime">
              <dl className="system-summary-list">
                <div><dt>Production rate</dt><dd>{chlorinatorProductionLbPerDay == null ? "Unavailable" : `${chlorinatorProductionLbPerDay.toFixed(2)} lb/day`}</dd></div>
                <div><dt>Production per second</dt><dd>{formatMetric(readMetric(chlorinator?.latest_state.production_lb_per_second), "lb/sec")}</dd></div>
                <div><dt>Status code</dt><dd>{readMetric(chlorinator?.latest_state.status_code) ?? "Unavailable"}</dd></div>
                <div><dt>Super chlorinate remaining</dt><dd>{formatDurationSeconds(chlorinatorSuperChlorRemainingSeconds)}</dd></div>
                <div><dt>Connected</dt><dd>{String(chlorinator?.latest_state.connected) === "true" ? "Yes" : "No"}</dd></div>
                <div><dt>Protocol</dt><dd>{chlorinator?.protocol_name ?? "Unavailable"}</dd></div>
              </dl>
              <p className="form-caption">Direct control, super chlorinate state, and controller-owned configuration remain partially implemented in this slice. This page only exposes fields already carried through the current latest-state projection.</p>
            </Card>
          </section>
        </>
      ) : detail === "easytouch8" ? (
        <>
          <Card title="Circuit Configuration">
            <div className="mock-card-toolbar">
              <p className="panel-copy">Live controller circuit configuration is diagnostic and controller-derived. Refresh to request fresh `0x0b` circuit configuration replies for the known EasyTouch circuit range.</p>
              <button className="secondary-action" type="button" disabled={isRequestingCircuitConfig} onClick={() => void handleCircuitConfigRequest()}>
                {isRequestingCircuitConfig ? "Refreshing circuit config..." : "Refresh circuit configuration"}
              </button>
            </div>
            {circuitConfigRequestMessage ? <p className="form-caption">{circuitConfigRequestMessage}</p> : null}
            <div className="mock-table-shell mock-table-shell-scroll">
              <table className="system-data-table">
                <thead>
                  <tr><th>ID</th><th>Type</th><th>Function</th><th>Function Value</th><th>Name</th><th>Name Value</th><th>Freeze</th><th>State</th><th>Action</th></tr>
                </thead>
                <tbody>
                  {draftRows.map((row) => (
                    <tr key={row.key}>
                      <td>{row.circuitId ?? "Unavailable"}</td>
                      <td>{humanizeCircuitType(row.circuitType)}</td>
                      <td>
                        {row.installed ? (
                          <select
                            className="system-table-select"
                            aria-label={`Circuit function ${row.key}`}
                            value={row.functionLabel}
                            onChange={(event) => {
                              setDraftRows((current) =>
                                current.map((entry) => entry.key === row.key ? { ...entry, functionLabel: event.target.value } : entry)
                              );
                            }}
                          >
                            {row.functionOptions.map((option) => (
                              <option key={`${row.key}-function-${option}`} value={option}>{option}</option>
                            ))}
                          </select>
                        ) : (
                          <span>Unavailable</span>
                        )}
                      </td>
                      <td>{row.installed ? (row.functionValue ?? "Unavailable") : "Unavailable"}</td>
                      <td>
                        {row.installed ? (
                          <select
                            className="system-table-select"
                            aria-label={`Circuit name ${row.key}`}
                            value={row.nameLabel}
                            onChange={(event) => {
                              setDraftRows((current) =>
                                current.map((entry) => entry.key === row.key ? { ...entry, nameLabel: event.target.value } : entry)
                              );
                            }}
                          >
                            {row.nameOptions.map((option) => (
                              <option key={`${row.key}-name-${option}`} value={option}>{option}</option>
                            ))}
                          </select>
                        ) : (
                          <span>Unavailable</span>
                        )}
                      </td>
                      <td>{row.installed ? (row.nameValue ?? "Unavailable") : "Unavailable"}</td>
                      <td>
                        {row.installed ? (
                          <button
                            className={`mock-switch ${row.freezeEnabled ? "mock-switch-on" : ""}`}
                            type="button"
                            role="switch"
                            aria-label={`Freeze ${row.key}`}
                            aria-checked={row.freezeEnabled}
                            onClick={() => {
                              setDraftRows((current) =>
                                current.map((entry) => entry.key === row.key ? { ...entry, freezeEnabled: !entry.freezeEnabled } : entry)
                              );
                            }}
                          >
                            <span />
                          </button>
                        ) : (
                          <span>Unavailable</span>
                        )}
                      </td>
                      <td>
                        {!row.installed ? (
                          "Not installed"
                        ) : row.canToggleState ? (
                          <button
                            className={`mock-switch ${row.stateEnabled ? "mock-switch-on" : ""}`}
                            type="button"
                            role="switch"
                            aria-label={`State ${row.key}`}
                            aria-checked={row.stateEnabled}
                            onClick={() => {
                              setDraftRows((current) =>
                                current.map((entry) => entry.key === row.key ? { ...entry, stateEnabled: !entry.stateEnabled } : entry)
                              );
                            }}
                          >
                            <span />
                          </button>
                        ) : (
                          formatCircuitStatePill(row.state)
                        )}
                      </td>
                      <td>
                        {row.installed ? (
                          <div className="system-table-actions">
                            <button
                              className="system-icon-button"
                              type="button"
                              aria-label={`Save circuit row ${row.key}`}
                              disabled
                            >
                              <SplashIcon name="confirm" size={16} />
                            </button>
                            <button
                              className="system-icon-button system-icon-button-secondary"
                              type="button"
                              aria-label={`Discard circuit row ${row.key}`}
                              disabled
                            >
                              <SplashIcon name="cancel" size={16} />
                            </button>
                          </div>
                        ) : (
                          <span>Unavailable</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Card title="Custom Circuit Names">
            <div className="mock-table-shell mock-table-shell-scroll">
              <table className="system-data-table">
                <thead>
                  <tr><th>Index</th><th>Value</th><th>Action</th></tr>
                </thead>
                <tbody>
                  {getCustomNameRows(controller).map((entry) => (
                    <tr key={`custom-name-${entry.index}`}>
                      <td>{entry.index}</td>
                      <td>
                        <input
                          className="system-table-input"
                          type="text"
                          value={entry.value}
                          readOnly
                          aria-label={`Custom name value ${entry.index}`}
                        />
                      </td>
                      <td>
                        <div className="system-table-actions">
                          <button
                            className="system-icon-button"
                            type="button"
                            aria-label={`Save custom name row ${entry.index}`}
                            disabled
                          >
                            <SplashIcon name="confirm" size={16} />
                          </button>
                          <button
                            className="system-icon-button system-icon-button-secondary"
                            type="button"
                            aria-label={`Discard custom name row ${entry.index}`}
                            disabled
                          >
                            <SplashIcon name="cancel" size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Card title="Main Controller" status="Read-only">
            <dl className="system-summary-list">
              <div><dt>Controller date</dt><dd>{formatControllerDate(controllerClock)}</dd></div>
              <div><dt>Controller time</dt><dd>{formatControllerClockTime(controllerClock)}</dd></div>
              <div><dt>DST mode</dt><dd>{formatControllerDstMode(controllerClock)}</dd></div>
              <div><dt>Clock advance</dt><dd>{formatControllerClockAdvance(controllerClock)}</dd></div>
            </dl>
            <p className="form-caption">
              {controllerClock?.summary.source === "controller_datetime_reply"
                ? "Values currently come from provisional 0x05 controller date/time reply data."
                : "Values are read-only on this summary card."}
            </p>
            {controllerClockError ? <p className="form-caption">{controllerClockError}</p> : null}
          </Card>
          <Card title="Date / Time / DST / Clock Adjust" status="Provisional">
            <p className="panel-copy">Save uses the current provisional EasyTouch clock write path. DST and clock advance remain fail-closed until their payload semantics are live-validated.</p>
            <div className="control-form">
              <label htmlFor="controller-clock-month">Month</label>
              <input id="controller-clock-month" inputMode="numeric" value={controllerClockDraft.month} onChange={(event) => setControllerClockDraft((current) => ({ ...current, month: event.target.value }))} disabled={controllerClockPending} />
              <label htmlFor="controller-clock-day">Day</label>
              <input id="controller-clock-day" inputMode="numeric" value={controllerClockDraft.day} onChange={(event) => setControllerClockDraft((current) => ({ ...current, day: event.target.value }))} disabled={controllerClockPending} />
              <label htmlFor="controller-clock-year">Year</label>
              <input id="controller-clock-year" inputMode="numeric" value={controllerClockDraft.year} onChange={(event) => setControllerClockDraft((current) => ({ ...current, year: event.target.value }))} disabled={controllerClockPending} />
              <label htmlFor="controller-clock-dow">Day of week</label>
              <input id="controller-clock-dow" inputMode="numeric" value={controllerClockDraft.dayOfWeek} onChange={(event) => setControllerClockDraft((current) => ({ ...current, dayOfWeek: event.target.value }))} disabled={controllerClockPending} />
              <label htmlFor="controller-clock-hour">Hour (24h)</label>
              <input id="controller-clock-hour" inputMode="numeric" value={controllerClockDraft.hour24} onChange={(event) => setControllerClockDraft((current) => ({ ...current, hour24: event.target.value }))} disabled={controllerClockPending} />
              <label htmlFor="controller-clock-minute">Minute</label>
              <input id="controller-clock-minute" inputMode="numeric" value={controllerClockDraft.minute} onChange={(event) => setControllerClockDraft((current) => ({ ...current, minute: event.target.value }))} disabled={controllerClockPending} />
              <label htmlFor="controller-clock-dst">DST mode</label>
              <select id="controller-clock-dst" value={controllerClockDraft.daylightSavingsAuto} onChange={(event) => setControllerClockDraft((current) => ({ ...current, daylightSavingsAuto: event.target.value }))} disabled={controllerClockPending}>
                <option value="auto">Auto</option>
                <option value="manual">Manual</option>
              </select>
              <label htmlFor="controller-clock-advance">Clock advance</label>
              <input id="controller-clock-advance" inputMode="numeric" value={controllerClockDraft.clockAdvance} onChange={(event) => setControllerClockDraft((current) => ({ ...current, clockAdvance: event.target.value }))} disabled={controllerClockPending} />
              <div className="panel-actions">
                <button type="button" className="secondary-action" onClick={() => void handleControllerClockRefresh()} disabled={controllerClockRefreshPending}>
                  {controllerClockRefreshPending ? "Refreshing..." : "Refresh controller clock"}
                </button>
                <button type="button" onClick={() => void handleControllerClockSave()} disabled={controllerClockPending}>
                  {controllerClockPending ? "Saving..." : "Save controller clock configuration"}
                </button>
              </div>
              {controllerClockMessage ? <p className="form-caption">{controllerClockMessage}</p> : null}
            </div>
          </Card>
          <Card title="Pump Configuration" status="Live installed pumps">
            <div className="mock-card-toolbar">
              <p className="panel-copy">Only pumps currently reported as installed by live EasyTouch pump-info reads are shown here. Branch-specific VF and VSF semantics remain partially decoded.</p>
              <button className="secondary-action" type="button" onClick={() => void handlePumpConfigurationRefresh()} disabled={pumpConfigurationRefreshPending}>
                {pumpConfigurationRefreshPending ? "Refreshing..." : "Refresh pump configuration"}
              </button>
            </div>
            {pumpConfigurationError ? <p className="form-caption">{pumpConfigurationError}</p> : null}
            {pumpConfigurations.length === 0 ? (
              <p className="empty-state">No installed pump configuration has been observed yet.</p>
            ) : (
              <div className="mock-control-grid">
                {pumpConfigurations.map((pumpConfiguration) => {
                  const draft = pumpConfigurationDrafts[pumpConfiguration.pump_id];
                  const pending = pumpConfigurationPending[pumpConfiguration.pump_id] === true;
                  return (
                    <section className="control-panel control-panel-stack" key={`pump-config-${pumpConfiguration.pump_id}`}>
                      <div>
                        <p className="panel-kicker">{`Pump #${pumpConfiguration.pump_id}`}</p>
                        <h2>{pumpConfiguration.pump_type_label ?? "Unknown pump type"}</h2>
                        <p className="panel-copy">
                          {pumpConfiguration.supported_branch === "vf"
                            ? "VF branch is shown from known decoded bytes; advanced VF-specific semantics remain partially mapped."
                            : pumpConfiguration.supported_branch === "vs"
                              ? "VS/variable-speed branch is editable from the currently decoded EasyTouch payload."
                              : "Pump branch is only partially decoded; unsupported semantics remain unavailable."}
                        </p>
                      </div>
                      {draft ? (
                        <div className="control-form">
                          <label>{`Pump type (${pumpConfiguration.pump_type_label ?? "Unknown"})`}</label>
                          <input inputMode="numeric" value={draft.pumpType} onChange={(event) => setPumpConfigurationDrafts((current) => ({ ...current, [pumpConfiguration.pump_id]: { ...draft, pumpType: event.target.value } }))} disabled={pending} />
                          <label>Priming time</label>
                          <input inputMode="numeric" value={draft.primingTime} onChange={(event) => setPumpConfigurationDrafts((current) => ({ ...current, [pumpConfiguration.pump_id]: { ...draft, primingTime: event.target.value } }))} disabled={pending} />
                          <label>Unknown byte 3</label>
                          <input inputMode="numeric" value={draft.unknown3} onChange={(event) => setPumpConfigurationDrafts((current) => ({ ...current, [pumpConfiguration.pump_id]: { ...draft, unknown3: event.target.value } }))} disabled={pending} />
                          <label>Unknown byte 4</label>
                          <input inputMode="numeric" value={draft.unknown4} onChange={(event) => setPumpConfigurationDrafts((current) => ({ ...current, [pumpConfiguration.pump_id]: { ...draft, unknown4: event.target.value } }))} disabled={pending} />
                          <label>Priming speed</label>
                          <input inputMode="numeric" value={draft.primingSpeed} onChange={(event) => setPumpConfigurationDrafts((current) => ({ ...current, [pumpConfiguration.pump_id]: { ...draft, primingSpeed: event.target.value } }))} disabled={pending} />
                          <div className="mock-table-shell mock-table-shell-scroll">
                            <table className="system-data-table">
                              <thead>
                                <tr><th>Slot</th><th>Circuit</th><th>RPM</th></tr>
                              </thead>
                              <tbody>
                                {draft.slots.map((slot, index) => (
                                  <tr key={`pump-${pumpConfiguration.pump_id}-slot-${slot.slot}`}>
                                    <td>{slot.slot}</td>
                                    <td><input inputMode="numeric" value={slot.circuitAssignment} onChange={(event) => setPumpConfigurationDrafts((current) => ({ ...current, [pumpConfiguration.pump_id]: { ...draft, slots: draft.slots.map((entry, entryIndex) => entryIndex === index ? { ...entry, circuitAssignment: event.target.value } : entry) } }))} disabled={pending} /></td>
                                    <td><input inputMode="numeric" value={slot.rpm} onChange={(event) => setPumpConfigurationDrafts((current) => ({ ...current, [pumpConfiguration.pump_id]: { ...draft, slots: draft.slots.map((entry, entryIndex) => entryIndex === index ? { ...entry, rpm: event.target.value } : entry) } }))} disabled={pending} /></td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <button type="button" onClick={() => void handlePumpConfigurationSave(pumpConfiguration.pump_id)} disabled={pending}>
                            {pending ? "Saving..." : `Save pump #${pumpConfiguration.pump_id} configuration`}
                          </button>
                          {pumpConfigurationMessages[pumpConfiguration.pump_id] ? <p className="form-caption">{pumpConfigurationMessages[pumpConfiguration.pump_id]}</p> : null}
                        </div>
                      ) : null}
                    </section>
                  );
                })}
              </div>
            )}
          </Card>
          <Card title="Heater Configuration & Control" status="EasyTouch-owned">
            <p className="panel-copy">These controls send EasyTouch-owned heater configuration and heat-setting requests. Direct UltraTemp ownership remains out of scope.</p>
            {heaterError ? <p className="form-caption">{heaterError}</p> : null}
            <div className="mock-control-grid">
              <section className="control-panel control-panel-stack">
                <div>
                  <p className="panel-kicker">Configuration</p>
                  <h2>{formatHeaterTypeLabel(heater?.configuration.detected_heater_type)}</h2>
                  <dl className="detail-grid detail-grid-compact">
                    <div><dt>Heat pump enabled</dt><dd>{formatBoolean(heater?.configuration.solar_or_heat_pump_enabled)}</dd></div>
                    <div><dt>Heating enabled</dt><dd>{formatBoolean(heater?.configuration.heating_enabled)}</dd></div>
                    <div><dt>Cooling enabled</dt><dd>{formatBoolean(heater?.configuration.cooling_enabled)}</dd></div>
                    <div><dt>Freeze protection</dt><dd>{formatBoolean(heater?.configuration.freeze_protection_enabled)}</dd></div>
                  </dl>
                </div>
                <div className="control-form">
                  <label htmlFor="heater-type">Heater type</label>
                  <select id="heater-type" value={heaterConfigDraft.heaterType} onChange={(event) => setHeaterConfigDraft((current) => ({ ...current, heaterType: event.target.value as "ultratempHeatPumpCom" | "ultratempEtiHybrid" }))} disabled={heaterConfigPending}>
                    <option value="ultratempHeatPumpCom">UltraTemp Heat Pump Com</option>
                    <option value="ultratempEtiHybrid">UltraTemp ETi Hybrid</option>
                  </select>
                  <label className="system-inline-checkbox"><input type="checkbox" checked={heaterConfigDraft.coolingEnabled} onChange={(event) => setHeaterConfigDraft((current) => ({ ...current, coolingEnabled: event.target.checked }))} disabled={heaterConfigPending} />Cooling enabled</label>
                  <label className="system-inline-checkbox"><input type="checkbox" checked={heaterConfigDraft.freezeProtectionEnabled} onChange={(event) => setHeaterConfigDraft((current) => ({ ...current, freezeProtectionEnabled: event.target.checked }))} disabled={heaterConfigPending} />Freeze protection enabled</label>
                  <button type="button" onClick={() => void handleHeaterConfigurationSave()} disabled={heaterConfigPending}>{heaterConfigPending ? "Saving..." : "Save configuration"}</button>
                  {heaterConfigMessage ? <p className="form-caption">{heaterConfigMessage}</p> : null}
                </div>
              </section>
              <section className="control-panel control-panel-stack">
                <div>
                  <p className="panel-kicker">Heat Settings</p>
                  <h2>Controller heat modes</h2>
                  <dl className="detail-grid detail-grid-compact">
                    <div><dt>Pool mode</dt><dd>{formatLabel(heater?.settings.pool_heat_mode)}</dd></div>
                    <div><dt>Spa mode</dt><dd>{formatLabel(heater?.settings.spa_heat_mode)}</dd></div>
                    <div><dt>Pool setpoint</dt><dd>{formatMetric(heater?.settings.pool_setpoint ?? null, "°F")}</dd></div>
                    <div><dt>Spa setpoint</dt><dd>{formatMetric(heater?.settings.spa_setpoint ?? null, "°F")}</dd></div>
                  </dl>
                </div>
                <div className="control-form">
                  <label htmlFor="pool-setpoint">Pool setpoint</label>
                  <input id="pool-setpoint" inputMode="numeric" value={heaterSettingsDraft.poolSetpoint} onChange={(event) => setHeaterSettingsDraft((current) => ({ ...current, poolSetpoint: event.target.value }))} disabled={heaterSettingsPending} />
                  <label htmlFor="spa-setpoint">Spa setpoint</label>
                  <input id="spa-setpoint" inputMode="numeric" value={heaterSettingsDraft.spaSetpoint} onChange={(event) => setHeaterSettingsDraft((current) => ({ ...current, spaSetpoint: event.target.value }))} disabled={heaterSettingsPending} />
                  <label htmlFor="pool-heat-mode">Pool heat mode</label>
                  <select id="pool-heat-mode" value={heaterSettingsDraft.poolHeatMode} onChange={(event) => setHeaterSettingsDraft((current) => ({ ...current, poolHeatMode: event.target.value }))} disabled={heaterSettingsPending}>
                    {HEAT_MODE_OPTIONS.map((option) => <option key={`pool-${option.value}`} value={option.value}>{option.label}</option>)}
                  </select>
                  <label htmlFor="spa-heat-mode">Spa heat mode</label>
                  <select id="spa-heat-mode" value={heaterSettingsDraft.spaHeatMode} onChange={(event) => setHeaterSettingsDraft((current) => ({ ...current, spaHeatMode: event.target.value }))} disabled={heaterSettingsPending}>
                    {HEAT_MODE_OPTIONS.map((option) => <option key={`spa-${option.value}`} value={option.value}>{option.label}</option>)}
                  </select>
                  <label htmlFor="cool-setpoint">Cool setpoint</label>
                  <input id="cool-setpoint" inputMode="numeric" value={heaterSettingsDraft.coolSetpoint} onChange={(event) => setHeaterSettingsDraft((current) => ({ ...current, coolSetpoint: event.target.value }))} disabled={heaterSettingsPending} />
                  <button type="button" onClick={() => void handleHeaterSettingsSave()} disabled={heaterSettingsPending}>{heaterSettingsPending ? "Saving..." : "Save heat settings"}</button>
                  {heaterSettingsMessage ? <p className="form-caption">{heaterSettingsMessage}</p> : null}
                  <p className="form-caption">Setpoints may reflect the latest confirmed write cache when the controller does not expose a dedicated live setpoint read.</p>
                </div>
              </section>
            </div>
          </Card>
        </>
      ) : null}
    </section>
  );
}

function SensorsTab({ controller, pump, chlorinator }: SystemPageProps) {
  return (
    <section className="mock-system-page">
      <Card title="Sensors">
        <p className="panel-copy">The Sensors tab is read-only and concentrates current readings, health, and freshness for inputs that drive automation and operator decisions.</p>
      </Card>
      <section className="mock-kpi-grid">
        <MetricCard label="Water Temperature" value={formatMetric(readMetric(controller?.latest_state.water_temp_f), "°F")} accent="water" icon="temperature" />
        <MetricCard label="Air Temperature" value={formatMetric(readMetric(controller?.latest_state.air_temp_f), "°F")} accent="sky" icon="air-temperature" />
        <MetricCard label="Salt Level" value={formatMetric(readMetric(chlorinator?.latest_state.salt_ppm), "ppm")} accent="sand" icon="salt" />
        <MetricCard label="SWG Output" value={formatMetric(readMetric(chlorinator?.latest_state.current_output_percent ?? chlorinator?.latest_state.output_percent), "%")} accent="pump" icon="chlorinator" />
        <MetricCard label="SWG State" value={formatChlorinatorRunState(chlorinator?.latest_state.run_state)} accent="sand" icon="good" />
        <MetricCard label="Flow Rate" value={formatMetric(readMetric(pump?.latest_state.flow_gpm), "GPM")} accent="pump" icon="pump" />
        <MetricCard label="Filter Pressure" value={formatMetric(readMetric(pump?.latest_state.filter_pressure_psi), "psi")} accent="water" icon="system" />
        <MetricCard label="Filter Condition" value={formatFilterCondition(pump?.latest_state.filter_condition)} accent="sand" icon="diagnostics" />
      </section>
      <Card title="Sensor Readings" status="Current values">
        <table className="system-data-table">
          <thead><tr><th>Sensor</th><th>Type</th><th>Location</th><th>Current value</th><th>Status</th></tr></thead>
          <tbody>
            <tr><td>Pool Temp</td><td>Temperature</td><td>Pool</td><td>{formatMetric(readMetric(controller?.latest_state.water_temp_f), "°F")}</td><td><span className="system-status-chip system-status-chip-good">Good</span></td></tr>
            <tr><td>Air Temp</td><td>Temperature</td><td>Pad</td><td>{formatMetric(readMetric(controller?.latest_state.air_temp_f), "°F")}</td><td><span className="system-status-chip system-status-chip-good">Good</span></td></tr>
            <tr><td>Salt Reading</td><td>Chemistry</td><td>Cell</td><td>{formatMetric(readMetric(chlorinator?.latest_state.salt_ppm), "ppm")}</td><td><span className="system-status-chip system-status-chip-watch">Watch</span></td></tr>
            <tr><td>Current SWG Output</td><td>Chlorinator</td><td>Cell</td><td>{formatMetric(readMetric(chlorinator?.latest_state.current_output_percent ?? chlorinator?.latest_state.output_percent), "%")}</td><td><span className="system-status-chip system-status-chip-good">Current</span></td></tr>
            <tr><td>Target SWG Output</td><td>Chlorinator</td><td>Cell</td><td>{formatMetric(readMetric(chlorinator?.latest_state.target_output_percent ?? chlorinator?.latest_state.output_percent), "%")}</td><td><span className="system-status-chip system-status-chip-good">Target</span></td></tr>
            <tr><td>SWG Run State</td><td>Chlorinator</td><td>Cell</td><td>{formatChlorinatorRunState(chlorinator?.latest_state.run_state)}</td><td><span className="system-status-chip system-status-chip-good">{formatChlorinatorStatus(chlorinator?.latest_state.status)}</span></td></tr>
            <tr><td>SWG Model</td><td>Chlorinator</td><td>Cell</td><td>{readNullableString(chlorinator?.latest_state.model) ?? "Unknown"}</td><td><span className="system-status-chip system-status-chip-muted">Detected</span></td></tr>
            <tr><td>SWG Water Temp</td><td>Temperature</td><td>Cell</td><td>{formatMetric(readMetric(chlorinator?.latest_state.water_temp_f), "°F")}</td><td><span className="system-status-chip system-status-chip-good">Current</span></td></tr>
            <tr><td>SWG Last Comm</td><td>Connectivity</td><td>Cell</td><td>{typeof chlorinator?.latest_state.last_comm === "string" ? formatRequestTimestamp(chlorinator.latest_state.last_comm) : "--"}</td><td><span className={`system-status-chip ${String(chlorinator?.latest_state.comms_lost) === "true" ? "system-status-chip-watch" : "system-status-chip-good"}`}>{String(chlorinator?.latest_state.comms_lost) === "true" ? "Lost" : "Online"}</span></td></tr>
            <tr><td>Flow Rate</td><td>Hydraulics</td><td>Pump</td><td>{formatMetric(readMetric(pump?.latest_state.flow_gpm), "GPM")}</td><td><span className="system-status-chip system-status-chip-good">Current</span></td></tr>
            <tr><td>Filter Pressure</td><td>Hydraulics</td><td>Filter</td><td>{formatMetric(readMetric(pump?.latest_state.filter_pressure_psi), "psi")}</td><td><span className="system-status-chip system-status-chip-good">{formatFilterCondition(pump?.latest_state.filter_condition)}</span></td></tr>
          </tbody>
        </table>
      </Card>
    </section>
  );
}

function ControlTab(props: SystemPageProps) {
  const { pump, controllerMode, pendingCommand, circuitKeyInput, setCircuitKeyInput, rpmInput, setRpmInput, handlePumpSubmit, controllerCircuitStates, isRequestingCircuitConfig, handleCircuitConfigRequest, circuitConfigRequestMessage, pendingCircuitToggle, handleCircuitToggle } = props;

  return (
    <section className="mock-system-page">
      <Card title="Live Control">
        <p className="panel-copy">The Control tab concentrates real-time actions for circuits, modes, pump speed, and controller-initiated commands. It is intentionally execution-focused.</p>
      </Card>
      <section className="mock-control-grid">
        <section className="control-panel control-panel-stack">
          <div>
            <p className="panel-kicker">Pump control</p>
            <h2>{pump?.display_name ?? "Main Pump"}</h2>
            <p className="panel-copy">Adjust the variable-speed pump without leaving the System workspace.</p>
            <dl className="detail-grid detail-grid-compact">
              <div><dt>Current RPM</dt><dd>{formatMetric(readMetric(pump?.latest_state.rpm), "RPM")}</dd></div>
              <div><dt>Running</dt><dd>{formatBoolean(pump?.latest_state.running)}</dd></div>
              <div><dt>Bus address</dt><dd>{readNullableString(pump?.bus_address) ?? "Unavailable"}</dd></div>
            </dl>
          </div>
          <form className="control-form" onSubmit={(event) => void handlePumpSubmit(event)}>
            <label htmlFor="pump-circuit">Controller circuit</label>
            <select id="pump-circuit" value={circuitKeyInput} onChange={(event) => setCircuitKeyInput(event.target.value)} disabled={pendingCommand || !pump}>
              {(pump?.control_circuit_keys ?? []).map((circuitKey) => <option key={circuitKey} value={circuitKey}>{formatCircuitKey(circuitKey)}</option>)}
            </select>
            <label htmlFor="pump-rpm">Requested RPM</label>
            <input id="pump-rpm" inputMode="numeric" pattern="[0-9]*" value={rpmInput} onChange={(event) => setRpmInput(event.target.value)} disabled={pendingCommand || !pump} />
            <button type="submit" disabled={pendingCommand || !pump}>{pendingCommand ? "Waiting for command result..." : "Set pump speed"}</button>
            <p className="form-caption">Pump speed changes remain disabled while the prior command is unresolved.</p>
          </form>
        </section>
        <Card title="Modes" status="Immediate transitions">
          <div className="mock-mode-list">
            <MockModeRow title="Pool Mode" summary="Default circulation and heating behavior" active={controllerMode === "pool" || controllerMode === "pool_spa"} />
            <MockModeRow title="Spa Mode" summary="Valves, heat, and pump target change together" active={controllerMode === "spa"} />
            <MockModeRow title="Night Swim" summary="Lights on, heater enabled, pump quiet profile" active={false} />
          </div>
        </Card>
      </section>
      <Card title="Controller Circuits" status="Direct control">
        <div className="mock-card-toolbar">
          <p className="panel-copy">Known EasyTouch circuits show live controller state. Unmapped states remain unavailable rather than being implied off.</p>
          <button className="secondary-action" type="button" disabled={isRequestingCircuitConfig} onClick={() => void handleCircuitConfigRequest()}>
            {isRequestingCircuitConfig ? "Requesting circuit config..." : "Request controller circuit config"}
          </button>
        </div>
        {circuitConfigRequestMessage ? <p className="form-caption">{circuitConfigRequestMessage}</p> : null}
        <div className="circuit-list" role="list" aria-label="known controller circuits">
          {controllerCircuitStates.length === 0 ? (
            <p className="empty-state">No controller circuit state available yet.</p>
          ) : (
            controllerCircuitStates.map((entry) => (
              <div className="circuit-row" key={entry.circuit.key} role="listitem">
                <div className="circuit-row-main">
                  <div className="circuit-icon"><SplashIcon name={resolveCircuitIconName(entry.circuit)} size={18} /></div>
                  <strong>{entry.circuit.nameLabel ?? entry.circuit.defaultName}</strong>
                  <dl className="circuit-details">
                    <div><dt>Write ID</dt><dd>{entry.circuit.circuitId ?? "Unavailable"}</dd></div>
                    <div><dt>Config Index</dt><dd>{entry.circuit.configurationCircuitId ?? "Unavailable"}</dd></div>
                    <div><dt>Function</dt><dd>{formatValueWithLabel(entry.circuit.functionValue, entry.circuit.functionLabel)}</dd></div>
                    <div><dt>Name</dt><dd>{formatValueWithLabel(entry.circuit.nameValue, entry.circuit.nameLabel)}</dd></div>
                  </dl>
                </div>
                {entry.circuit.writable && entry.state !== null ? (
                  <button className={`circuit-state-pill circuit-state-button ${getCircuitStateClassName(entry.state)}`} type="button" disabled={pendingCircuitToggle !== null} onClick={() => void handleCircuitToggle(entry.circuit, entry.state)}>
                    {pendingCircuitToggle?.circuitKey === entry.circuit.key ? "Pending..." : formatCircuitStatePill(entry.state)}
                  </button>
                ) : (
                  <span className={`circuit-state-pill ${getCircuitStateClassName(entry.state)}`}>{formatCircuitStatePill(entry.state)}</span>
                )}
              </div>
            ))
          )}
        </div>
      </Card>
    </section>
  );
}

function ConnectivityTab({ controller, pump, chlorinator, healthData, connectivityHistory, isRequestingControllerDatetime, handleControllerDatetimeRequest, isSyncingControllerDatetime, handleControllerDatetimeSync, controllerDatetimeMessage }: SystemPageProps) {
  const rs485Rates = healthData?.connectivity?.rs485;
  const natsBrokerRates = healthData?.connectivity?.nats_broker;
  return (
    <section className="mock-system-page">
      <section className="mock-kpi-grid">
        <MetricCard label="RS485 Messages In" value={formatRatePerMinute(rs485Rates?.rx_messages_per_second)} accent="sky" icon="system" />
        <MetricCard label="RS485 Messages Out" value={formatRatePerMinute(rs485Rates?.tx_messages_per_second)} accent="water" icon="system" />
        <MetricCard label="NATS Subscriptions" value={formatCountValue(natsBrokerRates?.subscriptions)} accent="sand" icon="diagnostics" />
        <MetricCard label="NATS In Messages" value={formatRatePerMinute(natsBrokerRates?.in_messages_per_second)} accent="sky" icon="diagnostics" />
        <MetricCard label="NATS Out Messages" value={formatRatePerMinute(natsBrokerRates?.out_messages_per_second)} accent="pump" icon="diagnostics" />
      </section>
      <Card title="Message Activity" status="10-second intervals">
        <p className="panel-copy">The chart shows 10-second message buckets derived from the latest API RS485 and NATS rate samples.</p>
        <MetricTrendChart samples={connectivityHistory} />
      </Card>
      <section className="mock-connectivity-grid">
        <Card title="Controller Status" status="Connectivity">
          <dl className="system-summary-list">
            <div><dt>Mode byte</dt><dd>{formatHexByte(controller?.latest_state.controller_mode_byte)}</dd></div>
            <div><dt>Decoded label</dt><dd>{formatLabel(controller?.latest_state.controller_mode_label)}</dd></div>
            <div><dt>Controller date/time</dt><dd>{formatControllerDatetimeReply(controller?.latest_state.controller_datetime_reply)}</dd></div>
          </dl>
          <div className="panel-actions">
            <button className="secondary-action" type="button" disabled={isRequestingControllerDatetime} onClick={() => void handleControllerDatetimeRequest()}>
              {isRequestingControllerDatetime ? "Requesting controller date/time..." : "Request controller date/time"}
            </button>
            <button className="secondary-action" type="button" disabled={isSyncingControllerDatetime} onClick={() => void handleControllerDatetimeSync()}>
              {isSyncingControllerDatetime ? "Syncing controller date/time..." : "Sync controller date/time"}
            </button>
          </div>
          <p className="form-caption">Controller date/time actions are provisional until the EasyTouch command family is live-validated.</p>
          {controllerDatetimeMessage ? <p className="form-caption">{controllerDatetimeMessage}</p> : null}
        </Card>
        <Card title="RS485 Bus Health">
          <dl className="system-summary-list">
            <div><dt>Adapter</dt><dd>/dev/ttyUSB0</dd></div>
            <div><dt>Baud Rate</dt><dd>9600</dd></div>
            <div><dt>Last frame received</dt><dd>1s ago</dd></div>
            <div><dt>Checksum Errors (1h)</dt><dd>0</dd></div>
          </dl>
        </Card>
        <Card title="Device Status" className="mock-card-span-2">
          <table className="system-data-table">
            <thead>
              <tr>
                <th>Device</th>
                <th>Address</th>
                <th>Last seen</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>{controller?.display_name ?? "EasyTouch 8"}</td><td>0x10</td><td>1s ago</td><td><span className="system-status-chip system-status-chip-good">Online</span></td></tr>
              <tr><td>{pump?.display_name ?? "IntelliFlo"}</td><td>{readNullableString(pump?.bus_address) ?? "0x60"}</td><td>2s ago</td><td><span className="system-status-chip system-status-chip-good">Online</span></td></tr>
              <tr><td>{chlorinator?.display_name ?? "IntelliChlor"}</td><td>{readNullableString(chlorinator?.bus_address) ?? "0x50"}</td><td>{typeof chlorinator?.latest_state.last_comm === "string" ? formatRequestTimestamp(chlorinator.latest_state.last_comm) : "3s ago"}</td><td><span className={`system-status-chip ${String(chlorinator?.latest_state.comms_lost) === "true" ? "system-status-chip-watch" : "system-status-chip-good"}`}>{String(chlorinator?.latest_state.comms_lost) === "true" ? "Lost" : "Online"}</span></td></tr>
            </tbody>
          </table>
        </Card>
        <Card title="Platform Service Bus">
          <div className="record-list">
            <div className="record-card"><strong>Splash API</strong><span>Online · 18 ms</span></div>
            <div className="record-card"><strong>Event Stream</strong><span>Active · Live</span></div>
            <div className="record-card"><strong>Database</strong><span>Connected · 4s ago</span></div>
          </div>
        </Card>
        <Card title="Network Overview">
          <dl className="system-summary-list">
            <div><dt>LAN IP</dt><dd>10.0.10.42</dd></div>
            <div><dt>Gateway</dt><dd>10.0.10.1</dd></div>
            <div><dt>DNS</dt><dd>Healthy</dd></div>
            <div><dt>Internet</dt><dd>Reachable</dd></div>
          </dl>
        </Card>
      </section>
    </section>
  );
}

function PlatformTab({ healthStatus, sseStatus, controller, healthData }: SystemPageProps) {
  const serviceRows = healthData?.services ?? [];

  return (
    <section className="mock-system-page">
      <Card title="Platform">
        <p className="panel-copy">The Platform tab shows live health for all platform services tracked by Splash API, including Splash-owned services and operational third-party dependencies.</p>
      </Card>
      <section className="mock-platform-grid">
        <Card title="Services" status="Runtime" className="mock-card-span-2">
          <div className="record-list">
            {serviceRows.map((service) => (
              <div className="record-card" key={service.name}>
                <strong>{formatPlatformServiceName(service.name)}</strong>
                <span>{formatPlatformServiceRole(service)}</span>
                <span>{formatPlatformServiceSummary(service)}</span>
                <span>{service.message}</span>
                <span className={`system-status-chip ${getPlatformServiceStatusClassName(service.status)}`}>
                  {formatPlatformServiceStatus(service.status)}
                </span>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Platform Health" status="Operations">
          <dl className="system-summary-list">
            <div><dt>Shell uptime</dt><dd>14d 6h</dd></div>
            <div><dt>Event stream</dt><dd>{sseStatus === "connected" ? "Connected" : "Connecting"}</dd></div>
            <div><dt>Last controller time</dt><dd>{formatControllerTime(controller?.latest_state.controller_hour_24, controller?.latest_state.controller_minute)}</dd></div>
            <div><dt>Platform status</dt><dd>{formatPlatformServiceStatus(healthStatus)}</dd></div>
          </dl>
        </Card>
      </section>
    </section>
  );
}

function getHardwareRows(controller: EquipmentRecord | undefined, pump: EquipmentRecord | undefined, chlorinator: EquipmentRecord | undefined) {
  const chlorinatorOutput = formatMetric(readMetric(chlorinator?.latest_state.output_percent), "%");
  const chlorinatorSalt = formatMetric(readMetric(chlorinator?.latest_state.salt_ppm), "ppm");
  const chlorinatorRunState = formatChlorinatorRunState(chlorinator?.latest_state.run_state);
  const flowRate = formatMetric(readMetric(pump?.latest_state.flow_gpm), "GPM");
  const filterCondition = formatFilterCondition(pump?.latest_state.filter_condition);

  return [
    {
      id: "easytouch8" as const,
      shortCode: "CTL",
      title: controller?.display_name ?? "EasyTouch 8 Controller",
      summary: "Pool automation controller · RS485",
      status: "Online"
    },
    {
      id: "intelliflo" as const,
      shortCode: "PMP",
      title: pump?.display_name ?? "IntelliFlo Pump",
      summary: `${flowRate} · ${formatMetric(readMetric(pump?.latest_state.rpm), "RPM")} · ${filterCondition}`,
      status: typeof pump?.latest_state.running === "boolean" && pump.latest_state.running ? "Running" : "Idle"
    },
    {
      id: "ultratemp" as const,
      shortCode: "HTR",
      title: "Pool Heater",
      summary: `Setpoint ${formatMetric(readMetric(controller?.latest_state.water_temp_f), "°F")}`,
      status: readMetric(controller?.latest_state.water_temp_f) != null ? "Heating" : "Idle"
    },
    {
      id: "intellichlor" as const,
      shortCode: "CL",
      title: chlorinator?.display_name ?? "Salt Chlorinator",
      summary: `${chlorinatorOutput} · salt ${chlorinatorSalt}`,
      status: chlorinatorRunState
    }
  ];
}

function getCustomNameRows(controller: EquipmentRecord | undefined): Array<{ index: number; value: string }> {
  const latestState = controller?.latest_state;
  const customNameBankRaw =
    latestState && typeof latestState === "object" && !Array.isArray(latestState)
      ? (latestState as Record<string, unknown>).custom_name_bank
      : null;
  const customNameBank =
    customNameBankRaw && typeof customNameBankRaw === "object" && !Array.isArray(customNameBankRaw)
      ? (customNameBankRaw as Record<string, unknown>)
      : {};

  return Array.from({ length: 10 }, (_, index) => {
    const entry = customNameBank[String(index)];
    const value =
      entry && typeof entry === "object" && !Array.isArray(entry)
        ? typeof (entry as Record<string, unknown>).custom_name_text === "string"
          ? ((entry as Record<string, unknown>).custom_name_text as string)
          : ""
        : "";

    return {
      index,
      value
    };
  });
}

interface EditableCircuitConfigRow {
  key: string;
  circuitId: number | null;
  circuitType: string;
  installed: boolean;
  nameLabel: string;
  nameValue: number | null;
  nameOptions: string[];
  functionLabel: string;
  functionValue: number | null;
  functionOptions: string[];
  freezeEnabled: boolean;
  canToggleState: boolean;
  stateEnabled: boolean;
  state: boolean | null;
}

interface PumpConfigurationDraftSlot {
  slot: number;
  circuitAssignment: string;
  rpm: string;
}

interface PumpConfigurationDraft {
  pumpType: string;
  primingTime: string;
  unknown3: string;
  unknown4: string;
  primingSpeed: string;
  slots: PumpConfigurationDraftSlot[];
  trailingBytes: number[];
}

function getEditableCircuitRows(
  installedCircuits: Array<{ circuit: ControllerCircuitDefinition; state: boolean | null }>
): EditableCircuitConfigRow[] {
  return installedCircuits.map(({ circuit, state }) => {
    const nameLabel = circuit.nameLabel ?? circuit.defaultName;
    const functionLabel = circuit.functionLabel ?? "Generic";
    return {
      key: circuit.key,
      circuitId: circuit.circuitId,
      circuitType: circuit.circuitType,
      installed: circuit.installed,
      nameLabel,
      nameValue: circuit.nameValue,
      nameOptions: getCircuitNameOptions(nameLabel),
      functionLabel,
      functionValue: circuit.functionValue,
      functionOptions: getCircuitFunctionOptions(functionLabel),
      freezeEnabled: circuit.freezeFlag === true,
      canToggleState: circuit.writable && typeof state === "boolean",
      stateEnabled: state === true,
      state
    };
  });
}

function createPumpConfigurationDraft(pumpConfiguration: ControllerPumpConfigurationData): PumpConfigurationDraft {
  return {
    pumpType: String(pumpConfiguration.pump_type ?? 0),
    primingTime: String(pumpConfiguration.priming_time ?? 0),
    unknown3: String(pumpConfiguration.unknown_3 ?? 0),
    unknown4: String(pumpConfiguration.unknown_4 ?? 0),
    primingSpeed: String(pumpConfiguration.priming_speed ?? 0),
    slots: pumpConfiguration.slots.map((slot) => ({
      slot: slot.slot,
      circuitAssignment: String(slot.circuit_assignment ?? 0),
      rpm: String(slot.rpm ?? 0)
    })),
    trailingBytes: [...pumpConfiguration.trailing_bytes]
  };
}

function normalizePumpConfigurationDraft(draft: PumpConfigurationDraft): {
  pumpType: number;
  primingTime: number;
  unknown3: number;
  unknown4: number;
  primingSpeed: number;
  slots: Array<{ circuit_assignment: number; rpm: number }>;
  trailingBytes: number[];
} | null {
  const pumpType = Number.parseInt(draft.pumpType, 10);
  const primingTime = Number.parseInt(draft.primingTime, 10);
  const unknown3 = Number.parseInt(draft.unknown3, 10);
  const unknown4 = Number.parseInt(draft.unknown4, 10);
  const primingSpeed = Number.parseInt(draft.primingSpeed, 10);
  const slots = draft.slots.map((slot) => ({
    circuit_assignment: Number.parseInt(slot.circuitAssignment, 10),
    rpm: Number.parseInt(slot.rpm, 10)
  }));

  if ([pumpType, primingTime, unknown3, unknown4, primingSpeed].some((value) => Number.isNaN(value)) || slots.some((slot) => Number.isNaN(slot.circuit_assignment) || Number.isNaN(slot.rpm))) {
    return null;
  }

  return {
    pumpType,
    primingTime,
    unknown3,
    unknown4,
    primingSpeed,
    slots,
    trailingBytes: [...draft.trailingBytes]
  };
}

function formatControllerDate(clock: ControllerClockData | null): string {
  const summary = clock?.summary;
  if (!summary || summary.month == null || summary.day == null || summary.year == null) {
    return "Unavailable";
  }
  return `${summary.month}/${summary.day}/${summary.year}`;
}

function formatControllerClockTime(clock: ControllerClockData | null): string {
  const summary = clock?.summary;
  if (!summary || summary.hour_24 == null || summary.minute == null) {
    return "Unavailable";
  }
  return formatControllerTime(summary.hour_24, summary.minute);
}

function formatControllerDstMode(clock: ControllerClockData | null): string {
  const value = clock?.summary.daylight_savings_auto;
  if (value == null) {
    return "Unavailable";
  }
  return value ? "Auto" : "Manual";
}

function formatControllerClockAdvance(clock: ControllerClockData | null): string {
  const value = clock?.summary.clock_advance;
  return value == null ? "Unavailable" : String(value);
}

function isHardwareDetailId(value: string | undefined): value is SystemHardwareDetailId {
  return value === "easytouch8" || value === "intelliflo" || value === "intellichlor" || value === "ultratemp";
}

export interface SystemPageProps {
  controller: EquipmentRecord | undefined;
  pump: EquipmentRecord | undefined;
  chlorinator: EquipmentRecord | undefined;
  healthStatus: "healthy" | "degraded" | "unhealthy" | "down" | "unknown";
  healthData: PlatformStatusResponse | null;
  connectivityHistory: ConnectivityHistorySample[];
  sseStatus: "connecting" | "connected" | "disconnected";
  installedCircuits: Array<{ circuit: ControllerCircuitDefinition; state: boolean | null }>;
  controllerCircuitStates: Array<{ circuit: ControllerCircuitDefinition; state: boolean | null }>;
  activeCircuitCount: number;
  controllerMode: string;
  rpmInput: string;
  setRpmInput: React.Dispatch<React.SetStateAction<string>>;
  circuitKeyInput: string;
  setCircuitKeyInput: React.Dispatch<React.SetStateAction<string>>;
  pendingCommand: boolean;
  isRequestingCircuitConfig: boolean;
  circuitConfigRequestMessage: string | null;
  handlePumpSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
  handleCircuitConfigRequest: (trigger?: "auto" | "manual") => Promise<void>;
  handleCircuitToggle: (circuit: ControllerCircuitDefinition, currentState: boolean | null) => Promise<void>;
  pendingCircuitToggle: PendingCircuitToggle | null;
  isRequestingControllerDatetime: boolean;
  isSyncingControllerDatetime: boolean;
  controllerDatetimeMessage: string | null;
  handleControllerDatetimeRequest: () => Promise<void>;
  handleControllerDatetimeSync: () => Promise<void>;
}

function formatRatePerMinute(valuePerSecond: number | null | undefined): string {
  if (typeof valuePerSecond !== "number") {
    return "Unavailable";
  }
  return `${Math.round(valuePerSecond * 60)} / min`;
}

function formatDurationSeconds(value: number | null): string {
  if (value == null || value <= 0) {
    return "Unavailable";
  }
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function getChlorinatorWarnings(chlorinator: EquipmentRecord | undefined): Array<{ title: string; summary: string }> {
  const warnings: Array<{ title: string; summary: string }> = [];
  const status = chlorinator?.latest_state.status;
  const commsLost = chlorinator?.latest_state.comms_lost === true;

  if (commsLost || status === "communication_lost") {
    warnings.push({
      title: "Communication lost",
      summary: "Splash has stopped receiving recent IntelliChlor traffic, so current output and salt telemetry may no longer be trustworthy."
    });
  }

  switch (status) {
    case "low_flow":
      warnings.push({
        title: "Low flow",
        summary: "The cell is reporting low flow. Verify circulation and confirm the pump or body assignment is active before relying on chlorination."
      });
      break;
    case "low_salt":
    case "very_low_salt":
      warnings.push({
        title: "Salt attention needed",
        summary: "The cell is reporting low salt support. Recheck the salt reading before increasing output, because production may already be limited."
      });
      break;
    case "clean_cell":
      warnings.push({
        title: "Cell cleaning recommended",
        summary: "The current status indicates the cell may need inspection or cleaning before production can be trusted."
      });
      break;
    case "high_current":
    case "low_voltage":
    case "low_water_temp":
      warnings.push({
        title: formatChlorinatorStatus(status),
        summary: "The current IntelliChlor status is outside normal operating conditions. Treat the output target as advisory until the equipment state recovers."
      });
      break;
    default:
      break;
  }

  if (warnings.length === 0 && readMetric(chlorinator?.latest_state.salt_ppm) == null) {
    warnings.push({
      title: "Telemetry incomplete",
      summary: "Salt telemetry is not currently available, so production support remains partially observed."
    });
  }

  return warnings;
}

function buildSwgSupportEstimate(input: {
  volumeGallons: number | null;
  productionLbPerDay: number | null;
  targetOutputPercent: number | null;
  waterTempF: number | null;
  coverState: "on" | "off" | null;
}): { ppm: number; summary: string } | null {
  if (
    input.volumeGallons == null
    || input.productionLbPerDay == null
    || input.targetOutputPercent == null
  ) {
    return null;
  }

  const basePpm =
    input.productionLbPerDay
    * (input.targetOutputPercent / 100)
    * (120000 / input.volumeGallons);
  const temperatureModifier = getSwgTemperatureModifier(input.waterTempF);
  const coverModifier = getSwgCoverModifier(input.coverState);
  const estimatedPpm = basePpm * temperatureModifier * coverModifier;

  return {
    ppm: estimatedPpm,
    summary:
      `Estimated from ${input.targetOutputPercent}% target output, `
      + `${input.productionLbPerDay.toFixed(2)} lb/day cell production, `
      + `${formatCoverStateSummary(input.coverState).toLowerCase()} cover context, `
      + `${formatMetric(input.waterTempF, "°F")} water, and a simple 24h retention adjustment.`
  };
}

function buildSwgSupportUnavailableMessage(input: {
  volumeGallons: number | null;
  productionLbPerDay: number | null;
  targetOutputPercent: number | null;
}): string {
  if (input.volumeGallons == null) {
    return "Configure pool volume to unlock the 24h SWG ppm estimate.";
  }
  if (input.productionLbPerDay == null) {
    return "IntelliChlor model production metadata is unavailable, so the 24h SWG ppm estimate cannot be calculated yet.";
  }
  if (input.targetOutputPercent == null) {
    return "Configured chlorinator output is unavailable, so the 24h SWG ppm estimate cannot be calculated yet.";
  }
  return "The 24h SWG ppm estimate is currently unavailable.";
}

function getSwgTemperatureModifier(waterTempF: number | null): number {
  if (waterTempF == null) {
    return 1;
  }
  if (waterTempF < 52) {
    return 0;
  }
  if (waterTempF < 60) {
    return 0.25;
  }
  if (waterTempF < 65) {
    return 0.5;
  }
  if (waterTempF < 70) {
    return 0.75;
  }
  return 1;
}

function getSwgCoverModifier(coverState: "on" | "off" | null): number {
  if (coverState === "off") {
    return 0.85;
  }
  if (coverState === "on") {
    return 1;
  }
  return 0.92;
}

function formatCoverStateSummary(value: "on" | "off" | null): string {
  if (value === "on") {
    return "Cover On";
  }
  if (value === "off") {
    return "Cover Off";
  }
  return "Cover Unknown";
}

function formatEstimatedPpmDelta(value: number): string {
  const rounded = value.toFixed(1);
  return value >= 0 ? `+${rounded} ppm` : `${rounded} ppm`;
}

function formatCountValue(value: number | null | undefined): string {
  return typeof value === "number" ? value.toString() : "Unavailable";
}

function formatPlatformServiceStatus(value: PlatformServiceHealthRecord["status"]): string {
  if (value === "healthy") {
    return "Healthy";
  }
  if (value === "degraded") {
    return "Degraded";
  }
  if (value === "unhealthy") {
    return "Unhealthy";
  }
  if (value === "down") {
    return "Down";
  }
  return "Unknown";
}

function formatPlatformServiceName(value: string): string {
  switch (value) {
    case "splash-api":
      return "Splash API";
    case "splash-serial":
      return "Splash Serial";
    case "splash-protocol":
      return "Splash Protocol";
    case "splash-frontend":
      return "Splash Frontend";
    case "nats":
      return "NATS";
    case "prometheus":
      return "Prometheus";
    case "grafana":
      return "Grafana";
    case "sqlite":
      return "SQLite";
    case "influxdb":
      return "InfluxDB";
    case "weather-provider":
      return "Weather Provider";
    default:
      return value;
  }
}

function formatPlatformServiceSummary(record: PlatformServiceHealthRecord | undefined): string {
  if (record?.lastChecked) {
    return `${record.criticality} · updated ${formatUpdatedAt(record.lastChecked)}`;
  }
  return "Unavailable";
}

function formatPlatformServiceRole(record: PlatformServiceHealthRecord): string {
  const typeLabel = record.type === "splash" ? "Splash service" : "Third-party service";
  const criticalityLabel = record.criticality.charAt(0).toUpperCase() + record.criticality.slice(1);
  return `${typeLabel} · ${criticalityLabel}`;
}

const HEAT_MODE_OPTIONS = [
  { value: "0", label: "Off" },
  { value: "1", label: "Heater" },
  { value: "2", label: "Solar / Heat Pump Preferred" },
  { value: "3", label: "Solar / Heat Pump Only" }
] as const;

function parseHeatModeNumber(value: string | null | undefined): 0 | 1 | 2 | 3 {
  switch (value) {
    case "heater":
      return 1;
    case "solar_preferred":
      return 2;
    case "solar":
      return 3;
    default:
      return 0;
  }
}

function formatHeaterTypeLabel(value: string | null | undefined): string {
  switch (value) {
    case "ultratempHeatPumpCom":
      return "UltraTemp Heat Pump Com";
    case "ultratempEtiHybrid":
      return "UltraTemp ETi Hybrid";
    case "solar":
      return "Solar";
    case "gas":
      return "Gas";
    case "unknown":
      return "Unknown";
    default:
      return "Heater unavailable";
  }
}

function getPlatformServiceStatusClassName(value: PlatformServiceHealthRecord["status"]): string {
  if (value === "healthy") {
    return "system-status-chip-good";
  }
  if (value === "degraded") {
    return "system-status-chip-watch";
  }
  if (value === "unhealthy" || value === "down") {
    return "system-status-chip-watch";
  }
  return "system-status-chip-muted";
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit"
  });
}
