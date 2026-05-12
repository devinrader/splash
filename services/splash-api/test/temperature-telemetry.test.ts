import test from "node:test";
import assert from "node:assert/strict";
import { App } from "../src/app.js";
import type { MessagingSession } from "../src/messaging.js";
import {
  formatLineProtocolPoint,
  normalizeTemperature,
  queryInfluxRows,
  TemperatureTelemetryService,
  type TemperatureHistoryView,
  type TemperatureLatestView,
  type TemperatureTelemetryPoint,
  type TemperatureTelemetryRepository
} from "../src/temperature-telemetry.js";

class FakeTelemetryRepository implements TemperatureTelemetryRepository {
  readonly writes: TemperatureTelemetryPoint[][] = [];
  latest: TemperatureLatestView = {
    controller_id: "default",
    status: "empty",
    message: "No EasyTouch temperature history has been captured yet.",
    last_updated: null,
    readings: {}
  };
  history: TemperatureHistoryView = {
    controller_id: "default",
    range: {
      start: "2026-05-11T00:00:00.000Z",
      end: "2026-05-12T00:00:00.000Z"
    },
    interval: "1h",
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

  async writePoints(points: TemperatureTelemetryPoint[]): Promise<void> {
    this.writes.push(points);
  }

  async getLatest(): Promise<TemperatureLatestView> {
    return this.latest;
  }

  async getHistory(): Promise<TemperatureHistoryView> {
    return this.history;
  }
}

class FailingTelemetryRepository implements TemperatureTelemetryRepository {
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

  async getLatest(): Promise<TemperatureLatestView> {
    throw new Error("connect ECONNREFUSED 127.0.0.1:8086");
  }

