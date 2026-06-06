-- v196_anker_anmerkungen.sql
-- Anmerkungen-Hub: geteilter Anker-Baustein + Anmerkungs-System (Script-App, script_db).
-- PFLICHT: in der hardcodierten migrationFiles-Liste in backend/src/index.ts eintragen
--          (das Verzeichnis wird NICHT automatisch gescannt).
-- Finalisiert gegen Verify V1–V4.

CREATE TABLE IF NOT EXISTS anker (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ziel: genau EINE der drei Ebenen. Kein gemeinsamer FK (wie entschieden),
  -- stattdessen je eigener FK mit ON DELETE CASCADE -> keine verwaisten Anker.
  werkstufe_id        UUID REFERENCES werkstufen(id)        ON DELETE CASCADE,
  konzept_version_id  UUID REFERENCES konzept_versionen(id) ON DELETE CASCADE,
  future_version_id   UUID REFERENCES future_versionen(id)  ON DELETE CASCADE,

  -- Verortung im Werk (nur bei werkstufe sinnvoll):
  scene_identity_id   UUID REFERENCES scene_identities(id)  ON DELETE CASCADE,
  store               TEXT CHECK (store IN ('content','kopffeld')),
  node_id             TEXT,    -- = ProseMirror attrs.node_id (String, V3); KEIN FK (lebt im content-JSONB)
  feldname            TEXT,    -- nur store='kopffeld', z.B. 'zusammenfassung','ort_name','szeneninfo'
  selektor            JSONB,   -- {position:{start,end}, quote:{prefix,exact,suffix}}

  anker_status        TEXT NOT NULL DEFAULT 'verankert'
                        CHECK (anker_status IN ('verankert','verschoben','verwaist')),
  konfidenz           REAL,
  erstellt_am         TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT anker_genau_ein_ziel CHECK (
      (werkstufe_id        IS NOT NULL)::int
    + (konzept_version_id  IS NOT NULL)::int
    + (future_version_id   IS NOT NULL)::int = 1),
  CONSTRAINT anker_content_braucht_node  CHECK (store <> 'content'  OR node_id  IS NOT NULL),
  CONSTRAINT anker_kopffeld_braucht_feld CHECK (store <> 'kopffeld' OR feldname IS NOT NULL),
  CONSTRAINT anker_szene_nur_werkstufe   CHECK (scene_identity_id IS NULL OR werkstufe_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_anker_werkstufe ON anker (werkstufe_id);
CREATE INDEX IF NOT EXISTS idx_anker_scene     ON anker (scene_identity_id);
CREATE INDEX IF NOT EXISTS idx_anker_node      ON anker (node_id) WHERE node_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS anmerkung (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anker_id       UUID NOT NULL REFERENCES anker(id) ON DELETE CASCADE,
  quelle         TEXT NOT NULL,   -- 'redaktion'|'sender'|'kunde'|'produktion'|'kostuem'|'ausstattung'|'requisite'|...
  kategorie      TEXT,
  status         TEXT NOT NULL DEFAULT 'offen'
                   CHECK (status IN ('offen','in_arbeit','uebernommen','abgelehnt')),
  body           JSONB NOT NULL,  -- Tiptap-JSON oder {text}
  erstellt_von   TEXT NOT NULL,   -- auth user_id (TEXT, app-weit konsistent: vgl. werkstufen.erstellt_von)
  erstellt_am    TIMESTAMPTZ NOT NULL DEFAULT now(),
  aufgeloest_von TEXT,
  aufgeloest_am  TIMESTAMPTZ,
  aufloesung     TEXT
);
CREATE INDEX IF NOT EXISTS idx_anmerkung_anker  ON anmerkung (anker_id);
CREATE INDEX IF NOT EXISTS idx_anmerkung_status ON anmerkung (status);
CREATE INDEX IF NOT EXISTS idx_anmerkung_quelle ON anmerkung (quelle);

CREATE TABLE IF NOT EXISTS anmerkung_kommentar (   -- Thread, in der Script-App (kein Messenger)
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anmerkung_id  UUID NOT NULL REFERENCES anmerkung(id) ON DELETE CASCADE,
  autor         TEXT NOT NULL,
  body          JSONB NOT NULL,
  erstellt_am   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_kommentar_anmerkung ON anmerkung_kommentar (anmerkung_id);

CREATE TABLE IF NOT EXISTS anmerkung_tag (         -- Person-Tagging -> loest Notification-Event aus
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anmerkung_id       UUID NOT NULL REFERENCES anmerkung(id) ON DELETE CASCADE,
  getaggter_user_id  TEXT NOT NULL,
  erstellt_von       TEXT NOT NULL,
  erstellt_am        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (anmerkung_id, getaggter_user_id)
);
CREATE INDEX IF NOT EXISTS idx_tag_user ON anmerkung_tag (getaggter_user_id);

-- Sichtbarkeits-Prädikat (eine Quelle der Wahrheit: Anmerkungs-Gate, Viewer-Werkstufen-Auflösung,
-- Export/Preview-Gate). Streng + rollen-bewusst. p_ist_autor = (roles.length>0 aus
-- validate-with-roles, app='script'). v198 ersetzt diese Funktion per CREATE OR REPLACE, um die
-- additive Bewertungs-Freigabe-Klausel zu ergänzen.
CREATE OR REPLACE FUNCTION fn_werkstufe_sichtbar(p_werkstufe uuid, p_user text, p_ist_autor boolean)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM werkstufen w WHERE w.id = p_werkstufe AND (
         w.erstellt_von = p_user
      OR (w.sichtbarkeit = 'privat'  AND w.privat_gesetzt_von = p_user)
      OR  w.sichtbarkeit = 'produktion'
      OR (w.sichtbarkeit = 'autoren' AND p_ist_autor)
      OR ((w.sichtbarkeit LIKE 'team:%' OR w.sichtbarkeit LIKE 'colab:%')
          AND SPLIT_PART(w.sichtbarkeit, ':', 2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          AND EXISTS (SELECT 1 FROM colab_gruppen_mitglieder cgm
                      WHERE cgm.gruppe_id = SPLIT_PART(w.sichtbarkeit, ':', 2)::uuid
                        AND cgm.user_id = p_user))
    )
  )
$$;
