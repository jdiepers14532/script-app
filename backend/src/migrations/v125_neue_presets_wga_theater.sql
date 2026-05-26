-- v125: WGA Sitcom Multi-Camera + Theaterstück (Samuel French) + BBC TV Drama Korrekturen

-- sort_order anpassen: Platz für WGA bei Position 3
UPDATE absatzformat_presets SET sort_order = 4 WHERE name = 'Rote Rosen Daily-Drehbuch';
UPDATE absatzformat_presets SET sort_order = 5 WHERE name = 'ARD/ZDF Fernsehfilm';
UPDATE absatzformat_presets SET sort_order = 6 WHERE name = 'BBC TV Drama';
UPDATE absatzformat_presets SET sort_order = 7 WHERE name = 'US Screenplay (Hollywood)';

-- BBC TV Drama: Character korrekt zentriert (war margin_left: 2.5) + Seitenränder setzen
UPDATE absatzformat_presets
SET
  seitenformat = 'a4',
  page_margins = '{"top": 2.54, "right": 2.54, "bottom": 3.0, "left": 3.81}'::jsonb,
  szenen_kopf_template = '{{innen_aussen}}. {{motiv}} – {{dt}}',
  formate = '[
    {"name":"Scene Heading","kuerzel":"SH","kategorie":"drehbuch","font_family":"Courier Prime","font_size":12,"bold":true,"italic":false,"underline":false,"uppercase":true,"text_align":"left","margin_left":0,"margin_right":0,"space_before":24,"space_after":12,"line_height":1.0,"sort_order":1,"enter_next":"Action","tab_next":null},
    {"name":"Action","kuerzel":"ACT","kategorie":"drehbuch","font_family":"Courier Prime","font_size":12,"bold":false,"italic":false,"underline":false,"uppercase":false,"text_align":"left","margin_left":0,"margin_right":0,"space_before":12,"space_after":0,"line_height":1.0,"sort_order":2,"ist_standard":true,"enter_next":"Action","tab_next":"Character"},
    {"name":"Character","kuerzel":"CHAR","kategorie":"drehbuch","font_family":"Courier Prime","font_size":12,"bold":false,"italic":false,"underline":false,"uppercase":true,"text_align":"center","margin_left":0,"margin_right":0,"space_before":12,"space_after":0,"line_height":1.0,"sort_order":3,"enter_next":"Dialogue","tab_next":"Action"},
    {"name":"Dialogue","kuerzel":"DIA","kategorie":"drehbuch","font_family":"Courier Prime","font_size":12,"bold":false,"italic":false,"underline":false,"uppercase":false,"text_align":"left","margin_left":1.5,"margin_right":1.5,"space_before":0,"space_after":0,"line_height":1.0,"sort_order":4,"enter_next":"Character","tab_next":"Parenthetical"},
    {"name":"Parenthetical","kuerzel":"PAR","kategorie":"drehbuch","font_family":"Courier Prime","font_size":12,"bold":false,"italic":false,"underline":false,"uppercase":false,"text_align":"left","margin_left":2.0,"margin_right":2.0,"space_before":0,"space_after":0,"line_height":1.0,"sort_order":5,"enter_next":"Dialogue","tab_next":"Action"},
    {"name":"Transition","kuerzel":"TRANS","kategorie":"drehbuch","font_family":"Courier Prime","font_size":12,"bold":false,"italic":false,"underline":false,"uppercase":true,"text_align":"right","margin_left":0,"margin_right":0,"space_before":12,"space_after":12,"line_height":1.0,"sort_order":6,"enter_next":"Scene Heading","tab_next":"Action"}
  ]'::jsonb
WHERE name = 'BBC TV Drama';

