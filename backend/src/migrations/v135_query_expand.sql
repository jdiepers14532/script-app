-- Migration v135: KI Query Expansion Funktion
INSERT INTO ki_settings (funktion, provider, model_name, enabled)
VALUES ('query_expand', 'mistral', 'mistral-small-latest', false)
ON CONFLICT (funktion) DO NOTHING;
