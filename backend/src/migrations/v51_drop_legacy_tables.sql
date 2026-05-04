-- v51: Drop all legacy tables and FK columns
-- All legacy tables are empty (v47 TRUNCATE CASCADE).
-- The new model (produktionen → folgen → werkstufen → dokument_szenen) is fully operational.

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. Drop legacy FK columns from ACTIVE tables
-- ══════════════════════════════════════════════════════════════════════════════

-- dokument_szenen: fassung_id (replaced by werkstufe_id)
ALTER TABLE dokument_szenen DROP COLUMN IF EXISTS fassung_id;

-- scene_characters: szene_id (replaced by scene_identity_id)
ALTER TABLE scene_characters DROP COLUMN IF EXISTS szene_id;

-- szenen_vorstopp: szene_id (replaced by scene_identity_id)
ALTER TABLE szenen_vorstopp DROP COLUMN IF EXISTS szene_id;

-- szenen_revisionen: szene_id, stage_id, fassung_id (replaced by dokument_szene_id)
ALTER TABLE szenen_revisionen DROP CONSTRAINT IF EXISTS chk_rev_has_ref;
ALTER TABLE szenen_revisionen DROP COLUMN IF EXISTS szene_id;
ALTER TABLE szenen_revisionen DROP COLUMN IF EXISTS stage_id;
ALTER TABLE szenen_revisionen DROP COLUMN IF EXISTS fassung_id;
-- New constraint: dokument_szene_id is now required
ALTER TABLE szenen_revisionen ALTER COLUMN dokument_szene_id SET NOT NULL;

-- export_logs: stage_id (exports now use werkstufe_id)
ALTER TABLE export_logs DROP COLUMN IF EXISTS stage_id;
ALTER TABLE export_logs ADD COLUMN IF NOT EXISTS werkstufe_id UUID REFERENCES werkstufen(id) ON DELETE SET NULL;

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. Drop legacy tables (CASCADE handles remaining FKs)
-- ══════════════════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS szenen_versionen CASCADE;
DROP TABLE IF EXISTS kommentare CASCADE;
DROP TABLE IF EXISTS folgen_dokument_annotationen CASCADE;
DROP TABLE IF EXISTS folgen_dokument_autoren CASCADE;
DROP TABLE IF EXISTS folgen_dokument_audit CASCADE;
DROP TABLE IF EXISTS szenen CASCADE;
DROP TABLE IF EXISTS stages CASCADE;
DROP TABLE IF EXISTS folgen_dokument_fassungen CASCADE;
DROP TABLE IF EXISTS folgen_dokumente CASCADE;

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. Drop legacy view (if still exists)
-- ══════════════════════════════════════════════════════════════════════════════
DROP VIEW IF EXISTS v_legacy_data_status;
