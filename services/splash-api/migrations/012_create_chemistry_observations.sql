CREATE TABLE IF NOT EXISTS chemistry_observations (
  id TEXT PRIMARY KEY,
  pool_id TEXT NOT NULL,
  clarity TEXT,
  algae_presence TEXT,
  debris_level TEXT,
  bather_load_estimate TEXT,
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  recorded_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK (clarity IS NULL OR clarity IN ('clear', 'slightly_hazy', 'cloudy', 'opaque')),
  CHECK (algae_presence IS NULL OR algae_presence IN ('absent', 'suspected', 'visible')),
  CHECK (debris_level IS NULL OR debris_level IN ('none', 'light', 'moderate', 'heavy')),
  CHECK (bather_load_estimate IS NULL OR bather_load_estimate IN ('none', 'light', 'moderate', 'heavy')),
  CHECK (source IN ('manual'))
);

CREATE INDEX IF NOT EXISTS idx_chemistry_observations_pool_recorded_at
  ON chemistry_observations (pool_id, recorded_at DESC, created_at DESC);
