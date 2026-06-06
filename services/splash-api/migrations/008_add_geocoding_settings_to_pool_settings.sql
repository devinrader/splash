ALTER TABLE pool_settings
  ADD COLUMN weather_active_geocoding_provider TEXT;

ALTER TABLE pool_settings
  ADD COLUMN weather_geocoded_formatted_address TEXT;
