-- v12: Export-Log + Wasserzeichen-Infrastruktur
CREATE TABLE IF NOT EXISTS export_logs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT        NOT NULL,
  user_name   TEXT        NOT NULL,
  stage_id    INTEGER     REFERENCES stages(id) ON DELETE SET NULL,
  stage_label TEXT,
  staffel_id  TEXT,
  format      TEXT        NOT NULL,
  exported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS export_logs_user_idx        ON export_logs(user_id);
CREATE INDEX IF NOT EXISTS export_logs_stage_idx       ON export_logs(stage_id);
CREATE INDEX IF NOT EXISTS export_logs_exported_at_idx ON export_logs(exported_at DESC);
