import { startTransition, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type React from "react";
import { NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import {
  buildApiUrl,
  compareProtocolBundles,
  createProtocolAnnotation,
  createProtocolBundle,
  createProtocolPrompt,
  fetchEquipment,
  fetchPlatformStatus,
  fetchProtocolAnnotations,
  fetchProtocolBundles,
  fetchProtocolPrompts,
  requestCircuitConfig,
  requestCircuitState,
  requestControllerDatetime,
  requestRemoteLayoutPage,
  requestPumpSpeed,
  syncControllerDatetime,
  sendRawProtocolFrame
} from "./api";
import { AppShell } from "./components/AppShell";
import { SplashIcon } from "./components/icons/SplashIcon";
import { NAV_ITEMS, PAGE_SUMMARIES, getActiveNavItem } from "./navigation";
import { AutomationPage } from "./pages/AutomationPage";
import { ChemistryPage } from "./pages/ChemistryPage";
import { DiagnosticsPage } from "./pages/DiagnosticsPage";
import { HistoryPage } from "./pages/HistoryPage";
import { HomePage } from "./pages/HomePage";
import { RoutinesPage } from "./pages/RoutinesPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SystemPage } from "./pages/SystemPage";
import { useFrontendStore } from "./store";
import type {
  ConnectivityHistorySample,
  EquipmentRecord,
  PlatformStatusResponse,
  ProtocolAnnotation,
  ProtocolBundleComparison,
  ProtocolBundleSummary,
  ProtocolFrameEvent,
  ProtocolPrompt
} from "./types";
import {
  type ActivePlatformRequest,
  type PendingCircuitToggle,
  formatCommandStatus,
  formatControllerTime,
  formatMessagesPerSecond,
  formatTopbarDate,
  formatTopbarTime,
  getControllerCircuitStates,
  getMessageLogSource,
  getMessageLogType,
  getSidebarStatus,
  getStatusIconName,
  getTopbarWeatherSummary,
  isControllerCircuitMetadataMissing,
  readNullableString
} from "./viewUtils";
import "./tokens.css";
import "./styles.css";

const CONNECTIVITY_SAMPLE_WINDOW_MS = 9_000;
const CONNECTIVITY_SAMPLE_MAX_POINTS = 18;
const HEALTH_POLL_INTERVAL_MS = 10_000;

interface PendingCircuitConfigLookup {
  circuitIndex: number;
  commandId: string;
  requestedAt: string;
}

interface CircuitConfigLookupResult {
  circuitId: number | null;
  functionId: number | null;
  baseFunctionId: number | null;
  baseFunctionLabel: string | null;
  nameId: number | null;
  nameLabel: string | null;
  freezeFlag: boolean | null;
  highFlag: boolean | null;
}

export default function App() {
  const equipment = useFrontendStore((state) => state.equipment);
  const healthStatus = useFrontendStore((state) => state.healthStatus);
  const healthData = useFrontendStore((state) => state.healthData);
  const sseStatus = useFrontendStore((state) => state.sseStatus);
  const errorMessage = useFrontendStore((state) => state.errorMessage);
  const command = useFrontendStore((state) => state.command);
  const setEquipment = useFrontendStore((state) => state.setEquipment);
  const setHealthStatus = useFrontendStore((state) => state.setHealthStatus);
  const setHealthData = useFrontendStore((state) => state.setHealthData);
  const setSseStatus = useFrontendStore((state) => state.setSseStatus);
  const setErrorMessage = useFrontendStore((state) => state.setErrorMessage);
  const beginPumpCommand = useFrontendStore((state) => state.beginPumpCommand);
  const applyCommandResult = useFrontendStore((state) => state.applyCommandResult);
  const applyEquipmentStateEvent = useFrontendStore((state) => state.applyEquipmentStateEvent);
  const applyPumpStateEvent = useFrontendStore((state) => state.applyPumpStateEvent);

  const [rpmInput, setRpmInput] = useState("2800");
  const [circuitKeyInput, setCircuitKeyInput] = useState("pool");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRequestingCircuitConfig, setIsRequestingCircuitConfig] = useState(false);
  const [circuitConfigRequestMessage, setCircuitConfigRequestMessage] = useState<string | null>(null);
  const [isRequestingControllerDatetime, setIsRequestingControllerDatetime] = useState(false);
  const [isSyncingControllerDatetime, setIsSyncingControllerDatetime] = useState(false);
  const [controllerDatetimeMessage, setControllerDatetimeMessage] = useState<string | null>(null);
  const [pendingCircuitToggle, setPendingCircuitToggle] = useState<PendingCircuitToggle | null>(null);
  const [activeRequests, setActiveRequests] = useState<ActivePlatformRequest[]>([]);
  const [bundleLabel, setBundleLabel] = useState("");
  const [circuitConfigRequestIndex, setCircuitConfigRequestIndex] = useState("4");
  const [pendingCircuitConfigLookup, setPendingCircuitConfigLookup] = useState<PendingCircuitConfigLookup | null>(null);
  const [circuitConfigLookupMessage, setCircuitConfigLookupMessage] = useState<string | null>(null);
  const [circuitConfigLookupResult, setCircuitConfigLookupResult] = useState<CircuitConfigLookupResult | null>(null);
  const [remoteLayoutPageIndex, setRemoteLayoutPageIndex] = useState("0");
  const [rawFrameHex, setRawFrameHex] = useState("ff00ffa5011022e1010001ba");
  const [recentFrames, setRecentFrames] = useState<ProtocolFrameEvent[]>([]);
  const [deviceFilter, setDeviceFilter] = useState("all");
  const [messageTypeFilter, setMessageTypeFilter] = useState("all");
  const [messageLogLimit, setMessageLogLimit] = useState("100");
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);
  const [isStreamPaused, setIsStreamPaused] = useState(true);
  const [bundles, setBundles] = useState<ProtocolBundleSummary[]>([]);
  const [baselineBundleId, setBaselineBundleId] = useState("");
  const [comparisonBundleId, setComparisonBundleId] = useState("");
  const [bundleComparison, setBundleComparison] = useState<ProtocolBundleComparison | null>(null);
  const [selectedBundleId, setSelectedBundleId] = useState("");
  const [annotations, setAnnotations] = useState<ProtocolAnnotation[]>([]);
  const [prompts, setPrompts] = useState<ProtocolPrompt[]>([]);
  const [annotationLabel, setAnnotationLabel] = useState("");
  const [annotationNotes, setAnnotationNotes] = useState("");
  const [annotationFieldName, setAnnotationFieldName] = useState("payload_hex");
  const [annotationFrameIndex, setAnnotationFrameIndex] = useState("0");
  const [annotationByteStart, setAnnotationByteStart] = useState("0");
  const [annotationByteEnd, setAnnotationByteEnd] = useState("0");
  const [annotationConfidence, setAnnotationConfidence] = useState<"known" | "inferred" | "unknown">("inferred");
  const [promptQuestion, setPromptQuestion] = useState("");
  const [promptWhy, setPromptWhy] = useState("");
  const [promptFieldName, setPromptFieldName] = useState("payload_hex");
  const [promptFrameIndex, setPromptFrameIndex] = useState("0");
  const [promptInputType, setPromptInputType] = useState<"controller_menu_state" | "equipment_behavior" | "circuit_name" | "configured_rpm">("controller_menu_state");
  const [explorerError, setExplorerError] = useState<string | null>(null);
  const [connectivityHistory, setConnectivityHistory] = useState<ConnectivityHistorySample[]>([]);
  const hasRequestedControllerDatetimeRef = useRef(false);
  const hasRequestedControllerCircuitConfigRef = useRef(false);
  const isStreamPausedRef = useRef(false);
  const pendingCircuitConfigLookupRef = useRef<PendingCircuitConfigLookup | null>(null);
  const messageLogTableRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void loadInitialState({ setEquipment, setHealthStatus, setHealthData, setErrorMessage });
    void refreshBundles({ setBundles, setBaselineBundleId, setComparisonBundleId, setSelectedBundleId, setExplorerError });
  }, [setEquipment, setErrorMessage, setHealthData, setHealthStatus]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void refreshHealth(setHealthStatus, setHealthData, setErrorMessage);
    }, HEALTH_POLL_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [setErrorMessage, setHealthData, setHealthStatus]);

  useEffect(() => {
    setSseStatus("connecting");
    const source = new EventSource(buildApiUrl("/events"));
    source.addEventListener("ready", () => {
      setSseStatus("connected");
      void refreshEquipment(setEquipment, setErrorMessage);
      void refreshHealth(setHealthStatus, setHealthData, setErrorMessage);
    });
    source.addEventListener("equipment.state", (event) => startTransition(() => applyEquipmentStateEvent(parseEventPayload(event))));
    source.addEventListener("pump.state", (event) => startTransition(() => applyPumpStateEvent(parseEventPayload(event))));
    source.addEventListener("command.result", (event) => {
      const payload = parseEventPayload(event);
      startTransition(() => {
        applyCommandResult(payload);
        clearActiveRequestByCommandResult(setActiveRequests, payload);
        const commandId = readNullableString(payload.command_id);
        const status = readNullableString(payload.status);
        if (pendingCircuitToggle && commandId === pendingCircuitToggle.commandId && (status === "failed" || status === "timed_out")) {
          setPendingCircuitToggle(null);
        }
        const pendingLookup = pendingCircuitConfigLookupRef.current;
        if (pendingLookup && commandId === pendingLookup.commandId && (status === "failed" || status === "timed_out")) {
          setPendingCircuitConfigLookup(null);
          setCircuitConfigLookupMessage(`Circuit config request for index ${pendingLookup.circuitIndex} ${status}.`);
        }
      });
    });
    source.onerror = () => {
      setSseStatus("disconnected");
      void refreshHealth(setHealthStatus, setHealthData, setErrorMessage);
    };
    return () => source.close();
  }, [applyCommandResult, applyEquipmentStateEvent, applyPumpStateEvent, pendingCircuitToggle, setEquipment, setErrorMessage, setHealthData, setHealthStatus, setSseStatus]);

  useEffect(() => {
    const source = new EventSource(buildApiUrl("/protocol/frames"));
    source.addEventListener("protocol.frame.raw", (event) => {
      if (!isStreamPausedRef.current) {
        appendFrame(setRecentFrames, "protocol.frame.raw", parseEventPayload(event));
      }
    });
    source.addEventListener("protocol.frame.decoded", (event) => {
      const payload = parseEventPayload(event);
      if (!isStreamPausedRef.current) {
        appendFrame(setRecentFrames, "protocol.frame.decoded", payload);
      }
      clearActiveRequestByReply(setActiveRequests, payload);
      const pendingLookup = pendingCircuitConfigLookupRef.current;
      if (pendingLookup) {
        const matchedLookup = tryMatchCircuitConfigLookup(payload, pendingLookup);
        if (matchedLookup) {
          setPendingCircuitConfigLookup(null);
          setCircuitConfigLookupResult(matchedLookup);
          setCircuitConfigLookupMessage(`Matched circuit_configuration reply for index ${pendingLookup.circuitIndex}.`);
        }
      }
    });
    source.addEventListener("protocol.command.encoded", (event) => {
      if (!isStreamPausedRef.current) {
        appendFrame(setRecentFrames, "protocol.command.encoded", parseEventPayload(event));
      }
    });
    source.addEventListener("serial.tx.raw", (event) => {
      if (!isStreamPausedRef.current) {
        appendFrame(setRecentFrames, "serial.tx.raw", parseEventPayload(event));
      }
    });
    source.onerror = () => setExplorerError((current) => current ?? "Protocol frame stream disconnected.");
    return () => source.close();
  }, []);

  useEffect(() => {
    const nextSample = createConnectivityHistorySample(healthData);
    if (!nextSample) {
      return;
    }

    setConnectivityHistory((current) => upsertConnectivityHistorySample(current, nextSample));
  }, [healthData]);

  useEffect(() => {
    if (!selectedBundleId) {
      setAnnotations([]);
      setPrompts([]);
      return;
    }
    void refreshExplorerMetadata(selectedBundleId, setAnnotations, setPrompts, setExplorerError);
  }, [selectedBundleId]);

  const controller = equipment["controller-main"];
  const pump = equipment["pump-main"];
  const chlorinator = equipment["chlorinator-main"];
  const pendingCommand = isSubmitting || command.commandId !== null;
  const controllerCircuitStates = getControllerCircuitStates(
    controller?.hardware?.circuits,
    controller?.latest_state.circuits,
    controller?.latest_state.active_circuit_keys,
    controller?.latest_state.mode,
    controller?.latest_state.circuit_configurations
  );
  const installedCircuits = controllerCircuitStates.filter((entry) => entry.circuit.installed);
  const activeCircuitCount = installedCircuits.filter((entry) => entry.state === true).length;
  const controllerMode = readNullableString(controller?.latest_state.mode) ?? "pool";
  const filteredFrames = recentFrames.filter((frame) => {
    const source = getMessageLogSource(frame);
    const messageType = getMessageLogType(frame);
    if (deviceFilter !== "all" && source !== deviceFilter) {
      return false;
    }
    if (messageTypeFilter !== "all" && messageType !== messageTypeFilter) {
      return false;
    }
    return true;
  });
  const visibleFrames = filteredFrames.slice(0, Number.parseInt(messageLogLimit, 10));
  const availableDevices = Array.from(new Set(recentFrames.map((frame) => getMessageLogSource(frame))));
  const availableMessageTypes = Array.from(new Set(recentFrames.map((frame) => getMessageLogType(frame))));
  const messagesPerSecond = formatMessagesPerSecond(recentFrames);

  useEffect(() => {
    isStreamPausedRef.current = isStreamPaused;
  }, [isStreamPaused]);

  useEffect(() => {
    pendingCircuitConfigLookupRef.current = pendingCircuitConfigLookup;
  }, [pendingCircuitConfigLookup]);

  useEffect(() => {
    if (!autoScrollEnabled || !messageLogTableRef.current) {
      return;
    }
    messageLogTableRef.current.scrollTop = 0;
  }, [autoScrollEnabled, visibleFrames]);

  useEffect(() => {
    if (!pendingCircuitToggle) {
      return;
    }
    const updatedAtValue = readNullableString(controller?.latest_state.updated_at);
    if (updatedAtValue && updatedAtValue !== pendingCircuitToggle.controllerUpdatedAt) {
      setPendingCircuitToggle(null);
    }
  }, [controller?.latest_state.updated_at, pendingCircuitToggle]);

  useEffect(() => {
    if (sseStatus !== "connected" || hasRequestedControllerDatetimeRef.current) {
      return;
    }
    if (controller?.latest_state.controller_datetime_reply) {
      hasRequestedControllerDatetimeRef.current = true;
      return;
    }
    hasRequestedControllerDatetimeRef.current = true;
    void handleControllerDatetimeRequest();
  }, [controller?.latest_state.controller_datetime_reply, sseStatus]);

  useEffect(() => {
    if (sseStatus !== "connected" || !controller || isRequestingCircuitConfig || hasRequestedControllerCircuitConfigRef.current) {
      return;
    }
    if (!isControllerCircuitMetadataMissing(controller)) {
      hasRequestedControllerCircuitConfigRef.current = true;
      return;
    }
    hasRequestedControllerCircuitConfigRef.current = true;
    void handleCircuitConfigRequest("auto");
  }, [controller, isRequestingCircuitConfig, sseStatus]);

  useEffect(() => {
    if (!pump) {
      return;
    }
    setCircuitKeyInput(pump.default_control_circuit_key ?? pump.control_circuit_keys?.[0] ?? "pool");
  }, [pump]);

  async function handlePumpSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const rpm = Number.parseInt(rpmInput, 10);
    if (!pump || Number.isNaN(rpm)) {
      setErrorMessage("Enter a valid integer RPM before submitting.");
      return;
    }
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      const response = await requestPumpSpeed({ equipmentId: pump.id, rpm, circuitKey: circuitKeyInput });
      beginPumpCommand({ commandId: response.data.command_id, rpm });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleBundleSave(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    try {
      setExplorerError(null);
      await createProtocolBundle({ label: bundleLabel.trim().length > 0 ? bundleLabel.trim() : null });
      setBundleLabel("");
      await refreshBundles({ setBundles, setBaselineBundleId, setComparisonBundleId, setSelectedBundleId, setExplorerError });
    } catch (error) {
      setExplorerError(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleRemoteLayoutRequest(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const pageIndex = Number.parseInt(remoteLayoutPageIndex, 10);
    if (Number.isNaN(pageIndex)) {
      setExplorerError("Enter a valid Remote Layout page index.");
      return;
    }
    try {
      setExplorerError(null);
      const response = await requestRemoteLayoutPage({ pageIndex });
      addActiveRequest(setActiveRequests, {
        commandId: response.data.command_id,
        label: `Remote Layout page ${pageIndex}`,
        waitingFor: "command completion",
        replyType: null
      });
      applyCommandResult({ command_id: response.data.command_id, status: response.data.status, detail: `Manual Remote Layout request for page ${pageIndex} accepted.` });
    } catch (error) {
      setExplorerError(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleCircuitConfigLookupRequest(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const circuitIndex = Number.parseInt(circuitConfigRequestIndex, 10);
    if (Number.isNaN(circuitIndex) || circuitIndex < 1 || circuitIndex > 255) {
      setExplorerError("Enter a valid circuit config index between 1 and 255.");
      return;
    }
    try {
      setExplorerError(null);
      setCircuitConfigLookupResult(null);
      const requestedAt = new Date().toISOString();
      const response = await requestCircuitConfig({ startIndex: circuitIndex, endIndex: circuitIndex });
      setPendingCircuitConfigLookup({
        circuitIndex,
        commandId: response.data.command_id,
        requestedAt
      });
      setCircuitConfigLookupMessage(`Requested circuit config for index ${circuitIndex}. Command ${response.data.command_id}. Waiting for matching reply...`);
      addActiveRequest(setActiveRequests, {
        commandId: response.data.command_id,
        label: `Circuit config index ${circuitIndex}`,
        waitingFor: "matching circuit_configuration reply",
        replyType: "circuit_configuration"
      });
    } catch (error) {
      setExplorerError(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleRawFrameSend(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const bytesHex = rawFrameHex.trim();
    if (!/^[0-9a-f]+$/.test(bytesHex) || bytesHex.length % 2 !== 0) {
      setExplorerError("Enter even-length lowercase hex bytes for the raw frame.");
      return;
    }
    try {
      setExplorerError(null);
      const response = await sendRawProtocolFrame({ protocolName: "pentair_easytouch", bytesHex });
      addActiveRequest(setActiveRequests, { commandId: response.data.command_id, label: "Manual raw frame send", waitingFor: "command completion", replyType: null });
      applyCommandResult({ command_id: response.data.command_id, status: response.data.status, detail: `Manual raw frame send accepted for ${bytesHex}.` });
    } catch (error) {
      setExplorerError(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleCircuitConfigRequest(trigger: "auto" | "manual" = "manual"): Promise<void> {
    try {
      setExplorerError(null);
      setIsRequestingCircuitConfig(true);
      const response = await requestCircuitConfig();
      addActiveRequest(setActiveRequests, {
        commandId: response.data.command_id,
        label: "Controller circuit config discovery",
        waitingFor: "circuit configuration reply",
        replyType: "circuit_configuration"
      });
      if (trigger === "manual") {
        setCircuitConfigRequestMessage(`Controller circuit configuration discovery accepted for indexes 1-20. Command ${response.data.command_id}.`);
      }
    } catch (error) {
      setExplorerError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsRequestingCircuitConfig(false);
    }
  }

  async function handleCircuitToggle(circuit: { key: string; writable: boolean }, currentState: boolean | null): Promise<void> {
    if (!circuit.writable || currentState == null || pendingCircuitToggle) {
      return;
    }
    try {
      setExplorerError(null);
      const response = await requestCircuitState({ equipmentId: "controller-main", circuitKey: circuit.key, enabled: !currentState });
      setPendingCircuitToggle({
        circuitKey: circuit.key,
        commandId: response.data.command_id,
        controllerUpdatedAt: readNullableString(controller?.latest_state.updated_at)
      });
    } catch (error) {
      setExplorerError(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleControllerDatetimeRequest(): Promise<void> {
    try {
      setExplorerError(null);
      setIsRequestingControllerDatetime(true);
      const response = await requestControllerDatetime();
      addActiveRequest(setActiveRequests, {
        commandId: response.data.command_id,
        label: "Controller date/time request",
        waitingFor: "0x05 controller date/time reply",
        replyType: "controller_datetime"
      });
      setControllerDatetimeMessage(`Controller date/time request accepted. Command ${response.data.command_id}.`);
    } catch (error) {
      setExplorerError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsRequestingControllerDatetime(false);
    }
  }

  async function handleControllerDatetimeSync(): Promise<void> {
    try {
      setExplorerError(null);
      setIsSyncingControllerDatetime(true);
      const response = await syncControllerDatetime();
      addActiveRequest(setActiveRequests, {
        commandId: response.data.command_id,
        label: "Controller date/time sync",
        waitingFor: "0x05 controller date/time reply",
        replyType: "controller_datetime"
      });
      setControllerDatetimeMessage(`Controller date/time sync accepted as a provisional best-effort action. Command ${response.data.command_id}.`);
    } catch (error) {
      setExplorerError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSyncingControllerDatetime(false);
    }
  }

  async function handleBundleCompare(): Promise<void> {
    if (!baselineBundleId || !comparisonBundleId) {
      setExplorerError("Select both a baseline and comparison bundle.");
      return;
    }
    try {
      setExplorerError(null);
      const response = await compareProtocolBundles({ baselineBundleId, comparisonBundleId });
      setBundleComparison(response.data);
    } catch (error) {
      setExplorerError(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleAnnotationSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedBundleId) {
      setExplorerError("Select a bundle before creating an annotation.");
      return;
    }
    try {
      setExplorerError(null);
      await createProtocolAnnotation({
        bundleId: selectedBundleId,
        frameIndex: Number.parseInt(annotationFrameIndex, 10),
        fieldName: annotationFieldName,
        byteStart: Number.parseInt(annotationByteStart, 10),
        byteEnd: Number.parseInt(annotationByteEnd, 10),
        confidence: annotationConfidence,
        label: annotationLabel,
        notes: annotationNotes.trim().length > 0 ? annotationNotes.trim() : null
      });
      setAnnotationLabel("");
      setAnnotationNotes("");
      await refreshExplorerMetadata(selectedBundleId, setAnnotations, setPrompts, setExplorerError);
    } catch (error) {
      setExplorerError(error instanceof Error ? error.message : String(error));
    }
  }

  async function handlePromptSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedBundleId) {
      setExplorerError("Select a bundle before creating a prompt.");
      return;
    }
    try {
      setExplorerError(null);
      await createProtocolPrompt({
        bundleId: selectedBundleId,
        frameIndex: Number.parseInt(promptFrameIndex, 10),
        fieldName: promptFieldName.trim().length > 0 ? promptFieldName.trim() : null,
        prompt: promptQuestion,
        why: promptWhy,
        inputType: promptInputType,
        operatorResponse: null
      });
      setPromptQuestion("");
      setPromptWhy("");
      await refreshExplorerMetadata(selectedBundleId, setAnnotations, setPrompts, setExplorerError);
    } catch (error) {
      setExplorerError(error instanceof Error ? error.message : String(error));
    }
  }

  return <AppLayout
    controller={controller}
    healthStatus={healthStatus}
    healthData={healthData}
    sseStatus={sseStatus}
    errorMessage={errorMessage}
    command={command}
    explorerError={explorerError}
    systemPageProps={{
      controller,
      pump,
      chlorinator,
      healthStatus,
      healthData,
      connectivityHistory,
      sseStatus,
      installedCircuits,
      controllerCircuitStates,
      activeCircuitCount,
      controllerMode,
      rpmInput,
      setRpmInput,
      circuitKeyInput,
      setCircuitKeyInput,
      pendingCommand,
      isRequestingCircuitConfig,
      circuitConfigRequestMessage,
      handlePumpSubmit,
      handleCircuitConfigRequest,
      handleCircuitToggle,
      pendingCircuitToggle,
      isRequestingControllerDatetime,
      isSyncingControllerDatetime,
      controllerDatetimeMessage,
      handleControllerDatetimeRequest,
      handleControllerDatetimeSync
    }}
    diagnosticsPageProps={{
      bundleLabel,
      setBundleLabel,
      circuitConfigRequestIndex,
      setCircuitConfigRequestIndex,
      isCircuitConfigLookupPending: pendingCircuitConfigLookup !== null,
      circuitConfigLookupMessage,
      circuitConfigLookupResult,
      remoteLayoutPageIndex,
      setRemoteLayoutPageIndex,
      rawFrameHex,
      setRawFrameHex,
      activeRequests,
      isStreamPaused,
      setIsStreamPaused,
      autoScrollEnabled,
      setAutoScrollEnabled,
      deviceFilter,
      setDeviceFilter,
      messageTypeFilter,
      setMessageTypeFilter,
      messageLogLimit,
      setMessageLogLimit,
      recentFrames,
      setRecentFrames,
      visibleFrames,
      availableDevices,
      availableMessageTypes,
      messagesPerSecond,
      bundles,
      baselineBundleId,
      setBaselineBundleId,
      comparisonBundleId,
      setComparisonBundleId,
      bundleComparison,
      selectedBundleId,
      setSelectedBundleId,
      annotations,
      prompts,
      annotationLabel,
      setAnnotationLabel,
      annotationNotes,
      setAnnotationNotes,
      annotationFieldName,
      setAnnotationFieldName,
      annotationFrameIndex,
      setAnnotationFrameIndex,
      annotationByteStart,
      setAnnotationByteStart,
      annotationByteEnd,
      setAnnotationByteEnd,
      annotationConfidence,
      setAnnotationConfidence,
      promptQuestion,
      setPromptQuestion,
      promptWhy,
      setPromptWhy,
      promptFieldName,
      setPromptFieldName,
      promptFrameIndex,
      setPromptFrameIndex,
      promptInputType,
      setPromptInputType,
      messageLogTableRef,
      handleBundleSave,
      handleCircuitConfigLookupRequest,
      handleRemoteLayoutRequest,
      handleRawFrameSend,
      handleBundleCompare,
      handleAnnotationSubmit,
      handlePromptSubmit
    }}
  />;
}

function AppLayout({
      controller,
      healthStatus,
      healthData,
      sseStatus,
  errorMessage,
  command,
  explorerError,
  systemPageProps,
  diagnosticsPageProps
}: {
  controller: EquipmentRecord | undefined;
  healthStatus: "healthy" | "degraded" | "unhealthy" | "down" | "unknown";
  healthData: PlatformStatusResponse | null;
  sseStatus: "connecting" | "connected" | "disconnected";
  errorMessage: string | null;
  command: { status: string | null; detail: string | null };
  explorerError: string | null;
  systemPageProps: React.ComponentProps<typeof SystemPage>;
  diagnosticsPageProps: React.ComponentProps<typeof DiagnosticsPage>;
}) {
  const location = useLocation();
  const activeNavItem = getActiveNavItem(location.pathname);
  const sidebarStatus = getSidebarStatus({
    healthStatus,
    sseStatus,
    errorMessage,
    commandStatus: command.status,
    commandDetail: command.detail,
    lastMessageTime: formatControllerTime(controller?.latest_state.controller_hour_24, controller?.latest_state.controller_minute)
  });
  const topbarWeather = getTopbarWeatherSummary();

  return (
    <AppShell
      sidebar={
        <aside className="sidebar-nav" aria-label="primary navigation">
          <div className="sidebar-nav-main">
            <div className="brand-lockup">
              <div className="brand-mark"><SplashIcon name="brand-drop" size={28} /></div>
              <div><strong>Splash</strong><span>Smart Pool Management</span></div>
            </div>
            <nav className="sidebar-list">
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.id}
                  to={item.path}
                  className={({ isActive }) => `sidebar-link ${isActive || (item.id === activeNavItem.id && item.path === "/" ? location.pathname === "/" : false) ? "sidebar-link-active" : ""}`}
                  aria-current={activeNavItem.id === item.id ? "page" : undefined}
                >
                  <SplashIcon name={item.icon} size={22} />
                  <span><strong>{item.label}</strong><small>{item.description}</small></span>
                </NavLink>
              ))}
            </nav>
            <section className="sidebar-status-card" aria-label="system status">
              <div className="sidebar-status-header">
                <div className={`sidebar-status-indicator sidebar-status-indicator-${sidebarStatus.tone}`} aria-hidden="true" />
                <div><strong>{sidebarStatus.label}</strong><span>{sidebarStatus.summary}</span></div>
              </div>
              <dl className="sidebar-status-details">
                <div><dt>Last message</dt><dd>{sidebarStatus.lastMessage}</dd></div>
                <div><dt>Uptime</dt><dd>{sidebarStatus.uptime}</dd></div>
              </dl>
              <NavLink className="sidebar-status-button" to="/system/overview">View system status</NavLink>
            </section>
          </div>
          <div className="sidebar-version">Splash Platform v0.1.0</div>
        </aside>
      }
    >
      <header className="topbar">
        <div className="topbar-copy">
          <h1>{`${activeNavItem.label} - ${activeNavItem.description}`}</h1>
          <p className="topbar-subheader">{PAGE_SUMMARIES[activeNavItem.id]}</p>
        </div>
        <div className="topbar-statuses" aria-label="page status indicators">
          <div className="topbar-status-item"><SplashIcon name="weather" size={24} /><div><strong>{topbarWeather.temperature}</strong><span>{topbarWeather.weatherDescription}</span></div></div>
          <div className="topbar-status-item"><SplashIcon name="rain" size={24} /><div><strong>{topbarWeather.precipitationPercent}</strong><span>{topbarWeather.precipitationDescription}</span></div></div>
          <div className="topbar-status-item"><SplashIcon name="schedule" size={22} /><div><strong>{formatTopbarDate(controller?.latest_state.controller_datetime_reply)}</strong><span>{formatTopbarTime(controller?.latest_state.controller_datetime_reply)}</span></div></div>
          <div className="topbar-status-item topbar-status-help"><SplashIcon name="help" size={20} /><div><strong>Help</strong></div></div>
        </div>
      </header>
      <div className="page-shell" id="system-overview">
        {errorMessage ? <section className="notice notice-error" role="alert"><SplashIcon name="critical" size={18} />{errorMessage}</section> : null}
        {command.detail ? <section className="notice" aria-live="polite"><SplashIcon name={getStatusIconName(command.status ?? "idle")} size={18} /><div><strong>{formatCommandStatus(command.status)}</strong><span>{command.detail}</span></div></section> : null}
        {explorerError ? <section className="notice notice-error" role="alert"><SplashIcon name="warning" size={18} />{explorerError}</section> : null}
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/chemistry" element={<ChemistryPage />} />
          <Route path="/chemistry/water-test-log" element={<ChemistryPage />} />
          <Route path="/system/*" element={<SystemPage {...systemPageProps} />} />
          <Route path="/automation/*" element={<AutomationPage />} />
          <Route path="/diagnostics/*" element={<DiagnosticsPage {...diagnosticsPageProps} />} />
          <Route path="/routines" element={<RoutinesPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/alerts" element={<Navigate to="/routines" replace />} />
          <Route path="/water-test-log" element={<Navigate to="/chemistry" replace />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/system/overview" replace />} />
        </Routes>
      </div>
    </AppShell>
  );
}

async function loadInitialState({
  setEquipment,
  setHealthStatus,
  setHealthData,
  setErrorMessage
}: {
  setEquipment: (records: EquipmentRecord[]) => void;
  setHealthStatus: (status: "healthy" | "degraded" | "unhealthy" | "down" | "unknown") => void;
  setHealthData: (data: PlatformStatusResponse | null) => void;
  setErrorMessage: (message: string | null) => void;
}): Promise<void> {
  try {
    const [equipmentResponse, healthResponse] = await Promise.all([fetchEquipment(), fetchPlatformStatus()]);
    startTransition(() => {
      setEquipment(equipmentResponse.data);
      setHealthStatus(healthResponse.overall);
      setHealthData(healthResponse);
      setErrorMessage(null);
      window.localStorage.setItem("splash.platform.status", JSON.stringify(healthResponse));
    });
  } catch (error) {
    setErrorMessage(error instanceof Error ? error.message : String(error));
  }
}

async function refreshEquipment(setEquipment: (records: EquipmentRecord[]) => void, setErrorMessage: (message: string | null) => void): Promise<void> {
  try {
    const response = await fetchEquipment();
    setEquipment(response.data);
    setErrorMessage(null);
  } catch (error) {
    setErrorMessage(error instanceof Error ? error.message : String(error));
  }
}

async function refreshHealth(
  setHealthStatus: (status: "healthy" | "degraded" | "unhealthy" | "down" | "unknown") => void,
  setHealthData: (data: PlatformStatusResponse | null) => void,
  setErrorMessage: (message: string | null) => void
): Promise<void> {
  try {
    const response = await fetchPlatformStatus();
    setHealthStatus(response.overall);
    setHealthData(response);
    setErrorMessage(null);
    window.localStorage.setItem("splash.platform.status", JSON.stringify(response));
  } catch (error) {
    const cachedValue = window.localStorage.getItem("splash.platform.status");
    if (cachedValue) {
      try {
        const cached = JSON.parse(cachedValue) as PlatformStatusResponse;
        setHealthStatus("unknown");
        setHealthData(cached);
      } catch {
        // Ignore cache parse failure and surface the live error below.
      }
    }
    setErrorMessage(error instanceof Error ? error.message : String(error));
  }
}

function createConnectivityHistorySample(healthData: PlatformStatusResponse | null): ConnectivityHistorySample | null {
  const rs485Rates = healthData?.connectivity?.rs485;
  const natsBrokerRates = healthData?.connectivity?.nats_broker;
  const sample: ConnectivityHistorySample = {
    recorded_at: new Date().toISOString(),
    rs485_in_messages_per_second: normalizeRateSample(rs485Rates?.rx_messages_per_second),
    rs485_out_messages_per_second: normalizeRateSample(rs485Rates?.tx_messages_per_second),
    nats_in_messages_per_second: normalizeRateSample(natsBrokerRates?.in_messages_per_second),
    nats_out_messages_per_second: normalizeRateSample(natsBrokerRates?.out_messages_per_second)
  };

  if (
    sample.rs485_in_messages_per_second === null &&
    sample.rs485_out_messages_per_second === null &&
    sample.nats_in_messages_per_second === null &&
    sample.nats_out_messages_per_second === null
  ) {
    return null;
  }

  return sample;
}

function upsertConnectivityHistorySample(
  current: ConnectivityHistorySample[],
  nextSample: ConnectivityHistorySample
): ConnectivityHistorySample[] {
  if (current.length === 0) {
    return [nextSample];
  }

  const lastSample = current[current.length - 1];
  const lastTime = Date.parse(lastSample.recorded_at);
  const nextTime = Date.parse(nextSample.recorded_at);
  if (!Number.isNaN(lastTime) && !Number.isNaN(nextTime) && nextTime - lastTime <= CONNECTIVITY_SAMPLE_WINDOW_MS) {
    return [...current.slice(0, -1), nextSample];
  }

  return [...current, nextSample].slice(-CONNECTIVITY_SAMPLE_MAX_POINTS);
}

function normalizeRateSample(value: number | null | undefined): number | null {
  return typeof value === "number" ? value : null;
}

async function refreshBundles({
  setBundles,
  setBaselineBundleId,
  setComparisonBundleId,
  setSelectedBundleId,
  setExplorerError
}: {
  setBundles: (bundles: ProtocolBundleSummary[]) => void;
  setBaselineBundleId: (value: string) => void;
  setComparisonBundleId: (value: string) => void;
  setSelectedBundleId: (value: string) => void;
  setExplorerError: (value: string | null) => void;
}): Promise<void> {
  try {
    const response = await fetchProtocolBundles();
    const nextBundles = response.data;
    setBundles(nextBundles);
    setExplorerError(null);
    if (nextBundles.length > 0) {
      setSelectedBundleId(nextBundles[0]?.id || "");
      setBaselineBundleId(nextBundles[0]?.id || "");
      setComparisonBundleId(nextBundles[1]?.id || nextBundles[0]?.id || "");
    }
  } catch (error) {
    setExplorerError(error instanceof Error ? error.message : String(error));
  }
}

async function refreshExplorerMetadata(
  bundleId: string,
  setAnnotations: (value: ProtocolAnnotation[]) => void,
  setPrompts: (value: ProtocolPrompt[]) => void,
  setExplorerError: (value: string | null) => void
): Promise<void> {
  try {
    const [annotationResponse, promptResponse] = await Promise.all([fetchProtocolAnnotations(bundleId), fetchProtocolPrompts(bundleId)]);
    setAnnotations(annotationResponse.data);
    setPrompts(promptResponse.data);
    setExplorerError(null);
  } catch (error) {
    setExplorerError(error instanceof Error ? error.message : String(error));
  }
}

function appendFrame(
  setRecentFrames: Dispatch<SetStateAction<ProtocolFrameEvent[]>>,
  event: string,
  payload: Record<string, unknown>
): void {
  setRecentFrames((current) => [{ event, payload, received_at: new Date().toISOString() }, ...current].slice(0, 100));
}

function addActiveRequest(
  setActiveRequests: Dispatch<SetStateAction<ActivePlatformRequest[]>>,
  request: Omit<ActivePlatformRequest, "requestedAt">
): void {
  setActiveRequests((current) => [...current, { ...request, requestedAt: new Date().toISOString() }]);
}

function clearActiveRequestByReply(
  setActiveRequests: Dispatch<SetStateAction<ActivePlatformRequest[]>>,
  payload: Record<string, unknown>
): void {
  const messageType = readNullableString(payload.message_type);
  if (messageType !== "circuit_configuration" && messageType !== "controller_datetime") {
    return;
  }
  setActiveRequests((current) => removeFirstMatchingRequest(current, (request) => request.replyType === messageType));
}

function tryMatchCircuitConfigLookup(
  payload: Record<string, unknown>,
  pendingLookup: PendingCircuitConfigLookup
): CircuitConfigLookupResult | null {
  const messageType = readNullableString(payload.message_type);
  if (messageType !== "circuit_configuration") {
    return null;
  }

  const decodedAt = readNullableString(payload.decoded_at);
  if (decodedAt) {
    const decodedTime = Date.parse(decodedAt);
    const requestedTime = Date.parse(pendingLookup.requestedAt);
    if (!Number.isNaN(decodedTime) && !Number.isNaN(requestedTime) && decodedTime < requestedTime) {
      return null;
    }
  }

  const fields = normalizeProtocolFields(payload.fields);
  const circuitId = readNullableNumber(fields.circuit_id);
  if (circuitId !== pendingLookup.circuitIndex) {
    return null;
  }

  return {
    circuitId,
    functionId: readNullableNumber(fields.function_id),
    baseFunctionId: readNullableNumber(fields.base_function_id),
    baseFunctionLabel: readNullableString(fields.base_function_label),
    nameId: readNullableNumber(fields.name_id),
    nameLabel: readNullableString(fields.name_label),
    freezeFlag: readNullableBoolean(fields.freeze_flag),
    highFlag: readNullableBoolean(fields.high_flag)
  };
}

function clearActiveRequestByCommandResult(
  setActiveRequests: Dispatch<SetStateAction<ActivePlatformRequest[]>>,
  payload: Record<string, unknown>
): void {
  const commandId = readNullableString(payload.command_id);
  const status = readNullableString(payload.status);
  if (!commandId || !status || !isTerminalCommandStatus(status)) {
    return;
  }
  setActiveRequests((current) => current.filter((request) => request.commandId !== commandId));
}

function removeFirstMatchingRequest(
  requests: ActivePlatformRequest[],
  matcher: (request: ActivePlatformRequest) => boolean
): ActivePlatformRequest[] {
  const index = requests.findIndex(matcher);
  if (index < 0) {
    return requests;
  }
  return requests.filter((_, requestIndex) => requestIndex !== index);
}

function isTerminalCommandStatus(value: string): boolean {
  return value === "completed" || value === "failed" || value === "timed_out";
}

function parseEventPayload(event: MessageEvent<string>): Record<string, unknown> {
  return JSON.parse(event.data) as Record<string, unknown>;
}

function normalizeProtocolFields(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readNullableNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function readNullableBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}
