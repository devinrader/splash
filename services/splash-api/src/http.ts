import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import type { EventBroker } from "./events.js";
import type { ProtocolAnnotation, ProtocolAnnotationInput } from "./protocol-annotations.js";
import type { ProtocolPrompt, ProtocolPromptInput } from "./protocol-prompts.js";
import type {
  ProtocolBundleComparison,
  ProtocolFrameBundle,
  ProtocolFrameBundleSummary
} from "./protocol-bundles.js";

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
  compareProtocolFrameBundles(input: {
    baselineBundleId: string;
    comparisonBundleId: string;
  }): ProtocolBundleComparison | null;
  listProtocolAnnotations(bundleId: string | null): ProtocolAnnotation[];
  createProtocolAnnotation(input: ProtocolAnnotationInput): ProtocolAnnotation;
  listProtocolPrompts(bundleId: string | null): ProtocolPrompt[];
  createProtocolPrompt(input: ProtocolPromptInput): ProtocolPrompt;
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
    if (req.method === "OPTIONS") {
      return preflight(res, req);
    }

    if (req.method === "GET" && req.url === "/equipment") {
      return json(req, res, 200, { data: this.handlers.getEquipment(), error: null });
    }

    if (req.method === "GET" && req.url === "/health") {
      return json(req, res, 200, this.handlers.getHealth());
    }

    if (req.method === "GET" && req.url === "/events") {
      return this.handleEvents(req, res, this.handlers.getEventBroker());
    }

    if (req.method === "GET" && req.url === "/protocol/frames") {
      return this.handleEvents(req, res, this.handlers.getProtocolFrameBroker());
    }

    if (req.method === "GET" && req.url === "/protocol/bundles") {
      return json(req, res, 200, { data: this.handlers.listProtocolFrameBundles(), error: null });
    }

    if (req.method === "GET" && req.url?.startsWith("/protocol/annotations")) {
      const url = new URL(req.url, "http://localhost");
      const bundleId = url.searchParams.get("bundle_id");
      return json(req, res, 200, { data: this.handlers.listProtocolAnnotations(bundleId), error: null });
    }

    if (req.method === "GET" && req.url?.startsWith("/protocol/prompts")) {
      const url = new URL(req.url, "http://localhost");
      const bundleId = url.searchParams.get("bundle_id");
      return json(req, res, 200, { data: this.handlers.listProtocolPrompts(bundleId), error: null });
    }

    if (req.method === "POST" && req.url === "/protocol/bundles") {
      const body = await readJsonBody(req);
      const result = this.handlers.createProtocolFrameBundle({
        label: readOptionalLabel(body)
      });
      return json(req, res, 201, { data: result, error: null });
    }

    if (req.method === "POST" && req.url === "/protocol/bundles/compare") {
      const body = await readJsonBody(req);
      const result = this.handlers.compareProtocolFrameBundles(readBundleCompareRequest(body));
      if (!result) {
        return json(req, res, 404, { data: null, error: "One or both protocol frame bundles were not found." });
      }
      return json(req, res, 200, { data: result, error: null });
    }

    if (req.method === "POST" && req.url === "/protocol/annotations") {
      const body = await readJsonBody(req);
      const result = this.handlers.createProtocolAnnotation(readProtocolAnnotation(body));
      return json(req, res, 201, { data: result, error: null });
    }

    if (req.method === "POST" && req.url === "/protocol/prompts") {
      const body = await readJsonBody(req);
      const result = this.handlers.createProtocolPrompt(readProtocolPrompt(body));
      return json(req, res, 201, { data: result, error: null });
    }

    const bundleMatch = req.url?.match(/^\/protocol\/bundles\/([^/]+)$/);
    if (req.method === "GET" && bundleMatch) {
      const bundle = this.handlers.getProtocolFrameBundle(decodeURIComponent(bundleMatch[1]));
      if (!bundle) {
        return json(req, res, 404, { data: null, error: "Protocol frame bundle not found." });
      }
      return json(req, res, 200, { data: bundle, error: null });
    }

    const controlMatch = req.url?.match(/^\/equipment\/([^/]+)\/control$/);
    if (req.method === "POST" && controlMatch) {
      const body = await readJsonBody(req);
      const rpm = readRpm(body);
      const result = await this.handlers.publishPumpSpeedCommand({
        equipmentId: decodeURIComponent(controlMatch[1]),
        rpm
      });
      return json(req, res, 202, {
        data: {
          command_id: result.commandId,
          status: "accepted"
        },
        error: null
      });
    }

    res.writeHead(404, corsHeaders(req));
    res.end();
  }

  private handleEvents(req: IncomingMessage, res: ServerResponse, broker: EventBroker): void {
    res.writeHead(200, {
      ...corsHeaders(req),
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

function readBundleCompareRequest(body: Record<string, unknown>): {
  baselineBundleId: string;
  comparisonBundleId: string;
} {
  const baselineBundleId = body.baseline_bundle_id;
  const comparisonBundleId = body.comparison_bundle_id;
  if (typeof baselineBundleId !== "string" || typeof comparisonBundleId !== "string") {
    throw new Error("Bundle comparison requires string baseline_bundle_id and comparison_bundle_id.");
  }

  return {
    baselineBundleId,
    comparisonBundleId
  };
}

function readProtocolAnnotation(body: Record<string, unknown>): ProtocolAnnotationInput {
  const bundleId = body.bundle_id;
  const frameIndex = body.frame_index;
  const fieldName = body.field_name;
  const byteStart = body.byte_start;
  const byteEnd = body.byte_end;
  const confidence = body.confidence;
  const label = body.label;
  const notes = body.notes;

  if (typeof bundleId !== "string" || bundleId.length === 0) {
    throw new Error("Protocol annotation requires a string bundle_id.");
  }
  if (typeof frameIndex !== "number" || !Number.isInteger(frameIndex) || frameIndex < 0) {
    throw new Error("Protocol annotation requires a non-negative integer frame_index.");
  }
  if (typeof fieldName !== "string" || fieldName.trim().length === 0) {
    throw new Error("Protocol annotation requires a non-empty string field_name.");
  }
  if (typeof byteStart !== "number" || !Number.isInteger(byteStart) || byteStart < 0) {
    throw new Error("Protocol annotation requires a non-negative integer byte_start.");
  }
  if (typeof byteEnd !== "number" || !Number.isInteger(byteEnd) || byteEnd < byteStart) {
    throw new Error("Protocol annotation requires byte_end greater than or equal to byte_start.");
  }
  if (confidence !== "known" && confidence !== "inferred" && confidence !== "unknown") {
    throw new Error("Protocol annotation confidence must be one of known, inferred, or unknown.");
  }
  if (typeof label !== "string" || label.trim().length === 0) {
    throw new Error("Protocol annotation requires a non-empty string label.");
  }
  if (notes != null && typeof notes !== "string") {
    throw new Error("Protocol annotation notes must be a string when provided.");
  }

  return {
    bundle_id: bundleId,
    frame_index: frameIndex,
    field_name: fieldName.trim(),
    byte_start: byteStart,
    byte_end: byteEnd,
    confidence,
    label: label.trim(),
    notes: typeof notes === "string" && notes.trim().length > 0 ? notes : null
  };
}

function readProtocolPrompt(body: Record<string, unknown>): ProtocolPromptInput {
  const bundleId = body.bundle_id;
  const frameIndex = body.frame_index;
  const fieldName = body.field_name;
  const prompt = body.prompt;
  const why = body.why;
  const inputType = body.input_type;
  const operatorResponse = body.operator_response;

  if (typeof bundleId !== "string" || bundleId.length === 0) {
    throw new Error("Protocol prompt requires a string bundle_id.");
  }
  if (typeof frameIndex !== "number" || !Number.isInteger(frameIndex) || frameIndex < 0) {
    throw new Error("Protocol prompt requires a non-negative integer frame_index.");
  }
  if (fieldName != null && (typeof fieldName !== "string" || fieldName.trim().length === 0)) {
    throw new Error("Protocol prompt field_name must be a non-empty string when provided.");
  }
  if (typeof prompt !== "string" || prompt.trim().length === 0) {
    throw new Error("Protocol prompt requires a non-empty string prompt.");
  }
  if (typeof why !== "string" || why.trim().length === 0) {
    throw new Error("Protocol prompt requires a non-empty string why.");
  }
  if (
    inputType !== "controller_menu_state" &&
    inputType !== "equipment_behavior" &&
    inputType !== "circuit_name" &&
    inputType !== "configured_rpm"
  ) {
    throw new Error(
      "Protocol prompt input_type must be one of controller_menu_state, equipment_behavior, circuit_name, or configured_rpm."
    );
  }
  if (operatorResponse != null && typeof operatorResponse !== "string") {
    throw new Error("Protocol prompt operator_response must be a string when provided.");
  }

  return {
    bundle_id: bundleId,
    frame_index: frameIndex,
    field_name: typeof fieldName === "string" ? fieldName.trim() : null,
    prompt: prompt.trim(),
    why: why.trim(),
    input_type: inputType,
    operator_response:
      typeof operatorResponse === "string" && operatorResponse.trim().length > 0 ? operatorResponse : null
  };
}

function json(req: IncomingMessage, res: ServerResponse, status: number, payload: Record<string, unknown>): void {
  res.writeHead(status, {
    ...corsHeaders(req),
    "content-type": "application/json"
  });
  res.end(JSON.stringify(payload));
}

function preflight(res: ServerResponse, req: IncomingMessage): void {
  res.writeHead(204, corsHeaders(req));
  res.end();
}

export function corsHeaders(req: Pick<IncomingMessage, "headers">): Record<string, string> {
  const origin = req.headers.origin;
  return {
    "access-control-allow-origin": typeof origin === "string" && origin.length > 0 ? origin : "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    vary: "Origin"
  };
}
