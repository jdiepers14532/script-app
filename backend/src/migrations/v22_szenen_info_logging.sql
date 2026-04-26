-- v22: szeneninfo, scene_nummer_suffix, logged_since für Szenen-Logging
ALTER TABLE szenen ADD COLUMN IF NOT EXISTS szeneninfo TEXT;
ALTER TABLE szenen ADD COLUMN IF NOT EXISTS scene_nummer_suffix VARCHAR(5);
ALTER TABLE szenen ADD COLUMN IF NOT EXISTS logged_since TIMESTAMPTZ;

INSERT INTO app_settings (key, value)
VALUES ('scene_logging_stage', 'none')
ON CONFLICT (key) DO NOTHING;
