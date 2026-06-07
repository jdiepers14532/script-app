-- v202: Bulk-Import — Sichtbarkeit pro Folge (Job) statt nur global pro Batch.
-- Label-Fassung (import_label) existiert bereits pro Job; hier kommt die Sichtbarkeit dazu,
-- damit jede Folge auf Wizard-Seite 2 den globalen Default überschreiben kann.

ALTER TABLE import_batch_jobs
  ADD COLUMN IF NOT EXISTS import_sichtbarkeit TEXT NOT NULL DEFAULT 'autoren'
    CHECK (import_sichtbarkeit IN ('autoren','produktion'));
