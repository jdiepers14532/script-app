-- v54: Add notiz and motiv_id to dokument_szenen
ALTER TABLE dokument_szenen ADD COLUMN IF NOT EXISTS notiz TEXT;
ALTER TABLE dokument_szenen ADD COLUMN IF NOT EXISTS motiv_id UUID REFERENCES motive(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_dokument_szenen_motiv_id ON dokument_szenen(motiv_id) WHERE motiv_id IS NOT NULL;
