import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
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
    healthData: null,
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

async function openDiagnostics(): Promise<void> {
  fireEvent.click(screen.getByRole("link", { name: /Diagnostics/ }));
  await waitFor(() => assert.ok(screen.getByRole("tab", { name: "Protocol Explorer" })));
}

async function openSystemTab(name: "Overview" | "Hardware" | "Sensors" | "Control" | "Connectivity" | "Platform"): Promise<void> {
  fireEvent.click(screen.getByRole("tab", { name }));
  await waitFor(() => assert.ok(screen.getByRole("tab", { name, selected: true })));
}

function renderApp(initialEntries: string[] = ["/system/overview"]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <App />
    </MemoryRouter>
  );
}

function platformStatusResponse(overrides: Partial<Record<string, unknown>> = {}) {
  return response({
    overall: "healthy",
    generatedAt: "2026-05-11T14:00:00.000Z",
    connectivity: {
      rs485: {
        rx_messages_per_second: null,
        tx_messages_per_second: null
      },
      nats_broker: {
        status: "ok",
        subscriptions: null,
        in_messages_per_second: null,
        out_messages_per_second: null
      }
    },
    services: [],
    ...overrides
  });
}

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
                controller_hour_24: 14,
                controller_minute: 5,
                controller_datetime_reply: {
                  month: 4,
                  day: 23,
                  year: 26,
                  day_of_week: 4,
                  hour_24: 14,
                  minute: 37
                },
                air_temp_f: 71,
                water_temp_f: 79,
                heater_enabled: true,
                mode: "pool",
                controller_mode_byte: 0x09,
                controller_mode_label: "run + freeze protection",
                active_circuit_keys: ["pool", "cleaner"],
                circuits: {
                  pool: true,
                  spa: false,
                  aux1: false,
                  aux2: false,
                  aux3: false,
                  cleaner: true
                }
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

      if (input.endsWith("/controller/heater")) {
        return response({
          data: {
            source: "controller_native",
            controller_type: "easytouch",
            status: "unavailable",
            message: "Unavailable",
            last_checked: null,
            configuration: {
              detected_heater_type: null,
              solar_or_heat_pump_enabled: null,
              heating_enabled: null,
              cooling_enabled: null,
              freeze_protection_enabled: null,
              raw_payload: [],
              updated_at: null
            },
            settings: {
              pool_setpoint: null,
              spa_setpoint: null,
              cool_setpoint: null,
              pool_heat_mode: null,
              spa_heat_mode: null,
              heat_setting_byte: null,
              source: null,
              updated_at: null
            },
            capabilities: {
              editable_configuration_fields: [],
              editable_setting_fields: []
            }
          },
          error: null
        });
      }

      if (input.endsWith("/controller/clock")) {
        return response({
          data: {
            source: "controller_native",
            controller_type: "easytouch",
            status: "unavailable",
            message: "No controller clock data has been observed yet.",
            last_checked: null,
            summary: {
              month: null,
              day: null,
              year: null,
              day_of_week: null,
              hour_24: null,
              minute: null,
              daylight_savings_auto: null,
              clock_advance: null,
              source: null,
              updated_at: null
            },
            capabilities: {
              editable_fields: [],
              provisional_fields: []
            }
          },
          error: null
        });
      }

      if (input.endsWith("/controller/pumps/configuration")) {
        return response({
          data: {
            source: "controller_native",
            controller_type: "easytouch",
            status: "unavailable",
            message: "No installed EasyTouch pump configuration has been observed yet.",
            last_checked: null,
            pumps: []
          },
          error: null
        });
      }

      return platformStatusResponse();
    })
  );

  renderApp();

  await waitFor(() => {
    assert.ok(screen.getByText("Smart Pool Management"));
    assert.ok(screen.getByText("Automation"));
    assert.ok(screen.getByText("Water Test Log"));
    assert.ok(screen.getByText("System - Equipment & sensors"));
    assert.ok(screen.getByText("Overview & actions"));
    assert.ok(screen.getByText("Equipment & sensors"));
    assert.ok(screen.getByText("Maintenance and tasks"));
    assert.ok(screen.getByText("Trends & insights"));
    assert.ok(screen.getByText("Schedules & rules"));
    assert.ok(screen.getByText("Messages & warnings"));
    assert.ok(screen.getByText("Protocol explorer"));
    assert.ok(screen.getByText("Test history & results"));
    assert.ok(screen.getByText("System & preferences"));
    assert.ok(
      screen.getByText(
        "Live equipment status, controller circuits, system timing, and protocol-level diagnostics for day-to-day pool operations."
      )
    );
    assert.ok(screen.getAllByText("Online").length >= 1);
    assert.ok(screen.getByText("All systems normal"));
    assert.ok(screen.getAllByText("14:05").length > 0);
    assert.ok(screen.getByText("7d 14h"));
    assert.ok(screen.getByText("Splash Platform v0.1.0"));
    assert.ok(screen.getByRole("link", { name: "View system status" }));
    assert.ok(screen.getByRole("tab", { name: "Overview", selected: true }));
    assert.ok(screen.getByRole("tab", { name: "Hardware" }));
    assert.ok(screen.getByRole("tab", { name: "Sensors" }));
    assert.ok(screen.getByRole("tab", { name: "Control" }));
    assert.ok(screen.getByRole("tab", { name: "Connectivity" }));
    assert.ok(screen.getByText("Control Surfaces"));
    assert.ok(screen.getByText("Control Summary"));
    assert.ok(screen.getAllByText("Circuits").length >= 1);
    assert.ok(screen.getByText("Advanced Controls"));
    assert.ok(screen.getAllByText("79 °F").length > 0);
    assert.ok(screen.getAllByText("14:05").length > 0);
  });

  await openSystemTab("Hardware");

  await waitFor(() => {
    assert.ok(screen.getByText("Installed Hardware"));
    assert.ok(screen.getByText(/2750 RPM/));
    assert.ok(screen.getByText(/3200 ppm/));
  });

  await openSystemTab("Connectivity");

  await waitFor(() => {
    assert.ok(screen.getByText("Controller Status"));
    assert.ok(screen.getByText("04/23/26 14:37"));
    assert.ok(screen.getByText("run + freeze protection"));
  });
});

test("renders Connectivity metric cards from API health data", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      if (input.endsWith("/protocol/bundles")) {
        return response({ data: [], error: null });
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
                controller_mode_byte: 0x09,
                controller_mode_label: "run + freeze protection"
              }
            },
            {
              id: "pump-main",
              equipment_type: "pump",
              display_name: "Main Pump",
              protocol_name: "pentair_easytouch",
              bus_address: "0x60",
              latest_state: {}
            },
            {
              id: "chlorinator-main",
              equipment_type: "chlorinator",
              display_name: "Main Chlorinator",
              protocol_name: "pentair_easytouch",
              latest_state: {}
            }
          ],
          error: null
        });
      }

      return platformStatusResponse({
        connectivity: {
          rs485: {
            rx_messages_per_second: 2,
            tx_messages_per_second: 1.5
          },
          nats_broker: {
            status: "ok",
            subscriptions: 11,
            in_messages_per_second: 3,
            out_messages_per_second: 4
          }
        }
      });
    })
  );

  renderApp();
  await openSystemTab("Connectivity");

  await waitFor(() => {
    assert.ok(screen.getByText("RS485 Messages In"));
    assert.ok(screen.getByText("120 / min"));
    assert.ok(screen.getByText("90 / min"));
    assert.ok(screen.getByText("11"));
    assert.ok(screen.getByText("180 / min"));
    assert.ok(screen.getByText("240 / min"));
    assert.ok(screen.getByText("Message Activity"));
    assert.ok(screen.getByText("The chart shows 10-second message buckets derived from the latest API RS485 and NATS rate samples."));
    assert.ok(screen.getByLabelText("Connectivity message activity chart"));
  });
});

