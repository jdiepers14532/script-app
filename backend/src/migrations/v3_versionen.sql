CREATE TABLE IF NOT EXISTS szenen_versionen (
  id SERIAL PRIMARY KEY,
  szene_id INT REFERENCES szenen(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  user_name TEXT,
  content_snapshot JSONB NOT NULL,
  change_summary TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_szenen_versionen_szene_created ON szenen_versionen(szene_id, created_at DESC);
