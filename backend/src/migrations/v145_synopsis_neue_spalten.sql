-- v145: Neue Synopsen-Spalten (synopsis_kurzinhalt + synopsis_pressetext)
-- Korrektiver Fix: v143 lief bereits ohne diese ALTER TABLE-Statements durch
ALTER TABLE folgen ADD COLUMN IF NOT EXISTS synopsis_kurzinhalt TEXT;
ALTER TABLE folgen ADD COLUMN IF NOT EXISTS synopsis_pressetext TEXT;

INSERT INTO ki_settings (funktion, provider, model_name, enabled, default_prompt)
VALUES ('synopsis_pressetext', 'mistral', 'mistral-medium-latest', true, '')
ON CONFLICT (funktion) DO NOTHING;
