-- v55: Dokument-Vorlagen (Templates for non-scene elements per production)
CREATE TABLE IF NOT EXISTS dokument_vorlagen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produktion_id TEXT NOT NULL REFERENCES produktionen(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sektionen JSONB NOT NULL DEFAULT '[]',
  created_by TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dokument_vorlagen_produktion ON dokument_vorlagen(produktion_id);
