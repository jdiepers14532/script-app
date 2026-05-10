-- v56: Absatzformate (konfigurierbare Absatzformate pro Produktion)

-- Presets (globale Vorlagen)
CREATE TABLE IF NOT EXISTS absatzformat_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  beschreibung TEXT,
  formate JSONB NOT NULL DEFAULT '[]',
  ist_system BOOLEAN DEFAULT false,
  erstellt_von TEXT,
  erstellt_am TIMESTAMPTZ DEFAULT now()
);

-- Absatzformat-Definitionen pro Produktion
CREATE TABLE IF NOT EXISTS absatzformate (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produktion_id TEXT NOT NULL,
  name TEXT NOT NULL,
  kuerzel TEXT,
  textbaustein TEXT,
  font_family TEXT DEFAULT 'Courier Prime',
  font_size REAL DEFAULT 12,
  bold BOOLEAN DEFAULT false,
  italic BOOLEAN DEFAULT false,
  underline BOOLEAN DEFAULT false,
  uppercase BOOLEAN DEFAULT false,
  text_align TEXT DEFAULT 'left',
  margin_left REAL DEFAULT 0,
  margin_right REAL DEFAULT 0,
  space_before REAL DEFAULT 12,
  space_after REAL DEFAULT 0,
  line_height REAL DEFAULT 1.0,
  enter_next_format UUID REFERENCES absatzformate(id) ON DELETE SET NULL,
  tab_next_format UUID REFERENCES absatzformate(id) ON DELETE SET NULL,
  sort_order INT DEFAULT 0,
  ist_standard BOOLEAN DEFAULT false,
  kategorie TEXT DEFAULT 'alle',
  erstellt_am TIMESTAMPTZ DEFAULT now(),
  UNIQUE(produktion_id, name)
);

-- Seed: "Serienwerft Daily-Standard" Preset
INSERT INTO absatzformat_presets (name, beschreibung, ist_system, formate)
VALUES (
  'Serienwerft Daily-Standard',
  'Aktuelles Rote-Rosen-Format: Courier Prime, deutsche Konventionen. Drehbuch + Storyline.',
  true,
  '[
    {"name":"Szenenueberschrift","kuerzel":"SH","kategorie":"drehbuch","font_family":"Courier Prime","font_size":12,"bold":true,"uppercase":true,"text_align":"left","margin_left":0,"margin_right":0,"space_before":24,"space_after":12,"line_height":1.0,"sort_order":1,"enter_next":"Action","tab_next":null},
    {"name":"Action","kuerzel":"ACT","kategorie":"drehbuch","font_family":"Courier Prime","font_size":12,"bold":false,"uppercase":false,"text_align":"left","margin_left":0,"margin_right":0,"space_before":12,"space_after":0,"line_height":1.0,"sort_order":2,"ist_standard":true,"enter_next":"Action","tab_next":"Character"},
    {"name":"Character","kuerzel":"CHAR","kategorie":"drehbuch","font_family":"Courier Prime","font_size":12,"bold":false,"uppercase":true,"text_align":"center","margin_left":2.5,"margin_right":0,"space_before":12,"space_after":0,"line_height":1.0,"sort_order":3,"enter_next":"Dialogue","tab_next":"Action"},
    {"name":"Dialogue","kuerzel":"DIA","kategorie":"drehbuch","font_family":"Courier Prime","font_size":12,"bold":false,"uppercase":false,"text_align":"left","margin_left":1.5,"margin_right":2.0,"space_before":0,"space_after":0,"line_height":1.0,"sort_order":4,"enter_next":"Character","tab_next":"Parenthetical"},
    {"name":"Parenthetical","kuerzel":"PAR","kategorie":"drehbuch","font_family":"Courier Prime","font_size":12,"bold":false,"uppercase":false,"text_align":"left","margin_left":2.0,"margin_right":2.5,"space_before":0,"space_after":0,"line_height":1.0,"sort_order":5,"enter_next":"Dialogue","tab_next":"Action"},
    {"name":"Transition","kuerzel":"TRANS","kategorie":"drehbuch","font_family":"Courier Prime","font_size":12,"bold":false,"uppercase":true,"text_align":"right","margin_left":0,"margin_right":0,"space_before":12,"space_after":12,"line_height":1.0,"sort_order":6,"enter_next":"Szenenueberschrift","tab_next":"Action"},
    {"name":"Shot","kuerzel":"SHOT","kategorie":"drehbuch","font_family":"Courier Prime","font_size":12,"bold":false,"uppercase":true,"text_align":"left","margin_left":0,"margin_right":0,"space_before":12,"space_after":0,"line_height":1.0,"sort_order":7,"enter_next":"Action","tab_next":null},
    {"name":"Haupttext","kuerzel":"HT","kategorie":"storyline","font_family":"Arial","font_size":11,"bold":false,"uppercase":false,"text_align":"left","margin_left":0,"margin_right":0,"space_before":6,"space_after":0,"line_height":1.5,"sort_order":10,"ist_standard":true,"enter_next":"Haupttext","tab_next":"Status Quo"},
    {"name":"Status Quo","kuerzel":"SQ","kategorie":"storyline","font_family":"Arial","font_size":11,"bold":false,"italic":true,"uppercase":false,"text_align":"left","margin_left":0,"margin_right":0,"space_before":6,"space_after":0,"line_height":1.5,"sort_order":11,"textbaustein":"Status Quo:","enter_next":"Haupttext","tab_next":"Anmerkung"},
    {"name":"Anmerkung","kuerzel":"ANM","kategorie":"storyline","font_family":"Arial","font_size":11,"bold":false,"italic":true,"uppercase":false,"text_align":"left","margin_left":0,"margin_right":0,"space_before":6,"space_after":0,"line_height":1.5,"sort_order":12,"textbaustein":"Anmerkung","enter_next":"Haupttext","tab_next":"Strang-Marker"},
    {"name":"Strang-Marker","kuerzel":"SM","kategorie":"storyline","font_family":"Arial","font_size":11,"bold":true,"uppercase":false,"text_align":"left","margin_left":0,"margin_right":0,"space_before":12,"space_after":6,"line_height":1.5,"sort_order":13,"enter_next":"Haupttext","tab_next":null}
  ]'::jsonb
)
ON CONFLICT (name) DO NOTHING;

