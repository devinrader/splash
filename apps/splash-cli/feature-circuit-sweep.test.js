import test from "node:test";
import assert from "node:assert/strict";
import {
  applyLiveEvent,
  AUX6_FUNCTION_LABELS,
  buildCircuitConfigMappingSweep,
  buildIndividualFeatureSweep,
  buildIndividualSystemSweep,
  createLiveMonitorState,
  diffHexField,
  extractObservedCircuitConfiguration,
  FEATURE8_NAME_LABELS,
  FEATURE_CIRCUITS,
  SYSTEM_CIRCUITS,
  parseArgs,
  summarizeCircuitConfigMappingSessions,
  summarizeSweepSessions
} from "./feature-circuit-sweep.js";

test("buildIndividualFeatureSweep returns enable and disable steps for every feature circuit", () => {
  const steps = buildIndividualFeatureSweep();

  assert.equal(steps.length, FEATURE_CIRCUITS.length * 2);
  assert.deepEqual(
    steps.slice(0, 4).map((step) => ({
      stepNumber: step.stepNumber,
      circuitKey: step.circuitKey,
      targetState: step.targetState
    })),
    [
      { stepNumber: 1, circuitKey: "pool_low", targetState: "enabled" },
      { stepNumber: 2, circuitKey: "pool_low", targetState: "disabled" },
      { stepNumber: 3, circuitKey: "pool_high", targetState: "enabled" },
      { stepNumber: 4, circuitKey: "pool_high", targetState: "disabled" }
    ]
  );
  assert.deepEqual(
    steps.slice(-2).map((step) => ({
      stepNumber: step.stepNumber,
      circuitKey: step.circuitKey,
      targetState: step.targetState
    })),
    [
      { stepNumber: 15, circuitKey: "feature8", targetState: "enabled" },
      { stepNumber: 16, circuitKey: "feature8", targetState: "disabled" }
    ]
  );
});

test("buildIndividualSystemSweep returns enable and disable steps for every system circuit", () => {
  const steps = buildIndividualSystemSweep();

  assert.equal(steps.length, SYSTEM_CIRCUITS.length * 2);
  assert.deepEqual(
    steps.slice(0, 4).map((step) => ({
      stepNumber: step.stepNumber,
      circuitKey: step.circuitKey,
      targetState: step.targetState
    })),
    [
      { stepNumber: 1, circuitKey: "pool", targetState: "enabled" },
      { stepNumber: 2, circuitKey: "pool", targetState: "disabled" },
      { stepNumber: 3, circuitKey: "aux1", targetState: "enabled" },
      { stepNumber: 4, circuitKey: "aux1", targetState: "disabled" }
    ]
  );
  assert.deepEqual(
    steps.slice(8, 14).map((step) => ({
      stepNumber: step.stepNumber,
      circuitKey: step.circuitKey,
      targetState: step.targetState
    })),
    [
      { stepNumber: 9, circuitKey: "aux4", targetState: "enabled" },
      { stepNumber: 10, circuitKey: "aux4", targetState: "disabled" },
      { stepNumber: 11, circuitKey: "aux5", targetState: "enabled" },
      { stepNumber: 12, circuitKey: "aux5", targetState: "disabled" },
      { stepNumber: 13, circuitKey: "aux6", targetState: "enabled" },
      { stepNumber: 14, circuitKey: "aux6", targetState: "disabled" }
    ]
  );
  assert.deepEqual(
    steps.slice(-4).map((step) => ({
      stepNumber: step.stepNumber,
      circuitKey: step.circuitKey,
      targetState: step.targetState
    })),
    [
      { stepNumber: 15, circuitKey: "aux7", targetState: "enabled" },
      { stepNumber: 16, circuitKey: "aux7", targetState: "disabled" },
      { stepNumber: 17, circuitKey: "aux_extra", targetState: "enabled" },
      { stepNumber: 18, circuitKey: "aux_extra", targetState: "disabled" }
    ]
  );
});

