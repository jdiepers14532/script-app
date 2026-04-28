-- v32: Notizen-Feld auf richtext umstellen
UPDATE charakter_felder_config SET typ = 'richtext' WHERE name = 'Notizen' AND gilt_fuer = 'alle';
