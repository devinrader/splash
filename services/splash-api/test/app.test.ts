import test from "node:test";
import assert from "node:assert/strict";
import { App } from "../src/app.js";
import type { MessagingSession } from "../src/messaging.js";
import { ProtocolAnnotationStore } from "../src/protocol-annotations.js";
import { ProtocolPromptStore } from "../src/protocol-prompts.js";
import { ProtocolFrameBundleStore } from "../src/protocol-bundles.js";

class FakeSession implements MessagingSession {
  readonly published: Array<{ subject: string; payload: Record<string, unknown> }> = [];

  async publish(subject: string, payload: Record<string, unknown>): Promise<void> {
    this.published.push({ subject, payload });
  }

  subscribe(): void {}
}

const noopLogger = {
  info() {},
  warn() {},
  error() {}
};

test("app publishes normalized pump speed command intent through the bridge target", async () => {
  const app = new App({
    config: {
      poolId: "pool-1",
      natsUrl: "nats://127.0.0.1:4222",
      httpBind: "127.0.0.1:8080",
      logLevel: "info",
      timezone: "UTC",
      natsMonitoringUrl: null
    },
    logger: noopLogger
  });
  const session = new FakeSession();

  const result = await app.publishPumpSpeedCommand({ equipmentId: "pump-main", rpm: 2800 }, session);

  assert.ok(result.commandId);
  assert.equal(session.published.length, 1);
  assert.equal(session.published[0].subject, "protocol.command.intent");
  const payload = session.published[0].payload as {
    target: { equipment_type: string; circuit_key: string };
    arguments: { rpm: number };
  };
  assert.equal(payload.target.equipment_type, "circuit");
  assert.equal(payload.target.circuit_key, "pool");
  assert.equal(payload.arguments.rpm, 2800);
});

test("app publishes a controller circuit state command intent", async () => {
  const app = new App({
    config: {
      poolId: "pool-1",
      natsUrl: "nats://127.0.0.1:4222",
      httpBind: "127.0.0.1:8080",
      logLevel: "info",
      timezone: "UTC",
      natsMonitoringUrl: null
    },
    logger: noopLogger
  });
  const session = new FakeSession();

  const result = await app.publishCircuitStateCommand(
    { equipmentId: "controller-main", circuitKey: "feature4", enabled: true },
    session
  );

  assert.ok(result.commandId);
  assert.equal(session.published.length, 1);
  assert.equal(session.published[0].payload.command_type, "set_circuit_state");
  assert.deepEqual(session.published[0].payload.target, {
    equipment_id: "controller-main",
    equipment_type: "circuit",
    circuit_key: "feature4"
  });
  assert.deepEqual(session.published[0].payload.arguments, {
    circuit_id: 14,
    enabled: true
  });
});

test("app publishes a manual Remote Layout request intent for Protocol Explorer", async () => {
  const app = new App({
    config: {
      poolId: "pool-1",
      natsUrl: "nats://127.0.0.1:4222",
      httpBind: "127.0.0.1:8080",
      logLevel: "info",
      timezone: "UTC",
      natsMonitoringUrl: null
    },
    logger: noopLogger
  });
  const session = new FakeSession();

  const result = await app.publishRemoteLayoutRequest({ pageIndex: 5 }, session);

  assert.ok(result.commandId);
  assert.equal(session.published.length, 1);
  assert.equal(session.published[0].subject, "protocol.command.intent");
  assert.equal(session.published[0].payload.command_type, "request_remote_layout_page");
  assert.equal((session.published[0].payload.arguments as { page_index: number }).page_index, 5);
});

test("app publishes a manual pump info request intent for Protocol Explorer", async () => {
  const app = new App({
    config: {
      poolId: "pool-1",
      natsUrl: "nats://127.0.0.1:4222",
      httpBind: "127.0.0.1:8080",
      logLevel: "info",
      timezone: "UTC",
      natsMonitoringUrl: null
    },
    logger: noopLogger
  });
  const session = new FakeSession();

  const result = await app.publishPumpInfoRequest({ pumpSlot: 2 }, session);

  assert.ok(result.commandId);
  assert.equal(session.published.length, 1);
  assert.equal(session.published[0].subject, "protocol.command.intent");
  assert.equal(session.published[0].payload.command_type, "request_pump_info");
  assert.equal((session.published[0].payload.arguments as { pump_slot: number }).pump_slot, 2);
});

