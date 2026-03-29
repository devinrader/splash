import { App } from "./app.js";
import { createLogger } from "./logger.js";

async function main(): Promise<void> {
  const logger = createLogger();
  const signal = new AbortController();

  process.on("SIGINT", () => signal.abort());
  process.on("SIGTERM", () => signal.abort());

  logger.info("service.start", "Starting splash-protocol.");

  const app = new App({ logger });
  await app.run(signal.signal);
}

main().catch((error) => {
  const logger = createLogger();
  logger.error("service.fatal", "Fatal splash-protocol startup error.", {
    error: error instanceof Error ? error.message : String(error)
  });
  process.exitCode = 1;
});
