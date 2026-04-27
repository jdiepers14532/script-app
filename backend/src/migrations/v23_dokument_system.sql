-- v23: Dokumenten-Editor System (Fassungen, Kollaboration, Annotationen)

-- 0. folgen_meta bekommt UUID für systemweite FK-Referenzen
ALTER TABLE folgen_meta ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS folgen_meta_id_unique ON folgen_meta(id);

-- 1. app_settings Seeds
INSERT INTO app_settings (key, value) VALUES
  ('fassungs_nummerierung_modus', 'global'),
  ('dokument_override_rollen', '["superadmin","herstellungsleitung"]')
ON CONFLICT (key) DO NOTHING;

-- 2. Custom text type definitions (per Staffel)
CREATE TABLE IF NOT EXISTS dokument_typ_definitionen (
  id SERIAL PRIMARY KEY,
  staffel_id TEXT REFERENCES staffeln(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  editor_modus TEXT NOT NULL DEFAULT 'richtext',  -- 'screenplay' | 'richtext'
  sort_order INT DEFAULT 0,
  erstellt_von TEXT,
  erstellt_am TIMESTAMPTZ DEFAULT now(),
  UNIQUE(staffel_id, name)
);

-- 3. Screenplay format templates
CREATE TABLE IF NOT EXISTS editor_format_templates (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  ist_standard BOOLEAN DEFAULT FALSE,
  erstellt_von TEXT,
  erstellt_am TIMESTAMPTZ DEFAULT now(),
  UNIQUE(name)
);

CREATE TABLE IF NOT EXISTS editor_format_elemente (
  id SERIAL PRIMARY KEY,
  template_id INT REFERENCES editor_format_templates(id) ON DELETE CASCADE,
  element_typ TEXT NOT NULL,
  einrueckung_links INT DEFAULT 0,
  einrueckung_rechts INT DEFAULT 0,
  ausrichtung TEXT DEFAULT 'left',
  grossbuchstaben BOOLEAN DEFAULT FALSE,
  tab_folge_element TEXT,
  enter_folge_element TEXT,
  sort_order INT DEFAULT 0
);

-- Seed: Final Draft Standard template
INSERT INTO editor_format_templates (name, ist_standard)
VALUES ('Final Draft Standard', TRUE)
ON CONFLICT (name) DO NOTHING;

DO $$
DECLARE
  tmpl_id INT;
BEGIN
  SELECT id INTO tmpl_id FROM editor_format_templates WHERE name = 'Final Draft Standard';
  IF NOT EXISTS (SELECT 1 FROM editor_format_elemente WHERE template_id = tmpl_id) THEN
    INSERT INTO editor_format_elemente
      (template_id, element_typ, einrueckung_links, einrueckung_rechts, ausrichtung, grossbuchstaben, tab_folge_element, enter_folge_element, sort_order)
    VALUES
      (tmpl_id, 'scene_heading',  0,  0, 'left',   TRUE,  'action',       'action',     1),
      (tmpl_id, 'action',         0,  0, 'left',   FALSE, 'character',    'action',     2),
      (tmpl_id, 'character',     37,  0, 'left',   TRUE,  'action',       'dialogue',   3),
      (tmpl_id, 'dialogue',      25, 25, 'left',   FALSE, 'character',    'character',  4),
      (tmpl_id, 'parenthetical', 30, 30, 'left',   FALSE, 'dialogue',     'dialogue',   5),
      (tmpl_id, 'transition',     0,  0, 'right',  TRUE,  'scene_heading','scene_heading',6),
      (tmpl_id, 'shot',           0,  0, 'left',   TRUE,  'action',       'action',     7);
  END IF;
END $$;

-- 4. Colab groups
CREATE TABLE IF NOT EXISTS dokument_colab_gruppen (
  id SERIAL PRIMARY KEY,
  staffel_id TEXT REFERENCES staffeln(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  typ TEXT NOT NULL DEFAULT 'colab',  -- 'colab' | 'produktion'
  erstellt_von TEXT,
  erstellt_am TIMESTAMPTZ DEFAULT now(),
  -- ROADMAP: auto-Befüllung aus Verträge-App / Stabliste
  UNIQUE(staffel_id, name)
);

CREATE TABLE IF NOT EXISTS dokument_colab_gruppe_mitglieder (
  gruppe_id INT REFERENCES dokument_colab_gruppen(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  user_name TEXT,
  PRIMARY KEY (gruppe_id, user_id)
);

-- 5. Notification recipients
CREATE TABLE IF NOT EXISTS dokument_benachrichtigungen (
  id SERIAL PRIMARY KEY,
  staffel_id TEXT REFERENCES staffeln(id) ON DELETE CASCADE,
  ereignis TEXT NOT NULL,
  empfaenger_user_ids TEXT[] DEFAULT '{}',
  aktiv BOOLEAN DEFAULT TRUE,
  UNIQUE(staffel_id, ereignis)
);

-- 6. Main document table (one per type per Folge)
CREATE TABLE IF NOT EXISTS folgen_dokumente (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staffel_id TEXT NOT NULL,
  folge_nummer INT NOT NULL,
  typ TEXT NOT NULL,  -- 'drehbuch'|'storyline'|'notiz'|'abstrakt'|[custom]
  erstellt_von TEXT NOT NULL,
  erstellt_am TIMESTAMPTZ DEFAULT now(),
  FOREIGN KEY (staffel_id, folge_nummer)
    REFERENCES folgen_meta(staffel_id, folge_nummer) ON DELETE CASCADE,
  UNIQUE(staffel_id, folge_nummer, typ)
);

-- 7. Document versions / Fassungen
CREATE TABLE IF NOT EXISTS folgen_dokument_fassungen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dokument_id UUID NOT NULL REFERENCES folgen_dokumente(id) ON DELETE CASCADE,
  fassung_nummer INT NOT NULL,
  fassung_label TEXT,
  sichtbarkeit TEXT NOT NULL DEFAULT 'privat',
  colab_gruppe_id INT REFERENCES dokument_colab_gruppen(id) ON DELETE SET NULL,
  produktion_gruppe_id INT REFERENCES dokument_colab_gruppen(id) ON DELETE SET NULL,
  format_template_id INT REFERENCES editor_format_templates(id) ON DELETE SET NULL,
  inhalt JSONB NOT NULL DEFAULT '{}',
  plaintext_index TEXT,
  seitenformat TEXT DEFAULT 'a4',
  abgegeben BOOLEAN DEFAULT FALSE,
  abgegeben_von TEXT,
  abgegeben_am TIMESTAMPTZ,
  erstellt_von TEXT NOT NULL,
  erstellt_am TIMESTAMPTZ DEFAULT now(),
  zuletzt_geaendert_von TEXT,
  zuletzt_geaendert_am TIMESTAMPTZ,
  UNIQUE(dokument_id, fassung_nummer)
);

-- 8. Authors / Reviewers per Fassung
CREATE TABLE IF NOT EXISTS folgen_dokument_autoren (
  id SERIAL PRIMARY KEY,
  fassung_id UUID NOT NULL REFERENCES folgen_dokument_fassungen(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  user_name TEXT,
  rolle TEXT NOT NULL DEFAULT 'reviewer',  -- 'autor'|'reviewer'
  cursor_farbe TEXT DEFAULT '#007AFF',
  hinzugefuegt_am TIMESTAMPTZ DEFAULT now(),
  UNIQUE(fassung_id, user_id)
);

-- 9. Word-level annotations
CREATE TABLE IF NOT EXISTS folgen_dokument_annotationen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fassung_id UUID NOT NULL REFERENCES folgen_dokument_fassungen(id) ON DELETE CASCADE,
  von_pos INT NOT NULL,
  bis_pos INT NOT NULL,
  text TEXT NOT NULL,
  typ TEXT DEFAULT 'kommentar',  -- 'kommentar'|'frage'|'vorschlag'
  erstellt_von TEXT NOT NULL,
  erstellt_von_name TEXT,
  erstellt_am TIMESTAMPTZ DEFAULT now(),
  archiviert_am TIMESTAMPTZ,
  archiviert_von TEXT
);

-- 10. Audit log (Events only, kein Inhalt — DSGVO-konform)
CREATE TABLE IF NOT EXISTS folgen_dokument_audit (
  id SERIAL PRIMARY KEY,
  dokument_id UUID REFERENCES folgen_dokumente(id) ON DELETE SET NULL,
  fassung_id UUID REFERENCES folgen_dokument_fassungen(id) ON DELETE SET NULL,
  user_id TEXT,
  user_name TEXT,
  ereignis TEXT NOT NULL,
  details JSONB,
  ereignis_am TIMESTAMPTZ DEFAULT now()
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_folgen_dok_folge ON folgen_dokumente(staffel_id, folge_nummer);
CREATE INDEX IF NOT EXISTS idx_fassungen_dokument ON folgen_dokument_fassungen(dokument_id, fassung_nummer DESC);
CREATE INDEX IF NOT EXISTS idx_autoren_fassung ON folgen_dokument_autoren(fassung_id);
CREATE INDEX IF NOT EXISTS idx_annotationen_fassung ON folgen_dokument_annotationen(fassung_id);
CREATE INDEX IF NOT EXISTS idx_audit_dokument ON folgen_dokument_audit(dokument_id, ereignis_am DESC);
