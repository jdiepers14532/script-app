-- v36: Add crosscut flag and seconds-precision duration
ALTER TABLE szenen ADD COLUMN IF NOT EXISTS is_wechselschnitt BOOLEAN DEFAULT FALSE;
ALTER TABLE szenen ADD COLUMN IF NOT EXISTS dauer_sek INTEGER;

-- Migrate existing dauer_min to dauer_sek (approximate)
UPDATE szenen SET dauer_sek = dauer_min * 60 WHERE dauer_min IS NOT NULL AND dauer_sek IS NULL;
