-- v171: Backfill node_id auf alle Top-Level-Blöcke in dokument_szenen.content
--
-- Jeder Block (direktes Kind des ProseMirror-Dokuments) bekommt eine stabile UUID,
-- sofern er noch keine hat. Idempotent: vorhandene node_ids werden nie überschrieben.
--
-- Intra-Szene-Eindeutigkeit: gen_random_uuid() garantiert pro Block eine frische UUID.
-- Cross-Werkstufen: Beim full-Copy wird content 1:1 übertragen → node_ids bleiben
-- erhalten (Invariante 1.3). Dieses Backfill läuft einmalig beim Server-Start.
--
-- Struktur: content = { "type": "doc", "content": [ <block>, <block>, ... ] }
-- Blocks: { "type": "...", "attrs": { ... }, "content": [...] }
-- Wenn attrs fehlt → wird als {} behandelt. node_id wird als STRING gespeichert
-- (UUID-Format), konsistent mit crypto.randomUUID() im Frontend.

DO $$
DECLARE
  r            RECORD;
  blocks       JSONB;
  block        JSONB;
  existing_id  TEXT;
  new_content  JSONB;
  i            INT;
  changed      BOOLEAN;
BEGIN
  FOR r IN
    SELECT id, content
    FROM dokument_szenen
    WHERE content IS NOT NULL
      AND content -> 'content' IS NOT NULL
  LOOP
    blocks := r.content -> 'content';
    IF jsonb_array_length(blocks) = 0 THEN
      CONTINUE;
    END IF;

    new_content := r.content;
    changed := FALSE;

    FOR i IN 0 .. jsonb_array_length(blocks) - 1 LOOP
      block := blocks -> i;

      -- Nur JSON-Objekte (echte Blöcke) verarbeiten; null/array überspringen
      IF jsonb_typeof(block) != 'object' THEN
        CONTINUE;
      END IF;

      -- node_id aus attrs lesen (attrs kann fehlen oder null sein)
      existing_id := (block -> 'attrs') ->> 'node_id';

      IF existing_id IS NULL OR existing_id = '' THEN
        -- Fehlende node_id: neue UUID erzeugen und in attrs einfügen/mergen
        new_content := jsonb_set(
          new_content,
          ARRAY['content', i::TEXT, 'attrs'],
          COALESCE(block -> 'attrs', '{}'::JSONB)
            || jsonb_build_object('node_id', gen_random_uuid()::TEXT),
          TRUE  -- create_missing: legt 'attrs' an falls nicht vorhanden
        );
        changed := TRUE;
      END IF;
      -- Vorhandene node_ids werden nie überschrieben (Idempotenz)
    END LOOP;

    IF changed THEN
      UPDATE dokument_szenen SET content = new_content WHERE id = r.id;
    END IF;
  END LOOP;
END;
$$;
