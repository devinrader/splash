import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import readline from "node:readline";
import { stdin as input, stdout as output } from "node:process";
import { fileURLToPath } from "node:url";

const APP_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(APP_DIR, "..", "..");
const RECENT_EVENT_LIMIT = 8;
const RECENT_CHANGE_LIMIT = 10;

export const FEATURE_CIRCUITS = Object.freeze([
  "pool_low",
  "pool_high",
  "cleaner",
  "feature4",
  "feature5",
  "feature6",
  "feature7",
  "feature8"
]);

export const SYSTEM_CIRCUITS = Object.freeze([
  "pool",
  "aux1",
  "aux2",
  "aux3",
  "aux4",
  "aux5",
  "aux6",
  "aux7",
  "aux_extra"
]);

export const FEATURE8_NAME_LABELS = Object.freeze([
  "FEATURE 1", "FEATURE 2", "FEATURE 3", "FEATURE 4", "FEATURE 5", "FEATURE 6", "FEATURE 7", "FEATURE 8",
  "AERATOR", "AIR BLOWER", "AUX 1", "AUX 2", "AUX 3", "AUX 4", "AUX 5", "AUX 6", "AUX 7", "AUX 8", "AUX 9", "AUX 10",
  "BACKWASH", "BACK LIGHT", "BBQ LIGHT", "BEACH LIGHT", "BOOSTER PUMP", "BUG LIGHT", "CABANA LIGHTS", "CHEM FEEDER",
  "CHLORINATOR", "CLEANER", "COLOR WHEEL", "DECK LIGHT", "DRAIN LINE", "DRIVE LIGHTS", "EDGE PUMP", "ENTRY LIGHT",
  "FAN", "FIBER OPTIC", "FIBER WORKS", "FILL LINE", "FLOOR CLEANER", "FOGGER", "FOUNTAIN", "FOUNTAIN 1", "FOUNTAIN 2",
  "FOUNTAIN 3", "FOUNTAINS", "FRONT LIGHT", "GARDEN LIGHTS", "GAZEBO LIGHTS", "HIGH SPEED", "HI TEMP", "HOUSE LIGHTS",
  "JETS", "LIGHTS", "LOW SPEED", "LO TEMP", "MALIBU LIGHTS", "MIST", "MUSIC", "NOT USED", "OZONATER", "PATH LIGHTS",
  "PATIO LIGHTS", "PARAMETER LIGHTS", "PG2000", "POND LIGHT", "POND PUMP", "POOL", "Pool high", "Pool light", "Pool low",
  "Pool sam", "Pool sam 1", "Pool sam 2", "Pool sam 3", "Security light", "Sliude", "Solar", "Spa", "Spa high",
  "Spa light", "Spa low", "Spa sal", "Spa sam", "Spa waterfall", "Spillway", "SPRINKLERS", "STREAM", "STATUE LT",
  "SWIM JETS", "WTR FEATURES", "WTR FTR LT", "WATERFALL", "WATERFALL  1", "WATERFALL 2", "WATERFALL 3", "WHIRLPOOL",
  "WTRFL LIGHT", "YARD LIGHT", "AUX EXTRA"
]);

export const AUX6_FUNCTION_LABELS = Object.freeze([
  "GENERIC",
  "MAST CLEANER",
  "LIGHT",
  "SAM LIGHT",
  "SAL LIGHT",
  "PHOTON GEN",
  "COLOR WHEEL",
  "VALVE",
  "SPILLWAY",
  "FLOOR CLEANER",
  "INTELLIBRIGHT",
  "MAGIC STREAM"
]);

