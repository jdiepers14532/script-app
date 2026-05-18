-- v90: Autorenplan Platzhalter-Cache für Auto-Vervollständigung
CREATE TABLE IF NOT EXISTS autorenplan_platzhalter_cache (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL UNIQUE,
  used_count   INT DEFAULT 1,
  last_used_at TIMESTAMPTZ DEFAULT NOW(),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platzhalter_cache_name
  ON autorenplan_platzhalter_cache (name);
