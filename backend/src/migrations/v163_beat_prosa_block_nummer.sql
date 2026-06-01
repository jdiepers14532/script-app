-- v163_beat_prosa_block_nummer.sql
-- strang_beats: prosa_text + block_nummer ergänzen, beat_text nullable
-- Neue Tabelle beat_charaktere für Figuren-Tagging pro Beat

ALTER TABLE strang_beats ADD COLUMN IF NOT EXISTS prosa_text TEXT;
ALTER TABLE strang_beats ADD COLUMN IF NOT EXISTS block_nummer INT;
ALTER TABLE strang_beats ALTER COLUMN beat_text DROP NOT NULL;

CREATE TABLE IF NOT EXISTS beat_charaktere (
  beat_id      UUID NOT NULL REFERENCES strang_beats(id) ON DELETE CASCADE,
  character_id UUID NOT NULL REFERENCES characters(id)   ON DELETE CASCADE,
  rolle        TEXT NOT NULL DEFAULT 'haupt'
               CHECK (rolle IN ('haupt', 'neben', 'erwaehnt')),
  PRIMARY KEY (beat_id, character_id)
);

CREATE INDEX IF NOT EXISTS idx_beat_charaktere_beat ON beat_charaktere(beat_id);
CREATE INDEX IF NOT EXISTS idx_beat_charaktere_char ON beat_charaktere(character_id);
