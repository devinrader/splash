import test from "node:test";
import assert from "node:assert/strict";
import {
  OpenMeteoWeatherProvider,
  WeatherForecastService,
  type WeatherForecastView
} from "../src/weather-forecast.js";

test("OpenMeteoWeatherProvider constructs forecast and geocoding requests and normalizes output", async () => {
  const requests: string[] = [];
  const fetchImpl: typeof fetch = (async (input: URL | RequestInfo) => {
    const url = String(input);
    requests.push(url);

    if (url.includes("/search?")) {
      return new Response(
        JSON.stringify({
          results: [
            {
              name: "Gastonia",
              latitude: 35.2621,
              longitude: -81.1873,
              timezone: "America/New_York"
            }
          ]
        }),
        { status: 200 }
      );
    }

    return new Response(
      JSON.stringify({
        timezone: "America/New_York",
        daily: {
          time: ["2026-05-12"],
          weather_code: [3],
          temperature_2m_max: [82],
          temperature_2m_min: [63],
          precipitation_probability_max: [25],
          precipitation_sum: [1.2],
          uv_index_max: [8.6],
          sunrise: ["2026-05-12T06:19:00-04:00"],
          sunset: ["2026-05-12T20:15:00-04:00"]
        },
        hourly: {
          time: ["2026-05-12T12:00"],
          temperature_2m: [78],
          relative_humidity_2m: [51],
          dew_point_2m: [58.5],
          precipitation_probability: [10],
          precipitation: [0],
          cloud_cover: [15],
          wind_speed_10m: [6.2],
          wind_gusts_10m: [9.3],
          uv_index: [7.1]
        }
      }),
      { status: 200 }
    );
  }) as typeof fetch;

  const provider = new OpenMeteoWeatherProvider({
    baseUrl: "https://api.open-meteo.com/v1",
    geocodingUrl: "https://geocoding-api.open-meteo.com/v1",
    fetchImpl
  });

  const geocoded = await provider.geocodeAddress("Gastonia, NC");
  assert.deepEqual(geocoded, {
    name: "Gastonia",
    latitude: 35.2621,
    longitude: -81.1873,
    timezone: "America/New_York"
  });

  const forecast = await provider.getForecast({
    latitude: 35.2621,
    longitude: -81.1873,
    timezone: "America/New_York"
  });

  assert.equal(requests.length, 2);
  assert.match(requests[0] ?? "", /geocoding-api\.open-meteo\.com\/v1\/search/u);
  assert.match(requests[1] ?? "", /api\.open-meteo\.com\/v1\/forecast/u);
  assert.match(requests[1] ?? "", /forecast_days=10/u);
  assert.match(requests[1] ?? "", /temperature_unit=fahrenheit/u);
  assert.match(requests[1] ?? "", /wind_speed_unit=mph/u);
  assert.match(requests[1] ?? "", /hourly=temperature_2m%2Crelative_humidity_2m/u);
  assert.equal(forecast.daily[0]?.high_temp_c, 27.8);
  assert.equal(forecast.hourly[0]?.temperature_c, 25.6);
  assert.equal(forecast.hourly[0]?.wind_speed_kph, 10);
});

test("WeatherForecastService keeps the last valid forecast and marks it stale after refresh failure", async () => {
  let callCount = 0;
  const fetchImpl: typeof fetch = (async (input: URL | RequestInfo) => {
    const url = String(input);
    if (url.includes("/forecast")) {
      callCount += 1;
      if (callCount > 1) {
        return new Response("upstream failed", { status: 500 });
      }
      return new Response(
        JSON.stringify({
          timezone: "America/New_York",
          daily: {
            time: ["2026-05-12"],
            weather_code: [2],
            temperature_2m_max: [81],
            temperature_2m_min: [62],
            precipitation_probability_max: [10],
            precipitation_sum: [0],
            uv_index_max: [7.5],
            sunrise: ["2026-05-12T06:19:00-04:00"],
            sunset: ["2026-05-12T20:15:00-04:00"]
          },
          hourly: {
            time: ["2026-05-12T12:00"],
            temperature_2m: [77],
            relative_humidity_2m: [48],
            dew_point_2m: [56],
            precipitation_probability: [5],
            precipitation: [0],
            cloud_cover: [12],
            wind_speed_10m: [5],
            wind_gusts_10m: [8],
            uv_index: [6.4]
          }
        }),
        { status: 200 }
      );
    }

    throw new Error(`Unexpected URL: ${url}`);
  }) as typeof fetch;

  const updates: WeatherForecastView[] = [];
  const service = new WeatherForecastService({
    poolId: "pool-1",
    poolSite: {
      streetAddress: null,
      city: null,
      state: null,
      postalCode: null,
      latitude: 35.2621,
      longitude: -81.1873,
      timezone: "America/New_York"
    },
    weather: {
      provider: "openmeteo",
      refreshIntervalHours: 6,
      openMeteoBaseUrl: "https://api.open-meteo.com/v1",
      openMeteoGeocodingUrl: "https://geocoding-api.open-meteo.com/v1"
    },
    fetchImpl,
    onUpdate: (view) => updates.push(view)
  });

  const first = await service.refreshNow();
  assert.equal(first.status, "available");
  assert.equal(first.stale, false);
  assert.equal(first.daily[0]?.high_temp_f, 81);

  const second = await service.refreshNow();
  assert.equal(second.status, "available");
  assert.equal(second.stale, true);
  assert.match(second.message, /stale/u);
  assert.equal(second.daily[0]?.high_temp_f, 81);
  assert.equal(updates.length, 2);
});

