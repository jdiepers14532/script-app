CREATE TABLE IF NOT EXISTS staffeln (
  id TEXT PRIMARY KEY,
  titel TEXT NOT NULL,
  show_type TEXT DEFAULT 'daily_soap',
  produktion_db_id UUID,
  meta_json JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bloecke (
  id SERIAL PRIMARY KEY,
  staffel_id TEXT REFERENCES staffeln(id) ON DELETE CASCADE,
  block_nummer INT NOT NULL,
  name TEXT,
  sort_order INT DEFAULT 0,
  meta_json JSONB DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS episoden (
  id SERIAL PRIMARY KEY,
  block_id INT REFERENCES bloecke(id) ON DELETE CASCADE,
  episode_nummer INT NOT NULL,
  staffel_nummer INT DEFAULT 1,
  arbeitstitel TEXT,
  air_date DATE,
  synopsis TEXT,
  meta_json JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stages (
  id SERIAL PRIMARY KEY,
  episode_id INT REFERENCES episoden(id) ON DELETE CASCADE,
  stage_type TEXT NOT NULL CHECK (stage_type IN ('expose','treatment','draft','final')),
  version_nummer INT DEFAULT 1,
  version_label TEXT,
  status TEXT DEFAULT 'in_arbeit' CHECK (status IN ('in_arbeit','review','freigegeben','archiviert')),
  erstellt_von TEXT,
  erstellt_am TIMESTAMPTZ DEFAULT NOW(),
  is_locked BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS szenen (
  id SERIAL PRIMARY KEY,
  stage_id INT REFERENCES stages(id) ON DELETE CASCADE,
  scene_nummer INT NOT NULL,
  int_ext TEXT DEFAULT 'INT' CHECK (int_ext IN ('INT','EXT','INT/EXT')),
  tageszeit TEXT DEFAULT 'TAG' CHECK (tageszeit IN ('TAG','NACHT','ABEND','DÄMMERUNG')),
  ort_name TEXT,
  zusammenfassung TEXT,
  content JSONB DEFAULT '[]',
  dauer_min INT,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed-Daten für Tests
INSERT INTO staffeln (id, titel, show_type) VALUES
  ('rote-rosen', 'Rote Rosen', 'daily_soap'),
  ('sturm-der-liebe', 'Sturm der Liebe', 'daily_soap')
ON CONFLICT DO NOTHING;

INSERT INTO bloecke (staffel_id, block_nummer, name, sort_order) VALUES
  ('rote-rosen', 28, 'Block 28', 1),
  ('rote-rosen', 29, 'Block 29', 2)
ON CONFLICT DO NOTHING;
