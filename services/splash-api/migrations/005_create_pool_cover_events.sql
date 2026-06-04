CREATE TABLE IF NOT EXISTS pool_cover_events (
  id TEXT PRIMARY KEY,
  pool_id TEXT NOT NULL,
  state TEXT NOT NULL,
  cover_type TEXT NOT NULL,
  source TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pool_cover_events_pool_recorded_at
  ON pool_cover_events (pool_id, recorded_at DESC, created_at DESC);
