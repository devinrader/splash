import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, test, vi, assert } from "vitest";
import { ChemistryPage } from "../src/pages/ChemistryPage";
import { useFrontendStore } from "../src/store";

class FakeEventSource {
  onerror: (() => void) | null = null;
  addEventListener(): void {}
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
  vi.stubGlobal("EventSource", FakeEventSource);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("chemistry page loads observations, maintenance, and additions and saves all workflows", async () => {
  const requests: string[] = [];
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const method = init?.method ?? (input instanceof Request ? input.method : undefined);

    requests.push(url);
    if (url.includes("/chemistry/history")) {
      return response({
        data: {
          start: "2026-05-04T00:00:00.000Z",
          end: "2026-06-03T00:00:00.000Z",
          interval: "1d",
          readings: [],
          series: []
        },
        error: null
      });
    }
    if (url.includes("/chemistry/observations") && (!method || method === "GET")) {
      return response({
        data: {
          start: null,
          end: null,
          limit: 10,
          observations: [
            {
              id: "observation-1",
              pool_id: "pool-1",
              clarity: "clear",
              algae_presence: "absent",
              debris_level: "light",
              bather_load_estimate: "moderate",
              notes: "After swim party",
              source: "manual",
              recorded_at: "2026-06-02T18:30:00.000Z",
              created_at: "2026-06-02T18:30:02.000Z"
            }
          ]
        },
        error: null
      });
    }
    if (url.endsWith("/chemistry/observations") && method === "POST") {
      const parsed = JSON.parse(init?.body as string) as Record<string, unknown>;
      assert.equal(parsed.clarity, "clear");
      assert.equal(parsed.algae_presence, "absent");
      assert.equal(parsed.debris_level, "light");
      assert.equal(parsed.bather_load_estimate, "moderate");
      assert.equal(parsed.notes, "After swim party");
      return response({
        data: {
          id: "observation-2",
          pool_id: "pool-1",
          clarity: "clear",
          algae_presence: "absent",
          debris_level: "light",
          bather_load_estimate: "moderate",
          notes: "After swim party",
          source: "manual",
          recorded_at: "2026-06-03T18:30:00.000Z",
          created_at: "2026-06-03T18:30:02.000Z"
        },
        error: null
      });
    }
    if (url.includes("/chemistry/maintenance") && (!method || method === "GET")) {
      return response({
        data: {
          start: null,
          end: null,
          limit: 10,
          activities: [
            {
              id: "activity-1",
              pool_id: "pool-1",
              activity_type: "brushed",
              notes: "Brushed after windy day",
              source: "manual",
              recorded_at: "2026-06-02T19:00:00.000Z",
              created_at: "2026-06-02T19:00:03.000Z"
            }
          ]
        },
        error: null
      });
    }
    if (url.endsWith("/chemistry/maintenance") && method === "POST") {
      const parsed = JSON.parse(init?.body as string) as Record<string, unknown>;
      assert.equal(parsed.activity_type, "brushed");
      assert.equal(parsed.notes, "Brushed after windy day");
      return response({
        data: {
          id: "activity-2",
          pool_id: "pool-1",
          activity_type: "brushed",
          notes: "Brushed after windy day",
          source: "manual",
          recorded_at: "2026-06-03T19:00:00.000Z",
          created_at: "2026-06-03T19:00:03.000Z"
        },
        error: null
      });
    }
    if (url.includes("/chemistry/additions") && (!method || method === "GET")) {
      return response({
        data: {
          start: null,
          end: null,
          limit: 10,
          additions: [
            {
              id: "addition-1",
              pool_id: "pool-1",
              chemical_type: "liquid_chlorine",
              amount: 1.5,
              unit: "gal",
              notes: "After storm",
              source: "manual",
              recorded_at: "2026-06-02T19:30:00.000Z",
              created_at: "2026-06-02T19:30:03.000Z"
            }
          ]
        },
        error: null
      });
    }
    if (url.endsWith("/chemistry/additions") && method === "POST") {
      const parsed = JSON.parse(init?.body as string) as Record<string, unknown>;
      assert.equal(parsed.chemical_type, "liquid_chlorine");
      assert.equal(parsed.amount, 1.5);
      assert.equal(parsed.unit, "gal");
      assert.equal(parsed.notes, "After storm");
      return response({
        data: {
          id: "addition-2",
          pool_id: "pool-1",
          chemical_type: "liquid_chlorine",
          amount: 1.5,
          unit: "gal",
          notes: "After storm",
          source: "manual",
          recorded_at: "2026-06-03T19:30:00.000Z",
          created_at: "2026-06-03T19:30:03.000Z"
        },
        error: null
      });
    }
    throw new Error(`Unexpected fetch: ${method ?? "GET"} ${url}`);
  });

  vi.stubGlobal("fetch", fetchMock);

  render(<ChemistryPage />);

  await waitFor(() => {
    assert.ok(screen.getByText("Water Condition"));
    assert.ok(screen.getByText("Maintenance Activity"));
    assert.ok(screen.getByText("Chemical Additions"));
  });

  await waitFor(() => {
    assert.ok(requests.some((entry) => entry.includes("/chemistry/observations")));
    assert.ok(requests.some((entry) => entry.includes("/chemistry/maintenance")));
    assert.ok(requests.some((entry) => entry.includes("/chemistry/additions")));
  });

  fireEvent.change(screen.getByLabelText("Water Clarity"), { target: { value: "clear" } });
  fireEvent.change(screen.getByLabelText("Algae Presence"), { target: { value: "absent" } });
  fireEvent.change(screen.getByLabelText("Debris Level"), { target: { value: "light" } });
  fireEvent.change(screen.getByLabelText("Bather Load Estimate"), { target: { value: "moderate" } });
  fireEvent.change(screen.getByLabelText("Condition Notes"), { target: { value: "After swim party" } });
  fireEvent.click(screen.getByRole("button", { name: "Save water condition" }));

  await waitFor(() => {
    assert.ok(screen.getByText("Water condition saved."));
  });

  fireEvent.change(screen.getByLabelText("Maintenance Notes"), { target: { value: "Brushed after windy day" } });
  fireEvent.click(screen.getByRole("button", { name: "Save maintenance activity" }));

  await waitFor(() => {
    assert.ok(screen.getByText("Maintenance activity saved."));
  });

  fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "1.5" } });
  fireEvent.change(screen.getByLabelText("Addition Notes"), { target: { value: "After storm" } });
  fireEvent.click(screen.getByRole("button", { name: "Save chemical addition" }));

  await waitFor(() => {
    assert.ok(screen.getByText("Chemical addition saved."));
  });

  const observationListRequests = requests.filter((entry) => entry.includes("/chemistry/observations"));
  assert.ok(observationListRequests.length >= 3);
  const maintenanceListRequests = requests.filter((entry) => entry.includes("/chemistry/maintenance"));
  assert.ok(maintenanceListRequests.length >= 3);
  const additionListRequests = requests.filter((entry) => entry.includes("/chemistry/additions"));
  assert.ok(additionListRequests.length >= 3);
});

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json"
    }
  });
}
