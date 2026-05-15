-- v73: Add vorlage_id to dokument_szenen for notiz template linkage
ALTER TABLE dokument_szenen
  ADD COLUMN IF NOT EXISTS vorlage_id UUID REFERENCES dokument_vorlagen(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_dokument_szenen_vorlage ON dokument_szenen(vorlage_id) WHERE vorlage_id IS NOT NULL;
