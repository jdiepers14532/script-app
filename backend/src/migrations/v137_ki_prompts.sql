-- Migration v137: KI-Prompts — editierbare Prompts in ki_settings
ALTER TABLE ki_settings
  ADD COLUMN IF NOT EXISTS prompt TEXT,
  ADD COLUMN IF NOT EXISTS default_prompt TEXT;

-- Default-Prompts für alle Funktionen setzen
UPDATE ki_settings SET
  default_prompt = 'Fasse folgende Szene aus einem deutschen TV-Drehbuch in 1-2 knappen Sätzen zusammen. Nur Inhalt, keine Bewertung. Beginne direkt mit dem Inhalt.\n\nOrt: {{ort}}\nSzene:\n{{content}}',
  prompt = default_prompt
WHERE funktion = 'scene_summary';

UPDATE ki_settings SET
  default_prompt = 'Extrahiere alle Personen (Charaktere), Orte und Props aus folgendem Drehbuchtext.\nAntworte NUR mit JSON-Array: [{"type":"charakter|location|prop","name":"..."}]\n\nText:\n{{text}}',
  prompt = default_prompt
WHERE funktion = 'entity_detect';

UPDATE ki_settings SET
  default_prompt = 'Du analysierst Suchanfragen für ein deutsches TV-Drehbuch-Archiv. Extrahiere Charakternamen und Stichwörter. Antworte NUR mit JSON, ohne Erklärung.\n\nSuchanfrage: "{{query}}"\n\nExtrahiere:\n- characters: Eigennamen von Personen/Charakteren\n- keywords: sonstige relevante Stichwörter (keine Stoppwörter)\n\nJSON: {"characters":["Name1"],"keywords":["wort1"]}',
  prompt = default_prompt
WHERE funktion = 'query_expand';

UPDATE ki_settings SET
  default_prompt = 'Erstelle eine prägnante Episoden-Synopse für eine deutsche TV-Soap-Episode (Rote Rosen).\nStil: sachlich, Präsens, max. 300 Wörter, keine Spoiler-Warnung.\nStruktur: Haupthandlung → Nebenhandlungen → Cliffhanger (falls vorhanden).\n\nFolge {{folge_nummer}}:\n{{szenen_liste}}',
  prompt = default_prompt
WHERE funktion = 'synopsis_generate';
