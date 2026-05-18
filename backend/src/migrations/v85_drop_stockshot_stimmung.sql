-- v85: Remove stockshot_stimmung field (UI removed, field no longer needed)
ALTER TABLE dokument_szenen DROP COLUMN IF EXISTS stockshot_stimmung;
