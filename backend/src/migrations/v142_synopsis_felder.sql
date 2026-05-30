-- v142: Neue Synopsis-Felder (Presse, Straenge) + kombinierter KI-Endpoint

ALTER TABLE folgen ADD COLUMN IF NOT EXISTS synopsis_presse TEXT;
ALTER TABLE folgen ADD COLUMN IF NOT EXISTS synopsis_straenge TEXT;

INSERT INTO ki_settings (funktion, provider, model_name, enabled, default_prompt) VALUES
  ('synopsis_alle', 'mistral', 'mistral-medium-latest', true, 'Kombinierte Episoden-Synopsis-Generierung (Titel + Kurzinhalt + Redaktion + Presse + Straenge)')
ON CONFLICT (funktion) DO NOTHING;
