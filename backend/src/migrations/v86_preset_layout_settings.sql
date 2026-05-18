-- v86: absatzformat_presets bekommt Layout-Felder (Seitenformat + Seitenränder)
ALTER TABLE absatzformat_presets
  ADD COLUMN IF NOT EXISTS seitenformat VARCHAR(10) DEFAULT 'a4',
  ADD COLUMN IF NOT EXISTS page_margins JSONB DEFAULT NULL;
