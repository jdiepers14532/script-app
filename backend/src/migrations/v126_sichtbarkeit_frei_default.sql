-- v122: sichtbarkeit_frei Default von 'team' auf 'produktion' korrigieren
-- Reguläre Folgen haben 'folge_sendung' als dokument_label, 'team' als alten Default → 'produktion'
ALTER TABLE folgen ALTER COLUMN sichtbarkeit_frei SET DEFAULT 'produktion';
UPDATE folgen SET sichtbarkeit_frei = 'produktion' WHERE sichtbarkeit_frei = 'team' AND ist_frei = false;
