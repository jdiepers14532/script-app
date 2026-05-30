-- v146: Lektor-Inhaltsangabe als eigenes Feld auf folgen
ALTER TABLE folgen ADD COLUMN IF NOT EXISTS synopsis_lektor TEXT;
