-- v139: Konfigurierbare Tageszeit-Stimmungen pro Produktion
-- Loest den hardcodierten Cycler ['TAG','NACHT','ABEND'] in SceneEditor ab.
-- Die Reihenfolge der Stimmungen definiert die Tageslogik:
--   Letzter Eintrag (hoechste position) = letzte Stimmung des Tages
--   Uebergang von letzter Stimmung zu einer frueheren => neuer Spieltag (+1)

CREATE TABLE IF NOT EXISTS tageszeit_stimmungen (
  id SERIAL PRIMARY KEY,
  production_id TEXT NOT NULL,
  name TEXT NOT NULL,       -- z.B. "NACHT", "ZWIELICHT" (Original-Schreibweise)
  kuerzel TEXT NOT NULL,    -- z.B. "N", "Z" (max 3 Zeichen)
  position INT NOT NULL,    -- 0-basiert, aufsteigend = spaeter am Tag
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(production_id, name)
);

CREATE INDEX IF NOT EXISTS idx_tageszeit_stimmungen_prod ON tageszeit_stimmungen(production_id, position);
