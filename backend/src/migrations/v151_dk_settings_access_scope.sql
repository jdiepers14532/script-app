-- v151: dk_settings_access scope-Spalte — erweitert Berechtigungsmodell um Anlage/Override-Scopes
--
-- Bisheriges Modell: UNIQUE(production_id, access_type, identifier) — nur ein Eintrag pro
-- Identifier und Produktion. Das erlaubt keine Trennung zwischen DK-Zugang, Anlage-Recht
-- und Lock-Override-Recht.
--
-- Neues Modell: scope-Spalte orthogonal zu access_type.
-- UNIQUE erweitert auf (production_id, access_type, identifier, scope).
--
-- scope-Werte:
--   dk            — DK-Settings-Zugang (bisheriger Default)
--   anlage_rollen — Rollen/Figuren anlegen und bearbeiten
--   anlage_motive — Motive anlegen und bearbeiten
--   lock_override — Lock-Gate-Override (engere Gruppe)
--
-- Middleware: requireDkAccess muss nach dieser Migration WHERE scope = 'dk' filtern.

ALTER TABLE dk_settings_access
  ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'dk';

DO $$ BEGIN
  ALTER TABLE dk_settings_access
    ADD CONSTRAINT chk_dk_access_scope
    CHECK (scope IN ('dk', 'anlage_rollen', 'anlage_motive', 'lock_override'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Alte UNIQUE-Constraint entfernen (umfasst scope nicht)
DO $$ BEGIN
  ALTER TABLE dk_settings_access
    DROP CONSTRAINT dk_settings_access_production_id_access_type_identifier_key;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- Neue UNIQUE-Constraint inklusive scope
DO $$ BEGIN
  ALTER TABLE dk_settings_access
    ADD CONSTRAINT dk_settings_access_unique_scope
    UNIQUE (production_id, access_type, identifier, scope);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Index für schnellen Scope-Lookup
CREATE INDEX IF NOT EXISTS idx_dk_settings_access_scope
  ON dk_settings_access (production_id, scope);
