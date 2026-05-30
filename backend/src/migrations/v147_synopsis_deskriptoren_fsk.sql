-- v147: Inhaltsdeskriptoren (JuSchG) + FSK-Einschätzung pro Folge
ALTER TABLE folgen ADD COLUMN IF NOT EXISTS synopsis_deskriptoren TEXT;
ALTER TABLE folgen ADD COLUMN IF NOT EXISTS synopsis_fsk TEXT;
