import { startTransition, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import {
  buildApiUrl,
  compareProtocolBundles,
  createProtocolAnnotation,
  createProtocolBundle,
  createProtocolPrompt,
  fetchEquipment,
  fetchHealth,
  fetchProtocolAnnotations,
  fetchProtocolBundles,
  fetchProtocolPrompts,
  requestRemoteLayoutPage,
  sendRawProtocolFrame,
  requestPumpSpeed
} from "./api";
import { useFrontendStore } from "./store";
import type {
  EquipmentRecord,
  ProtocolAnnotation,
  ProtocolBundleComparison,
  ProtocolBundleSummary,
  ProtocolFrameEvent,
  ProtocolPrompt
} from "./types";
import "./styles.css";

export default function App() {
  const equipment = useFrontendStore((state) => state.equipment);
  const healthStatus = useFrontendStore((state) => state.healthStatus);
  const sseStatus = useFrontendStore((state) => state.sseStatus);
  const errorMessage = useFrontendStore((state) => state.errorMessage);
  const command = useFrontendStore((state) => state.command);
  const setEquipment = useFrontendStore((state) => state.setEquipment);
  const setHealthStatus = useFrontendStore((state) => state.setHealthStatus);
  const setSseStatus = useFrontendStore((state) => state.setSseStatus);
  const setErrorMessage = useFrontendStore((state) => state.setErrorMessage);
  const beginPumpCommand = useFrontendStore((state) => state.beginPumpCommand);
  const applyCommandResult = useFrontendStore((state) => state.applyCommandResult);
  const applyEquipmentStateEvent = useFrontendStore((state) => state.applyEquipmentStateEvent);
  const applyPumpStateEvent = useFrontendStore((state) => state.applyPumpStateEvent);

  const [rpmInput, setRpmInput] = useState("2800");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bundleLabel, setBundleLabel] = useState("");
  const [remoteLayoutPageIndex, setRemoteLayoutPageIndex] = useState("0");
  const [rawFrameHex, setRawFrameHex] = useState("ff00ffa5011022e1010001ba");
  const [recentFrames, setRecentFrames] = useState<ProtocolFrameEvent[]>([]);
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
  const [promptInputType, setPromptInputType] = useState<"controller_menu_state" | "equipment_behavior" | "circuit_name" | "configured_rpm">(
    "controller_menu_state"
  );
  const [explorerError, setExplorerError] = useState<string | null>(null);

  useEffect(() => {
    void loadInitialState({ setEquipment, setHealthStatus, setErrorMessage });
    void refreshBundles({
      setBundles,
      setBaselineBundleId,
      setComparisonBundleId,
      setSelectedBundleId,
      setExplorerError
    });
  }, [setEquipment, setErrorMessage, setHealthStatus]);

  useEffect(() => {
    setSseStatus("connecting");
    const source = new EventSource(buildApiUrl("/events"));

    source.addEventListener("ready", () => {
      setSseStatus("connected");
      void refreshEquipment(setEquipment, setErrorMessage);
      void refreshHealth(setHealthStatus, setErrorMessage);
    });

    source.addEventListener("equipment.state", (event) => {
      startTransition(() => {
        applyEquipmentStateEvent(parseEventPayload(event));
      });
    });

    source.addEventListener("pump.state", (event) => {
      startTransition(() => {
        applyPumpStateEvent(parseEventPayload(event));
      });
    });

    source.addEventListener("command.result", (event) => {
      startTransition(() => {
        applyCommandResult(parseEventPayload(event));
      });
    });

    source.onerror = () => {
      setSseStatus("disconnected");
      void refreshHealth(setHealthStatus, setErrorMessage);
    };

    return () => {
      source.close();
    };
  }, [applyCommandResult, applyEquipmentStateEvent, applyPumpStateEvent, setEquipment, setErrorMessage, setHealthStatus, setSseStatus]);

  useEffect(() => {
    const source = new EventSource(buildApiUrl("/protocol/frames"));

    source.addEventListener("protocol.frame.raw", (event) => {
      appendFrame(setRecentFrames, "protocol.frame.raw", parseEventPayload(event));
    });

    source.addEventListener("protocol.frame.decoded", (event) => {
      appendFrame(setRecentFrames, "protocol.frame.decoded", parseEventPayload(event));
    });

    source.addEventListener("protocol.command.encoded", (event) => {
      appendFrame(setRecentFrames, "protocol.command.encoded", parseEventPayload(event));
    });

    source.addEventListener("serial.tx.raw", (event) => {
      appendFrame(setRecentFrames, "serial.tx.raw", parseEventPayload(event));
    });

    source.onerror = () => {
      setExplorerError((current) => current ?? "Protocol frame stream disconnected.");
    };

    return () => {
      source.close();
    };
  }, []);

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
      const response = await requestPumpSpeed({ equipmentId: pump.id, rpm });
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
      await refreshBundles({
        setBundles,
        setBaselineBundleId,
        setComparisonBundleId,
        setSelectedBundleId,
        setExplorerError
      });
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
      applyCommandResult({
        command_id: response.data.command_id,
        status: response.data.status,
        detail: `Manual Remote Layout request for page ${pageIndex} accepted.`
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
      const response = await sendRawProtocolFrame({
        protocolName: "pentair_easytouch",
        bytesHex
      });
      applyCommandResult({
        command_id: response.data.command_id,
        status: response.data.status,
        detail: `Manual raw frame send accepted for ${bytesHex}.`
      });
    } catch (error) {
      setExplorerError(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleBundleCompare(): Promise<void> {
    if (!baselineBundleId || !comparisonBundleId) {
      setExplorerError("Select both a baseline and comparison bundle.");
      return;
    }

    try {
      setExplorerError(null);
      const response = await compareProtocolBundles({
        baselineBundleId,
        comparisonBundleId
      });
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

  return (
    <main className="page-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Milestone 1</p>
          <h1>Pool equipment read and control</h1>
          <p className="hero-copy">
            Live temperatures, salt, and pump RPM with a controller-facing browser control path and a developer Protocol Explorer for reverse engineering.
          </p>
        </div>
        <div className="status-cluster" aria-label="service status">
          <StatusPill label="API" value={healthStatus} />
          <StatusPill label="Events" value={sseStatus} />
          <StatusPill label="Command" value={command.status ?? "idle"} />
        </div>
      </section>

      {errorMessage ? (
        <section className="notice notice-error" role="alert">
          {errorMessage}
        </section>
      ) : null}

      {command.detail ? (
        <section className="notice" aria-live="polite">
          <strong>{formatCommandStatus(command.status)}</strong>
          <span>{command.detail}</span>
        </section>
      ) : null}

      {explorerError ? (
        <section className="notice notice-error" role="alert">
          {explorerError}
        </section>
      ) : null}

      <section className="dashboard-grid">
        <MetricCard label="Air Temperature" value={readMetric(controller?.latest_state.air_temp_f)} unit="°F" accent="sky" />
        <MetricCard label="Water Temperature" value={readMetric(controller?.latest_state.water_temp_f)} unit="°F" accent="water" />
        <MetricCard label="Salt Level" value={readMetric(chlorinator?.latest_state.salt_ppm)} unit="ppm" accent="sand" />
        <MetricCard label="Pump Speed" value={readMetric(pump?.latest_state.rpm)} unit="RPM" accent="pump" />
      </section>

      <section className="control-panel">
        <div>
          <p className="panel-kicker">Pump control</p>
          <h2>{pump?.display_name ?? "Main Pump"}</h2>
          <p className="panel-copy">
            The milestone command path stays on the production control loop while the Explorer below helps decode controller traffic and config writes.
          </p>
          <dl className="detail-grid">
            <div>
              <dt>Current RPM</dt>
              <dd>{formatMetric(readMetric(pump?.latest_state.rpm), "RPM")}</dd>
            </div>
            <div>
              <dt>Running</dt>
              <dd>{formatBoolean(pump?.latest_state.running)}</dd>
            </div>
            <div>
              <dt>Target bus address</dt>
              <dd>{typeof pump?.bus_address === "string" ? pump.bus_address : "Unavailable"}</dd>
            </div>
          </dl>
        </div>

        <form className="control-form" onSubmit={(event) => void handlePumpSubmit(event)}>
          <label htmlFor="pump-rpm">Requested RPM</label>
          <input
            id="pump-rpm"
            inputMode="numeric"
            pattern="[0-9]*"
            value={rpmInput}
            onChange={(event) => setRpmInput(event.target.value)}
            disabled={pendingCommand || !pump}
          />
          <button type="submit" disabled={pendingCommand || !pump}>
            {pendingCommand ? "Waiting for command result..." : "Set pump speed"}
          </button>
          <p className="form-caption">Pump speed changes remain disabled while the prior command is unresolved.</p>
        </form>
      </section>

      <section className="explorer-shell">
        <div className="explorer-header">
          <div>
            <p className="panel-kicker">Protocol Explorer</p>
            <h2>Live frames and collaborative decoding</h2>
            <p className="panel-copy">
              This panel is developer-facing on purpose. It helps capture controlled experiments, compare bundles, and record what still needs operator input.
            </p>
          </div>
          <div className="explorer-actions">
            <form className="inline-form" onSubmit={(event) => void handleBundleSave(event)}>
              <label htmlFor="bundle-label">Bundle label</label>
              <input
                id="bundle-label"
                value={bundleLabel}
                onChange={(event) => setBundleLabel(event.target.value)}
                placeholder="pool-high-before-change"
              />
              <button type="submit">Save frame bundle</button>
            </form>
            <form className="inline-form" onSubmit={(event) => void handleRemoteLayoutRequest(event)}>
              <label htmlFor="remote-layout-page-index">Remote Layout page</label>
              <input
                id="remote-layout-page-index"
                inputMode="numeric"
                pattern="[0-9]*"
                value={remoteLayoutPageIndex}
                onChange={(event) => setRemoteLayoutPageIndex(event.target.value)}
              />
              <button type="submit">Request page</button>
            </form>
            <form className="inline-form" onSubmit={(event) => void handleRawFrameSend(event)}>
              <label htmlFor="raw-frame-hex">Raw frame hex</label>
              <input
                id="raw-frame-hex"
                value={rawFrameHex}
                onChange={(event) => setRawFrameHex(event.target.value)}
                placeholder="ff00ffa5011022e1010001ba"
              />
              <button type="submit">Send raw frame</button>
            </form>
          </div>
        </div>

        <div className="explorer-grid">
          <article className="explorer-card">
            <h3>Live frame stream</h3>
            <p className="card-copy">Recent raw and decoded frame events from `/protocol/frames`.</p>
            <div className="frame-list">
              {recentFrames.length === 0 ? <p className="empty-state">Waiting for protocol frames...</p> : null}
              {recentFrames.map((frame, index) => (
                <div className="frame-item" key={`${frame.event}-${index}`}>
                  <div className="frame-meta">
                    <strong>{frame.event}</strong>
                    <span>{summarizeFrame(frame.payload)}</span>
                  </div>
                  <pre>{JSON.stringify(frame.payload, null, 2)}</pre>
                </div>
              ))}
            </div>
          </article>

          <article className="explorer-card">
            <h3>Saved bundles</h3>
            <p className="card-copy">Capture recent traffic windows for baseline and comparison experiments.</p>
            <div className="bundle-list">
              {bundles.map((bundle) => (
                <button
                  className={`bundle-chip ${selectedBundleId === bundle.id ? "bundle-chip-active" : ""}`}
                  key={bundle.id}
                  type="button"
                  onClick={() => setSelectedBundleId(bundle.id)}
                >
                  <strong>{bundle.label ?? "Untitled bundle"}</strong>
                  <span>{bundle.frame_count} frames</span>
                </button>
              ))}
              {bundles.length === 0 ? <p className="empty-state">No saved bundles yet.</p> : null}
            </div>

            <div className="compare-controls">
              <label>
                Baseline bundle
                <select value={baselineBundleId} onChange={(event) => setBaselineBundleId(event.target.value)}>
                  <option value="">Select baseline</option>
                  {bundles.map((bundle) => (
                    <option key={bundle.id} value={bundle.id}>
                      {bundle.label ?? bundle.id}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Comparison bundle
                <select value={comparisonBundleId} onChange={(event) => setComparisonBundleId(event.target.value)}>
                  <option value="">Select comparison</option>
                  {bundles.map((bundle) => (
                    <option key={bundle.id} value={bundle.id}>
                      {bundle.label ?? bundle.id}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" onClick={() => void handleBundleCompare()}>
                Compare bundles
              </button>
            </div>
          </article>

          <article className="explorer-card explorer-card-wide">
            <h3>Bundle diff</h3>
            <p className="card-copy">Positional byte-level changes for `bytes_hex` and `payload_hex` fields.</p>
            {bundleComparison ? (
              <div className="diff-list">
                {bundleComparison.frame_pairs.map((pair) => (
                  <div className="diff-item" key={pair.index}>
                    <div className="frame-meta">
                      <strong>Frame {pair.index}</strong>
                      <span>
                        {pair.baseline_event ?? "missing"} → {pair.comparison_event ?? "missing"}
                      </span>
                    </div>
                    {pair.changed_fields.length === 0 ? (
                      <p className="empty-state">No byte-level hex changes for this frame pair.</p>
                    ) : (
                      pair.changed_fields.map((field) => (
                        <div key={`${pair.index}-${field.field}`}>
                          <p className="field-heading">{field.field}</p>
                          <ul className="byte-change-list">
                            {field.byte_changes.map((change) => (
                              <li key={`${pair.index}-${field.field}-${change.byte_index}`}>
                                byte {change.byte_index}: <code>{change.baseline || "--"}</code> →{" "}
                                <code>{change.comparison || "--"}</code>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty-state">Select two bundles and run a comparison.</p>
            )}
          </article>

          <article className="explorer-card">
            <h3>Annotations</h3>
            <p className="card-copy">Confidence-aware byte-range notes for the selected bundle.</p>
            <form className="stack-form" onSubmit={(event) => void handleAnnotationSubmit(event)}>
              <label>
                Frame index
                <input value={annotationFrameIndex} onChange={(event) => setAnnotationFrameIndex(event.target.value)} />
              </label>
              <label>
                Field name
                <input value={annotationFieldName} onChange={(event) => setAnnotationFieldName(event.target.value)} />
              </label>
              <label>
                Byte start
                <input value={annotationByteStart} onChange={(event) => setAnnotationByteStart(event.target.value)} />
              </label>
              <label>
                Byte end
                <input value={annotationByteEnd} onChange={(event) => setAnnotationByteEnd(event.target.value)} />
              </label>
              <label>
                Confidence
                <select value={annotationConfidence} onChange={(event) => setAnnotationConfidence(event.target.value as typeof annotationConfidence)}>
                  <option value="known">known</option>
                  <option value="inferred">inferred</option>
                  <option value="unknown">unknown</option>
                </select>
              </label>
              <label>
                Label
                <input value={annotationLabel} onChange={(event) => setAnnotationLabel(event.target.value)} />
              </label>
              <label>
                Notes
                <textarea value={annotationNotes} onChange={(event) => setAnnotationNotes(event.target.value)} />
              </label>
              <button type="submit">Save annotation</button>
            </form>
            <div className="record-list">
              {annotations.map((annotation) => (
                <div className="record-card" key={annotation.id}>
                  <strong>{annotation.label}</strong>
                  <span>
                    {annotation.field_name} bytes {annotation.byte_start}-{annotation.byte_end} · {annotation.confidence}
                  </span>
                  {annotation.notes ? <p>{annotation.notes}</p> : null}
                </div>
              ))}
              {selectedBundleId && annotations.length === 0 ? <p className="empty-state">No annotations for this bundle yet.</p> : null}
            </div>
          </article>

          <article className="explorer-card">
            <h3>Operator prompts</h3>
            <p className="card-copy">Questions that need controller or equipment context from the operator.</p>
            <form className="stack-form" onSubmit={(event) => void handlePromptSubmit(event)}>
              <label>
                Frame index
                <input value={promptFrameIndex} onChange={(event) => setPromptFrameIndex(event.target.value)} />
              </label>
              <label>
                Field name
                <input value={promptFieldName} onChange={(event) => setPromptFieldName(event.target.value)} />
              </label>
              <label>
                Prompt
                <input value={promptQuestion} onChange={(event) => setPromptQuestion(event.target.value)} />
              </label>
              <label>
                Why it matters
                <textarea value={promptWhy} onChange={(event) => setPromptWhy(event.target.value)} />
              </label>
              <label>
                Expected input type
                <select value={promptInputType} onChange={(event) => setPromptInputType(event.target.value as typeof promptInputType)}>
                  <option value="controller_menu_state">controller_menu_state</option>
                  <option value="equipment_behavior">equipment_behavior</option>
                  <option value="circuit_name">circuit_name</option>
                  <option value="configured_rpm">configured_rpm</option>
                </select>
              </label>
              <button type="submit">Save prompt</button>
            </form>
            <div className="record-list">
              {prompts.map((prompt) => (
                <div className="record-card" key={prompt.id}>
                  <strong>{prompt.prompt}</strong>
                  <span>
                    {prompt.input_type} · {prompt.status}
                  </span>
                  <p>{prompt.why}</p>
                </div>
              ))}
              {selectedBundleId && prompts.length === 0 ? <p className="empty-state">No prompts for this bundle yet.</p> : null}
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}

function MetricCard({
  label,
  value,
  unit,
  accent
}: {
  label: string;
  value: number | null;
  unit: string;
  accent: "sky" | "water" | "sand" | "pump";
}) {
  return (
    <article className={`metric-card metric-card-${accent}`}>
      <p>{label}</p>
      <strong>{formatMetric(value, unit)}</strong>
    </article>
  );
}

function StatusPill({ label, value }: { label: string; value: string }) {
  return (
    <div className={`status-pill status-${value}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

async function loadInitialState({
  setEquipment,
  setHealthStatus,
  setErrorMessage
}: {
  setEquipment: (records: EquipmentRecord[]) => void;
  setHealthStatus: (status: "unknown" | "ok" | "degraded") => void;
  setErrorMessage: (message: string | null) => void;
}): Promise<void> {
  try {
    const [equipmentResponse, healthResponse] = await Promise.all([fetchEquipment(), fetchHealth()]);
    startTransition(() => {
      setEquipment(equipmentResponse.data);
      setHealthStatus(healthResponse.status);
      setErrorMessage(null);
    });
  } catch (error) {
    setErrorMessage(error instanceof Error ? error.message : String(error));
  }
}

async function refreshEquipment(
  setEquipment: (records: EquipmentRecord[]) => void,
  setErrorMessage: (message: string | null) => void
): Promise<void> {
  try {
    const response = await fetchEquipment();
    setEquipment(response.data);
    setErrorMessage(null);
  } catch (error) {
    setErrorMessage(error instanceof Error ? error.message : String(error));
  }
}

async function refreshHealth(
  setHealthStatus: (status: "unknown" | "ok" | "degraded") => void,
  setErrorMessage: (message: string | null) => void
): Promise<void> {
  try {
    const response = await fetchHealth();
    setHealthStatus(response.status);
    setErrorMessage(null);
  } catch (error) {
    setErrorMessage(error instanceof Error ? error.message : String(error));
  }
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
    const [annotationResponse, promptResponse] = await Promise.all([
      fetchProtocolAnnotations(bundleId),
      fetchProtocolPrompts(bundleId)
    ]);
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
  setRecentFrames((current) => [{ event, payload }, ...current].slice(0, 12));
}

function parseEventPayload(event: MessageEvent<string>): Record<string, unknown> {
  return JSON.parse(event.data) as Record<string, unknown>;
}

function readMetric(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function formatMetric(value: number | null, unit: string): string {
  return value == null ? "Unavailable" : `${value} ${unit}`;
}

function formatBoolean(value: unknown): string {
  if (typeof value !== "boolean") {
    return "Unavailable";
  }

  return value ? "Yes" : "No";
}

function formatCommandStatus(status: string | null): string {
  switch (status) {
    case "completed":
      return "Command completed";
    case "failed":
      return "Command failed";
    case "timed_out":
      return "Command timed out";
    case "transmitted":
      return "Command transmitted";
    case "encoded":
      return "Command encoded";
    case "accepted":
      return "Command accepted";
    default:
      return "Command update";
  }
}

function summarizeFrame(payload: Record<string, unknown>): string {
  if (typeof payload.action_code === "string") {
    return payload.action_code;
  }
  if (typeof payload.frame_id === "string") {
    return payload.frame_id;
  }
  return "frame";
}
