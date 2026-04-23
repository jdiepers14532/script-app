CREATE TABLE IF NOT EXISTS kommentare (
  id SERIAL PRIMARY KEY,
  szene_id INT REFERENCES szenen(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  text TEXT NOT NULL,
  line_ref TEXT,
  resolved BOOLEAN DEFAULT FALSE,
  resolved_by TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_kommentare_szene ON kommentare(szene_id, resolved);
