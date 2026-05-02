-- v43: Werkstufen-Modell — Neue Tabellen + Datenmigration
-- Vereinfachung: folgen_dokumente + folgen_meta → folgen, folgen_dokument_fassungen → werkstufen
-- Alte Tabellen bleiben parallel (kein Breaking Change)

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. Neue Tabelle: folgen (merge aus folgen_dokumente + folgen_meta)
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS folgen (
  id SERIAL PRIMARY KEY,
  staffel_id TEXT NOT NULL REFERENCES staffeln(id) ON DELETE CASCADE,
  folge_nummer INT NOT NULL,
  folgen_titel TEXT,
  air_date DATE,
  synopsis TEXT,
  meta_json JSONB DEFAULT '{}',
  produktion_db_id UUID,
  erstellt_von TEXT,
  erstellt_am TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(staffel_id, folge_nummer)
);

-- 2. Daten migrieren: folgen_dokumente (distinct episodes) → folgen
INSERT INTO folgen (staffel_id, folge_nummer, erstellt_von, erstellt_am)
SELECT fd.staffel_id, fd.folge_nummer,
  MIN(fd.erstellt_von), MIN(fd.erstellt_am)
FROM folgen_dokumente fd
GROUP BY fd.staffel_id, fd.folge_nummer
ON CONFLICT (staffel_id, folge_nummer) DO NOTHING;

-- 3. Auch folgen_meta-Eintraege ohne Dokument migrieren (Episoden mit Metadaten aber noch ohne Dokument)
INSERT INTO folgen (staffel_id, folge_nummer)
SELECT fm.staffel_id, fm.folge_nummer
FROM folgen_meta fm
ON CONFLICT (staffel_id, folge_nummer) DO NOTHING;

-- 4. Metadaten aus folgen_meta uebernehmen (arbeitstitel → folgen_titel)
UPDATE folgen f SET
  folgen_titel = fm.arbeitstitel,
  air_date = fm.air_date,
  synopsis = fm.synopsis,
  meta_json = fm.meta_json
FROM folgen_meta fm
WHERE f.staffel_id = fm.staffel_id AND f.folge_nummer = fm.folge_nummer;

-- ══════════════════════════════════════════════════════════════════════════════
-- 5. Neue Tabelle: werkstufen (ersetzt folgen_dokument_fassungen)
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS werkstufen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folge_id INT NOT NULL REFERENCES folgen(id) ON DELETE CASCADE,
  typ TEXT NOT NULL DEFAULT 'drehbuch',
  version_nummer INT NOT NULL DEFAULT 1,
  label TEXT,
  sichtbarkeit TEXT NOT NULL DEFAULT 'team',
  abgegeben BOOLEAN NOT NULL DEFAULT false,
  bearbeitung_status TEXT NOT NULL DEFAULT 'entwurf',
  erstellt_von TEXT,
  erstellt_am TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_werkstufen_folge ON werkstufen(folge_id);

-- 6. Daten migrieren: folgen_dokument_fassungen → werkstufen
--    IDs bleiben identisch (UUID), damit dokument_szenen.werkstufe_id = fassung_id funktioniert
INSERT INTO werkstufen (id, folge_id, typ, version_nummer, label, sichtbarkeit, abgegeben, erstellt_von, erstellt_am)
SELECT
  fdf.id,
  f.id,
  fd.typ,
  fdf.fassung_nummer,
  fdf.fassung_label,
  CASE fdf.sichtbarkeit
    WHEN 'privat' THEN 'privat'
    WHEN 'alle' THEN 'team'
    ELSE COALESCE(fdf.sichtbarkeit, 'team')
  END,
  fdf.abgegeben,
  fdf.erstellt_von,
  fdf.erstellt_am
FROM folgen_dokument_fassungen fdf
JOIN folgen_dokumente fd ON fd.id = fdf.dokument_id
JOIN folgen f ON f.staffel_id = fd.staffel_id AND f.folge_nummer = fd.folge_nummer
ON CONFLICT (id) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- 7. scene_identities: folge_id FK hinzufuegen
-- ══════════════════════════════════════════════════════════════════════════════
ALTER TABLE scene_identities
  ADD COLUMN IF NOT EXISTS folge_id INT REFERENCES folgen(id) ON DELETE CASCADE;

-- Migrieren: scene_identity → ueber dokument_szenen → fassung → dokument → folge
UPDATE scene_identities si SET folge_id = sub.folge_id
FROM (
  SELECT DISTINCT ON (ds.scene_identity_id)
    ds.scene_identity_id,
    f.id AS folge_id
  FROM dokument_szenen ds
  JOIN folgen_dokument_fassungen fdf ON fdf.id = ds.fassung_id
  JOIN folgen_dokumente fd ON fd.id = fdf.dokument_id
  JOIN folgen f ON f.staffel_id = fd.staffel_id AND f.folge_nummer = fd.folge_nummer
  ORDER BY ds.scene_identity_id
) sub
WHERE si.id = sub.scene_identity_id AND si.folge_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_scene_id_folge ON scene_identities(folge_id);

-- ══════════════════════════════════════════════════════════════════════════════
-- 8. dokument_szenen: werkstufe_id FK + neue Felder
-- ══════════════════════════════════════════════════════════════════════════════
ALTER TABLE dokument_szenen
  ADD COLUMN IF NOT EXISTS werkstufe_id UUID REFERENCES werkstufen(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS format TEXT DEFAULT 'drehbuch',
  ADD COLUMN IF NOT EXISTS stoppzeit_sek INT,
  ADD COLUMN IF NOT EXISTS geloescht BOOLEAN DEFAULT false;

-- werkstufe_id = fassung_id (IDs sind identisch dank INSERT oben)
UPDATE dokument_szenen SET werkstufe_id = fassung_id WHERE werkstufe_id IS NULL;

-- stoppzeit berechnen aus dauer_min + dauer_sek
UPDATE dokument_szenen SET stoppzeit_sek = COALESCE(dauer_min, 0) * 60 + COALESCE(dauer_sek, 0)
WHERE stoppzeit_sek IS NULL AND (dauer_min IS NOT NULL OR dauer_sek IS NOT NULL);

-- Format aus Werkstufe.typ ableiten
UPDATE dokument_szenen ds SET format = w.typ
FROM werkstufen w WHERE w.id = ds.werkstufe_id AND ds.format = 'drehbuch' AND w.typ != 'drehbuch';

-- ══════════════════════════════════════════════════════════════════════════════
-- 9. Indizes
-- ══════════════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_dok_szenen_werkstufe ON dokument_szenen(werkstufe_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_folgen_staffel ON folgen(staffel_id, folge_nummer);
