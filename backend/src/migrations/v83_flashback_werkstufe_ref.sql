-- v83: Flashback-Referenz auf werkstufen.id (UUID) umstellen
-- Vorher: flashback_referenz_folge_id INTEGER → folgen.id (Integer-FK, falsch)
-- Jetzt:  flashback_referenz_werkstufe_id UUID → werkstufen.id (UUID-FK, korrekt)
ALTER TABLE dokument_szenen
  DROP COLUMN IF EXISTS flashback_referenz_folge_id,
  ADD COLUMN IF NOT EXISTS flashback_referenz_werkstufe_id UUID REFERENCES werkstufen(id) ON DELETE SET NULL;
