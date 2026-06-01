-- v150: Freigabe-Konfiguration erweitern — Scope-Toggles, Quorum, Lock-Trigger, Anlage-Berechtigungen
--
-- Ergänzt rollen_freigabe_konfiguration um alle Felder des Zwei-Scope-Modells:
-- - Scope-Toggles: deckt_rollen / deckt_motive / deckt_neue_szenen
-- - ot_obergrenze_pro_block: Mengenkontrolle (NULL = unbegrenzt = Funktion aus)
-- - quorum: first_responder (Default) | alle
-- - lock_trigger_fassungslabel: Fassungslabel, das den Lock-Checkpoint auslöst
-- - lock_override_aktiv: Override-Berechtigung aktiv?
-- - anlage_bearbeitung_rollen/motive: JSONB-Rollenliste für Anlage/Bearbeitung
-- - lock_override_rollen: engere Rollenliste für Lock-Gate-Override

ALTER TABLE rollen_freigabe_konfiguration
  ADD COLUMN IF NOT EXISTS deckt_rollen BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE rollen_freigabe_konfiguration
  ADD COLUMN IF NOT EXISTS deckt_motive BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE rollen_freigabe_konfiguration
  ADD COLUMN IF NOT EXISTS deckt_neue_szenen BOOLEAN NOT NULL DEFAULT FALSE;

-- NULL = unbegrenzt = Funktion faktisch aus (Default)
ALTER TABLE rollen_freigabe_konfiguration
  ADD COLUMN IF NOT EXISTS ot_obergrenze_pro_block INT NULL;

ALTER TABLE rollen_freigabe_konfiguration
  ADD COLUMN IF NOT EXISTS quorum TEXT NOT NULL DEFAULT 'first_responder';

-- Fassungslabel, das den Budget-Lock-Checkpoint auslöst (NULL = kein automatischer Trigger)
ALTER TABLE rollen_freigabe_konfiguration
  ADD COLUMN IF NOT EXISTS lock_trigger_fassungslabel TEXT NULL;

ALTER TABLE rollen_freigabe_konfiguration
  ADD COLUMN IF NOT EXISTS lock_override_aktiv BOOLEAN NOT NULL DEFAULT FALSE;

-- JSONB-Rollenlisten für konfigurierbare Anlage-/Bearbeitungsberechtigung
-- Wer neue Rollen/Figuren anlegen und bearbeiten darf (leeres Array = niemand extra)
ALTER TABLE rollen_freigabe_konfiguration
  ADD COLUMN IF NOT EXISTS anlage_bearbeitung_rollen JSONB NOT NULL DEFAULT '[]';

-- Wer Motive anlegen und bearbeiten darf
ALTER TABLE rollen_freigabe_konfiguration
  ADD COLUMN IF NOT EXISTS anlage_bearbeitung_motive JSONB NOT NULL DEFAULT '[]';

-- Engere Gruppe für Lock-Gate-Override (strenger als Rote-Seiten-Override)
ALTER TABLE rollen_freigabe_konfiguration
  ADD COLUMN IF NOT EXISTS lock_override_rollen JSONB NOT NULL DEFAULT '[]';

DO $$ BEGIN
  ALTER TABLE rollen_freigabe_konfiguration
    ADD CONSTRAINT chk_konfiguration_quorum
    CHECK (quorum IN ('first_responder', 'alle'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
