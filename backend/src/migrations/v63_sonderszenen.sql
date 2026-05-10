-- v63: Sonderszenen — Wechselschnitt (erweitert), Stockshot, Flashback
-- ============================================================================

-- 1. Neue Spalten auf dokument_szenen
ALTER TABLE dokument_szenen
  ADD COLUMN IF NOT EXISTS sondertyp TEXT CHECK (sondertyp IN ('wechselschnitt', 'stockshot', 'flashback')),
  ADD COLUMN IF NOT EXISTS stockshot_kategorie TEXT CHECK (stockshot_kategorie IN ('ortswechsel', 'zeit_vergeht', 'stimmungswechsel')),
  ADD COLUMN IF NOT EXISTS stockshot_stimmung TEXT,
  ADD COLUMN IF NOT EXISTS stockshot_neu_drehen BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS flashback_referenz_id UUID REFERENCES scene_identities(id) ON DELETE SET NULL;

-- Bestehende is_wechselschnitt Daten migrieren
UPDATE dokument_szenen SET sondertyp = 'wechselschnitt' WHERE is_wechselschnitt = true AND sondertyp IS NULL;

-- 2. Wechselschnitt-Partner (N:M)
CREATE TABLE IF NOT EXISTS wechselschnitt_partner (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dokument_szene_id UUID NOT NULL REFERENCES dokument_szenen(id) ON DELETE CASCADE,
  partner_identity_id UUID NOT NULL REFERENCES scene_identities(id) ON DELETE CASCADE,
  position INT NOT NULL DEFAULT 0,
  UNIQUE (dokument_szene_id, partner_identity_id)
);
CREATE INDEX IF NOT EXISTS idx_ws_partner_szene ON wechselschnitt_partner(dokument_szene_id);
CREATE INDEX IF NOT EXISTS idx_ws_partner_identity ON wechselschnitt_partner(partner_identity_id);

-- 3. Stockshot-Archiv (staffelweise)
CREATE TABLE IF NOT EXISTS stockshot_archiv (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produktion_id TEXT NOT NULL,
  motiv_name TEXT NOT NULL,
  motiv_id UUID REFERENCES motive(id) ON DELETE SET NULL,
  lichtstimmung TEXT NOT NULL,
  quelle_folge_nr INT,
  quelle_szene_id UUID REFERENCES scene_identities(id) ON DELETE SET NULL,
  erstellt_am TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (produktion_id, motiv_name, lichtstimmung)
);

-- 4. Stockshot-Templates
CREATE TABLE IF NOT EXISTS stockshot_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produktion_id TEXT NOT NULL,
  kategorie TEXT NOT NULL CHECK (kategorie IN ('ortswechsel', 'zeit_vergeht', 'stimmungswechsel')),
  name TEXT NOT NULL,
  oneliner_vorlage TEXT NOT NULL DEFAULT '',
  sortierung INT NOT NULL DEFAULT 0,
  erstellt_am TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (produktion_id, kategorie, name)
);

-- 5. Terminologie-Seed: stockshot + flashback Keys hinzufuegen
UPDATE app_settings
SET value = (
  SELECT jsonb_build_object(
    'szene', COALESCE(v->>'szene', 'Szene'),
    'motiv', COALESCE(v->>'motiv', 'Motiv'),
    'staffel', COALESCE(v->>'staffel', 'Staffel'),
    'stab', COALESCE(v->>'stab', 'Stab'),
    'darsteller', COALESCE(v->>'darsteller', 'Darsteller'),
    'komparse', COALESCE(v->>'komparse', 'Komparse'),
    'episode', COALESCE(v->>'episode', 'Folge'),
    'stockshot', 'Stockshot',
    'flashback', 'Flashback'
  )::text
  FROM (SELECT value::jsonb AS v FROM app_settings WHERE key = 'terminologie') sub
)
WHERE key = 'terminologie'
  AND value::jsonb->>'stockshot' IS NULL;
