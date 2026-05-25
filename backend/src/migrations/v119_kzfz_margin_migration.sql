-- v119: Seitenränder (oben/unten) in kopf_fusszeilen_defaults.seiten_layout sichern
-- Für Produktionen ohne Eintrag: neuen anlegen (mit Werten aus page_margin_mm)
INSERT INTO kopf_fusszeilen_defaults (produktion_id, werkstufe_typ, seiten_layout)
SELECT
  p.id,
  'alle',
  jsonb_build_object(
    'format',        'a4',
    'margin_top',    COALESCE((pms.value::jsonb->>'oben')::int,   25),
    'margin_bottom', COALESCE((pms.value::jsonb->>'unten')::int,  20),
    'margin_left',   COALESCE((pms.value::jsonb->>'links')::int,  30),
    'margin_right',  COALESCE((pms.value::jsonb->>'rechts')::int, 25)
  )
FROM produktionen p
LEFT JOIN production_app_settings pms
  ON pms.production_id = p.id AND pms.key = 'page_margin_mm'
WHERE NOT EXISTS (
  SELECT 1 FROM kopf_fusszeilen_defaults kfd
  WHERE kfd.produktion_id = p.id AND kfd.werkstufe_typ = 'alle'
)
ON CONFLICT (produktion_id, werkstufe_typ) DO NOTHING;

-- Für bestehende Einträge: margin_top/bottom ergänzen wenn noch nicht gesetzt
UPDATE kopf_fusszeilen_defaults kfd
SET seiten_layout = kfd.seiten_layout || jsonb_build_object(
  'margin_top',    COALESCE((pms.value::jsonb->>'oben')::int,   25),
  'margin_bottom', COALESCE((pms.value::jsonb->>'unten')::int,  20)
)
FROM produktionen p
LEFT JOIN production_app_settings pms
  ON pms.production_id = p.id AND pms.key = 'page_margin_mm'
WHERE kfd.produktion_id = p.id
  AND kfd.werkstufe_typ = 'alle'
  AND (
    kfd.seiten_layout->>'margin_top' IS NULL
    OR kfd.seiten_layout->>'margin_bottom' IS NULL
  );
