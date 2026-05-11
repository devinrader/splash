import type React from "react";
import { NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { CardHeading, NetworkTab } from "../components/mockUi";
import { DIAGNOSTICS_TABS, getActiveDiagnosticsTab } from "../navigation";
import { PlaceholderPage } from "./PlaceholderPage";
import type { ProtocolAnnotation, ProtocolBundleComparison, ProtocolBundleSummary, ProtocolFrameEvent, ProtocolPrompt, ProtocolPromptInputType } from "../types";
import type { ActivePlatformRequest } from "../viewUtils";
import {
  formatMessageLogTime,
  formatMessagesPerSecond,
  formatRequestTimestamp,
  getMessageLogDirection,
  getMessageLogDirectionTone,
  getMessageLogIdData,
  getMessageLogSource,
  getMessageLogStatus,
  getMessageLogStatusTone,
  getMessageLogType
} from "../viewUtils";

export function DiagnosticsPage(props: DiagnosticsPageProps) {
  const location = useLocation();
  const activeTab = getActiveDiagnosticsTab(location.pathname);

  return (
    <section className="diagnostics-shell">
      <div className="diagnostics-tabs" role="tablist" aria-label="Diagnostics tabs">
        {DIAGNOSTICS_TABS.map((tab) => (
          <NavLink
            key={tab.id}
            id={`diagnostics-tab-${tab.id}`}
            className={`diagnostics-tab ${activeTab === tab.id ? "diagnostics-tab-active" : ""}`}
            to={tab.path}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`diagnostics-panel-${tab.id}`}
          >
            {tab.label}
          </NavLink>
        ))}
      </div>
      <div id={`diagnostics-panel-${activeTab}`} className="diagnostics-tab-panel" role="tabpanel" aria-labelledby={`diagnostics-tab-${activeTab}`}>
        <Routes>
          <Route index element={<Navigate to="protocol-explorer" replace />} />
          <Route path="protocol-explorer" element={<ProtocolExplorerTab {...props} />} />
          <Route path="network" element={<NetworkTab />} />
          <Route path="live-data-monitor" element={<PlaceholderPage kicker="Diagnostics" title="Live Data Monitor" description="Streaming protocol and normalized telemetry views will land here once the first dedicated monitor surface is implemented." />} />
          <Route path="device-inspector" element={<PlaceholderPage kicker="Diagnostics" title="Device Inspector" description="Per-device capabilities, mappings, and low-level state inspection will appear here in a later diagnostics slice." />} />
          <Route path="logs-history" element={<PlaceholderPage kicker="Diagnostics" title="Logs & History" description="Historical diagnostics events and longer-running operator traces will surface here once retention workflows are in place." />} />
          <Route path="*" element={<Navigate to="protocol-explorer" replace />} />
        </Routes>
      </div>
    </section>
  );
}

