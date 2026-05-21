import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, test, vi, assert } from "vitest";
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

test("settings page loads and saves weather location and pool chemistry settings", async () => {
  const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    if (input.endsWith("/equipment")) {
      return response({ data: [], error: null });
    }
    if (input.endsWith("/platform/status")) {
      return response({ overall: "healthy", generatedAt: "2026-05-18T18:00:00.000Z", connectivity: {}, services: [] });
    }
    if (input.endsWith("/api/settings/weather-location") && (!init || init.method === undefined)) {
      return response({
        data: {
          poolId: "pool-1",
          locationMode: "address",
          addressLine1: "123 Main St",
          addressLine2: "",
          city: "Gastonia",
          stateRegion: "NC",
          postalCode: "28054",
          country: "US",
          latitude: null,
          longitude: null,
          timezone: null,
          geocodedLatitude: null,
          geocodedLongitude: null,
          geocodeProvider: null,
          geocodedAt: null,
          locationStatus: "requires_geocoding"
        },
        error: null
      });
    }
    if (input.endsWith("/api/settings/pool-chemistry") && (!init || init.method === undefined)) {
      return response({
        data: {
          settings: [
            {
              chemicalKey: "free_chlorine",
              displayName: "Free Chlorine",
              unit: "ppm",
              minimum: 3,
              target: 5,
              maximum: 10,
              enabled: true,
              sortOrder: 10
            },
            {
              chemicalKey: "ph",
              displayName: "pH",
              unit: null,
              minimum: 7.2,
              target: 7.6,
              maximum: 7.8,
              enabled: true,
              sortOrder: 30
            }
          ],
          source: "postgres"
        },
        error: null
      });
    }
    if (input.endsWith("/api/settings/weather-location") && init?.method === "PUT") {
      const parsed = JSON.parse(init.body as string) as Record<string, unknown>;
      assert.equal(parsed.locationMode, "coordinates");
      assert.equal(parsed.latitude, 35.2621);
      assert.equal(parsed.longitude, -81.1873);
      return response({
        data: {
          poolId: "pool-1",
          locationMode: "coordinates",
          addressLine1: null,
          addressLine2: null,
          city: null,
          stateRegion: null,
          postalCode: null,
          country: null,
          latitude: 35.2621,
          longitude: -81.1873,
          timezone: "America/New_York",
          geocodedLatitude: null,
          geocodedLongitude: null,
          geocodeProvider: null,
          geocodedAt: null,
          locationStatus: "resolved"
        },
        error: null
      });
    }
    if (input.endsWith("/api/settings/pool-chemistry") && init?.method === "PUT") {
      const parsed = JSON.parse(init.body as string) as { settings: Array<Record<string, unknown>> };
      const freeChlorine = parsed.settings.find((entry) => entry.chemicalKey === "free_chlorine");
      assert.ok(freeChlorine);
      assert.equal(freeChlorine.target, 6);
      return response({
        data: {
          settings: [
            {
              chemicalKey: "free_chlorine",
              displayName: "Free Chlorine",
              unit: "ppm",
              minimum: 3,
              target: 6,
              maximum: 10,
              enabled: true,
              sortOrder: 10
            },
            {
              chemicalKey: "ph",
              displayName: "pH",
              unit: null,
              minimum: 7.2,
              target: 7.6,
              maximum: 7.8,
              enabled: true,
              sortOrder: 30
            }
          ],
          source: "postgres"
        },
        error: null
      });
    }
    throw new Error(`Unexpected fetch: ${input}`);
  });

  vi.stubGlobal("fetch", fetchMock);

  render(
    <MemoryRouter initialEntries={["/settings"]}>
      <App />
    </MemoryRouter>
  );

  await waitFor(() => {
    const addressInput = screen.getByLabelText("Address line 1") as HTMLInputElement;
    assert.equal(addressInput.value, "123 Main St");
    const freeChlorineTarget = screen.getByLabelText("Free Chlorine target") as HTMLInputElement;
    assert.equal(freeChlorineTarget.value, "5");
  });

  const coordinateLabel = screen.getByText("Use latitude/longitude").closest("label");
  assert.ok(coordinateLabel);
  fireEvent.click(coordinateLabel);
  fireEvent.change(screen.getByLabelText("Latitude"), { target: { value: "35.2621" } });
  fireEvent.change(screen.getByLabelText("Longitude"), { target: { value: "-81.1873" } });
  fireEvent.change(screen.getByLabelText("Timezone"), { target: { value: "America/New_York" } });
  fireEvent.click(screen.getByRole("button", { name: "Save weather location" }));

  await waitFor(() => {
    assert.ok(screen.getByText("Weather location settings saved."));
  });

  fireEvent.change(screen.getByLabelText("Free Chlorine target"), { target: { value: "6" } });
  fireEvent.click(screen.getByRole("button", { name: "Save pool chemistry" }));

  await waitFor(() => {
    assert.ok(screen.getByText("Pool chemistry settings saved."));
    const freeChlorineTarget = screen.getByLabelText("Free Chlorine target") as HTMLInputElement;
    assert.equal(freeChlorineTarget.value, "6");
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
