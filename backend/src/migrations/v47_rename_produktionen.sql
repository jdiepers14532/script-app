-- v47: Clean-Start + Rename staffeln → produktionen
-- Alle Daten loeschen, Tabelle umbenennen, Spalten bereinigen

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. Alle Daten loeschen (CASCADE loescht abhaengige Tabellen mit)
-- ══════════════════════════════════════════════════════════════════════════════
TRUNCATE TABLE staffeln CASCADE;
TRUNCATE TABLE characters CASCADE;
TRUNCATE TABLE ki_settings CASCADE;
TRUNCATE TABLE ki_providers CASCADE;
TRUNCATE TABLE user_settings CASCADE;
TRUNCATE TABLE export_logs CASCADE;
TRUNCATE TABLE kommentare CASCADE;
TRUNCATE TABLE scene_comment_events CASCADE;
TRUNCATE TABLE scene_comment_read_state CASCADE;
TRUNCATE TABLE production_app_settings CASCADE;
TRUNCATE TABLE editor_format_templates CASCADE;

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. Tabelle umbenennen: staffeln → produktionen
-- ══════════════════════════════════════════════════════════════════════════════
ALTER TABLE staffeln RENAME TO produktionen;

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. Spalten bereinigen auf produktionen
-- ══════════════════════════════════════════════════════════════════════════════
ALTER TABLE produktionen DROP COLUMN IF EXISTS show_type;
ALTER TABLE produktionen ADD COLUMN IF NOT EXISTS seitenformat TEXT DEFAULT 'a4';

-- ══════════════════════════════════════════════════════════════════════════════
-- 4. Spalte entfernen: folgen.meta_json (immer leer)
-- ══════════════════════════════════════════════════════════════════════════════
ALTER TABLE folgen DROP COLUMN IF EXISTS meta_json;

-- ══════════════════════════════════════════════════════════════════════════════
-- 5. Spalte entfernen: scene_identities.staffel_id (redundant via folge_id)
-- ══════════════════════════════════════════════════════════════════════════════
DROP INDEX IF EXISTS idx_scene_identity_staffel;
ALTER TABLE scene_identities DROP COLUMN IF EXISTS staffel_id;

-- ══════════════════════════════════════════════════════════════════════════════
-- 6. FK-Spalten umbenennen: staffel_id → produktion_id in allen Tabellen
-- ══════════════════════════════════════════════════════════════════════════════
ALTER TABLE character_kategorien RENAME COLUMN staffel_id TO produktion_id;
ALTER TABLE character_productions RENAME COLUMN staffel_id TO produktion_id;
ALTER TABLE charakter_felder_config RENAME COLUMN staffel_id TO produktion_id;
ALTER TABLE dokument_benachrichtigungen RENAME COLUMN staffel_id TO produktion_id;
ALTER TABLE dokument_colab_gruppen RENAME COLUMN staffel_id TO produktion_id;
ALTER TABLE dokument_typ_definitionen RENAME COLUMN staffel_id TO produktion_id;
ALTER TABLE entities RENAME COLUMN staffel_id TO produktion_id;
ALTER TABLE episode_locks RENAME COLUMN staffel_id TO produktion_id;
ALTER TABLE folgen RENAME COLUMN staffel_id TO produktion_id;
ALTER TABLE motive RENAME COLUMN staffel_id TO produktion_id;
ALTER TABLE revision_colors RENAME COLUMN staffel_id TO produktion_id;
ALTER TABLE revision_export_einstellungen RENAME COLUMN staffel_id TO produktion_id;
ALTER TABLE stage_labels RENAME COLUMN staffel_id TO produktion_id;
ALTER TABLE stages RENAME COLUMN staffel_id TO produktion_id;
ALTER TABLE statistik_vorlagen RENAME COLUMN staffel_id TO produktion_id;
ALTER TABLE vorstopp_einstellungen RENAME COLUMN staffel_id TO produktion_id;

-- ══════════════════════════════════════════════════════════════════════════════
-- 7. Legacy-Tabellen leeren (Tabellen bleiben, damit legacy-Routes nicht crashen)
-- ══════════════════════════════════════════════════════════════════════════════
TRUNCATE TABLE folgen_dokument_annotationen CASCADE;
TRUNCATE TABLE folgen_dokument_audit CASCADE;
TRUNCATE TABLE folgen_dokument_autoren CASCADE;
TRUNCATE TABLE szenen_versionen CASCADE;

-- Legacy-Tabellen: FK-Spalten umbenennen (staffel_id → produktion_id)
ALTER TABLE folgen_dokumente RENAME COLUMN staffel_id TO produktion_id;
-- folgen_dokument_fassungen hat kein staffel_id, skip
