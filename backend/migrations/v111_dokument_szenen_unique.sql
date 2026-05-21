-- v111: Add UNIQUE constraint on dokument_szenen(werkstufe_id, scene_identity_id)
-- Required for ON CONFLICT clause in /resolve endpoint auto-create.
-- First deduplicate any existing rows (keep highest id per pair).

DELETE FROM dokument_szenen
WHERE id NOT IN (
  SELECT MAX(id)
  FROM dokument_szenen
  GROUP BY werkstufe_id, scene_identity_id
);

ALTER TABLE dokument_szenen
  ADD CONSTRAINT dokument_szenen_werk_si_unique
  UNIQUE (werkstufe_id, scene_identity_id);
