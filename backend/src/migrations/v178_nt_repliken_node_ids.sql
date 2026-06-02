-- Phase 4: NT-Einträge revisionssicher machen
-- repliken_node_ids: node_ids der CHARACTER-Blöcke (UUID-basiert, revisionssicher)
-- konsistenz_status: Abgleich gegen eingefrorene Referenz-Fassung

ALTER TABLE nt_eintraege
  ADD COLUMN IF NOT EXISTS repliken_node_ids  TEXT[],
  ADD COLUMN IF NOT EXISTS konsistenz_status  VARCHAR(20) NOT NULL DEFAULT 'ok';

-- GIN-Index für schnelle node_id-Suche (z.B. "welcher NT-Eintrag hat node_id X?")
CREATE INDEX IF NOT EXISTS idx_nt_eintraege_node_ids
  ON nt_eintraege USING gin (repliken_node_ids)
  WHERE repliken_node_ids IS NOT NULL;
