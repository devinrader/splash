CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  pool_id TEXT NOT NULL,
  type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  read INTEGER NOT NULL DEFAULT 0 CHECK (read IN (0, 1)),
  source TEXT NOT NULL,
  related_entity_type TEXT,
  related_entity_id TEXT,
  created_at TEXT NOT NULL,
  read_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_notifications_pool_created_at
  ON notifications (pool_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_pool_read_created_at
  ON notifications (pool_id, read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_pool_type_created_at
  ON notifications (pool_id, type, created_at DESC);
