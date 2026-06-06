ALTER TABLE pool_settings
  ADD COLUMN weather_geocoding_provider_configs TEXT NOT NULL DEFAULT '{}';
