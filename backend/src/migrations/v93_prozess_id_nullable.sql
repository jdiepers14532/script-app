-- v93: prozess_id auf autorenplan_einsaetze nullable machen (legacy-Feld, job_kategorie_id ist der neue Weg)
ALTER TABLE autorenplan_einsaetze ALTER COLUMN prozess_id DROP NOT NULL;
