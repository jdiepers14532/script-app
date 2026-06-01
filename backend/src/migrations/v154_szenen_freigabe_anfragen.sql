-- v154: Dispo-Freigabe-Anfragen — neue Tabellen für Scope A (szenenlokal, post-Lock)
--
-- szenen_freigabe_anfragen:  eine Budget-Anfrage pro Charakter × Szene
--   (analog zu rollen_freigabe_anfragen für Budget-Scope B)
-- szenen_freigabe_genehmiger_status: Fan-Out-Modell analog zu rollen_freigabe_genehmiger_status
--   (eine Zeile pro Auth-User + Anfrage; bei rolle-basierten Genehmigern eine Zeile pro User)

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. szenen_freigabe_anfragen
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS szenen_freigabe_anfragen (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id            UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  scene_identity_id       UUID NOT NULL REFERENCES scene_identities(id) ON DELETE CASCADE,
  production_id           TEXT NOT NULL REFERENCES produktionen(id) ON DELETE CASCADE,
  status                  TEXT NOT NULL DEFAULT 'ausstehend',
  beantragt_von_user_id   TEXT NOT NULL,
  beantragt_von_name      TEXT NULL,
  beantragt_am            TIMESTAMPTZ DEFAULT NOW(),
  entschieden_am          TIMESTAMPTZ NULL,
  entschieden_von_user_id TEXT NULL,
  notiz                   TEXT NULL,
  erneut_anfrage_notiz    TEXT NULL,
  UNIQUE(character_id, scene_identity_id)
);

DO $$ BEGIN
  ALTER TABLE szenen_freigabe_anfragen
    ADD CONSTRAINT chk_szenen_anfragen_status
    CHECK (status IN ('ausstehend', 'freigegeben', 'abgelehnt', 'zurueckgezogen'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Index: offene Anfragen pro Produktion (häufigste Abfrage)
CREATE INDEX IF NOT EXISTS idx_szenen_freigabe_anfragen_prod_status
  ON szenen_freigabe_anfragen (production_id, status)
  WHERE status = 'ausstehend';

-- Index: alle Anfragen einer Szene (für Auto-Zurückziehen beim Scan)
CREATE INDEX IF NOT EXISTS idx_szenen_freigabe_anfragen_scene
  ON szenen_freigabe_anfragen (scene_identity_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. szenen_freigabe_genehmiger_status (Fan-Out-Modell)
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS szenen_freigabe_genehmiger_status (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anfrage_id       UUID NOT NULL REFERENCES szenen_freigabe_anfragen(id) ON DELETE CASCADE,
  genehmiger_id    INT  NOT NULL REFERENCES rollen_freigabe_genehmiger(id) ON DELETE CASCADE,
  user_id          TEXT NULL,          -- konkreter Auth-User (fan-out bei Rollen-Genehmiger)
  token            TEXT UNIQUE,        -- Single-Token für Identity/Routing; Entscheidung in-app
  token_gueltig_bis TIMESTAMPTZ NULL,
  entschieden      TEXT NULL,          -- 'freigegeben' | 'abgelehnt' | 'zurueckgezogen'
  entschieden_am   TIMESTAMPTZ NULL,
  notiz            TEXT NULL,          -- Ablehnungsgrund oder Review-Kommentar
  erstellt_am      TIMESTAMPTZ DEFAULT NOW()
);

-- UNIQUE: eine Benachrichtigung pro User pro Anfrage
CREATE UNIQUE INDEX IF NOT EXISTS idx_szenen_genehm_status_anfrage_user
  ON szenen_freigabe_genehmiger_status (anfrage_id, user_id)
  WHERE user_id IS NOT NULL;

-- Index: alle Status einer Anfrage (für First-Responder-Cleanup)
CREATE INDEX IF NOT EXISTS idx_szenen_genehm_status_anfrage
  ON szenen_freigabe_genehmiger_status (anfrage_id);

DO $$ BEGIN
  ALTER TABLE szenen_freigabe_genehmiger_status
    ADD CONSTRAINT chk_szenen_genehmiger_entschieden
    CHECK (entschieden IN ('freigegeben', 'abgelehnt', 'zurueckgezogen'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
