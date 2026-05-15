-- v69: Revision-Tracking auf Werkstufen-Ebene
-- revision_color_id auf werkstufen: zeigt an, ob Revision aktiv ist und welche Farbe verwendet wird.
-- UNIQUE auf szenen_revisionen(dokument_szene_id, block_index): ermöglicht UPSERT (nur eine Revision pro Block).

ALTER TABLE werkstufen
  ADD COLUMN IF NOT EXISTS revision_color_id INT REFERENCES revision_colors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_werkstufen_revision_color ON werkstufen(revision_color_id) WHERE revision_color_id IS NOT NULL;

-- Partial unique index für UPSERT-Deduplication: ein Eintrag pro (szene, block) bei content_block
-- NOTE: ALTER TABLE ADD CONSTRAINT ... WHERE is not valid SQL; must use CREATE UNIQUE INDEX
DROP INDEX IF EXISTS uq_rev_dok_szene_block;
CREATE UNIQUE INDEX IF NOT EXISTS uq_rev_dok_szene_block
  ON szenen_revisionen(dokument_szene_id, block_index)
  WHERE field_type = 'content_block';
