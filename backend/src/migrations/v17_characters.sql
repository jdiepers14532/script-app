-- v13: Charakter-System

CREATE TABLE IF NOT EXISTS characters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  meta_json JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_characters_name ON characters(name);

CREATE TABLE IF NOT EXISTS character_kategorien (
  id SERIAL PRIMARY KEY,
  staffel_id TEXT NOT NULL REFERENCES staffeln(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  typ TEXT NOT NULL CHECK (typ IN ('rolle', 'komparse')),
  sort_order INT DEFAULT 0,
  UNIQUE (staffel_id, name)
);
CREATE INDEX IF NOT EXISTS idx_char_kat_staffel ON character_kategorien(staffel_id, sort_order);

CREATE TABLE IF NOT EXISTS character_productions (
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  staffel_id TEXT NOT NULL REFERENCES staffeln(id) ON DELETE CASCADE,
  rollen_nummer INT,
  komparsen_nummer INT,
  kategorie_id INT REFERENCES character_kategorien(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (character_id, staffel_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_char_prod_rollen_nr
  ON character_productions (staffel_id, rollen_nummer)
  WHERE rollen_nummer IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_char_prod_komparsen_nr
  ON character_productions (staffel_id, komparsen_nummer)
  WHERE komparsen_nummer IS NOT NULL;

CREATE TABLE IF NOT EXISTS scene_characters (
  id SERIAL PRIMARY KEY,
  szene_id INT NOT NULL REFERENCES szenen(id) ON DELETE CASCADE,
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  kategorie_id INT REFERENCES character_kategorien(id) ON DELETE SET NULL,
  anzahl INT NOT NULL DEFAULT 1,
  ist_gruppe BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (szene_id, character_id)
);
CREATE INDEX IF NOT EXISTS idx_scene_chars_szene ON scene_characters(szene_id);
CREATE INDEX IF NOT EXISTS idx_scene_chars_char ON scene_characters(character_id);

-- Default-Kategorien für bestehende Staffeln einfügen
INSERT INTO character_kategorien (staffel_id, name, typ, sort_order)
SELECT s.id, k.name, k.typ, k.sort_order
FROM staffeln s
CROSS JOIN (VALUES
  ('Hauptrolle',     'rolle',    1),
  ('Episoden-Rolle', 'rolle',    2),
  ('Kleines Fach',   'rolle',    3),
  ('Komparse o.T.',  'komparse', 4)
) AS k(name, typ, sort_order)
ON CONFLICT (staffel_id, name) DO NOTHING;
