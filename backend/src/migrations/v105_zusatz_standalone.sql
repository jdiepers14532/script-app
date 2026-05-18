-- v103: autorenplan_zusatz standalone (ohne Pflicht-einsatz_id)
-- Zusatzpersonal kann jetzt direkt an job_kategorie + woche geknüpft werden
ALTER TABLE autorenplan_zusatz ALTER COLUMN einsatz_id DROP NOT NULL;
ALTER TABLE autorenplan_zusatz ADD COLUMN IF NOT EXISTS job_kategorie_id TEXT;
ALTER TABLE autorenplan_zusatz ADD COLUMN IF NOT EXISTS produktion_db_id TEXT;
-- woche_von existiert bereits, wird jetzt auch ohne einsatz_id befüllt
