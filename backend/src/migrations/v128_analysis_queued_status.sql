-- v128: analysis_runs.status um 'queued' erweitern (Hintergrundverarbeitung)
ALTER TABLE analysis_runs DROP CONSTRAINT IF EXISTS analysis_runs_status_check;
ALTER TABLE analysis_runs ADD CONSTRAINT analysis_runs_status_check
  CHECK (status IN ('queued', 'running', 'completed', 'error'));
