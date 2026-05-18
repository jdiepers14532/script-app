-- v101: kat_nr (Benutzer-definierte Kat.-Nummer) auf autorenplan_gage_kategorien
ALTER TABLE autorenplan_gage_kategorien
  ADD COLUMN IF NOT EXISTS kat_nr INT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_autorenplan_gage_kat_nr
  ON autorenplan_gage_kategorien(kat_nr)
  WHERE kat_nr IS NOT NULL;
