-- v77: Autorenplan — Job-Kategorien als echte DB-Tabelle
-- Ersetzt buchprozess_config JSON durch strukturierte Tabelle
-- Erweitert autorenplan_einsaetze um job_kategorie_id + folge_nummer

CREATE TABLE autorenplan_job_kategorien (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produktion_db_id UUID NOT NULL,

  -- Anzeige & Vertragsdb-Verknüpfung
  label TEXT NOT NULL,
  beschreibung TEXT,
  vertragsdb_taetigkeit_id INTEGER,

  -- Gagenkategorie
  gage_betrag NUMERIC(10,2),
  gage_waehrung TEXT NOT NULL DEFAULT 'EUR',
  abrechnungstyp TEXT NOT NULL DEFAULT 'pauschal',
    -- pauschal|pro_woche|pro_tag|pro_buch
  lst_rg TEXT NOT NULL DEFAULT 'RG',
    -- LSt|RG

  -- Slot-Konfiguration
  max_slots INTEGER NOT NULL DEFAULT 1,
  slots_gleich_folgen BOOLEAN NOT NULL DEFAULT FALSE,

  -- Zeitkonfiguration (Dauer pro Bezugseinheit)
  dauer_wochen INTEGER NOT NULL DEFAULT 1,
  bezugseinheit TEXT NOT NULL DEFAULT 'block',
    -- block|folge

  -- HO/Präsenz (relativ: [1] = Woche 1 Präsenz, Rest HO)
  praesenz_wochen INTEGER[] NOT NULL DEFAULT ARRAY[1]::INTEGER[],

  -- Blockkalender-Anker: wann startet die Arbeit am ersten Block?
  erster_block_start DATE,

  -- Darstellung
  farbe TEXT NOT NULL DEFAULT '#007AFF',
  sortierung INTEGER NOT NULL DEFAULT 0,

  -- Audit
  erstellt_von TEXT,
  erstellt_am TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  aktualisiert_am TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX autorenplan_job_kategorien_produktion_idx
  ON autorenplan_job_kategorien(produktion_db_id);

-- Einsätze: job_kategorie_id + folge_nummer hinzufügen
ALTER TABLE autorenplan_einsaetze
  ADD COLUMN job_kategorie_id UUID REFERENCES autorenplan_job_kategorien(id) ON DELETE SET NULL,
  ADD COLUMN folge_nummer INTEGER;

CREATE INDEX autorenplan_einsaetze_jobkat_idx
  ON autorenplan_einsaetze(job_kategorie_id);
