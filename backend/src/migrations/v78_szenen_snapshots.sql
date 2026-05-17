-- v78: Szenen-Snapshots (Auto-Verlauf)
-- Speichert automatische Inhaltssicherungen pro Szene
-- Trigger: 5 Min. Idle nach Änderung + Szenenwechsel
-- Max 50 Einträge pro Szene (älteste werden beim INSERT geprüft)

CREATE TABLE dokument_szenen_snapshots (
  id          SERIAL PRIMARY KEY,
  szene_id    UUID NOT NULL REFERENCES dokument_szenen(id) ON DELETE CASCADE,
  content     JSONB NOT NULL,
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX dokument_szenen_snapshots_szene_idx
  ON dokument_szenen_snapshots(szene_id, created_at DESC);
