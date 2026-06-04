-- v192: beziehung_seed_kandidaten — ziel_verstorben-Flag für Wiki-Import
-- Wenn der Ziel-Name im Wiki mit † markiert ist, wird dieses Flag gesetzt.
-- Bei Freigabe (anlegen_ziel=true) landet es in characters.meta_json.verstorben.

ALTER TABLE beziehung_seed_kandidaten
  ADD COLUMN IF NOT EXISTS ziel_verstorben BOOLEAN NOT NULL DEFAULT FALSE;
