-- v43.1: fassung_id nullable machen
-- Neue Werkstufen (via v2 API) haben keinen Eintrag in folgen_dokument_fassungen
ALTER TABLE dokument_szenen ALTER COLUMN fassung_id DROP NOT NULL;
