import { connect, type NatsConnection } from "nats";
import type { Logger } from "./logger.js";

export interface NatsConnectionState {
  status: "ok" | "error";
  errorCode: string | null;
}

export class NatsSupervisor {
  private connection: NatsConnection | null = null;
  private state: NatsConnectionState = { status: "error", errorCode: "nats_unavailable" };

  constructor(
    private readonly natsUrl: string,
    private readonly logger: Logger
  ) {}

  snapshot(): NatsConnectionState {
    return this.state;
  }

  async run(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      try {
        this.logger.info("nats.connect.attempt", "Attempting NATS connection.", {
          nats_url: this.natsUrl
        });
        this.connection = await connect({
          servers: this.natsUrl,
          timeout: 2000,
          reconnect: false
        });
        this.state = { status: "ok", errorCode: null };
        this.logger.info("nats.connect.succeeded", "Connected to NATS.", {
          nats_url: this.natsUrl
        });
        await this.connection.closed();
      } catch (error) {
        this.state = { status: "error", errorCode: "nats_connect_failed" };
        this.logger.warn("nats.connect.failed", "NATS connection failed.", {
          nats_url: this.natsUrl,
          error: error instanceof Error ? error.message : String(error)
        });
      } finally {
        if (this.connection) {
          await this.connection.close();
          this.connection = null;
        }
      }

      await waitFor(signal, 5000);
    }
  }
}

async function waitFor(signal: AbortSignal, ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true }
    );
  });
}
