ALTER TABLE dokument_szenen_snapshots
  ADD COLUMN is_current BOOLEAN NOT NULL DEFAULT FALSE;
