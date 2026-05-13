-- v67: PWA Admin-Steuerung
-- Neues app_settings-Feld: pwa_update_action
-- Wert: '' (kein Befehl) | 'update' (beim nächsten Öffnen SW-Update erzwingen) | 'uninstall' (SW deregistrieren)
-- Wird nach Ausführung durch das Frontend automatisch auf '' zurückgesetzt.

INSERT INTO app_settings (key, value, updated_at)
VALUES ('pwa_update_action', '', NOW())
ON CONFLICT (key) DO NOTHING;
