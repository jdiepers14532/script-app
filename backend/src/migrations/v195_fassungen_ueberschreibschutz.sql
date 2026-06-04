-- v195: Fassungen-Überschreibschutz
-- 1. Feiertage-Tabelle (Niedersachsen + bundesweit, 2024-2028)
-- 2. werkstufen: Sichtbarkeits-Änderungs-Tracking

CREATE TABLE IF NOT EXISTS feiertage (
  datum DATE PRIMARY KEY,
  bezeichnung TEXT NOT NULL
);

INSERT INTO feiertage (datum, bezeichnung) VALUES
  -- 2024
  ('2024-01-01', 'Neujahr'),
  ('2024-03-29', 'Karfreitag'),
  ('2024-04-01', 'Ostermontag'),
  ('2024-05-01', 'Tag der Arbeit'),
  ('2024-05-09', 'Christi Himmelfahrt'),
  ('2024-05-20', 'Pfingstmontag'),
  ('2024-10-03', 'Tag der Deutschen Einheit'),
  ('2024-10-31', 'Reformationstag'),
  ('2024-12-25', '1. Weihnachtstag'),
  ('2024-12-26', '2. Weihnachtstag'),
  -- 2025
  ('2025-01-01', 'Neujahr'),
  ('2025-04-18', 'Karfreitag'),
  ('2025-04-21', 'Ostermontag'),
  ('2025-05-01', 'Tag der Arbeit'),
  ('2025-05-29', 'Christi Himmelfahrt'),
  ('2025-06-09', 'Pfingstmontag'),
  ('2025-10-03', 'Tag der Deutschen Einheit'),
  ('2025-10-31', 'Reformationstag'),
  ('2025-12-25', '1. Weihnachtstag'),
  ('2025-12-26', '2. Weihnachtstag'),
  -- 2026
  ('2026-01-01', 'Neujahr'),
  ('2026-04-03', 'Karfreitag'),
  ('2026-04-06', 'Ostermontag'),
  ('2026-05-01', 'Tag der Arbeit'),
  ('2026-05-14', 'Christi Himmelfahrt'),
  ('2026-05-25', 'Pfingstmontag'),
  ('2026-10-03', 'Tag der Deutschen Einheit'),
  ('2026-10-31', 'Reformationstag'),
  ('2026-12-25', '1. Weihnachtstag'),
  ('2026-12-26', '2. Weihnachtstag'),
  -- 2027
  ('2027-01-01', 'Neujahr'),
  ('2027-03-26', 'Karfreitag'),
  ('2027-03-29', 'Ostermontag'),
  ('2027-05-01', 'Tag der Arbeit'),
  ('2027-05-06', 'Christi Himmelfahrt'),
  ('2027-05-17', 'Pfingstmontag'),
  ('2027-10-03', 'Tag der Deutschen Einheit'),
  ('2027-10-31', 'Reformationstag'),
  ('2027-12-25', '1. Weihnachtstag'),
  ('2027-12-26', '2. Weihnachtstag'),
  -- 2028
  ('2028-01-01', 'Neujahr'),
  ('2028-04-14', 'Karfreitag'),
  ('2028-04-17', 'Ostermontag'),
  ('2028-05-01', 'Tag der Arbeit'),
  ('2028-05-25', 'Christi Himmelfahrt'),
  ('2028-06-05', 'Pfingstmontag'),
  ('2028-10-03', 'Tag der Deutschen Einheit'),
  ('2028-10-31', 'Reformationstag'),
  ('2028-12-25', '1. Weihnachtstag'),
  ('2028-12-26', '2. Weihnachtstag')
ON CONFLICT (datum) DO NOTHING;

-- werkstufen: Sichtbarkeits-Änderungs-Tracking
ALTER TABLE werkstufen ADD COLUMN IF NOT EXISTS sichtbarkeit_geaendert_am TIMESTAMPTZ;
ALTER TABLE werkstufen ADD COLUMN IF NOT EXISTS sichtbarkeit_geaendert_von UUID;
