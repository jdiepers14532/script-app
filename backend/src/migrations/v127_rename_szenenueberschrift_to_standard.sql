-- v127: Rename Absatzformat 'Szenenueberschrift' -> 'Standard', kategorie 'drehbuch' -> 'alle'

-- 1. Bestehende absatzformate aller Produktionen umbenennen
UPDATE absatzformate
SET name = 'Standard', kategorie = 'alle'
WHERE name = 'Szenenueberschrift';

-- 2. Preset-JSON: Name + Kategorie des Eintrags umbenennen
UPDATE absatzformat_presets
SET formate = (
  SELECT jsonb_agg(
    CASE
      WHEN elem->>'name' = 'Szenenueberschrift'
      THEN elem || '{"name":"Standard","kategorie":"alle"}'::jsonb
      ELSE elem
    END
  )
  FROM jsonb_array_elements(formate) AS elem
);

-- 3. Preset-JSON: enter_next-Referenzen umschreiben
UPDATE absatzformat_presets
SET formate = (
  SELECT jsonb_agg(
    CASE
      WHEN elem->>'enter_next' = 'Szenenueberschrift'
      THEN jsonb_set(elem, '{enter_next}', '"Standard"')
      ELSE elem
    END
  )
  FROM jsonb_array_elements(formate) AS elem
);

-- 4. Preset-JSON: tab_next-Referenzen umschreiben (Absicherung)
UPDATE absatzformat_presets
SET formate = (
  SELECT jsonb_agg(
    CASE
      WHEN elem->>'tab_next' = 'Szenenueberschrift'
      THEN jsonb_set(elem, '{tab_next}', '"Standard"')
      ELSE elem
    END
  )
  FROM jsonb_array_elements(formate) AS elem
);
