-- v123: Szenenkopf-Template fuer "US Master Scene Format (A4)" setzen
-- US-Standard: INT. LOCATION - DAY  (Bindestrich, nicht em-dash)
UPDATE absatzformat_presets
SET szenen_kopf_template = '{{innen_aussen}}. {{motiv}} - {{dt}}'
WHERE name = 'US Master Scene Format (A4)' AND ist_system = true;
