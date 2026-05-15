-- v74: Recreate szenen_revisionen table
-- Was dropped in v72 as "nie produktiv genutzt" — incorrect, v71 added revision tracking
-- that actively uses this table (recordRevisionDeltas + GET /api/dokument-szenen/:id/revisionen).

CREATE TABLE IF NOT EXISTS szenen_revisionen (
  id              SERIAL PRIMARY KEY,
  dokument_szene_id UUID NOT NULL REFERENCES dokument_szenen(id) ON DELETE CASCADE,
  field_type      TEXT NOT NULL,
  block_index     INT  NOT NULL,
  block_type      TEXT,
  old_value       TEXT,
  new_value       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_szenen_rev_dok_szene ON szenen_revisionen(dokument_szene_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rev_dok_szene_block
  ON szenen_revisionen(dokument_szene_id, block_index)
  WHERE field_type = 'content_block';
