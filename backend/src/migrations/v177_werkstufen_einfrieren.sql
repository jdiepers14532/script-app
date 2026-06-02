-- Phase 3: Werkstufen einfrieren (Revisionsstufen)
-- Adds freeze state + revisionsstufen tracking to werkstufen

ALTER TABLE werkstufen
  ADD COLUMN IF NOT EXISTS eingefroren          BOOLEAN      NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS eingefroren_am       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS eingefroren_von      TEXT,
  ADD COLUMN IF NOT EXISTS ist_revisionsstufe   BOOLEAN      NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS revisionsstufen_nr   INT;

-- Index für schnelle Abfragen aller Revisionsstufen einer Folge
CREATE INDEX IF NOT EXISTS idx_werkstufen_revisionsstufe
  ON werkstufen (folge_id, ist_revisionsstufe, revisionsstufen_nr)
  WHERE ist_revisionsstufe = TRUE;
