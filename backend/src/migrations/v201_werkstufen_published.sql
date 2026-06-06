-- v201_werkstufen_published.sql
-- Verteiler-System Schritt 2: published-Flag auf werkstufen.
-- "Veröffentlichen" (SPEC §4) setzt dieses Flag manuell im Editor und löst den
-- Versand an die passenden Verteiler aus. "Neueste vorhandene" vs. "neueste
-- freigegebene" Fassung bleibt darüber unterscheidbar.
-- Rein additiv (ADD COLUMN IF NOT EXISTS), keine Änderung an Bestandsdaten.

BEGIN;

ALTER TABLE werkstufen ADD COLUMN IF NOT EXISTS published      BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE werkstufen ADD COLUMN IF NOT EXISTS published_am   TIMESTAMPTZ;
ALTER TABLE werkstufen ADD COLUMN IF NOT EXISTS published_von  UUID;

COMMIT;
