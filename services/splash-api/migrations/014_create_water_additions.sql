CREATE TABLE IF NOT EXISTS water_additions (
  id TEXT PRIMARY KEY,
  pool_id TEXT NOT NULL,
  water_source TEXT NOT NULL,
  amount REAL NOT NULL,
  unit TEXT NOT NULL,
  reason TEXT NOT NULL,
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  recorded_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK (water_source IN ('well', 'municipal', 'truck', 'unknown')),
  CHECK (amount > 0),
  CHECK (unit IN ('gal', 'qt', 'oz', 'lb', 'kg', 'g', 'L')),
  CHECK (reason IN ('top_up', 'post_backwash_refill', 'partial_refill', 'full_refill', 'other')),
  CHECK (source IN ('manual'))
);

CREATE INDEX IF NOT EXISTS idx_water_additions_pool_recorded_at
  ON water_additions (pool_id, recorded_at DESC, created_at DESC);
