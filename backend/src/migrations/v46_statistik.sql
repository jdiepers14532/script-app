-- v46: Statistik-System — werkstufe_id auf scene_characters + Vorlagen-Tabelle

-- 1. scene_characters wird werkstufen-aware (fuer Versionsvergleich)
ALTER TABLE scene_characters
  ADD COLUMN IF NOT EXISTS werkstufe_id UUID REFERENCES werkstufen(id) ON DELETE CASCADE;

-- Index fuer schnelle Abfragen pro Werkstufe
CREATE INDEX IF NOT EXISTS idx_scene_chars_werkstufe
  ON scene_characters (werkstufe_id) WHERE werkstufe_id IS NOT NULL;

-- Unique pro Werkstufe+Szene+Character (erlaubt verschiedene Werte pro Version)
CREATE UNIQUE INDEX IF NOT EXISTS idx_scene_chars_ws_identity_char
  ON scene_characters (werkstufe_id, scene_identity_id, character_id)
  WHERE werkstufe_id IS NOT NULL AND scene_identity_id IS NOT NULL;

-- 2. Gespeicherte Statistik-Vorlagen
CREATE TABLE IF NOT EXISTS statistik_vorlagen (
  id            SERIAL PRIMARY KEY,
  staffel_id    TEXT NOT NULL REFERENCES staffeln(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  abfrage_typ   TEXT NOT NULL,
  parameter     JSONB NOT NULL DEFAULT '{}',
  erstellt_von  TEXT,
  erstellt_am   TIMESTAMPTZ DEFAULT NOW(),
  sortierung    INT DEFAULT 0
);
