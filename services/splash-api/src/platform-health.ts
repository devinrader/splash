import net from "node:net";

export type CanonicalServiceStatus = "healthy" | "degraded" | "unhealthy" | "down" | "unknown";
export type ServiceType = "splash" | "third-party";
export type ServiceCriticality = "critical" | "important" | "optional";

export interface ServiceCheckResult {
  status: CanonicalServiceStatus;
  message?: string;
}

export interface PlatformServiceRecord {
  name: string;
  type: ServiceType;
  criticality: ServiceCriticality;
  status: CanonicalServiceStatus;
  message: string;
  lastChecked: string | null;
  responseTimeMs: number | null;
  checks: Record<string, ServiceCheckResult>;
  raw?: Record<string, unknown> | null;
}

export interface PlatformStatusSnapshot {
  overall: CanonicalServiceStatus;
  generatedAt: string;
  services: PlatformServiceRecord[];
}

type SplashHealthPayload = Record<string, unknown>;

interface BaseDefinition {
  name: string;
  type: ServiceType;
  criticality: ServiceCriticality;
}

interface LocalDefinition extends BaseDefinition {
  kind: "local";
  check: () => Promise<Omit<PlatformServiceRecord, "name" | "type" | "criticality">>;
}

interface SplashDefinition extends BaseDefinition {
  kind: "splash";
  healthUrl: string;
}

interface HttpDefinition extends BaseDefinition {
  kind: "http";
  url: string;
}

interface NatsDefinition extends BaseDefinition {
  kind: "nats";
  tcpUrl: string;
  monitoringUrl: string | null;
}

interface PrometheusDefinition extends BaseDefinition {
  kind: "prometheus";
  url: string;
}

interface GrafanaDefinition extends BaseDefinition {
  kind: "grafana";
  url: string;
}

interface InfluxDefinition extends BaseDefinition {
  kind: "influx";
  url: string;
}

export type ServiceDefinition =
  | LocalDefinition
  | SplashDefinition
  | HttpDefinition
  | NatsDefinition
  | PrometheusDefinition
  | GrafanaDefinition
  | InfluxDefinition;

export interface PlatformHealthMonitorOptions {
  registry: ServiceDefinition[];
  fetchImpl?: typeof fetch;
  pollIntervalMs?: number;
  timeoutMs?: number;
  tcpProbe?: (host: string, port: number, timeoutMs: number) => Promise<void>;
}

export class PlatformHealthMonitor {
  private readonly registry: ServiceDefinition[];
  private readonly fetchImpl: typeof fetch;
  private readonly pollIntervalMs: number;
  private readonly timeoutMs: number;
  private readonly tcpProbe: (host: string, port: number, timeoutMs: number) => Promise<void>;
  private snapshot: PlatformStatusSnapshot = {
    overall: "unknown",
    generatedAt: new Date(0).toISOString(),
    services: []
  };
  private lastRefreshAt = 0;
  private inFlight: Promise<PlatformStatusSnapshot> | null = null;

  constructor(options: PlatformHealthMonitorOptions) {
    this.registry = options.registry;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.pollIntervalMs = options.pollIntervalMs ?? 5000;
    this.timeoutMs = options.timeoutMs ?? 2000;
    this.tcpProbe = options.tcpProbe ?? defaultTcpProbe;
    this.snapshot.services = this.registry.map((definition) => ({
      name: definition.name,
      type: definition.type,
      criticality: definition.criticality,
      status: "unknown",
      message: "Not yet evaluated",
      lastChecked: null,
      responseTimeMs: null,
      checks: {}
    }));
  }

  getSnapshot(): PlatformStatusSnapshot {
    return {
      overall: this.snapshot.overall,
      generatedAt: this.snapshot.generatedAt,
      services: this.snapshot.services.map((service) => ({
        ...service,
        checks: { ...service.checks },
        raw: service.raw ? { ...service.raw } : service.raw
      }))
    };
  }

  async refreshNow(): Promise<PlatformStatusSnapshot> {
    if (!this.inFlight) {
      this.inFlight = this.refreshInternal().finally(() => {
        this.inFlight = null;
      });
    }
    return this.inFlight;
  }

