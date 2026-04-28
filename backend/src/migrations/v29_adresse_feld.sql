-- v29: Adresse-Feld für Motive umbenennen und vor Beschreibung sortieren
UPDATE charakter_felder_config
  SET name = 'fiktionale Adresse in der Geschichte', sort_order = 0
  WHERE name = 'Adresse' AND gilt_fuer = 'motiv';
