-- v41: Add dokument_szene_id and fassung_id columns to szenen_revisionen
-- Allows revision tracking for the new dokument_szenen system.
-- szene_id + stage_id remain for backward compat with old system.

ALTER TABLE szenen_revisionen ALTER COLUMN szene_id DROP NOT NULL;
ALTER TABLE szenen_revisionen ALTER COLUMN stage_id DROP NOT NULL;

ALTER TABLE szenen_revisionen
  ADD COLUMN IF NOT EXISTS dokument_szene_id UUID REFERENCES dokument_szenen(id) ON DELETE CASCADE;
ALTER TABLE szenen_revisionen
  ADD COLUMN IF NOT EXISTS fassung_id UUID REFERENCES folgen_dokument_fassungen(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_szenen_rev_dok_szene ON szenen_revisionen(dokument_szene_id);
CREATE INDEX IF NOT EXISTS idx_szenen_rev_fassung ON szenen_revisionen(fassung_id);

-- Ensure at least old or new FK is set
ALTER TABLE szenen_revisionen DROP CONSTRAINT IF EXISTS chk_rev_has_ref;
ALTER TABLE szenen_revisionen ADD CONSTRAINT chk_rev_has_ref
  CHECK (szene_id IS NOT NULL OR dokument_szene_id IS NOT NULL);
