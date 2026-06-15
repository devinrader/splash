import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, test, vi, assert } from "vitest";
import App from "../src/App";
import { useFrontendStore } from "../src/store";

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
});

function renderMobileApp(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <App />
    </MemoryRouter>
  );
}

test("mobile dashboard renders current swimmability", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      if (input.endsWith("/swimmability")) {
        return response({
          data: {
            status: "good",
            score: 92,
            summary: "Water is in range and ready.",
            headline: "Ready to Swim",
            confidence: "high",
            last_chemistry_age_label: "2 hours ago",
            highlights: [],
            updated_at: "2026-06-13T12:00:00.000Z",
            drivers: [
              { key: "free_chlorine", severity: "good", message: "Free chlorine is in range." },
              { key: "ph", severity: "good", message: "pH is in range." }
            ],
            inputs: {
              chemistry_latest_at: "2026-06-13T10:00:00.000Z",
              cover_latest_at: "2026-06-13T11:00:00.000Z",
              forecast_fetched_at: "2026-06-13T09:00:00.000Z",
              telemetry_latest_at: "2026-06-13T11:45:00.000Z"
            }
          },
          error: null
        });
      }
      if (input.endsWith("/pool/cover")) {
        return response({
          data: {
            current: {
              id: "cover-1",
              pool_id: "pool-1",
              state: "on",
              cover_type: "solar",
              source: "manual",
              recorded_at: "2026-06-13T11:00:00.000Z",
              created_at: "2026-06-13T11:00:03.000Z"
            }
          },
          error: null
        });
      }
      if (input.includes("/notifications")) {
        return response({
          data: {
            status: "all",
            limit: 6,
            notifications: [
              {
                id: "notification-1",
                pool_id: "pool-1",
                type: "swimmability_caution",
                category: "alert",
                severity: "warning",
                title: "Retest soon",
                body: "Chemistry is aging.",
                read: false,
                source: "system",
                related_entity_type: null,
                related_entity_id: null,
                created_at: "2026-06-13T11:30:00.000Z",
                read_at: null,
                acknowledged_at: null,
                resolved_at: null,
                resolution_source: null
              }
            ]
          },
          error: null
        });
      }
      throw new Error(`Unexpected fetch: ${input}`);
    })
  );

  renderMobileApp("/mobile");

  await waitFor(() => {
    assert.ok(screen.getByText("Splash Mobile"));
    assert.ok(screen.getByText("92"));
    assert.ok(screen.getByText("Ready to Swim"));
    assert.ok(screen.getByText("Free chlorine is in range."));
    assert.ok(screen.getByText("Retest soon"));
  });
});

test("mobile chemistry form submits valid values", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      if (input.endsWith("/chemistry") && init?.method === "POST") {
        const parsed = JSON.parse(init.body as string) as Record<string, unknown>;
        assert.equal(parsed.free_chlorine, 5.2);
        assert.equal(parsed.total_chlorine, 5.4);
        assert.equal(parsed.ph, 7.6);
        assert.equal(parsed.total_alkalinity, 90);
        assert.equal(parsed.cyanuric_acid, 40);
        assert.equal(parsed.calcium_hardness, 275);
        return response({
          data: {
            reading: {
              id: "reading-1",
              pool_id: "pool-1",
              ph: 7.6,
              free_chlorine: 5.2,
              total_chlorine: 5.4,
              total_alkalinity: 90,
              calcium_hardness: 275,
              cyanuric_acid: 40,
              source: "manual",
              recorded_at: "2026-06-13T12:00:00.000Z",
              created_at: "2026-06-13T12:00:03.000Z"
            },
            warnings: []
          },
          error: null
        }, 201);
      }
      throw new Error(`Unexpected fetch: ${input}`);
    })
  );

  renderMobileApp("/mobile/chemistry/new");

  fireEvent.change(screen.getByLabelText("Free Chlorine"), { target: { value: "5.2" } });
  fireEvent.change(screen.getByLabelText("Total Chlorine"), { target: { value: "5.4" } });
  fireEvent.change(screen.getByLabelText("pH"), { target: { value: "7.6" } });
  fireEvent.change(screen.getByLabelText("Total Alkalinity"), { target: { value: "90" } });
  fireEvent.change(screen.getByLabelText("CYA"), { target: { value: "40" } });
  fireEvent.change(screen.getByLabelText("Calcium Hardness"), { target: { value: "275" } });
  fireEvent.click(screen.getByRole("button", { name: "Save Test" }));

  await waitFor(() => {
    assert.ok(screen.getByText("Chemistry reading saved."));
  });
});

