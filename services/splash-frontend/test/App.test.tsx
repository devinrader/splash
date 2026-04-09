import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, test, vi, assert } from "vitest";
import App from "../src/App";
import { useFrontendStore } from "../src/store";

class FakeEventSource {
  static instances: FakeEventSource[] = [];

  onerror: (() => void) | null = null;
  private readonly listeners = new Map<string, Array<(event: MessageEvent<string>) => void>>();

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, handler: (event: MessageEvent<string>) => void): void {
    const handlers = this.listeners.get(type) ?? [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }

  emit(type: string, payload: Record<string, unknown>): void {
    const event = { data: JSON.stringify(payload) } as MessageEvent<string>;
    for (const handler of this.listeners.get(type) ?? []) {
      handler(event);
    }
  }

  close(): void {}
}

beforeEach(() => {
  useFrontendStore.setState({
    equipment: {},
    healthStatus: "unknown",
    sseStatus: "connecting",
    errorMessage: null,
    command: {
      commandId: null,
      requestedRpm: null,
      status: null,
      detail: null,
      errorCode: null
    }
  });

  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
});

test("renders milestone equipment values from the API snapshot", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      if (input.endsWith("/protocol/bundles")) {
        return response({
          data: [],
          error: null
        });
      }

      if (input.endsWith("/equipment")) {
        return response({
          data: [
            {
              id: "controller-main",
              equipment_type: "controller",
              display_name: "Main Controller",
              protocol_name: "pentair_easytouch",
              latest_state: {
                air_temp_f: 71,
                water_temp_f: 79
              }
            },
            {
              id: "pump-main",
              equipment_type: "pump",
              display_name: "Main Pump",
              protocol_name: "pentair_easytouch",
              bus_address: "0x60",
              control_circuit_keys: ["pool", "pool_low", "pool_high", "cleaner"],
              default_control_circuit_key: "pool",
              latest_state: {
                rpm: 2750,
                running: true
              }
            },
            {
              id: "chlorinator-main",
              equipment_type: "chlorinator",
              display_name: "Main Chlorinator",
              protocol_name: "pentair_easytouch",
              latest_state: {
                salt_ppm: 3200
              }
            }
          ],
          error: null
        });
      }

      return response({
        status: "ok",
        data: {
          dependencies: {
            nats: "ok"
          }
        },
        error: null
      });
    })
  );

  render(<App />);

  await waitFor(() => {
    assert.ok(screen.getAllByText("71 °F").length > 0);
    assert.ok(screen.getAllByText("79 °F").length > 0);
    assert.ok(screen.getAllByText("3200 ppm").length > 0);
    assert.ok(screen.getAllByText("2750 RPM").length > 0);
  });
});

test("merges SSE updates into the equipment cards", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      if (input.endsWith("/protocol/bundles")) {
        return response({
          data: [],
          error: null
        });
      }

      if (input.endsWith("/equipment")) {
        return response({
          data: [
            {
              id: "controller-main",
              equipment_type: "controller",
              display_name: "Main Controller",
              protocol_name: "pentair_easytouch",
              latest_state: {
                air_temp_f: 70,
                water_temp_f: 78
              }
            },
            {
              id: "pump-main",
              equipment_type: "pump",
              display_name: "Main Pump",
              protocol_name: "pentair_easytouch",
              bus_address: "0x60",
              control_circuit_keys: ["pool", "pool_low", "pool_high", "cleaner"],
              default_control_circuit_key: "pool",
              latest_state: {
                rpm: 2600,
                running: true
              }
            },
            {
              id: "chlorinator-main",
              equipment_type: "chlorinator",
              display_name: "Main Chlorinator",
              protocol_name: "pentair_easytouch",
              latest_state: {
                salt_ppm: 3000
              }
            }
          ],
          error: null
        });
      }

      return response({
        status: "ok",
        error: null
      });
    })
  );

  render(<App />);
  await waitFor(() => assert.ok(FakeEventSource.instances.length === 2));

  const source = FakeEventSource.instances[0];
  source.emit("pump.state", {
    rpm: 2900,
    running: true
  });
  source.emit("equipment.state", {
    salt_ppm: 3450
  });

  await waitFor(() => {
    assert.ok(screen.getAllByText("2900 RPM").length > 0);
    assert.ok(screen.getAllByText("3450 ppm").length > 0);
  });
});