const SWEEP_DEFINITIONS = Object.freeze({
  feature: {
    sweepType: "feature",
    title: "Feature Circuit",
    workflow: "feature-circuit-individual-sweep",
    filePrefix: "feature-circuit-sweep",
    circuits: FEATURE_CIRCUITS,
    mode: "toggle"
  },
  system: {
    sweepType: "system",
    title: "System Circuit",
    workflow: "system-circuit-individual-sweep",
    filePrefix: "system-circuit-sweep",
    circuits: SYSTEM_CIRCUITS,
    mode: "toggle"
  },
  "feature8-name": {
    sweepType: "feature8-name",
    title: "Feature 8 Name Value",
    workflow: "feature8-name-mapping-sweep",
    filePrefix: "feature8-name-sweep",
    mode: "config-mapping",
    targetCircuitKey: "feature8",
    targetCircuitId: 17,
    targetField: "name",
    candidateLabels: FEATURE8_NAME_LABELS,
    actionLabel: "assigned name"
  },
  "aux6-function": {
    sweepType: "aux6-function",
    title: "AUX 6 Function Value",
    workflow: "aux6-function-mapping-sweep",
    filePrefix: "aux6-function-sweep",
    mode: "config-mapping",
    targetCircuitKey: "aux6",
    targetCircuitId: 8,
    targetField: "function",
    candidateLabels: AUX6_FUNCTION_LABELS,
    actionLabel: "circuit type"
  }
});

export function buildIndividualFeatureSweep(circuits = FEATURE_CIRCUITS) {
  return buildIndividualCircuitSweep(circuits);
}

export function buildIndividualSystemSweep(circuits = SYSTEM_CIRCUITS) {
  return buildIndividualCircuitSweep(circuits);
}

export function buildCircuitConfigMappingSweep(labels, targetCircuitKey, targetField) {
  return labels.map((requestedLabel, index) => ({
    stepNumber: index + 1,
    targetCircuitKey,
    targetField,
    requestedLabel,
    label: `${String(index + 1).padStart(2, "0")}-${targetCircuitKey}-${targetField}-${slugifyLabel(requestedLabel)}`
  }));
}

function buildIndividualCircuitSweep(circuits) {
  return circuits.flatMap((circuitKey, index) => [
    {
      stepNumber: index * 2 + 1,
      circuitKey,
      targetState: "enabled",
      label: `${String(index + 1).padStart(2, "0")}-${circuitKey}-enabled`
    },
    {
      stepNumber: index * 2 + 2,
      circuitKey,
      targetState: "disabled",
      label: `${String(index + 1).padStart(2, "0")}-${circuitKey}-disabled`
    }
  ]);
}

function getSweepDefinition(sweepType = "feature") {
  const definition = SWEEP_DEFINITIONS[sweepType];
  if (!definition) {
    throw new Error(`Unsupported sweep type '${sweepType}'. Expected one of: ${Object.keys(SWEEP_DEFINITIONS).join(", ")}.`);
  }
  return definition;
}

export function parseArgs(argv) {
  const options = {
    apiBaseUrl: process.env.SPLASH_API_BASE_URL ?? "http://127.0.0.1:8080",
    outputDir: path.join(REPO_ROOT, "tmp"),
    operator: null,
    dryRun: false,
    tui: true,
    sweepType: "feature"
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--api-base-url") {
      options.apiBaseUrl = requireValue(argv, index, value);
      index += 1;
      continue;
    }
    if (value === "--output-dir") {
      options.outputDir = path.resolve(requireValue(argv, index, value));
      index += 1;
      continue;
    }
    if (value === "--operator") {
      options.operator = requireValue(argv, index, value);
      index += 1;
      continue;
    }
    if (value === "--sweep-type") {
      options.sweepType = requireValue(argv, index, value);
      index += 1;
      continue;
    }
    if (value === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (value === "--no-tui") {
      options.tui = false;
      continue;
    }
    if (value === "--help" || value === "-h") {
      options.help = true;
      continue;
    }
    throw new Error(`Unsupported argument '${value}'.`);
  }

  getSweepDefinition(options.sweepType);
  return options;
}

function requireValue(argv, index, flag) {
  const next = argv[index + 1];
  if (!next || next.startsWith("--")) {
    throw new Error(`Missing value for ${flag}.`);
  }
  return next;
}

