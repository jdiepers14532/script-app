-- v59: Terminologie-Einstellung (konfigurierbare Begriffe)
-- Gespeichert als JSON in app_settings, Key: 'terminologie'
-- Default: { szene: 'Szene', motiv: 'Motiv', staffel: 'Staffel', stab: 'Stab', darsteller: 'Darsteller', komparse: 'Komparse', episode: 'Folge' }

INSERT INTO app_settings (key, value, updated_at)
VALUES ('terminologie', '{"szene":"Szene","motiv":"Motiv","staffel":"Staffel","stab":"Stab","darsteller":"Darsteller","komparse":"Komparse","episode":"Folge"}', NOW())
ON CONFLICT (key) DO NOTHING;
