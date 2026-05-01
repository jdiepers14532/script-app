-- v37: Drehbuchkoordinations-Settings Zugriffskontrolle + produktionsspezifische Settings

-- Wer hat DK-Settings-Zugriff pro Produktion (konfigurierbar in Admin)
CREATE TABLE IF NOT EXISTS dk_settings_access (
  id SERIAL PRIMARY KEY,
  production_id TEXT NOT NULL,
  access_type TEXT NOT NULL CHECK (access_type IN ('rolle', 'user')),
  identifier TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  UNIQUE(production_id, access_type, identifier)
);

-- Produktionsspezifische App-Settings (Override ueber globale app_settings)
CREATE TABLE IF NOT EXISTS production_app_settings (
  id SERIAL PRIMARY KEY,
  production_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(production_id, key)
);