  async start(signal: AbortSignal): Promise<void> {
    await this.refreshNow();
    while (!signal.aborted) {
      await waitFor(signal, this.pollIntervalMs);
      if (signal.aborted) {
        return;
      }
      await this.refreshNow();
    }
  }

  isStale(now: number = Date.now()): boolean {
    return this.lastRefreshAt === 0 || now - this.lastRefreshAt > this.pollIntervalMs * 3;
  }

  private async refreshInternal(): Promise<PlatformStatusSnapshot> {
    const services = await Promise.all(this.registry.map((definition) => this.checkDefinition(definition)));
    const serviceMap = new Map(services.map((service) => [service.name, service]));
    this.applyDependencyAdjustments(serviceMap);

    const snapshot: PlatformStatusSnapshot = {
      overall: computeOverallStatus([...serviceMap.values()]),
      generatedAt: new Date().toISOString(),
      services: [...serviceMap.values()]
    };
    this.snapshot = snapshot;
    this.lastRefreshAt = Date.now();
    return this.getSnapshot();
  }

  private async checkDefinition(definition: ServiceDefinition): Promise<PlatformServiceRecord> {
    const startedAt = Date.now();
    try {
      let record: Omit<PlatformServiceRecord, "name" | "type" | "criticality">;
      switch (definition.kind) {
        case "local":
          record = await definition.check();
          break;
        case "splash":
          record = await this.checkSplash(definition.healthUrl);
          break;
        case "http":
          record = await this.checkHttp(definition.url);
          break;
        case "nats":
          record = await this.checkNats(definition.tcpUrl, definition.monitoringUrl);
          break;
        case "prometheus":
          record = await this.checkPrometheus(definition.url);
          break;
        case "grafana":
          record = await this.checkGrafana(definition.url);
          break;
        case "influx":
          record = await this.checkInflux(definition.url);
          break;
      }
      return {
        name: definition.name,
        type: definition.type,
        criticality: definition.criticality,
        ...record,
        responseTimeMs: Date.now() - startedAt
      };
    } catch (error) {
      const message = normalizeCheckError(error);
      return {
        name: definition.name,
        type: definition.type,
        criticality: definition.criticality,
        status: "down",
        message,
        lastChecked: new Date().toISOString(),
        responseTimeMs: Date.now() - startedAt,
        checks: {
          process: {
            status: "down",
            message
          }
        },
        raw: null
      };
    }
  }

  private async checkSplash(healthUrl: string): Promise<Omit<PlatformServiceRecord, "name" | "type" | "criticality">> {
    const { response, payload } = await this.fetchJson(healthUrl);
    const status = readCanonicalStatus(payload.status);
    const message = readString(payload.message) ?? summarizeSplashHealth(payload);
    const checks = readChecks(payload.checks);

    return {
      status: response.ok ? status : status === "unknown" ? "down" : status,
      message,
      lastChecked: new Date().toISOString(),
      responseTimeMs: null,
      checks,
      raw: payload
    };
  }

  private async checkHttp(url: string): Promise<Omit<PlatformServiceRecord, "name" | "type" | "criticality">> {
    const response = await fetchWithTimeout(this.fetchImpl, url, this.timeoutMs);
    return {
      status: response.ok ? "healthy" : "unhealthy",
      message: response.ok ? "Reachable" : `Unexpected HTTP ${response.status}`,
      lastChecked: new Date().toISOString(),
      responseTimeMs: null,
      checks: {
        process: {
          status: response.ok ? "healthy" : "unhealthy",
          message: response.ok ? "HTTP endpoint reachable" : `Unexpected HTTP ${response.status}`
        }
      },
      raw: null
    };
  }

