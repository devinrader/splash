CREATE TABLE IF NOT EXISTS maintenance_activities (
  id TEXT PRIMARY KEY,
  pool_id TEXT NOT NULL,
  activity_type TEXT NOT NULL,
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  recorded_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK (
    activity_type IN (
      'brushed',
      'vacuumed',
      'robot_cleaned',
      'skimmed',
      'skimmer_basket_cleaned',
      'pump_basket_cleaned',
      'filter_cleaned',
      'filter_backwashed',
      'other'
    )
  ),
  CHECK (source IN ('manual'))
);

CREATE INDEX IF NOT EXISTS idx_maintenance_activities_pool_recorded_at
  ON maintenance_activities (pool_id, recorded_at DESC, created_at DESC);
