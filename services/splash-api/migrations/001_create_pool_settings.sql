CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS pool_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id TEXT NOT NULL UNIQUE,
  weather_provider TEXT NOT NULL DEFAULT 'openmeteo',
  weather_refresh_interval_hours INTEGER NOT NULL DEFAULT 6 CHECK (weather_refresh_interval_hours > 0),
  weather_location_mode TEXT NOT NULL DEFAULT 'address' CHECK (weather_location_mode IN ('address', 'coordinates')),
  weather_location_address_line1 TEXT,
  weather_location_address_line2 TEXT,
  weather_location_city TEXT,
  weather_location_state_region TEXT,
  weather_location_postal_code TEXT,
  weather_location_country TEXT,
  weather_location_latitude NUMERIC(9, 6),
  weather_location_longitude NUMERIC(9, 6),
  weather_location_timezone TEXT,
  weather_geocoded_latitude NUMERIC(9, 6),
  weather_geocoded_longitude NUMERIC(9, 6),
  weather_geocode_provider TEXT,
  weather_geocoded_at TIMESTAMPTZ,
  weather_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (weather_location_latitude IS NULL OR weather_location_latitude BETWEEN -90 AND 90),
  CHECK (weather_location_longitude IS NULL OR weather_location_longitude BETWEEN -180 AND 180),
  CHECK (weather_geocoded_latitude IS NULL OR weather_geocoded_latitude BETWEEN -90 AND 90),
  CHECK (weather_geocoded_longitude IS NULL OR weather_geocoded_longitude BETWEEN -180 AND 180),
  CHECK (
    weather_location_mode <> 'coordinates'
    OR (weather_location_latitude IS NOT NULL AND weather_location_longitude IS NOT NULL)
  ),
  CHECK (
    weather_location_mode <> 'address'
    OR (
      weather_location_address_line1 IS NOT NULL
      AND weather_location_city IS NOT NULL
      AND weather_location_state_region IS NOT NULL
      AND weather_location_postal_code IS NOT NULL
      AND weather_location_country IS NOT NULL
    )
  )
);
