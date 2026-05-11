import test from "node:test";
import assert from "node:assert/strict";
import { NatsVarzMonitor, PlatformServiceHealthMonitor, RollingMessageRate } from "../src/rates.js";

test("rolling message rate derives a 10-second average from recent events", () => {
  const rate = new RollingMessageRate();
  rate.record(1000);
  rate.record(1500);

  assert.equal(rate.getMessagesPerSecond(1500), 0.2);

  rate.record(10_500);
  assert.equal(rate.getMessagesPerSecond(10_500), 0.3);
  assert.equal(rate.getMessagesPerSecond(11_001), 0.2);
  assert.equal(rate.getMessagesPerSecond(20_501), 0);
});

test("NATS varz monitor derives broker message rates from sampled counters", async () => {
  let calls = 0;
  const monitor = new NatsVarzMonitor({
    monitoringUrl: "http://127.0.0.1:8222",
    pollIntervalMs: 5,
    fetchImpl: async () => {
      calls += 1;
      return {
        ok: true,
        json: async () => calls === 1
          ? { in_msgs: 100, out_msgs: 150, subscriptions: 8 }
          : { in_msgs: 112, out_msgs: 168, subscriptions: 11 }
      } as Response;
    }
  });

  const controller = new AbortController();
  const running = monitor.start(controller.signal);
  await new Promise((resolve) => setTimeout(resolve, 15));
  controller.abort();
  await running;

  const snapshot = monitor.getSnapshot();
  assert.equal(snapshot.status, "ok");
  assert.equal(snapshot.subscriptions, 11);
  assert.equal(typeof snapshot.inMessagesPerSecond, "number");
  assert.equal(typeof snapshot.outMessagesPerSecond, "number");
  assert.ok((snapshot.inMessagesPerSecond ?? 0) >= 0);
  assert.ok((snapshot.outMessagesPerSecond ?? 0) >= 0);
});

test("platform service health monitor polls and normalizes upstream health", async () => {
  const monitor = new PlatformServiceHealthMonitor({
    healthUrl: "http://127.0.0.1:9108/healthz",
    pollIntervalMs: 5,
    fetchImpl: async () =>
      ({
        ok: true,
        json: async () => ({
          status: "degraded",
          connection_state: "connected",
          serial_device: "/dev/ttyUSB0",
          stream_id: "stream-1",
          nats: "error"
        })
      }) as Response,
    parser: (payload) => ({
      status: payload.status === "degraded" ? "degraded" : "unavailable",
      summary: `${payload.connection_state as string} · ${(payload.nats as string) === "ok" ? "NATS connected" : "NATS degraded"}`,
      detail: `Device ${payload.serial_device as string} · stream ${payload.stream_id as string}`
    })
  });

  const controller = new AbortController();
  const running = monitor.start(controller.signal);
  await new Promise((resolve) => setTimeout(resolve, 10));
  controller.abort();
  await running;

  const snapshot = monitor.getSnapshot();
  assert.equal(snapshot.status, "degraded");
  assert.equal(snapshot.summary, "connected · NATS degraded");
  assert.equal(snapshot.detail, "Device /dev/ttyUSB0 · stream stream-1");
  assert.equal(typeof snapshot.updatedAt, "string");
});
