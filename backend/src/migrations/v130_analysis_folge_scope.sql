-- v119: Analysis-Runs können sich auf eine einzelne Folge beziehen
ALTER TABLE analysis_runs ADD COLUMN IF NOT EXISTS folge_nummer INTEGER;
-- NULL = Block-Analyse, INT = Folge-Analyse
