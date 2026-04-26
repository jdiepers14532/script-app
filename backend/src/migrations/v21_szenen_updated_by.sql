-- v21: track last editor name on szenen
ALTER TABLE szenen ADD COLUMN IF NOT EXISTS updated_by_name TEXT;
