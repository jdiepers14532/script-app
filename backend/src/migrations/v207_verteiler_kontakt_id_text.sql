-- v207_verteiler_kontakt_id_text.sql
-- verteiler_mitglied.kontakt_id: UUID -> TEXT.
-- vertraege-Person-IDs sind INTEGER; eine UUID-Spalte kann sie nicht halten.
-- Idempotent (nur wenn aktuell uuid). 0 echte Datensätze → unkritisch.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'verteiler_mitglied' AND column_name = 'kontakt_id' AND data_type = 'uuid'
  ) THEN
    ALTER TABLE verteiler_mitglied ALTER COLUMN kontakt_id TYPE TEXT USING kontakt_id::text;
  END IF;
END $$;

COMMIT;