-- US Screenplay (Hollywood) Preset
INSERT INTO absatzformat_presets (name, beschreibung, ist_system, formate)
VALUES (
  'US Screenplay (Hollywood)',
  'Final Draft Default: Courier 12pt, US Letter, strikte Hollywood-Raender.',
  true,
  '[
    {"name":"Scene Heading","kuerzel":"SH","kategorie":"drehbuch","font_family":"Courier Prime","font_size":12,"bold":true,"uppercase":true,"text_align":"left","margin_left":0,"margin_right":0,"space_before":24,"space_after":12,"line_height":1.0,"sort_order":1,"enter_next":"Action","tab_next":null},
    {"name":"Action","kuerzel":"ACT","kategorie":"drehbuch","font_family":"Courier Prime","font_size":12,"bold":false,"uppercase":false,"text_align":"left","margin_left":0,"margin_right":0,"space_before":12,"space_after":0,"line_height":1.0,"sort_order":2,"ist_standard":true,"enter_next":"Action","tab_next":"Character"},
    {"name":"Character","kuerzel":"CHAR","kategorie":"drehbuch","font_family":"Courier Prime","font_size":12,"bold":false,"uppercase":true,"text_align":"left","margin_left":3.7,"margin_right":0,"space_before":12,"space_after":0,"line_height":1.0,"sort_order":3,"enter_next":"Dialogue","tab_next":"Action"},
    {"name":"Dialogue","kuerzel":"DIA","kategorie":"drehbuch","font_family":"Courier Prime","font_size":12,"bold":false,"uppercase":false,"text_align":"left","margin_left":2.5,"margin_right":2.5,"space_before":0,"space_after":0,"line_height":1.0,"sort_order":4,"enter_next":"Character","tab_next":"Parenthetical"},
    {"name":"Parenthetical","kuerzel":"PAR","kategorie":"drehbuch","font_family":"Courier Prime","font_size":12,"bold":false,"uppercase":false,"text_align":"left","margin_left":3.1,"margin_right":2.9,"space_before":0,"space_after":0,"line_height":1.0,"sort_order":5,"enter_next":"Dialogue","tab_next":"Action"},
    {"name":"Transition","kuerzel":"TRANS","kategorie":"drehbuch","font_family":"Courier Prime","font_size":12,"bold":false,"uppercase":true,"text_align":"right","margin_left":0,"margin_right":0,"space_before":12,"space_after":12,"line_height":1.0,"sort_order":6,"enter_next":"Scene Heading","tab_next":"Action"},
    {"name":"Shot","kuerzel":"SHOT","kategorie":"drehbuch","font_family":"Courier Prime","font_size":12,"bold":false,"uppercase":true,"text_align":"left","margin_left":0,"margin_right":0,"space_before":12,"space_after":0,"line_height":1.0,"sort_order":7,"enter_next":"Action","tab_next":null}
  ]'::jsonb
)
ON CONFLICT (name) DO NOTHING;

