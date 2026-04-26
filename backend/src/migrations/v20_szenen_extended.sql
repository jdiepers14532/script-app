-- v20: stimmung, spielzeit, storyline als neue Felder auf szenen
ALTER TABLE szenen ADD COLUMN IF NOT EXISTS stimmung TEXT;
ALTER TABLE szenen ADD COLUMN IF NOT EXISTS spielzeit TEXT;
ALTER TABLE szenen ADD COLUMN IF NOT EXISTS storyline TEXT;
