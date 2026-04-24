-- v7: Add unique constraint on entities (entity_type, name, staffel_id)
-- Needed for ON CONFLICT DO NOTHING in import route
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'entities_unique' AND conrelid = 'entities'::regclass
  ) THEN
    -- Remove duplicate rows first (keep lowest id)
    DELETE FROM entities e1
    USING entities e2
    WHERE e1.id > e2.id
      AND e1.entity_type = e2.entity_type
      AND e1.name = e2.name
      AND (e1.staffel_id = e2.staffel_id OR (e1.staffel_id IS NULL AND e2.staffel_id IS NULL));

    ALTER TABLE entities ADD CONSTRAINT entities_unique
      UNIQUE (entity_type, name, staffel_id);
  END IF;
END $$;
