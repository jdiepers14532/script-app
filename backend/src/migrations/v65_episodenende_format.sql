-- v65: Absatzformat "Episodenende" (bold + zentriert)
-- Wird beim Import fuer "Ende der Folge/Episode nn" Text verwendet

-- Format in alle bestehenden Produktionen einfuegen
INSERT INTO absatzformate (produktion_id, name, kuerzel, kategorie, font_family, font_size,
  bold, italic, underline, uppercase, text_align,
  margin_left, margin_right, space_before, space_after, line_height,
  sort_order, ist_standard)
SELECT p.id, 'Episodenende', 'END', 'drehbuch', 'Courier Prime', 12,
  true, false, false, false, 'center',
  0, 0, 24, 12, 1.0,
  8, false
FROM produktionen p
WHERE NOT EXISTS (
  SELECT 1 FROM absatzformate a WHERE a.produktion_id = p.id AND a.name = 'Episodenende'
);

-- Preset aktualisieren: Episodenende-Format zum Daily-Standard hinzufuegen
UPDATE absatzformat_presets
SET formate = formate || '[{"name":"Episodenende","kuerzel":"END","kategorie":"drehbuch","font_family":"Courier Prime","font_size":12,"bold":true,"italic":false,"uppercase":false,"text_align":"center","margin_left":0,"margin_right":0,"space_before":24,"space_after":12,"line_height":1.0,"sort_order":8,"enter_next":"Action","tab_next":null}]'::jsonb
WHERE name = 'Serienwerft Daily-Standard'
  AND NOT formate @> '[{"name":"Episodenende"}]'::jsonb;
