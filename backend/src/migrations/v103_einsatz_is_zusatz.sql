-- v103: is_zusatz Kennzeichnung auf autorenplan_einsaetze
ALTER TABLE autorenplan_einsaetze
  ADD COLUMN IF NOT EXISTS is_zusatz BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_einsaetze_is_zusatz
  ON autorenplan_einsaetze(produktion_db_id, is_zusatz)
  WHERE is_zusatz = TRUE;
