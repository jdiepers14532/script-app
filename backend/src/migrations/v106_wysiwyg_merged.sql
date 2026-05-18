-- v106: WYSIWYG-Merge-Flag auf dokument_szenen
-- Wenn TRUE: body_content der Vorlage ist bereits in content eingebettet.
-- Export nutzt content direkt als Body; vorlage_id nur noch für KZ/FZ/Layout.
ALTER TABLE dokument_szenen
  ADD COLUMN IF NOT EXISTS wysiwyg_merged BOOLEAN NOT NULL DEFAULT FALSE;
