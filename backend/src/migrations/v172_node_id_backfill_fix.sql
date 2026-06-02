-- v172: Backfill node_id — korrigierte Version
--
-- v171 war fehlerhaft: WHERE content->'content' IS NOT NULL trifft nie zu,
-- weil dokument_szenen.content DIREKT das Blocks-Array speichert
-- (EditorPanel sendet editorContent.content = blocks[], nicht das doc-Objekt).
-- v171 lief erfolgreich als No-Op durch. Diese Migration korrigiert das.
--
-- Unterstützte Formate:
--   array:  content = [{type:…, attrs:{…}}, …]           ← alle aktuellen Zeilen
--   object: content = {type:'doc', content:[…]}           ← theoretisch (clear_content-Pfad)
--
-- Idempotent: vorhandene node_ids werden nie überschrieben.
-- Intra-Szene-Eindeutigkeit: gen_random_uuid() pro Block, kein Duplikat möglich.

DO $$
DECLARE
  r           RECORD;
  blocks      JSONB;
  block       JSONB;
  new_data    JSONB;   -- je nach Format: neues Array oder neues doc-Objekt
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
    -- Format erkennen
    IF jsonb_typeof(r.content) = 'array' THEN
      blocks   := r.content;
      new_data := r.content;
    ELSIF r.content ? 'content' AND jsonb_typeof(r.content -> 'content') = 'array' THEN
      blocks   := r.content -> 'content';
      new_data := r.content;
    ELSE
      CONTINUE;  -- Unbekanntes Format überspringen
    END IF;

    IF jsonb_array_length(blocks) = 0 THEN CONTINUE; END IF;

    changed := FALSE;

    FOR i IN 0 .. jsonb_array_length(blocks) - 1 LOOP
      block := blocks -> i;

      IF jsonb_typeof(block) != 'object' THEN CONTINUE; END IF;

      existing_id := (block -> 'attrs') ->> 'node_id';

      IF existing_id IS NULL OR existing_id = '' THEN
        IF jsonb_typeof(r.content) = 'array' THEN
          -- Direkt im Array: Pfad = [i, 'attrs']
          new_data := jsonb_set(
            new_data,
            ARRAY[i::TEXT, 'attrs'],
            COALESCE(block -> 'attrs', '{}'::JSONB)
              || jsonb_build_object('node_id', gen_random_uuid()::TEXT),
            TRUE
          );
        ELSE
          -- Im doc-Objekt: Pfad = ['content', i, 'attrs']
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
      -- Vorhandene node_ids: unverändert lassen (Idempotenz)
    END LOOP;

    IF changed THEN
      UPDATE dokument_szenen SET content = new_data WHERE id = r.id;
    END IF;
  END LOOP;
END;
$$;
