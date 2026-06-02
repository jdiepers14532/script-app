-- v180: Import-Jobs für den 3-Tier-PDF-Import

CREATE TABLE IF NOT EXISTS import_jobs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produktion_id    TEXT REFERENCES produktionen(id) ON DELETE CASCADE,
  status           TEXT DEFAULT 'queued'
    CHECK (status IN ('queued','detecting','chunking','running','done','error')),
  tier_erreicht    INT,
  provider         TEXT,
  model            TEXT,
  source_file_name TEXT,
  source_file_path TEXT,       -- absoluter Pfad auf dem Server
  total_chunks     INT,
  done_chunks      INT DEFAULT 0,
  chunks_json      JSONB,      -- [{idx, label, status, fehler, result}]
  ergebnis_json    JSONB,      -- finales merge-Ergebnis
  fehler           TEXT,
  user_id          TEXT,
  erstellt_am      TIMESTAMPTZ DEFAULT NOW(),
  abgeschlossen_am TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_import_jobs_produktion ON import_jobs(produktion_id);
CREATE INDEX IF NOT EXISTS idx_import_jobs_status     ON import_jobs(status);
