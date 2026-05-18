-- v97: gage_kat auf autorenplan_einsaetze
-- Referenziert den Index in autorenplan_job_kategorien.gagen JSONB-Array
ALTER TABLE autorenplan_einsaetze ADD COLUMN IF NOT EXISTS gage_kat INTEGER;
