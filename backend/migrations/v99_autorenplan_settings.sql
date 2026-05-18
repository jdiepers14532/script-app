-- v99: Autorenplan — globale Gagenkategorien + Pausenwochen + Settings-Rollen

-- Globale Gagenkategorien (nicht pro Produktion)
CREATE TABLE IF NOT EXISTS autorenplan_gage_kategorien (
  id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  label          TEXT    NOT NULL,
  beschreibung   TEXT,
  abrechnungstyp TEXT    NOT NULL DEFAULT 'pauschal',
  betrag         NUMERIC,
  waehrung       TEXT    NOT NULL DEFAULT 'EUR',
  lst_rg         TEXT    NOT NULL DEFAULT 'rg',
  sortierung     INT     NOT NULL DEFAULT 0,
  erstellt_am    TIMESTAMPTZ DEFAULT NOW(),
  aktualisiert_am TIMESTAMPTZ DEFAULT NOW()
);

-- Pausenwochen pro Produktion
CREATE TABLE IF NOT EXISTS autorenplan_pausenwochen (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produktion_db_id UUID NOT NULL,
  woche_von        DATE NOT NULL,
  notiz            TEXT,
  erstellt_von     TEXT,
  erstellt_am      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(produktion_db_id, woche_von)
);

-- Default: welche Rollen dürfen auf Autorenplan-Einstellungen zugreifen
INSERT INTO app_settings (key, value, updated_at)
VALUES ('autorenplan_settings_rollen', '["superadmin","herstellungsleitung","produktionsleitung"]', NOW())
ON CONFLICT (key) DO NOTHING;
