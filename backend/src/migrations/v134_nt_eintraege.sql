-- v134: NT-Eintraege Tabelle für NT/VO-Planung
-- Jede NT/VO-Figur in einer Szene bekommt einen Eintrag.
-- Disposition.app verlinkt via nt_eintraege.id (UUID) — daher KEIN hard-delete!
-- Weiche Löschung via veraltet=TRUE wenn Figur von NT → ON wechselt.

CREATE TABLE IF NOT EXISTS nt_eintraege (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Verknüpfung
  produktion_id TEXT NOT NULL,
  character_id UUID NOT NULL,
  szene_id UUID NOT NULL,           -- dokument_szenen.id (= bestimmte Szene in bestimmter Werkstufe)
  scene_identity_id UUID NOT NULL,  -- scene_identities.id (szenen-übergreifende Identität)
  werkstufe_id UUID NOT NULL,       -- werkstufen.id
  folge_id INTEGER,                 -- folgen.id (zur schnellen Filterung)
  -- NT-Typ: stimme = NT ohne Dialog-Kontext | telefon = Telefonat (ONE-WAY) | vo = Voice Over
  nt_typ VARCHAR(20) NOT NULL DEFAULT 'stimme' CHECK (nt_typ IN ('telefon', 'stimme', 'vo')),
  -- Replikentext: automatisch aus dem Szenen-Content extrahiert, wird bei Textänderung aktualisiert
  repliken_text TEXT,
  -- Notiz: manuelle Regiehinweise für das NT-Studio (z.B. "Ruhige Stimme, leise")
  notiz TEXT,
  -- Soft-Delete: veraltet=TRUE wenn Figur nicht mehr NT/VO in dieser Szene ist.
  -- NIEMALS hard-delete — Disposition.app verlinkt via .id UUID.
  -- disposition_app.nt_aufnahmen.script_nt_id → nt_eintraege.id
  veraltet BOOLEAN NOT NULL DEFAULT FALSE,
  erstellt_am TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  aktualisiert_am TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Eine NT-Figur pro Szene pro Werkstufe
  UNIQUE (character_id, scene_identity_id, werkstufe_id)
);

-- Index für NT-Liste-Seite (filtert nach Produktion + veraltet)
CREATE INDEX IF NOT EXISTS idx_nt_eintraege_produktion ON nt_eintraege (produktion_id, veraltet);
-- Index für Sprung von Szene → NT-Einträge
CREATE INDEX IF NOT EXISTS idx_nt_eintraege_szene ON nt_eintraege (szene_id);
-- Index für Statistik (Figur-Übersicht)
CREATE INDEX IF NOT EXISTS idx_nt_eintraege_character ON nt_eintraege (character_id, veraltet);