test("app publishes a manual circuit config discovery intent for Protocol Explorer", async () => {
  const app = new App({
    config: {
      poolId: "pool-1",
      natsUrl: "nats://127.0.0.1:4222",
      httpBind: "127.0.0.1:8080",
      logLevel: "info",
      timezone: "UTC",
      natsMonitoringUrl: null
    },
    logger: noopLogger
  });
  const session = new FakeSession();

  const result = await app.publishCircuitConfigRequest({ startIndex: 1, endIndex: 20 }, session);

  assert.ok(result.commandId);
  assert.equal(session.published.length, 1);
  assert.equal(session.published[0].subject, "protocol.command.intent");
  assert.equal(session.published[0].payload.command_type, "request_circuit_config");
  assert.deepEqual(session.published[0].payload.arguments, {
    start_index: 1,
    end_index: 20
  });
});

test("app publishes a manual custom name request intent for Protocol Explorer", async () => {
  const app = new App({
    config: {
      poolId: "pool-1",
      natsUrl: "nats://127.0.0.1:4222",
      httpBind: "127.0.0.1:8080",
      logLevel: "info",
      timezone: "UTC",
      natsMonitoringUrl: null
    },
    logger: noopLogger
  });
  const session = new FakeSession();

  const result = await app.publishCustomNameRequest({ nameIndex: 2 }, session);

  assert.ok(result.commandId);
  assert.equal(session.published.length, 1);
  assert.equal(session.published[0].subject, "protocol.command.intent");
  assert.equal(session.published[0].payload.command_type, "request_custom_name");
  assert.deepEqual(session.published[0].payload.arguments, {
    name_index: 2
  });
});

test("app publishes a manual controller software version request intent for Protocol Explorer", async () => {
  const app = new App({
    config: {
      poolId: "pool-1",
      natsUrl: "nats://127.0.0.1:4222",
      httpBind: "127.0.0.1:8080",
      logLevel: "info",
      timezone: "UTC",
      natsMonitoringUrl: null
    },
    logger: noopLogger
  });
  const session = new FakeSession();

  const result = await app.publishControllerSoftwareVersionRequest(session);

  assert.ok(result.commandId);
  assert.equal(session.published.length, 1);
  assert.equal(session.published[0].subject, "protocol.command.intent");
  assert.equal(session.published[0].payload.command_type, "request_controller_software_version");
  assert.deepEqual(session.published[0].payload.arguments, {});
});

test("app publishes a controller datetime request intent", async () => {
  const app = new App({
    config: {
      poolId: "pool-1",
      natsUrl: "nats://127.0.0.1:4222",
      httpBind: "127.0.0.1:8080",
      logLevel: "info",
      timezone: "UTC",
      natsMonitoringUrl: null
    },
    logger: noopLogger
  });
  const session = new FakeSession();

  const result = await app.publishControllerDatetimeRequest(session);

  assert.ok(result.commandId);
  assert.equal(session.published[0].payload.command_type, "request_controller_datetime");
  assert.deepEqual(session.published[0].payload.arguments, {});
});

test("app publishes a controller datetime sync intent", async () => {
  const RealDate = Date;
  class MockDate extends Date {
    constructor(...args: any[]) {
      if (args.length === 0) {
        super("2026-04-23T14:37:00");
        return;
      }
      super(args[0]);
    }
    static override now(): number {
      return new RealDate("2026-04-23T14:37:00").getTime();
    }
  }
  globalThis.Date = MockDate as DateConstructor;

  try {
    const app = new App({
      config: {
        poolId: "pool-1",
        natsUrl: "nats://127.0.0.1:4222",
        httpBind: "127.0.0.1:8080",
        logLevel: "info",
        timezone: "UTC",
        natsMonitoringUrl: null
      },
      logger: noopLogger
    });
    const session = new FakeSession();

    const result = await app.publishControllerDatetimeSync(session);

    assert.ok(result.commandId);
    assert.equal(session.published[0].payload.command_type, "sync_controller_datetime");
    assert.deepEqual(session.published[0].payload.arguments, {
      month: 4,
      day: 23,
      year: 26,
      day_of_week: 4,
      hour_24: 14,
      minute: 37
    });
  } finally {
    globalThis.Date = RealDate;
  }
});

test("app exposes controller schedules as unavailable by default", () => {
  const app = new App({
    config: {
      poolId: "pool-1",
      natsUrl: "nats://127.0.0.1:4222",
      httpBind: "127.0.0.1:8080",
      logLevel: "info",
      timezone: "UTC",
      natsMonitoringUrl: null
    },
    logger: noopLogger
  });

  assert.deepEqual(app.getControllerSchedules(), {
    source: "controller_native",
    controller_type: "easytouch",
    status: "unavailable",
    message: "EasyTouch schedule payload is not yet fully decoded.",
    last_checked: null,
    schedules: [],
    observed_payloads: []
  });
});

