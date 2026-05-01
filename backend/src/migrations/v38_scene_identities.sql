-- v38: Scene Identities + Dokument-Szenen (Szenen-Fassungen-System)
-- Neue Tabellen parallel zu bestehenden szenen/stages — kein Breaking Change

-- 1. Scene Identities: stabile UUID pro Szene ueber alle Fassungen
CREATE TABLE IF NOT EXISTS scene_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staffel_id TEXT NOT NULL REFERENCES staffeln(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_scene_identity_staffel ON scene_identities(staffel_id);

-- 2. Dokument-Szenen: Scene-Header pro Fassung (ersetzt szenen-Tabelle)
CREATE TABLE IF NOT EXISTS dokument_szenen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fassung_id UUID NOT NULL REFERENCES folgen_dokument_fassungen(id) ON DELETE CASCADE,
  scene_identity_id UUID NOT NULL REFERENCES scene_identities(id) ON DELETE CASCADE,
  sort_order INT NOT NULL DEFAULT 0,
  scene_nummer INT NOT NULL,
  scene_nummer_suffix VARCHAR(5),
  ort_name TEXT,
  int_ext TEXT DEFAULT 'INT',
  tageszeit TEXT DEFAULT 'TAG',
  spieltag INT,
  zusammenfassung TEXT,
  stimmung TEXT,
  spielzeit TEXT,
  szeneninfo TEXT,
  seiten TEXT,
  dauer_min INT,
  dauer_sek INT,
  is_wechselschnitt BOOLEAN DEFAULT FALSE,
  content JSONB DEFAULT '[]',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT,
  UNIQUE(fassung_id, scene_identity_id)
);
CREATE INDEX IF NOT EXISTS idx_dok_szenen_fassung ON dokument_szenen(fassung_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_dok_szenen_identity ON dokument_szenen(scene_identity_id);

-- 3. scene_characters: neue parallele FK-Spalte
ALTER TABLE scene_characters
  ADD COLUMN IF NOT EXISTS scene_identity_id UUID REFERENCES scene_identities(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_scene_chars_identity ON scene_characters(scene_identity_id);

-- 4. szenen_vorstopp: neue parallele FK-Spalte
ALTER TABLE szenen_vorstopp
  ADD COLUMN IF NOT EXISTS scene_identity_id UUID REFERENCES scene_identities(id) ON DELETE CASCADE;

-- 5. User-Setting: Ansichtsmodus (per_document = jeder Typ eigene Koepfe)
INSERT INTO app_settings (key, value) VALUES
  ('scene_header_view_mode', 'per_document')
ON CONFLICT (key) DO NOTHING;