test("WeatherForecastService reads persisted weather history and reports healthy provider state after refresh", async () => {
  const requests: Array<{ url: string; method?: string; body?: string }> = [];
  const fetchImpl: typeof fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = String(input);
    requests.push({
      url,
      method: init?.method,
      body: typeof init?.body === "string" ? init.body : undefined
    });

    if (url.includes("/forecast")) {
      return new Response(
        JSON.stringify({
          timezone: "America/New_York",
          daily: {
            time: ["2026-05-12"],
            weather_code: [2],
            temperature_2m_max: [81],
            temperature_2m_min: [62],
            precipitation_probability_max: [10],
            precipitation_sum: [0],
            uv_index_max: [7.5],
            sunrise: ["2026-05-12T06:19:00-04:00"],
            sunset: ["2026-05-12T20:15:00-04:00"]
          },
          hourly: {
            time: ["2026-05-12T12:00"],
            temperature_2m: [77],
            relative_humidity_2m: [48],
            dew_point_2m: [56],
            precipitation_probability: [5],
            precipitation: [0],
            cloud_cover: [12],
            wind_speed_10m: [5],
            wind_gusts_10m: [8],
            uv_index: [6.4]
          }
        }),
        { status: 200 }
      );
    }

    if (url.includes("/api/v2/write")) {
      return new Response("", { status: 204 });
    }

    if (url.includes("/api/v2/query")) {
      return new Response(
        ",result,table,_time,_value,provider\n,_result,0,2026-05-12T12:00:00.000Z,77,openmeteo\n",
        { status: 200 }
      );
    }

    throw new Error(`Unexpected URL: ${url}`);
  }) as typeof fetch;

  const service = new WeatherForecastService({
    poolId: "pool-1",
    poolSite: {
      streetAddress: null,
      city: null,
      state: null,
      postalCode: null,
      latitude: 35.2621,
      longitude: -81.1873,
      timezone: "America/New_York"
    },
    weather: {
      provider: "openmeteo",
      refreshIntervalHours: 6,
      openMeteoBaseUrl: "https://api.open-meteo.com/v1",
      openMeteoGeocodingUrl: "https://geocoding-api.open-meteo.com/v1"
    },
    influx: {
      url: "http://influx.local:8086",
      token: "token",
      org: "splash",
      bucket: "system-telemetry"
    },
    fetchImpl
  });

  await service.refreshNow();

  const history = await service.getHistory({
    metric: "temperature_f",
    start: "2026-05-11T00:00:00.000Z",
    end: "2026-05-12T23:59:59.000Z",
    interval: "6h"
  });
  assert.equal(history.status, "available");
  assert.equal(history.series[0]?.points[0]?.value, 77);

  const health = await service.checkHealth();
  assert.equal(health.status, "healthy");
  assert.match(requests.find((request) => request.url.includes("/api/v2/query"))?.body ?? "", /weather_forecast_hourly/u);
  assert.match(requests.find((request) => request.url.includes("/api/v2/query"))?.body ?? "", /temperature_f/u);
});

test("WeatherForecastService falls back to the latest cached forecast when persisted weather history is empty", async () => {
  const fetchImpl: typeof fetch = (async (input: URL | RequestInfo) => {
    const url = String(input);

    if (url.includes("/forecast")) {
      return new Response(
        JSON.stringify({
          timezone: "America/New_York",
          daily: {
            time: ["2026-05-12"],
            weather_code: [2],
            temperature_2m_max: [81],
            temperature_2m_min: [62],
            precipitation_probability_max: [10],
            precipitation_sum: [0],
            uv_index_max: [7.5],
            sunrise: ["2026-05-12T06:19:00-04:00"],
            sunset: ["2026-05-12T20:15:00-04:00"]
          },
          hourly: {
            time: ["2026-05-12T12:00", "2026-05-12T18:00"],
            temperature_2m: [77, 74],
            relative_humidity_2m: [48, 56],
            dew_point_2m: [56, 58],
            precipitation_probability: [5, 35],
            precipitation: [0, 0.7],
            cloud_cover: [12, 65],
            wind_speed_10m: [5, 7],
            wind_gusts_10m: [8, 11],
            uv_index: [6.4, 1.2]
          }
        }),
        { status: 200 }
      );
    }

    if (url.includes("/api/v2/write")) {
      return new Response("", { status: 204 });
    }

    if (url.includes("/api/v2/query")) {
      return new Response(",result,table,_time,_value,provider\n", { status: 200 });
    }

    throw new Error(`Unexpected URL: ${url}`);
  }) as typeof fetch;

  const service = new WeatherForecastService({
    poolId: "pool-1",
    poolSite: {
      streetAddress: null,
      city: null,
      state: null,
      postalCode: null,
      latitude: 35.2621,
      longitude: -81.1873,
      timezone: "America/New_York"
    },
    weather: {
      provider: "openmeteo",
      refreshIntervalHours: 6,
      openMeteoBaseUrl: "https://api.open-meteo.com/v1",
      openMeteoGeocodingUrl: "https://geocoding-api.open-meteo.com/v1"
    },
    influx: {
      url: "http://influx.local:8086",
      token: "token",
      org: "splash",
      bucket: "system-telemetry"
    },
    fetchImpl
  });

  await service.refreshNow();

  const history = await service.getHistory({
    metric: "temperature_f",
    start: "2026-05-11T00:00:00.000Z",
    end: "2026-05-12T23:59:59.000Z",
    interval: "6h"
  });
  assert.equal(history.status, "available");
  assert.match(history.message, /latest cached forecast snapshot/u);
  assert.equal(history.series[0]?.points.length, 2);
  assert.equal(history.series[0]?.points[0]?.value, 77);
});
