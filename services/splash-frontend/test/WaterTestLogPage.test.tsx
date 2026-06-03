import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, test, vi, assert } from "vitest";
import App from "../src/App";
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

test("water test log page loads latest/history and saves a chemistry reading", async () => {
  const requests: string[] = [];
  const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    requests.push(typeof input === "string" ? input : String(input));
    if (input.endsWith("/equipment")) {
      return response({ data: [], error: null });
    }
    if (input.endsWith("/platform/status")) {
      return response({ overall: "healthy", generatedAt: "2026-06-03T18:00:00.000Z", connectivity: {}, services: [] });
    }
    if (input.endsWith("/chemistry/latest")) {
      return response({
        data: {
          id: "reading-1",
          pool_id: "pool-1",
          ph: 7.5,
          free_chlorine: 5.8,
          total_alkalinity: 90,
          calcium_hardness: 260,
          cyanuric_acid: 70,
          salt_level: 3100,
          rainfall_inches: 0.25,
          source: "manual",
          recorded_at: "2026-06-02T19:30:00.000Z",
          created_at: "2026-06-02T19:30:03.000Z"
        },
        error: null
      });
    }
    if (input.includes("/chemistry/history")) {
      return response({
        data: {
          start: "2026-05-04T00:00:00.000Z",
          end: "2026-06-03T00:00:00.000Z",
          interval: "1d",
          readings: [
            {
              id: "reading-1",
              pool_id: "pool-1",
              ph: 7.5,
              free_chlorine: 5.8,
              total_alkalinity: 90,
              calcium_hardness: 260,
              cyanuric_acid: 70,
              salt_level: 3100,
              rainfall_inches: 0.25,
              source: "manual",
              recorded_at: "2026-06-02T19:30:00.000Z",
              created_at: "2026-06-02T19:30:03.000Z"
            }
          ],
          series: [
            { metric: "ph", points: [{ recorded_at: "2026-06-02T19:30:00.000Z", value: 7.5 }] },
            { metric: "free_chlorine", points: [{ recorded_at: "2026-06-02T19:30:00.000Z", value: 5.8 }] },
            { metric: "salt_level", points: [{ recorded_at: "2026-06-02T19:30:00.000Z", value: 3100 }] }
          ]
        },
        error: null
      });
    }
    if (input.endsWith("/chemistry") && init?.method === "POST") {
      const parsed = JSON.parse(init.body as string) as Record<string, unknown>;
      assert.equal(parsed.ph, 7.4);
      assert.equal(parsed.free_chlorine, 5.4);
      return response({
        data: {
          reading: {
            id: "reading-2",
            pool_id: "pool-1",
            ph: 7.4,
            free_chlorine: 5.4,
            total_alkalinity: null,
            calcium_hardness: null,
            cyanuric_acid: null,
            salt_level: null,
            rainfall_inches: null,
            source: "manual",
            recorded_at: "2026-06-03T19:30:00.000Z",
            created_at: "2026-06-03T19:30:03.000Z"
          },
          warnings: []
        },
        error: null
      });
    }
    throw new Error(`Unexpected fetch: ${input}`);
  });

  vi.stubGlobal("fetch", fetchMock);

  render(
    <MemoryRouter initialEntries={["/water-test-log"]}>
      <App />
    </MemoryRouter>
  );

  await waitFor(() => {
    assert.ok(screen.getByText("Chemistry Entries"));
    assert.ok(screen.getByText("5.8 ppm"));
    assert.ok(screen.getByRole("img", { name: "pH history chart" }));
    assert.ok(screen.getByRole("img", { name: "Free Chlorine history chart" }));
    assert.ok(screen.getByRole("img", { name: "Salt history chart" }));
  });

  fireEvent.change(screen.getByLabelText("pH"), { target: { value: "7.4" } });
  fireEvent.change(screen.getByLabelText("Free Chlorine (ppm)"), { target: { value: "5.4" } });
  fireEvent.click(screen.getByRole("button", { name: "Save chemistry reading" }));

  await waitFor(() => {
    assert.ok(screen.getByText("Chemistry reading saved."));
  });

  const chemistryLatestRequests = requests.filter((entry) => entry.endsWith("/chemistry/latest"));
  const chemistryHistoryRequests = requests.filter((entry) => entry.includes("/chemistry/history"));
  assert.ok(chemistryLatestRequests.length >= 2);
  assert.ok(chemistryHistoryRequests.length >= 2);
});

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json"
    }
  });
}