test("renders working Automation tabs from the approved mockup slice", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      if (input.endsWith("/protocol/bundles")) {
        return response({ data: [], error: null });
      }

      if (input.endsWith("/controller/schedules")) {
        return response({
          data: {
            source: "controller_native",
            controller_type: "easytouch",
            status: "available",
            message: "Validated EasyTouch controller schedule frames observed.",
            last_checked: "2026-05-12T01:55:00Z",
            schedules: [
              {
                controller_family: "EasyTouch",
                frame_type: "easytouch_schedule",
                action: 17,
                schedule_id: 1,
                circuit_id: 6,
                active: true,
                schedule_type: 0,
                schedule_type_label: "repeat",
                start_time_minutes: 480,
                end_time_minutes: 1020,
                schedule_days: 127,
                parse_confidence: "high",
                warnings: [],
                raw_payload: [1, 6, 8, 0, 17, 0, 127],
                updated_at: "2026-05-12T01:55:00Z"
              },
              {
                controller_family: "EasyTouch",
                frame_type: "easytouch_schedule",
                action: 17,
                schedule_id: 2,
                circuit_id: 4,
                active: false,
                schedule_type: 0,
                schedule_type_label: "repeat",
                start_time_minutes: 600,
                end_time_minutes: 660,
                schedule_days: 62,
                parse_confidence: "high",
                warnings: [],
                raw_payload: [2, 4, 10, 0, 17, 0, 62],
                updated_at: "2026-05-12T01:55:00Z"
              }
            ]
          },
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
                controller_hour_24: 14,
                controller_minute: 5,
                controller_datetime_reply: {
                  month: 4,
                  day: 23,
                  year: 26,
                  day_of_week: 4,
                  hour_24: 14,
                  minute: 37
                }
              }
            },
            {
              id: "pump-main",
              equipment_type: "pump",
              display_name: "Main Pump",
              protocol_name: "pentair_easytouch",
              latest_state: {}
            },
            {
              id: "chlorinator-main",
              equipment_type: "chlorinator",
              display_name: "Main Chlorinator",
              protocol_name: "pentair_easytouch",
              latest_state: {}
            }
          ],
          error: null
        });
      }

      if (input.endsWith("/controller/heater")) {
        return response({
          data: {
            source: "controller_native",
            controller_type: "easytouch",
            status: "unavailable",
            message: "Unavailable",
            last_checked: null,
            configuration: {
              detected_heater_type: null,
              solar_or_heat_pump_enabled: null,
              heating_enabled: null,
              cooling_enabled: null,
              freeze_protection_enabled: null,
              raw_payload: [],
              updated_at: null
            },
            settings: {
              pool_setpoint: null,
              spa_setpoint: null,
              cool_setpoint: null,
              pool_heat_mode: null,
              spa_heat_mode: null,
              heat_setting_byte: null,
              source: null,
              updated_at: null
            },
            capabilities: {
              editable_configuration_fields: [],
              editable_setting_fields: []
            }
          },
          error: null
        });
      }

      if (input.endsWith("/controller/clock")) {
        return response({
          data: {
            source: "controller_native",
            controller_type: "easytouch",
            status: "unavailable",
            message: "No controller clock data has been observed yet.",
            last_checked: null,
            summary: {
              month: null,
              day: null,
              year: null,
              day_of_week: null,
              hour_24: null,
              minute: null,
              daylight_savings_auto: null,
              clock_advance: null,
              source: null,
              updated_at: null
            },
            capabilities: {
              editable_fields: [],
              provisional_fields: []
            }
          },
          error: null
        });
      }

      if (input.endsWith("/controller/pumps/configuration")) {
        return response({
          data: {
            source: "controller_native",
            controller_type: "easytouch",
            status: "unavailable",
            message: "No installed EasyTouch pump configuration has been observed yet.",
            last_checked: null,
            pumps: []
          },
          error: null
        });
      }

      return platformStatusResponse();
    })
  );

  renderApp(["/automation/overview"]);

  await waitFor(() => {
    assert.ok(screen.getByText("Automation - Schedules & rules"));
    assert.ok(screen.getByRole("tab", { name: "Overview", selected: true }));
    assert.ok(screen.getByRole("tab", { name: "Schedules" }));
    assert.ok(screen.getByRole("tab", { name: "Rules" }));
    assert.ok(screen.getByRole("tab", { name: "Scenes" }));
    assert.ok(screen.getByRole("tab", { name: "Triggers" }));
    assert.ok(screen.getByRole("tab", { name: "Logs" }));
    assert.ok(screen.getByText("Automation Overview"));
    assert.ok(screen.getByText("Upcoming Automation"));
    assert.ok(screen.getByText("Recent Activity"));
  });

  fireEvent.click(screen.getByRole("tab", { name: "Schedules" }));

  await waitFor(() => {
    assert.ok(screen.getByRole("tab", { name: "Schedules", selected: true }));
    assert.ok(screen.getByRole("table", { name: "automation schedules" }));
    assert.ok(screen.getByText("12 total programs max"));
    assert.ok(screen.getAllByText("1 / 12").length >= 1);
    assert.ok(screen.getByText("11 active slots remaining"));
    assert.ok(screen.getByText("Per circuit max: 9"));
    assert.ok(screen.getByText("The table below is using controller-backed schedule data returned by Splash API."));
    assert.ok(screen.getByText("9 max per circuit"));
    assert.ok(screen.getByText("Programs remaining"));
    assert.ok(screen.getByText("11 active slots available"));
    assert.ok(screen.getByText("Controller-backed save"));
    assert.ok(screen.getByText("Selected program posture"));
    assert.ok(screen.getByRole("button", { name: "Back to Program 1" }));
    assert.equal((screen.getByLabelText("Circuit") as HTMLSelectElement).value, "6");
  });

  const table = screen.getByRole("table", { name: "automation schedules" });
  const scheduleRow = within(table).getByText("Circuit 6").closest("tr");
  assert.ok(scheduleRow);
  const cells = within(scheduleRow).getAllByRole("cell");
  assert.equal(cells[0]?.textContent, "Circuit 6");
  assert.equal(cells[1]?.textContent, "1");
  assert.equal(cells[2]?.textContent, "Repeat");
  assert.equal(cells[4]?.textContent, "8:00 AM");
  assert.equal(cells[5]?.textContent, "5:00 PM");
  assert.equal(cells[6]?.textContent, "—");
  assert.equal(cells[7]?.textContent, "Active");
  assert.ok(within(scheduleRow).getByRole("button", { name: "Review" }));

  const inactiveRow = within(table).getByText("Circuit 4").closest("tr");
  assert.ok(inactiveRow);
  assert.equal(within(inactiveRow).getAllByRole("cell")[7]?.textContent, "Inactive");
  fireEvent.click(within(inactiveRow).getByRole("button", { name: "Review" }));

  await waitFor(() => {
    assert.ok(screen.getAllByText("Program 2").length >= 1);
    assert.equal((screen.getByLabelText("Circuit") as HTMLSelectElement).value, "4");
    assert.ok(screen.getByText(/this program marked inactive/i));
  });

  fireEvent.click(screen.getByRole("tab", { name: "Logs" }));

  await waitFor(() => {
    assert.ok(screen.getByRole("tab", { name: "Logs", selected: true }));
    assert.ok(screen.getByRole("table", { name: "automation logs" }));
    assert.ok(screen.getByText("Rain response suggestion published"));
  });
});

test("renders an explicit unavailable state when controller schedules are not yet decoded", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      if (input.endsWith("/protocol/bundles")) {
        return response({ data: [], error: null });
      }

      if (input.endsWith("/controller/schedules")) {
        return response({
          data: {
            source: "controller_native",
            controller_type: "easytouch",
            status: "unavailable",
            message: "Observed EasyTouch schedule payloads, but no validated schedule records are available yet.",
            last_checked: "2026-05-12T01:57:00Z",
            schedules: [],
            observed_payloads: [
              {
                payload_hex: "019b0000000000",
                payload_length: 7,
                updated_at: "2026-05-12T01:57:00Z"
              }
            ]
          },
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
              latest_state: {}
            }
          ],
          error: null
        });
      }

      return platformStatusResponse();
    })
  );

  renderApp(["/automation/schedules"]);

  await waitFor(() => {
    assert.ok(screen.getByRole("table", { name: "automation schedules" }));
    assert.ok(screen.getByText("Controller schedules unavailable"));
    assert.equal(
      screen.getAllByText("Observed EasyTouch schedule payloads, but no validated schedule records are available yet.").length,
      2
    );
    assert.ok(screen.getByText("Observed raw schedule payloads"));
    assert.ok(screen.getByText("1 schedule payload sample captured, but not yet field-decoded."));
  });
});