test("submits pump speed control and resolves the pending command from SSE", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      if (input.endsWith("/protocol/bundles")) {
        return response({
          data: [],
          error: null
        });
      }

      if (input.endsWith("/equipment") && (!init || !init.method)) {
        return response({
          data: [
            {
              id: "controller-main",
              equipment_type: "controller",
              display_name: "Main Controller",
              protocol_name: "pentair_easytouch",
              latest_state: {
                air_temp_f: 70,
                water_temp_f: 78
              }
            },
            {
              id: "pump-main",
              equipment_type: "pump",
              display_name: "Main Pump",
              protocol_name: "pentair_easytouch",
              bus_address: "0x60",
              control_circuit_keys: ["pool", "pool_low", "pool_high", "cleaner"],
              default_control_circuit_key: "pool",
              latest_state: {
                rpm: 2600,
                running: true
              }
            },
            {
              id: "chlorinator-main",
              equipment_type: "chlorinator",
              display_name: "Main Chlorinator",
              protocol_name: "pentair_easytouch",
              latest_state: {
                salt_ppm: 3000
              }
            }
          ],
          error: null
        });
      }

      if (input.endsWith("/health")) {
        return response({
          status: "ok",
          error: null
        });
      }

      if (input.includes("/equipment/pump-main/control")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          command_type?: string;
          circuit_key?: string | null;
          arguments?: { rpm?: number };
        };
        assert.equal(body.command_type, "set_speed");
        assert.equal(body.circuit_key, "pool");
        assert.equal(body.arguments?.rpm, 2800);
        return response({
          data: {
            command_id: "command-1",
            status: "accepted"
          },
          error: null
        });
      }

      throw new Error(`Unhandled fetch call for ${input}`);
    })
  );

  render(<App />);
  await waitFor(() => assert.ok(FakeEventSource.instances.length === 2));

  fireEvent.change(screen.getByLabelText("Requested RPM"), { target: { value: "2800" } });
  fireEvent.click(screen.getByRole("button", { name: "Set pump speed" }));

  await waitFor(() => {
    assert.ok(screen.getByRole("button", { name: "Waiting for command result..." }));
  });

  FakeEventSource.instances[0].emit("command.result", {
    command_id: "command-1",
    status: "completed",
    detail: "Observed pump state matched the requested RPM."
  });

  await waitFor(() => {
    assert.ok(screen.getByText("Command completed"));
    assert.ok(screen.getByText("Observed pump state matched the requested RPM."));
    assert.ok(screen.getByRole("button", { name: "Set pump speed" }));
  });
});

