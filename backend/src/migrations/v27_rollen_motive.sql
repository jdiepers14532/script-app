-- v27: Rollen-Fotos, Motive, konfigurierbare Felder, Beziehungen

-- Foto-Tabelle für Charaktere (Rollen + Komparsen)
CREATE TABLE IF NOT EXISTS charakter_fotos (
  id            SERIAL PRIMARY KEY,
  character_id  UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  dateiname     TEXT NOT NULL,
  originalname  TEXT NOT NULL,
  label         TEXT,
  sort_order    INTEGER DEFAULT 0,
  ist_primaer   BOOLEAN DEFAULT FALSE,
  hochgeladen_am TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_charakter_fotos_character ON charakter_fotos(character_id);

-- Motive (eigene Entität)
CREATE TABLE IF NOT EXISTS motive (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staffel_id   TEXT NOT NULL REFERENCES staffeln(id) ON DELETE CASCADE,
  motiv_nummer TEXT,
  name         TEXT NOT NULL,
  typ          TEXT DEFAULT 'interior',
  meta_json    JSONB DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_motive_staffel ON motive(staffel_id);

CREATE TABLE IF NOT EXISTS motiv_fotos (
  id            SERIAL PRIMARY KEY,
  motiv_id      UUID NOT NULL REFERENCES motive(id) ON DELETE CASCADE,
  dateiname     TEXT NOT NULL,
  originalname  TEXT NOT NULL,
  label         TEXT,
  sort_order    INTEGER DEFAULT 0,
  ist_primaer   BOOLEAN DEFAULT FALSE,
  hochgeladen_am TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_motiv_fotos_motiv ON motiv_fotos(motiv_id);

-- Konfigurierbare Felder (pro Staffel)
CREATE TABLE IF NOT EXISTS charakter_felder_config (
  id          SERIAL PRIMARY KEY,
  staffel_id  TEXT NOT NULL REFERENCES staffeln(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  typ         TEXT NOT NULL DEFAULT 'text',
  optionen    JSONB DEFAULT '[]',
  sort_order  INTEGER DEFAULT 0,
  gilt_fuer   TEXT NOT NULL DEFAULT 'alle',
  UNIQUE(staffel_id, name, gilt_fuer)
);
CREATE INDEX IF NOT EXISTS idx_felder_config_staffel ON charakter_felder_config(staffel_id);

-- Feldwerte
CREATE TABLE IF NOT EXISTS charakter_feldwerte (
  id           SERIAL PRIMARY KEY,
  character_id UUID REFERENCES characters(id) ON DELETE CASCADE,
  motiv_id     UUID REFERENCES motive(id) ON DELETE CASCADE,
  feld_id      INTEGER NOT NULL REFERENCES charakter_felder_config(id) ON DELETE CASCADE,
  wert_text    TEXT,
  wert_json    JSONB,
  CHECK (character_id IS NOT NULL OR motiv_id IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_feldwerte_character_feld ON charakter_feldwerte(character_id, feld_id) WHERE character_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_feldwerte_motiv_feld ON charakter_feldwerte(motiv_id, feld_id) WHERE motiv_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_feldwerte_character ON charakter_feldwerte(character_id);
CREATE INDEX IF NOT EXISTS idx_feldwerte_motiv     ON charakter_feldwerte(motiv_id);

-- Beziehungen zwischen Charakteren
CREATE TABLE IF NOT EXISTS charakter_beziehungen (
  id                   SERIAL PRIMARY KEY,
  character_id         UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  related_character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  beziehungstyp        TEXT NOT NULL,
  label                TEXT,
  UNIQUE(character_id, related_character_id, beziehungstyp)
);

-- is_active flag auf character_productions
ALTER TABLE character_productions ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- figuren_label in app_settings
INSERT INTO app_settings (key, value, updated_at)
VALUES ('figuren_label', 'Rollen', NOW())
ON CONFLICT (key) DO NOTHING;
