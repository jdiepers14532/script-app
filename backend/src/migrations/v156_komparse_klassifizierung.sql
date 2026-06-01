-- v156: Komparsen-Klassifizierungs-Cache — KI-Audit-Tabelle für Phase 2
--
-- Speichert das Ergebnis der inhaltsbasierten Klassifizierung (Phase 2, Mistral):
-- - Welche Kategorie wurde erkannt (ot / mit_text / mit_spiel)?
-- - Welche Textstelle begründet das (evidence_text)?
-- - Mit welcher Konfidenz?
-- - Welche Quelle (regel / mistral / manuell)?
-- - Ist das Ergebnis von einem Menschen verifiziert worden?
--
-- Nur KI-Audit-Tabelle — operative Einstufung läuft über scene_characters.spiel_typ
-- (bestehend) und spiel_typ_quelle (v152).
-- UNIQUE(character_id, scene_identity_id, werkstufe_id): pro Szene × Figur × Werkstufe.

CREATE TABLE IF NOT EXISTS komparse_klassifizierung (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id          UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  scene_identity_id     UUID NOT NULL REFERENCES scene_identities(id) ON DELETE CASCADE,
  werkstufe_id          UUID NOT NULL REFERENCES werkstufen(id) ON DELETE CASCADE,
  typ_erkannt           TEXT NOT NULL,           -- 'ot' | 'mit_text' | 'mit_spiel'
  evidence_text         TEXT NULL,               -- zitierte Textstelle
  konfidenz             NUMERIC(3,2) NULL,       -- 0.00–1.00
  quelle                TEXT NOT NULL DEFAULT 'regel', -- 'regel' | 'mistral' | 'manuell'
  verifiziert           BOOLEAN NOT NULL DEFAULT FALSE,
  verifiziert_von_user_id TEXT NULL,
  verifiziert_am        TIMESTAMPTZ NULL,
  erstellt_am           TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(character_id, scene_identity_id, werkstufe_id)
);

DO $$ BEGIN
  ALTER TABLE komparse_klassifizierung
    ADD CONSTRAINT chk_komparse_klass_typ
    CHECK (typ_erkannt IN ('ot', 'mit_text', 'mit_spiel'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE komparse_klassifizierung
    ADD CONSTRAINT chk_komparse_klass_quelle
    CHECK (quelle IN ('regel', 'mistral', 'manuell'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE komparse_klassifizierung
    ADD CONSTRAINT chk_komparse_klass_konfidenz
    CHECK (konfidenz IS NULL OR (konfidenz >= 0.00 AND konfidenz <= 1.00));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Index: schnelles Laden der Klassifizierungen für eine Szene/Werkstufe
CREATE INDEX IF NOT EXISTS idx_komparse_klass_scene
  ON komparse_klassifizierung (scene_identity_id, werkstufe_id);

-- Index: unverifizierte Kandidaten (für manuelle Prüfungs-Queue)
CREATE INDEX IF NOT EXISTS idx_komparse_klass_unverifiziert
  ON komparse_klassifizierung (quelle, verifiziert)
  WHERE verifiziert = FALSE AND quelle = 'mistral';
