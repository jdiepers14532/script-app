-- v35: Add meta_json column to stages for import metadata
ALTER TABLE stages ADD COLUMN IF NOT EXISTS meta_json JSONB DEFAULT '{}';
