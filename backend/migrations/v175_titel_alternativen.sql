-- v175: Titel-Alternativen für Folgen (KI-generierte Vorschläge persistent speichern)
ALTER TABLE folgen ADD COLUMN IF NOT EXISTS folgen_titel_alternativen TEXT;