test("renders Platform service health rows from API health data", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      if (input.endsWith("/protocol/bundles")) {
        return response({ data: [], error: null });
      }

      if (input.endsWith("/equipment")) {
        return response({
          data: [
            {
              id: "controller-main",
              equipment_type: "controller",
              display_name: "Main Controller",
              protocol_name: "pentair_easytouch",
              latest_state: {}
            }
          ],
          error: null
        });
      }

      return platformStatusResponse({
        overall: "degraded",
        services: [
          {
            name: "splash-serial",
            type: "splash",
            criticality: "important",
            status: "degraded",
            message: "Device /dev/ttyUSB0 · stream stream-1",
            lastChecked: "2026-05-11T14:00:00.000Z",
            responseTimeMs: 12,
            checks: {
              serialPort: { status: "healthy", message: "Connected to /dev/ttyUSB0" },
              nats: { status: "unhealthy", message: "NATS degraded" }
            }
          },
          {
            name: "nats",
            type: "third-party",
            criticality: "critical",
            status: "healthy",
            message: "Connected",
            lastChecked: "2026-05-11T14:00:00.000Z",
            responseTimeMs: 8
          },
          {
            name: "splash-protocol",
            type: "splash",
            criticality: "important",
            status: "healthy",
            message: "running_ok · pentair_easytouch",
            lastChecked: "2026-05-11T14:00:00.000Z",
            responseTimeMs: 9
          },
          {
            name: "splash-frontend",
            type: "splash",
            criticality: "important",
            status: "healthy",
            message: "Browser session active",
            lastChecked: "2026-05-11T14:00:00.000Z",
            responseTimeMs: 3
          },
          {
            name: "prometheus",
            type: "third-party",
            criticality: "optional",
            status: "degraded",
            message: "Scrape targets partially impaired",
            lastChecked: "2026-05-11T14:00:00.000Z",
            responseTimeMs: 14
          },
          {
            name: "grafana",
            type: "third-party",
            criticality: "optional",
            status: "down",
            message: "Datasource API unavailable",
            lastChecked: "2026-05-11T14:00:00.000Z",
            responseTimeMs: null
          },
          {
            name: "weather-provider",
            type: "third-party",
            criticality: "optional",
            status: "healthy",
            message: "Weather forecast cache is current",
            lastChecked: "2026-05-11T14:00:00.000Z",
            responseTimeMs: 6
          }
        ]
      });
    })
  );

  renderApp(["/system/platform"]);

  await waitFor(() => {
    assert.ok(screen.getByText("Splash Serial"));
    assert.ok(screen.getByText("NATS"));
    assert.ok(screen.getByText("Splash Protocol"));
    assert.ok(screen.getByText("Splash Frontend"));
    assert.ok(screen.getByText("Prometheus"));
    assert.ok(screen.getByText("Grafana"));
    assert.ok(screen.getByText("Weather Provider"));
    assert.ok(screen.getAllByText("Splash service · Important").length >= 1);
    assert.ok(screen.getByText("Third-party service · Critical"));
    assert.ok(screen.getAllByText("Third-party service · Optional").length >= 1);
    assert.ok(screen.getAllByText(/important · updated/i).length >= 1);
    assert.ok(screen.getByText("Device /dev/ttyUSB0 · stream stream-1"));
    assert.ok(screen.getByText(/running_ok · pentair_easytouch/));
    assert.ok(screen.getByText(/Browser session active/));
    assert.ok(screen.getByText(/Scrape targets partially impaired/));
    assert.ok(screen.getByText(/Datasource API unavailable/));
    assert.ok(screen.getByText(/Weather forecast cache is current/));
    assert.ok(screen.getAllByText("Healthy").length > 0);
    assert.ok(screen.getAllByText("Degraded").length > 0);
    assert.ok(screen.getAllByText("Down").length > 0);
  });
});

test("lazy-loads tabbed persistence-backed history charts", async () => {
  const requests: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      requests.push(input);
      if (input.endsWith("/protocol/bundles") && (!init || !init.method)) {
        return response({ data: [], error: null });
      }

      if (input.endsWith("/equipment")) {
        return response({ data: [], error: null });
      }

      if (input.includes("/telemetry/temperatures/history")) {
        return response({
          data: {
            controller_id: "default",
            range: {
              start: "2026-05-01T00:00:00.000Z",
              end: "2026-05-12T00:00:00.000Z"
            },
            interval: "30m",
            series: [
              {
                sensor_type: "air",
                unit: "F",
                points: [{ timestamp: "2026-05-11T12:00:00.000Z", value: 77, normalizedF: 77, normalizedC: 25 }]
              },
              {
                sensor_type: "pool_water",
                unit: "F",
                points: [{ timestamp: "2026-05-11T12:00:00.000Z", value: 81, normalizedF: 81, normalizedC: 27.2 }]
              },
              {
                sensor_type: "spa_water",
                unit: "F",
                points: [{ timestamp: "2026-05-11T12:00:00.000Z", value: 84, normalizedF: 84, normalizedC: 28.9 }]
              },
              {
                sensor_type: "solar",
                unit: "F",
                points: [{ timestamp: "2026-05-11T12:00:00.000Z", value: 90, normalizedF: 90, normalizedC: 32.2 }]
              }
            ]
          },
          error: null
        });
      }

      if (input.includes("/telemetry/pumps/history")) {
        return response({
          data: {
            range: {
              start: "2026-05-01T00:00:00.000Z",
              end: "2026-05-12T00:00:00.000Z"
            },
            interval: "10m",
            series: [
              {
                pump_id: "pump-main",
                controller_id: "default",
                controller_type: "easytouch",
                bus_address: "0x60",
                points: [
                  {
                    timestamp: "2026-05-11T12:00:00.000Z",
                    running: true,
                    rpm: 1156,
                    watts: 352
                  }
                ]
              }
            ]
          },
          error: null
        });
      }

      if (input.includes("/weather/history")) {
        const url = new URL(input);
        const metric = url.searchParams.get("metric");
        return response({
          data: {
            pool_id: "pool-1",
            provider: "openmeteo",
            metric,
            status: "available",
            message: "Weather history is available.",
            stale: false,
            fetched_at: "2026-05-12T11:30:00.000Z",
            range: {
              start: "2026-05-01T00:00:00.000Z",
              end: "2026-05-12T00:00:00.000Z"
            },
            interval: "6h",
            series: [
              {
                metric,
                points: [{ timestamp: "2026-05-11T12:00:00.000Z", value: metric === "uv_index" ? 7.1 : 42 }]
              }
            ]
          },
          error: null
        });
      }

      return platformStatusResponse();
    })
  );

  renderApp(["/history"]);

  await waitFor(() => {
    assert.ok(screen.getByText("History Trends"));
    assert.ok(screen.getByRole("tab", { name: "Temperature", selected: true }));
    assert.equal((screen.getByLabelText("Time range") as HTMLSelectElement).value, "36h");
    assert.ok(screen.getByRole("img", { name: "Air history chart" }));
    assert.ok(screen.getByRole("img", { name: "Pool Water history chart" }));
    assert.ok(screen.getByRole("img", { name: "Spa Water history chart" }));
    assert.ok(screen.getByRole("img", { name: "Solar history chart" }));
    assert.ok(screen.getAllByRole("img").length >= 1);
  });

  assert.equal(screen.queryByRole("img", { name: "Pump RPM history chart" }), null);
  assert.equal(screen.queryByText("Weather Temperature"), null);

  const temperatureHistoryRequest = requests.find((entry) => entry.includes("/telemetry/temperatures/history"));
  assert.ok(temperatureHistoryRequest);
  const temperatureHistoryUrl = new URL(temperatureHistoryRequest as string, "http://127.0.0.1:8080");
  assert.equal(temperatureHistoryUrl.searchParams.get("interval"), "15m");
  const start = Date.parse(temperatureHistoryUrl.searchParams.get("start") as string);
  const end = Date.parse(temperatureHistoryUrl.searchParams.get("end") as string);
  assert.ok(Number.isFinite(start));
  assert.ok(Number.isFinite(end));
  assert.ok(end > start);
  assert.equal(end - start, 36 * 60 * 60 * 1000);
  assert.equal(requests.some((entry) => entry.includes("/telemetry/pumps/history")), false);
  assert.equal(requests.some((entry) => entry.includes("/weather/history")), false);

  fireEvent.change(screen.getByLabelText("Time range"), {
    target: { value: "12h" }
  });

  await waitFor(() => {
    const temperatureRequests = requests.filter((entry) => entry.includes("/telemetry/temperatures/history"));
    assert.equal(temperatureRequests.length, 2);
  });

  const midRangeTemperatureHistoryRequest = requests.filter((entry) => entry.includes("/telemetry/temperatures/history")).at(-1);
  assert.ok(midRangeTemperatureHistoryRequest);
  const midRangeTemperatureHistoryUrl = new URL(midRangeTemperatureHistoryRequest as string, "http://127.0.0.1:8080");
  assert.equal(midRangeTemperatureHistoryUrl.searchParams.get("interval"), "15m");
  const midRangeTemperatureStart = Date.parse(midRangeTemperatureHistoryUrl.searchParams.get("start") as string);
  const midRangeTemperatureEnd = Date.parse(midRangeTemperatureHistoryUrl.searchParams.get("end") as string);
  assert.equal(midRangeTemperatureEnd - midRangeTemperatureStart, 12 * 60 * 60 * 1000);

  fireEvent.change(screen.getByLabelText("Time range"), {
    target: { value: "7d" }
  });

  await waitFor(() => {
    const temperatureRequests = requests.filter((entry) => entry.includes("/telemetry/temperatures/history"));
    assert.equal(temperatureRequests.length, 3);
  });

  const latestTemperatureHistoryRequest = requests.filter((entry) => entry.includes("/telemetry/temperatures/history")).at(-1);
  assert.ok(latestTemperatureHistoryRequest);
  const latestTemperatureHistoryUrl = new URL(latestTemperatureHistoryRequest as string, "http://127.0.0.1:8080");
  assert.equal(latestTemperatureHistoryUrl.searchParams.get("interval"), "4h");
  const latestTemperatureStart = Date.parse(latestTemperatureHistoryUrl.searchParams.get("start") as string);
  const latestTemperatureEnd = Date.parse(latestTemperatureHistoryUrl.searchParams.get("end") as string);
  assert.equal(latestTemperatureEnd - latestTemperatureStart, 7 * 24 * 60 * 60 * 1000);

  fireEvent.click(screen.getByRole("tab", { name: "Pump" }));

  await waitFor(() => {
    assert.ok(screen.getByRole("tab", { name: "Pump", selected: true }));
    assert.ok(screen.getByRole("img", { name: "Pump RPM history chart" }));
    assert.ok(screen.getByRole("img", { name: "Pump watt history chart" }));
  });

  const pumpHistoryRequest = requests.find((entry) => entry.includes("/telemetry/pumps/history"));
  assert.ok(pumpHistoryRequest);
  const pumpHistoryUrl = new URL(pumpHistoryRequest as string, "http://127.0.0.1:8080");
  assert.equal(pumpHistoryUrl.searchParams.get("pumpId"), "pump-main");
  assert.equal(pumpHistoryUrl.searchParams.get("interval"), "4h");

  fireEvent.click(screen.getByRole("tab", { name: "Weather" }));

  await waitFor(() => {
    assert.ok(screen.getByRole("tab", { name: "Weather", selected: true }));
    assert.ok(screen.getByText("Weather Temperature"));
    assert.ok(screen.getByText("Cloud Cover"));
    assert.ok(screen.getByText("UV Index"));
    assert.ok(screen.getByText("Rain Chance"));
    assert.ok(screen.getByText("Rain Amount"));
  });

  const weatherHistoryRequests = requests.filter((entry) => entry.includes("/weather/history"));
  assert.equal(weatherHistoryRequests.length, 5);
  for (const request of weatherHistoryRequests) {
    const url = new URL(request, "http://127.0.0.1:8080");
    assert.equal(url.searchParams.get("interval"), "4h");
  }
});

