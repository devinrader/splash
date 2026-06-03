#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";

const DEFAULT_API_BASE = "http://127.0.0.1:8080";
const DEFAULT_TIMEOUT_MS = 15000;

export async function runCircuitConfigCapture(options) {
  const {
    mode,
    issue,
    circuitIndex,
    circuitLabel,
    apiBase = DEFAULT_API_BASE,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    outputPath = defaultOutputPath(mode, circuitLabel)
  } = options;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const records = [];
  let initialObserved = null;
  let previousObserved = null;
  let stopSubscription = null;

  try {
    console.log(`Issue: ${issue}`);
    console.log(`Mode: ${mode}`);
    console.log(`Target circuit: ${circuitLabel} (index ${circuitIndex})`);
    console.log(`API base: ${apiBase}`);
    console.log(`Output: ${outputPath}`);
    console.log("");
    console.log("Workflow:");
    console.log(`1. Change ${circuitLabel} ${mode === "function" ? "function" : "assigned name"} on the controller panel.`);
    console.log("2. Enter the label you switched to here.");
    console.log("3. The script will request controller circuit config and wait for the matching 0x0b reply.");
    console.log("");

    const subscription = createProtocolFrameSubscription(`${apiBase}/protocol/frames`);
    stopSubscription = () => subscription.close();
    await subscription.ready;

    console.log(`Requesting initial circuit configuration baseline for ${circuitLabel}...`);
    initialObserved = await requestAndCaptureCircuitConfiguration({
      apiBase,
      circuitIndex,
      circuitLabel,
      mode,
      subscription,
      timeoutMs
    });
    previousObserved = initialObserved.observed;
    console.log(`Initial configuration: ${formatObservedSummary(mode, previousObserved)}`);
    console.log("");

    while (true) {
      const requestedLabel = (await rl.question(
        `${mode === "function" ? "Function" : "Name"} switched to for ${circuitLabel} (blank to finish): `
      )).trim();

      if (requestedLabel.length === 0) {
        break;
      }

      const captured = await requestAndCaptureCircuitConfiguration({
        apiBase,
        circuitIndex,
        circuitLabel,
        mode,
        subscription,
        timeoutMs
      });
      const changed = !observedMatches(mode, previousObserved, captured.observed);
      const record = {
        issue,
        mode,
        circuit_label: circuitLabel,
        circuit_index: circuitIndex,
        requested_label: requestedLabel,
        requested_at: captured.requestedAt,
        command_id: captured.commandId,
        observed_at: captured.observedAt,
        frame_id: captured.frameId,
        action_code: captured.actionCode,
        message_type: captured.messageType,
        previous_observed: previousObserved,
        observed: captured.observed,
        changed,
        full_fields: captured.fields
      };

      records.push(record);
      await persistReport(outputPath, {
        issue,
        mode,
        circuit_label: circuitLabel,
        circuit_index: circuitIndex,
        initial_observed: initialObserved.observed,
        generated_at: new Date().toISOString(),
        records
      });

      if (changed) {
        console.log(`Observed change: ${formatObservedTransition(mode, previousObserved, record.observed)}`);
      } else {
        console.log(`No configuration change observed. Current config: ${formatObservedSummary(mode, record.observed)}`);
      }
      console.log(`Saved ${records.length} record(s) to ${outputPath}`);
      console.log("");
      previousObserved = record.observed;
    }

    if (records.length === 0) {
      console.log("No records captured.");
    } else {
      console.log(`Capture complete. ${records.length} record(s) saved to ${outputPath}`);
    }
  } finally {
    if (stopSubscription) {
      stopSubscription();
    }
    rl.close();
  }
}

