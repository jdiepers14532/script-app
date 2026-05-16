-- v76: Autorenplan — Autoren-Einsatzplanung
-- Planungstool für Drehbuchkoordination
-- Personen + Tätigkeiten = Referenzen auf Vertragsdatenbank (kein Duplicate)
-- Produktionen = immer über produktion_db_id (UUID aus Prod-DB), nie lokale ID

-- Kern-Planung: je ein Einsatz = vollständige Laufzeit (z.B. 3 Wochen Storyedit)
CREATE TABLE autorenplan_einsaetze (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produktion_db_id UUID NOT NULL,
  prozess_id TEXT NOT NULL,             -- 'storyline'|'storyedit'|'drehbuch'|'scriptedit'|...
  woche_von DATE NOT NULL,              -- Startdatum Woche 1 (Präsenz oder HO)

  -- Person: ENTWEDER Vertragsdb-Referenz ODER Platzhalter
  vertragsdb_person_id INTEGER,
  platzhalter_name TEXT,
  person_cache_name TEXT,               -- denormalisiert für Performance-Anzeige

  -- Job-Funktion + Vertrag (aus Vertragsdatenbank)
  vertragsdb_taetigkeit_id INTEGER,
  vertragsdb_vertrag_id INTEGER,        -- optional, wenn Vertrag existiert und verknüpft

  -- Planungsdaten
  block_nummer INTEGER,                  -- informativ (kein FK), aus Planung
  status TEXT NOT NULL DEFAULT 'geplant',
    -- geplant|angefragt|zugesagt|vertrag_geschrieben|vertrag_zurueck|rechnung_erhalten
  kostenstelle TEXT,                    -- überschreibt Config-Default wenn gesetzt
  ist_homeoffice_override BOOLEAN,      -- NULL = aus Config-praesenz_wochen ableiten
  notiz TEXT,

  erstellt_von TEXT,
  erstellt_am TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  aktualisiert_am TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX autorenplan_einsaetze_produktion_idx ON autorenplan_einsaetze(produktion_db_id);
CREATE INDEX autorenplan_einsaetze_woche_idx ON autorenplan_einsaetze(woche_von);
CREATE INDEX autorenplan_einsaetze_person_idx ON autorenplan_einsaetze(vertragsdb_person_id);

-- Zusatzpersonal: Rewrites, Sonderaufgaben, Vertretungen
CREATE TABLE autorenplan_zusatz (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  einsatz_id UUID REFERENCES autorenplan_einsaetze(id) ON DELETE CASCADE,
  vertragsdb_person_id INTEGER,
  platzhalter_name TEXT,
  person_cache_name TEXT,
  woche_von DATE,
  woche_bis DATE,
  beschreibung TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'geplant',
  notiz TEXT,
  erstellt_von TEXT,
  erstellt_am TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Wochennotizen: Etwaige Zusatzkosten, Sperrer, allgemeine Hinweise
CREATE TABLE autorenplan_wochen_notizen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produktion_db_id UUID NOT NULL,
  woche_von DATE NOT NULL,
  typ TEXT NOT NULL DEFAULT 'allgemein',  -- 'zusatzkosten'|'sperrer'|'allgemein'
  text TEXT NOT NULL,
  erstellt_von TEXT,
  erstellt_am TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX autorenplan_wochen_notizen_idx ON autorenplan_wochen_notizen(produktion_db_id, woche_von);

-- Futures: Gruppen von Autoren für einen definierten Zeitraum
CREATE TABLE autorenplan_futures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produktion_db_id UUID NOT NULL,
  titel TEXT NOT NULL,          -- z.B. "Future III", "Future I Staffel 26"
  schreib_von DATE NOT NULL,
  schreib_bis DATE NOT NULL,
  edit_von DATE,                -- optionale, separate Edit-Phase
  edit_bis DATE,
  sortierung INTEGER DEFAULT 0,
  notiz TEXT,
  erstellt_von TEXT,
  erstellt_am TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX autorenplan_futures_produktion_idx ON autorenplan_futures(produktion_db_id);

-- Future-Autoren: Zuweisung pro Phase (schreiben | edit)
CREATE TABLE autorenplan_future_autoren (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  future_id UUID NOT NULL REFERENCES autorenplan_futures(id) ON DELETE CASCADE,
  vertragsdb_person_id INTEGER,
  platzhalter_name TEXT,
  person_cache_name TEXT,
  phase TEXT NOT NULL DEFAULT 'schreiben',  -- 'schreiben'|'edit'
  ist_homeoffice BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'geplant',
  notiz TEXT
);

CREATE INDEX autorenplan_future_autoren_future_idx ON autorenplan_future_autoren(future_id);

-- Buchprozess-Konfiguration: in production_app_settings mit key 'buchprozess_config'
-- Default-Wert wird beim ersten Zugriff per API gesetzt (aus Code-Default)
-- Kein separater INSERT hier — der Backend-Code legt das automatisch an.
