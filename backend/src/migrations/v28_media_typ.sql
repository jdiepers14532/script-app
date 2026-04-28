-- v28: media_typ + thumbnail_dateiname für charakter_fotos und motiv_fotos

ALTER TABLE charakter_fotos ADD COLUMN IF NOT EXISTS media_typ TEXT NOT NULL DEFAULT 'image';
ALTER TABLE charakter_fotos ADD COLUMN IF NOT EXISTS thumbnail_dateiname TEXT;

ALTER TABLE motiv_fotos ADD COLUMN IF NOT EXISTS media_typ TEXT NOT NULL DEFAULT 'image';
ALTER TABLE motiv_fotos ADD COLUMN IF NOT EXISTS thumbnail_dateiname TEXT;
