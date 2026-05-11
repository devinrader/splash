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
      res.writeHead(200, {
        "content-type": "application/json"
      });
      res.end(
        JSON.stringify({
          status: "healthy",
          message: "Process alive"
        })
      );
      return;
    }

    if (req.url === "/readyz") {
      const snapshot = this.getSnapshot();
      const ready = snapshot.status === "ok";
      res.writeHead(ready ? 200 : 503, {
        "content-type": "application/json"
      });
      res.end(
        JSON.stringify({
          status: ready ? "healthy" : "unhealthy",
          ready
        })
      );
      return;
    }

    if (req.url === "/health") {
      const snapshot = this.getSnapshot();
      const status = snapshot.status === "ok" ? "healthy" : snapshot.status === "degraded" ? "degraded" : "unhealthy";
      const message =
        status === "healthy"
          ? "Protocol decode pipeline ready"
          : status === "degraded"
            ? "Protocol service reachable with impaired dependencies or readiness"
            : "Protocol service cannot perform its primary role";
      res.writeHead(snapshot.status === "error" ? 503 : 200, {
        "content-type": "application/json"
      });
      res.end(
        JSON.stringify({
          status,
          message,
          startup_phase: snapshot.startupPhase,
          pool_id: snapshot.poolId,
          active_plugin: snapshot.activePlugin,
          stream_id: snapshot.streamId,
          checks: {
            process: {
              status: "healthy"
            },
            nats: {
              status: snapshot.nats === "ok" ? "healthy" : "unhealthy"
            },
            configuration: {
              status: snapshot.configuration === "valid" ? "healthy" : "unhealthy"
            },
            decode: {
              status: snapshot.decode === "ok" ? "healthy" : "unhealthy"
            },
            commands: {
              status: snapshot.commands === "ok" ? "healthy" : "unhealthy"
            }
          },
          nats: snapshot.nats,
          configuration: snapshot.configuration,
          decode: snapshot.decode,
          commands: snapshot.commands,
          config_error_code: snapshot.configErrorCode,
          decode_error_code: snapshot.decodeErrorCode,
          command_error_code: snapshot.commandErrorCode,
          shutdown_reason: snapshot.shutdownReason,
          last_checked: new Date().toISOString(),
          last_transition_at: snapshot.lastTransitionAt
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
