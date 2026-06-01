-- KI-Audit-Log (globale Tabelle, alle Funktionen)
CREATE TABLE IF NOT EXISTS ki_audit_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  funktion     TEXT NOT NULL,
  input_summary  TEXT,
  output_summary TEXT,
  item_count   INT,
  provider     TEXT,
  model        TEXT,
  tokens_in    INT,
  tokens_out   INT,
  user_id      TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ki_audit_log_funktion ON ki_audit_log(funktion);
CREATE INDEX IF NOT EXISTS idx_ki_audit_log_created  ON ki_audit_log(created_at DESC);

-- Neue KI-Funktion: Beat-Kurztext aus Prosa ableiten
INSERT INTO ki_settings (funktion, provider, model_name, enabled, default_prompt)
VALUES (
  'beat_kurztext',
  'mistral',
  'mistral-small-latest',
  FALSE,
  E'Du bist Dramaturg einer deutschen TV-Soap. Leite aus dem folgenden Prosa-Text einen prägnanten Kurztext ab (max. 80 Zeichen). Antworte NUR mit dem Kurztext, ohne Anführungszeichen und ohne Erklärung.\n\nProsa:\n{{prosa_text}}'
)
ON CONFLICT (funktion) DO NOTHING;
