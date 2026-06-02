-- v174: block_uuid (= ProseMirror node_id) in szenen_revisionen
--
-- UUID-basiertes Matching löst das position-basierte block_index-Matching ab.
-- Invariante 2.1: szenen_revisionen immer in derselben Transaktion wie
-- dokument_szenen.content geschrieben — kein Fenster ohne Revision.
--
-- Änderungen:
--   1. block_uuid TEXT — neue Matching-Spalte
--   2. block_index NOT NULL → nullable (bleibt für Legacy-Einträge)
--   3. Altes Unique-Index uq_rev_dok_szene_block (block_index) fällt weg
--   4. Neuer Partial-Unique-Index uq_rev_dok_szene_block_uuid (block_uuid)

ALTER TABLE szenen_revisionen ADD COLUMN IF NOT EXISTS block_uuid TEXT;

-- block_index nullable machen: neue Einträge verwenden block_uuid, nicht block_index
ALTER TABLE szenen_revisionen ALTER COLUMN block_index DROP NOT NULL;

-- Alten position-basierten Unique-Index entfernen
DROP INDEX IF EXISTS uq_rev_dok_szene_block;

-- Neuer UUID-basierter Partial-Unique-Index
-- Partial: nur für Einträge mit block_uuid (Legacy-Einträge ohne block_uuid bleiben unberührt)
CREATE UNIQUE INDEX IF NOT EXISTS uq_rev_dok_szene_block_uuid
  ON szenen_revisionen (dokument_szene_id, block_uuid)
  WHERE field_type = 'content_block' AND block_uuid IS NOT NULL;
