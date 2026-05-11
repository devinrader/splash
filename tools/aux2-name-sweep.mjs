#!/usr/bin/env node

import { parseCommonArgs, printUsage, runCircuitConfigCapture } from "./pentair-circuit-config-capture.mjs";

const args = parseCommonArgs(process.argv.slice(2));

if (args.help) {
  printUsage("tools/aux2-name-sweep.mjs", "Operator-assisted AUX 2 assigned-name capture for issue #75.");
  process.exit(0);
}

await runCircuitConfigCapture({
  issue: "#75 Task: Map EasyTouch assigned-name tokens by cycling one feature circuit through all unique names",
  mode: "name",
  circuitIndex: 4,
  circuitLabel: "AUX 2",
  apiBase: args.apiBase,
  timeoutMs: args.timeoutMs,
  outputPath: args.outputPath ?? undefined
});
