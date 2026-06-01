-- v149: Freigabe-Genehmiger-Umbau — Zwei-Scope-Modell (Budget / Dispo)
--
-- Umbaut rollen_freigabe_genehmiger von email-basiertem Modell auf
-- Auth-User/Rolle-basiertes Modell mit freigabe_typ + stufe.
-- Fan-Out: rollen_freigabe_genehmiger_status bekommt user_id (konkreter Auth-User
-- der benachrichtigt wurde) + neue UNIQUE auf (anfrage_id, user_id).
-- ACHTUNG: Alle Dummy-Daten werden gelöscht (kein Go-Live-Datenstand).
-- Phase 1 aktualisiert den Backend-Code; bis dahin schlägt recalcAnfrageStatus fehl.

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. Dummy-Daten bereinigen (CASCADE-Reihenfolge)
-- ──────────────────────────────────────────────────────────────────────────────
TRUNCATE TABLE rollen_freigabe_genehmiger_status CASCADE;
TRUNCATE TABLE rollen_freigabe_anfragen CASCADE;
TRUNCATE TABLE rollen_freigabe_genehmiger CASCADE;
TRUNCATE TABLE rollen_freigabe_konfiguration CASCADE;

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. rollen_freigabe_genehmiger umbauen
-- ──────────────────────────────────────────────────────────────────────────────

-- Alte email-basierte Spalten entfernen
ALTER TABLE rollen_freigabe_genehmiger DROP COLUMN IF EXISTS name;
ALTER TABLE rollen_freigabe_genehmiger DROP COLUMN IF EXISTS email;
ALTER TABLE rollen_freigabe_genehmiger DROP COLUMN IF EXISTS ist_obligatorisch;

-- Neue Spalten: Auth-User ODER Auth-Rolle (genau eines muss gesetzt sein)
ALTER TABLE rollen_freigabe_genehmiger ADD COLUMN IF NOT EXISTS user_id TEXT NULL;
ALTER TABLE rollen_freigabe_genehmiger ADD COLUMN IF NOT EXISTS rolle  TEXT NULL;

-- Budget (Fall B) oder Dispo (Fall A)
ALTER TABLE rollen_freigabe_genehmiger ADD COLUMN IF NOT EXISTS freigabe_typ TEXT NOT NULL DEFAULT 'budget';

-- obligatorisch (blockiert) | review (beratend, blockiert nicht) | notify (FYI)
ALTER TABLE rollen_freigabe_genehmiger ADD COLUMN IF NOT EXISTS stufe TEXT NOT NULL DEFAULT 'obligatorisch';

-- Genau eines von user_id / rolle muss gesetzt sein
DO $$ BEGIN
  ALTER TABLE rollen_freigabe_genehmiger
    ADD CONSTRAINT chk_genehmiger_xor_identifier
    CHECK (
      (user_id IS NOT NULL AND rolle IS NULL) OR
      (rolle IS NOT NULL AND user_id IS NULL)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE rollen_freigabe_genehmiger
    ADD CONSTRAINT chk_genehmiger_freigabe_typ
    CHECK (freigabe_typ IN ('budget', 'dispo'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE rollen_freigabe_genehmiger
    ADD CONSTRAINT chk_genehmiger_stufe
    CHECK (stufe IN ('obligatorisch', 'review', 'notify'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. rollen_freigabe_genehmiger_status umbauen — Fan-Out-Modell
-- ──────────────────────────────────────────────────────────────────────────────

-- Alte UNIQUE(anfrage_id, genehmiger_id) entfernen — Fan-Out erlaubt mehrere
-- Zeilen pro genehmiger_id (eine pro User bei rolle-basiertem Genehmiger).
DO $$ BEGIN
  ALTER TABLE rollen_freigabe_genehmiger_status
    DROP CONSTRAINT rollen_freigabe_genehmiger_status_anfrage_id_genehmiger_id_key;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- user_id: konkreter Auth-User, dem dieses Token zugestellt wurde
ALTER TABLE rollen_freigabe_genehmiger_status
  ADD COLUMN IF NOT EXISTS user_id TEXT NULL;

-- entschieden: 'zurueckgezogen' als gültiger Wert ergänzen
-- (kein existierender CHECK — alten entschieden TEXT lassen, kein Problem)

-- 'zurueckgezogen' als gültiger entschieden-Wert ist implizit (kein CHECK)

-- Neue UNIQUE: eine Benachrichtigung pro User pro Anfrage
CREATE UNIQUE INDEX IF NOT EXISTS idx_genehmiger_status_anfrage_user
  ON rollen_freigabe_genehmiger_status (anfrage_id, user_id)
  WHERE user_id IS NOT NULL;

-- Index: alle offenen Status einer Anfrage (für First-Responder-Cleanup)
CREATE INDEX IF NOT EXISTS idx_genehmiger_status_anfrage
  ON rollen_freigabe_genehmiger_status (anfrage_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. rollen_freigabe_anfragen: CHECK auf status + fehlenden Index
-- ──────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE rollen_freigabe_anfragen
    ADD CONSTRAINT chk_anfragen_status
    CHECK (status IN ('ausstehend', 'freigegeben', 'abgelehnt', 'zurueckgezogen'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_rollen_freigabe_anfragen_status
  ON rollen_freigabe_anfragen (production_id, status)
  WHERE status = 'ausstehend';

-- ──────────────────────────────────────────────────────────────────────────────
-- 5. character_productions.freigabe_status: CHECK + Index
-- ──────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE character_productions
    ADD CONSTRAINT chk_cp_freigabe_status
    CHECK (freigabe_status IN ('keine', 'ausstehend', 'freigegeben', 'abgelehnt'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_character_productions_freigabe
  ON character_productions (produktion_id, freigabe_status)
  WHERE freigabe_status != 'keine';
