-- v57: page_length (Seitenachtel) auf dokument_szenen
-- Wert = Anzahl Achtel einer Seite (1 Seite = 56 Zeilen = 8/8)
ALTER TABLE dokument_szenen ADD COLUMN IF NOT EXISTS page_length INT;
