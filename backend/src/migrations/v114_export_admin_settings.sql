-- v114: Export Admin-Einstellungen (sichtbares Wasserzeichen)

CREATE TABLE IF NOT EXISTS export_admin_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO export_admin_settings (key, value) VALUES
  ('wm_sichtbar_aktiv',    'false'),
  ('wm_sichtbar_text',     'VERTRAULICH'),
  ('wm_sichtbar_opazitaet','8')
ON CONFLICT (key) DO NOTHING;
