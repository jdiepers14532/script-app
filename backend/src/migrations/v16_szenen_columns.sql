-- v12: seiten + spieltag als eigene Spalten auf szenen
ALTER TABLE szenen ADD COLUMN IF NOT EXISTS seiten TEXT;
ALTER TABLE szenen ADD COLUMN IF NOT EXISTS spieltag INT;

-- Bestehende meta_json-Werte migrieren (falls vorhanden)
UPDATE szenen SET seiten = meta_json->>'seiten' WHERE meta_json->>'seiten' IS NOT NULL;
UPDATE szenen SET spieltag = (meta_json->>'spieltag')::INT WHERE meta_json->>'spieltag' IS NOT NULL;
