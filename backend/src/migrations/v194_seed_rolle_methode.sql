-- v194: beziehung_seed_kandidaten — rolle + methode
-- rolle:   Rollenbezeichnung aus dem Bullet-Item (z.B. "Onkel", "Ex-Freund")
--          → wird beim Promoten als charakter_beziehungen.label übernommen
-- methode: Herkunft des Kandidaten (regel_parser | fliesstext | llm)

ALTER TABLE beziehung_seed_kandidaten
  ADD COLUMN IF NOT EXISTS rolle    TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS methode  TEXT NOT NULL DEFAULT 'regel_parser';

ALTER TABLE beziehung_seed_kandidaten
  DROP CONSTRAINT IF EXISTS beziehung_seed_kandidaten_methode_check;
ALTER TABLE beziehung_seed_kandidaten
  ADD CONSTRAINT beziehung_seed_kandidaten_methode_check
    CHECK (methode IN ('regel_parser', 'fliesstext', 'llm'));
