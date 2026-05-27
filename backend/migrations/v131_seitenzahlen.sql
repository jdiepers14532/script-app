-- v131: Seitenzahlen pro Szene + Lock-Felder auf Werkstufe
-- Phase 1: seite_von/seite_bis als Dezimalbrüche (0-indexed: 0.0 = Anfang S.1)
-- seite_von_str / seite_bis_str: menschenlesbar, z.B. "12" oder "47A" (Phase 3)
-- Phase 2: Sperr-Felder auf werkstufen

ALTER TABLE dokument_szenen
  ADD COLUMN IF NOT EXISTS seite_von     NUMERIC,
  ADD COLUMN IF NOT EXISTS seite_bis     NUMERIC,
  ADD COLUMN IF NOT EXISTS seite_von_str VARCHAR(10),
  ADD COLUMN IF NOT EXISTS seite_bis_str VARCHAR(10);

ALTER TABLE werkstufen
  ADD COLUMN IF NOT EXISTS seitenzahlen_gesperrt BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS gesperrt_am            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS gesperrt_von           TEXT;
