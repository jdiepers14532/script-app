-- v33: Add rollenprofil standard fields to all existing staffeln
-- Uses ON CONFLICT DO NOTHING so existing fields are kept as-is

DO $$
DECLARE
  sid TEXT;
BEGIN
  FOR sid IN SELECT DISTINCT staffel_id FROM charakter_felder_config LOOP
    INSERT INTO charakter_felder_config (staffel_id, name, typ, optionen, sort_order, gilt_fuer)
    VALUES
      (sid, 'Alter',                           'text',     '[]', 10, 'rolle'),
      (sid, 'Geburtsort',                      'text',     '[]', 11, 'rolle'),
      (sid, 'Familienstand',                   'text',     '[]', 12, 'rolle'),
      (sid, 'Eltern',                          'text',     '[]', 13, 'rolle'),
      (sid, 'Kinder / Verwandte',              'text',     '[]', 14, 'rolle'),
      (sid, 'Beruf',                           'text',     '[]', 15, 'rolle'),
      (sid, 'Typ',                             'richtext', '[]', 16, 'rolle'),
      (sid, 'Charakter',                       'richtext', '[]', 17, 'rolle'),
      (sid, 'Aussehen/Stil',                   'richtext', '[]', 18, 'rolle'),
      (sid, 'Dramaturgische Funktion',         'richtext', '[]', 19, 'rolle'),
      (sid, 'Stärken',                         'richtext', '[]', 20, 'rolle'),
      (sid, 'Schwächen',                       'richtext', '[]', 21, 'rolle'),
      (sid, 'Verletzungen/Wunden',             'richtext', '[]', 22, 'rolle'),
      (sid, 'Ticks/Leidenschaften',            'richtext', '[]', 23, 'rolle'),
      (sid, 'Wünsche/Ziele',                   'richtext', '[]', 24, 'rolle'),
      (sid, 'Was braucht die Figur wirklich',  'richtext', '[]', 25, 'rolle'),
      (sid, 'Anbindung an den Cast',           'richtext', '[]', 26, 'rolle'),
      (sid, 'Wesen',                           'richtext', '[]', 27, 'rolle')
    ON CONFLICT (staffel_id, name) DO NOTHING;
  END LOOP;
END $$;
