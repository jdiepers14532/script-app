CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT PRIMARY KEY,
  selected_production_id UUID,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