-- BBC TV Drama Preset
INSERT INTO absatzformat_presets (name, beschreibung, ist_system, formate)
VALUES (
  'BBC TV Drama',
  'BBC Writers Room: Courier 12pt, A4, BBC-Konventionen.',
  true,
  '[
    {"name":"Scene Heading","kuerzel":"SH","kategorie":"drehbuch","font_family":"Courier Prime","font_size":12,"bold":true,"uppercase":true,"text_align":"left","margin_left":0,"margin_right":0,"space_before":24,"space_after":12,"line_height":1.0,"sort_order":1,"enter_next":"Action","tab_next":null},
    {"name":"Action","kuerzel":"ACT","kategorie":"drehbuch","font_family":"Courier Prime","font_size":12,"bold":false,"uppercase":false,"text_align":"left","margin_left":0,"margin_right":0,"space_before":12,"space_after":0,"line_height":1.0,"sort_order":2,"ist_standard":true,"enter_next":"Action","tab_next":"Character"},
    {"name":"Character","kuerzel":"CHAR","kategorie":"drehbuch","font_family":"Courier Prime","font_size":12,"bold":false,"uppercase":true,"text_align":"center","margin_left":2.5,"margin_right":0,"space_before":12,"space_after":0,"line_height":1.0,"sort_order":3,"enter_next":"Dialogue","tab_next":"Action"},
    {"name":"Dialogue","kuerzel":"DIA","kategorie":"drehbuch","font_family":"Courier Prime","font_size":12,"bold":false,"uppercase":false,"text_align":"left","margin_left":1.5,"margin_right":1.5,"space_before":0,"space_after":0,"line_height":1.0,"sort_order":4,"enter_next":"Character","tab_next":"Parenthetical"},
    {"name":"Parenthetical","kuerzel":"PAR","kategorie":"drehbuch","font_family":"Courier Prime","font_size":12,"bold":false,"uppercase":false,"text_align":"left","margin_left":2.0,"margin_right":2.0,"space_before":0,"space_after":0,"line_height":1.0,"sort_order":5,"enter_next":"Dialogue","tab_next":"Action"},
    {"name":"Transition","kuerzel":"TRANS","kategorie":"drehbuch","font_family":"Courier Prime","font_size":12,"bold":false,"uppercase":true,"text_align":"right","margin_left":0,"margin_right":0,"space_before":12,"space_after":12,"line_height":1.0,"sort_order":6,"enter_next":"Scene Heading","tab_next":"Action"}
  ]'::jsonb
)
ON CONFLICT (name) DO NOTHING;

-- ARD/ZDF Fernsehfilm Preset
INSERT INTO absatzformat_presets (name, beschreibung, ist_system, formate)
VALUES (
  'ARD/ZDF Fernsehfilm',
  'Deutscher Industriestandard: Courier 12pt, A4, DE-Konventionen.',
  true,
  '[
    {"name":"Szenenueberschrift","kuerzel":"SH","kategorie":"drehbuch","font_family":"Courier Prime","font_size":12,"bold":true,"uppercase":true,"text_align":"left","margin_left":0,"margin_right":0,"space_before":24,"space_after":12,"line_height":1.0,"sort_order":1,"enter_next":"Action","tab_next":null},
    {"name":"Action","kuerzel":"ACT","kategorie":"drehbuch","font_family":"Courier Prime","font_size":12,"bold":false,"uppercase":false,"text_align":"left","margin_left":0,"margin_right":0,"space_before":12,"space_after":0,"line_height":1.0,"sort_order":2,"ist_standard":true,"enter_next":"Action","tab_next":"Character"},
    {"name":"Character","kuerzel":"CHAR","kategorie":"drehbuch","font_family":"Courier Prime","font_size":12,"bold":false,"uppercase":true,"text_align":"center","margin_left":2.5,"margin_right":0,"space_before":12,"space_after":0,"line_height":1.0,"sort_order":3,"enter_next":"Dialogue","tab_next":"Action"},
    {"name":"Dialogue","kuerzel":"DIA","kategorie":"drehbuch","font_family":"Courier Prime","font_size":12,"bold":false,"uppercase":false,"text_align":"left","margin_left":1.5,"margin_right":2.0,"space_before":0,"space_after":0,"line_height":1.0,"sort_order":4,"enter_next":"Character","tab_next":"Parenthetical"},
    {"name":"Parenthetical","kuerzel":"PAR","kategorie":"drehbuch","font_family":"Courier Prime","font_size":12,"bold":false,"uppercase":false,"text_align":"left","margin_left":2.0,"margin_right":2.5,"space_before":0,"space_after":0,"line_height":1.0,"sort_order":5,"enter_next":"Dialogue","tab_next":"Action"},
    {"name":"Transition","kuerzel":"TRANS","kategorie":"drehbuch","font_family":"Courier Prime","font_size":12,"bold":false,"uppercase":true,"text_align":"right","margin_left":0,"margin_right":0,"space_before":12,"space_after":12,"line_height":1.0,"sort_order":6,"enter_next":"Szenenueberschrift","tab_next":"Action"},
    {"name":"Shot","kuerzel":"SHOT","kategorie":"drehbuch","font_family":"Courier Prime","font_size":12,"bold":false,"uppercase":true,"text_align":"left","margin_left":0,"margin_right":0,"space_before":12,"space_after":0,"line_height":1.0,"sort_order":7,"enter_next":"Action","tab_next":null}
  ]'::jsonb
)
ON CONFLICT (name) DO NOTHING;