test("app publishes a manual pump config write intent for Protocol Explorer", async () => {
  const app = new App({
    config: {
      poolId: "pool-1",
      natsUrl: "nats://127.0.0.1:4222",
      httpBind: "127.0.0.1:8080",
      logLevel: "info",
      timezone: "UTC",
      natsMonitoringUrl: null
    },
    logger: noopLogger
  });
  const session = new FakeSession();

  const result = await app.publishPumpConfigWrite(
    {
      pumpId: 1,
      pumpType: 128,
      primingTime: 0,
      unknown3: 2,
      unknown4: 0,
      slots: [
        { circuit_assignment: 6, rpm: 900 },
        { circuit_assignment: 11, rpm: 1250 },
        { circuit_assignment: 12, rpm: 3450 },
        { circuit_assignment: 13, rpm: 2340 },
        { circuit_assignment: 128, rpm: 1900 },
        { circuit_assignment: 0, rpm: 0 },
        { circuit_assignment: 0, rpm: 0 },
        { circuit_assignment: 0, rpm: 0 }
      ],
      primingSpeed: 1000,
      trailingBytes: new Array(15).fill(0)
    },
    session
  );

  assert.ok(result.commandId);
  assert.equal(session.published.length, 1);
  assert.equal(session.published[0].subject, "protocol.command.intent");
  assert.equal(session.published[0].payload.command_type, "write_pump_config");
  const args = session.published[0].payload.arguments as {
    pump_id: number;
    slots: Array<{ circuit_assignment: number; rpm: number }>;
    trailing_bytes: number[];
  };
  assert.equal(args.pump_id, 1);
  assert.equal(args.slots[1]?.rpm, 1250);
  assert.equal(args.trailing_bytes.length, 15);
});

test("app publishes a manual raw frame request intent for Protocol Explorer", async () => {
  const app = new App({
    config: {
      poolId: "pool-1",
      natsUrl: "nats://127.0.0.1:4222",
      httpBind: "127.0.0.1:8080",
      logLevel: "info",
      timezone: "UTC",
      natsMonitoringUrl: null
    },
    logger: noopLogger
  });
  const session = new FakeSession();

  const result = await app.publishRawFrameCommand(
    { protocolName: "pentair_easytouch", bytesHex: "ff00ffa5011022e1010001ba" },
    session
  );

  assert.ok(result.commandId);
  assert.equal(session.published.length, 1);
  assert.equal(session.published[0].subject, "protocol.command.intent");
  assert.equal(session.published[0].payload.command_type, "send_raw_frame");
  assert.equal(
    (session.published[0].payload.arguments as { bytes_hex: string }).bytes_hex,
    "ff00ffa5011022e1010001ba"
  );
});

test("app republishes protocol frame events to the Protocol Explorer broker", async () => {
  const app = new App({
    config: {
      poolId: "pool-1",
      natsUrl: "nats://127.0.0.1:4222",
      httpBind: "127.0.0.1:8080",
      logLevel: "info",
      timezone: "UTC",
      natsMonitoringUrl: null
    },
    logger: noopLogger
  }) as unknown as {
    protocolFrames: {
      addClient(client: { send(event: string, payload: Record<string, unknown>): void }): () => void;
    };
    runNatsSession(session: MessagingSession, signal: AbortSignal): Promise<void>;
  };

  const observed: Array<{ event: string; payload: Record<string, unknown> }> = [];
  const unsubscribe = app.protocolFrames.addClient({
    send(event, payload) {
      observed.push({ event, payload });
    }
  });

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

  await session.emit("protocol.frame.raw", { frame_id: "frame-1", bytes_hex: "ff00ffa5" });
  await session.emit("protocol.frame.buffered", { chunk_id: "chunk-buf", bytes_hex: "ff00ff", reason: "partial_delimiter" });
  await session.emit("protocol.frame.unidentified", { chunk_id: "chunk-1", bytes_hex: "ffff", reason: "delimiter_noise" });
  await session.emit("protocol.frame.decoded", { frame_id: "frame-1", action_code: "0x02" });
  await session.emit("protocol.command.encoded", { command_id: "command-1", bytes_hex: "ff00ffa5011021e1010001b9" });
  await session.emit("serial.rx.raw", { stream_id: "stream-1", bytes_hex: "ff00ffa5340f1002" });
  await session.emit("serial.tx.raw", { command_id: "command-1", write_result: "ok", bytes_hex: "ff00ffa5011021e1010001b9" });

  controller.abort();
  await running;
  unsubscribe();

  assert.deepEqual(observed, [
    { event: "protocol.frame.raw", payload: { frame_id: "frame-1", bytes_hex: "ff00ffa5" } },
    {
      event: "protocol.frame.buffered",
      payload: { chunk_id: "chunk-buf", bytes_hex: "ff00ff", reason: "partial_delimiter" }
    },
    {
      event: "protocol.frame.unidentified",
      payload: { chunk_id: "chunk-1", bytes_hex: "ffff", reason: "delimiter_noise" }
    },
    { event: "protocol.frame.decoded", payload: { frame_id: "frame-1", action_code: "0x02" } },
    {
      event: "protocol.command.encoded",
      payload: { command_id: "command-1", bytes_hex: "ff00ffa5011021e1010001b9" }
    },
    {
      event: "serial.rx.raw",
      payload: { stream_id: "stream-1", bytes_hex: "ff00ffa5340f1002" }
    },
    {
      event: "serial.tx.raw",
      payload: { command_id: "command-1", write_result: "ok", bytes_hex: "ff00ffa5011021e1010001b9" }
    }
  ]);
});

