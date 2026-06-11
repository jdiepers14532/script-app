-- v209_pdf_profil_struktur_layout.sql
-- Erweitert pdf_export_profil um Struktur-/Layout-Felder, damit das Profil die
-- vollständige PDF-Darstellung als Vorlage trägt (Single Source of Truth).
-- Spiegelt das ExportPreset/ExportDrawer-Optionsset auf TYP-Ebene wider
-- (konkrete Werkstufen-/Notiz-/Szenen-IDs werden erst zur Exportzeit gemerged).
-- PFLICHT: Dateiname in die hardcodierte migrationFiles-Liste in backend/src/index.ts eintragen.

BEGIN;

-- Strukturreihenfolge + enabled der Element-TYPEN (kein konkreter Folge-/Werkstufen-Bezug).
-- preItems = vor den Szenen, postItems = nach den Szenen, szenenAktiv = Hauptinhalt an/aus.
ALTER TABLE pdf_export_profil
  ADD COLUMN IF NOT EXISTS struktur_json JSONB NOT NULL DEFAULT
    '{"preItems":[{"type":"titelseite","enabled":true},{"type":"statistik","enabled":false,"mode":"folge"},{"type":"onliner","enabled":false,"mode":"folge"},{"type":"synopse","enabled":false,"mode":"folge"},{"type":"fsk","enabled":false}],"szenenAktiv":true,"postItems":[]}'::jsonb;

-- Seitenausrichtung (entspricht ExportDrawer pdfOrientation)
ALTER TABLE pdf_export_profil
  ADD COLUMN IF NOT EXISTS pdf_orientation TEXT NOT NULL DEFAULT 'portrait';

-- Kopf-/Fußzeilen-Modus (entspricht ExportDrawer kzFzModus); 'standard' = DK-Einstellungen
ALTER TABLE pdf_export_profil
  ADD COLUMN IF NOT EXISTS kz_fz_modus TEXT NOT NULL DEFAULT 'standard';

-- Fußzeilen-Text bei kz_fz_modus='fz'; leer/NULL => Firmenname zur Renderzeit (companyInfo)
ALTER TABLE pdf_export_profil
  ADD COLUMN IF NOT EXISTS fz_text TEXT;

-- CHECK-Constraints idempotent nachziehen (ADD COLUMN überspringt bei Re-Run, daher separat)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pdf_profil_orientation_chk') THEN
    ALTER TABLE pdf_export_profil ADD CONSTRAINT pdf_profil_orientation_chk
      CHECK (pdf_orientation IN ('portrait','landscape'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pdf_profil_kzfz_chk') THEN
    ALTER TABLE pdf_export_profil ADD CONSTRAINT pdf_profil_kzfz_chk
      CHECK (kz_fz_modus IN ('standard','kz','fz','keine'));
  END IF;
END $$;

COMMIT;
