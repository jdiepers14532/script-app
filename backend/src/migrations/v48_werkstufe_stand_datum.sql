-- v48: Add stand_datum to werkstufen (document date / "Stand" from PDF cover)
ALTER TABLE werkstufen ADD COLUMN IF NOT EXISTS stand_datum DATE;
