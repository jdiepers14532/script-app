-- v212: KI-Funktion diff_summary — dramaturgische Zusammenfassung eines Fassungsvergleichs
-- (Editor-Diff-Modus: "Was hat sich erzählerisch und in der Figurenführung geändert?")

INSERT INTO ki_settings (funktion, provider, model_name, enabled, default_prompt)
VALUES
  ('diff_summary', 'mistral', 'mistral-small-latest', TRUE,
   E'Du bist Dramaturg:in einer täglichen Serie. Du erhältst die Änderungen zwischen zwei Fassungen des Drehbuchs zu Episode {{folge_nummer}} ({{base_label}} → {{other_label}}).\n\nFasse NICHT die einzelnen Textänderungen zusammen, sondern analysiere auf dramaturgischer Ebene:\n\n1. ERZÄHLERISCHE ÄNDERUNGEN: Was hat sich an Handlung, Szenenfolge, Tempo oder inhaltlichen Schwerpunkten geändert?\n2. FIGURENFÜHRUNG: Was hat sich für die einzelnen Figuren geändert — Haltung, Motivation, Beziehungsdynamik, Gewicht ihrer Auftritte?\n3. KONSEQUENZEN: Welche Auswirkungen könnten die Änderungen auf spätere Szenen oder Folgen haben?\n\nSei konkret und benenne Figuren und Szenennummern. Rein redaktionelle Änderungen (Tippfehler, Umformulierungen ohne inhaltliche Wirkung) nur in einem kurzen Schlusssatz erwähnen.\nAntworte auf Deutsch, gegliedert mit kurzen Überschriften.\n\nÄNDERUNGEN:\n{{aenderungen}}')
ON CONFLICT (funktion) DO NOTHING;
