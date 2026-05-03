-- v50: Drehorte (physical filming locations) + Motive hierarchy
CREATE TABLE IF NOT EXISTS drehorte (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produktion_id TEXT NOT NULL REFERENCES produktionen(id) ON DELETE CASCADE,
  label         TEXT NOT NULL,
  sort_order    INT DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (produktion_id, label)
);
CREATE INDEX IF NOT EXISTS idx_drehorte_produktion ON drehorte(produktion_id);

-- Extend motive with drehort link + parent hierarchy
ALTER TABLE motive ADD COLUMN IF NOT EXISTS drehort_id UUID REFERENCES drehorte(id);
ALTER TABLE motive ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES motive(id);
