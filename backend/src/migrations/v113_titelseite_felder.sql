-- v113: Titelseite-Felder für Notiz-Vorlagen und Werkstufen
-- Ermöglicht eine Vorlage als "Titelseite" zu markieren;
-- beim Erstellen einer Notiz-Werkstufe aus dieser Vorlage wird das Flag propagiert.

ALTER TABLE dokument_vorlagen ADD COLUMN IF NOT EXISTS ist_titelseite BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE werkstufen        ADD COLUMN IF NOT EXISTS ist_titelseite BOOLEAN NOT NULL DEFAULT FALSE;
