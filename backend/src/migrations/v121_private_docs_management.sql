-- v121: Private-Dokumente-Verwaltung
-- Tracking wann sichtbarkeit_frei geändert wurde, Verknüpfung mit Folge, Audit-Log

ALTER TABLE folgen
  ADD COLUMN IF NOT EXISTS sichtbarkeit_frei_geaendert_am TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verknuepft_mit_folge_id INTEGER REFERENCES folgen(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verknuepft_am TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS freie_dok_sichtbarkeit_log (
  id               SERIAL PRIMARY KEY,
  folge_id         INTEGER NOT NULL REFERENCES folgen(id) ON DELETE CASCADE,
  geaendert_von_user_id TEXT NOT NULL,
  autor_user_id    TEXT,
  alte_sichtbarkeit TEXT,
  neue_sichtbarkeit TEXT NOT NULL,
  per_email_informiert     BOOLEAN NOT NULL DEFAULT false,
  anderweitig_bestaetigt   BOOLEAN NOT NULL DEFAULT false,
  geaendert_am     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fdsl_folge ON freie_dok_sichtbarkeit_log(folge_id);
CREATE INDEX IF NOT EXISTS idx_fdsl_changed ON freie_dok_sichtbarkeit_log(geaendert_am DESC);

-- App-Settings für Private-Dokumente-Verwaltung
INSERT INTO app_settings (key, value) VALUES
  ('private_docs_filter_2_enabled', 'false'),
  ('private_docs_filter_3_enabled', 'false'),
  ('private_docs_viewer_roles',     '[]')
ON CONFLICT (key) DO NOTHING;
