#!/usr/bin/env node

import process from "node:process";
import { parseArgs, runFeatureCircuitSweep } from "./feature-circuit-sweep.js";

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  await runFeatureCircuitSweep(options);
}

function printHelp() {
  console.log("Usage: splash-cli [--api-base-url URL] [--output-dir PATH] [--operator NAME] [--sweep-type feature|system|feature8-name|aux6-function] [--dry-run] [--no-tui]");
  console.log("");
  console.log("Runs an interactive Splash API watch-session sweep for EasyTouch circuit-state or circuit-configuration mapping workflows.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
