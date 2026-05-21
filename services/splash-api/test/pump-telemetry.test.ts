import test from "node:test";
import assert from "node:assert/strict";
import { App } from "../src/app.js";
import type { MessagingSession } from "../src/messaging.js";
import {
  formatPumpLineProtocolPoint,
  mapPumpTelemetryEvent,
  PumpTelemetryService,
  type PumpHistoryView,
  type PumpLatestView,
  type PumpTelemetryPoint,
  type PumpTelemetryRepository
} from "../src/pump-telemetry.js";

class FakePumpTelemetryRepository implements PumpTelemetryRepository {
  readonly writes: PumpTelemetryPoint[][] = [];
  latest: PumpLatestView = {
    status: "empty",
    message: "No EasyTouch pump telemetry has been captured yet.",
    last_updated: null,
    pumps: []
  };
  history: PumpHistoryView = {
    range: {
      start: "2026-05-18T00:00:00.000Z",
      end: "2026-05-18T01:00:00.000Z"
    },
    interval: "5m",
    series: []
  };

  isConfigured(): boolean {
    return true;
  }

  async checkHealth(): Promise<{ status: "healthy" | "down"; message: string }> {
    return {
      status: "healthy",
      message: "InfluxDB health endpoint responded"
    };
  }

  async writePoints(points: PumpTelemetryPoint[]): Promise<void> {
    this.writes.push(points);
  }

  async getLatest(): Promise<PumpLatestView> {
    return this.latest;
  }

  async getHistory(): Promise<PumpHistoryView> {
    return this.history;
  }
}

class FailingPumpTelemetryRepository implements PumpTelemetryRepository {
  isConfigured(): boolean {
    return true;
  }

  async checkHealth(): Promise<{ status: "healthy" | "down"; message: string }> {
    return {
      status: "healthy",
      message: "InfluxDB health endpoint responded"
    };
  }

  async writePoints(): Promise<void> {
    throw new Error("connect ECONNREFUSED 127.0.0.1:8086");
  }

  async getLatest(): Promise<PumpLatestView> {
    throw new Error("connect ECONNREFUSED 127.0.0.1:8086");
  }

  async getHistory(): Promise<PumpHistoryView> {
    throw new Error("connect ECONNREFUSED 127.0.0.1:8086");
  }
}

const noopLogger = {
  info() {},
  warn() {},
  error() {}
};

test("mapPumpTelemetryEvent maps valid normalized pump payloads", () => {
  const points = mapPumpTelemetryEvent({
    occurred_at: "2026-05-18T01:53:29.016Z",
    source: {
      service: "splash-protocol",
      label: "easytouch.action7"
    },
    pump: {
      pump_id: "pump-main",
      controller_id: "default",
      controller_type: "easytouch",
      bus_address: "0x60"
    },
    metrics: {
      running: true,
      rpm: 1156,
      watts: 352
    }
  });

  assert.equal(points.length, 1);
  assert.equal(points[0]?.pumpId, "pump-main");
  assert.equal(points[0]?.busAddress, "0x60");
  assert.equal(points[0]?.rpm, 1156);
  assert.equal(points[0]?.watts, 352);
  assert.equal(points[0]?.running, true);
});

test("formatPumpLineProtocolPoint renders Influx line protocol for EasyTouch pump telemetry", () => {
  const line = formatPumpLineProtocolPoint({
    pumpId: "pump-main",
    controllerId: "default",
    controllerType: "easytouch",
    busAddress: "0x60",
    source: "easytouch.action7",
    service: "splash-api",
    running: true,
    rpm: 1156,
    watts: 352,
    packetTimestamp: "2026-05-18T01:53:29.016Z"
  });

  assert.match(line, /^easy_touch_pump,/u);
  assert.match(line, /pump_id=pump-main/u);
  assert.match(line, /rpm=1156i/u);
  assert.match(line, /watts=352i/u);
  assert.match(line, /running=true/u);
});

test("pump telemetry service writes first sample immediately and deduplicates within the sample window", async () => {
  const repository = new FakePumpTelemetryRepository();
  const service = new PumpTelemetryService({
    repository,
    sampleIntervalMs: 60 * 1000
  });

  const baseEvent = {
    occurred_at: "2026-05-18T01:53:29.016Z",
    source: {
      service: "splash-protocol",
      label: "easytouch.action7"
    },
    pump: {
      pump_id: "pump-main",
      controller_id: "default",
      controller_type: "easytouch",
      bus_address: "0x60"
    },
    metrics: {
      running: true,
      rpm: 1156,
      watts: 352
    }
  };

  await service.observe(baseEvent);
  await service.observe({
    ...baseEvent,
    occurred_at: "2026-05-18T01:54:00.000Z"
  });
  await service.observe({
    ...baseEvent,
    occurred_at: "2026-05-18T01:54:29.016Z"
  });

  assert.equal(repository.writes.length, 2);
  assert.equal(repository.writes[0]?.[0]?.pumpId, "pump-main");
  assert.equal(repository.writes[1]?.[0]?.packetTimestamp, "2026-05-18T01:54:29.016Z");
});

