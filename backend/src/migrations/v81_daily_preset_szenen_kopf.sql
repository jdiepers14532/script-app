-- v81: Rote Rosen Daily-Drehbuch Preset + szenen_kopf_template Feld

-- Neues Feld fuer konfigurierbare Szenenkopf-Vorlage pro Preset
ALTER TABLE absatzformat_presets ADD COLUMN IF NOT EXISTS szenen_kopf_template TEXT;

-- Bestehende System-Presets mit Standard-Szenenkopf-Vorlage versehen
UPDATE absatzformat_presets
SET szenen_kopf_template = '{{innen_aussen}}. {{motiv}} – {{dt}}'
WHERE ist_system = true AND szenen_kopf_template IS NULL;

-- Neues System-Preset: Rote Rosen Daily-Drehbuch
-- Nur Drehbuch-Formate (keine Storyline/Notiz) — beim Anwenden werden
-- vorhandene Storyline/Notiz-Formate der Produktion beibehalten.
-- Formatierungswerte direkt aus Final-Draft-Datei (Staffel 24, Ep. 4402) extrahiert.
-- Seitenraender: links 1.5", rechts 1.0" (US Letter 8.5") — Einzuege relativ dazu.
INSERT INTO absatzformat_presets (name, beschreibung, ist_system, szenen_kopf_template, formate)
VALUES (
  'Rote Rosen Daily-Drehbuch',
  'Exakte Final-Draft-Formatierung der Rote-Rosen-Produktion. Nur Drehbuch-Formate — vorhandene Storyline- und Notiz-Formate bleiben beim Anwenden erhalten.',
  true,
  '{{innen_aussen}}. {{motiv}} – {{dt}}',
  '[
    {"name":"Action","kuerzel":"ACT","kategorie":"drehbuch","font_family":"Courier Prime","font_size":12,"bold":false,"italic":false,"underline":false,"uppercase":false,"text_align":"left","margin_left":0,"margin_right":0,"space_before":11,"space_after":0,"line_height":1.0,"sort_order":2,"ist_standard":true,"enter_next":"Action","tab_next":"Character"},
    {"name":"Character","kuerzel":"CHAR","kategorie":"drehbuch","font_family":"Courier Prime","font_size":12,"bold":false,"italic":false,"underline":false,"uppercase":true,"text_align":"left","margin_left":2.0,"margin_right":0.25,"space_before":11,"space_after":0,"line_height":1.0,"sort_order":3,"enter_next":"Dialogue","tab_next":"Action"},
    {"name":"Dialogue","kuerzel":"DIA","kategorie":"drehbuch","font_family":"Courier Prime","font_size":12,"bold":false,"italic":false,"underline":false,"uppercase":false,"text_align":"left","margin_left":1.0,"margin_right":1.5,"space_before":0,"space_after":0,"line_height":1.0,"sort_order":4,"enter_next":"Character","tab_next":"Parenthetical"},
    {"name":"Parenthetical","kuerzel":"PAR","kategorie":"drehbuch","font_family":"Courier Prime","font_size":12,"bold":false,"italic":false,"underline":false,"uppercase":false,"text_align":"left","margin_left":1.5,"margin_right":2.0,"space_before":0,"space_after":0,"line_height":1.0,"sort_order":5,"enter_next":"Dialogue","tab_next":"Action"},
    {"name":"Transition","kuerzel":"TRANS","kategorie":"drehbuch","font_family":"Courier Prime","font_size":12,"bold":false,"italic":false,"underline":false,"uppercase":true,"text_align":"right","margin_left":4.0,"margin_right":0.4,"space_before":11,"space_after":11,"line_height":1.0,"sort_order":6,"enter_next":"Action","tab_next":null},
    {"name":"Shot","kuerzel":"SHOT","kategorie":"drehbuch","font_family":"Courier Prime","font_size":12,"bold":false,"italic":false,"underline":false,"uppercase":true,"text_align":"left","margin_left":0,"margin_right":0,"space_before":22,"space_after":0,"line_height":1.0,"sort_order":7,"enter_next":"Action","tab_next":null}
  ]'::jsonb
)
ON CONFLICT (name) DO NOTHING;