-- WGA Sitcom Multi-Camera (Position 3)
-- Breite Ränder beidseitig (je 3,81 cm) als Shot-Card-Fläche für Kameramänner.
-- Doppelter Zeilenabstand + Action in CAPS = Annotationsraum für Regisseur-Blocking.
INSERT INTO absatzformat_presets (name, beschreibung, ist_system, sort_order, seitenformat, page_margins, szenen_kopf_template, formate)
VALUES (
  'WGA Sitcom Multi-Camera',
  'Hollywood Multi-Kamera-Sitcom: doppelter Zeilenabstand, Action in GROSSBUCHSTABEN, Figurenname zentriert. Breite Seitenraender beidseitig (je 3,81 cm) als Shot-Card-Flaeche fuer Kameramaenner und Regisseur-Blocking.',
  true,
  3,
  'a4',
  '{"top": 2.54, "right": 3.81, "bottom": 2.54, "left": 3.81}'::jsonb,
  '{{innen_aussen}}. {{motiv}} - {{dt}}',
  '[
    {"name":"ACT Heading","kuerzel":"ACTH","kategorie":"drehbuch","font_family":"Courier Prime","font_size":12,"bold":true,"italic":false,"underline":true,"uppercase":true,"text_align":"center","margin_left":0,"margin_right":0,"space_before":36,"space_after":24,"line_height":1.0,"sort_order":0,"enter_next":"Scene Heading","tab_next":null},
    {"name":"Scene Heading","kuerzel":"SH","kategorie":"drehbuch","font_family":"Courier Prime","font_size":12,"bold":true,"italic":false,"underline":false,"uppercase":true,"text_align":"left","margin_left":0,"margin_right":0,"space_before":24,"space_after":0,"line_height":1.0,"sort_order":1,"enter_next":"Action","tab_next":null},
    {"name":"Action","kuerzel":"ACT","kategorie":"drehbuch","font_family":"Courier Prime","font_size":12,"bold":false,"italic":false,"underline":false,"uppercase":true,"text_align":"left","margin_left":0,"margin_right":0,"space_before":0,"space_after":0,"line_height":2.0,"sort_order":2,"ist_standard":true,"enter_next":"Action","tab_next":"Character"},
    {"name":"Character","kuerzel":"CHAR","kategorie":"drehbuch","font_family":"Courier Prime","font_size":12,"bold":false,"italic":false,"underline":false,"uppercase":true,"text_align":"center","margin_left":0,"margin_right":0,"space_before":12,"space_after":0,"line_height":1.0,"sort_order":3,"enter_next":"Dialogue","tab_next":"Action"},
    {"name":"Dialogue","kuerzel":"DIA","kategorie":"drehbuch","font_family":"Courier Prime","font_size":12,"bold":false,"italic":false,"underline":false,"uppercase":false,"text_align":"left","margin_left":1.3,"margin_right":1.3,"space_before":0,"space_after":0,"line_height":2.0,"sort_order":4,"enter_next":"Character","tab_next":"Parenthetical"},
    {"name":"Parenthetical","kuerzel":"PAR","kategorie":"drehbuch","font_family":"Courier Prime","font_size":12,"bold":false,"italic":false,"underline":false,"uppercase":false,"text_align":"left","margin_left":2.0,"margin_right":2.0,"space_before":0,"space_after":0,"line_height":1.0,"sort_order":5,"enter_next":"Dialogue","tab_next":"Action"},
    {"name":"Transition","kuerzel":"TRANS","kategorie":"drehbuch","font_family":"Courier Prime","font_size":12,"bold":false,"italic":false,"underline":false,"uppercase":true,"text_align":"right","margin_left":0,"margin_right":0,"space_before":12,"space_after":12,"line_height":1.0,"sort_order":6,"enter_next":"Scene Heading","tab_next":"Action"}
  ]'::jsonb
)
ON CONFLICT (name) DO NOTHING;

-- Theaterstück (Samuel French Format, Position 8)
-- Kein Slug-Line-System. Figurenname zentriert, Dialog volle Spalte, Regieanweisung kursiv eingerueckt.
INSERT INTO absatzformat_presets (name, beschreibung, ist_system, sort_order, seitenformat, page_margins, szenen_kopf_template, formate)
VALUES (
  'Theaterstück (Samuel French)',
  'Samuel French Format — faktischer Standard fuer englischsprachige Buehnenstuecke. Kein Slug-Line-System (kein INT./EXT./TAG). Figurenname zentriert, Dialog volle Spaltenbreite, Regieanweisung kursiv eingerueckt.',
  true,
  8,
  'a4',
  '{"top": 2.54, "right": 2.54, "bottom": 2.54, "left": 3.81}'::jsonb,
  '{{motiv}}',
  '[
    {"name":"Akt","kuerzel":"AKT","kategorie":"drehbuch","font_family":"Courier Prime","font_size":12,"bold":true,"italic":false,"underline":false,"uppercase":true,"text_align":"center","margin_left":0,"margin_right":0,"space_before":36,"space_after":12,"line_height":1.0,"sort_order":1,"enter_next":"Szene","tab_next":null},
    {"name":"Szene","kuerzel":"SZ","kategorie":"drehbuch","font_family":"Courier Prime","font_size":12,"bold":false,"italic":false,"underline":false,"uppercase":true,"text_align":"center","margin_left":0,"margin_right":0,"space_before":24,"space_after":12,"line_height":1.0,"sort_order":2,"enter_next":"Regieanweisung","tab_next":null},
    {"name":"Regieanweisung","kuerzel":"RGI","kategorie":"drehbuch","font_family":"Courier Prime","font_size":12,"bold":false,"italic":true,"underline":false,"uppercase":false,"text_align":"left","margin_left":1.5,"margin_right":1.5,"space_before":6,"space_after":6,"line_height":1.0,"sort_order":3,"ist_standard":true,"enter_next":"Figurenname","tab_next":"Dialog"},
    {"name":"Figurenname","kuerzel":"FIG","kategorie":"drehbuch","font_family":"Courier Prime","font_size":12,"bold":false,"italic":false,"underline":false,"uppercase":true,"text_align":"center","margin_left":0,"margin_right":0,"space_before":18,"space_after":0,"line_height":1.0,"sort_order":4,"enter_next":"Dialog","tab_next":"Regieanweisung"},
    {"name":"Dialog","kuerzel":"DIA","kategorie":"drehbuch","font_family":"Courier Prime","font_size":12,"bold":false,"italic":false,"underline":false,"uppercase":false,"text_align":"left","margin_left":0,"margin_right":0,"space_before":0,"space_after":0,"line_height":1.2,"sort_order":5,"enter_next":"Figurenname","tab_next":"Regieanweisung"}
  ]'::jsonb
)
ON CONFLICT (name) DO NOTHING;
