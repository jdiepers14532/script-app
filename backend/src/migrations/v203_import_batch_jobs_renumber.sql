-- v203: Bulk-Import — Neunummerierung pro Folge.
-- Wenn TRUE, werden die Szenen der Folge beim Import lückenlos ab 1 neu durchnummeriert
-- (für Drehbücher, die nicht bei Szene 1 beginnen). Default FALSE = Original-Nummern.

ALTER TABLE import_batch_jobs
  ADD COLUMN IF NOT EXISTS renumber BOOLEAN NOT NULL DEFAULT FALSE;
