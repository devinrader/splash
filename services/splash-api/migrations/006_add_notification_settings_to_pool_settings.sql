ALTER TABLE pool_settings
ADD COLUMN chemistry_prompt_interval_days INTEGER NOT NULL DEFAULT 3 CHECK (chemistry_prompt_interval_days > 0);

ALTER TABLE pool_settings
ADD COLUMN notification_preferences TEXT NOT NULL DEFAULT '{"in_app":true,"email":false,"push":false}';
