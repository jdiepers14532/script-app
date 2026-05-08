-- v53: ist_studio field on motive + auto-create default character_kategorien
-- ist_studio = true for studio motive, false for Außendreh (A.D.) motive

ALTER TABLE motive ADD COLUMN IF NOT EXISTS ist_studio BOOLEAN NOT NULL DEFAULT true;

-- Update existing motive: set ist_studio = false for A.D. variants
UPDATE motive
SET ist_studio = false
WHERE name ~* '^A\.?\s*D\.?\s+'
   OR name ~* '^Außendreh';

-- Strip A.D. prefix from existing motiv names and set ist_studio = false
UPDATE motive
SET name = TRIM(REGEXP_REPLACE(name, '^A\.?\s*D\.?\s+', '', 'i')),
    ist_studio = false
WHERE name ~* '^A\.?\s*D\.?\s+';

-- Ensure default character_kategorien exist for all produktionen that have characters
INSERT INTO character_kategorien (produktion_id, name, typ, sort_order)
SELECT DISTINCT cp.produktion_id, 'Episoden-Rolle', 'rolle', 1
FROM character_productions cp
WHERE NOT EXISTS (
  SELECT 1 FROM character_kategorien ck
  WHERE ck.produktion_id = cp.produktion_id AND ck.typ = 'rolle'
)
ON CONFLICT (produktion_id, name) DO NOTHING;

INSERT INTO character_kategorien (produktion_id, name, typ, sort_order)
SELECT DISTINCT cp.produktion_id, 'Komparse o.T.', 'komparse', 2
FROM character_productions cp
WHERE NOT EXISTS (
  SELECT 1 FROM character_kategorien ck
  WHERE ck.produktion_id = cp.produktion_id AND ck.typ = 'komparse'
)
ON CONFLICT (produktion_id, name) DO NOTHING;

-- Backfill kategorie_id on character_productions where NULL
UPDATE character_productions cp
SET kategorie_id = ck.id
FROM character_kategorien ck
WHERE cp.kategorie_id IS NULL
  AND ck.produktion_id = cp.produktion_id
  AND ck.typ = 'rolle'
  AND NOT EXISTS (
    SELECT 1 FROM characters c WHERE c.id = cp.character_id AND c.meta_json->>'is_komparse' = 'true'
  );

UPDATE character_productions cp
SET kategorie_id = ck.id
FROM character_kategorien ck
WHERE cp.kategorie_id IS NULL
  AND ck.produktion_id = cp.produktion_id
  AND ck.typ = 'komparse'
  AND EXISTS (
    SELECT 1 FROM characters c WHERE c.id = cp.character_id AND c.meta_json->>'is_komparse' = 'true'
  );
