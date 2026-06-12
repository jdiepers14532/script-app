-- v211_transkript_entwuerfe.sql
-- Anmerkungen-Hub Phase 7 / Eingangskanal A2 (Handoff 5):
-- Transkription (Storyline-/Drehbuchbesprechung) → KI → Entwürfe → menschliche Sichtung.
-- Entwürfe leben in einer eigenen Staging-Tabelle — NIE auto-angewendet; erst "Übernehmen"
-- erzeugt einen echten anker + eine echte anmerkung.
-- (Geplant als v197 im Handoff; umnummeriert auf v211, v197 war durch import_batches belegt.)

CREATE TABLE IF NOT EXISTS anmerkung_entwurf (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quelle_session      TEXT,                 -- Sitzungs-/Transkript-Referenz (frei, z.B. "Abnahme F2412")
  vorschlag_quelle    TEXT,
  vorschlag_kategorie TEXT,
  body                JSONB NOT NULL,       -- {text} — wie anmerkung.body
  -- Anker-Vermutung (unverbindlich, gleiche Felder wie anker):
  werkstufe_id        UUID REFERENCES werkstufen(id)       ON DELETE CASCADE,
  scene_identity_id   UUID REFERENCES scene_identities(id) ON DELETE CASCADE,
  store               TEXT CHECK (store IN ('content','kopffeld')),
  node_id             TEXT,
  feldname            TEXT,
  selektor            JSONB,
  szene_hinweis       TEXT,                 -- Roh-Hinweis der KI (Szenennr./Motiv) für die Sichtung
  zitat               TEXT,                 -- Roh-Zitat der KI (Anzeige, auch wenn nicht lokalisierbar)
  konfidenz           REAL,                 -- Match-Qualität des Server-Mappings
  status              TEXT NOT NULL DEFAULT 'offen'
                        CHECK (status IN ('offen','uebernommen','verworfen')),
  erstellt_von        TEXT NOT NULL,        -- auth user_id (TEXT, app-weit konsistent)
  erstellt_am         TIMESTAMPTZ NOT NULL DEFAULT now(),
  gesichtet_von       TEXT,
  gesichtet_am        TIMESTAMPTZ,
  anmerkung_id        UUID REFERENCES anmerkung(id) ON DELETE SET NULL  -- nach Übernahme
);
CREATE INDEX IF NOT EXISTS idx_entwurf_werkstufe ON anmerkung_entwurf (werkstufe_id, status);

-- KI-Funktion (Provider/Modell/Prompt admin-konfigurierbar wie alle anderen Funktionen)
INSERT INTO ki_settings (funktion, provider, model_name, enabled, default_prompt)
VALUES ('transkript_auswertung', 'mistral', 'mistral-small-latest', TRUE,
  E'Du wertest das Transkript einer Storyline- oder Drehbuchbesprechung einer deutschen TV-Produktion aus.\nExtrahiere alle konkreten Anmerkungen, Änderungswünsche und Aufträge zum Drehbuch. Fasse jede Anmerkung knapp und handlungsfähig zusammen (1-3 Sätze). Ignoriere Smalltalk, Organisatorisches und reine Wiederholungen.\n\nAntworte NUR mit einem JSON-Array, keine Erklärungen:\n[{"text":"knappe, handlungsfähige Zusammenfassung der Anmerkung","quelle":"redaktion|produktion|sender|kunde","kategorie":"inhalt|dialog|logik|kontinuitaet|sonstiges","szene":"Szenennummer oder Motiv/Ortsname, falls im Gespräch genannt, sonst null","zitat":"kurzes WÖRTLICHES Zitat aus dem Drehbuchtext, falls die Stelle wörtlich zitiert wird, sonst null"}]\nWenn keine Anmerkungen erkennbar sind, antworte mit [] (leeres Array).\n\nVERFÜGBARE SZENEN DER FASSUNG:\n{{szenen_liste}}\n\nTRANSKRIPT:\n{{transcript}}')
ON CONFLICT (funktion) DO NOTHING;
