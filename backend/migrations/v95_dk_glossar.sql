-- v95: DK-Glossar (Abkürzungsverzeichnis pro Produktion)
CREATE TABLE IF NOT EXISTS dk_glossar (
  id          SERIAL PRIMARY KEY,
  production_id TEXT NOT NULL,
  kuerzel     TEXT NOT NULL,
  name        TEXT NOT NULL,
  erklaerung  TEXT NOT NULL DEFAULT '',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dk_glossar_production ON dk_glossar(production_id);
