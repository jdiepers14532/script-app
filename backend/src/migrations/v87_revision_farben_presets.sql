-- v87: Globale Revisions-Farben-Presets (app-weit, nicht pro Produktion)
CREATE TABLE IF NOT EXISTS revision_farben_presets (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  farben      JSONB NOT NULL DEFAULT '[]',
  erstellt_von TEXT,
  erstellt_am  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
