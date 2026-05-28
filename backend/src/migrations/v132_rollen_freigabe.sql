-- v132: Rollen-Freigabe-Workflow
-- Genehmigungsprozess für neue Rollen in der Rollendatenbank

-- Per-Produktion Konfiguration
CREATE TABLE IF NOT EXISTS rollen_freigabe_konfiguration (
  id SERIAL PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES produktionen(id) ON DELETE CASCADE,
  freigabe_aktiv BOOLEAN NOT NULL DEFAULT FALSE,
  erinnerung_nach_tagen INTEGER NOT NULL DEFAULT 3,
  erstellt_am TIMESTAMPTZ DEFAULT NOW(),
  geaendert_am TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(production_id)
);

-- Genehmiger-Liste pro Produktion
CREATE TABLE IF NOT EXISTS rollen_freigabe_genehmiger (
  id SERIAL PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES produktionen(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  ist_obligatorisch BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  erstellt_am TIMESTAMPTZ DEFAULT NOW()
);

-- Freigabe-Anfragen (eine pro character + production)
CREATE TABLE IF NOT EXISTS rollen_freigabe_anfragen (
  id SERIAL PRIMARY KEY,
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  production_id TEXT NOT NULL REFERENCES produktionen(id) ON DELETE CASCADE,
  beantragt_von_user_id TEXT NOT NULL,
  beantragt_am TIMESTAMPTZ DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'ausstehend',
  -- ausstehend | freigegeben | abgelehnt | zurueckgezogen
  entschieden_am TIMESTAMPTZ,
  entschieden_von_user_id TEXT,
  notiz TEXT,
  UNIQUE(character_id, production_id)
);

-- Genehmiger-Status pro Anfrage (eine Zeile pro Genehmiger)
CREATE TABLE IF NOT EXISTS rollen_freigabe_genehmiger_status (
  id SERIAL PRIMARY KEY,
  anfrage_id INTEGER NOT NULL REFERENCES rollen_freigabe_anfragen(id) ON DELETE CASCADE,
  genehmiger_id INTEGER NOT NULL REFERENCES rollen_freigabe_genehmiger(id) ON DELETE CASCADE,
  token TEXT UNIQUE,
  token_gueltig_bis TIMESTAMPTZ,
  entschieden TEXT,
  -- NULL | 'freigegeben' | 'abgelehnt'
  entschieden_am TIMESTAMPTZ,
  UNIQUE(anfrage_id, genehmiger_id)
);

-- Status auf character_productions
ALTER TABLE character_productions ADD COLUMN IF NOT EXISTS freigabe_status TEXT DEFAULT 'keine';
-- keine | ausstehend | freigegeben | abgelehnt
