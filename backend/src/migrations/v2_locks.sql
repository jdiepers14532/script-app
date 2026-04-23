CREATE TABLE IF NOT EXISTS episode_locks (
  id SERIAL PRIMARY KEY,
  episode_id INT REFERENCES episoden(id) ON DELETE CASCADE UNIQUE,
  user_id TEXT NOT NULL,
  user_name TEXT,
  lock_type TEXT DEFAULT 'exclusive' CHECK (lock_type IN ('exclusive','contract')),
  expires_at TIMESTAMPTZ,
  contract_ref TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
