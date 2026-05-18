-- v94: gagen JSONB-Array auf autorenplan_job_kategorien
-- Ersetzt die einzelnen gage_betrag/abrechnungstyp-Felder durch mehrere Gagenkategorien
ALTER TABLE autorenplan_job_kategorien ADD COLUMN IF NOT EXISTS gagen JSONB DEFAULT '[]'::jsonb;