test("mobile cover control calls the existing cover API", async () => {
  const requests: Array<{ input: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      requests.push({ input, init });
      if (input.endsWith("/pool/cover") && (!init || !init.method)) {
        const posted = requests.some((entry) => entry.input.endsWith("/pool/cover") && entry.init?.method === "POST");
        return response({
          data: {
            current: posted
              ? {
                  id: "cover-2",
                  pool_id: "pool-1",
                  state: "on",
                  cover_type: "safety",
                  source: "manual",
                  recorded_at: "2026-06-13T12:00:00.000Z",
                  created_at: "2026-06-13T12:00:03.000Z"
                }
              : null
          },
          error: null
        });
      }
      if (input.endsWith("/pool/cover") && init?.method === "POST") {
        const parsed = JSON.parse(init.body as string) as Record<string, unknown>;
        assert.equal(parsed.state, "on");
        assert.equal(parsed.cover_type, "safety");
        return response({
          data: {
            id: "cover-2",
            pool_id: "pool-1",
            state: "on",
            cover_type: "safety",
            source: "manual",
            recorded_at: "2026-06-13T12:00:00.000Z",
            created_at: "2026-06-13T12:00:03.000Z"
          },
          error: null
        }, 201);
      }
      throw new Error(`Unexpected fetch: ${input}`);
    })
  );

  renderMobileApp("/mobile/cover");

  fireEvent.change(screen.getByLabelText("Cover Type"), { target: { value: "safety" } });
  fireEvent.click(screen.getByRole("button", { name: "Mark Covered" }));

  await waitFor(() => {
    assert.ok(screen.getByText("Cover marked covered."));
  });
});

test("mobile alerts screen renders active alerts first", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      if (input.includes("/notifications")) {
        return response({
          data: {
            status: "all",
            limit: 20,
            notifications: [
              {
                id: "notification-2",
                pool_id: "pool-1",
                type: "chemistry_test_due",
                category: "action_item",
                severity: "info",
                title: "Test due",
                body: "Time to retest.",
                read: true,
                source: "system",
                related_entity_type: null,
                related_entity_id: null,
                created_at: "2026-06-13T10:00:00.000Z",
                read_at: "2026-06-13T10:15:00.000Z",
                acknowledged_at: null,
                resolved_at: null,
                resolution_source: null
              },
              {
                id: "notification-1",
                pool_id: "pool-1",
                type: "swimmability_poor",
                category: "action_item",
                severity: "critical",
                title: "Do not swim",
                body: "Free chlorine is too low.",
                read: false,
                source: "system",
                related_entity_type: null,
                related_entity_id: null,
                created_at: "2026-06-13T11:00:00.000Z",
                read_at: null,
                acknowledged_at: null,
                resolved_at: null,
                resolution_source: null
              }
            ]
          },
          error: null
        });
      }
      if (input.endsWith("/notifications/read-all")) {
        return response({ data: { updated_count: 2 }, error: null });
      }
      throw new Error(`Unexpected fetch: ${input}`);
    })
  );

  renderMobileApp("/mobile/alerts");

  await waitFor(() => {
    const items = screen.getAllByRole("listitem");
    assert.ok(items[0]?.textContent?.includes("Do not swim"));
    assert.ok(items[1]?.textContent?.includes("Test due"));
  });
});

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json"
    }
  });
}
