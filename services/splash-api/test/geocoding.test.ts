import assert from "node:assert/strict";
import test from "node:test";
import { createGeocodingProviderRegistry } from "../src/geocoding.js";
import { GeocodingSettingsService } from "../src/geocoding-settings.js";

test("geocoding registry reports provider availability from bootstrap configuration", () => {
  const registry = createGeocodingProviderRegistry({
    geoapifyApiKey: null,
    geoapifyBaseUrl: "https://api.geoapify.com/v1",
    osmBaseUrl: "https://nominatim.openstreetmap.org",
    osmUserAgent: "Splash/1.0 (dev@example.test)",
    osmEmail: null
  });

  const providers = registry.listProviders();
  assert.deepEqual(
    providers.map((provider) => ({
      id: provider.id,
      available: provider.available
    })),
    [
      { id: "geoapify", available: false },
      { id: "openstreetmap", available: true }
    ]
  );
  assert.equal(registry.getPreferredProviderId(), "openstreetmap");
});

test("geocoding registry exposes provider-defined config fields", () => {
  const registry = createGeocodingProviderRegistry({
    geoapifyApiKey: "geo-key",
    geoapifyBaseUrl: "https://api.geoapify.com/v1",
    osmBaseUrl: "https://nominatim.openstreetmap.org",
    osmUserAgent: null,
    osmEmail: null
  });

  const provider = registry.getProviderView("geoapify");
  assert.ok(provider);
  assert.deepEqual(
    provider.configFields.map((field) => ({
      key: field.key,
      secret: field.secret,
      configured: field.configured,
      value: field.value
    })),
    [
      { key: "api_key", secret: true, configured: true, value: null },
      { key: "base_url", secret: false, configured: true, value: "https://api.geoapify.com/v1" }
    ]
  );
});

