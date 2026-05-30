-- v118: synopsis_300 (Kurzsynopse für Zuschauende) + neue KI-Funktionen

ALTER TABLE folgen ADD COLUMN IF NOT EXISTS synopsis_300 TEXT;

-- KI-Einstellungen für die drei neuen Synopsen-Funktionen
INSERT INTO ki_settings (funktion, provider, model_name, enabled)
VALUES
  ('synopsis_titel', 'mistral', 'mistral-small-latest', true),
  ('synopsis_kurz',  'mistral', 'mistral-small-latest', true),
  ('synopsis_lang',  'mistral', 'mistral-medium-latest', true)
ON CONFLICT (funktion) DO NOTHING;
