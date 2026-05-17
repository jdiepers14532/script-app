-- v84: Flashback-Freitext für noch nicht erfasste Referenzszenen
ALTER TABLE dokument_szenen
  ADD COLUMN IF NOT EXISTS flashback_referenz_freitext TEXT;
