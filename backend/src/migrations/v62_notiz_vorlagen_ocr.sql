-- v62: Notiz-Vorlagen erweitern + OCR-Settings + scene_identities fuer Non-Scene-Elemente

-- 1. Erweitere dokument_vorlagen um typ + meta_fields fuer Template-Matching beim Import
ALTER TABLE dokument_vorlagen ADD COLUMN IF NOT EXISTS typ TEXT DEFAULT 'custom'
  CHECK (typ IN ('titelseite','synopsis','recap','precap','custom'));
ALTER TABLE dokument_vorlagen ADD COLUMN IF NOT EXISTS meta_fields JSONB DEFAULT '[]';
ALTER TABLE dokument_vorlagen ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 2. scene_identities: Marker fuer Non-Scene-Elemente (Titelseite, Synopsis, Recap, Precap)
ALTER TABLE scene_identities ADD COLUMN IF NOT EXISTS is_non_scene BOOLEAN DEFAULT FALSE;
ALTER TABLE scene_identities ADD COLUMN IF NOT EXISTS non_scene_type TEXT;

-- 3. pdf_ocr in ki_settings sicherstellen
INSERT INTO ki_settings (funktion, provider, model_name, enabled)
VALUES ('pdf_ocr', 'mistral', 'mistral-ocr-latest', FALSE)
ON CONFLICT DO NOTHING;

-- 4. Default-Vorlagen fuer bestehende Produktionen (Titelseite + Synopsis)
INSERT INTO dokument_vorlagen (produktion_id, name, typ, sektionen, meta_fields, created_by)
SELECT p.id, 'Titelseite', 'titelseite',
  '[{"element_type":"titelseite","label":"Titelseite","content":{"type":"doc","content":[{"type":"absatz","attrs":{"format_id":null,"format_name":"Headline"},"content":[{"type":"text","text":"{{staffel_titel}}"}]},{"type":"absatz","attrs":{"format_id":null,"format_name":"Headline"},"content":[{"type":"text","text":"Treatment - Episode {{folge_nummer}}"}]},{"type":"absatz","attrs":{"format_id":null,"format_name":"Haupttext"},"content":[{"type":"text","text":"Block {{block}}"}]},{"type":"absatz","attrs":{"format_id":null,"format_name":"Haupttext"},"content":[{"type":"text","text":"Autor: {{autor}}"}]},{"type":"absatz","attrs":{"format_id":null,"format_name":"Haupttext"},"content":[{"type":"text","text":"Regie: {{regie}}"}]},{"type":"absatz","attrs":{"format_id":null,"format_name":"Haupttext"},"content":[{"type":"text","text":"Stand: {{stand_datum}}"}]}]}}]'::jsonb,
  '[{"key":"staffel_titel","label":"Staffel-Titel"},{"key":"folge_nummer","label":"Folgennummer"},{"key":"block","label":"Block"},{"key":"autor","label":"Autor"},{"key":"regie","label":"Regie"},{"key":"stand_datum","label":"Stand-Datum"}]'::jsonb,
  'system'
FROM produktionen p
WHERE NOT EXISTS (
  SELECT 1 FROM dokument_vorlagen dv WHERE dv.produktion_id = p.id AND dv.typ = 'titelseite'
);

INSERT INTO dokument_vorlagen (produktion_id, name, typ, sektionen, meta_fields, created_by)
SELECT p.id, 'Synopsis', 'synopsis',
  '[{"element_type":"synopsis","label":"Synopsis","content":{"type":"doc","content":[{"type":"absatz","attrs":{"format_id":null,"format_name":"Headline"},"content":[{"type":"text","text":"FOLGE {{folge_nummer}}"}]},{"type":"absatz","attrs":{"format_id":null,"format_name":"Haupttext"},"content":[{"type":"text","text":"{{synopsis}}"}]}]}}]'::jsonb,
  '[{"key":"folge_nummer","label":"Folgennummer"},{"key":"synopsis","label":"Synopsis-Text"}]'::jsonb,
  'system'
FROM produktionen p
WHERE NOT EXISTS (
  SELECT 1 FROM dokument_vorlagen dv WHERE dv.produktion_id = p.id AND dv.typ = 'synopsis'
);