test("buildCircuitConfigMappingSweep returns ordered mapping steps", () => {
  const steps = buildCircuitConfigMappingSweep(["FEATURE 1", "AUX EXTRA"], "feature8", "name");

  assert.deepEqual(steps, [
    {
      stepNumber: 1,
      targetCircuitKey: "feature8",
      targetField: "name",
      requestedLabel: "FEATURE 1",
      label: "01-feature8-name-feature-1"
    },
    {
      stepNumber: 2,
      targetCircuitKey: "feature8",
      targetField: "name",
      requestedLabel: "AUX EXTRA",
      label: "02-feature8-name-aux-extra"
    }
  ]);
});

test("parseArgs supports explicit CLI overrides", () => {
  const parsed = parseArgs([
    "--api-base-url",
    "http://127.0.0.1:9090/",
    "--output-dir",
    "./tmp/results",
    "--operator",
    "devin",
    "--sweep-type",
    "system",
    "--dry-run",
    "--no-tui"
  ]);

  assert.equal(parsed.apiBaseUrl, "http://127.0.0.1:9090/");
  assert.match(parsed.outputDir, /tmp\/results$/);
  assert.equal(parsed.operator, "devin");
  assert.equal(parsed.sweepType, "system");
  assert.equal(parsed.dryRun, true);
  assert.equal(parsed.tui, false);
});

test("parseArgs accepts config mapping sweep types", () => {
  assert.equal(parseArgs(["--sweep-type", "feature8-name"]).sweepType, "feature8-name");
  assert.equal(parseArgs(["--sweep-type", "aux6-function"]).sweepType, "aux6-function");
});

test("parseArgs rejects missing flag values", () => {
  assert.throws(() => parseArgs(["--api-base-url"]), /Missing value/);
});

test("parseArgs rejects unsupported sweep types", () => {
  assert.throws(() => parseArgs(["--sweep-type", "hardware"]), /Unsupported sweep type/);
});

test("summarizeSweepSessions reports changed byte positions and values", () => {
  const summary = summarizeSweepSessions([
    {
      step_number: 1,
      label: "01-pool_low-enabled",
      circuit_key: "pool_low",
      target_state: "enabled",
      session: {
        frames: [{ event: "protocol.frame.raw", payload: { bytes_hex: "ff00aa" } }]
      }
    },
    {
      step_number: 2,
      label: "01-pool_low-disabled",
      circuit_key: "pool_low",
      target_state: "disabled",
      session: {
        frames: [{ event: "protocol.frame.raw", payload: { bytes_hex: "ff10aa" } }]
      }
    }
  ]);

  assert.equal(summary.length, 2);
  assert.equal(summary[0].changed_frames.length, 1);
  assert.equal(summary[0].changed_frames[0].changed_fields[0].byte_changes[0].byte_index, 0);
  assert.equal(summary[0].changed_frames[0].changed_fields[0].byte_changes[0].current, "ff");
  assert.equal(summary[1].changed_frames.length, 1);
  assert.equal(summary[1].changed_frames[0].changed_fields[0].byte_changes[0].byte_index, 1);
  assert.equal(summary[1].changed_frames[0].changed_fields[0].byte_changes[0].previous, "00");
  assert.equal(summary[1].changed_frames[0].changed_fields[0].byte_changes[0].current, "10");
});

test("parseArgs defaults to the local API base URL", () => {
  const parsed = parseArgs([]);
  assert.equal(parsed.apiBaseUrl, "http://127.0.0.1:8080");
});

test("summarizeSweepSessions tolerates unfiltered watch sessions", () => {
  const summary = summarizeSweepSessions([
    {
      step_number: 1,
      label: "01-pool_low-enabled",
      circuit_key: "pool_low",
      target_state: "enabled",
      session: {
        events: null,
        frames: [{ event: "serial.rx.raw", payload: { bytes_hex: "aa" } }]
      }
    }
  ]);

  assert.equal(summary.length, 1);
  assert.equal(summary[0].changed_frames.length, 1);
  assert.equal(summary[0].changed_frames[0].current_event, "serial.rx.raw");
});

