-- v164_drop_block_label.sql
-- Entfernt strang_beats.block_label nach Umstellung auf block_nummer (v163)
ALTER TABLE strang_beats DROP COLUMN IF EXISTS block_label;
