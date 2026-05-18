-- v102: Kostenstelle (Buchungskonto) auf autorenplan_job_kategorien
ALTER TABLE autorenplan_job_kategorien ADD COLUMN IF NOT EXISTS kostenstelle TEXT;