export function parseCommonArgs(argv) {
  const args = {
    apiBase: DEFAULT_API_BASE,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    outputPath: null,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--help" || value === "-h") {
      args.help = true;
      continue;
    }
    if (value === "--api-base") {
      args.apiBase = argv[index + 1] ?? args.apiBase;
      index += 1;
      continue;
    }
    if (value === "--timeout-ms") {
      const parsed = Number.parseInt(argv[index + 1] ?? "", 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        args.timeoutMs = parsed;
      }
      index += 1;
      continue;
    }
    if (value === "--output") {
      args.outputPath = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
  }

  return args;
}

export function printUsage(scriptName, description) {
  console.log(description);
  console.log("");
  console.log(`Usage: node ${scriptName} [--api-base <url>] [--timeout-ms <ms>] [--output <path>]`);
}

function defaultOutputPath(mode, circuitLabel) {
  const stamp = new Date().toISOString().replace(/[:]/g, "-");
  const slug = circuitLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return path.join(process.cwd(), "tmp", `${slug}-${mode}-sweep-${stamp}.json`);
}

async function persistReport(outputPath, report) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

async function sendCircuitConfigRequest(apiBase, circuitIndex) {
  const response = await fetch(`${apiBase}/protocol/circuit-config/request`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      start_index: circuitIndex,
      end_index: circuitIndex
    })
  });

  if (!response.ok) {
    throw new Error(`Circuit-config request failed with HTTP ${response.status}.`);
  }

  const payload = await response.json();
  const commandId = payload?.data?.command_id;
  if (typeof commandId !== "string" || commandId.length === 0) {
    throw new Error("Circuit-config request did not return a command_id.");
  }

  return { commandId };
}

async function requestAndCaptureCircuitConfiguration({
  apiBase,
  circuitIndex,
  circuitLabel,
  mode,
  subscription,
  timeoutMs
}) {
  const requestedAt = new Date().toISOString();
  const requestResponse = await sendCircuitConfigRequest(apiBase, circuitIndex);
  console.log(
    `Requested circuit configuration for ${circuitLabel}. Command ${requestResponse.commandId}. Waiting for circuit_configuration reply...`
  );

  const frame = await subscription.waitForMatch(
    (payload) => isMatchingCircuitConfiguration(payload, circuitIndex, requestedAt),
    timeoutMs
  );

  const fields = normalizeFields(frame.fields);
  return {
    requestedAt,
    commandId: requestResponse.commandId,
    observedAt: typeof frame.decoded_at === "string" ? frame.decoded_at : null,
    frameId: typeof frame.frame_id === "string" ? frame.frame_id : null,
    actionCode: frame.action_code ?? null,
    messageType: frame.message_type ?? null,
    fields,
    observed: extractObserved(mode, fields)
  };
}

function extractObserved(mode, fields) {
  if (mode === "function") {
    return {
      function_id: numberOrNull(fields.function_id),
      base_function_id: numberOrNull(fields.base_function_id),
      base_function_label: stringOrNull(fields.base_function_label),
      freeze_flag: booleanOrNull(fields.freeze_flag),
      high_flag: booleanOrNull(fields.high_flag)
    };
  }

  return {
    name_id: numberOrNull(fields.name_id),
    name_label: stringOrNull(fields.name_label),
    freeze_flag: booleanOrNull(fields.freeze_flag),
    high_flag: booleanOrNull(fields.high_flag)
  };
}

function formatObservedSummary(mode, observed) {
  if (mode === "function") {
    return `functionId=${observed.function_id} base=${observed.base_function_id} (${observed.base_function_label ?? "Unavailable"}) freeze=${formatMaybeBoolean(observed.freeze_flag)} high=${formatMaybeBoolean(observed.high_flag)}`;
  }

  return `nameId=${observed.name_id} label=${observed.name_label ?? "Unavailable"} freeze=${formatMaybeBoolean(observed.freeze_flag)} high=${formatMaybeBoolean(observed.high_flag)}`;
}

function formatObservedTransition(mode, previousObserved, nextObserved) {
  return `${formatObservedSummary(mode, previousObserved)} -> ${formatObservedSummary(mode, nextObserved)}`;
}

