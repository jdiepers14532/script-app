ALTER TABLE dokument_vorlagen
  ADD COLUMN IF NOT EXISTS zeilennummerierung_unterbinden BOOLEAN DEFAULT false;
