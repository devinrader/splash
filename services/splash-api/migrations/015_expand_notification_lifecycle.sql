ALTER TABLE notifications ADD COLUMN category TEXT NOT NULL DEFAULT 'alert' CHECK (category IN ('informational', 'alert', 'action_item'));
ALTER TABLE notifications ADD COLUMN acknowledged_at TEXT;
ALTER TABLE notifications ADD COLUMN resolved_at TEXT;
ALTER TABLE notifications ADD COLUMN resolution_source TEXT;
