-- v30: Add rollenprofil_import KI function for Mistral-based character profile import
INSERT INTO ki_settings (funktion, provider, model_name, enabled)
VALUES ('rollenprofil_import', 'mistral', 'mistral-large-latest', FALSE)
ON CONFLICT (funktion) DO NOTHING;