export function createLiveMonitorState({ totalSteps = FEATURE_CIRCUITS.length * 2, sweepTitle = "Feature Circuit" } = {}) {
  return {
    sweepTitle,
    connectionStatus: "connecting",
    clientId: null,
    totalEvents: 0,
    lastEventAt: null,
    recentEvents: [],
    recentChanges: [],
    previousHexByKey: new Map(),
    currentPrompt: "Connecting to Splash API live frames...",
    currentStepLabel: null,
    currentWatchSessionId: null,
    currentStepStartLiveCount: 0,
    currentStepLiveCount: 0,
    currentStepCapturedCount: null,
    completedSteps: 0,
    totalSteps
  };
}

function normalizeApiBaseUrl(value) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function applyLiveEvent(state, event, payload) {
  const now = new Date().toISOString();

  if (event === "ready") {
    state.connectionStatus = "connected";
    state.clientId = typeof payload?.client_id === "string" ? payload.client_id : null;
    return state;
  }

  state.connectionStatus = "streaming";
  state.totalEvents += 1;
  state.lastEventAt = now;
  state.currentStepLiveCount = state.totalEvents - state.currentStepStartLiveCount;

  const hexFields = extractHexFields(payload);
  const condensed = Object.entries(hexFields)
    .map(([field, value]) => `${field}=${truncate(value, 32)}`)
    .join(" ");

  state.recentEvents.unshift({
    at: now,
    event,
    summary: condensed || summarizePayload(payload)
  });
  state.recentEvents.splice(RECENT_EVENT_LIMIT);

  for (const [field, hex] of Object.entries(hexFields)) {
    const key = `${event}:${field}`;
    const previousHex = state.previousHexByKey.get(key) ?? null;
    const byteChanges = diffHexField(previousHex, hex);
    if (byteChanges.length > 0) {
      state.recentChanges.unshift({
        at: now,
        event,
        field,
        byte_changes: byteChanges
      });
      state.recentChanges.splice(RECENT_CHANGE_LIMIT);
    }
    state.previousHexByKey.set(key, hex);
  }

  return state;
}

export async function runFeatureCircuitSweep(options) {
  const sweep = getSweepDefinition(options.sweepType);
  const startedAt = new Date().toISOString();
  const apiBaseUrl = normalizeApiBaseUrl(options.apiBaseUrl);
  const steps = buildSweepSteps(sweep);
  const report = {
    workflow: sweep.workflow,
    sweep_type: sweep.sweepType,
    api_base_url: apiBaseUrl,
    started_at: startedAt,
    completed_at: null,
    operator: options.operator ?? null,
    watch_events: null,
    circuits: sweep.circuits ? [...sweep.circuits] : null,
    target_circuit_key: sweep.targetCircuitKey ?? null,
    target_circuit_id: sweep.targetCircuitId ?? null,
    target_field: sweep.targetField ?? null,
    candidate_labels: sweep.candidateLabels ? [...sweep.candidateLabels] : null,
    sessions: [],
    summary: []
  };

  const uiState = createLiveMonitorState({
    totalSteps: steps.length,
    sweepTitle: sweep.title
  });

  await verifyApiReachable(apiBaseUrl);

  const liveMonitor = await startLiveFrameMonitor(apiBaseUrl, uiState);
  const tui = createTui(uiState, options.tui !== false);
  tui.start();

  try {
    uiState.currentPrompt = `Press Enter to start the ${sweep.title.toLowerCase()} sweep.`;
    await tui.waitForEnter();

    for (const step of steps) {
      uiState.currentStepLabel = step.label;
      uiState.currentWatchSessionId = null;
      uiState.currentStepCapturedCount = null;
      uiState.currentStepStartLiveCount = uiState.totalEvents;
      uiState.currentStepLiveCount = 0;
      uiState.currentPrompt = `[${step.stepNumber}/${steps.length}] Press Enter to begin capture for ${step.circuitKey} ${step.targetState}.`;
      await tui.waitForEnter();

      if (options.dryRun) {
        report.sessions.push(buildDryRunSession(step, sweep));
        uiState.currentStepCapturedCount = 0;
        uiState.completedSteps = step.stepNumber;
        await persistReport(options.outputDir, report, sweep.filePrefix);
        uiState.currentPrompt = "Dry run mode. Press Enter to continue.";
        await tui.waitForEnter();
        continue;
      }

      const capturedSession = await executeSweepStep({
        apiBaseUrl,
        sweep,
        step,
        tui,
        uiState
      });
      uiState.currentStepCapturedCount = capturedSession.session.frame_count;
      uiState.completedSteps = step.stepNumber;

      report.sessions.push(capturedSession);

      await persistReport(options.outputDir, report, sweep.filePrefix);
      uiState.currentPrompt = `Captured ${capturedSession.session.frame_count} watch-session events. Press Enter when you are ready for the next action.`;
      await tui.waitForEnter();
    }
  } finally {
    report.completed_at = new Date().toISOString();
    report.summary =
      sweep.mode === "config-mapping"
        ? summarizeCircuitConfigMappingSessions(report.sessions, sweep.targetField)
        : summarizeSweepSessions(report.sessions);
    await liveMonitor.close();
    tui.stop();
  }

  const outputPath = await persistReport(options.outputDir, report, sweep.filePrefix);
  if (sweep.mode === "config-mapping") {
    printCircuitConfigMappingSummary(report.summary, sweep.targetField);
  } else {
    printSweepSummary(report.summary);
  }
  console.log(`Sweep complete. Report written to ${outputPath}`);
  return { outputPath, report };
}

