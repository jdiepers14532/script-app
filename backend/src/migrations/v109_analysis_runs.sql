-- v109: Analyse-Editor
-- Tabellen: analysis_runs, analysis_method_results, analysis_costs
-- + meta_json auf werkstufen (für roteRosenMeta-Persistenz, Fallback für Prompt-Header)
-- + app_settings Seeds für analysis_model und analysis_allowed_roles

-- ── werkstufen: meta_json für Import-Metadaten ────────────────────────────────
ALTER TABLE werkstufen ADD COLUMN IF NOT EXISTS meta_json JSONB;

-- ── analysis_runs ─────────────────────────────────────────────────────────────
-- Ein Eintrag pro Klick auf "Analyse starten".
-- Modus A: produktion_id + block_nummer (Block-Analyse, auto aktuellste Werkstufen)
-- Modus B: werkstufen_ids explizit übergeben (Einzel-Fassung)
CREATE TABLE IF NOT EXISTS analysis_runs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produktion_id       TEXT REFERENCES produktionen(id) ON DELETE SET NULL,
  block_nummer        INT,
  folgen_ids          INT[]    NOT NULL DEFAULT '{}',
  werkstufen_ids      UUID[]   NOT NULL DEFAULT '{}',
  block_version_hash  TEXT     NOT NULL,
  requested_methods   JSONB    NOT NULL DEFAULT '[]',
  strang_filter       TEXT[],
  status              TEXT     NOT NULL DEFAULT 'running'
                        CHECK (status IN ('running','completed','error')),
  created_by          TEXT     NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS analysis_runs_produktion_block
  ON analysis_runs (produktion_id, block_nummer);
CREATE INDEX IF NOT EXISTS analysis_runs_hash
  ON analysis_runs (block_version_hash);
CREATE INDEX IF NOT EXISTS analysis_runs_created_at
  ON analysis_runs (created_at DESC);

-- ── analysis_method_results ───────────────────────────────────────────────────
-- Ein Eintrag pro Methode pro Run.
-- result_structured JSONB: leer in Phase 1.
-- TODO Phase 3: Schema definieren für Visualisierungen (Strang-Heatmap,
--   PEN/CLIFF-Dichte, Figuren-Agency-Matrix, Vonnegut-Arcs).
--   Extraktion via separatem Haiku-Call (Option B), nicht im Haupt-Call.
CREATE TABLE IF NOT EXISTS analysis_method_results (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id              UUID     NOT NULL REFERENCES analysis_runs(id) ON DELETE CASCADE,
  method              TEXT     NOT NULL,
  method_version      TEXT     NOT NULL,
  status              TEXT     NOT NULL DEFAULT 'running'
                        CHECK (status IN ('running','completed','error')),
  from_cache          BOOLEAN  NOT NULL DEFAULT false,
  result_markdown     TEXT,
  result_structured   JSONB,
  error_detail        TEXT,
  duration_ms         INT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS analysis_method_results_run_id
  ON analysis_method_results (run_id);
CREATE INDEX IF NOT EXISTS analysis_method_results_cache_lookup
  ON analysis_method_results (method, method_version, status)
  WHERE status = 'completed';

-- ── analysis_costs ────────────────────────────────────────────────────────────
-- Ein Eintrag pro kostenpflichtiger Methode.
-- DSGVO: kein Treatment-Inhalt in diesem Log — nur Token-Counts und IDs.
CREATE TABLE IF NOT EXISTS analysis_costs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  method_result_id    UUID     NOT NULL REFERENCES analysis_method_results(id) ON DELETE CASCADE,
  run_id              UUID     NOT NULL REFERENCES analysis_runs(id) ON DELETE CASCADE,
  provider            TEXT     NOT NULL DEFAULT 'claude',
  model               TEXT     NOT NULL,
  input_tokens        INT      NOT NULL DEFAULT 0,
  output_tokens       INT      NOT NULL DEFAULT 0,
  cache_write_tokens  INT      NOT NULL DEFAULT 0,
  cache_read_tokens   INT      NOT NULL DEFAULT 0,
  cost_eur_cent       INT      NOT NULL DEFAULT 0,  -- Integer EUR-Cent
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS analysis_costs_run_id
  ON analysis_costs (run_id);

-- ── app_settings Seeds ────────────────────────────────────────────────────────
INSERT INTO app_settings (key, value, updated_at) VALUES
  (
    'analysis_model',
    'claude-opus-4-6',
    NOW()
  ),
  (
    'analysis_allowed_roles',
    '["Dramaturg","Head_Writing","Writer_Producing","Admin","Lektor","superadmin","Supervision_Script","AvD"]',
    NOW()
  )
ON CONFLICT (key) DO NOTHING;
