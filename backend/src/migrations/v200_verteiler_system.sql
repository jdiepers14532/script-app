-- v200_verteiler_system.sql
-- Verteiler-, Distribution-, PDF-Profil- und Druck-System (script_db)
-- PFLICHT: Dateinamen in die hardcodierte migrationFiles-Liste in backend/src/index.ts eintragen.
-- (Aus Paket v118_verteiler_system.sql; v118 war bereits belegt → umnummeriert auf v200.
--  Idempotenz gehärtet: CREATE TABLE/INDEX mit IF NOT EXISTS — Inhalt sonst unverändert.)

BEGIN;

-- =========================================================================
-- PDF-Export-Profil (definiert NUR das Aussehen; Sides/Revision schneiden
-- sich zur Generierzeit damit)
-- =========================================================================
CREATE TABLE IF NOT EXISTS pdf_export_profil (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    produktion_id          UUID NOT NULL,
    name                   TEXT NOT NULL,
    ist_standard           BOOLEAN NOT NULL DEFAULT FALSE,

    -- Wasserzeichen
    wz_zwc_aktiv           BOOLEAN NOT NULL DEFAULT TRUE,
    wz_sichtbar_aktiv      BOOLEAN NOT NULL DEFAULT TRUE,
    wz_sichtbar_position   TEXT NOT NULL DEFAULT 'kopf_fuss'
                           CHECK (wz_sichtbar_position IN
                           ('kopf','fuss','kopf_fuss','diagonal','kopf_fuss_diagonal')),
    wz_sichtbar_inhalt     TEXT DEFAULT '{empfaenger_name} · {datum}',
    wz_sichtbar_opacity    SMALLINT NOT NULL DEFAULT 20 CHECK (wz_sichtbar_opacity BETWEEN 0 AND 100),
    wz_sichtbar_groesse    TEXT NOT NULL DEFAULT 'mittel' CHECK (wz_sichtbar_groesse IN ('klein','mittel','gross')),

    -- Struktur (Übernahme aus bestehendem Export, v66)
    struktur_quelle        TEXT NOT NULL DEFAULT 'aktueller_export'
                           CHECK (struktur_quelle IN ('aktueller_export','eigenes')),
    kopf_fuss_vorlage_id   UUID,
    titelblatt             BOOLEAN NOT NULL DEFAULT TRUE,
    szenen_nummerierung    BOOLEAN NOT NULL DEFAULT TRUE,
    seiten_nummerierung    BOOLEAN NOT NULL DEFAULT TRUE,

    -- Lesezeichen (PDF-Outline)
    lesezeichen_aktiv      BOOLEAN NOT NULL DEFAULT TRUE,
    lesezeichen_ebene      TEXT NOT NULL DEFAULT 'szene'
                           CHECK (lesezeichen_ebene IN ('szene','akt_szene','strang_szene')),
    lesezeichen_label      TEXT NOT NULL DEFAULT '{szenennr} – {motiv}',

    -- Revisions-Darstellung (greift bei Mitglied-Modus 'markiert')
    revisions_stil         TEXT NOT NULL DEFAULT 'asterisk'
                           CHECK (revisions_stil IN ('asterisk','farbseite','beides')),

    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Nur ein Standard-Profil je Produktion
CREATE UNIQUE INDEX IF NOT EXISTS ux_pdf_profil_standard ON pdf_export_profil (produktion_id) WHERE ist_standard;

-- =========================================================================
-- Verteiler (pro Werkstufe-Typ ODER allgemein für Revisionen)
-- =========================================================================
CREATE TABLE IF NOT EXISTS verteiler (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    produktion_id          UUID NOT NULL,
    name                   TEXT NOT NULL,

    scope                  TEXT NOT NULL CHECK (scope IN ('werkstufe_typ','revision')),
    werkstufe_typ          TEXT,  -- real konfigurierte Werkstufe; NULL wenn scope='revision'

    pdf_export_profil_id   UUID REFERENCES pdf_export_profil(id) ON DELETE SET NULL,
    pdf_anhang             BOOLEAN NOT NULL DEFAULT FALSE,  -- Default: Link-first

    email_betreff          TEXT,
    email_text             TEXT,

    -- Ausdrucken (Bald)
    druck_erlaubt          BOOLEAN NOT NULL DEFAULT FALSE,
    druck_standort         TEXT,
    druck_printer_id       TEXT,
    druck_default_optionen JSONB NOT NULL DEFAULT '{"sides":"one-sided","number_up":1,"copies":1}'::jsonb,
    abholort               TEXT,

    aktiv                  BOOLEAN NOT NULL DEFAULT TRUE,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT verteiler_scope_chk CHECK (
        (scope = 'werkstufe_typ' AND werkstufe_typ IS NOT NULL) OR
        (scope = 'revision'      AND werkstufe_typ IS NULL)
    )
);
CREATE INDEX IF NOT EXISTS ix_verteiler_produktion ON verteiler (produktion_id);

-- =========================================================================
-- Verteiler-Mitglied (id = stabile UUID = Identität; trägt Druckpräferenz)
-- Schauspieler:in/Rolle werden NICHT gespeichert, sondern live aus der
-- Besetzungsmatrix aufgelöst.
-- =========================================================================
CREATE TABLE IF NOT EXISTS verteiler_mitglied (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    verteiler_id           UUID NOT NULL REFERENCES verteiler(id) ON DELETE CASCADE,

    kontakt_id             UUID,   -- Ref vertraege.app (cross-DB, daher kein FK)
    freie_email            TEXT,
    name                   TEXT,

    revisions_modus        TEXT NOT NULL DEFAULT 'voll'
                           CHECK (revisions_modus IN ('voll','nur_aenderungen','markiert')),
    sides_nur_eigene       BOOLEAN NOT NULL DEFAULT FALSE,   -- nur wirksam, wenn Schauspieler:in
    drehplan_reihenfolge   BOOLEAN NOT NULL DEFAULT FALSE,   -- Bald

    druck_praeferenz       JSONB,  -- gemerkte Druckoptionen an der stabilen UUID
    aktiv                  BOOLEAN NOT NULL DEFAULT TRUE,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT mitglied_empfaenger_chk CHECK (kontakt_id IS NOT NULL OR freie_email IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS ix_mitglied_verteiler ON verteiler_mitglied (verteiler_id);

-- =========================================================================
-- Distribution (ein Versand-Vorgang einer veröffentlichten Werkstufe)
-- =========================================================================
CREATE TABLE IF NOT EXISTS distribution (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    werkstufe_id           UUID NOT NULL,
    verteiler_id           UUID NOT NULL REFERENCES verteiler(id),
    ausgeloest_von         UUID NOT NULL,
    ausgeloest_am          TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_distribution_werkstufe ON distribution (werkstufe_id);
CREATE INDEX IF NOT EXISTS ix_distribution_verteiler ON distribution (verteiler_id);

-- =========================================================================
-- Distribution-Empfänger (id = correlation_id = VERP/Message-ID-Basis)
-- Zustellung = FSM; Engagement = Zeitstempel-Flags
-- =========================================================================
CREATE TABLE IF NOT EXISTS distribution_empfaenger (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    distribution_id        UUID NOT NULL REFERENCES distribution(id) ON DELETE CASCADE,
    mitglied_id            UUID REFERENCES verteiler_mitglied(id) ON DELETE SET NULL,

    email_resolved         TEXT NOT NULL,
    name                   TEXT,
    sides_figuren          UUID[],  -- Snapshot der Figuren-IDs zum Versandzeitpunkt; NULL = Vollfassung
    revisions_modus        TEXT NOT NULL DEFAULT 'voll',

    pdf_path               TEXT,    -- lazy: erst beim ersten Zugriff erzeugt
    secure_token_hash      TEXT NOT NULL,
    token_ablauf           TIMESTAMPTZ NOT NULL,

    zustellung             TEXT NOT NULL DEFAULT 'queued'
                           CHECK (zustellung IN ('queued','sent','delivered','bounced','expired')),
    bounce_grund           TEXT,

    gesendet_am            TIMESTAMPTZ,
    zugestellt_am          TIMESTAMPTZ,
    opened_at              TIMESTAMPTZ,
    downloaded_at          TIMESTAMPTZ,
    printed_at             TIMESTAMPTZ,   -- Bald
    picked_up_at           TIMESTAMPTZ,   -- Bald

    created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_empf_distribution ON distribution_empfaenger (distribution_id);
CREATE INDEX IF NOT EXISTS ix_empf_token        ON distribution_empfaenger (secure_token_hash);
CREATE INDEX IF NOT EXISTS ix_empf_mitglied     ON distribution_empfaenger (mitglied_id);

-- =========================================================================
-- Druck-Job (Bald) — wird vom Büro-Agent gepollt
-- =========================================================================
CREATE TABLE IF NOT EXISTS druck_job (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    distribution_empfaenger_id  UUID NOT NULL REFERENCES distribution_empfaenger(id) ON DELETE CASCADE,
    standort                    TEXT NOT NULL,
    printer_id                  TEXT NOT NULL,
    optionen                    JSONB NOT NULL DEFAULT '{"sides":"one-sided","number_up":1,"copies":1}'::jsonb,

    status                      TEXT NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending','printing','done','failed','picked_up')),
    claimed_by                  TEXT,   -- Lock gegen Doppeldruck bei mehreren Agents
    claimed_at                  TIMESTAMPTZ,
    fehler                      TEXT,

    printed_at                  TIMESTAMPTZ,
    abgeholt_am                 TIMESTAMPTZ,
    abgeholt_von                TEXT,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_druck_poll ON druck_job (standort, status);

COMMIT;
