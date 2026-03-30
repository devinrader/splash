import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import type { EventBroker } from "./events.js";
import type { ProtocolFrameBundle, ProtocolFrameBundleSummary } from "./protocol-bundles.js";

export interface HttpServer {
  start(signal: AbortSignal): Promise<void>;
}

export interface HttpHandlers {
  getEquipment(): Array<Record<string, unknown>>;
  getHealth(): Record<string, unknown>;
  getEventBroker(): EventBroker;
  getProtocolFrameBroker(): EventBroker;
  listProtocolFrameBundles(): ProtocolFrameBundleSummary[];
  createProtocolFrameBundle(input: { label: string | null }): ProtocolFrameBundleSummary;
  getProtocolFrameBundle(id: string): ProtocolFrameBundle | null;
  publishPumpSpeedCommand(input: { equipmentId: string; rpm: number }): Promise<{ commandId: string }>;
}

export class LocalHttpServer implements HttpServer {
  private readonly host: string;
  private readonly port: number;
  private server: Server | null = null;

  constructor(bind: string, private readonly handlers: HttpHandlers) {
    const index = bind.lastIndexOf(":");
    this.host = bind.slice(0, index);
    this.port = Number.parseInt(bind.slice(index + 1), 10);
  }

  async start(signal: AbortSignal): Promise<void> {
    if (this.server) {
      return;
    }

    this.server = createServer((req, res) => {
      void this.route(req, res);
    });
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

  private async route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method === "GET" && req.url === "/equipment") {
      return json(res, 200, { data: this.handlers.getEquipment(), error: null });
    }

    if (req.method === "GET" && req.url === "/health") {
      return json(res, 200, this.handlers.getHealth());
    }

    if (req.method === "GET" && req.url === "/events") {
      return this.handleEvents(res, this.handlers.getEventBroker());
    }

    if (req.method === "GET" && req.url === "/protocol/frames") {
      return this.handleEvents(res, this.handlers.getProtocolFrameBroker());
    }

    if (req.method === "GET" && req.url === "/protocol/bundles") {
      return json(res, 200, { data: this.handlers.listProtocolFrameBundles(), error: null });
    }

    if (req.method === "POST" && req.url === "/protocol/bundles") {
      const body = await readJsonBody(req);
      const result = this.handlers.createProtocolFrameBundle({
        label: readOptionalLabel(body)
      });
      return json(res, 201, { data: result, error: null });
    }

    const bundleMatch = req.url?.match(/^\/protocol\/bundles\/([^/]+)$/);
    if (req.method === "GET" && bundleMatch) {
      const bundle = this.handlers.getProtocolFrameBundle(decodeURIComponent(bundleMatch[1]));
      if (!bundle) {
        return json(res, 404, { data: null, error: "Protocol frame bundle not found." });
      }
      return json(res, 200, { data: bundle, error: null });
    }

    const controlMatch = req.url?.match(/^\/equipment\/([^/]+)\/control$/);
    if (req.method === "POST" && controlMatch) {
      const body = await readJsonBody(req);
      const rpm = readRpm(body);
      const result = await this.handlers.publishPumpSpeedCommand({
        equipmentId: decodeURIComponent(controlMatch[1]),
        rpm
      });
      return json(res, 202, {
        data: {
          command_id: result.commandId,
          status: "accepted"
        },
        error: null
      });
    }

    res.writeHead(404);
    res.end();
  }

  private handleEvents(res: ServerResponse, broker: EventBroker): void {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive"
    });

    const clientId = randomUUID();
    const unsubscribe = broker.addClient({
      send(event, payload) {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      }
    });

    res.write(`event: ready\n`);
    res.write(`data: ${JSON.stringify({ client_id: clientId })}\n\n`);

    res.on("close", () => {
      unsubscribe();
      res.end();
    });
  }
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  const body = Buffer.concat(chunks).toString("utf8");
  if (!body) {
    return {};
  }

  const parsed = JSON.parse(body);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Request body must be a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

function readRpm(body: Record<string, unknown>): number {
  const commandType = body.command_type;
  const args = body.arguments;
  if (commandType !== "set_speed" || !args || typeof args !== "object" || Array.isArray(args)) {
    throw new Error("Control payload must provide command_type 'set_speed' and arguments.");
  }

  const rpm = (args as Record<string, unknown>).rpm;
  if (typeof rpm !== "number" || !Number.isInteger(rpm)) {
    throw new Error("Pump speed control requires an integer rpm.");
  }

  return rpm;
}

function readOptionalLabel(body: Record<string, unknown>): string | null {
  const label = body.label;
  if (label == null) {
    return null;
  }

  if (typeof label !== "string") {
    throw new Error("Protocol frame bundle label must be a string when provided.");
  }

  const trimmed = label.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function json(res: ServerResponse, status: number, payload: Record<string, unknown>): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
}