test("renders Pool on from the bitmask state even when mode disagrees", async () => {
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
                mode: "spa",
                active_circuit_keys: [],
                circuits: {
                  pool: true,
                  spa: false
                }
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

  renderApp();
  await openSystemTab("Control");

  await waitFor(() => {
    assert.ok(screen.getAllByText("Pool").length > 0);
    assert.equal(screen.getAllByText("On").length, 1);
    assert.ok(screen.getAllByText("Off").length > 0);
  });
});

test("renders custom name bank values as text inputs on the EasyTouch hardware detail page", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      if (input.endsWith("/protocol/bundles")) {
        return response({ data: [], error: null });
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
                custom_name_bank: {
                  "0": { custom_name_text: "WATERFALL" },
                  "1": { custom_name_text: "SPA MODE" },
                  "2": { custom_name_text: "NIGHTSWIM" }
                }
              }
            }
          ],
          error: null
        });
      }

      return platformStatusResponse();
    })
  );

  renderApp(["/system/hardware/easytouch8"]);

  await waitFor(() => {
    assert.ok(screen.getByText("Custom Circuit Names"));
    assert.equal((screen.getByLabelText("Custom name value 0") as HTMLInputElement).value, "WATERFALL");
    assert.equal((screen.getByLabelText("Custom name value 1") as HTMLInputElement).value, "SPA MODE");
    assert.equal((screen.getByLabelText("Custom name value 2") as HTMLInputElement).value, "NIGHTSWIM");
    assert.equal((screen.getByLabelText("Custom name value 9") as HTMLInputElement).value, "");
    assert.ok(screen.getByLabelText("Save custom name row 0"));
    assert.ok(screen.getByLabelText("Discard custom name row 0"));
  });
}, 10000);

test("renders EasyTouch circuit configuration rows as staged editors from live controller metadata", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      if (input.endsWith("/protocol/bundles")) {
        return response({ data: [], error: null });
      }

      if (input.endsWith("/equipment")) {
        return response({
          data: [
            {
              id: "controller-main",
              equipment_type: "controller",
              display_name: "Main Controller",
              protocol_name: "pentair_easytouch",
              hardware: {
                circuits: [
                  {
                    circuit_key: "pool",
                    display_name: "Pool",
                    circuit_type: "fixed",
                    installed: true,
                    writable: true,
                    configuration_circuit_index: 2,
                    write_circuit_id: 2
                  },
                  {
                    circuit_key: "feature1",
                    display_name: "Feature 1",
                    circuit_type: "feature",
                    installed: true,
                    writable: true,
                    configuration_circuit_index: 10,
                    write_circuit_id: 11
                  }
                ]
              },
              latest_state: {
                circuits: {
                  pool: true,
                  pool_low: false
                },
                circuit_configurations: {
                  "2": {
                    circuit_id: 2,
                    function_value: 2,
                    function_label: "Pool",
                    name_value: 2,
                    name_label: "POOL",
                    freeze_flag: false,
                    high_flag: false
                  },
                  "10": {
                    circuit_id: 10,
                    function_value: 11,
                    function_label: "Feature",
                    name_value: 44,
                    name_label: "POOL LOW",
                    freeze_flag: true,
                    high_flag: true
                  }
                }
              }
            }
          ],
          error: null
        });
      }

      return platformStatusResponse();
    })
  );

  renderApp(["/system/hardware/easytouch8"]);

  await waitFor(() => {
    assert.ok(screen.getByText("Circuit Configuration"));
    assert.ok(screen.getByText("ID"));
    assert.ok(screen.getByText("Type"));
    assert.ok(screen.getByText("Function"));
    assert.ok(screen.getByText("Function Value"));
    assert.ok(screen.getByText("Name"));
    assert.ok(screen.getByText("Name Value"));
    assert.ok(screen.getByText("Freeze"));
    assert.ok(screen.getByText("State"));
    assert.ok(screen.getAllByText("Action").length >= 2);
    const poolRow = screen.getByLabelText("Save circuit row pool").closest("tr");
    assert.ok(poolRow);
    assert.equal((screen.getByLabelText("Circuit name pool") as HTMLSelectElement).value, "POOL");
    assert.equal((screen.getByLabelText("Circuit function pool") as HTMLSelectElement).value, "Pool");
    const poolCells = within(poolRow).getAllByRole("cell");
    assert.equal(poolCells[3]?.textContent, "2");
    assert.equal(poolCells[5]?.textContent, "2");
    assert.equal((screen.getByLabelText("Freeze pool") as HTMLButtonElement).getAttribute("aria-checked"), "false");
    assert.equal((screen.getByLabelText("State pool") as HTMLButtonElement).getAttribute("aria-checked"), "true");
    const featureRow = screen.getByLabelText("Save circuit row feature1").closest("tr");
    assert.ok(featureRow);
    assert.equal((screen.getByLabelText("Circuit name feature1") as HTMLSelectElement).value, "POOL LOW");
    assert.equal((screen.getByLabelText("Circuit function feature1") as HTMLSelectElement).value, "Feature");
    const featureCells = within(featureRow).getAllByRole("cell");
    assert.equal(featureCells[3]?.textContent, "11");
    assert.equal(featureCells[5]?.textContent, "44");
    assert.equal((screen.getByLabelText("Freeze feature1") as HTMLButtonElement).getAttribute("aria-checked"), "true");
    assert.equal((screen.getByLabelText("State feature1") as HTMLButtonElement).getAttribute("aria-checked"), "false");
    assert.ok(screen.getByLabelText("Save circuit row pool"));
    assert.ok(screen.getByLabelText("Discard circuit row pool"));
  });
}, 10000);

test("renders EasyTouch controller clock and live pump configuration cards", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      if (input.endsWith("/protocol/bundles")) {
        return response({ data: [], error: null });
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
                controller_hour_24: 18,
                controller_minute: 52
              }
            }
          ],
          error: null
        });
      }

      if (input.endsWith("/controller/heater")) {
        return response({
          data: {
            source: "controller_native",
            controller_type: "easytouch",
            status: "unavailable",
            message: "Unavailable",
            last_checked: null,
            configuration: {
              detected_heater_type: null,
              solar_or_heat_pump_enabled: null,
              heating_enabled: null,
              cooling_enabled: null,
              freeze_protection_enabled: null,
              raw_payload: [],
              updated_at: null
            },
            settings: {
              pool_setpoint: null,
              spa_setpoint: null,
              cool_setpoint: null,
              pool_heat_mode: null,
              spa_heat_mode: null,
              heat_setting_byte: null,
              source: null,
              updated_at: null
            },
            capabilities: {
              editable_configuration_fields: [],
              editable_setting_fields: []
            }
          },
          error: null
        });
      }

      if (input.endsWith("/controller/clock")) {
        return response({
          data: {
            source: "controller_native",
            controller_type: "easytouch",
            status: "available",
            message: "Controller clock data is available.",
            last_checked: "2026-05-23T18:52:00.000Z",
            summary: {
              month: 5,
              day: 23,
              year: 26,
              day_of_week: 6,
              hour_24: 18,
              minute: 52,
              daylight_savings_auto: false,
              clock_advance: null,
              source: "controller_datetime_reply",
              updated_at: "2026-05-23T18:52:00.000Z"
            },
            capabilities: {
              editable_fields: ["month", "day", "year", "day_of_week", "hour_24", "minute", "daylight_savings_auto", "clock_advance"],
              provisional_fields: ["daylight_savings_auto", "clock_advance"]
            }
          },
          error: null
        });
      }

      if (input.endsWith("/controller/pumps/configuration")) {
        return response({
          data: {
            source: "controller_native",
            controller_type: "easytouch",
            status: "available",
            message: "Live installed-pump configuration is available.",
            last_checked: "2026-05-23T18:52:00.000Z",
            pumps: [
              {
                pump_id: 1,
                installed: true,
                pump_type: 128,
                pump_type_label: "Variable Speed",
                supported_branch: "vs",
                priming_time: 0,
                unknown_3: 2,
                unknown_4: 0,
                priming_speed: 1000,
                slots: [
                  { slot: 1, circuit_assignment: 5, rpm: 2000 },
                  { slot: 2, circuit_assignment: 6, rpm: 1500 },
                  { slot: 3, circuit_assignment: 0, rpm: 0 },
                  { slot: 4, circuit_assignment: 0, rpm: 0 },
                  { slot: 5, circuit_assignment: 0, rpm: 0 },
                  { slot: 6, circuit_assignment: 0, rpm: 0 },
                  { slot: 7, circuit_assignment: 0, rpm: 0 },
                  { slot: 8, circuit_assignment: 0, rpm: 0 }
                ],
                trailing_bytes: [],
                updated_at: "2026-05-23T18:52:00.000Z"
              }
            ]
          },
          error: null
        });
      }

      return platformStatusResponse();
    })
  );

  renderApp(["/system/hardware/easytouch8"]);

  await waitFor(() => {
    assert.ok(screen.getAllByText("Main Controller").length >= 2);
    assert.ok(screen.getByText("Date / Time / DST / Clock Adjust"));
    assert.ok(screen.getByText("Pump Configuration"));
    assert.ok(screen.getByText("5/23/26"));
    assert.ok(screen.getAllByText("Manual").length >= 1);
    assert.ok(screen.getByDisplayValue("18"));
    assert.ok(screen.getByDisplayValue("52"));
    assert.ok(screen.getByText("Pump #1"));
    assert.ok(screen.getByText("Variable Speed"));
    assert.ok(screen.getByRole("button", { name: "Save pump #1 configuration" }));
  });
});

