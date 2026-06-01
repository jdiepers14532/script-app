-- v167: Bible-Modus
-- charakter_beziehungen erweitern + bible_chronologie + bible_felder_config

ALTER TABLE charakter_beziehungen
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'aktiv'
      CHECK (status IN ('aktiv','beendet','historisch')),
  ADD COLUMN IF NOT EXISTS seit_block TEXT,
  ADD COLUMN IF NOT EXISTS bis_block  TEXT,
  ADD COLUMN IF NOT EXISTS notiz      TEXT;

-- Manuell gepflegte + aus Beats abgeleitete Chronologie-Einträge
CREATE TABLE IF NOT EXISTS bible_chronologie (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id  UUID REFERENCES characters(id)    ON DELETE CASCADE,
  produktion_id TEXT REFERENCES produktionen(id)  ON DELETE CASCADE,
  block_nummer  INT,
  beat_id       UUID REFERENCES strang_beats(id)  ON DELETE SET NULL,
  ereignis      TEXT NOT NULL,
  manuell       BOOLEAN DEFAULT FALSE,
  erstellt_am   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bible_chronologie_char ON bible_chronologie(character_id);
CREATE INDEX IF NOT EXISTS idx_bible_chronologie_prod ON bible_chronologie(produktion_id);

-- Konfigurierbare Zusatzfelder (staffelübergreifend — kein produktion_id)
CREATE TABLE IF NOT EXISTS bible_felder_config (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  typ        TEXT DEFAULT 'text',
  sort_order INT  DEFAULT 0
);