test("pump telemetry service degrades gracefully when telemetry persistence is unavailable", async () => {
  const service = new PumpTelemetryService({
    repository: new FailingPumpTelemetryRepository()
  });

  await service.observe({
    occurred_at: "2026-05-18T01:53:29.016Z",
    source: {
      service: "splash-protocol",
      label: "easytouch.action7"
    },
    pump: {
      pump_id: "pump-main",
      controller_id: "default",
      controller_type: "easytouch",
      bus_address: "0x60"
    },
    metrics: {
      running: true,
      rpm: 1156,
      watts: 352
    }
  });

  await assert.doesNotReject(async () => service.getLatest());
  await assert.doesNotReject(async () =>
    service.getHistory({
      pumpId: "pump-main",
      start: "2026-05-18T00:00:00.000Z",
      end: "2026-05-18T01:00:00.000Z",
      interval: "5m"
    })
  );

  const latest = await service.getLatest();
  assert.equal(latest.status, "empty");
  assert.equal(
    latest.message,
    "EasyTouch pump telemetry is temporarily unavailable: connect ECONNREFUSED 127.0.0.1:8086"
  );

  const history = await service.getHistory({
    pumpId: "pump-main",
    start: "2026-05-18T00:00:00.000Z",
    end: "2026-05-18T01:00:00.000Z",
    interval: "5m"
  });
  assert.deepEqual(history.series, []);
});

test("app persists normalized EasyTouch pump events and exposes latest and history views", async () => {
  const repository = new FakePumpTelemetryRepository();
  repository.latest = {
    status: "available",
    message: "EasyTouch pump telemetry is available.",
    last_updated: "2026-05-18T01:53:29.016Z",
    pumps: [
      {
        pump_id: "pump-main",
        controller_id: "default",
        controller_type: "easytouch",
        bus_address: "0x60",
        timestamp: "2026-05-18T01:53:29.016Z",
        running: true,
        rpm: 1156,
        watts: 352
      }
    ]
  };
  repository.history = {
    range: {
      start: "2026-05-18T00:00:00.000Z",
      end: "2026-05-18T01:00:00.000Z"
    },
    interval: "5m",
    series: [
      {
        pump_id: "pump-main",
        controller_id: "default",
        controller_type: "easytouch",
        bus_address: "0x60",
        points: [
          {
            timestamp: "2026-05-18T01:50:00.000Z",
            running: true,
            rpm: 1100,
            watts: 340
          }
        ]
      }
    ]
  };

  const telemetry = new PumpTelemetryService({ repository });
  const app = new App({
    config: {
      poolId: "pool-1",
      natsUrl: "nats://127.0.0.1:4222",
      httpBind: "127.0.0.1:8080",
      logLevel: "info",
      timezone: "UTC",
      natsMonitoringUrl: null
    },
    logger: noopLogger,
    pumpTelemetry: telemetry
  }) as unknown as {
    runNatsSession(session: MessagingSession, signal: AbortSignal): Promise<void>;
    getPumpTelemetryLatest(input: { pumpId: string | null }): Promise<Record<string, unknown>>;
    getPumpTelemetryHistory(input: {
      pumpId: string | null;
      start: string | null;
      end: string | null;
      interval: string | null;
    }): Promise<Record<string, unknown>>;
  };

  const handlers = new Map<string, Array<(payload: Record<string, unknown>) => Promise<void> | void>>();
  const session: MessagingSession & {
    emit(subject: string, payload: Record<string, unknown>): Promise<void>;
  } = {
    async publish() {},
    subscribe(subject, handler) {
      const list = handlers.get(subject) ?? [];
      list.push(handler);
      handlers.set(subject, list);
    },
    async emit(subject, payload) {
      for (const handler of handlers.get(subject) ?? []) {
        await handler(payload);
      }
    }
  };

  const controller = new AbortController();
  const running = app.runNatsSession(session, controller.signal);

  await session.emit("equipment.state.pump", {
    occurred_at: "2026-05-18T01:53:29.016Z",
    source: {
      service: "splash-protocol"
    },
    equipment_id: null,
    equipment_type: "pump",
    bus_address: "0x60",
    running: true,
    rpm: 1156,
    watts: 352
  });

  const latest = await app.getPumpTelemetryLatest({ pumpId: "pump-main" });
  const history = await app.getPumpTelemetryHistory({
    pumpId: "pump-main",
    start: "2026-05-18T00:00:00.000Z",
    end: "2026-05-18T01:00:00.000Z",
    interval: "5m"
  });

  controller.abort();
  await running;

  assert.equal(repository.writes.length, 1);
  assert.equal(repository.writes[0]?.[0]?.pumpId, "pump-main");
  assert.equal((latest.pumps as Array<Record<string, unknown>>).length, 1);
  assert.equal((history.series as Array<Record<string, unknown>>).length, 1);
});
