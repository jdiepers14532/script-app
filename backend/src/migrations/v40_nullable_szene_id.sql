-- v40: Make szene_id nullable in scene_characters and szenen_vorstopp
-- This allows the new scene_identity_id-based system to work without a szene reference.
-- A check constraint ensures at least one of szene_id or scene_identity_id is set.

ALTER TABLE scene_characters ALTER COLUMN szene_id DROP NOT NULL;
ALTER TABLE szenen_vorstopp ALTER COLUMN szene_id DROP NOT NULL;

-- Ensure at least one foreign key is set
ALTER TABLE scene_characters DROP CONSTRAINT IF EXISTS chk_scene_chars_has_ref;
ALTER TABLE scene_characters ADD CONSTRAINT chk_scene_chars_has_ref
  CHECK (szene_id IS NOT NULL OR scene_identity_id IS NOT NULL);

ALTER TABLE szenen_vorstopp DROP CONSTRAINT IF EXISTS chk_vorstopp_has_ref;
ALTER TABLE szenen_vorstopp ADD CONSTRAINT chk_vorstopp_has_ref
  CHECK (szene_id IS NOT NULL OR scene_identity_id IS NOT NULL);
