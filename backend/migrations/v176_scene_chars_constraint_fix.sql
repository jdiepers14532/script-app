-- v176: idx_scene_chars_identity_char auf werkstufe_id IS NULL einschränken
-- Vorher: UNIQUE (scene_identity_id, character_id) WHERE scene_identity_id IS NOT NULL
-- Nachher: UNIQUE (scene_identity_id, character_id) WHERE werkstufe_id IS NULL AND scene_identity_id IS NOT NULL
-- Dadurch blockiert der Constraint nicht mehr Rows mit werkstufe_id (die durch
-- idx_scene_chars_ws_identity_char abgesichert sind).

DROP INDEX IF EXISTS idx_scene_chars_identity_char;

CREATE UNIQUE INDEX idx_scene_chars_identity_char
  ON scene_characters (scene_identity_id, character_id)
  WHERE werkstufe_id IS NULL AND scene_identity_id IS NOT NULL;
