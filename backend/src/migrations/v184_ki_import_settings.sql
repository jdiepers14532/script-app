-- KI-Einstellungen für 3-Tier PDF-Import
-- import_detect: Tier-2 — erkennt Dokumentstruktur via KI (ein Call, kurzer Auszug)
-- import_extract: Tier-3 — extrahiert Blöcke pro Chunk via KI (N Calls)

INSERT INTO ki_settings (funktion, provider, model_name, enabled, default_prompt)
VALUES
  ('import_detect', 'mistral', 'mistral-small-latest', TRUE,
   E'Du analysierst den extrahierten Text eines deutschsprachigen Produktionsdokuments.\nPrüfe, ob in diesem Text eine BLOCK/STRANG-Dokumentstruktur erkennbar ist.\n\nTYPISCHE MERKMALE (RR-Future-Dokument):\n- STRANG-ÜBERSCHRIFTEN: Zeilen in GROSSBUCHSTABEN mit " - " Trennern, z.B. "SVENJA - ARTHUR - TILL"\n- BLOCK-KÖPFE: Zeilen wie "BLOCK 845", "BLOCK 845 - HEINER", "Block 845"\n- Darunter: Prosa-Text des jeweiligen Blocks im Strang\n\nAntworte NUR mit einem JSON-Objekt, keine Erklärungen:\n{\n  "erkannt": true,\n  "typ": "future",\n  "block_pattern": "Beschreibung oder null",\n  "strang_pattern": "Beschreibung oder null",\n  "notiz": "Kurze Erklärung (max. 150 Zeichen)"\n}\n\nDOKUMENTTEXT (Auszug):\n{{text_sample}}'),
  ('import_extract', 'mistral', 'mistral-small-latest', TRUE,
   E'Extrahiere alle Block-Strang-Kombinationen aus diesem Abschnitt eines Future-Dokuments.\nErkenne: STRANG-ÜBERSCHRIFTEN (GROSSBUCHSTABEN mit " - "), BLOCK-KÖPFE (BLOCK NNN), Prosa-Text.\n\nAntworte NUR mit einem JSON-Array, keine Erklärungen:\n[{"block_nummer":845,"charakter":"HEINER","strang":"SVENJA - ARTHUR - HEINER","text":"Prosatext..."}]\nWenn kein Block erkannt wird, antworte mit [] (leeres Array).\n\nDOKUMENTABSCHNITT:\n{{chunk}}')
ON CONFLICT (funktion) DO NOTHING;
