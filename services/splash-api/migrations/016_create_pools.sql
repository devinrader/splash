CREATE TABLE IF NOT EXISTS pools (
  id TEXT PRIMARY KEY,
  volume_gallons REAL CHECK (volume_gallons IS NULL OR volume_gallons > 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
