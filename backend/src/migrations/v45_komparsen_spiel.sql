-- v45: Komparsen spiel_typ, repliken_anzahl, header_o_t
-- Drei Stufen: o.t. (Hintergrund), spiel (Regieanweisung), text (Dialog)
-- header_o_t = was der Szenenkopf sagt (kann von Content-Analyse abweichen)

ALTER TABLE scene_characters
  ADD COLUMN IF NOT EXISTS spiel_typ TEXT NOT NULL DEFAULT 'o.t.'
    CHECK (spiel_typ IN ('o.t.', 'spiel', 'text'));

ALTER TABLE scene_characters
  ADD COLUMN IF NOT EXISTS repliken_anzahl INT NOT NULL DEFAULT 0;

ALTER TABLE scene_characters
  ADD COLUMN IF NOT EXISTS header_o_t BOOLEAN NOT NULL DEFAULT false;
