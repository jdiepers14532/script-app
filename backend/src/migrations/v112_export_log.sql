-- v112: Export-Log-Tabelle für Audit-Trail
-- Jeder PDF/DOCX/Fountain/FDX-Export wird hier geloggt (wer, wann, was, welche Fassung).

CREATE TABLE IF NOT EXISTS export_log (
  id            SERIAL PRIMARY KEY,
  user_id       TEXT          NOT NULL,
  user_name     TEXT          NOT NULL,
  werkstufe_id  TEXT          NOT NULL,
  format        TEXT          NOT NULL,   -- 'pdf' | 'docx' | 'fountain' | 'fdx'
  persoenlicher_ausdruck TEXT,            -- NULL = kein persönlicher Ausdruck
  revision_label TEXT,                    -- NULL = kein Replacement-Pages-Export
  file_size_bytes BIGINT,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_export_log_werkstufe ON export_log(werkstufe_id);
CREATE INDEX IF NOT EXISTS idx_export_log_user      ON export_log(user_id);
CREATE INDEX IF NOT EXISTS idx_export_log_created   ON export_log(created_at DESC);
