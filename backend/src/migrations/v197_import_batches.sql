-- v197: Bulk-Import — mehrere Dokumente gleichzeitig (je Folge ein Dokument)
-- Eigene Tabellen (nicht import_jobs, das gehört zum 3-Tier-Konzept-Import).

CREATE TABLE IF NOT EXISTS import_batches (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produktion_id    TEXT REFERENCES produktionen(id) ON DELETE CASCADE,
  status           TEXT NOT NULL DEFAULT 'offen'
    CHECK (status IN ('offen','laeuft','fertig','teilweise_fehler','abgebrochen')),
  datei_anzahl     INT NOT NULL DEFAULT 0,
  fertig_anzahl    INT NOT NULL DEFAULT 0,
  fehler_anzahl    INT NOT NULL DEFAULT 0,
  optionen_json    JSONB,            -- gemeinsame Optionen (save_metadata, sichtbarkeit, …)
  erstellt_von     TEXT,
  erstellt_am      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  abgeschlossen_am TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS import_batch_jobs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id         UUID NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  sort_order       INT NOT NULL DEFAULT 0,
  dateiname        TEXT NOT NULL,
  datei_pfad       TEXT,             -- temporärer Pfad auf dem Server bis Verarbeitung
  datei_groesse    BIGINT,
  format           TEXT,             -- erkanntes Format (fountain/fdx/pdf/…)
  folge_nummer     INT,              -- aus Dateiname geraten, vom User korrigierbar
  stage_type       TEXT NOT NULL DEFAULT 'draft'
    CHECK (stage_type IN ('expose','treatment','draft','final')),
  import_label     TEXT,
  status           TEXT NOT NULL DEFAULT 'wartet'
    CHECK (status IN ('wartet','parst','fertig','fehler','uebersprungen')),
  fehler_text      TEXT,
  werkstufe_id     UUID,             -- gefüllt nach erfolgreichem Commit
  ergebnis_json    JSONB,            -- Zähler: scenes_imported, characters_created, …
  erstellt_am      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  abgeschlossen_am TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_import_batches_produktion ON import_batches(produktion_id);
CREATE INDEX IF NOT EXISTS idx_import_batch_jobs_batch   ON import_batch_jobs(batch_id);
CREATE INDEX IF NOT EXISTS idx_import_batch_jobs_status  ON import_batch_jobs(status);
