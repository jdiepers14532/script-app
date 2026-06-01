-- v161: lock_trigger_version_nummer für Schwellenwert-Logik beim Lock-Gate
ALTER TABLE rollen_freigabe_konfiguration
  ADD COLUMN IF NOT EXISTS lock_trigger_version_nummer INT NULL;
