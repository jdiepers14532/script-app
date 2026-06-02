-- v183_cleanup_orphan_labels.sql
-- Handoff 2 Option C: Generelle, idempotente Bereinigung verwaister werkstufen.label-Einträge.
-- Setzt label = NULL für alle Werkstufen, deren label-String keinem stage_labels.name
-- in derselben Produktion entspricht.
-- Erfasst ALLE Orphans (alle Produktionen) unabhängig von ihrer Herkunft.
-- Idempotent: Re-Run findet 0 Zeilen.
UPDATE werkstufen w
SET label = NULL
FROM folgen f
WHERE w.folge_id = f.id
  AND w.label IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM stage_labels sl
    WHERE sl.produktion_id = f.produktion_id
      AND sl.name = w.label
  );