test("applyLiveEvent tracks live counts and byte changes", () => {
  const state = createLiveMonitorState();

  applyLiveEvent(state, "ready", { client_id: "client-1" });
  applyLiveEvent(state, "protocol.frame.raw", { bytes_hex: "ff00aa" });
  applyLiveEvent(state, "protocol.frame.raw", { bytes_hex: "ff10aa" });

  assert.equal(state.connectionStatus, "streaming");
  assert.equal(state.clientId, "client-1");
  assert.equal(state.totalEvents, 2);
  assert.equal(state.recentEvents[0].event, "protocol.frame.raw");
  assert.equal(state.recentChanges[0].field, "bytes_hex");
  assert.equal(state.recentChanges[0].byte_changes[0].byte_index, 1);
  assert.equal(state.recentChanges[0].byte_changes[0].previous, "00");
  assert.equal(state.recentChanges[0].byte_changes[0].current, "10");
});

test("diffHexField reports byte position changes", () => {
  assert.deepEqual(diffHexField("aa00ff", "aa11ff"), [
    {
      byte_index: 1,
      previous: "00",
      current: "11"
    }
  ]);
});

test("createLiveMonitorState supports custom sweep titles and step totals", () => {
  const state = createLiveMonitorState({ totalSteps: 12, sweepTitle: "System Circuit" });

  assert.equal(state.totalSteps, 12);
  assert.equal(state.sweepTitle, "System Circuit");
});

test("extractObservedCircuitConfiguration prefers the requested circuit id", () => {
  const observed = extractObservedCircuitConfiguration(
    {
      frames: [
        {
          event: "protocol.frame.decoded",
          payload: {
            message_type: "circuit_configuration",
            fields: {
              circuit_id: 12,
              name_id: 14,
              name_label: "FEATURE 3"
            }
          }
        },
        {
          event: "protocol.frame.decoded",
          payload: {
            message_type: "circuit_configuration",
            fields: {
              circuit_id: 17,
              name_id: 38,
              name_label: "GENERIC"
            }
          }
        }
      ]
    },
    17
  );

  assert.deepEqual(observed, {
    circuit_id: 17,
    name_id: 38,
    name_label: "GENERIC"
  });
});

test("summarizeCircuitConfigMappingSessions reports observed values per requested label", () => {
  const summary = summarizeCircuitConfigMappingSessions(
    [
      {
        step_number: 1,
        label: "01-feature8-name-feature-1",
        circuit_key: "feature8",
        requested_label: "FEATURE 1",
        observed_configuration: {
          circuit_id: 17,
          name_id: 12,
          name_label: "FEATURE 1"
        }
      },
      {
        step_number: 2,
        label: "02-aux6-function-generic",
        circuit_key: "aux6",
        requested_label: "GENERIC",
        observed_configuration: {
          circuit_id: 8,
          function_id: 0,
          base_function_id: 0,
          base_function_label: "Generic"
        }
      }
    ],
    "name"
  );

  assert.equal(summary[0].observed_value, 12);
  assert.equal(summary[0].observed_label, "FEATURE 1");

  const functionSummary = summarizeCircuitConfigMappingSessions(
    [
      {
        step_number: 1,
        label: "02-aux6-function-generic",
        circuit_key: "aux6",
        requested_label: "GENERIC",
        observed_configuration: {
          circuit_id: 8,
          function_id: 0,
          base_function_id: 0,
          base_function_label: "Generic"
        }
      }
    ],
    "function"
  );

  assert.equal(functionSummary[0].observed_value, 0);
  assert.equal(functionSummary[0].observed_label, "Generic");
});

test("mapping label inventories remain populated", () => {
  assert.ok(FEATURE8_NAME_LABELS.includes("AUX EXTRA"));
  assert.ok(FEATURE8_NAME_LABELS.includes("FEATURE 8"));
  assert.deepEqual(AUX6_FUNCTION_LABELS.slice(0, 4), ["GENERIC", "MAST CLEANER", "LIGHT", "SAM LIGHT"]);
});