function buildDryRunSession(step, sweep) {
  const now = new Date().toISOString();
  const session = {
    step_number: step.stepNumber,
    label: step.label,
    circuit_key: step.circuitKey ?? step.targetCircuitKey,
    target_state: step.targetState ?? null,
    target_field: step.targetField ?? null,
    requested_label: step.requestedLabel ?? null,
    session: {
      id: `dry-run-${step.label}`,
      label: step.label,
      status: "stopped",
      events: null,
      frame_count: 0,
      created_at: now,
      stopped_at: now,
      frames: []
    }
  };

  if (sweep.mode === "config-mapping") {
    session.request_command_id = `dry-run-request-${step.stepNumber}`;
    session.observed_configuration = null;
  }

  return session;
}

function buildSweepSteps(sweep) {
  if (sweep.mode === "config-mapping") {
    return buildCircuitConfigMappingSweep(sweep.candidateLabels, sweep.targetCircuitKey, sweep.targetField);
  }
  return sweep.sweepType === "system" ? buildIndividualSystemSweep(sweep.circuits) : buildIndividualFeatureSweep(sweep.circuits);
}

async function executeSweepStep({ apiBaseUrl, sweep, step, tui, uiState }) {
  const started = await startWatchSession(apiBaseUrl, step.label, null);
  uiState.currentWatchSessionId = started.id;
  uiState.currentStepStartLiveCount = uiState.totalEvents;
  uiState.currentStepLiveCount = 0;

  if (sweep.mode === "config-mapping") {
    uiState.currentPrompt =
      `Watch session active. Change ${formatCircuitKey(sweep.targetCircuitKey)} ${sweep.actionLabel} to "${step.requestedLabel}", then press Enter to request controller circuit settings.`;
    await tui.waitForEnter();

    const request = await requestCircuitConfig(apiBaseUrl, sweep.targetCircuitId, sweep.targetCircuitId);
    uiState.currentPrompt =
      `Circuit settings requested with command ${request.command_id}. Wait for RS485 traffic to settle, then press Enter to stop capture.`;
    await tui.waitForEnter();

    await stopWatchSession(apiBaseUrl, started.id);
    const captured = await settleWatchSession(apiBaseUrl, started.id);
    return {
      step_number: step.stepNumber,
      label: step.label,
      circuit_key: sweep.targetCircuitKey,
      target_state: null,
      target_field: sweep.targetField,
      requested_label: step.requestedLabel,
      request_command_id: request.command_id,
      observed_configuration: extractObservedCircuitConfiguration(captured, sweep.targetCircuitId),
      session: captured
    };
  }

  uiState.currentPrompt =
    `Watch session active. Toggle ${step.circuitKey} ${step.targetState}, wait for RS485 traffic to settle, then press Enter to stop capture.`;
  await tui.waitForEnter();

  await stopWatchSession(apiBaseUrl, started.id);
  const captured = await settleWatchSession(apiBaseUrl, started.id);
  return {
    step_number: step.stepNumber,
    label: step.label,
    circuit_key: step.circuitKey,
    target_state: step.targetState,
    session: captured
  };
}