  async getHistory(): Promise<TemperatureHistoryView> {
    throw new Error("connect ECONNREFUSED 127.0.0.1:8086");
  }
}

const noopLogger = {
  info() {},
  warn() {},
  error() {}
};

test("normalizeTemperature converts Fahrenheit and Celsius readings", () => {
  assert.deepEqual(normalizeTemperature(82, "F"), {
    normalizedF: 82,
    normalizedC: 27.8
  });
  assert.deepEqual(normalizeTemperature(28, "C"), {
    normalizedF: 82.4,
    normalizedC: 28
  });
});

test("formatLineProtocolPoint renders Influx line protocol for EasyTouch temperatures", () => {
  const line = formatLineProtocolPoint({
    controllerId: "default",
    controllerType: "easytouch",
    sensorType: "pool_water",
    body: "pool",
    source: "easytouch.action2",
    service: "splash-api",
    originalValue: 82,
    originalUnit: "F",
    normalizedF: 82,
    normalizedC: 27.8,
    rawByte: 82,
    rawPayloadJson: "[1,2,3]",
    packetTimestamp: "2026-05-12T12:00:00.000Z",
    controllerTimestamp: "12:00"
  });

  assert.match(line, /^easy_touch_temperature,/u);
  assert.match(line, /sensor_type=pool_water/u);
  assert.match(line, /original_value=82/u);
  assert.match(line, /original_unit="F"/u);
  assert.match(line, /normalized_c=27.8/u);
  assert.match(line, /packet_timestamp="2026-05-12T12:00:00.000Z"/u);
});

test("queryInfluxRows uses raw Flux transport and parses CSV rows", async () => {
  const calls: Array<{
    url: string;
    init: RequestInit | undefined;
  }> = [];

  const rows = await queryInfluxRows({
    influx: {
      url: "http://10.0.40.52:8086",
      token: "secret",
      org: "splash",
      bucket: "system-telemetry"
    },
    fetchImpl: async (url, init) => {
      calls.push({
        url: String(url),
        init
      });
      return new Response(
        ",result,table,_time,sensor_type,controller_id,original_value,original_unit,normalized_f,normalized_c,raw_byte,controller_timestamp\n" +
          ",_result,0,2026-05-12T15:12:10.365Z,pool_water,default,77,F,77,25,77,11:11\n",
        {
          status: 200,
          headers: {
            "Content-Type": "application/csv"
          }
        }
      );
    },
    flux: 'from(bucket: "system-telemetry") |> range(start: -24h)'
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, "http://10.0.40.52:8086/api/v2/query?org=splash");
  assert.equal(calls[0]?.init?.method, "POST");
  assert.deepEqual(calls[0]?.init?.headers, {
    Authorization: "Token secret",
    "Content-Type": "application/vnd.flux",
    Accept: "application/csv"
  });
  assert.equal(calls[0]?.init?.body, 'from(bucket: "system-telemetry") |> range(start: -24h)');
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.sensor_type, "pool_water");
  assert.equal(rows[0]?.original_value, "77");
});

test("temperature telemetry service writes first sample immediately and deduplicates within the sample window", async () => {
  const repository = new FakeTelemetryRepository();
  const service = new TemperatureTelemetryService({
    repository,
    sampleIntervalMs: 10 * 60 * 1000
  });

  const baseEvent = {
    occurred_at: "2026-05-12T12:00:00.000Z",
    source: {
      service: "splash-protocol",
      label: "easytouch.action2"
    },
    controller: {
      controller_id: "default",
      controller_type: "easytouch",
      timestamp: {
        hour_24: 12,
        minute: 0
      }
    },
    temperatures: {
      air: {
        original_value: 78,
        original_unit: "F",
        normalized_f: 78,
        normalized_c: 25.6,
        raw_byte: 78
      },
      pool_water: {
        original_value: 82,
        original_unit: "F",
        normalized_f: 82,
        normalized_c: 27.8,
        raw_byte: 82
      }
    },
    raw_payload: [1, 2, 3]
  };

  await service.observe(baseEvent);
  await service.observe({
    ...baseEvent,
    occurred_at: "2026-05-12T12:09:59.000Z"
  });
  await service.observe({
    ...baseEvent,
    occurred_at: "2026-05-12T12:10:00.000Z"
  });

  assert.equal(repository.writes.length, 2);
  assert.equal(repository.writes[0]?.length, 2);
  assert.equal(repository.writes[1]?.length, 2);
  assert.equal(repository.writes[0]?.[0]?.sensorType, "air");
  assert.equal(repository.writes[0]?.[1]?.sensorType, "pool_water");
  assert.equal(repository.writes[1]?.[0]?.packetTimestamp, "2026-05-12T12:10:00.000Z");
});

test("temperature telemetry service degrades gracefully when telemetry persistence is unavailable", async () => {
  const repository = new FailingTelemetryRepository();
  const service = new TemperatureTelemetryService({
    repository,
    sampleIntervalMs: 10 * 60 * 1000
  });

  await service.observe({
    occurred_at: "2026-05-12T12:00:00.000Z",
    source: {
      service: "splash-protocol",
      label: "easytouch.action2"
    },
    controller: {
      controller_id: "default",
      controller_type: "easytouch",
      timestamp: {
        hour_24: 12,
        minute: 0
      }
    },
    temperatures: {
      air: {
        original_value: 78,
        original_unit: "F",
        normalized_f: 78,
        normalized_c: 25.6,
        raw_byte: 78
      }
    },
    raw_payload: [1, 2, 3]
  });

  await assert.doesNotReject(async () => service.getLatest());
  await assert.doesNotReject(async () =>
    service.getHistory({
      sensorType: "air",
      start: "2026-05-11T00:00:00.000Z",
      end: "2026-05-12T00:00:00.000Z",
      interval: "1h"
    })
  );

  const health = await service.checkHealth();
  assert.deepEqual(health, {
    status: "down",
    message: "connect ECONNREFUSED 127.0.0.1:8086"
  });

  const latest = await service.getLatest();
  assert.equal(latest.status, "empty");
  assert.equal(
    latest.message,
    "EasyTouch temperature history is temporarily unavailable: connect ECONNREFUSED 127.0.0.1:8086"
  );

  const history = await service.getHistory({
    sensorType: "air",
    start: "2026-05-11T00:00:00.000Z",
    end: "2026-05-12T00:00:00.000Z",
    interval: "1h"
  });
  assert.deepEqual(history.series, []);
});

test("app persists normalized EasyTouch telemetry events and exposes latest and history views", async () => {
  const repository = new FakeTelemetryRepository();
  repository.latest = {
    controller_id: "default",
    status: "available",
    message: "EasyTouch temperature history is available.",
    last_updated: "2026-05-12T12:00:00.000Z",
    readings: {
      air: {
        timestamp: "2026-05-12T12:00:00.000Z",
        original_value: 78,
        original_unit: "F",
        normalized_f: 78,
        normalized_c: 25.6,
        raw_byte: 78,
        controller_timestamp: "12:00"
      }
    }
  };
  repository.history = {
    controller_id: "default",
    range: {
      start: "2026-05-11T00:00:00.000Z",
      end: "2026-05-12T00:00:00.000Z"
    },
    interval: "1h",
    series: [
      {
        sensor_type: "air",
        unit: "F",
        points: [
          {
            timestamp: "2026-05-11T12:00:00.000Z",
            value: 77,
            normalizedF: 77,
            normalizedC: 25
          }
        ]
      }
    ]
  };
  const telemetry = new TemperatureTelemetryService({ repository });
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
    temperatureTelemetry: telemetry
  }) as unknown as {
    runNatsSession(session: MessagingSession, signal: AbortSignal): Promise<void>;
    getTemperatureTelemetryLatest(): Promise<Record<string, unknown>>;
    getTemperatureTelemetryHistory(input: {
      sensorType: string | null;
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

  await session.emit("telemetry.temperature.easytouch", {
    occurred_at: "2026-05-12T12:00:00.000Z",
    source: {
      service: "splash-protocol",
      label: "easytouch.action2"
    },
    controller: {
      controller_id: "default",
      controller_type: "easytouch",
      timestamp: {
        hour_24: 12,
        minute: 0
      }
    },
    temperatures: {
      air: {
        original_value: 78,
        original_unit: "F",
        normalized_f: 78,
        normalized_c: 25.6,
        raw_byte: 78
      }
    },
    raw_payload: [1, 2, 3]
  });

  const latest = await app.getTemperatureTelemetryLatest();
  const history = await app.getTemperatureTelemetryHistory({
    sensorType: "air",
    start: "2026-05-11T00:00:00.000Z",
    end: "2026-05-12T00:00:00.000Z",
    interval: "1h"
  });

  controller.abort();
  await running;

  assert.equal(repository.writes.length, 1);
  assert.equal(repository.writes[0]?.[0]?.sensorType, "air");
  assert.equal((latest.readings as Record<string, unknown>).air != null, true);
  assert.equal((history.series as Array<Record<string, unknown>>).length, 1);
});
