-- Phase 7: Cleanup — remove deprecated intermediate tables/views
-- stages + szenen tables are kept as read-only archive (still referenced by characters, entities, ki, etc.)
-- folgen_meta is dropped (fully merged into folgen table)

DROP VIEW IF EXISTS v_legacy_data_status;
DROP TABLE IF EXISTS folgen_meta CASCADE;
