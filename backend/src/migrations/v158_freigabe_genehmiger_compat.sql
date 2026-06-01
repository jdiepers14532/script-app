-- v158: Freigabe-Genehmiger Backward-Compat (Phase 1 des v149-Umbaus)
--
-- v149 hat name/email aus rollen_freigabe_genehmiger entfernt, aber das
-- Backend wurde nie angepasst. Diese Migration stellt die compat-Felder
-- wieder her, damit das Frontend (name+email-Eingabe) weiter funktioniert,
-- und fügt den UNIQUE(anfrage_id, genehmiger_id) auf genehmiger_status zurück
-- (war ebenfalls in v149 entfernt worden).

-- 1. name + email als optionale Legacy-Felder zurück
ALTER TABLE rollen_freigabe_genehmiger ADD COLUMN IF NOT EXISTS name  TEXT NULL;
ALTER TABLE rollen_freigabe_genehmiger ADD COLUMN IF NOT EXISTS email TEXT NULL;

-- 2. XOR-Constraint auf name+email-Modus erweitern
ALTER TABLE rollen_freigabe_genehmiger DROP CONSTRAINT IF EXISTS chk_genehmiger_xor_identifier;
DO $$ BEGIN
  ALTER TABLE rollen_freigabe_genehmiger
    ADD CONSTRAINT chk_genehmiger_xor_identifier
    CHECK (
      (user_id IS NOT NULL AND rolle IS NULL  AND name IS NULL AND email IS NULL) OR
      (rolle   IS NOT NULL AND user_id IS NULL AND name IS NULL AND email IS NULL) OR
      (name    IS NOT NULL AND email IS NOT NULL AND user_id IS NULL AND rolle IS NULL)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. UNIQUE(anfrage_id, genehmiger_id) auf genehmiger_status zurück
-- (ermöglicht ON CONFLICT im Backend für idempotente Token-Generierung)
CREATE UNIQUE INDEX IF NOT EXISTS idx_genehmiger_status_anfrage_genehmiger
  ON rollen_freigabe_genehmiger_status (anfrage_id, genehmiger_id);
