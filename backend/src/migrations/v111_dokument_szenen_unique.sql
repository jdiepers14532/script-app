-- v111: Add UNIQUE constraint on dokument_szenen(werkstufe_id, scene_identity_id)
-- Required for ON CONFLICT clause in /resolve endpoint auto-create.
-- First deduplicate any existing rows (keep first row per pair via ROW_NUMBER).

DELETE FROM dokument_szenen
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY werkstufe_id, scene_identity_id ORDER BY id) AS rn
    FROM dokument_szenen
  ) sub
  WHERE rn > 1
);

ALTER TABLE dokument_szenen
  ADD CONSTRAINT dokument_szenen_werk_si_unique
  UNIQUE (werkstufe_id, scene_identity_id);
