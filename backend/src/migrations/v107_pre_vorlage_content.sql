-- v107: Cache original scene content before vorlage merge
-- Allows switching vorlagen without losing the original scene text
ALTER TABLE dokument_szenen
  ADD COLUMN IF NOT EXISTS pre_vorlage_content JSONB;
