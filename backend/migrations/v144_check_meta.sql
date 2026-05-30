-- v144: meta JSONB column for check results (strang suggestions, rollen fix data)
ALTER TABLE szenen_check_ergebnisse ADD COLUMN IF NOT EXISTS meta JSONB;
