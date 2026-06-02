-- v168: Future-Versionen, Konzept-Versionen, Versions-Änderungslog

CREATE TABLE IF NOT EXISTS future_versionen (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produktion_id   TEXT REFERENCES produktionen(id) ON DELETE CASCADE,
  zeitraum        TEXT,
  label           TEXT,
  notiz           TEXT,
  snapshot_json   JSONB,
  freigabe_status TEXT DEFAULT 'entwurf'
      CHECK (freigabe_status IN ('entwurf','freigegeben')),
  freigegeben_von TEXT,
  freigegeben_am  TIMESTAMPTZ,
  erstellt_von    TEXT,
  erstellt_am     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS konzept_versionen (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produktion_id   TEXT REFERENCES produktionen(id) ON DELETE CASCADE,
  staffel         TEXT,
  label           TEXT,
  notiz           TEXT,
  snapshot_json   JSONB,
  freigabe_status TEXT DEFAULT 'entwurf'
      CHECK (freigabe_status IN ('entwurf','freigegeben')),
  freigegeben_von TEXT,
  freigegeben_am  TIMESTAMPTZ,
  erstellt_von    TEXT,
  erstellt_am     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS versions_aenderungen (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id   UUID NOT NULL,
  version_typ  TEXT NOT NULL CHECK (version_typ IN ('konzept','future')),
  art          TEXT CHECK (art IN ('inhaltlich','produktionell')),
  beschreibung TEXT,
  referenz     TEXT,
  erstellt_von TEXT,
  erstellt_am  TIMESTAMPTZ DEFAULT NOW()
);
