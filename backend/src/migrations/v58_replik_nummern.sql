-- v58: Repliken-Nummerierung + Zeilenzählung
-- replik_count pro Szene (Anzahl CHARACTER-Blöcke in dieser Szene)
ALTER TABLE dokument_szenen ADD COLUMN IF NOT EXISTS replik_count INT DEFAULT 0;

-- Baseline für gelockte Werkstufen: JSON-Map { scene_id: [replik_nummern] }
ALTER TABLE werkstufen ADD COLUMN IF NOT EXISTS replik_baseline JSONB;
