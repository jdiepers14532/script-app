-- v118: Produktion-spezifische Labels für freie Dokumente
CREATE TABLE IF NOT EXISTS freie_dokument_labels (
  id           SERIAL PRIMARY KEY,
  produktion_id TEXT NOT NULL REFERENCES produktionen(id) ON DELETE CASCADE,
  label_name   TEXT NOT NULL,
  sort_order   INT  NOT NULL DEFAULT 0,
  erstellt_am  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(produktion_id, label_name)
);