test("renders EasyTouch circuit configuration rows from full controller circuit state, including circuit 1", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      if (input.endsWith("/protocol/bundles")) {
        return response({ data: [], error: null });
      }

      if (input.endsWith("/equipment")) {
        return response({
          data: [
            {
              id: "controller-main",
              equipment_type: "controller",
              display_name: "Main Controller",
              protocol_name: "pentair_easytouch",
              hardware: {
                circuits: [
                  {
                    circuit_key: "spa",
                    display_name: "Spa",
                    circuit_type: "fixed",
                    installed: false,
                    writable: true,
                    configuration_circuit_index: 1,
                    write_circuit_id: 1
                  },
                  {
                    circuit_key: "pool",
                    display_name: "Pool",
                    circuit_type: "fixed",
                    installed: true,
                    writable: true,
                    configuration_circuit_index: 2,
                    write_circuit_id: 2
                  },
                  {
                    circuit_key: "aux2",
                    display_name: "Aux 2",
                    circuit_type: "relay",
                    installed: true,
                    writable: true,
                    configuration_circuit_index: 4,
                    write_circuit_id: 4
                  }
                ]
              },
              latest_state: {
                mode: "pool",
                circuits: {
                  pool: true,
                  spa: false,
                  aux2: false
                },
                active_circuit_keys: ["pool"],
                circuit_configurations: {
                  "1": {
                    circuit_id: 1,
                    function_value: 1,
                    function_label: "Spa",
                    name_value: 82,
                    name_label: "SPA",
                    freeze_flag: false,
                    high_flag: false
                  },
                  "2": {
                    circuit_id: 2,
                    function_value: 2,
                    function_label: "Pool",
                    name_value: 70,
                    name_label: "POOL",
                    freeze_flag: false,
                    high_flag: false
                  },
                  "4": {
                    circuit_id: 4,
                    function_value: 12,
                    function_label: "COLOR WHEEL",
                    name_value: 5,
                    name_label: "AUX 2",
                    freeze_flag: false,
                    high_flag: false
                  }
                }
              }
            }
          ],
          error: null
        });
      }

      if (input.endsWith("/health")) {
        return healthResponse();
      }

      if (input.endsWith("/controller/heater")) {
        return response({
          data: {
            source: "controller_native",
            controller_type: "easytouch",
            status: "available",
            message: "Heater data is available",
            last_checked: "2026-05-24T12:00:00.000Z",
            configuration: {
              detected_heater_type: "ultratempHeatPumpCom",
              solar_or_heat_pump_enabled: true,
              heating_enabled: true,
              cooling_enabled: false,
              freeze_protection_enabled: true,
              raw_payload: [2, 17, 0],
              updated_at: "2026-05-24T12:00:00.000Z"
            },
            settings: {
              pool_setpoint: 84,
              spa_setpoint: 100,
              cool_setpoint: 0,
              pool_heat_mode: "heater",
              spa_heat_mode: "off",
              heat_setting_byte: 1,
              source: "controller_status",
              updated_at: "2026-05-24T12:00:00.000Z"
            },
            capabilities: {
              editable_configuration_fields: ["heater_type", "cooling_enabled", "freeze_protection_enabled"],
              editable_setting_fields: ["pool_setpoint", "spa_setpoint", "pool_heat_mode", "spa_heat_mode", "cool_setpoint"]
            }
          },
          error: null
        });
      }

      if (input.endsWith("/controller/clock")) {
        return response({
          data: {
            source: "controller_native",
            controller_type: "easytouch",
            status: "available",
            message: "Controller clock available",
            last_checked: "2026-05-24T12:00:00.000Z",
            summary: {
              month: 5,
              day: 24,
              year: 2026,
              day_of_week: 0,
              hour_24: 18,
              minute: 52,
              daylight_savings_auto: true,
              clock_advance: 0,
              source: "combined",
              updated_at: "2026-05-24T12:00:00.000Z"
            },
            capabilities: {
              editable_fields: ["month", "day", "year", "day_of_week", "hour_24", "minute"],
              provisional_fields: ["daylight_savings_auto", "clock_advance"]
            }
          },
          error: null
        });
      }

      if (input.endsWith("/controller/pumps/configuration")) {
        return response({
          data: {
            source: "controller_native",
            controller_type: "easytouch",
            status: "available",
            message: "Pump configuration available",
            last_checked: "2026-05-24T12:00:00.000Z",
            pumps: []
          },
          error: null
        });
      }

      return platformStatusResponse();
    })
  );

  renderApp(["/system/hardware/easytouch8"]);

  await waitFor(() => {
    assert.ok(screen.getByText("Circuit Configuration"));
    assert.equal(screen.queryByLabelText("Circuit name spa"), null);
    assert.equal(screen.queryByLabelText("Circuit function spa"), null);
    assert.equal(screen.queryByLabelText("Freeze spa"), null);
    assert.equal(screen.queryByLabelText("Save circuit row spa"), null);
    assert.ok(screen.getAllByText("Unavailable").length >= 1);
    assert.ok(screen.getByText("Not installed"));
    assert.ok(screen.getByRole("button", { name: "Refresh circuit configuration" }));
    assert.equal((screen.getByLabelText("Circuit function aux2") as HTMLSelectElement).value, "COLOR WHEEL");
    assert.ok(screen.getByLabelText("Save circuit row aux2"));
  });
}, 10000);

test("refreshes circuit configuration from the EasyTouch8 circuit configuration card", async () => {
  const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    if (input.endsWith("/protocol/bundles")) {
      return response({ data: [], error: null });
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
              mode: "pool",
              circuits: {
                pool: true
              },
              active_circuit_keys: ["pool"],
              circuit_configurations: {
                "2": {
                  circuit_id: 2,
                  function_value: 2,
                  function_label: "Pool",
                  name_value: 17,
                  name_label: "POOL",
                  freeze_flag: false,
                  high_flag: false
                }
              }
            }
          }
        ],
        error: null
      });
    }

    if (input.endsWith("/protocol/circuit-config/request")) {
      assert.equal(init?.method, "POST");
      return response({
        data: {
          command_id: "refresh-command-1"
        },
        error: null
      });
    }

    if (input.endsWith("/controller/heater")) {
      return response({
        data: {
          source: "controller_native",
          controller_type: "easytouch",
          status: "available",
          message: "Heater data is available",
          last_checked: "2026-05-24T12:00:00.000Z",
          configuration: {
            detected_heater_type: "ultratempHeatPumpCom",
            solar_or_heat_pump_enabled: true,
            heating_enabled: true,
            cooling_enabled: false,
            freeze_protection_enabled: true,
            raw_payload: [2, 17, 0],
            updated_at: "2026-05-24T12:00:00.000Z"
          },
          settings: {
            pool_setpoint: 84,
            spa_setpoint: 100,
            cool_setpoint: 0,
            pool_heat_mode: "heater",
            spa_heat_mode: "off",
            heat_setting_byte: 1,
            source: "controller_status",
            updated_at: "2026-05-24T12:00:00.000Z"
          },
          capabilities: {
            editable_configuration_fields: ["heater_type", "cooling_enabled", "freeze_protection_enabled"],
            editable_setting_fields: ["pool_setpoint", "spa_setpoint", "pool_heat_mode", "spa_heat_mode", "cool_setpoint"]
          }
        },
        error: null
      });
    }

    if (input.endsWith("/controller/clock")) {
      return response({
        data: {
          source: "controller_native",
          controller_type: "easytouch",
          status: "available",
          message: "Controller clock available",
          last_checked: "2026-05-24T12:00:00.000Z",
          summary: {
            month: 5,
            day: 24,
            year: 2026,
            day_of_week: 0,
            hour_24: 18,
            minute: 52,
            daylight_savings_auto: true,
            clock_advance: 0,
            source: "combined",
            updated_at: "2026-05-24T12:00:00.000Z"
          },
          capabilities: {
            editable_fields: ["month", "day", "year", "day_of_week", "hour_24", "minute"],
            provisional_fields: ["daylight_savings_auto", "clock_advance"]
          }
        },
        error: null
      });
    }

    if (input.endsWith("/controller/pumps/configuration")) {
      return response({
        data: {
          source: "controller_native",
          controller_type: "easytouch",
          status: "available",
          message: "Pump configuration available",
          last_checked: "2026-05-24T12:00:00.000Z",
          pumps: []
        },
        error: null
      });
    }

    return platformStatusResponse();
  });

  vi.stubGlobal("fetch", fetchMock);

  renderApp(["/system/hardware/easytouch8"]);

  await waitFor(() => {
    assert.ok(screen.getByRole("button", { name: "Refresh circuit configuration" }));
  });

  fireEvent.click(screen.getByRole("button", { name: "Refresh circuit configuration" }));

  await waitFor(() => {
    assert.ok(screen.getByText("Controller circuit configuration discovery accepted for indexes 1-20. Command refresh-command-1."));
  });
}, 10000);

