-- v110: Backfill replik_count for all existing dokument_szenen
-- countTotalRepliken logic: screenplay_element[element_type=character] + absatz[format_name in (character,rolle,figur)]
UPDATE dokument_szenen
SET replik_count = (
  SELECT COALESCE(SUM(CASE
    WHEN node->>'type' = 'screenplay_element'
      AND node->'attrs'->>'element_type' = 'character' THEN 1
    WHEN node->>'type' = 'absatz'
      AND lower(node->'attrs'->>'format_name') IN ('character', 'rolle', 'figur') THEN 1
    ELSE 0
  END), 0)::int
  FROM jsonb_array_elements(content) AS node
)
WHERE content IS NOT NULL
  AND jsonb_typeof(content) = 'array'
  AND geloescht = false;
