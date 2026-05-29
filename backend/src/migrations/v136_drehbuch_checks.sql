-- Migration v136: Drehbuch-Checks System
CREATE TABLE IF NOT EXISTS szenen_check_ergebnisse (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dokument_szene_id UUID REFERENCES dokument_szenen(id) ON DELETE CASCADE,
  werkstufe_id   UUID,
  check_typ      TEXT NOT NULL,
  schwere        TEXT NOT NULL DEFAULT 'hinweis',
  meldung        TEXT NOT NULL,
  behoben        BOOLEAN DEFAULT FALSE,
  erstellt_am    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sce_szene ON szenen_check_ergebnisse(dokument_szene_id);
CREATE INDEX IF NOT EXISTS idx_sce_werkstufe ON szenen_check_ergebnisse(werkstufe_id);