function createTui(state, enabled) {
  let timer = null;
  let activeWaiter = null;
  let keypressInitialized = false;
  let cleanupKeypress = null;
  const interactive = enabled && input.isTTY && output.isTTY;

  function start() {
    if (!interactive) {
      renderFallbackHeader(state);
      return;
    }

    readline.emitKeypressEvents(input);
    if (typeof input.setRawMode === "function") {
      input.setRawMode(true);
    }

    const onKeypress = (_, key) => {
      if (key?.ctrl && key.name === "c") {
        stop();
        process.exit(130);
      }
      if (key?.name === "return" && activeWaiter) {
        const waiter = activeWaiter;
        activeWaiter = null;
        waiter();
      }
    };

    input.on("keypress", onKeypress);
    keypressInitialized = true;
    cleanupKeypress = () => {
      input.off("keypress", onKeypress);
    };

    timer = setInterval(() => {
      drawScreen(state);
    }, 150);
    drawScreen(state);
  }

  async function waitForEnter() {
    if (!interactive) {
      return waitForEnterFallback(state.currentPrompt);
    }

    drawScreen(state);
    await new Promise((resolve) => {
      activeWaiter = resolve;
    });
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    if (interactive) {
      if (cleanupKeypress) {
        cleanupKeypress();
      }
      if (keypressInitialized && typeof input.setRawMode === "function") {
        input.setRawMode(false);
      }
      output.write("\x1b[2J\x1b[H");
    }
  }

  return { start, stop, waitForEnter };
}

function drawScreen(state) {
  output.write("\x1b[2J\x1b[H");
  output.write(`Splash ${state.sweepTitle} Sweep TUI\n`);
  output.write(`${"-".repeat(32)}\n`);
  output.write(`Connection: ${state.connectionStatus}`);
  if (state.clientId) {
    output.write(`  client=${state.clientId}`);
  }
  output.write("\n");
  output.write(`Live events: ${state.totalEvents}`);
  output.write(`  Last event: ${state.lastEventAt ? formatTime(state.lastEventAt) : "none"}\n`);
  output.write(`Step: ${state.completedSteps}/${state.totalSteps}`);
  output.write(`  Active label: ${state.currentStepLabel ?? "not started"}\n`);
  output.write(`Watch session: ${state.currentWatchSessionId ?? "none"}`);
  output.write(`  Live during step: ${state.currentStepLiveCount}`);
  output.write(`  Captured: ${state.currentStepCapturedCount ?? "--"}\n`);
  output.write("\nPrompt\n");
  output.write(`${state.currentPrompt}\n`);
  output.write("Press Enter to continue. Ctrl+C exits.\n");
  output.write("\nRecent Events\n");
  if (state.recentEvents.length === 0) {
    output.write("  none yet\n");
  } else {
    for (const entry of state.recentEvents) {
      output.write(`  ${formatTime(entry.at)} ${entry.event} ${entry.summary}\n`);
    }
  }
  output.write("\nRecent Byte Changes\n");
  if (state.recentChanges.length === 0) {
    output.write("  none yet\n");
  } else {
    for (const change of state.recentChanges) {
      const details = change.byte_changes
        .slice(0, 6)
        .map((byteChange) => `byte ${byteChange.byte_index}: ${byteChange.previous || "--"} -> ${byteChange.current || "--"}`)
        .join(", ");
      output.write(`  ${formatTime(change.at)} ${change.event} ${change.field} ${details}\n`);
    }
  }
}

function renderFallbackHeader(state) {
  console.log(`Splash ${state.sweepTitle} Sweep`);
  console.log(`Live monitor status: ${state.connectionStatus}`);
}