  private async checkNats(tcpUrl: string, monitoringUrl: string | null): Promise<Omit<PlatformServiceRecord, "name" | "type" | "criticality">> {
    const parsed = new URL(tcpUrl);
    const port = Number.parseInt(parsed.port || "4222", 10);
    await this.tcpProbe(parsed.hostname, port, this.timeoutMs);

    const checks: Record<string, ServiceCheckResult> = {
      tcp: {
        status: "healthy",
        message: `Connected to ${parsed.hostname}:${port}`
      }
    };

    if (!monitoringUrl) {
      return {
        status: "healthy",
        message: "NATS client port reachable",
        lastChecked: new Date().toISOString(),
        responseTimeMs: null,
        checks,
        raw: null
      };
    }

    const { payload } = await this.fetchJson(`${monitoringUrl.replace(/\/+$/, "")}/varz`);
    const subscriptions = readNumber(payload.subscriptions);
    const connections = readNumber(payload.connections);
    checks.monitoring = {
      status: "healthy",
      message: `Monitoring reachable${subscriptions != null ? ` · subscriptions ${subscriptions}` : ""}${connections != null ? ` · connections ${connections}` : ""}`
    };

    return {
      status: "healthy",
      message: "NATS client and monitoring endpoints reachable",
      lastChecked: new Date().toISOString(),
      responseTimeMs: null,
      checks,
      raw: payload
    };
  }

  private async checkPrometheus(url: string): Promise<Omit<PlatformServiceRecord, "name" | "type" | "criticality">> {
    const healthUrl = `${url.replace(/\/+$/, "")}/-/healthy`;
    const response = await fetchWithTimeout(this.fetchImpl, healthUrl, this.timeoutMs);
    if (!response.ok) {
      return {
        status: "unhealthy",
        message: `Prometheus health endpoint returned HTTP ${response.status}`,
        lastChecked: new Date().toISOString(),
        responseTimeMs: null,
        checks: {
          process: {
            status: "unhealthy",
            message: `HTTP ${response.status}`
          }
        },
        raw: null
      };
    }

    let status: CanonicalServiceStatus = "healthy";
    let message = "Prometheus is healthy";
    const checks: Record<string, ServiceCheckResult> = {
      process: {
        status: "healthy",
        message: "Prometheus healthy endpoint responded"
      }
    };

    try {
      const { payload } = await this.fetchJson(`${url.replace(/\/+$/, "")}/api/v1/targets`);
      const activeTargets = Array.isArray((payload.data as Record<string, unknown> | undefined)?.activeTargets)
        ? ((payload.data as Record<string, unknown>).activeTargets as Array<Record<string, unknown>>)
        : [];
      const downTargets = activeTargets.filter((target) => target.health !== "up");
      if (downTargets.length > 0) {
        status = "degraded";
        message = `${downTargets.length} scrape target(s) degraded`;
        checks.targets = {
          status: "degraded",
          message
        };
      } else {
        checks.targets = {
          status: "healthy",
          message: "Configured scrape targets are up"
        };
      }
      return {
        status,
        message,
        lastChecked: new Date().toISOString(),
        responseTimeMs: null,
        checks,
        raw: payload
      };
    } catch {
      return {
        status,
        message,
        lastChecked: new Date().toISOString(),
        responseTimeMs: null,
        checks,
        raw: null
      };
    }
  }

  private async checkGrafana(url: string): Promise<Omit<PlatformServiceRecord, "name" | "type" | "criticality">> {
    const { payload } = await this.fetchJson(`${url.replace(/\/+$/, "")}/api/health`);
    const database = readString(payload.database) ?? "unknown";
    const version = readString(payload.version) ?? null;
    const healthy = database.toLowerCase() === "ok";

    return {
      status: healthy ? "healthy" : "unhealthy",
      message: healthy ? "Grafana health API responded" : `Grafana database status ${database}`,
      lastChecked: new Date().toISOString(),
      responseTimeMs: null,
      checks: {
        process: {
          status: healthy ? "healthy" : "unhealthy",
          message: version ? `Grafana ${version}` : "Grafana reachable"
        },
        database: {
          status: healthy ? "healthy" : "unhealthy",
          message: `Database ${database}`
        }
      },
      raw: payload
    };
  }

  private async checkInflux(url: string): Promise<Omit<PlatformServiceRecord, "name" | "type" | "criticality">> {
    const { payload, response } = await this.fetchJson(`${url.replace(/\/+$/, "")}/health`);
    const status = readString(payload.status)?.toLowerCase();
    const healthy = response.ok && status === "pass";
    return {
      status: healthy ? "healthy" : "down",
      message: healthy ? "InfluxDB health endpoint responded" : `InfluxDB health is ${status ?? `HTTP ${response.status}`}`,
      lastChecked: new Date().toISOString(),
      responseTimeMs: null,
      checks: {
        process: {
          status: healthy ? "healthy" : "down",
          message: healthy ? "InfluxDB health endpoint responded" : `InfluxDB health is ${status ?? `HTTP ${response.status}`}`
        }
      },
      raw: payload
    };
  }