test("app platform status exposes live RS485 rates", async () => {
  const app = new App({
    config: {
      poolId: "pool-1",
      natsUrl: "nats://127.0.0.1:4222",
      natsMonitoringUrl: null,
      httpBind: "127.0.0.1:8080",
      logLevel: "info",
      timezone: "UTC"
    },
    logger: noopLogger
  }) as unknown as {
    getHealth(): Record<string, unknown>;
    getPlatformStatus(): Promise<Record<string, unknown>>;
    runNatsSession(session: MessagingSession, signal: AbortSignal): Promise<void>;
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

  await session.emit("serial.rx.raw", { bytes_hex: "ff00" });
  await session.emit("serial.tx.raw", { bytes_hex: "ff00" });

  const health = await app.getPlatformStatus() as {
    overall: string;
    connectivity: {
      rs485: {
        rx_messages_per_second: number;
        tx_messages_per_second: number;
      };
      nats_broker: {
        status: string;
      };
    };
    services: Array<{
      name: string;
      status: string;
    }>;
  };
  const localHealth = app.getHealth() as {
    status: string;
    checks: {
      nats: {
        status: string;
      };
    };
  };

  controller.abort();
  await running;

  assert.equal(health.overall, "unhealthy");
  assert.equal(health.connectivity.rs485.rx_messages_per_second, 0.1);
  assert.equal(health.connectivity.rs485.tx_messages_per_second, 0.1);
  assert.equal(health.connectivity.nats_broker.status, "unknown");
  assert.equal(health.services.find((service) => service.name === "splash-api")?.status, "unhealthy");
  assert.equal(health.services.find((service) => service.name === "nats")?.status, "down");
  assert.equal(health.services.find((service) => service.name === "prometheus")?.status, "unknown");
  assert.equal(health.services.find((service) => service.name === "grafana")?.status, "unknown");
  assert.equal(localHealth.status, "unhealthy");
  assert.equal(localHealth.checks.nats.status, "unhealthy");
});

test("app metrics expose platform health gauges and connectivity rates", async () => {
  const app = new App({
    config: {
      poolId: "pool-1",
      natsUrl: "nats://127.0.0.1:4222",
      natsMonitoringUrl: null,
      httpBind: "127.0.0.1:8080",
      logLevel: "info",
      timezone: "UTC"
    },
    logger: noopLogger
  }) as unknown as {
    getMetrics(): string;
    getPlatformStatus(): Promise<Record<string, unknown>>;
    runNatsSession(session: MessagingSession, signal: AbortSignal): Promise<void>;
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

  await session.emit("serial.rx.raw", { bytes_hex: "ff00" });
  await session.emit("serial.tx.raw", { bytes_hex: "ff00", write_result: "ok" });
  await app.getPlatformStatus();

  const metrics = app.getMetrics();

  controller.abort();
  await running;

  assert.match(metrics, /splash_api_service_status\{status="unhealthy"\} 1/);
  assert.match(metrics, /splash_api_rs485_status\{status="unknown"\} 1/);
  assert.match(metrics, /splash_api_platform_service_status\{service="nats",status="down"\} 1/);
  assert.match(metrics, /splash_platform_service_health\{service="splash-api",status="unhealthy"\} 1/);
  assert.match(metrics, /splash_platform_service_health\{service="prometheus",status="unknown"\} 1/);
  assert.match(metrics, /splash_platform_service_health\{service="grafana",status="unknown"\} 1/);
  assert.match(metrics, /splash_api_rs485_rx_messages_per_second 0\.100000/);
  assert.match(metrics, /splash_api_rs485_tx_messages_per_second 0\.100000/);
  assert.match(metrics, /splash_api_nats_dependency_up 0/);
  assert.match(metrics, /splash_platform_service_check_failures_total\{service="nats"\} 1/);
});

test("app projects circuit configuration decoded frames into dashboard equipment state", async () => {
  const app = new App({
    config: {
      poolId: "pool-1",
      natsUrl: "nats://127.0.0.1:4222",
      httpBind: "127.0.0.1:8080",
      logLevel: "info",
      timezone: "UTC",
      natsMonitoringUrl: null
    },
    logger: noopLogger
  }) as unknown as {
    events: {
      addClient(client: { send(event: string, payload: Record<string, unknown>): void }): () => void;
    };
    runNatsSession(session: MessagingSession, signal: AbortSignal): Promise<void>;
  };

  const observed: Array<{ event: string; payload: Record<string, unknown> }> = [];
  const unsubscribe = app.events.addClient({
    send(event, payload) {
      observed.push({ event, payload });
    }
  });

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

  await session.emit("protocol.frame.decoded", {
    frame_id: "frame-circuit-2",
    decoded_at: "2026-03-30T00:00:00Z",
    message_type: "circuit_configuration",
    action_code: "0x0b",
    fields: {
      circuit_id: 2,
      function_id: 2,
      base_function_label: "Pool",
      name_id: 17,
      name_label: "FEATURE 6",
      freeze_flag: false,
      high_flag: false
    }
  });

  controller.abort();
  await running;
  unsubscribe();

  assert.equal(observed.length, 1);
  assert.equal(observed[0].event, "equipment.state");
  assert.deepEqual((observed[0].payload.circuit_configurations as Record<string, unknown>)["2"], {
    circuit_id: 2,
    function_value: 2,
    function_label: "Pool",
    name_value: 17,
    name_label: "FEATURE 6",
    freeze_flag: false,
    high_flag: false,
    updated_at: "2026-03-30T00:00:00Z"
  });
});

test("app projects controller datetime decoded frames into dashboard equipment state", async () => {
  const app = new App({
    config: {
      poolId: "pool-1",
      natsUrl: "nats://127.0.0.1:4222",
      httpBind: "127.0.0.1:8080",
      logLevel: "info",
      timezone: "UTC",
      natsMonitoringUrl: null
    },
    logger: noopLogger
  }) as unknown as {
    events: {
      addClient(client: { send(event: string, payload: Record<string, unknown>): void }): () => void;
    };
    runNatsSession(session: MessagingSession, signal: AbortSignal): Promise<void>;
  };

  const observed: Array<{ event: string; payload: Record<string, unknown> }> = [];
  const unsubscribe = app.events.addClient({
    send(event, payload) {
      observed.push({ event, payload });
    }
  });

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

  await session.emit("protocol.frame.decoded", {
    frame_id: "frame-datetime-1",
    decoded_at: "2026-03-30T00:00:00Z",
    message_type: "controller_datetime",
    action_code: "0x05",
    fields: {
      month: 4,
      day: 23,
      year: 26,
      day_of_week: 16,
      hour_24: 18,
      minute: 52,
      daylight_savings_auto: false
    }
  });

  controller.abort();
  await running;
  unsubscribe();

  assert.equal(observed.length, 1);
  assert.equal(observed[0].event, "equipment.state");
  assert.deepEqual(observed[0].payload.controller_datetime_reply, {
    month: 4,
    day: 23,
    year: 26,
    day_of_week: 16,
    hour_24: 18,
    minute: 52,
    daylight_savings_auto: false,
    updated_at: "2026-03-30T00:00:00Z"
  });
});

test("app projects controller software version decoded frames into dashboard equipment state", async () => {
  const app = new App({
    config: {
      poolId: "pool-1",
      natsUrl: "nats://127.0.0.1:4222",
      httpBind: "127.0.0.1:8080",
      logLevel: "info",
      timezone: "UTC",
      natsMonitoringUrl: null
    },
    logger: noopLogger
  }) as unknown as {
    events: {
      addClient(client: { send(event: string, payload: Record<string, unknown>): void }): () => void;
    };
    runNatsSession(session: MessagingSession, signal: AbortSignal): Promise<void>;
  };

  const observed: Array<{ event: string; payload: Record<string, unknown> }> = [];
  const unsubscribe = app.events.addClient({
    send(event, payload) {
      observed.push({ event, payload });
    }
  });

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

  await session.emit("protocol.frame.decoded", {
    frame_id: "frame-software-version-1",
    decoded_at: "2026-03-30T00:00:00Z",
    message_type: "controller_software_version",
    action_code: "0xfc",
    fields: {
      controller_firmware_major: 1,
      controller_firmware_minor: 34,
      bootloader_major: 3,
      bootloader_minor: 21
    }
  });

  controller.abort();
  await running;
  unsubscribe();

  assert.equal(observed.length, 1);
  assert.equal(observed[0].event, "equipment.state");
  assert.deepEqual(observed[0].payload.controller_software_version_reply, {
    controller_firmware_major: 1,
    controller_firmware_minor: 34,
    bootloader_major: 3,
    bootloader_minor: 21,
    updated_at: "2026-03-30T00:00:00Z"
  });
});

test("app records observed controller schedule payloads without inventing fields", async () => {
  const app = new App({
    config: {
      poolId: "pool-1",
      natsUrl: "nats://127.0.0.1:4222",
      httpBind: "127.0.0.1:8080",
      logLevel: "info",
      timezone: "UTC",
      natsMonitoringUrl: null
    },
    logger: noopLogger
  }) as unknown as {
    getControllerSchedules(): Record<string, unknown>;
    runNatsSession(session: MessagingSession, signal: AbortSignal): Promise<void>;
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

  await session.emit("protocol.frame.decoded", {
    frame_id: "frame-schedule-1",
    decoded_at: "2026-05-12T01:52:00Z",
    message_type: "controller_schedule",
    action_code: "0x11",
    fields: {
      payload_hex: "019b0000000000",
      payload_length: 7
    }
  });

  controller.abort();
  await running;

  assert.deepEqual(app.getControllerSchedules(), {
    source: "controller_native",
    controller_type: "easytouch",
    status: "unavailable",
    message: "Observed EasyTouch schedule payloads, but field mapping is not yet validated.",
    last_checked: "2026-05-12T01:52:00Z",
    schedules: [],
    observed_payloads: [
      {
        payload_hex: "019b0000000000",
        payload_length: 7,
        updated_at: "2026-05-12T01:52:00Z"
      }
    ]
  });
});

test("app projects custom name decoded frames into dashboard equipment state", async () => {
  const app = new App({
    config: {
      poolId: "pool-1",
      natsUrl: "nats://127.0.0.1:4222",
      httpBind: "127.0.0.1:8080",
      logLevel: "info",
      timezone: "UTC",
      natsMonitoringUrl: null
    },
    logger: noopLogger
  }) as unknown as {
    events: {
      addClient(client: { send(event: string, payload: Record<string, unknown>): void }): () => void;
    };
    runNatsSession(session: MessagingSession, signal: AbortSignal): Promise<void>;
  };

  const observed: Array<{ event: string; payload: Record<string, unknown> }> = [];
  const unsubscribe = app.events.addClient({
    send(event, payload) {
      observed.push({ event, payload });
    }
  });

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

  await session.emit("protocol.frame.decoded", {
    frame_id: "frame-custom-2",
    decoded_at: "2026-03-30T00:00:00Z",
    message_type: "custom_name",
    action_code: "0x0a",
    fields: {
      name_index: 2,
      custom_name_bytes: [83, 80, 65, 32, 77, 79, 68, 69, 32],
      custom_name_text: "SPA MODE"
    }
  });

  controller.abort();
  await running;
  unsubscribe();

  assert.equal(observed.length, 1);
  assert.equal(observed[0].event, "equipment.state");
  assert.deepEqual((observed[0].payload.custom_name_bank as Record<string, unknown>)["2"], {
    name_index: 2,
    custom_name_bytes: [83, 80, 65, 32, 77, 79, 68, 69, 32],
    custom_name_text: "SPA MODE",
    updated_at: "2026-03-30T00:00:00Z"
  });
});

test("app retains controller model identity fields in latest equipment state", async () => {
  const app = new App({
    config: {
      poolId: "pool-1",
      natsUrl: "nats://127.0.0.1:4222",
      httpBind: "127.0.0.1:8080",
      logLevel: "info",
      timezone: "UTC",
      natsMonitoringUrl: null
    },
    logger: noopLogger
  });

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
  const running = (app as unknown as { runNatsSession(session: MessagingSession, signal: AbortSignal): Promise<void> }).runNatsSession(
    session,
    controller.signal
  );

  await session.emit("equipment.state.controller", {
    controller_hour_24: 14,
    controller_minute: 5,
    controller_sub_model_byte: 23,
    controller_model_byte: 3,
    controller_model_family: "intellicenter",
    controller_model_label: "IntelliCenter",
    occurred_at: "2026-03-30T00:00:00Z"
  });

  controller.abort();
  await running;

  const controllerView = app.getEquipment().find((entry) => entry.equipment_type === "controller");
  assert.ok(controllerView);
  assert.deepEqual((controllerView.latest_state as Record<string, unknown>).controller_sub_model_byte, 23);
  assert.deepEqual((controllerView.latest_state as Record<string, unknown>).controller_model_byte, 3);
  assert.deepEqual((controllerView.latest_state as Record<string, unknown>).controller_model_family, "intellicenter");
  assert.deepEqual((controllerView.latest_state as Record<string, unknown>).controller_model_label, "IntelliCenter");
});

test("app auto-requests custom name bank indexes once when controller state first appears and cache is empty", async () => {
  const app = new App({
    config: {
      poolId: "pool-1",
      natsUrl: "nats://127.0.0.1:4222",
      httpBind: "127.0.0.1:8080",
      logLevel: "info",
      timezone: "UTC",
      natsMonitoringUrl: null
    },
    logger: noopLogger
  }) as unknown as {
    runNatsSession(session: MessagingSession, signal: AbortSignal): Promise<void>;
  };

  const published: Array<{ subject: string; payload: Record<string, unknown> }> = [];
  const handlers = new Map<string, Array<(payload: Record<string, unknown>) => Promise<void> | void>>();
  const session: MessagingSession & {
    emit(subject: string, payload: Record<string, unknown>): Promise<void>;
  } = {
    async publish(subject, payload) {
      published.push({ subject, payload });
    },
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

  await session.emit("equipment.state.controller", {
    controller_hour_24: 14,
    controller_minute: 5,
    occurred_at: "2026-03-30T00:00:00Z"
  });

  await session.emit("equipment.state.controller", {
    controller_hour_24: 14,
    controller_minute: 6,
    occurred_at: "2026-03-30T00:00:05Z"
  });

  controller.abort();
  await running;

  const customNameRequests = published.filter((entry) => entry.subject === "protocol.command.intent" && entry.payload.command_type === "request_custom_name");
  assert.equal(customNameRequests.length, 10);
  assert.deepEqual(
    customNameRequests.map((entry) => (entry.payload.arguments as { name_index: number }).name_index),
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
  );
});

test("app saves protocol frame bundles from recent observed frame traffic", async () => {
  const app = new App({
    config: {
      poolId: "pool-1",
      natsUrl: "nats://127.0.0.1:4222",
      httpBind: "127.0.0.1:8080",
      logLevel: "info",
      timezone: "UTC",
      natsMonitoringUrl: null
    },
    logger: noopLogger
  }) as unknown as {
    createProtocolFrameBundle(input: { label: string | null }): {
      id: string;
      label: string | null;
      frame_count: number;
      created_at: string;
    };
    getProtocolFrameBundle(id: string): {
      id: string;
      label: string | null;
      frame_count: number;
      frames: Array<{ event: string; payload: Record<string, unknown> }>;
    } | null;
    runNatsSession(session: MessagingSession, signal: AbortSignal): Promise<void>;
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

  await session.emit("protocol.frame.raw", { frame_id: "frame-1", bytes_hex: "ff00ffa5" });
  await session.emit("protocol.frame.decoded", { frame_id: "frame-1", action_code: "0x02" });
  await session.emit("protocol.command.encoded", { command_id: "command-1", bytes_hex: "ff00ffa5011021e1010001b9" });

  const summary = app.createProtocolFrameBundle({ label: "baseline" });
  const bundle = app.getProtocolFrameBundle(summary.id);

  controller.abort();
  await running;

  assert.equal(summary.label, "baseline");
  assert.equal(summary.frame_count, 3);
  assert.ok(bundle);
  assert.equal(bundle?.frames.length, 3);
  assert.deepEqual(bundle?.frames.map((frame) => frame.event), [
    "protocol.frame.raw",
    "protocol.frame.decoded",
    "protocol.command.encoded"
  ]);
});

test("watch sessions capture live explorer frames after explicit start", async () => {
  const app = new App({
    config: {
      poolId: "pool-1",
      natsUrl: "nats://127.0.0.1:4222",
      httpBind: "127.0.0.1:8080",
      logLevel: "info",
      timezone: "UTC",
      natsMonitoringUrl: null
    },
    logger: noopLogger
  }) as unknown as {
    startProtocolWatchSession(input: { label: string | null; events: string[] | null }): {
      id: string;
      status: "active" | "stopped";
      events: string[] | null;
      frame_count: number;
    };
    getProtocolWatchSession(id: string): {
      id: string;
      status: "active" | "stopped";
      events: string[] | null;
      frame_count: number;
      frames: Array<{ event: string; payload: Record<string, unknown> }>;
    } | null;
    stopProtocolWatchSession(id: string): {
      id: string;
      status: "active" | "stopped";
      frame_count: number;
      stopped_at: string | null;
    } | null;
    runNatsSession(session: MessagingSession, signal: AbortSignal): Promise<void>;
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

  await session.emit("protocol.frame.raw", { frame_id: "before", bytes_hex: "ff00ffa5" });
  const watch = app.startProtocolWatchSession({
    label: "watch test",
    events: ["serial.rx.raw", "serial.tx.raw", "protocol.frame.buffered", "protocol.frame.unidentified"]
  });
  await session.emit("protocol.frame.decoded", { frame_id: "after-1", action_code: "0x02" });
  await session.emit("protocol.frame.buffered", { chunk_id: "chunk-buf", bytes_hex: "ff00ff", reason: "partial_delimiter" });
  await session.emit("protocol.frame.unidentified", { chunk_id: "chunk-x", bytes_hex: "ffff", reason: "delimiter_noise" });
  await session.emit("serial.rx.raw", { stream_id: "stream-1", bytes_hex: "ff00ffa5340f1002" });
  await session.emit("serial.tx.raw", { command_id: "after-2", write_result: "ok", bytes_hex: "ff00ffa5" });

  const active = app.getProtocolWatchSession(watch.id);
  const stopped = app.stopProtocolWatchSession(watch.id);

  controller.abort();
  await running;

  assert.ok(active);
  assert.equal(active?.status, "active");
  assert.deepEqual(active?.events, ["serial.rx.raw", "serial.tx.raw", "protocol.frame.buffered", "protocol.frame.unidentified"]);
  assert.equal(active?.frame_count, 4);
  assert.deepEqual(
    active?.frames.map((frame) => frame.event),
    ["protocol.frame.buffered", "protocol.frame.unidentified", "serial.rx.raw", "serial.tx.raw"]
  );
  assert.ok(stopped);
  assert.equal(stopped?.status, "stopped");
  assert.equal(stopped?.frame_count, 4);
  assert.ok(stopped?.stopped_at);
});

test("bundle store compares saved bundles with byte-level hex diffs", () => {
  const baselineStore = new ProtocolFrameBundleStore();
  baselineStore.recordFrame("protocol.frame.raw", { frame_id: "frame-1", bytes_hex: "ff00ffa50010" });
  const baseline = baselineStore.createBundle("baseline");

  const comparisonStore = new ProtocolFrameBundleStore();
  comparisonStore.recordFrame("protocol.frame.raw", { frame_id: "frame-1", bytes_hex: "ff00ffa50020" });
  const comparison = comparisonStore.createBundle("comparison");

  const aggregateStore = new ProtocolFrameBundleStore();
  (aggregateStore as unknown as { bundles: unknown[] }).bundles = [
    baselineStore.getBundle(baseline.id),
    comparisonStore.getBundle(comparison.id)
  ].filter(Boolean);

  const diff = aggregateStore.compareBundles(baseline.id, comparison.id);

  assert.ok(diff);
  assert.equal(diff?.frame_pairs.length, 1);
  assert.deepEqual(diff?.frame_pairs[0].changed_fields, [
    {
      field: "bytes_hex",
      byte_changes: [{ byte_index: 5, baseline: "10", comparison: "20" }]
    }
  ]);
});

test("annotation store saves confidence-aware protocol annotations", () => {
  const store = new ProtocolAnnotationStore();
  const created = store.create({
    bundle_id: "bundle-1",
    frame_index: 0,
    field_name: "payload_hex",
    byte_start: 2,
    byte_end: 3,
    confidence: "inferred",
    label: "likely circuit id",
    notes: "Changes when Pool High is edited."
  });

  assert.ok(created.id);
  assert.equal(created.confidence, "inferred");
  assert.equal(store.list("bundle-1").length, 1);
  assert.equal(store.list("bundle-1")[0]?.field_name, "payload_hex");
});

test("prompt store saves operator-needed protocol prompts", () => {
  const store = new ProtocolPromptStore();
  const created = store.create({
    bundle_id: "bundle-1",
    frame_index: 0,
    field_name: "payload_hex",
    prompt: "What circuit was active when this frame was captured?",
    why: "This byte range changes with pump-circuit edits.",
    input_type: "controller_menu_state",
    operator_response: null
  });

  assert.ok(created.id);
  assert.equal(created.status, "open");
  assert.equal(store.list("bundle-1").length, 1);
  assert.equal(store.list("bundle-1")[0]?.input_type, "controller_menu_state");
});
