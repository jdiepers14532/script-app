-- Phase 5: Add yjs_state column to dokument_szenen for per-scene collaboration
ALTER TABLE dokument_szenen ADD COLUMN IF NOT EXISTS yjs_state BYTEA;