  private applyDependencyAdjustments(serviceMap: Map<string, PlatformServiceRecord>): void {
    const prometheus = serviceMap.get("prometheus");
    const grafana = serviceMap.get("grafana");
    if (grafana && prometheus && grafana.status === "healthy" && prometheus.status !== "healthy") {
      grafana.status = "degraded";
      grafana.message = "Grafana reachable but Prometheus datasource may be impaired";
      grafana.checks.datasource = {
        status: prometheus.status === "down" ? "down" : "degraded",
        message: `Prometheus is ${prometheus.status}`
      };
    }

    const api = serviceMap.get("splash-api");
    const frontend = serviceMap.get("splash-frontend");
    if (frontend && api && frontend.status === "healthy" && api.status !== "healthy") {
      frontend.status = "degraded";
      frontend.message = "Frontend reachable but Splash API is impaired";
      frontend.checks.api = {
        status: api.status,
        message: `Splash API is ${api.status}`
      };
    }
  }

  private async fetchJson(url: string): Promise<{ response: Response; payload: SplashHealthPayload }> {
    const response = await fetchWithTimeout(this.fetchImpl, url, this.timeoutMs);
    const payload = (await response.json()) as SplashHealthPayload;
    return { response, payload };
  }
}

export function computeOverallStatus(services: PlatformServiceRecord[]): CanonicalServiceStatus {
  if (services.some((service) => service.criticality === "critical" && (service.status === "down" || service.status === "unhealthy"))) {
    return "unhealthy";
  }
  if (services.some((service) => service.criticality === "important" && (service.status === "down" || service.status === "unhealthy"))) {
    return "degraded";
  }
  if (services.some((service) => service.status === "degraded")) {
    return "degraded";
  }
  if (services.some((service) => service.criticality === "optional" && (service.status === "down" || service.status === "unhealthy"))) {
    return "degraded";
  }
  if (services.some((service) => service.criticality !== "optional" && service.status === "unknown")) {
    return "unknown";
  }
  return "healthy";
}

function summarizeSplashHealth(payload: SplashHealthPayload): string {
  const summary = readString(payload.summary);
  if (summary) {
    return summary;
  }
  return statusToLabel(readCanonicalStatus(payload.status));
}

function readChecks(value: unknown): Record<string, ServiceCheckResult> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, checkValue]) => {
      const record = checkValue && typeof checkValue === "object" && !Array.isArray(checkValue)
        ? (checkValue as Record<string, unknown>)
        : {};
      return [key, {
        status: readCanonicalStatus(record.status),
        message: readString(record.message) ?? undefined
      }];
    })
  );
}

function readCanonicalStatus(value: unknown): CanonicalServiceStatus {
  if (value === "healthy" || value === "degraded" || value === "unhealthy" || value === "down" || value === "unknown") {
    return value;
  }
  if (value === "ok") {
    return "healthy";
  }
  if (value === "error") {
    return "unhealthy";
  }
  if (value === "unavailable") {
    return "down";
  }
  return "unknown";
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function statusToLabel(status: CanonicalServiceStatus): string {
  switch (status) {
    case "healthy":
      return "Healthy";
    case "degraded":
      return "Degraded";
    case "unhealthy":
      return "Unhealthy";
    case "down":
      return "Down";
    case "unknown":
      return "Unknown";
  }
}

function normalizeCheckError(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "AbortError" || error.message === "This operation was aborted") {
      return "health_check_timeout";
    }
    if (error.message === "tcp_timeout") {
      return "tcp_timeout";
    }
    return error.message;
  }
  return "health_check_failed";
}

async function fetchWithTimeout(fetchImpl: typeof fetch, url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
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

function defaultTcpProbe(host: string, port: number, timeoutMs: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const socket = net.connect({ host, port });
    const onError = (error: Error) => {
      socket.destroy();
      reject(error);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => {
      socket.end();
      resolve();
    });
    socket.once("timeout", () => onError(new Error("tcp_timeout")));
    socket.once("error", onError);
  });
}
