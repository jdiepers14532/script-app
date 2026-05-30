-- v140: Werkstufen-Snapshots (Dokument-Verlauf)
-- Dokument-Ebene: Snapshot aller Szenen einer Werkstufe zu einem Zeitpunkt
-- Typen: auto (bei Werkstufen-Wechsel + 30-min-Timer), manual (Nutzer), restore (automatisch vor Wiederherstellung)
-- Max 30 Einträge pro Werkstufe

CREATE TABLE werkstufen_snapshots (
  id          SERIAL PRIMARY KEY,
  werkstufe_id UUID NOT NULL REFERENCES werkstufen(id) ON DELETE CASCADE,
  created_by  TEXT,
  created_by_name TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  typ         TEXT NOT NULL DEFAULT 'auto' CHECK (typ IN ('auto', 'manual', 'restore')),
  szenen_count INT NOT NULL DEFAULT 0,
  text_preview TEXT,
  is_current  BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_werkstufen_snapshots_werk
  ON werkstufen_snapshots(werkstufe_id, created_at DESC);

CREATE TABLE werkstufen_snapshot_szenen (
  id          SERIAL PRIMARY KEY,
  snapshot_id INT NOT NULL REFERENCES werkstufen_snapshots(id) ON DELETE CASCADE,
  szene_id    UUID NOT NULL,
  scene_nummer TEXT,
  scene_info  TEXT,
  content     JSONB NOT NULL
);

CREATE INDEX idx_werkstufen_snapshot_szenen_snap
  ON werkstufen_snapshot_szenen(snapshot_id);
CREATE INDEX idx_werkstufen_snapshot_szenen_szene
  ON werkstufen_snapshot_szenen(szene_id);
