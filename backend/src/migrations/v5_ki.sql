CREATE TABLE IF NOT EXISTS ki_settings (
  id SERIAL PRIMARY KEY,
  funktion TEXT NOT NULL UNIQUE,
  provider TEXT DEFAULT 'ollama' CHECK (provider IN ('ollama','mistral','openai','claude')),
  api_key TEXT,
  model_name TEXT,
  enabled BOOLEAN DEFAULT FALSE,
  dsgvo_level TEXT DEFAULT 'gruen' CHECK (dsgvo_level IN ('gruen','orange','rot')),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO ki_settings (funktion, provider, model_name, dsgvo_level) VALUES
  ('scene_summary', 'ollama', 'llama3.2', 'gruen'),
  ('entity_detect', 'ollama', 'llama3.2', 'gruen'),
  ('style_check', 'mistral', 'mistral-small', 'orange'),
  ('synopsis', 'mistral', 'mistral-small', 'orange'),
  ('consistency_check', 'openai', 'gpt-4o-mini', 'rot')
ON CONFLICT DO NOTHING;
