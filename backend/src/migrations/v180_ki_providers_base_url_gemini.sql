-- v179: ki_providers — base_url-Feld + Gemini/Custom-Provider-Seed

ALTER TABLE ki_providers
  ADD COLUMN IF NOT EXISTS base_url TEXT;

-- Gemini und Custom ergänzen
INSERT INTO ki_providers (provider, is_active, dsgvo_level) VALUES
  ('gemini', FALSE, 'rot'),
  ('custom', FALSE, 'orange')
ON CONFLICT (provider) DO NOTHING;
