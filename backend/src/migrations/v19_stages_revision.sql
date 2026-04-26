-- v15: Stage-Labels + Revision-System

CREATE TABLE IF NOT EXISTS stage_labels (
  id SERIAL PRIMARY KEY,
  staffel_id TEXT NOT NULL REFERENCES staffeln(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INT DEFAULT 0,
  is_produktionsfassung BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (staffel_id, name)
);
CREATE INDEX IF NOT EXISTS idx_stage_labels_staffel ON stage_labels(staffel_id, sort_order);

-- WGA-Standard-Revisionsfarben (Seed pro Produktion via App-Code)
CREATE TABLE IF NOT EXISTS revision_colors (
  id SERIAL PRIMARY KEY,
  staffel_id TEXT NOT NULL REFERENCES staffeln(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  sort_order INT DEFAULT 0,
  UNIQUE (staffel_id, name)
);
CREATE INDEX IF NOT EXISTS idx_revision_colors_staffel ON revision_colors(staffel_id, sort_order);

CREATE TABLE IF NOT EXISTS revision_export_einstellungen (
  staffel_id TEXT PRIMARY KEY REFERENCES staffeln(id) ON DELETE CASCADE,
  memo_schwellwert_zeichen INT NOT NULL DEFAULT 100,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Delta-Tracking für Revisionen (Option B)
CREATE TABLE IF NOT EXISTS szenen_revisionen (
  id SERIAL PRIMARY KEY,
  szene_id INT NOT NULL REFERENCES szenen(id) ON DELETE CASCADE,
  stage_id INT NOT NULL REFERENCES stages(id) ON DELETE CASCADE,
  field_type TEXT NOT NULL CHECK (field_type IN ('header', 'content_block')),
  field_name TEXT,           -- bei header: 'ort_name', 'seiten', 'spieltag', etc.
  block_index INT,           -- bei content_block: Index im content-Array
  block_type TEXT,           -- 'dialog' | 'action' | 'heading' | ...
  speaker TEXT,              -- bei dialog-Blöcken
  old_value TEXT,
  new_value TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_szenen_rev_szene ON szenen_revisionen(szene_id, stage_id);

-- stages: neue Spalten
ALTER TABLE stages ADD COLUMN IF NOT EXISTS label_id INT REFERENCES stage_labels(id) ON DELETE SET NULL;
ALTER TABLE stages ADD COLUMN IF NOT EXISTS revision_color_id INT REFERENCES revision_colors(id) ON DELETE SET NULL;
ALTER TABLE stages ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;
ALTER TABLE stages ADD COLUMN IF NOT EXISTS revised_at TIMESTAMPTZ;

-- Default stage_labels für bestehende Staffeln
INSERT INTO stage_labels (staffel_id, name, sort_order, is_produktionsfassung)
SELECT s.id, l.name, l.sort_order, l.is_prod
FROM staffeln s
CROSS JOIN (VALUES
  ('Abstrakt',         1, FALSE),
  ('Interner Storyline',2, FALSE),
  ('Edit-Fassung',     3, FALSE),
  ('Endfassung',       4, TRUE)
) AS l(name, sort_order, is_prod)
ON CONFLICT (staffel_id, name) DO NOTHING;

-- WGA-Standard-Revisionsfarben für bestehende Staffeln
INSERT INTO revision_colors (staffel_id, name, color, sort_order)
SELECT s.id, r.name, r.color, r.sort_order
FROM staffeln s
CROSS JOIN (VALUES
  ('Blaue Seiten',       '#4A90D9', 1),
  ('Pinke Seiten',       '#FF69B4', 2),
  ('Gelbe Seiten',       '#FFD700', 3),
  ('Grüne Seiten',       '#00A651', 4),
  ('Goldgelbe Seiten',   '#DAA520', 5),
  ('Buff-Seiten',        '#D4B896', 6),
  ('Lachs-Seiten',       '#FA8072', 7),
  ('Kirsch-Seiten',      '#DC143C', 8),
  ('Tan-Seiten',         '#C8A882', 9),
  ('Elfenbein-Seiten',   '#FFFFF0',10)
) AS r(name, color, sort_order)
ON CONFLICT (staffel_id, name) DO NOTHING;
