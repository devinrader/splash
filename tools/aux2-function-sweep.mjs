#!/usr/bin/env node

import { parseCommonArgs, printUsage, runCircuitConfigCapture } from "./pentair-circuit-config-capture.mjs";

const args = parseCommonArgs(process.argv.slice(2));

if (args.help) {
  printUsage("tools/aux2-function-sweep.mjs", "Operator-assisted AUX 2 circuit-function capture for issue #78.");
  process.exit(0);
}

await runCircuitConfigCapture({
  issue: "#78 Task: Map EasyTouch relay-circuit function names to functionId values",
  mode: "function",
  circuitIndex: 4,
  circuitLabel: "AUX 2",
  apiBase: args.apiBase,
  timeoutMs: args.timeoutMs,
  outputPath: args.outputPath ?? undefined
});
