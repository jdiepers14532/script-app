-- v124: sort_order fuer absatzformat_presets
-- Ermöglicht manuelle Reihenfolge im Dropdown unabhängig von alphabetischer Sortierung.
ALTER TABLE absatzformat_presets ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 99;

-- Gewünschte Reihenfolge: Serienwerft Daily zuerst, dann US Master
UPDATE absatzformat_presets SET sort_order = 1 WHERE name = 'Serienwerft Daily-Standard';
UPDATE absatzformat_presets SET sort_order = 2 WHERE name = 'US Master Scene Format (A4)';
UPDATE absatzformat_presets SET sort_order = 3 WHERE name = 'Rote Rosen Daily-Drehbuch';
UPDATE absatzformat_presets SET sort_order = 4 WHERE name = 'ARD/ZDF Fernsehfilm';
UPDATE absatzformat_presets SET sort_order = 5 WHERE name = 'BBC TV Drama';
UPDATE absatzformat_presets SET sort_order = 6 WHERE name = 'US Screenplay (Hollywood)';
