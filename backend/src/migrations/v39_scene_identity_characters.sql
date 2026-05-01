-- v39: Add unique constraint for scene_identity_id + character_id
-- Needed for ON CONFLICT in the new scene-identity-based character endpoints

CREATE UNIQUE INDEX IF NOT EXISTS idx_scene_chars_identity_char
  ON scene_characters (scene_identity_id, character_id)
  WHERE scene_identity_id IS NOT NULL;