test("switches sidebar views and renders Diagnostics network cards", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      if (input.endsWith("/protocol/bundles") && (!init || !init.method)) {
        return response({ data: [], error: null });
      }

      if (input.endsWith("/equipment")) {
        return response({ data: [], error: null });
      }

      if (input.endsWith("/telemetry/temperatures/latest")) {
        return response({
          data: {
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
              },
              pool_water: {
                timestamp: "2026-05-12T12:00:00.000Z",
                original_value: 82,
                original_unit: "F",
                normalized_f: 82,
                normalized_c: 27.8,
                raw_byte: 82,
                controller_timestamp: "12:00"
              }
            }
          },
          error: null
        });
      }

      if (input.includes("/telemetry/temperatures/history")) {
        return response({
          data: {
            controller_id: "default",
            range: {
              start: "2026-05-11T12:00:00.000Z",
              end: "2026-05-12T12:00:00.000Z"
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
              },
              {
                sensor_type: "pool_water",
                unit: "F",
                points: [
                  {
                    timestamp: "2026-05-11T12:00:00.000Z",
                    value: 81,
                    normalizedF: 81,
                    normalizedC: 27.2
                  }
                ]
              }
            ]
          },
          error: null
        });
      }

      if (input.endsWith("/weather/forecast")) {
        return response({
          data: {
            pool_id: "pool-1",
            provider: "openmeteo",
            status: "available",
            message: "Weather forecast is available.",
            stale: false,
            fetched_at: "2026-05-12T11:30:00.000Z",
            location: {
              latitude: 35.2621,
              longitude: -81.1873,
              timezone: "America/New_York",
              source: "manual",
              name: "Gastonia"
            },
            daily: [
              {
                date: "2026-05-12",
                weather_code: 3,
                high_temp_f: 82,
                high_temp_c: 27.8,
                low_temp_f: 63,
                low_temp_c: 17.2,
                precipitation_probability_max: 25,
                precipitation_amount: 0,
                precipitation_unit: "mm",
                uv_index_max: 8.6,
                sunrise: "2026-05-12T06:19:00-04:00",
                sunset: "2026-05-12T20:15:00-04:00"
              },
              {
                date: "2026-05-13",
                weather_code: 2,
                high_temp_f: 84,
                high_temp_c: 28.9,
                low_temp_f: 65,
                low_temp_c: 18.3,
                precipitation_probability_max: 10,
                precipitation_amount: 0,
                precipitation_unit: "mm",
                uv_index_max: 9.1,
                sunrise: "2026-05-13T06:18:00-04:00",
                sunset: "2026-05-13T20:16:00-04:00"
              }
            ],
            hourly: []
          },
          error: null
        });
      }

      return platformStatusResponse();
    })
  );

  renderApp();
  await waitFor(() => assert.ok(FakeEventSource.instances.length === 2));

  fireEvent.click(screen.getByRole("link", { name: /Home/ }));

  await waitFor(() => {
    assert.ok(screen.getByRole("heading", { name: "Home - Overview & actions" }));
    assert.ok(screen.getByText("Home Telemetry"));
    assert.ok(screen.getByText("82 °F"));
    assert.ok(screen.getByText("78 °F"));
    assert.ok(screen.getByRole("img", { name: "Temperature history chart" }));
    assert.ok(screen.getByText("Weather Forecast"));
    assert.ok(screen.getByText("Provider"));
  });

  fireEvent.click(screen.getByRole("link", { name: /Diagnostics/ }));

  await waitFor(() => {
    assert.ok(screen.getByRole("heading", { name: "Diagnostics - Protocol explorer" }));
    assert.ok(screen.getByRole("tab", { name: "Protocol Explorer" }));
  });

  fireEvent.click(screen.getByRole("tab", { name: "Network" }));

  await waitFor(() => {
    assert.ok(screen.getByRole("heading", { name: "Network Overview" }));
    assert.ok(screen.getByRole("heading", { name: "Network Statistics" }));
    assert.ok(screen.getByRole("heading", { name: "RS485 Bus" }));
    assert.ok(screen.getByRole("heading", { name: "Event Bus" }));
    assert.ok(screen.getByRole("heading", { name: "Network Interfaces" }));
    assert.ok(screen.getAllByText("RS485 Bus").length >= 2);
  });
});

test("renders the Home temperature telemetry empty state when no history exists", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      if (input.endsWith("/protocol/bundles") && (!init || !init.method)) {
        return response({ data: [], error: null });
      }

      if (input.endsWith("/equipment")) {
        return response({ data: [], error: null });
      }

      if (input.endsWith("/telemetry/temperatures/latest")) {
        return response({
          data: {
            controller_id: "default",
            status: "empty",
            message: "No EasyTouch temperature history has been captured yet.",
            last_updated: null,
            readings: {}
          },
          error: null
        });
      }

      if (input.includes("/telemetry/temperatures/history")) {
        return response({
          data: {
            controller_id: "default",
            range: {
              start: "2026-05-11T12:00:00.000Z",
              end: "2026-05-12T12:00:00.000Z"
            },
            interval: "1h",
            series: []
          },
          error: null
        });
      }

      if (input.endsWith("/weather/forecast")) {
        return response({
          data: {
            pool_id: "pool-1",
            provider: "openmeteo",
            status: "empty",
            message: "No weather forecast has been captured yet.",
            stale: false,
            fetched_at: null,
            location: null,
            daily: [],
            hourly: []
          },
          error: null
        });
      }

      return platformStatusResponse();
    })
  );

  renderApp(["/"]);

  await waitFor(() => {
    assert.ok(screen.getByText("No EasyTouch temperature history has been captured yet."));
    assert.ok(screen.getByText("No weather forecast has been captured yet."));
  });
});

test("requests controller circuit configuration discovery from the dashboard", async () => {
  const requests: Array<{ input: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      requests.push({ input, init });

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
                circuits: {
                  pool: true
                }
              }
            }
          ],
          error: null
        });
      }

      if (input.endsWith("/protocol/circuit-config/request")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          start_index?: number;
          end_index?: number;
        };
        assert.equal(body.start_index, 1);
        assert.equal(body.end_index, 20);
        return response({
          data: {
            command_id: "command-circuit-config",
            status: "accepted"
          },
          error: null
        });
      }

      return response({
        status: "ok",
        error: null
      });
    })
  );

  renderApp();
  await openSystemTab("Control");

  await waitFor(() => assert.ok(screen.getByRole("button", { name: "Request controller circuit config" })));

  fireEvent.click(screen.getByRole("button", { name: "Request controller circuit config" }));

  await waitFor(() => {
    assert.ok(requests.some((request) => request.input.endsWith("/protocol/circuit-config/request")));
    assert.ok(screen.getByText(/Controller circuit configuration discovery accepted for indexes 1-20/));
  });
});

