-- v92: von_datum + bis_datum auf autorenplan_einsaetze
ALTER TABLE autorenplan_einsaetze
  ADD COLUMN IF NOT EXISTS von_datum DATE,
  ADD COLUMN IF NOT EXISTS bis_datum DATE;
