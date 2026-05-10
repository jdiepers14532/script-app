-- v64: Original-Datei-Archivierung + SHA-256 Duplikat-Check
-- Speichert importierte Originaldateien und deren Hashes

-- Neue Felder auf werkstufen
ALTER TABLE werkstufen ADD COLUMN IF NOT EXISTS original_datei TEXT;
ALTER TABLE werkstufen ADD COLUMN IF NOT EXISTS original_dateiname TEXT;
ALTER TABLE werkstufen ADD COLUMN IF NOT EXISTS datei_hash TEXT;
ALTER TABLE werkstufen ADD COLUMN IF NOT EXISTS datei_groesse INTEGER;

-- Index für schnelle Hash-Duplikat-Suche
CREATE INDEX IF NOT EXISTS idx_werkstufen_datei_hash ON werkstufen (datei_hash) WHERE datei_hash IS NOT NULL;