test("automatically requests controller circuit configuration when metadata is missing", async () => {
  const requests: Array<{ input: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      requests.push({ input, init });

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
              hardware: {
                circuits: [
                  {
                    circuit_key: "pool",
                    display_name: "Pool",
                    circuit_type: "fixed",
                    installed: true,
                    writable: true,
                    configuration_circuit_index: 2,
                    write_circuit_id: 2
                  },
                  {
                    circuit_key: "feature1",
                    display_name: "Feature 1",
                    circuit_type: "feature",
                    installed: true,
                    writable: true,
                    configuration_circuit_index: 10,
                    write_circuit_id: 11
                  }
                ]
              },
              latest_state: {
                updated_at: "2026-04-24T10:00:00Z",
                circuits: {
                  pool: true,
                  pool_low: false
                },
                circuit_configurations: {
                  "2": {
                    circuit_id: 2,
                    function_value: 2,
                    name_value: 2
                  }
                }
              }
            }
          ],
          error: null
        });
      }

      if (input.endsWith("/protocol/circuit-config/request")) {
        return response({
          data: {
            command_id: "command-auto-circuit-config",
            status: "accepted"
          },
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

  renderApp();
  await waitFor(() => assert.ok(FakeEventSource.instances.length === 2));
  await openSystemTab("Control");

  FakeEventSource.instances[0].emit("ready", {});

  await waitFor(() => {
    assert.equal(
      requests.filter((request) => request.input.endsWith("/protocol/circuit-config/request")).length,
      1
    );
  });
});

test("requests and syncs controller date/time from the dashboard", async () => {
  const requests: Array<{ input: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      requests.push({ input, init });

      if (input.endsWith("/protocol/bundles")) {
        return response({ data: [], error: null });
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
                controller_hour_24: 14,
                controller_minute: 5
              }
            }
          ],
          error: null
        });
      }

      if (input.endsWith("/protocol/controller-datetime/request")) {
        return response({
          data: {
            command_id: "command-datetime-request",
            status: "accepted"
          },
          error: null
        });
      }

      if (input.endsWith("/protocol/controller-datetime/sync")) {
        return response({
          data: {
            command_id: "command-datetime-sync",
            status: "accepted"
          },
          error: null
        });
      }

      return platformStatusResponse();
    })
  );

  renderApp();
  await openSystemTab("Connectivity");

  await waitFor(() => assert.ok(screen.getByRole("button", { name: "Request controller date/time" })));

  fireEvent.click(screen.getByRole("button", { name: "Request controller date/time" }));
  await waitFor(() => {
    assert.ok(requests.some((request) => request.input.endsWith("/protocol/controller-datetime/request")));
    assert.ok(screen.getByText(/Controller date\/time request accepted/));
  });

  fireEvent.click(screen.getByRole("button", { name: "Sync controller date/time" }));
  await waitFor(() => {
    assert.ok(requests.some((request) => request.input.endsWith("/protocol/controller-datetime/sync")));
    assert.ok(screen.getByText(/Controller date\/time sync accepted as a provisional best-effort action/));
  });
});

test("automatically requests controller date/time once when 0x05 data is missing", async () => {
  const requests: Array<{ input: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      requests.push({ input, init });

      if (input.endsWith("/protocol/bundles")) {
        return response({ data: [], error: null });
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
                controller_hour_24: 14,
                controller_minute: 5
              }
            }
          ],
          error: null
        });
      }

      if (input.endsWith("/protocol/controller-datetime/request")) {
        return response({
          data: {
            command_id: "command-datetime-request-auto",
            status: "accepted"
          },
          error: null
        });
      }

      return platformStatusResponse();
    })
  );

  renderApp();
  await waitFor(() => assert.ok(FakeEventSource.instances.length === 2));
  await openSystemTab("Connectivity");

  FakeEventSource.instances[0].emit("ready", { client_id: "client-1" });

  await waitFor(() => {
    assert.equal(requests.filter((request) => request.input.endsWith("/protocol/controller-datetime/request")).length, 1);
    assert.ok(screen.getByText(/Controller date\/time request accepted/));
  });
});

test("tracks active controller date/time requests until a decoded reply is seen", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      if (input.endsWith("/protocol/bundles")) {
        return response({ data: [], error: null });
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
                controller_hour_24: 14,
                controller_minute: 5
              }
            }
          ],
          error: null
        });
      }

      if (input.endsWith("/protocol/controller-datetime/request")) {
        return response({
          data: {
            command_id: "command-datetime-track",
            status: "accepted"
          },
          error: null
        });
      }

      return platformStatusResponse();
    })
  );

  renderApp();
  await waitFor(() => assert.ok(FakeEventSource.instances.length === 2));
  await openSystemTab("Connectivity");
  await waitFor(() => assert.ok(screen.getByRole("button", { name: "Request controller date/time" })));

  fireEvent.click(screen.getByRole("button", { name: "Request controller date/time" }));
  await openDiagnostics();

  await waitFor(() => {
    assert.ok(screen.getByText("Active requests"));
    assert.ok(screen.getByText("Controller date/time request"));
    assert.ok(screen.getByText("Command command-datetime-track"));
    assert.ok(screen.getByText("Waiting for 0x05 controller date/time reply"));
  });

  FakeEventSource.instances[1].emit("protocol.frame.decoded", {
    message_type: "controller_datetime",
    action_code: "0x05",
    fields: {
      month: 4,
      day: 23,
      year: 26,
      hour_24: 14,
      minute: 37
    }
  });

  await waitFor(() => {
    assert.ok(screen.getByText("No active platform requests."));
  });
});

test("renders 0x05 date/time from the legacy mis-decoded reply shape", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      if (input.endsWith("/protocol/bundles")) {
        return response({ data: [], error: null });
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
                controller_datetime_reply: {
                  month: 18,
                  day: 34,
                  year: 16,
                  day_of_week: 23,
                  hour_24: 4,
                  minute: 26
                }
              }
            }
          ],
          error: null
        });
      }

      return platformStatusResponse();
    })
  );

  renderApp();
  await openSystemTab("Connectivity");

  await waitFor(() => {
    assert.ok(screen.getByText("04/23/26 18:34"));
  });
});

test("tracks active Remote Layout requests until command completion is seen", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      if (input.endsWith("/protocol/bundles")) {
        return response({ data: [], error: null });
      }

      if (input.endsWith("/equipment")) {
        return response({ data: [], error: null });
      }

      if (input.endsWith("/protocol/remote-layout/request") && init?.method === "POST") {
        return response({
          data: {
            command_id: "command-remote-layout-track",
            status: "accepted"
          },
          error: null
        });
      }

      return platformStatusResponse();
    })
  );

  renderApp();
  await waitFor(() => assert.ok(FakeEventSource.instances.length === 2));
  await openDiagnostics();

  fireEvent.click(screen.getByRole("button", { name: "Request page" }));

  await waitFor(() => {
    assert.ok(screen.getByText("Remote Layout page 0"));
    assert.ok(screen.getByText("Command command-remote-layout-track"));
    assert.ok(screen.getByText("Waiting for command completion"));
  });

  FakeEventSource.instances[0].emit("command.result", {
    command_id: "command-remote-layout-track",
    status: "completed",
    detail: "Remote Layout request completed."
  });

  await waitFor(() => {
    assert.ok(screen.getByText("No active platform requests."));
  });
});

