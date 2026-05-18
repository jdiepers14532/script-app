-- v100: gage_kategorie_id auf autorenplan_einsaetze (Verweis auf globale Gagenkategorien)
ALTER TABLE autorenplan_einsaetze
  ADD COLUMN IF NOT EXISTS gage_kategorie_id UUID REFERENCES autorenplan_gage_kategorien(id) ON DELETE SET NULL;
