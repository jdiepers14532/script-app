-- v148: Deskriptor-Vorlagen für FSK/JuSchG-Inhaltskennzeichnung pro Produktion
-- Produktionsspezifische Liste der verfügbaren Inhaltsdeskriptoren (Standard: FSK/JuSchG)
CREATE TABLE IF NOT EXISTS deskriptor_vorlagen (
  id SERIAL PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES produktionen(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INT DEFAULT 0,
  UNIQUE(production_id, name)
);