test("requests one circuit configuration from Protocol Explorer and shows the matching reply", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      if (input.endsWith("/protocol/bundles")) {
        return response({ data: [], error: null });
      }

      if (input.endsWith("/equipment")) {
        return response({ data: [], error: null });
      }

      if (input.endsWith("/protocol/circuit-config/request") && init?.method === "POST") {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          start_index?: number;
          end_index?: number;
        };
        assert.equal(body.start_index, 4);
        assert.equal(body.end_index, 4);
        return response({
          data: {
            command_id: "command-circuit-config-4",
            status: "accepted"
          },
          error: null
        });
      }

      return platformStatusResponse();
    })
  );

  renderApp();
  await waitFor(() => assert.ok(FakeEventSource.instances.length === 2));
  await openDiagnostics();

  fireEvent.change(screen.getByLabelText("Circuit config index"), {
    target: { value: "4" }
  });
  fireEvent.click(screen.getByRole("button", { name: "Request circuit config" }));

  await waitFor(() => {
    assert.ok(screen.getByText("Circuit config index 4"));
    assert.ok(screen.getByText("Waiting for matching circuit_configuration reply"));
    assert.ok(screen.getByText(/Requested circuit config for index 4/));
  });

  FakeEventSource.instances[1].emit("protocol.frame.decoded", {
    message_type: "circuit_configuration",
    decoded_at: new Date(Date.now() + 1000).toISOString(),
    fields: {
      circuit_id: 4,
      function_id: 12,
      base_function_id: 12,
      base_function_label: "COLOR WHEEL",
      name_id: 47,
      name_label: "POOL LOW",
      freeze_flag: true,
      high_flag: false
    }
  });

  await waitFor(() => {
    assert.ok(screen.getByText("Circuit 4 configuration"));
    assert.ok(screen.getByText("Function 12 · COLOR WHEEL"));
    assert.ok(screen.getByText("Name 47 · POOL LOW"));
    assert.ok(screen.getByText("Freeze true · High false"));
    assert.ok(screen.getByText("Matched circuit_configuration reply for index 4."));
    assert.ok(screen.getByText("No active platform requests."));
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
                controller_hour_24: 14,
                controller_minute: 0,
                air_temp_f: 70,
                water_temp_f: 78,
                heater_enabled: false,
                mode: "pool",
                controller_mode_byte: 0x00,
                controller_mode_label: "idle",
                active_circuit_keys: ["pool"],
                circuits: {
                  pool: true,
                  spa: false,
                  aux1: false,
                  aux2: false,
                  aux3: false,
                  cleaner: false
                }
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

  renderApp();
  await waitFor(() => assert.ok(FakeEventSource.instances.length === 2));

  const source = FakeEventSource.instances[0];
  source.emit("pump.state", {
    rpm: 2900,
    running: true
  });
  source.emit("equipment.state", {
    controller_hour_24: 14,
    controller_minute: 5,
    heater_enabled: true,
    mode: "pool",
    controller_mode_byte: 0x09,
    controller_mode_label: "run + freeze protection",
    freeze_protection: true,
    active_circuit_keys: ["pool", "cleaner"],
    circuits: {
      pool: true,
      spa: false,
      aux1: false,
      cleaner: true
    }
  });
  source.emit("equipment.state", {
    salt_ppm: 3450
  });

  await openSystemTab("Hardware");

  await waitFor(() => {
    assert.ok(screen.getByText(/2900 RPM/));
    assert.ok(screen.getByText(/3450 ppm/));
  });

  await openSystemTab("Control");

  await waitFor(() => {
    assert.ok(screen.getAllByText("On").length > 0);
    assert.ok(screen.getAllByText("Pool").length > 0);
  });

  await openSystemTab("Connectivity");

  await waitFor(() => {
    assert.ok(screen.getAllByText("14:05").length > 0);
    assert.ok(screen.getByText("0x09"));
    assert.ok(screen.getByText("run + freeze protection"));
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

      if (input.endsWith("/platform/status")) {
        return platformStatusResponse();
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

  renderApp();
  await waitFor(() => assert.ok(FakeEventSource.instances.length === 2));
  await openSystemTab("Control");

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
    assert.ok(screen.getAllByText("Observed pump state matched the requested RPM.").length >= 1);
    assert.ok(screen.getByRole("button", { name: "Set pump speed" }));
  });
});

test("toggles a writable controller circuit pill without optimistic state changes", async () => {
  const requests: Array<{ input: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      requests.push({ input, init });

      if (input.endsWith("/protocol/bundles")) {
        return response({ data: [], error: null });
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
                updated_at: "2026-04-23T22:00:00Z",
                circuits: {
                  pool: true,
                  spa: false,
                  aux1: false
                }
              }
            }
          ],
          error: null
        });
      }

      if (input.includes("/equipment/controller-main/control")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          command_type?: string;
          circuit_key?: string | null;
          arguments?: { enabled?: boolean };
        };
        assert.equal(body.command_type, "set_circuit_state");
        assert.equal(body.circuit_key, "pool");
        assert.equal(body.arguments?.enabled, false);
        return response({
          data: {
            command_id: "command-circuit-toggle",
            status: "accepted"
          },
          error: null
        });
      }

      return response({
        status: "ok",
        error: null
      });
    })
  );

  renderApp();
  await waitFor(() => assert.ok(FakeEventSource.instances.length === 2));
  await openSystemTab("Control");

  const poolRow = screen.getByText("Pool").closest(".circuit-row");
  assert.ok(poolRow instanceof HTMLElement);

  const poolPill = within(poolRow).getByRole("button", { name: "On" });
  fireEvent.click(poolPill);

  await waitFor(() => {
    assert.ok(requests.some((request) => request.input.includes("/equipment/controller-main/control")));
    assert.ok(within(poolRow).getByRole("button", { name: "Pending..." }));
    assert.equal(within(poolRow).queryByText("Off"), null);
  });

  FakeEventSource.instances[0].emit("equipment.state", {
    updated_at: "2026-04-23T22:00:05Z",
    circuits: {
      pool: false,
      spa: false,
      aux1: false
    }
  });

  await waitFor(() => {
    assert.ok(within(poolRow).getByText("Off"));
  });
});

test("clears pending circuit toggle when controller SSE update arrives with occurred_at", async () => {
  const requests: Array<{ input: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      requests.push({ input, init });

      if (input.endsWith("/protocol/bundles")) {
        return response({ data: [], error: null });
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
                updated_at: "2026-04-24T12:00:00Z",
                circuits: {
                  pool: true,
                  spa: false,
                  aux1: false
                }
              }
            }
          ],
          error: null
        });
      }

      if (input.includes("/equipment/controller-main/control")) {
        return response({
          data: {
            command_id: "command-circuit-toggle-occurred-at",
            status: "accepted"
          },
          error: null
        });
      }

      return response({
        status: "ok",
        error: null
      });
    })
  );

  renderApp();
  await waitFor(() => assert.ok(FakeEventSource.instances.length === 2));
  await openSystemTab("Control");

  const poolRow = screen.getByText("Pool").closest(".circuit-row");
  assert.ok(poolRow instanceof HTMLElement);

  fireEvent.click(within(poolRow).getByRole("button", { name: "On" }));

  await waitFor(() => {
    assert.ok(requests.some((request) => request.input.includes("/equipment/controller-main/control")));
    assert.ok(within(poolRow).getByRole("button", { name: "Pending..." }));
  });

  FakeEventSource.instances[0].emit("equipment.state", {
    occurred_at: "2026-04-24T12:00:05Z",
    circuits: {
      pool: false,
      spa: false,
      aux1: false
    }
  });

  await waitFor(() => {
    assert.ok(within(poolRow).getByText("Off"));
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

      if (input.endsWith("/platform/status")) {
        return platformStatusResponse();
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

  renderApp();
  await waitFor(() => assert.ok(FakeEventSource.instances.length === 2));
  await openDiagnostics();
  await waitFor(() => assert.ok(screen.getByRole("button", { name: "Resume" })));
  fireEvent.click(screen.getByRole("button", { name: "Resume" }));

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
    assert.ok(screen.getAllByText(/COMMAND/).length >= 1);
    assert.ok(screen.getAllByText(/TX RAW/).length >= 1);
    assert.ok(screen.getAllByText(/ff00ffa5011021e1010001b9/).length >= 1);
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

      if (input.endsWith("/platform/status")) {
        return platformStatusResponse();
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

  renderApp();
  await waitFor(() => assert.ok(FakeEventSource.instances.length === 2));
  await openDiagnostics();

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

test("renders and filters the live message log component", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      if (input.endsWith("/equipment") && (!init || !init.method)) {
        return response({
          data: [],
          error: null
        });
      }

      if (input.endsWith("/platform/status")) {
        return platformStatusResponse();
      }

      if (input.endsWith("/protocol/bundles") && (!init || !init.method)) {
        return response({ data: [], error: null });
      }

      throw new Error(`Unhandled fetch call for ${input}`);
    })
  );

  renderApp();
  await waitFor(() => assert.ok(FakeEventSource.instances.length === 2));
  await openDiagnostics();

  await waitFor(() => {
    assert.ok(screen.getByText("Paused"));
    assert.ok(screen.getByRole("button", { name: "Resume" }));
  });

  fireEvent.click(screen.getByRole("button", { name: "Resume" }));

  FakeEventSource.instances[1].emit("protocol.frame.decoded", {
    action_code: "0x02",
    message_type: "controller_status",
    source: "controller",
    detail: "System status: All good",
    frame_id: "frame-1"
  });
  FakeEventSource.instances[1].emit("protocol.frame.decoded", {
    action_code: "0x05",
    message_type: "controller_datetime",
    source: "pump",
    detail: "RPM: 2100",
    frame_id: "frame-2"
  });

  await waitFor(() => {
    assert.ok(screen.getByText("Message Log (Live)"));
    assert.ok(screen.getByText("Streaming"));
    assert.ok(screen.getByText(/System status: All good/));
    assert.ok(screen.getByText(/RPM: 2100/));
    assert.ok(screen.getByText(/Messages per second:/));
  });

  fireEvent.change(screen.getByLabelText("Filter devices"), { target: { value: "Pump" } });

  await waitFor(() => {
    assert.equal(screen.queryByText(/System status: All good/), null);
    assert.ok(screen.getByText(/RPM: 2100/));
  });

  fireEvent.change(screen.getByLabelText("Filter devices"), { target: { value: "all" } });
  fireEvent.change(screen.getByLabelText("Filter message types"), { target: { value: "CONTROLLER DATETIME" } });

  await waitFor(() => {
    assert.equal(screen.queryByText(/System status: All good/), null);
    assert.ok(screen.getByText(/RPM: 2100/));
  });

  fireEvent.click(screen.getByRole("button", { name: "Pause" }));
  FakeEventSource.instances[1].emit("protocol.frame.decoded", {
    action_code: "0x11",
    message_type: "system_query",
    source: "controller",
    detail: "Request system status",
    frame_id: "frame-3"
  });

  await waitFor(() => {
    assert.ok(screen.getByText("Paused"));
    assert.equal(screen.queryByText(/Request system status/), null);
  });

  fireEvent.click(screen.getByRole("button", { name: "Clear" }));

  await waitFor(() => {
    assert.ok(screen.getByText("No protocol frames match the current filter."));
  });
});

function response(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => payload
  } as Response;
}
