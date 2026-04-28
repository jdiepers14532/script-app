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

INSERT INTO ki_settings (funktion, provider, model_name) VALUES
  ('scene_summary', 'ollama', 'llama3.2'),
  ('entity_detect', 'ollama', 'llama3.2'),
  ('style_check', 'mistral', 'mistral-small'),
  ('synopsis', 'mistral', 'mistral-small'),
  ('consistency_check', 'openai', 'gpt-4o-mini')
ON CONFLICT DO NOTHING;