function observedMatches(mode, left, right) {
  if (left == null || right == null) {
    return false;
  }

  if (mode === "function") {
    return left.function_id === right.function_id
      && left.base_function_id === right.base_function_id
      && left.base_function_label === right.base_function_label
      && left.freeze_flag === right.freeze_flag
      && left.high_flag === right.high_flag;
  }

  return left.name_id === right.name_id
    && left.name_label === right.name_label
    && left.freeze_flag === right.freeze_flag
    && left.high_flag === right.high_flag;
}

function isMatchingCircuitConfiguration(payload, circuitIndex, requestedAt) {
  if (payload == null || typeof payload !== "object" || Array.isArray(payload)) {
    return false;
  }

  if (payload.message_type !== "circuit_configuration") {
    return false;
  }

  const decodedAt = typeof payload.decoded_at === "string" ? Date.parse(payload.decoded_at) : Number.NaN;
  const requestedTime = Date.parse(requestedAt);
  if (!Number.isNaN(decodedAt) && !Number.isNaN(requestedTime) && decodedAt < requestedTime) {
    return false;
  }

  const fields = normalizeFields(payload.fields);
  return numberOrNull(fields.circuit_id) === circuitIndex;
}

function createProtocolFrameSubscription(url) {
  const decoder = new TextDecoder();
  const pending = [];
  let pendingResolver = null;
  let aborted = false;
  const controller = new AbortController();

  const connection = (async () => {
    const response = await fetch(url, {
      headers: {
        accept: "text/event-stream"
      },
      signal: controller.signal
    });

    if (!response.ok || response.body == null) {
      throw new Error(`Unable to subscribe to ${url}. HTTP ${response.status}`);
    }

    return response;
  })();

  const ready = connection.then(() => undefined);

  const reader = (async () => {
    const response = await connection;

    let buffer = "";
    for await (const chunk of response.body) {
      if (aborted) {
        break;
      }
      buffer += decoder.decode(chunk, { stream: true });
      let boundaryIndex = buffer.indexOf("\n\n");
      while (boundaryIndex >= 0) {
        const rawEvent = buffer.slice(0, boundaryIndex);
        buffer = buffer.slice(boundaryIndex + 2);
        const parsed = parseSseEvent(rawEvent);
        if (parsed && parsed.event !== "ready") {
          pending.push(parsed.data);
          if (pendingResolver) {
            const resolve = pendingResolver;
            pendingResolver = null;
            resolve();
          }
        }
        boundaryIndex = buffer.indexOf("\n\n");
      }
    }
  })();

  return {
    ready,
    close() {
      aborted = true;
      controller.abort();
      if (pendingResolver) {
        const resolve = pendingResolver;
        pendingResolver = null;
        resolve();
      }
      void reader.catch(() => {});
    },
    async waitForMatch(predicate, timeoutMs) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        while (pending.length > 0) {
          const next = pending.shift();
          if (predicate(next)) {
            return next;
          }
        }

        const remaining = deadline - Date.now();
        if (remaining <= 0) {
          break;
        }

        await Promise.race([
          new Promise((resolve) => {
            pendingResolver = resolve;
          }),
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error("Timed out waiting for matching circuit_configuration frame.")), remaining);
          })
        ]);
      }

      throw new Error("Timed out waiting for matching circuit_configuration frame.");
    }
  };
}

function parseSseEvent(rawEvent) {
  const lines = rawEvent.split(/\r?\n/);
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

function normalizeFields(value) {
  return value != null && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function numberOrNull(value) {
  return typeof value === "number" ? value : null;
}

function stringOrNull(value) {
  return typeof value === "string" ? value : null;
}

function booleanOrNull(value) {
  return typeof value === "boolean" ? value : null;
}

function formatMaybeBoolean(value) {
  if (value === true) {
    return "true";
  }
  if (value === false) {
    return "false";
  }
  return "null";
}
