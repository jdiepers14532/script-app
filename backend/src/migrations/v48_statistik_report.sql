-- v48: darsteller_name on character_productions for statistics report
ALTER TABLE character_productions ADD COLUMN IF NOT EXISTS darsteller_name TEXT;
