-- v166: Rollen-Einsatzplanung (Gantt) + Befund-Register
-- rollen_einsatz: in welchen Blöcken wird eine Rolle geschrieben (Absichtsebene)
-- befunde: Inkonsistenz-Register (cast_luecke, cast_ueberschuss, etc.)

CREATE TABLE IF NOT EXISTS rollen_einsatz (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produktion_id TEXT REFERENCES produktionen(id) ON DELETE CASCADE,
  character_id  UUID REFERENCES characters(id)   ON DELETE CASCADE,
  block_von     INT  NOT NULL,
  block_bis     INT  NOT NULL,
  status        TEXT DEFAULT 'geplant' CHECK (status IN ('geplant','fix')),
  notiz         TEXT,
  erstellt_am   TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT rollen_einsatz_range_check CHECK (block_bis >= block_von)
);

CREATE INDEX IF NOT EXISTS idx_rollen_einsatz_produktion ON rollen_einsatz(produktion_id);
CREATE INDEX IF NOT EXISTS idx_rollen_einsatz_character  ON rollen_einsatz(character_id);

CREATE TABLE IF NOT EXISTS befunde (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produktion_id   TEXT REFERENCES produktionen(id) ON DELETE CASCADE,
  typ             TEXT NOT NULL,
  -- stabiler Schlüssel: typ·character_id·block_nummer
  identitaet      TEXT NOT NULL,
  rolle_id        UUID REFERENCES characters(id) ON DELETE SET NULL,
  block_nummer    INT,
  beschreibung    TEXT,
  status          TEXT DEFAULT 'offen' CHECK (status IN ('offen','erledigt','auto_geloest')),
  erledigt_von    TEXT,
  erledigt_am     TIMESTAMPTZ,
  geloest_vermerk TEXT,
  erstellt_am     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (produktion_id, identitaet)
);

CREATE INDEX IF NOT EXISTS idx_befunde_produktion ON befunde(produktion_id, status);