function ProtocolExplorerTab(props: DiagnosticsPageProps) {
  const { bundleLabel, setBundleLabel, handleBundleSave, remoteLayoutPageIndex, setRemoteLayoutPageIndex, handleRemoteLayoutRequest, rawFrameHex, setRawFrameHex, handleRawFrameSend, activeRequests, isStreamPaused, setIsStreamPaused, autoScrollEnabled, setAutoScrollEnabled, deviceFilter, setDeviceFilter, messageTypeFilter, setMessageTypeFilter, messageLogLimit, setMessageLogLimit, availableDevices, availableMessageTypes, messageLogTableRef, visibleFrames, setRecentFrames, messagesPerSecond, bundles, selectedBundleId, setSelectedBundleId, baselineBundleId, setBaselineBundleId, comparisonBundleId, setComparisonBundleId, handleBundleCompare, bundleComparison, annotationFrameIndex, setAnnotationFrameIndex, annotationFieldName, setAnnotationFieldName, annotationByteStart, setAnnotationByteStart, annotationByteEnd, setAnnotationByteEnd, annotationConfidence, setAnnotationConfidence, annotationLabel, setAnnotationLabel, annotationNotes, setAnnotationNotes, handleAnnotationSubmit, annotations, promptFrameIndex, setPromptFrameIndex, promptFieldName, setPromptFieldName, promptQuestion, setPromptQuestion, promptWhy, setPromptWhy, promptInputType, setPromptInputType, handlePromptSubmit, prompts } = props;

  return (
    <section className="explorer-shell">
      <div className="explorer-header">
        <div>
          <p className="panel-kicker">Protocol Explorer</p>
          <h2>Live frames and collaborative decoding</h2>
          <p className="panel-copy">This panel is developer-facing on purpose. It helps capture controlled experiments, compare bundles, and record what still needs operator input.</p>
        </div>
        <div className="explorer-actions">
          <form className="inline-form" onSubmit={(event) => void handleBundleSave(event)}>
            <label htmlFor="bundle-label">Bundle label</label>
            <input id="bundle-label" value={bundleLabel} onChange={(event) => setBundleLabel(event.target.value)} placeholder="pool-high-before-change" />
            <button type="submit">Save frame bundle</button>
          </form>
          <form className="inline-form" onSubmit={(event) => void handleRemoteLayoutRequest(event)}>
            <label htmlFor="remote-layout-page-index">Remote Layout page</label>
            <input id="remote-layout-page-index" inputMode="numeric" pattern="[0-9]*" value={remoteLayoutPageIndex} onChange={(event) => setRemoteLayoutPageIndex(event.target.value)} />
            <button type="submit">Request page</button>
          </form>
          <form className="inline-form" onSubmit={(event) => void handleRawFrameSend(event)}>
            <label htmlFor="raw-frame-hex">Raw frame hex</label>
            <input id="raw-frame-hex" value={rawFrameHex} onChange={(event) => setRawFrameHex(event.target.value)} placeholder="ff00ffa5011022e1010001ba" />
            <button type="submit">Send raw frame</button>
          </form>
        </div>
      </div>
      <div className="explorer-grid">
        <article className="explorer-card">
          <CardHeading icon="pending" title="Active requests" />
          <p className="card-copy">Platform-originated dashboard requests stay here until the matching reply or terminal command result is observed.</p>
          <div className="record-list" role="list" aria-label="active platform requests">
            {activeRequests.length === 0 ? <p className="empty-state">No active platform requests.</p> : null}
            {activeRequests.map((request) => (
              <div className="record-card request-card" key={request.commandId} role="listitem">
                <strong>{request.label}</strong>
                <span>Command {request.commandId}</span>
                <span>Waiting for {request.waitingFor}</span>
                <span>Started {formatRequestTimestamp(request.requestedAt)}</span>
              </div>
            ))}
          </div>
        </article>
        <article className="explorer-card message-log-card">
          <div className="message-log-header">
            <div className="message-log-heading">
              <h3>Message Log (Live)</h3>
              <span className="message-log-streaming">
                <span className={`message-log-stream-dot ${isStreamPaused ? "message-log-stream-dot-paused" : ""}`} aria-hidden="true" />
                {isStreamPaused ? "Paused" : "Streaming"}
              </span>
            </div>
          </div>
          <div className="message-log-toolbar">
            <div className="message-log-filters">
              <label><span className="sr-only">Filter devices</span><select value={deviceFilter} onChange={(event) => setDeviceFilter(event.target.value)} aria-label="Filter devices"><option value="all">All Devices</option>{availableDevices.map((device) => <option key={device} value={device}>{device}</option>)}</select></label>
              <label><span className="sr-only">Filter message types</span><select value={messageTypeFilter} onChange={(event) => setMessageTypeFilter(event.target.value)} aria-label="Filter message types"><option value="all">All Message Types</option>{availableMessageTypes.map((messageType) => <option key={messageType} value={messageType}>{messageType}</option>)}</select></label>
              <label><span className="sr-only">Message count</span><select value={messageLogLimit} onChange={(event) => setMessageLogLimit(event.target.value)} aria-label="Message count"><option value="25">Last 25 Messages</option><option value="50">Last 50 Messages</option><option value="100">Last 100 Messages</option></select></label>
            </div>
            <div className="message-log-controls">
              <button type="button" className={`message-log-pill ${autoScrollEnabled ? "message-log-pill-active" : ""}`} onClick={() => setAutoScrollEnabled((current) => !current)} aria-pressed={autoScrollEnabled}>Auto-scroll</button>
              <button type="button" className="message-log-button" onClick={() => setIsStreamPaused((current) => !current)}>{isStreamPaused ? "Resume" : "Pause"}</button>
              <button type="button" className="message-log-button" onClick={() => setRecentFrames([])}>Clear</button>
            </div>
          </div>
          <div className="message-log-table-shell" ref={messageLogTableRef}>
            <table className="message-log-table">
              <thead><tr><th>Time</th><th>Direction</th><th>Source</th><th>Message Type</th><th>Message ID / Data</th><th>Status</th></tr></thead>
              <tbody>
                {visibleFrames.length === 0 ? (
                  <tr><td colSpan={6} className="message-log-empty">No protocol frames match the current filter.</td></tr>
                ) : (
                  visibleFrames.map((frame, index) => (
                    <tr key={`${frame.event}-${frame.received_at}-${index}`}>
                      <td>{formatMessageLogTime(frame.received_at)}</td>
                      <td><span className={`message-direction-pill message-direction-pill-${getMessageLogDirectionTone(frame)}`}>{getMessageLogDirection(frame)}</span></td>
                      <td>{getMessageLogSource(frame)}</td>
                      <td>{getMessageLogType(frame)}</td>
                      <td>{getMessageLogIdData(frame)}</td>
                      <td><span className={`message-log-status message-log-status-${getMessageLogStatusTone(frame)}`}><span className="message-log-status-dot" aria-hidden="true" />{getMessageLogStatus(frame)}</span></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="message-log-footer"><a href="#message-log" className="message-log-link">Full message log</a><span className="message-log-rate">Messages per second: {messagesPerSecond}</span></div>
        </article>
        <article className="explorer-card">
          <CardHeading icon="download" title="Saved bundles" />
          <p className="card-copy">Capture recent traffic windows for baseline and comparison experiments.</p>
          <div className="bundle-list">
            {bundles.map((bundle) => (
              <button className={`bundle-chip ${selectedBundleId === bundle.id ? "bundle-chip-active" : ""}`} key={bundle.id} type="button" onClick={() => setSelectedBundleId(bundle.id)}>
                <strong>{bundle.label ?? "Untitled bundle"}</strong>
                <span>{bundle.frame_count} frames</span>
              </button>
            ))}
            {bundles.length === 0 ? <p className="empty-state">No saved bundles yet.</p> : null}
          </div>
          <div className="compare-controls">
            <label>Baseline bundle<select value={baselineBundleId} onChange={(event) => setBaselineBundleId(event.target.value)}><option value="">Select baseline</option>{bundles.map((bundle) => <option key={bundle.id} value={bundle.id}>{bundle.label ?? bundle.id}</option>)}</select></label>
            <label>Comparison bundle<select value={comparisonBundleId} onChange={(event) => setComparisonBundleId(event.target.value)}><option value="">Select comparison</option>{bundles.map((bundle) => <option key={bundle.id} value={bundle.id}>{bundle.label ?? bundle.id}</option>)}</select></label>
            <button type="button" onClick={() => void handleBundleCompare()}>Compare bundles</button>
          </div>
        </article>
        <article className="explorer-card explorer-card-wide">
          <CardHeading icon="insights" title="Bundle diff" />
          <p className="card-copy">Positional byte-level changes for `bytes_hex` and `payload_hex` fields.</p>
          {bundleComparison ? (
            <div className="diff-list">
              {bundleComparison.frame_pairs.map((pair) => (
                <div className="diff-item" key={pair.index}>
                  <div className="frame-meta"><strong>Frame {pair.index}</strong><span>{pair.baseline_event ?? "missing"} → {pair.comparison_event ?? "missing"}</span></div>
                  {pair.changed_fields.length === 0 ? (
                    <p className="empty-state">No byte-level hex changes for this frame pair.</p>
                  ) : (
                    pair.changed_fields.map((field) => (
                      <div key={`${pair.index}-${field.field}`}>
                        <p className="field-heading">{field.field}</p>
                        <ul className="byte-change-list">
                          {field.byte_changes.map((change) => <li key={`${pair.index}-${field.field}-${change.byte_index}`}>byte {change.byte_index}: <code>{change.baseline || "--"}</code> → <code>{change.comparison || "--"}</code></li>)}
                        </ul>
                      </div>
                    ))
                  )}
                </div>
              ))}
            </div>
          ) : <p className="empty-state">Select two bundles and run a comparison.</p>}
        </article>
        <article className="explorer-card">
          <CardHeading icon="edit" title="Annotations" />
          <p className="card-copy">Confidence-aware byte-range notes for the selected bundle.</p>
          <form className="stack-form" onSubmit={(event) => void handleAnnotationSubmit(event)}>
            <label>Frame index<input value={annotationFrameIndex} onChange={(event) => setAnnotationFrameIndex(event.target.value)} /></label>
            <label>Field name<input value={annotationFieldName} onChange={(event) => setAnnotationFieldName(event.target.value)} /></label>
            <label>Byte start<input value={annotationByteStart} onChange={(event) => setAnnotationByteStart(event.target.value)} /></label>
            <label>Byte end<input value={annotationByteEnd} onChange={(event) => setAnnotationByteEnd(event.target.value)} /></label>
            <label>Confidence<select value={annotationConfidence} onChange={(event) => setAnnotationConfidence(event.target.value as typeof annotationConfidence)}><option value="known">known</option><option value="inferred">inferred</option><option value="unknown">unknown</option></select></label>
            <label>Label<input value={annotationLabel} onChange={(event) => setAnnotationLabel(event.target.value)} /></label>
            <label>Notes<textarea value={annotationNotes} onChange={(event) => setAnnotationNotes(event.target.value)} /></label>
            <button type="submit">Save annotation</button>
          </form>
          <div className="record-list">
            {annotations.map((annotation) => <div className="record-card" key={annotation.id}><strong>{annotation.label}</strong><span>{annotation.field_name} bytes {annotation.byte_start}-{annotation.byte_end} · {annotation.confidence}</span>{annotation.notes ? <p>{annotation.notes}</p> : null}</div>)}
            {selectedBundleId && annotations.length === 0 ? <p className="empty-state">No annotations for this bundle yet.</p> : null}
          </div>
        </article>
        <article className="explorer-card">
          <CardHeading icon="message" title="Operator prompts" />
          <p className="card-copy">Questions that need controller or equipment context from the operator.</p>
          <form className="stack-form" onSubmit={(event) => void handlePromptSubmit(event)}>
            <label>Frame index<input value={promptFrameIndex} onChange={(event) => setPromptFrameIndex(event.target.value)} /></label>
            <label>Field name<input value={promptFieldName} onChange={(event) => setPromptFieldName(event.target.value)} /></label>
            <label>Prompt<input value={promptQuestion} onChange={(event) => setPromptQuestion(event.target.value)} /></label>
            <label>Why it matters<textarea value={promptWhy} onChange={(event) => setPromptWhy(event.target.value)} /></label>
            <label>Expected input type<select value={promptInputType} onChange={(event) => setPromptInputType(event.target.value as typeof promptInputType)}><option value="controller_menu_state">controller_menu_state</option><option value="equipment_behavior">equipment_behavior</option><option value="circuit_name">circuit_name</option><option value="configured_rpm">configured_rpm</option></select></label>
            <button type="submit">Save prompt</button>
          </form>
          <div className="record-list">
            {prompts.map((prompt) => <div className="record-card" key={prompt.id}><strong>{prompt.prompt}</strong><span>{prompt.input_type} · {prompt.status}</span><p>{prompt.why}</p></div>)}
            {selectedBundleId && prompts.length === 0 ? <p className="empty-state">No prompts for this bundle yet.</p> : null}
          </div>
        </article>
      </div>
    </section>
  );
}

export interface DiagnosticsPageProps {
  bundleLabel: string;
  setBundleLabel: React.Dispatch<React.SetStateAction<string>>;
  remoteLayoutPageIndex: string;
  setRemoteLayoutPageIndex: React.Dispatch<React.SetStateAction<string>>;
  rawFrameHex: string;
  setRawFrameHex: React.Dispatch<React.SetStateAction<string>>;
  activeRequests: ActivePlatformRequest[];
  isStreamPaused: boolean;
  setIsStreamPaused: React.Dispatch<React.SetStateAction<boolean>>;
  autoScrollEnabled: boolean;
  setAutoScrollEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  deviceFilter: string;
  setDeviceFilter: React.Dispatch<React.SetStateAction<string>>;
  messageTypeFilter: string;
  setMessageTypeFilter: React.Dispatch<React.SetStateAction<string>>;
  messageLogLimit: string;
  setMessageLogLimit: React.Dispatch<React.SetStateAction<string>>;
  recentFrames: ProtocolFrameEvent[];
  setRecentFrames: React.Dispatch<React.SetStateAction<ProtocolFrameEvent[]>>;
  visibleFrames: ProtocolFrameEvent[];
  availableDevices: string[];
  availableMessageTypes: string[];
  messagesPerSecond: string;
  bundles: ProtocolBundleSummary[];
  baselineBundleId: string;
  setBaselineBundleId: React.Dispatch<React.SetStateAction<string>>;
  comparisonBundleId: string;
  setComparisonBundleId: React.Dispatch<React.SetStateAction<string>>;
  bundleComparison: ProtocolBundleComparison | null;
  selectedBundleId: string;
  setSelectedBundleId: React.Dispatch<React.SetStateAction<string>>;
  annotations: ProtocolAnnotation[];
  prompts: ProtocolPrompt[];
  annotationLabel: string;
  setAnnotationLabel: React.Dispatch<React.SetStateAction<string>>;
  annotationNotes: string;
  setAnnotationNotes: React.Dispatch<React.SetStateAction<string>>;
  annotationFieldName: string;
  setAnnotationFieldName: React.Dispatch<React.SetStateAction<string>>;
  annotationFrameIndex: string;
  setAnnotationFrameIndex: React.Dispatch<React.SetStateAction<string>>;
  annotationByteStart: string;
  setAnnotationByteStart: React.Dispatch<React.SetStateAction<string>>;
  annotationByteEnd: string;
  setAnnotationByteEnd: React.Dispatch<React.SetStateAction<string>>;
  annotationConfidence: "known" | "inferred" | "unknown";
  setAnnotationConfidence: React.Dispatch<React.SetStateAction<"known" | "inferred" | "unknown">>;
  promptQuestion: string;
  setPromptQuestion: React.Dispatch<React.SetStateAction<string>>;
  promptWhy: string;
  setPromptWhy: React.Dispatch<React.SetStateAction<string>>;
  promptFieldName: string;
  setPromptFieldName: React.Dispatch<React.SetStateAction<string>>;
  promptFrameIndex: string;
  setPromptFrameIndex: React.Dispatch<React.SetStateAction<string>>;
  promptInputType: ProtocolPromptInputType;
  setPromptInputType: React.Dispatch<React.SetStateAction<ProtocolPromptInputType>>;
  messageLogTableRef: React.RefObject<HTMLDivElement | null>;
  handleBundleSave: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
  handleRemoteLayoutRequest: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
  handleRawFrameSend: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
  handleBundleCompare: () => Promise<void>;
  handleAnnotationSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
  handlePromptSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
}
