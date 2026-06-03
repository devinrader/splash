CREATE TABLE IF NOT EXISTS chemistry_readings (
  id TEXT PRIMARY KEY,
  pool_id TEXT NOT NULL,
  ph REAL,
  free_chlorine REAL,
  total_alkalinity REAL,
  calcium_hardness REAL,
  cyanuric_acid REAL,
  salt_level REAL,
  rainfall_inches REAL,
  source TEXT NOT NULL CHECK (source IN ('manual', 'sensor')),
  recorded_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK (ph IS NULL OR (ph >= 0 AND ph <= 14)),
  CHECK (rainfall_inches IS NULL OR rainfall_inches >= 0)
);

CREATE INDEX IF NOT EXISTS chemistry_readings_pool_recorded_at_idx
ON chemistry_readings (pool_id, recorded_at DESC, created_at DESC);
