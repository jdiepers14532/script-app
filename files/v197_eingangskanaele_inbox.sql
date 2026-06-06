-- v197_eingangskanaele_inbox.sql
-- Eingangskanäle (Transkriptions-Entwürfe) + Minimal-Inbox fürs Tagging.
-- PFLICHT: in der migrationFiles-Liste in backend/src/index.ts eintragen.
-- Setzt v196_anker_anmerkungen.sql voraus.

CREATE TABLE IF NOT EXISTS anmerkung_entwurf (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quelle_session      TEXT,                 -- Transkriptions-/Sitzungs-Referenz
  vorschlag_quelle    TEXT,
  vorschlag_kategorie TEXT,
  body                JSONB NOT NULL,
  -- Anker-Vermutung (unverbindlich, bis menschlich übernommen):
  werkstufe_id        UUID REFERENCES werkstufen(id)       ON DELETE CASCADE,
  scene_identity_id   UUID REFERENCES scene_identities(id) ON DELETE CASCADE,
  store               TEXT CHECK (store IN ('content','kopffeld')),
  node_id             TEXT,
  feldname            TEXT,
  selektor            JSONB,
  konfidenz           REAL,
  status              TEXT NOT NULL DEFAULT 'offen'
                        CHECK (status IN ('offen','uebernommen','verworfen')),
  erstellt_am         TIMESTAMPTZ NOT NULL DEFAULT now(),
  gesichtet_von       TEXT,
  gesichtet_am        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_entwurf_folge ON anmerkung_entwurf (werkstufe_id, status);

CREATE TABLE IF NOT EXISTS benachrichtigung (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT NOT NULL,             -- Empfänger (auth user_id, TEXT app-weit)
  typ           TEXT NOT NULL,             -- 'anmerkung.getaggt' | ...
  anmerkung_id  UUID REFERENCES anmerkung(id) ON DELETE CASCADE,
  von_user_id   TEXT,
  deeplink      TEXT NOT NULL,
  gelesen       BOOLEAN NOT NULL DEFAULT false,
  erstellt_am   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_benachr_user ON benachrichtigung (user_id, gelesen);
