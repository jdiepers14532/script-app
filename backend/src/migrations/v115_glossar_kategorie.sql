-- v115: Kategorie-Feld für dk_glossar (steuert Import-Filterverhalten)
ALTER TABLE dk_glossar
  ADD COLUMN IF NOT EXISTS kategorie TEXT NOT NULL DEFAULT 'kuerzel';

ALTER TABLE dk_glossar_defaults
  ADD COLUMN IF NOT EXISTS kategorie TEXT NOT NULL DEFAULT 'kuerzel';
