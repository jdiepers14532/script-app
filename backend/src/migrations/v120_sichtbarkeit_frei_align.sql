-- v119: sichtbarkeit_frei auf kanonische Werte (privat/colab/produktion/alle) migrieren
-- Alte Werte: dauerhaft_privat → privat, team → produktion, alle → alle (unverändert)

-- Colab-Gruppe für freie Dokumente
ALTER TABLE folgen
  ADD COLUMN IF NOT EXISTS sichtbarkeit_frei_colab_gruppe_id UUID
    REFERENCES colab_gruppen(id) ON DELETE SET NULL;

-- Werte migrieren
UPDATE folgen SET sichtbarkeit_frei = 'privat'     WHERE sichtbarkeit_frei = 'dauerhaft_privat';
UPDATE folgen SET sichtbarkeit_frei = 'produktion' WHERE sichtbarkeit_frei = 'team';
-- 'alle' bleibt unverändert
