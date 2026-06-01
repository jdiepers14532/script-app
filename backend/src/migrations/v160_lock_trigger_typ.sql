-- v160: lock_trigger_werkstufen_typ für eindeutige Werkstufen-Identifikation
ALTER TABLE rollen_freigabe_konfiguration
  ADD COLUMN IF NOT EXISTS lock_trigger_werkstufen_typ TEXT NULL;