async function waitForEnterFallback(prompt) {
  process.stdout.write(`${prompt}\n`);
  const rl = readline.createInterface({ input, output });
  await new Promise((resolve) => {
    rl.question("", () => {
      rl.close();
      resolve();
    });
  });
}

async function startLiveFrameMonitor(apiBaseUrl, state) {
  const controller = new AbortController();
  const response = await fetchWithFriendlyErrors(`${apiBaseUrl}/protocol/frames`, {
    headers: {
      accept: "text/event-stream"
    },
    signal: controller.signal
  });

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("text/event-stream")) {
    const bodyText = await response.text();
    throw new Error(
      `Splash API returned non-SSE content from ${response.url} (${response.status} ${response.statusText}, content-type '${contentType || "unknown"}'). ` +
        `Body starts with: ${JSON.stringify(bodyText.slice(0, 120))}`
    );
  }

  const streamPromise = consumeEventStream(response, (event, payload) => {
    applyLiveEvent(state, event, payload);
  }).catch((error) => {
    if (controller.signal.aborted) {
      return;
    }
    state.connectionStatus = "stream-error";
    state.currentPrompt = `Live stream error: ${error instanceof Error ? error.message : String(error)}`;
  });

  return {
    async close() {
      controller.abort();
      await streamPromise;
    }
  };
}

async function consumeEventStream(response, onEvent) {
  if (!response.body) {
    throw new Error("Splash API did not provide an event-stream body.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    let boundaryIndex = buffer.indexOf("\n\n");
    while (boundaryIndex >= 0) {
      const chunk = buffer.slice(0, boundaryIndex);
      buffer = buffer.slice(boundaryIndex + 2);
      const parsed = parseSseChunk(chunk);
      if (parsed) {
        onEvent(parsed.event, parsed.data);
      }
      boundaryIndex = buffer.indexOf("\n\n");
    }
  }
}

function parseSseChunk(chunk) {
  const lines = chunk.split("\n");
  let event = "message";
  const dataLines = [];

  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trim());
    }
  }

  if (dataLines.length === 0) {
    return null;
  }

  return {
    event,
    data: JSON.parse(dataLines.join("\n"))
  };
}

export function summarizeSweepSessions(sessions) {
  return sessions.map((current, index) => {
    const previous = index > 0 ? sessions[index - 1] : null;
    return {
      step_number: current.step_number,
      label: current.label,
      circuit_key: current.circuit_key,
      target_state: current.target_state,
      compared_to_step_number: previous?.step_number ?? null,
      compared_to_label: previous?.label ?? null,
      changed_frames: compareFrames(previous?.session?.frames ?? [], current.session?.frames ?? [])
    };
  });
}

export function summarizeCircuitConfigMappingSessions(sessions, targetField) {
  return sessions.map((entry) => {
    const observed = entry.observed_configuration ?? null;
    return {
      step_number: entry.step_number,
      label: entry.label,
      circuit_key: entry.circuit_key,
      target_field: targetField,
      requested_label: entry.requested_label ?? null,
      observed_value:
        targetField === "name"
          ? readNumberField(observed, ["name_id"])
          : readNumberField(observed, ["function_id", "base_function_id"]),
      observed_label:
        targetField === "name"
          ? readStringField(observed, ["name_label"])
          : readStringField(observed, ["base_function_label"]),
      observed_configuration: observed
    };
  });
}

function compareFrames(previousFrames, currentFrames) {
  const changedFrames = [];
  const length = Math.max(previousFrames.length, currentFrames.length);

  for (let index = 0; index < length; index += 1) {
    const previous = previousFrames[index] ?? null;
    const current = currentFrames[index] ?? null;
    const changed_fields = compareFramePayloads(previous?.payload ?? null, current?.payload ?? null);
    if (changed_fields.length === 0 && previous?.event === current?.event) {
      continue;
    }

    changedFrames.push({
      frame_index: index,
      previous_event: previous?.event ?? null,
      current_event: current?.event ?? null,
      changed_fields
    });
  }

  return changedFrames;
}

