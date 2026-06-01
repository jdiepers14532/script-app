-- v152: scene_characters Dispo-Status + character_productions Audit + motive freigabe_status
--
-- scene_characters:
--   status           — Dispo-Freigabe-Status pro Vorkommen (Fall A)
--   quelle           — Woher die Zeile kam (manuell / auto_editor)
--   spiel_typ_quelle — Wie spiel_typ gesetzt wurde (header / scan / manuell)
--                      Präzedenz: manuell > scan > header (nie silently downgraden)
--
-- character_productions:
--   angelegt_von_user_id — Wer die Rolle angelegt hat (Audit)
--   angelegt_via         — Ob Direkteintrag (prep_direkt) oder Editor-Freigabe
--   angelegt_am          — Zeitstempel der Anlage
--   default_anzahl       — Wiederkehrende o.T.-Komparsen-Anzahl (Default für Scene)
--
-- motive:
--   freigabe_status  — analog zu character_productions.freigabe_status
--   angelegt_von_user_id / angelegt_via / angelegt_am — Audit analog oben

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. scene_characters — Dispo-Status
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE scene_characters ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'bestaetigt';
ALTER TABLE scene_characters ADD COLUMN IF NOT EXISTS quelle TEXT NOT NULL DEFAULT 'manuell';
ALTER TABLE scene_characters ADD COLUMN IF NOT EXISTS spiel_typ_quelle TEXT NOT NULL DEFAULT 'header';

DO $$ BEGIN
  ALTER TABLE scene_characters
    ADD CONSTRAINT chk_sc_status
    CHECK (status IN ('bestaetigt', 'ausstehend', 'abgelehnt'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE scene_characters
    ADD CONSTRAINT chk_sc_quelle
    CHECK (quelle IN ('manuell', 'auto_editor'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE scene_characters
    ADD CONSTRAINT chk_sc_spiel_typ_quelle
    CHECK (spiel_typ_quelle IN ('header', 'scan', 'manuell'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Index: schnelles Finden ausstehender / abgelehnter Vorkommen pro Szene
CREATE INDEX IF NOT EXISTS idx_scene_characters_status
  ON scene_characters (scene_identity_id, status)
  WHERE status != 'bestaetigt';

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. character_productions — Audit-Felder
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE character_productions ADD COLUMN IF NOT EXISTS angelegt_von_user_id TEXT NULL;
ALTER TABLE character_productions ADD COLUMN IF NOT EXISTS angelegt_via TEXT NULL;
ALTER TABLE character_productions ADD COLUMN IF NOT EXISTS angelegt_am TIMESTAMPTZ NULL;
ALTER TABLE character_productions ADD COLUMN IF NOT EXISTS default_anzahl INT NULL;

DO $$ BEGIN
  ALTER TABLE character_productions
    ADD CONSTRAINT chk_cp_angelegt_via
    CHECK (angelegt_via IN ('prep_direkt', 'editor_freigabe'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. motive — freigabe_status + Audit
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE motive ADD COLUMN IF NOT EXISTS freigabe_status TEXT NOT NULL DEFAULT 'keine';
ALTER TABLE motive ADD COLUMN IF NOT EXISTS angelegt_von_user_id TEXT NULL;
ALTER TABLE motive ADD COLUMN IF NOT EXISTS angelegt_via TEXT NULL;
ALTER TABLE motive ADD COLUMN IF NOT EXISTS angelegt_am TIMESTAMPTZ NULL;

DO $$ BEGIN
  ALTER TABLE motive
    ADD CONSTRAINT chk_motive_freigabe_status
    CHECK (freigabe_status IN ('keine', 'ausstehend', 'freigegeben', 'abgelehnt'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE motive
    ADD CONSTRAINT chk_motive_angelegt_via
    CHECK (angelegt_via IN ('prep_direkt', 'editor_freigabe'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_motive_freigabe
  ON motive (produktion_id, freigabe_status)
  WHERE freigabe_status != 'keine';
