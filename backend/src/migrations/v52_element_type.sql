-- v52: Add element_type column + make scene_identity_id nullable for non-scene elements

-- 1. New column: element_type
ALTER TABLE dokument_szenen
  ADD COLUMN IF NOT EXISTS element_type TEXT NOT NULL DEFAULT 'scene';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dokument_szenen_element_type_check'
  ) THEN
    ALTER TABLE dokument_szenen
      ADD CONSTRAINT dokument_szenen_element_type_check
      CHECK (element_type IN ('scene', 'cover', 'synopsis', 'memo'));
  END IF;
END $$;

-- 2. Make scene_identity_id nullable (non-scene elements don't have a scene identity)
ALTER TABLE dokument_szenen ALTER COLUMN scene_identity_id DROP NOT NULL;

-- 3. scene_nummer also nullable for non-scene elements
ALTER TABLE dokument_szenen ALTER COLUMN scene_nummer DROP NOT NULL;

-- 4. Constraint: scenes must have scene_identity_id, non-scenes may be NULL
ALTER TABLE dokument_szenen DROP CONSTRAINT IF EXISTS chk_dok_szenen_identity;
ALTER TABLE dokument_szenen ADD CONSTRAINT chk_dok_szenen_identity
  CHECK (element_type != 'scene' OR scene_identity_id IS NOT NULL);
