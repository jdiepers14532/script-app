-- v49: Drop unused stimmung column from szenen and dokument_szenen
ALTER TABLE szenen DROP COLUMN IF EXISTS stimmung;
ALTER TABLE dokument_szenen DROP COLUMN IF EXISTS stimmung;