test("geoapify provider maps the best result", async () => {
  const calls: Array<{ url: string; headers: HeadersInit | undefined }> = [];
  const registry = createGeocodingProviderRegistry(
    {
      geoapifyApiKey: "geo-key",
      geoapifyBaseUrl: "https://geo.example.test/v1",
      osmBaseUrl: "https://nominatim.openstreetmap.org",
      osmUserAgent: null,
      osmEmail: null
    },
    async (input, init) => {
      calls.push({
        url: String(input),
        headers: init?.headers
      });
      return new Response(
        JSON.stringify({
          results: [
            {
              lat: 35.2621,
              lon: -81.1873,
              formatted: "5056 Stone Ridge Drive, Gastonia, NC 28056, United States",
              rank: { confidence: 0.99 },
              timezone: "America/New_York"
            },
            {
              lat: 35.2,
              lon: -81.1,
              formatted: "Weaker Match",
              rank: { confidence: 0.4 }
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
  );

  const provider = registry.getAvailableProvider("geoapify");
  assert.ok(provider);
  const result = await provider.geocode("5056 Stone Ridge Drive, Gastonia, NC 28056, US");

  assert.equal(result.latitude, 35.2621);
  assert.equal(result.longitude, -81.1873);
  assert.equal(result.formattedAddress, "5056 Stone Ridge Drive, Gastonia, NC 28056, United States");
  assert.equal(result.timezone, "America/New_York");
  assert.ok(calls[0]?.url.includes("apiKey=geo-key"));
});

test("openstreetmap provider maps the best result and sends the required user agent", async () => {
  const calls: Array<{ url: string; headers: Headers }> = [];
  const registry = createGeocodingProviderRegistry(
    {
      geoapifyApiKey: null,
      geoapifyBaseUrl: "https://api.geoapify.com/v1",
      osmBaseUrl: "https://nominatim.example.test",
      osmUserAgent: "Splash/1.0 (dev@example.test)",
      osmEmail: "dev@example.test"
    },
    async (input, init) => {
      calls.push({
        url: String(input),
        headers: new Headers(init?.headers)
      });
      return new Response(
        JSON.stringify([
          {
            lat: "35.2621",
            lon: "-81.1873",
            display_name: "5056 Stone Ridge Drive, Gastonia, NC 28056, United States",
            importance: 0.95
          },
          {
            lat: "35.2000",
            lon: "-81.1000",
            display_name: "Fallback Match",
            importance: 0.1
          }
        ]),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
  );

  const provider = registry.getAvailableProvider("openstreetmap");
  assert.ok(provider);
  const result = await provider.geocode("5056 Stone Ridge Drive, Gastonia, NC 28056, US");

  assert.equal(result.latitude, 35.2621);
  assert.equal(result.longitude, -81.1873);
  assert.equal(
    result.formattedAddress,
    "5056 Stone Ridge Drive, Gastonia, NC 28056, United States"
  );
  assert.equal(calls[0]?.headers.get("User-Agent"), "Splash/1.0 (dev@example.test)");
  assert.ok(calls[0]?.url.includes("email=dev%40example.test"));
});

test("geocoding settings service preserves stored secrets and recalculates provider availability", async () => {
  const registry = createGeocodingProviderRegistry({
    geoapifyApiKey: null,
    geoapifyBaseUrl: "https://api.geoapify.com/v1",
    osmBaseUrl: "https://nominatim.openstreetmap.org",
    osmUserAgent: null,
    osmEmail: null
  });
  let stored: {
    poolId: string;
    activeProviderId: string | null;
    providerConfigs: Record<string, Record<string, string | null>>;
  } = {
    poolId: "pool-1",
    activeProviderId: null as string | null,
    providerConfigs: {}
  };
  const service = new GeocodingSettingsService("pool-1", {
    async get() {
      return stored;
    },
    async upsert(settings) {
      stored = settings;
      return settings;
    }
  }, registry);

  await service.updateGeocodingProviderConfig("geoapify", {
    config: {
      api_key: "geo-key",
      base_url: "https://geo.example.test/v1"
    }
  });

  let view = await service.getGeocodingSettings();
  const geoapify = view.providers.find((provider) => provider.id === "geoapify");
  assert.ok(geoapify);
  assert.equal(geoapify.available, true);
  assert.equal(geoapify.configFields.find((field) => field.key === "api_key")?.configured, true);
  assert.equal(geoapify.configFields.find((field) => field.key === "api_key")?.value, null);

  await service.updateGeocodingProviderConfig("geoapify", {
    config: {
      api_key: "",
      base_url: "https://geo.example.test/v2"
    }
  });

  view = await service.getGeocodingSettings();
  const updatedGeoapify = view.providers.find((provider) => provider.id === "geoapify");
  assert.ok(updatedGeoapify);
  assert.equal(updatedGeoapify.available, true);
  assert.equal(updatedGeoapify.configFields.find((field) => field.key === "base_url")?.value, "https://geo.example.test/v2");
  assert.equal(stored.providerConfigs.geoapify?.api_key, "geo-key");
});

test("geocoding settings service rejects unavailable provider selection and prefers geoapify by default", async () => {
  const registry = createGeocodingProviderRegistry({
    geoapifyApiKey: "geo-key",
    geoapifyBaseUrl: "https://api.geoapify.com/v1",
    osmBaseUrl: "https://nominatim.openstreetmap.org",
    osmUserAgent: null,
    osmEmail: null
  });
  const service = new GeocodingSettingsService("pool-1", {
    async get() {
      return null;
    },
    async upsert(settings) {
      return settings;
    }
  }, registry);

  const view = await service.getGeocodingSettings();
  assert.equal(view.activeProviderId, "geoapify");
  assert.equal(view.activeProviderAvailable, true);

  await assert.rejects(
    () => service.updateGeocodingSettings({ activeProviderId: "openstreetmap" }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, "Geocoding settings are invalid.");
      assert.equal((error as Error & { details?: Record<string, string> }).details?.activeProviderId, "user_agent is required.");
      return true;
    }
  );
});
