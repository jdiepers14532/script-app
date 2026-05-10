-- v57: Shortcut-Feld fuer Absatzformate + Headline-Format

-- Tastatur-Kuerzel pro Absatzformat (z.B. "Ctrl+1", "Alt+H")
ALTER TABLE absatzformate ADD COLUMN IF NOT EXISTS shortcut TEXT;

-- Headline-Format in bestehende Produktionen einfuegen (wenn noch nicht vorhanden)
INSERT INTO absatzformate (produktion_id, name, kuerzel, kategorie, font_family, font_size,
  bold, italic, underline, uppercase, text_align,
  margin_left, margin_right, space_before, space_after, line_height,
  sort_order, ist_standard)
SELECT p.id, 'Headline', 'HL', 'alle', 'Arial', 14,
  true, false, false, false, 'left',
  0, 0, 18, 12, 1.5,
  9, false
FROM produktionen p
WHERE NOT EXISTS (
  SELECT 1 FROM absatzformate a WHERE a.produktion_id = p.id AND a.name = 'Headline'
);
