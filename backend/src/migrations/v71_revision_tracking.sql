-- v69: Revision-Tracking auf Werkstufen-Ebene
-- revision_color_id auf werkstufen: zeigt an, ob Revision aktiv ist und welche Farbe verwendet wird.
-- UNIQUE auf szenen_revisionen(dokument_szene_id, block_index): ermöglicht UPSERT (nur eine Revision pro Block).

ALTER TABLE werkstufen
  ADD COLUMN IF NOT EXISTS revision_color_id INT REFERENCES revision_colors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_werkstufen_revision_color ON werkstufen(revision_color_id) WHERE revision_color_id IS NOT NULL;

-- Unique constraint für UPSERT-Deduplication: ein Eintrag pro (szene, block)
ALTER TABLE szenen_revisionen DROP CONSTRAINT IF EXISTS uq_rev_dok_szene_block;
ALTER TABLE szenen_revisionen ADD CONSTRAINT uq_rev_dok_szene_block
  UNIQUE (dokument_szene_id, block_index)
  WHERE dokument_szene_id IS NOT NULL AND block_index IS NOT NULL;
