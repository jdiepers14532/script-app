-- v157: Freigabe-Override-Audit — protokolliert Lock-Gate- und Rote-Seiten-Overrides
--
-- Jeder Override (Locken trotz ausstehender Freigaben / Rote Seiten trotz ausstehender
-- Freigaben) muss mit Pflichtbegründung erfasst werden.
--
-- typ:              'lock' (Lock-Gate-Override) | 'rote_seiten' (Rote-Seiten-Gate-Override)
-- bezug_id:         ID des Vorgangs (folge_id für Lock, werkstufe_id für rote Seiten)
-- user_id:          Wer den Override ausgeführt hat
-- begruendung:      Pflichttext (leer = INSERT abgelehnt durch NOT NULL)
-- fehlende_freigaben: JSON-Snapshot der zum Zeitpunkt fehlenden Freigaben

CREATE TABLE IF NOT EXISTS freigabe_overrides (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  typ                  TEXT NOT NULL,
  bezug_id             TEXT NOT NULL,
  user_id              TEXT NOT NULL,
  begruendung          TEXT NOT NULL,
  fehlende_freigaben   JSONB NOT NULL DEFAULT '[]',
  erstellt_am          TIMESTAMPTZ DEFAULT NOW()
);

DO $$ BEGIN
  ALTER TABLE freigabe_overrides
    ADD CONSTRAINT chk_freigabe_overrides_typ
    CHECK (typ IN ('lock', 'rote_seiten'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE freigabe_overrides
    ADD CONSTRAINT chk_freigabe_overrides_begruendung_nicht_leer
    CHECK (LENGTH(TRIM(begruendung)) > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Index: Override-Historie pro Bezugsobjekt
CREATE INDEX IF NOT EXISTS idx_freigabe_overrides_bezug
  ON freigabe_overrides (typ, bezug_id);

-- Index: alle Overrides eines Users
CREATE INDEX IF NOT EXISTS idx_freigabe_overrides_user
  ON freigabe_overrides (user_id, erstellt_am DESC);
