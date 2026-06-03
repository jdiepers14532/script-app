-- v189: Figuren-Beziehungsbaum (Handoff 2026-06-03)
-- A.1 Typ-Referenztabelle
-- A.2 charakter_beziehungen erweitern (Range, herkunft, FK, neue Constraints)
-- A.3 figuren_layout (Canvas-Positionen)
-- A.4 beziehung_seed_kandidaten (Staging)

-- ============================================================
-- A.1  Typ-Referenztabelle
-- ============================================================
CREATE TABLE beziehungstypen (
  key        text PRIMARY KEY,
  label      text NOT NULL,
  kategorie  text NOT NULL CHECK (kategorie IN ('familie','romantik','sozial','konflikt','beruflich')),
  gerichtet  boolean NOT NULL DEFAULT false,
  farbe      text NOT NULL,
  linienstil text NOT NULL DEFAULT 'solid',
  sortierung int DEFAULT 0
);

INSERT INTO beziehungstypen (key, label, kategorie, gerichtet, farbe, linienstil, sortierung) VALUES
  ('familie_eltern_kind', 'Eltern–Kind',          'familie',   true,  '#000000', 'solid',  10),
  ('familie_geschwister', 'Geschwister',           'familie',   false, '#000000', 'solid',  11),
  ('familie_sonstige',    'Verwandt',              'familie',   false, '#757575', 'solid',  12),
  ('ehe',                 'Ehe',                   'romantik',  false, '#00C853', 'solid',  20),
  ('liebe',               'Liebe',                 'romantik',  false, '#00C853', 'solid',  21),
  ('affaere',             'Affäre',                'romantik',  false, '#00C853', 'dashed', 22),
  ('ex',                  'Ex',                    'romantik',  false, '#757575', 'dashed', 23),
  ('einseitige_liebe',    'Einseitig verliebt',    'romantik',  true,  '#00C853', 'dotted', 24),
  ('freundschaft',        'Freundschaft',          'sozial',    false, '#007AFF', 'solid',  30),
  ('bekanntschaft',       'Bekanntschaft',         'sozial',    false, '#007AFF', 'dotted', 31),
  ('antagonismus',        'Antagonist',            'konflikt',  true,  '#FF3B30', 'solid',  40),
  ('beruflich',           'Beruflich',             'beruflich', false, '#757575', 'solid',  50);

-- ============================================================
-- A.2  charakter_beziehungen erweitern
-- ============================================================

-- Neue Spalten
ALTER TABLE charakter_beziehungen
  ADD COLUMN reihen_id           uuid,
  ADD COLUMN gueltig_ab_staffel  int  NOT NULL DEFAULT 0,
  ADD COLUMN gueltig_bis_staffel int,
  ADD COLUMN staerke             smallint,
  ADD COLUMN herkunft            text NOT NULL DEFAULT 'manuell'
             CHECK (herkunft IN ('manuell','wiki_seed')),
  ADD COLUMN quell_url           text,
  ADD COLUMN quell_abruf_am      date;

-- Typ an Referenztabelle binden
ALTER TABLE charakter_beziehungen
  ADD CONSTRAINT fk_beziehungstyp FOREIGN KEY (beziehungstyp) REFERENCES beziehungstypen(key);

-- Status-CHECK erweitern: alten droppen, neuen mit Soap-Zuständen anlegen
ALTER TABLE charakter_beziehungen
  DROP CONSTRAINT charakter_beziehungen_status_check;
ALTER TABLE charakter_beziehungen
  ADD CONSTRAINT chk_status CHECK (status IN ('aktiv','beendet','historisch','geheim','vermutet'));

-- Globale UNIQUE droppen, staffel-fähige UNIQUE anlegen
ALTER TABLE charakter_beziehungen
  DROP CONSTRAINT "charakter_beziehungen_character_id_related_character_id_bez_key";
ALTER TABLE charakter_beziehungen
  ADD CONSTRAINT uq_kante UNIQUE (character_id, related_character_id, beziehungstyp, gueltig_ab_staffel);

-- Such-Index für Snapshot-Query
CREATE INDEX idx_bez_scope ON charakter_beziehungen (reihen_id, gueltig_ab_staffel, gueltig_bis_staffel);

-- ============================================================
-- A.3  Layout-Persistenz (Canvas-Positionen pro Reihe)
-- ============================================================
CREATE TABLE figuren_layout (
  reihen_id    uuid    NOT NULL,
  character_id uuid    NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  x            numeric NOT NULL,
  y            numeric NOT NULL,
  PRIMARY KEY (reihen_id, character_id)
);

-- ============================================================
-- A.4  Staging-Tabelle für den Wiki-Seed
-- ============================================================
CREATE TABLE beziehung_seed_kandidaten (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id              uuid        NOT NULL,
  quell_url             text        NOT NULL,
  quell_abruf_am        date        NOT NULL,
  roh_quelle_name       text        NOT NULL,
  roh_ziel_name         text        NOT NULL,
  match_quelle_id       uuid,
  match_ziel_id         uuid,
  match_konfidenz       numeric,
  typ_key               text        REFERENCES beziehungstypen(key),
  staffel_hinweis       int,
  gueltig_ab_staffel    int,
  gueltig_bis_staffel   int,
  evidenz_zitat         text,
  ki_konfidenz          numeric,
  status                text        NOT NULL DEFAULT 'neu'
                        CHECK (status IN ('neu','bestaetigt','abgelehnt','braucht_klaerung')),
  erzeugt_quelle_figur  boolean     DEFAULT false,
  erzeugt_ziel_figur    boolean     DEFAULT false,
  reviewer              uuid,
  reviewed_am           timestamptz,
  erstellt_am           timestamptz DEFAULT now()
);
