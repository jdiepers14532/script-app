-- v206_anker_stammt_von.sql
-- Werkstufenübergreifende offene Anmerkungen (Block 2): beim Erstellen einer neuen Werkstufe werden
-- die OFFENEN Anker der Vorgänger-Fassung mitkopiert (neue werkstufe_id, gleiche scene_identity +
-- Selektor + Body). stammt_von_anker_id verkettet die Kopien zum Original (Nachverfolgung/Dedup).
-- Übernommen/abgelehnt werden NICHT kopiert → bleiben nur in ihrer Fassung.

ALTER TABLE anker ADD COLUMN IF NOT EXISTS stammt_von_anker_id UUID REFERENCES anker(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_anker_stammt_von ON anker (stammt_von_anker_id) WHERE stammt_von_anker_id IS NOT NULL;
