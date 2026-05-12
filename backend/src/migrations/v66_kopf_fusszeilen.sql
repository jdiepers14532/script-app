-- v66: Kopf-/Fußzeilen-Defaults + Vorlagen-Erweiterung

-- Globale Kopf-/Fußzeilen-Defaults pro Produktion und Werkstufe-Typ
CREATE TABLE IF NOT EXISTS kopf_fusszeilen_defaults (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produktion_id            TEXT NOT NULL REFERENCES produktionen(id) ON DELETE CASCADE,
  werkstufe_typ            TEXT NOT NULL CHECK (werkstufe_typ IN ('drehbuch','storyline','notiz','alle')),
  kopfzeile_content        JSONB DEFAULT NULL,
  fusszeile_content        JSONB DEFAULT NULL,
  kopfzeile_aktiv          BOOLEAN DEFAULT false,
  fusszeile_aktiv          BOOLEAN DEFAULT false,
  erste_seite_kein_header  BOOLEAN DEFAULT true,
  erste_seite_kein_footer  BOOLEAN DEFAULT false,
  seiten_layout            JSONB DEFAULT '{"format":"a4","margin_top":25,"margin_bottom":25,"margin_left":30,"margin_right":25}',
  erstellt_am              TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(produktion_id, werkstufe_typ)
);

-- Vorlagen: WYSIWYG Body + eigene Kopf-/Fußzeile
ALTER TABLE dokument_vorlagen
  ADD COLUMN IF NOT EXISTS body_content         JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS kopfzeile_content    JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS fusszeile_content    JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS kopfzeile_aktiv      BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS fusszeile_aktiv      BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS erste_seite_kein_header BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS seiten_layout        JSONB DEFAULT '{"format":"a4","margin_top":25,"margin_bottom":25,"margin_left":30,"margin_right":25}';
