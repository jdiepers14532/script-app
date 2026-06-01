-- v155: Motiv-Budget-Freigabe-Anfragen + notiz-Feld auf rollen_freigabe_genehmiger_status
--
-- motiv_freigabe_anfragen: analog zu rollen_freigabe_anfragen, aber für Motive (Budget-Scope B).
--   Wird nur verwendet, wenn deckt_motive = TRUE in rollen_freigabe_konfiguration.
--
-- rollen_freigabe_genehmiger_status: nachträgliches Ergänzen von notiz + erstellt_am,
--   damit Ablehnungsgrund / Review-Kommentar pro Genehmiger gespeichert werden kann.

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. motiv_freigabe_anfragen
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS motiv_freigabe_anfragen (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  motiv_id                UUID NOT NULL REFERENCES motive(id) ON DELETE CASCADE,
  production_id           TEXT NOT NULL REFERENCES produktionen(id) ON DELETE CASCADE,
  status                  TEXT NOT NULL DEFAULT 'ausstehend',
  beantragt_von_user_id   TEXT NOT NULL,
  beantragt_von_name      TEXT NULL,
  beantragt_am            TIMESTAMPTZ DEFAULT NOW(),
  entschieden_am          TIMESTAMPTZ NULL,
  entschieden_von_user_id TEXT NULL,
  notiz                   TEXT NULL,
  erneut_anfrage_notiz    TEXT NULL,
  UNIQUE(motiv_id, production_id)
);

DO $$ BEGIN
  ALTER TABLE motiv_freigabe_anfragen
    ADD CONSTRAINT chk_motiv_anfragen_status
    CHECK (status IN ('ausstehend', 'freigegeben', 'abgelehnt', 'zurueckgezogen'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_motiv_freigabe_anfragen_prod_status
  ON motiv_freigabe_anfragen (production_id, status)
  WHERE status = 'ausstehend';

-- Genehmiger-Status für Motiv-Anfragen (Fan-Out-Modell)
CREATE TABLE IF NOT EXISTS motiv_freigabe_genehmiger_status (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anfrage_id       UUID NOT NULL REFERENCES motiv_freigabe_anfragen(id) ON DELETE CASCADE,
  genehmiger_id    INT  NOT NULL REFERENCES rollen_freigabe_genehmiger(id) ON DELETE CASCADE,
  user_id          TEXT NULL,
  token            TEXT UNIQUE,
  token_gueltig_bis TIMESTAMPTZ NULL,
  entschieden      TEXT NULL,
  entschieden_am   TIMESTAMPTZ NULL,
  notiz            TEXT NULL,
  erstellt_am      TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_motiv_genehm_status_anfrage_user
  ON motiv_freigabe_genehmiger_status (anfrage_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_motiv_genehm_status_anfrage
  ON motiv_freigabe_genehmiger_status (anfrage_id);

DO $$ BEGIN
  ALTER TABLE motiv_freigabe_genehmiger_status
    ADD CONSTRAINT chk_motiv_genehmiger_entschieden
    CHECK (entschieden IN ('freigegeben', 'abgelehnt', 'zurueckgezogen'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. rollen_freigabe_genehmiger_status: notiz + erstellt_am nachträglich ergänzen
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE rollen_freigabe_genehmiger_status
  ADD COLUMN IF NOT EXISTS notiz TEXT NULL;

ALTER TABLE rollen_freigabe_genehmiger_status
  ADD COLUMN IF NOT EXISTS erstellt_am TIMESTAMPTZ DEFAULT NOW();
