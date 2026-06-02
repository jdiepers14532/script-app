-- Extrahierten Text in import_jobs cachen (verhindert wiederholtes PDF-Parsen für Tier-2/3)
ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS extracted_text TEXT;