function compareFramePayloads(previous, current) {
  const changedFields = [];
  for (const field of ["bytes_hex", "payload_hex"]) {
    const previousHex = typeof previous?.[field] === "string" ? previous[field] : null;
    const currentHex = typeof current?.[field] === "string" ? current[field] : null;
    const byteChanges = diffHexField(previousHex, currentHex);
    if (byteChanges.length > 0) {
      changedFields.push({
        field,
        byte_changes: byteChanges
      });
    }
  }
  return changedFields;
}

function extractHexFields(payload) {
  const result = {};
  for (const field of ["bytes_hex", "payload_hex"]) {
    if (typeof payload?.[field] === "string" && payload[field].trim().length > 0) {
      result[field] = payload[field].trim().toLowerCase();
    }
  }
  return result;
}

function summarizePayload(payload) {
  if (!payload || typeof payload !== "object") {
    return "";
  }
  const entries = Object.entries(payload).slice(0, 3);
  return entries.map(([key, value]) => `${key}=${truncate(String(value), 18)}`).join(" ");
}

function truncate(value, maxLength) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

export function diffHexField(previous, current) {
  const previousBytes = splitHexBytes(previous);
  const currentBytes = splitHexBytes(current);
  const length = Math.max(previousBytes.length, currentBytes.length);
  const changes = [];

  for (let index = 0; index < length; index += 1) {
    const previousByte = previousBytes[index] ?? "";
    const currentByte = currentBytes[index] ?? "";
    if (previousByte === currentByte) {
      continue;
    }
    changes.push({
      byte_index: index,
      previous: previousByte,
      current: currentByte
    });
  }

  return changes;
}

function splitHexBytes(value) {
  if (typeof value !== "string") {
    return [];
  }

  const normalized = value.trim().replaceAll(/\s+/g, "").toLowerCase();
  if (normalized.length === 0) {
    return [];
  }

  const bytes = [];
  for (let index = 0; index < normalized.length; index += 2) {
    bytes.push(normalized.slice(index, index + 2));
  }
  return bytes;
}

function printSweepSummary(summary) {
  console.log("");
  console.log("Observed byte changes");

  for (const item of summary) {
    const basis = item.compared_to_label ? `vs ${item.compared_to_label}` : "vs no prior capture";
    console.log(`${item.label} (${basis})`);

    if (item.changed_frames.length === 0) {
      console.log("  no byte changes observed");
      continue;
    }

    for (const frame of item.changed_frames) {
      const eventLabel = frame.current_event ?? frame.previous_event ?? "unknown";
      if (frame.changed_fields.length === 0) {
        console.log(`  frame ${frame.frame_index} ${eventLabel}: event changed without bytes_hex/payload_hex delta`);
        continue;
      }

      for (const field of frame.changed_fields) {
        const changes = field.byte_changes.map((change) => {
          const before = change.previous || "--";
          const after = change.current || "--";
          return `byte ${change.byte_index}: ${before} -> ${after}`;
        });
        console.log(`  frame ${frame.frame_index} ${eventLabel} ${field.field}: ${changes.join(", ")}`);
      }
    }
  }
}

function printCircuitConfigMappingSummary(summary, targetField) {
  console.log("");
  console.log(`Observed ${targetField} mappings`);

  for (const item of summary) {
    const observedValue = item.observed_value == null ? "Unavailable" : String(item.observed_value);
    const observedLabel = item.observed_label ?? "Unavailable";
    console.log(`${item.requested_label ?? item.label} -> ${observedValue} (${observedLabel})`);
  }
}

async function startWatchSession(apiBaseUrl, label, events) {
  const payload = await postJson(`${apiBaseUrl}/protocol/watch-sessions`, {
    label,
    events
  });
  return payload.data;
}

async function stopWatchSession(apiBaseUrl, sessionId) {
  const payload = await postJson(`${apiBaseUrl}/protocol/watch-sessions/${encodeURIComponent(sessionId)}/stop`, {});
  return payload.data;
}

async function getWatchSession(apiBaseUrl, sessionId) {
  const response = await fetchWithFriendlyErrors(`${apiBaseUrl}/protocol/watch-sessions/${encodeURIComponent(sessionId)}`);
  const payload = await readJsonResponse(response);
  return payload.data;
}

