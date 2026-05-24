-- v117: Freie Dokumente — Folgen die keiner Folgennummer zugeordnet sind
-- Freie Dokumente sind an eine Produktion geknüpft, aber nicht an eine Episode.
-- Typische Anwendungsfälle: Schattenbuch, Casting-Szene, Spin-Off, Sonstiges.

-- folge_nummer nullable machen (war NOT NULL)
ALTER TABLE folgen ALTER COLUMN folge_nummer DROP NOT NULL;

-- Markierung: ist dies ein freies Dokument?
ALTER TABLE folgen ADD COLUMN IF NOT EXISTS ist_frei BOOLEAN NOT NULL DEFAULT false;

-- Label für freie Dokumente
-- 'folge_sendung' = normale Episode (auto, nie manuell), 'schattenbuch', 'casting_szene', 'spin_off', 'sonstiges'
ALTER TABLE folgen ADD COLUMN IF NOT EXISTS dokument_label TEXT NOT NULL DEFAULT 'folge_sendung';

-- Sichtbarkeit für freie Dokumente: 'dauerhaft_privat' | 'team' | 'alle'
ALTER TABLE folgen ADD COLUMN IF NOT EXISTS sichtbarkeit_frei TEXT NOT NULL DEFAULT 'team';

-- Ersteller (für dauerhaft_privat-Enforcement)
ALTER TABLE folgen ADD COLUMN IF NOT EXISTS ersteller_user_id TEXT;

-- DK Glossar Defaults: Schattenbuch, Casting-Szene, Spin-Off
INSERT INTO dk_glossar_defaults (kuerzel, name, erklaerung, sort_order, kategorie)
VALUES
  ('Schattenbuch',  'Schattenbuch',   'Alternatives Drehbuch zu einer bestehenden Episode – wird intern entwickelt, aber nicht als Sendungsfassung geplant. Dient als Entwicklungsprojekt oder Vorstudie.', 50, 'kuerzel'),
  ('Casting-Szene', 'Casting-Szene',  'Szene(n) die ausschließlich für Casting-Zwecke entwickelt werden – kein Sendungsbezug, keine Episodenzuordnung.', 51, 'kuerzel'),
  ('Spin-Off',      'Spin-Off',       'Konzept oder Szenen für eine eigenständige Serienidee, die aus dem Hauptformat hervorgeht – noch nicht in Produktion.', 52, 'kuerzel')
ON CONFLICT DO NOTHING;
