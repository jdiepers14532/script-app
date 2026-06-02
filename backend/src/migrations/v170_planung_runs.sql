-- v170: Planung-KI-Runs (fire-and-forget Storyline-Abgleich + Beziehungswiderspruch-Check)

CREATE TABLE IF NOT EXISTS planung_runs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produktion_id    TEXT REFERENCES produktionen(id) ON DELETE CASCADE,
  typ              TEXT NOT NULL
      CHECK (typ IN ('storyline_abgleich','beziehungs_check')),
  status           TEXT DEFAULT 'queued'
      CHECK (status IN ('queued','running','done','error')),
  ergebnis_json    JSONB,
  fehler           TEXT,
  erstellt_von     TEXT,
  erstellt_am      TIMESTAMPTZ DEFAULT NOW(),
  abgeschlossen_am TIMESTAMPTZ
);
