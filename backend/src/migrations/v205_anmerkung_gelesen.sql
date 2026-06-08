-- v205_anmerkung_gelesen.sql
-- Per-User-Lesestatus für Anmerkungen (aktive, freiwillige "Gelesen"-Markierung — kein Tracking).
-- "gelesen" ist KEIN globaler Auflösungs-Status (offen/uebernommen/abgelehnt bleiben), sondern
-- pro Person: rot/grau in der Szenenliste hängt am eigenen Lesestatus.
-- (v197–v204 waren belegt → naechste freie Nummer ist v205.)

CREATE TABLE IF NOT EXISTS anmerkung_gelesen (
  anmerkung_id UUID NOT NULL REFERENCES anmerkung(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL,
  gelesen_am   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (anmerkung_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_anmerkung_gelesen_user ON anmerkung_gelesen (user_id);
