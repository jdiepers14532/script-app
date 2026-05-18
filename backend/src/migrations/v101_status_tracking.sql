-- v100: Status-Tracking auf autorenplan_einsaetze
-- Zeitstempel + User für die 4 zu trackenden Status-Übergänge
ALTER TABLE autorenplan_einsaetze
  ADD COLUMN IF NOT EXISTS angefragt_am       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS angefragt_von      TEXT,
  ADD COLUMN IF NOT EXISTS zugesagt_am        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS zugesagt_von       TEXT,
  ADD COLUMN IF NOT EXISTS vertrag_zurueck_am  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS vertrag_zurueck_von TEXT,
  ADD COLUMN IF NOT EXISTS abgesagt_am        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS abgesagt_von       TEXT;
