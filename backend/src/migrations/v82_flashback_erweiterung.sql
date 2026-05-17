-- v82: Flashback-Erweiterung
-- "Ganze Szene"-Flag + Folge-Referenz für genaue Episode-Angabe
ALTER TABLE dokument_szenen
  ADD COLUMN IF NOT EXISTS flashback_ganze_szene BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS flashback_referenz_folge_id UUID REFERENCES folgen(id) ON DELETE SET NULL;
