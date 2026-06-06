-- v198_bewertungs_freigabe.sql
-- Per-Werkstufe-Freigabe einer Fassung an einen wiederverwendbaren Verteiler (= colab_gruppe)
-- zur Ansicht + Anmerkung, additiv zur Basis-sichtbarkeit.
-- In migrationFiles in backend/src/index.ts eintragen (nach v196/v197; nächste freie Nummer).
-- Setzt v196_anker_anmerkungen.sql voraus (definiert fn_werkstufe_sichtbar).

-- Diskriminator, damit Bewertungs-Verteiler NICHT versehentlich als team:/colab:-Sichtbarkeitsziel
-- auftauchen (und Collab-Gruppen nicht als Verteiler):
ALTER TABLE colab_gruppen
  ADD COLUMN IF NOT EXISTS typ TEXT NOT NULL DEFAULT 'colab'
  CHECK (typ IN ('colab','bewertung'));

CREATE TABLE IF NOT EXISTS werkstufe_bewertungsfreigabe (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  werkstufe_id      UUID NOT NULL REFERENCES werkstufen(id)    ON DELETE CASCADE,
  gruppe_id         UUID NOT NULL REFERENCES colab_gruppen(id) ON DELETE CASCADE,  -- der Verteiler
  aktiv             BOOLEAN NOT NULL DEFAULT true,
  freigegeben_von   TEXT,
  freigegeben_am    TIMESTAMPTZ NOT NULL DEFAULT now(),
  zurueckgezogen_am TIMESTAMPTZ,
  UNIQUE (werkstufe_id, gruppe_id)
);
CREATE INDEX IF NOT EXISTS idx_bewfreigabe_werkstufe ON werkstufe_bewertungsfreigabe (werkstufe_id) WHERE aktiv;
CREATE INDEX IF NOT EXISTS idx_bewfreigabe_gruppe    ON werkstufe_bewertungsfreigabe (gruppe_id);

-- Prädikat um die additive Bewertungs-Freigabe-Klausel erweitern (ersetzt die v196-Fassung):
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
  OR EXISTS (                                                 -- additive Bewertungs-Freigabe
    SELECT 1 FROM werkstufe_bewertungsfreigabe bf
    JOIN colab_gruppen_mitglieder cgm ON cgm.gruppe_id = bf.gruppe_id
    WHERE bf.werkstufe_id = p_werkstufe AND bf.aktiv AND cgm.user_id = p_user
  )
$$;
