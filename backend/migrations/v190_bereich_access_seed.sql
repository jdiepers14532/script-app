-- v190_bereich_access_seed.sql
-- Bereich-Zugriffs-Keys für Bereichs-Switcher (Script / Konzept / Analyse)
-- konzept_allowed_roles: neu — Tier-1-Admin-Rollen als Default
INSERT INTO app_settings (key, value)
VALUES ('konzept_allowed_roles', '["superadmin","geschaeftsfuehrung","herstellungsleitung"]')
ON CONFLICT (key) DO NOTHING;

-- analysis_allowed_roles: heute oft leer → mit Admin-Rollen seeden wenn leer/ungesetzt
-- (DO UPDATE nur wenn Wert leer oder '[]', um bestehende Konfiguration nicht zu clobbern)
INSERT INTO app_settings (key, value)
VALUES ('analysis_allowed_roles', '["superadmin","geschaeftsfuehrung","herstellungsleitung"]')
ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value
  WHERE app_settings.value IN ('[]', '', 'null') OR app_settings.value IS NULL;
