export class RollingMessageRate {
  private readonly windowMs: number;
  private readonly timestamps: number[] = [];

  constructor(windowMs: number = 10_000) {
    this.windowMs = windowMs;
  }

  record(at: number = Date.now()): void {
    this.timestamps.push(at);
    this.prune(at);
  }

  getMessagesPerSecond(now: number = Date.now()): number {
    this.prune(now);
    return this.timestamps.length / (this.windowMs / 1000);
  }

  private prune(now: number): void {
    const cutoff = now - this.windowMs;
    while (this.timestamps.length > 0 && this.timestamps[0] < cutoff) {
      this.timestamps.shift();
    }
  }
}

export interface NatsBrokerRateSnapshot {
  status: "ok" | "unavailable" | "error";
  subscriptions: number | null;
  inMessagesPerSecond: number | null;
  outMessagesPerSecond: number | null;
  lastSampleAt: string | null;
  errorCode: string | null;
}

export interface PlatformServiceSnapshot {
  status: "ok" | "degraded" | "error" | "unavailable";
  summary: string;
  detail: string | null;
  updatedAt: string | null;
}

export interface NatsVarzMonitorOptions {
  monitoringUrl: string | null;
  fetchImpl?: typeof fetch;
  pollIntervalMs?: number;
}

export interface PlatformServiceHealthMonitorOptions {
  healthUrl: string | null;
  fetchImpl?: typeof fetch;
  pollIntervalMs?: number;
  parser: (payload: Record<string, unknown>) => Omit<PlatformServiceSnapshot, "updatedAt">;
}

export class NatsVarzMonitor {
  private readonly monitoringUrl: string | null;
  private readonly fetchImpl: typeof fetch;
  private readonly pollIntervalMs: number;
  private snapshot: NatsBrokerRateSnapshot = {
    status: "unavailable",
    subscriptions: null,
    inMessagesPerSecond: null,
    outMessagesPerSecond: null,
    lastSampleAt: null,
    errorCode: "nats_monitoring_unconfigured"
  };
  private previousSample: { inMsgs: number; outMsgs: number; capturedAt: number } | null = null;

  constructor(options: NatsVarzMonitorOptions) {
    this.monitoringUrl = options.monitoringUrl;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.pollIntervalMs = options.pollIntervalMs ?? 5000;
  }

  getSnapshot(): NatsBrokerRateSnapshot {
    return { ...this.snapshot };
  }

  async start(signal: AbortSignal): Promise<void> {
    if (!this.monitoringUrl) {
      return;
    }

    await this.pollOnce();
    while (!signal.aborted) {
      await waitFor(signal, this.pollIntervalMs);
      if (signal.aborted) {
        return;
      }
      await this.pollOnce();
    }
  }

  private async pollOnce(): Promise<void> {
    if (!this.monitoringUrl) {
      return;
    }

    try {
      const response = await this.fetchImpl(`${this.monitoringUrl.replace(/\/+$/, "")}/varz`);
      if (!response.ok) {
        throw new Error(`unexpected_status_${response.status}`);
      }
      const payload = await response.json() as { in_msgs?: unknown; out_msgs?: unknown; subscriptions?: unknown };
      const subscriptions = typeof payload.subscriptions === "number" ? payload.subscriptions : null;
      const inMsgs = typeof payload.in_msgs === "number" ? payload.in_msgs : null;
      const outMsgs = typeof payload.out_msgs === "number" ? payload.out_msgs : null;
      if (inMsgs === null || outMsgs === null) {
        throw new Error("nats_monitoring_varz_invalid");
      }

      const now = Date.now();
      const lastSampleAt = new Date(now).toISOString();
      if (this.previousSample === null) {
        this.previousSample = { inMsgs, outMsgs, capturedAt: now };
        this.snapshot = {
          status: "ok",
          subscriptions,
          inMessagesPerSecond: null,
          outMessagesPerSecond: null,
          lastSampleAt,
          errorCode: null
        };
        return;
      }

      const elapsedSeconds = (now - this.previousSample.capturedAt) / 1000;
      const inMessagesPerSecond = elapsedSeconds > 0 ? Math.max(0, (inMsgs - this.previousSample.inMsgs) / elapsedSeconds) : null;
      const outMessagesPerSecond = elapsedSeconds > 0 ? Math.max(0, (outMsgs - this.previousSample.outMsgs) / elapsedSeconds) : null;
      this.previousSample = { inMsgs, outMsgs, capturedAt: now };
      this.snapshot = {
        status: "ok",
        subscriptions,
        inMessagesPerSecond,
        outMessagesPerSecond,
        lastSampleAt,
        errorCode: null
      };
    } catch (error) {
      this.snapshot = {
        status: "error",
        subscriptions: null,
        inMessagesPerSecond: null,
        outMessagesPerSecond: null,
        lastSampleAt: this.snapshot.lastSampleAt,
        errorCode: error instanceof Error ? error.message : "nats_monitoring_request_failed"
      };
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

export class PlatformServiceHealthMonitor {
  private readonly healthUrl: string | null;
  private readonly fetchImpl: typeof fetch;
  private readonly pollIntervalMs: number;
  private readonly parser: (payload: Record<string, unknown>) => Omit<PlatformServiceSnapshot, "updatedAt">;
  private snapshot: PlatformServiceSnapshot = {
    status: "unavailable",
    summary: "Unavailable",
    detail: "Health endpoint is not configured.",
    updatedAt: null
  };

  constructor(options: PlatformServiceHealthMonitorOptions) {
    this.healthUrl = options.healthUrl;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.pollIntervalMs = options.pollIntervalMs ?? 5000;
    this.parser = options.parser;
  }

  getSnapshot(): PlatformServiceSnapshot {
    return { ...this.snapshot };
  }

  async start(signal: AbortSignal): Promise<void> {
    if (!this.healthUrl) {
      return;
    }

    await this.pollOnce();
    while (!signal.aborted) {
      await waitFor(signal, this.pollIntervalMs);
      if (signal.aborted) {
        return;
      }
      await this.pollOnce();
    }
  }

  private async pollOnce(): Promise<void> {
    if (!this.healthUrl) {
      return;
    }

    try {
      const response = await this.fetchImpl(this.healthUrl);
      if (!response.ok) {
        throw new Error(`unexpected_status_${response.status}`);
      }
      const payload = await response.json() as Record<string, unknown>;
      const parsed = this.parser(payload);
      this.snapshot = {
        ...parsed,
        updatedAt: new Date().toISOString()
      };
    } catch (error) {
      this.snapshot = {
        status: "unavailable",
        summary: "Unavailable",
        detail: error instanceof Error ? error.message : "service_health_request_failed",
        updatedAt: this.snapshot.updatedAt
      };
    }
  }
}
