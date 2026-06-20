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

test("settings page loads and saves weather location and swimmability policy settings", async () => {
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
          formattedAddress: null,
          geocodeProvider: null,
          geocodedAt: null,
          activeGeocodingProviderId: "geoapify",
          locationStatus: "requires_geocoding"
        },
        error: null
      });
    }
    if (input.endsWith("/api/settings/geocoding") && (!init || init.method === undefined)) {
      return response({
        data: {
          activeProviderId: "geoapify",
          activeProviderAvailable: true,
          activeProviderUnavailableReason: null,
          providers: [
            {
              id: "geoapify",
              displayName: "Geoapify",
              description: "Street-address geocoding via Geoapify.",
              configurationRequirements: ["api_key"],
              configFields: [
                {
                  key: "api_key",
                  label: "API Key",
                  description: "Geoapify API key used for geocoding requests.",
                  type: "password",
                  required: true,
                  secret: true,
                  placeholder: "Enter Geoapify API key",
                  configured: true,
                  value: null
                },
                {
                  key: "base_url",
                  label: "Base URL",
                  description: "Override the Geoapify geocoding API base URL when needed.",
                  type: "url",
                  required: true,
                  secret: false,
                  placeholder: "https://api.geoapify.com/v1",
                  configured: true,
                  value: "https://api.geoapify.com/v1"
                }
              ],
              available: true,
              unavailableReason: null
            },
            {
              id: "openstreetmap",
              displayName: "OpenStreetMap / Nominatim",
              description: "Street-address geocoding via Nominatim. Public endpoints are low-volume only.",
              configurationRequirements: ["user_agent"],
              configFields: [
                {
                  key: "base_url",
                  label: "Base URL",
                  description: "Override the Nominatim base URL for self-hosted or alternate deployments.",
                  type: "url",
                  required: true,
                  secret: false,
                  placeholder: "https://nominatim.openstreetmap.org",
                  configured: true,
                  value: "https://nominatim.openstreetmap.org"
                },
                {
                  key: "user_agent",
                  label: "User-Agent",
                  description: "Required user-agent string for Nominatim requests.",
                  type: "text",
                  required: true,
                  secret: false,
                  placeholder: "Splash/1.0 (ops@example.test)",
                  configured: false,
                  value: ""
                },
                {
                  key: "email",
                  label: "Contact Email",
                  description: "Optional contact email appended to Nominatim requests.",
                  type: "email",
                  required: false,
                  secret: false,
                  placeholder: "ops@example.test",
                  configured: false,
                  value: ""
                }
              ],
              available: false,
              unavailableReason: "user_agent is required."
            }
          ]
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
              sortOrder: 10,
              source_mode: "manual",
              source_binding: null,
              available_sources: []
            },
            {
              chemicalKey: "total_chlorine",
              displayName: "Total Chlorine",
              unit: "ppm",
              minimum: 3,
              target: 5,
              maximum: 10,
              enabled: true,
              sortOrder: 20,
              source_mode: "manual",
              source_binding: null,
              available_sources: []
            },
            {
              chemicalKey: "ph",
              displayName: "pH",
              unit: null,
              minimum: 7.2,
              target: 7.6,
              maximum: 7.8,
              enabled: true,
              sortOrder: 30,
              source_mode: "manual",
              source_binding: null,
              available_sources: []
            },
            {
              chemicalKey: "water_temperature",
              displayName: "Water Temperature",
              unit: "F",
              minimum: 70,
              target: 84,
              maximum: 92,
              enabled: true,
              sortOrder: 80,
              source_mode: "hardware",
              source_binding: {
                provider_type: "controller",
                provider_id: "controller-1",
                measurement_key: "water_temperature"
              },
              available_sources: [
                {
                  provider_type: "controller",
                  provider_id: "controller-1",
                  measurement_key: "water_temperature",
                  label: "EasyTouch Controller Water Temperature"
                }
              ]
            }
          ],
          chemistry_prompt_interval_days: 3,
          source: "sqlite"
        },
        error: null
      });
    }
    if (input.endsWith("/api/settings/water-testing-schedule") && (!init || init.method === undefined)) {
      return response({
        data: {
          items: [
            {
              chemicalKey: "free_chlorine",
              displayName: "Free Chlorine",
              enabled: true,
              expectedIntervalValue: 3,
              expectedIntervalUnit: "days",
              staleThresholdValue: 3,
              staleThresholdUnit: "days",
              unavailableThresholdValue: 7,
              unavailableThresholdUnit: "days",
              status: "stale",
              lastObservedAt: "2026-05-28T18:45:00.000Z",
              updatedAt: "2026-06-05T12:00:00.000Z"
            },
            {
              chemicalKey: "water_temperature",
              displayName: "Water Temperature",
              enabled: true,
              expectedIntervalValue: 1,
              expectedIntervalUnit: "hours",
              staleThresholdValue: 1,
              staleThresholdUnit: "hours",
              unavailableThresholdValue: 1,
              unavailableThresholdUnit: "hours",
              status: "current",
              lastObservedAt: "2026-06-05T17:45:00.000Z",
              updatedAt: "2026-06-05T12:00:00.000Z"
            }
          ],
          source: "sqlite"
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
          formattedAddress: null,
          geocodeProvider: null,
          geocodedAt: null,
          activeGeocodingProviderId: "geoapify",
          locationStatus: "resolved"
        },
        error: null
      });
    }
    if (input.endsWith("/api/settings/geocoding") && init?.method === "PUT") {
      const parsed = JSON.parse(init.body as string) as Record<string, unknown>;
      assert.equal(parsed.activeProviderId, "geoapify");
      return response({
        data: {
          activeProviderId: "geoapify",
          activeProviderAvailable: true,
          activeProviderUnavailableReason: null,
          providers: [
            {
              id: "geoapify",
              displayName: "Geoapify",
              description: "Street-address geocoding via Geoapify.",
              configurationRequirements: ["api_key"],
              configFields: [
                {
                  key: "api_key",
                  label: "API Key",
                  description: "Geoapify API key used for geocoding requests.",
                  type: "password",
                  required: true,
                  secret: true,
                  placeholder: "Enter Geoapify API key",
                  configured: true,
                  value: null
                },
                {
                  key: "base_url",
                  label: "Base URL",
                  description: "Override the Geoapify geocoding API base URL when needed.",
                  type: "url",
                  required: true,
                  secret: false,
                  placeholder: "https://api.geoapify.com/v1",
                  configured: true,
                  value: "https://api.geoapify.com/v1"
                }
              ],
              available: true,
              unavailableReason: null
            },
            {
              id: "openstreetmap",
              displayName: "OpenStreetMap / Nominatim",
              description: "Street-address geocoding via Nominatim. Public endpoints are low-volume only.",
              configurationRequirements: ["user_agent"],
              configFields: [
                {
                  key: "base_url",
                  label: "Base URL",
                  description: "Override the Nominatim base URL for self-hosted or alternate deployments.",
                  type: "url",
                  required: true,
                  secret: false,
                  placeholder: "https://nominatim.openstreetmap.org",
                  configured: true,
                  value: "https://nominatim.openstreetmap.org"
                },
                {
                  key: "user_agent",
                  label: "User-Agent",
                  description: "Required user-agent string for Nominatim requests.",
                  type: "text",
                  required: true,
                  secret: false,
                  placeholder: "Splash/1.0 (ops@example.test)",
                  configured: false,
                  value: ""
                },
                {
                  key: "email",
                  label: "Contact Email",
                  description: "Optional contact email appended to Nominatim requests.",
                  type: "email",
                  required: false,
                  secret: false,
                  placeholder: "ops@example.test",
                  configured: false,
                  value: ""
                }
              ],
              available: false,
              unavailableReason: "user_agent is required."
            }
          ]
        },
        error: null
      });
    }
    if (input.endsWith("/api/settings/geocoding/provider/geoapify") && init?.method === "PUT") {
      const parsed = JSON.parse(init.body as string) as { config: Record<string, string> };
      assert.equal(parsed.config.base_url, "https://api.geoapify.com/v1");
      return response({
        data: {
          activeProviderId: "geoapify",
          activeProviderAvailable: true,
          activeProviderUnavailableReason: null,
          providers: [
            {
              id: "geoapify",
              displayName: "Geoapify",
              description: "Street-address geocoding via Geoapify.",
              configurationRequirements: ["api_key"],
              configFields: [
                {
                  key: "api_key",
                  label: "API Key",
                  description: "Geoapify API key used for geocoding requests.",
                  type: "password",
                  required: true,
                  secret: true,
                  placeholder: "Enter Geoapify API key",
                  configured: true,
                  value: null
                },
                {
                  key: "base_url",
                  label: "Base URL",
                  description: "Override the Geoapify geocoding API base URL when needed.",
                  type: "url",
                  required: true,
                  secret: false,
                  placeholder: "https://api.geoapify.com/v1",
                  configured: true,
                  value: "https://api.geoapify.com/v1"
                }
              ],
              available: true,
              unavailableReason: null
            },
            {
              id: "openstreetmap",
              displayName: "OpenStreetMap / Nominatim",
              description: "Street-address geocoding via Nominatim. Public endpoints are low-volume only.",
              configurationRequirements: ["user_agent"],
              configFields: [
                {
                  key: "base_url",
                  label: "Base URL",
                  description: "Override the Nominatim base URL for self-hosted or alternate deployments.",
                  type: "url",
                  required: true,
                  secret: false,
                  placeholder: "https://nominatim.openstreetmap.org",
                  configured: true,
                  value: "https://nominatim.openstreetmap.org"
                },
                {
                  key: "user_agent",
                  label: "User-Agent",
                  description: "Required user-agent string for Nominatim requests.",
                  type: "text",
                  required: true,
                  secret: false,
                  placeholder: "Splash/1.0 (ops@example.test)",
                  configured: false,
                  value: ""
                },
                {
                  key: "email",
                  label: "Contact Email",
                  description: "Optional contact email appended to Nominatim requests.",
                  type: "email",
                  required: false,
                  secret: false,
                  placeholder: "ops@example.test",
                  configured: false,
                  value: ""
                }
              ],
              available: false,
              unavailableReason: "user_agent is required."
            }
          ]
        },
        error: null
      });
    }
    if (input.endsWith("/api/settings/pool-chemistry") && init?.method === "PUT") {
      const parsed = JSON.parse(init.body as string) as { settings: Array<Record<string, unknown>>; chemistry_prompt_interval_days?: number };
      const freeChlorine = parsed.settings.find((entry) => entry.chemicalKey === "free_chlorine");
      assert.ok(freeChlorine);
      assert.equal(freeChlorine.target, 6);
      assert.equal(parsed.chemistry_prompt_interval_days, 4);
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
              sortOrder: 10,
              source_mode: "manual",
              source_binding: null,
              available_sources: []
            },
            {
              chemicalKey: "total_chlorine",
              displayName: "Total Chlorine",
              unit: "ppm",
              minimum: 3,
              target: 5,
              maximum: 10,
              enabled: true,
              sortOrder: 20,
              source_mode: "manual",
              source_binding: null,
              available_sources: []
            },
            {
              chemicalKey: "ph",
              displayName: "pH",
              unit: null,
              minimum: 7.2,
              target: 7.6,
              maximum: 7.8,
              enabled: true,
              sortOrder: 30,
              source_mode: "manual",
              source_binding: null,
              available_sources: []
            },
            {
              chemicalKey: "water_temperature",
              displayName: "Water Temperature",
              unit: "F",
              minimum: 70,
              target: 84,
              maximum: 92,
              enabled: true,
              sortOrder: 80,
              source_mode: "hardware",
              source_binding: {
                provider_type: "controller",
                provider_id: "controller-1",
                measurement_key: "water_temperature"
              },
              available_sources: [
                {
                  provider_type: "controller",
                  provider_id: "controller-1",
                  measurement_key: "water_temperature",
                  label: "EasyTouch Controller Water Temperature"
                }
              ]
            }
          ],
          chemistry_prompt_interval_days: 4,
          source: "sqlite"
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
    const geocodingProvider = screen.getByLabelText("Active geocoding provider") as HTMLSelectElement;
    assert.equal(geocodingProvider.value, "geoapify");
    const waterTemperatureSource = screen.getByLabelText("Water Temperature source") as HTMLSelectElement;
    assert.equal(waterTemperatureSource.value, "hardware:controller:controller-1:water_temperature");
    assert.ok(screen.getByText("Water Testing Schedule"));
  });

  fireEvent.click(screen.getByRole("button", { name: "Save Geoapify config" }));

  await waitFor(() => {
    assert.ok(screen.getByText("Geoapify configuration saved."));
  });

  fireEvent.click(screen.getByRole("button", { name: "Save geocoding provider" }));

  await waitFor(() => {
    assert.ok(screen.getByText("Geocoding provider settings saved."));
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
  fireEvent.change(screen.getByLabelText("Chemistry prompt interval (days)"), { target: { value: "4" } });
  fireEvent.click(screen.getByRole("button", { name: "Save swimmability policy" }));

  await waitFor(() => {
    assert.ok(screen.getByText("Swimmability policy saved."));
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
