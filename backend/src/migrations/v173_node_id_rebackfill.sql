-- v173: node_id Rückfüllung — dritte Runde nach Hocuspocus-Überschreibung
--
-- Nach Server-Neustart (pm2 restart) hat der Hocuspocus Store-Callback alten
-- Yjs-State (ohne node_id-Attribute) als DB-Content geschrieben und dabei das
-- v172-Backfill für 217 Blöcke überschrieben. Diese Migration setzt die
-- Rückfüllungen erneut. Hocuspocus schreibt ab diesem Deploy nicht mehr ohne
-- node_ids (preserveOrInjectNodeIds in hocuspocus.ts).
--
-- Identisch zu v172 — idempotent: vorhandene node_ids werden nie überschrieben.
-- Unterstützte Formate: array [...] und object {type:'doc', content:[...]}

DO $$
DECLARE
  r           RECORD;
  blocks      JSONB;
  block       JSONB;
  new_data    JSONB;
  existing_id TEXT;
  i           INT;
  changed     BOOLEAN;
BEGIN
  FOR r IN
    SELECT id, content
    FROM dokument_szenen
    WHERE content IS NOT NULL
      AND jsonb_typeof(content) IN ('array', 'object')
  LOOP
    IF jsonb_typeof(r.content) = 'array' THEN
      blocks   := r.content;
      new_data := r.content;
    ELSIF r.content ? 'content' AND jsonb_typeof(r.content -> 'content') = 'array' THEN
      blocks   := r.content -> 'content';
      new_data := r.content;
    ELSE
      CONTINUE;
    END IF;

    IF jsonb_array_length(blocks) = 0 THEN CONTINUE; END IF;

    changed := FALSE;

    FOR i IN 0 .. jsonb_array_length(blocks) - 1 LOOP
      block := blocks -> i;
      IF jsonb_typeof(block) != 'object' THEN CONTINUE; END IF;

      existing_id := (block -> 'attrs') ->> 'node_id';

      IF existing_id IS NULL OR existing_id = '' THEN
        IF jsonb_typeof(r.content) = 'array' THEN
          new_data := jsonb_set(
            new_data,
            ARRAY[i::TEXT, 'attrs'],
            COALESCE(block -> 'attrs', '{}'::JSONB)
              || jsonb_build_object('node_id', gen_random_uuid()::TEXT),
            TRUE
          );
        ELSE
          new_data := jsonb_set(
            new_data,
            ARRAY['content', i::TEXT, 'attrs'],
            COALESCE(block -> 'attrs', '{}'::JSONB)
              || jsonb_build_object('node_id', gen_random_uuid()::TEXT),
            TRUE
          );
        END IF;
        changed := TRUE;
      END IF;
    END LOOP;

    IF changed THEN
      UPDATE dokument_szenen SET content = new_data WHERE id = r.id;
    END IF;
  END LOOP;
END;
$$;
