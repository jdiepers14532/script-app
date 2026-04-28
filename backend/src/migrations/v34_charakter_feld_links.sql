-- v34: Charakter-Feld-Verknüpfungen (character_ref type)

CREATE TABLE IF NOT EXISTS charakter_feld_links (
  id SERIAL PRIMARY KEY,
  source_character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  feld_id INTEGER NOT NULL REFERENCES charakter_felder_config(id) ON DELETE CASCADE,
  linked_character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source_character_id, feld_id, linked_character_id)
);

CREATE INDEX IF NOT EXISTS idx_feld_links_source ON charakter_feld_links(source_character_id, feld_id);

-- Update Eltern + Kinder/Verwandte to character_ref type in all existing staffeln
UPDATE charakter_felder_config
SET typ = 'character_ref'
WHERE name IN ('Eltern', 'Kinder / Verwandte');
