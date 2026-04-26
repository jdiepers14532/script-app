-- v14: Vorstopp-System

CREATE TABLE IF NOT EXISTS vorstopp_einstellungen (
  staffel_id TEXT PRIMARY KEY REFERENCES staffeln(id) ON DELETE CASCADE,
  methode TEXT NOT NULL DEFAULT 'seiten' CHECK (methode IN ('seiten', 'zeichen', 'woerter')),
  -- Ratio: 'menge' Einheiten entsprechen 'dauer_sekunden'
  -- z.B. menge=0.125 (1/8 Seite) + dauer_sekunden=60 → 1/8 Seite = 1 Minute
  menge NUMERIC NOT NULL DEFAULT 0.125,
  dauer_sekunden INT NOT NULL DEFAULT 60,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS szenen_vorstopp (
  id SERIAL PRIMARY KEY,
  szene_id INT NOT NULL REFERENCES szenen(id) ON DELETE CASCADE,
  stage TEXT NOT NULL CHECK (stage IN ('drehbuch', 'vorbereitung', 'dreh', 'schnitt')),
  user_id TEXT NOT NULL,
  user_name TEXT,
  dauer_sekunden INT NOT NULL,
  methode TEXT NOT NULL DEFAULT 'manuell' CHECK (methode IN ('manuell', 'auto_seiten', 'auto_zeichen', 'auto_woerter')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vorstopp_szene_stage ON szenen_vorstopp(szene_id, stage, created_at DESC);
