import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { renderMetrics } from "./metrics.js";
import type { AppSnapshot } from "./state.js";

export interface HttpServer {
  start(signal: AbortSignal): Promise<void>;
}

export class LocalHttpServer implements HttpServer {
  private readonly host: string;
  private readonly port: number;
  private server: Server | null = null;

  constructor(bind: string, private readonly getSnapshot: () => AppSnapshot) {
    const index = bind.lastIndexOf(":");
    this.host = bind.slice(0, index);
    this.port = Number.parseInt(bind.slice(index + 1), 10);
  }

  async start(signal: AbortSignal): Promise<void> {
    if (this.server) {
      return;
    }

    this.server = createServer((req, res) => this.route(req, res));
    signal.addEventListener("abort", () => {
      this.server?.close();
    });

    await new Promise<void>((resolve, reject) => {
      this.server?.once("error", reject);
      this.server?.listen(this.port, this.host, () => {
        this.server?.off("error", reject);
        resolve();
      });
    });
  }

  private route(_req: IncomingMessage, res: ServerResponse): void {
    const req = _req;
    if (req.url === "/healthz") {
      const snapshot = this.getSnapshot();
      res.writeHead(snapshot.status === "error" ? 503 : 200, {
        "content-type": "application/json"
      });
      res.end(
        JSON.stringify({
          status: snapshot.status,
          startup_phase: snapshot.startupPhase,
          pool_id: snapshot.poolId,
          active_plugin: snapshot.activePlugin,
          stream_id: snapshot.streamId,
          nats: snapshot.nats,
          configuration: snapshot.configuration,
          decode: snapshot.decode,
          commands: snapshot.commands,
          config_error_code: snapshot.configErrorCode,
          decode_error_code: snapshot.decodeErrorCode,
          command_error_code: snapshot.commandErrorCode,
          shutdown_reason: snapshot.shutdownReason,
          last_transition_at: snapshot.lastTransitionAt,
          metrics: snapshot.metrics
        })
      );
      return;
    }

    if (req.url === "/metrics") {
      res.writeHead(200, { "content-type": "text/plain; version=0.0.4" });
      res.end(renderMetrics(this.getSnapshot()));
      return;
    }

    res.writeHead(404);
    res.end();
  }
}
