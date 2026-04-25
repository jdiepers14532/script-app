-- Option A: Direct ProdDB references, no local bloecke/episoden sync

-- 1. Folgen metadata (script-specific per-episode data, e.g. arbeitstitel, synopsis)
CREATE TABLE IF NOT EXISTS folgen_meta (
  staffel_id TEXT NOT NULL REFERENCES staffeln(id) ON DELETE CASCADE,
  folge_nummer INT NOT NULL,
  arbeitstitel TEXT,
  air_date DATE,
  synopsis TEXT,
  meta_json JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (staffel_id, folge_nummer)
);

-- 2. Add direct reference columns to stages
ALTER TABLE stages
  ADD COLUMN IF NOT EXISTS staffel_id TEXT REFERENCES staffeln(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS folge_nummer INT,
  ADD COLUMN IF NOT EXISTS proddb_block_id UUID;

-- 3. Migrate existing stages data — only if episode_id column still exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stages' AND column_name = 'episode_id'
  ) THEN
    UPDATE stages s
    SET
      staffel_id = b.staffel_id,
      folge_nummer = e.episode_nummer,
      proddb_block_id = (b.meta_json->>'proddb_id')::uuid
    FROM episoden e
    JOIN bloecke b ON b.id = e.block_id
    WHERE s.episode_id = e.id;
  END IF;
END $$;

-- 4. Drop old episode FK on stages
ALTER TABLE stages DROP CONSTRAINT IF EXISTS stages_episode_id_fkey;
ALTER TABLE stages DROP COLUMN IF EXISTS episode_id;

-- 5. Add direct reference columns to episode_locks
ALTER TABLE episode_locks
  ADD COLUMN IF NOT EXISTS staffel_id TEXT REFERENCES staffeln(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS folge_nummer INT;

-- 6. Migrate existing locks — only if episode_id column still exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'episode_locks' AND column_name = 'episode_id'
  ) THEN
    UPDATE episode_locks el
    SET
      staffel_id = b.staffel_id,
      folge_nummer = e.episode_nummer
    FROM episoden e
    JOIN bloecke b ON b.id = e.block_id
    WHERE el.episode_id = e.id;
  END IF;
END $$;

-- 7. Drop old episode FK on episode_locks
ALTER TABLE episode_locks DROP CONSTRAINT IF EXISTS episode_locks_episode_id_fkey;
ALTER TABLE episode_locks DROP COLUMN IF EXISTS episode_id;

-- 8. Migrate existing episoden metadata — only if episoden table still exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'episoden'
  ) THEN
    INSERT INTO folgen_meta (staffel_id, folge_nummer, arbeitstitel, air_date, synopsis, meta_json)
    SELECT b.staffel_id, e.episode_nummer, e.arbeitstitel, e.air_date, e.synopsis, COALESCE(e.meta_json, '{}')
    FROM episoden e
    JOIN bloecke b ON b.id = e.block_id
    ON CONFLICT (staffel_id, folge_nummer) DO NOTHING;
  END IF;
END $$;

-- 9. Drop sync tables (episoden first due to FK, then bloecke)
DROP TABLE IF EXISTS episoden;
DROP TABLE IF EXISTS bloecke;
