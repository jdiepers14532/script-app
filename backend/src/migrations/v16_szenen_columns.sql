-- v16: seiten + spieltag als eigene Spalten auf szenen
ALTER TABLE szenen ADD COLUMN IF NOT EXISTS seiten TEXT;
ALTER TABLE szenen ADD COLUMN IF NOT EXISTS spieltag INT;