async function requestCircuitConfig(apiBaseUrl, startIndex, endIndex) {
  const payload = await postJson(`${apiBaseUrl}/protocol/circuit-config/request`, {
    start_index: startIndex,
    end_index: endIndex
  });
  return payload.data;
}

async function settleWatchSession(apiBaseUrl, sessionId) {
  let stableReads = 0;
  let lastFrameCount = -1;
  let lastSession = null;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const current = await getWatchSession(apiBaseUrl, sessionId);
    lastSession = current;
    if (current.frame_count === lastFrameCount) {
      stableReads += 1;
      if (stableReads >= 2) {
        return current;
      }
    } else {
      stableReads = 0;
      lastFrameCount = current.frame_count;
    }
    await sleep(250);
  }

  return lastSession;
}

async function postJson(url, body) {
  const response = await fetchWithFriendlyErrors(url, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
  return readJsonResponse(response);
}

async function readJsonResponse(response) {
  const bodyText = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error(
      `Splash API returned non-JSON content from ${response.url} (${response.status} ${response.statusText}, content-type '${contentType || "unknown"}'). ` +
        `Body starts with: ${JSON.stringify(bodyText.slice(0, 120))}`
    );
  }

  let payload;
  try {
    payload = JSON.parse(bodyText);
  } catch (error) {
    throw new Error(
      `Splash API returned invalid JSON from ${response.url} (${response.status} ${response.statusText}). ` +
        `Body starts with: ${JSON.stringify(bodyText.slice(0, 120))}. ` +
        `Parse error: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  if (!response.ok) {
    throw new Error(`Splash API request failed with ${response.status}: ${payload.error ?? "unknown error"}`);
  }
  if (!payload || typeof payload !== "object" || payload.data == null) {
    throw new Error("Splash API returned an unexpected response shape.");
  }
  return payload;
}

async function verifyApiReachable(apiBaseUrl) {
  const response = await fetchWithFriendlyErrors(`${apiBaseUrl}/health`);
  await readJsonResponse(response);
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function fetchWithFriendlyErrors(url, init) {
  try {
    return await fetch(url, init);
  } catch (error) {
    throw new Error(
      `Could not reach Splash API at ${url}. ` +
        `Make sure splash-api is running and that --api-base-url points to the API service. ` +
        `Underlying error: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

async function persistReport(outputDir, report, filePrefix = "feature-circuit-sweep") {
  await mkdir(outputDir, { recursive: true });
  const timestamp = (report.started_at ?? new Date().toISOString()).replaceAll(":", "-");
  const targetPath = path.join(outputDir, `${filePrefix}-${timestamp}.json`);
  await writeFile(targetPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return targetPath;
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function slugifyLabel(value) {
  return value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .replaceAll(/--+/g, "-");
}

export function extractObservedCircuitConfiguration(session, targetCircuitId) {
  const frames = Array.isArray(session?.frames) ? session.frames : [];
  let fallback = null;

  for (let index = frames.length - 1; index >= 0; index -= 1) {
    const frame = frames[index];
    if (frame?.event !== "protocol.frame.decoded") {
      continue;
    }
    const payload = frame.payload;
    if (payload == null || typeof payload !== "object" || Array.isArray(payload)) {
      continue;
    }
    if (payload.message_type !== "circuit_configuration") {
      continue;
    }
    const fields = payload.fields;
    if (fields == null || typeof fields !== "object" || Array.isArray(fields)) {
      continue;
    }
    const normalized = { ...fields };
    if (readNumberField(normalized, ["circuit_id"]) === targetCircuitId) {
      return normalized;
    }
    fallback ??= normalized;
  }

  return fallback;
}

function readNumberField(value, keys) {
  for (const key of keys) {
    if (typeof value?.[key] === "number") {
      return value[key];
    }
  }
  return null;
}

function readStringField(value, keys) {
  for (const key of keys) {
    if (typeof value?.[key] === "string" && value[key].length > 0) {
      return value[key];
    }
  }
  return null;
}