test("captures explorer bundles and creates annotation and prompt records", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      if (input.endsWith("/equipment") && (!init || !init.method)) {
        return response({
          data: [
            {
              id: "controller-main",
              equipment_type: "controller",
              display_name: "Main Controller",
              protocol_name: "pentair_easytouch",
              latest_state: {
                air_temp_f: 70,
                water_temp_f: 78
              }
            },
            {
              id: "pump-main",
              equipment_type: "pump",
              display_name: "Main Pump",
              protocol_name: "pentair_easytouch",
              bus_address: "0x60",
              control_circuit_keys: ["pool", "pool_low", "pool_high", "cleaner"],
              default_control_circuit_key: "pool",
              latest_state: {
                rpm: 2600,
                running: true
              }
            },
            {
              id: "chlorinator-main",
              equipment_type: "chlorinator",
              display_name: "Main Chlorinator",
              protocol_name: "pentair_easytouch",
              latest_state: {
                salt_ppm: 3000
              }
            }
          ],
          error: null
        });
      }

      if (input.endsWith("/health")) {
        return response({ status: "ok", error: null });
      }

      if (input.endsWith("/protocol/bundles") && (!init || !init.method)) {
        return response({
          data: [
            {
              id: "bundle-1",
              label: "baseline",
              frame_count: 4,
              created_at: "2026-03-30T20:30:00Z"
            },
            {
              id: "bundle-2",
              label: "comparison",
              frame_count: 5,
              created_at: "2026-03-30T20:31:00Z"
            }
          ],
          error: null
        });
      }

      if (input.includes("/protocol/annotations?bundle_id=bundle-1")) {
        return response({ data: [], error: null });
      }

      if (input.includes("/protocol/prompts?bundle_id=bundle-1")) {
        return response({ data: [], error: null });
      }

      if (input.endsWith("/protocol/bundles") && init?.method === "POST") {
        return response({
          data: {
            id: "bundle-3",
            label: "captured",
            frame_count: 6,
            created_at: "2026-03-30T20:32:00Z"
          },
          error: null
        });
      }

      if (input.endsWith("/protocol/bundles/compare") && init?.method === "POST") {
        return response({
          data: {
            baseline_bundle_id: "bundle-1",
            comparison_bundle_id: "bundle-2",
            frame_pairs: []
          },
          error: null
        });
      }

      if (input.endsWith("/protocol/annotations") && init?.method === "POST") {
        return response({
          data: {
            id: "annotation-1"
          },
          error: null
        });
      }

      if (input.endsWith("/protocol/prompts") && init?.method === "POST") {
        return response({
          data: {
            id: "prompt-1"
          },
          error: null
        });
      }

      throw new Error(`Unhandled fetch call for ${input}`);
    })
  );

  render(<App />);
  await waitFor(() => assert.ok(FakeEventSource.instances.length === 2));

  FakeEventSource.instances[1].emit("protocol.command.encoded", {
    command_id: "command-remote-layout",
    bytes_hex: "ff00ffa5011021e1010001b9"
  });
  FakeEventSource.instances[1].emit("serial.tx.raw", {
    command_id: "command-remote-layout",
    write_result: "ok",
    bytes_hex: "ff00ffa5011021e1010001b9"
  });

  await waitFor(() => {
    assert.ok(screen.getByText(/protocol.command.encoded/));
    assert.ok(screen.getByText(/serial.tx.raw/));
  });

  fireEvent.change(screen.getByLabelText("Bundle label"), { target: { value: "captured" } });
  fireEvent.click(screen.getByRole("button", { name: "Save frame bundle" }));

  await waitFor(() => {
    assert.ok(screen.getAllByText("baseline").length >= 1);
    assert.ok(screen.getAllByText("comparison").length >= 1);
  });

  fireEvent.click(screen.getByRole("button", { name: "Compare bundles" }));

  fireEvent.change(screen.getAllByLabelText("Label")[0], { target: { value: "likely circuit id" } });
  fireEvent.click(screen.getByRole("button", { name: "Save annotation" }));

  fireEvent.change(screen.getByLabelText("Prompt"), {
    target: { value: "What circuit was active when this frame was captured?" }
  });
  fireEvent.change(screen.getByLabelText("Why it matters"), {
    target: { value: "This byte range changes with pump-circuit edits." }
  });
  fireEvent.click(screen.getByRole("button", { name: "Save prompt" }));

  await waitFor(() => {
    const fetchMock = vi.mocked(globalThis.fetch);
    assert.ok(
      fetchMock.mock.calls.some((call) => {
        const [url, init] = call;
        return typeof url === "string" && url.endsWith("/protocol/annotations") && init?.method === "POST";
      })
    );
    assert.ok(
      fetchMock.mock.calls.some((call) => {
        const [url, init] = call;
        return typeof url === "string" && url.endsWith("/protocol/prompts") && init?.method === "POST";
      })
    );
  });
});

test("submits a manual raw frame send from Protocol Explorer", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      if (input.endsWith("/equipment") && (!init || !init.method)) {
        return response({
          data: [],
          error: null
        });
      }

      if (input.endsWith("/health")) {
        return response({ status: "ok", error: null });
      }

      if (input.endsWith("/protocol/bundles") && (!init || !init.method)) {
        return response({ data: [], error: null });
      }

      if (input.endsWith("/protocol/raw-frame/send") && init?.method === "POST") {
        return response({
          data: {
            command_id: "command-raw-1",
            status: "accepted"
          },
          error: null
        });
      }

      throw new Error(`Unhandled fetch call for ${input}`);
    })
  );

  render(<App />);
  await waitFor(() => assert.ok(FakeEventSource.instances.length === 2));

  fireEvent.change(screen.getByLabelText("Raw frame hex"), {
    target: { value: "ff00ffa5011022e1010001ba" }
  });
  fireEvent.click(screen.getByRole("button", { name: "Send raw frame" }));

  await waitFor(() => {
    const fetchMock = vi.mocked(globalThis.fetch);
    assert.ok(
      fetchMock.mock.calls.some((call) => {
        const [url, init] = call;
        return typeof url === "string" && url.endsWith("/protocol/raw-frame/send") && init?.method === "POST";
      })
    );
  });
});

function response(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => payload
  } as Response;
}
