-- v116: dokument_vorlagen.created_at → TIMESTAMPTZ
-- Einzige TIMESTAMP-WITHOUT-TZ Spalte in script_db.
-- Server läuft UTC → Werte sind faktisch UTC, nur der Typ fehlt.
-- Idempotent: tut nichts wenn Spalte bereits TIMESTAMPTZ ist.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'dokument_vorlagen'
      AND column_name  = 'created_at'
      AND data_type    = 'timestamp without time zone'
  ) THEN
    ALTER TABLE dokument_vorlagen ALTER COLUMN created_at TYPE TIMESTAMPTZ;
  END IF;
END $$;
