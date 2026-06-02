-- PR 14: Import-Commit — Spalten für den Commit-Schritt in import_jobs
ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS committed_at TIMESTAMPTZ;
ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS committed_strands INT;
ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS committed_beats INT;
