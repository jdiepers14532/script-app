CREATE TABLE IF NOT EXISTS entities (
  id SERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('charakter','prop','location','kostuem','fahrzeug')),
  external_id TEXT,
  external_app TEXT,
  name TEXT NOT NULL,
  meta_json JSONB DEFAULT '{}',
  staffel_id TEXT REFERENCES staffeln(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_entities_staffel_type ON entities(staffel_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name);
