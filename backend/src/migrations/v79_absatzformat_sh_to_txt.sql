-- v79: Rename absatzformat kuerzel SH → TXT
-- Hintergrund: Szenenköpfe leben im SceneEditor, nicht im Content.
-- Daher ist das Label "SH" (Scene Heading) irreführend — umbenannt in "TXT" (Text).
-- Die Formatierung (uppercase, bold etc.) bleibt unverändert.

UPDATE absatzformate SET kuerzel = 'TXT' WHERE kuerzel = 'SH';

-- Auch in den Preset-JSONB-Feldern aktualisieren
UPDATE absatzformat_presets
SET formate = REPLACE(formate::text, '"kuerzel":"SH"', '"kuerzel":"TXT"')::jsonb
WHERE formate::text LIKE '%"kuerzel":"SH"%';
