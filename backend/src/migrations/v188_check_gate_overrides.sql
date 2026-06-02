-- v188: Audit-Tabelle für Check-Gate-Overrides (Handoff 3 §7)
-- Persistiert: Wer, Wann, Welche Warnungen wurden beim Lock übersteuert.

CREATE TABLE IF NOT EXISTS check_gate_overrides (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  werkstufe_id   UUID NOT NULL REFERENCES werkstufen(id) ON DELETE CASCADE,
  user_id        TEXT NOT NULL,
  warnungen_count INTEGER NOT NULL DEFAULT 0,
  warnungen_typen TEXT[],          -- check_typ-Werte der übersteuerten Warnungen
  warnungen_szenen INTEGER[],      -- scene_nummer der betroffenen Szenen
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_check_gate_overrides_werkstufe
  ON check_gate_overrides (werkstufe_id);
CREATE INDEX IF NOT EXISTS idx_check_gate_overrides_user
  ON check_gate_overrides (user_id);
CREATE INDEX IF NOT EXISTS idx_check_gate_overrides_created
  ON check_gate_overrides (created_at DESC);
