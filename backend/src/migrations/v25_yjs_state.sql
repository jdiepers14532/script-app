-- v25: Add Yjs binary state column for real-time collaboration
ALTER TABLE folgen_dokument_fassungen
  ADD COLUMN IF NOT EXISTS yjs_state BYTEA;
