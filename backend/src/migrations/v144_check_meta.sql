-- v144: meta-Spalte für szenen_check_ergebnisse (strukturierte Check-Metadaten)
ALTER TABLE szenen_check_ergebnisse ADD COLUMN IF NOT EXISTS meta JSONB;
