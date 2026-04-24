-- Remove duplicate bloecke (keep lowest id per staffel+block_nummer)
DELETE FROM bloecke a USING bloecke b
WHERE a.id > b.id
  AND a.staffel_id = b.staffel_id
  AND a.block_nummer = b.block_nummer;

-- Unique constraint for on-conflict upsert from Produktionsdatenbank
ALTER TABLE bloecke DROP CONSTRAINT IF EXISTS bloecke_staffel_blocknr_unique;
ALTER TABLE bloecke ADD CONSTRAINT bloecke_staffel_blocknr_unique UNIQUE (staffel_id, block_nummer);

-- Unique constraint for episoden upsert
ALTER TABLE episoden DROP CONSTRAINT IF EXISTS episoden_block_epnr_unique;
ALTER TABLE episoden ADD CONSTRAINT episoden_block_epnr_unique UNIQUE (block_id, episode_nummer);
