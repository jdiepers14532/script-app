-- v24: storyline als Rich-Text-Spalte (ProseMirror JSON)
-- Bestehender plain-text Inhalt wird als einfacher Paragraph-Node migriert
ALTER TABLE szenen ADD COLUMN IF NOT EXISTS storyline_json JSONB;

-- Migrate existing plain-text storyline → ProseMirror paragraph node
UPDATE szenen
SET storyline_json = jsonb_build_object(
  'type', 'doc',
  'content', jsonb_build_array(
    jsonb_build_object(
      'type', 'paragraph',
      'content', jsonb_build_array(
        jsonb_build_object('type', 'text', 'text', storyline)
      )
    )
  )
)
WHERE storyline IS NOT NULL
  AND storyline != ''
  AND storyline_json IS NULL;
