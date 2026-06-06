-- v199_anker_scene_primary.sql
-- Weg B: Content-Anker auf scene_identity_id (Pflicht-Scope) + selektor.block_index (Hinweis)
-- + Quote (Wahrheit) umbasieren. node_id wird optionaler Fast-Path (kein CHECK mehr).
-- Grund: node_id ist in dokument_szenen.content nicht persistent haltbar (yjs_state tabellenweit 0,
-- content autoritativ über rohen Solo-PUT, 0% non-null, v171–v173 dreimal erodiert).
-- Tabelle anker ist leer (0 Zeilen) → Constraint-Wechsel risikofrei, kein Backfill.
-- block_index lebt im selektor-JSONB (additiv) → kein Spalten-DDL.
-- KEIN explizites BEGIN/COMMIT: der Migrations-Runner wrappt jede Migration in eine Transaktion.

ALTER TABLE anker DROP CONSTRAINT IF EXISTS anker_content_braucht_node;

ALTER TABLE anker
  ADD CONSTRAINT anker_content_braucht_szene
  CHECK (store <> 'content' OR scene_identity_id IS NOT NULL);
