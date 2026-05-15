-- v72: Drop legacy tables and fields
-- Tables replaced by newer systems:
--   entities           → characters/motive/drehorte
--   dokument_typ_definitionen  → werkstufen.typ (freies Enum)
--   dokument_colab_gruppen/mitglieder → colab_gruppen/colab_gruppen_mitglieder (v68)
--   dokument_benachrichtigungen → nie in Betrieb gegangen
--   scene_comment_events/read_state → ref. alte szenen-Tabelle (nicht mehr existent)
--   szenen_revisionen  → nie produktiv genutzt
-- Fields replaced by newer systems:
--   dokument_szenen.dauer_min / dauer_sek → stoppzeit_sek (berechnet)
--   dokument_szenen.is_wechselschnitt     → sondertyp = 'wechselschnitt'
--   scene_identities.is_non_scene / non_scene_type → dokument_szenen.element_type
--   produktionen.meta_json                → production_app_settings (key/value)

-- Drop legacy tables
DROP TABLE IF EXISTS entities CASCADE;
DROP TABLE IF EXISTS dokument_typ_definitionen CASCADE;
DROP TABLE IF EXISTS dokument_colab_gruppe_mitglieder CASCADE;
DROP TABLE IF EXISTS dokument_colab_gruppen CASCADE;
DROP TABLE IF EXISTS dokument_benachrichtigungen CASCADE;
DROP TABLE IF EXISTS scene_comment_read_state CASCADE;
DROP TABLE IF EXISTS scene_comment_events CASCADE;
DROP TABLE IF EXISTS szenen_revisionen CASCADE;

-- Drop legacy fields on dokument_szenen
ALTER TABLE dokument_szenen
  DROP COLUMN IF EXISTS dauer_min,
  DROP COLUMN IF EXISTS dauer_sek,
  DROP COLUMN IF EXISTS is_wechselschnitt;

-- Drop legacy fields on scene_identities
ALTER TABLE scene_identities
  DROP COLUMN IF EXISTS is_non_scene,
  DROP COLUMN IF EXISTS non_scene_type;

-- Drop meta_json on produktionen
ALTER TABLE produktionen
  DROP COLUMN IF EXISTS meta_json;
