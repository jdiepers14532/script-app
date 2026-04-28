-- v31: Zentrales Provider-Register für API-Keys + Kostentracking
-- api_key und dsgvo_level werden aus ki_settings in ki_providers verschoben

CREATE TABLE IF NOT EXISTS ki_providers (
  provider    TEXT PRIMARY KEY,
  api_key     TEXT,
  is_active   BOOLEAN DEFAULT FALSE,
  dsgvo_level TEXT DEFAULT 'gruen' CHECK (dsgvo_level IN ('gruen','orange','rot')),
  tokens_in   BIGINT DEFAULT 0,
  tokens_out  BIGINT DEFAULT 0,
  cost_eur    NUMERIC(10,4) DEFAULT 0,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO ki_providers (provider, is_active, dsgvo_level) VALUES
  ('ollama',  TRUE,  'gruen'),
  ('mistral', FALSE, 'orange'),
  ('openai',  FALSE, 'rot'),
  ('claude',  FALSE, 'rot')
ON CONFLICT (provider) DO NOTHING;

DO $$
BEGIN
  -- Migrate existing api_keys from ki_settings → ki_providers (first non-null per provider)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ki_settings' AND column_name = 'api_key'
  ) THEN
    UPDATE ki_providers kp
    SET api_key = subq.api_key
    FROM (
      SELECT DISTINCT ON (provider) provider, api_key
      FROM ki_settings
      WHERE api_key IS NOT NULL
      ORDER BY provider, id
    ) subq
    WHERE kp.provider = subq.provider
      AND kp.api_key IS NULL;

    ALTER TABLE ki_settings DROP COLUMN api_key;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ki_settings' AND column_name = 'dsgvo_level'
  ) THEN
    ALTER TABLE ki_settings DROP COLUMN dsgvo_level;
  END IF;
END $$;
