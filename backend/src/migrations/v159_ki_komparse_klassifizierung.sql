-- v159: KI-Settings-Eintrag für Komparsen-Spiel-Disambiguierung (Phase 2)
--
-- Komparse-Klassifizierung läuft in 2 Stufen:
--   1. Heuristik (immer): Dialogue-Node → mit_text; Action-Erwähnung → mit_spiel-Kandidat; sonst → ot.
--   2. Mistral-Disambiguierung (wenn enabled=true): bestätigt oder widerlegt mit_spiel-Kandidaten
--      mit evidence_text + konfidenz. Recall > Precision (im Zweifel mit_spiel).
--
-- Default: enabled=false — Admin muss es explizit aktivieren.
-- Provider: mistral-small-latest (Ollama zu langsam für Hotpath-nahe Nutzung).

INSERT INTO ki_settings (funktion, provider, model_name, enabled)
VALUES ('komparse_spiel_disambiguation', 'mistral', 'mistral-small-latest', false)
ON CONFLICT (funktion) DO NOTHING;
