-- v88: Format-Templates in Absatzformate-System zusammengeführt
-- editor_format_elemente und editor_format_templates sind redundant
-- (Absatzformate hat enter_next_format + tab_next_format)
DROP TABLE IF EXISTS editor_format_elemente;
DROP TABLE IF EXISTS editor_format_templates;
