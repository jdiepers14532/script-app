-- v204: Auto-Vergabe der Rollen-/Komparsennummer pro Produktion
--
-- Beim Anlegen einer character_productions-Zeile wird automatisch die nächste
-- freie Nummer (MAX+1) pro Produktion vergeben — getrennte Zähler für Rollen
-- (rollen_nummer) und Komparsen (komparsen_nummer). Der Typ wird aus der
-- verknüpften Kategorie abgeleitet; ohne Kategorie gilt 'rolle'.
--
-- Greift NUR wenn die jeweilige Nummer NULL ist — manuell gesetzte Nummern
-- bleiben unangetastet. Eindeutigkeit pro Produktion ist zusätzlich über die
-- bestehenden UNIQUE-Indizes (staffel_id/produktion_id, *_nummer) abgesichert.
--
-- Deckt alle Insert-Pfade ab (Drehbuch-Import-Bulk, NT-Einträge,
-- Rollenprofil-Import, manuelles Anlegen) — kein Pfad kann es vergessen.

CREATE OR REPLACE FUNCTION assign_character_nummer()
RETURNS TRIGGER AS $$
DECLARE
  kat_typ TEXT;
BEGIN
  IF NEW.kategorie_id IS NOT NULL THEN
    SELECT typ INTO kat_typ FROM character_kategorien WHERE id = NEW.kategorie_id;
  END IF;

  IF kat_typ = 'komparse' THEN
    IF NEW.komparsen_nummer IS NULL THEN
      SELECT COALESCE(MAX(komparsen_nummer), 0) + 1 INTO NEW.komparsen_nummer
      FROM character_productions WHERE produktion_id = NEW.produktion_id;
    END IF;
  ELSE
    -- 'rolle' oder fehlende/unbekannte Kategorie → Rollennummer
    IF NEW.rollen_nummer IS NULL THEN
      SELECT COALESCE(MAX(rollen_nummer), 0) + 1 INTO NEW.rollen_nummer
      FROM character_productions WHERE produktion_id = NEW.produktion_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assign_character_nummer ON character_productions;
CREATE TRIGGER trg_assign_character_nummer
  BEFORE INSERT ON character_productions
  FOR EACH ROW
  EXECUTE FUNCTION assign_character_nummer();
