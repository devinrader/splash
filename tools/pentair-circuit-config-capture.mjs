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

    while (true) {
      const requestedLabel = (await rl.question(
        `${mode === "function" ? "Function" : "Name"} switched to for ${circuitLabel} (blank to finish): `
      )).trim();

      if (requestedLabel.length === 0) {
        break;
      }

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
      const record = {
        issue,
        mode,
        circuit_label: circuitLabel,
        circuit_index: circuitIndex,
        requested_label: requestedLabel,
        requested_at: requestedAt,
        command_id: requestResponse.commandId,
        observed_at: typeof frame.decoded_at === "string" ? frame.decoded_at : null,
        frame_id: typeof frame.frame_id === "string" ? frame.frame_id : null,
        action_code: frame.action_code ?? null,
        message_type: frame.message_type ?? null,
        observed: mode === "function"
          ? {
              function_id: numberOrNull(fields.function_id),
              base_function_id: numberOrNull(fields.base_function_id),
              base_function_label: stringOrNull(fields.base_function_label),
              freeze_flag: booleanOrNull(fields.freeze_flag),
              high_flag: booleanOrNull(fields.high_flag)
            }
          : {
              name_id: numberOrNull(fields.name_id),
              name_label: stringOrNull(fields.name_label),
              freeze_flag: booleanOrNull(fields.freeze_flag),
              high_flag: booleanOrNull(fields.high_flag)
            },
        full_fields: fields
      };

      records.push(record);
      await persistReport(outputPath, {
        issue,
        mode,
        circuit_label: circuitLabel,
        circuit_index: circuitIndex,
        generated_at: new Date().toISOString(),
        records
      });

      if (mode === "function") {
        console.log(
          `Observed functionId=${record.observed.function_id} base=${record.observed.base_function_id} (${record.observed.base_function_label ?? "Unavailable"}) freeze=${formatMaybeBoolean(record.observed.freeze_flag)} high=${formatMaybeBoolean(record.observed.high_flag)}`
        );
      } else {
        console.log(
          `Observed nameId=${record.observed.name_id} label=${record.observed.name_label ?? "Unavailable"} freeze=${formatMaybeBoolean(record.observed.freeze_flag)} high=${formatMaybeBoolean(record.observed.high_flag)}`
        );
      }
      console.log(`Saved ${records.length} record(s) to ${outputPath}`);
      console.log("");
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

  const ready = (async () => {
    const response = await fetch(url, {
      headers: {
        accept: "text/event-stream"
      },
      signal: controller.signal
    });

    if (!response.ok || response.body == null) {
      throw new Error(`Unable to subscribe to ${url}. HTTP ${response.status}`);
    }

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
