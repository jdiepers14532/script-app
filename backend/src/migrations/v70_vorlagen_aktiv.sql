-- v70: Add is_aktiv flag to dokument_vorlagen
-- Only one vorlage per (produktion_id, typ) can be active (enforced in app logic)
ALTER TABLE dokument_vorlagen ADD COLUMN IF NOT EXISTS is_aktiv BOOLEAN NOT NULL DEFAULT false;
