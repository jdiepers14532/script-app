-- v79: Snapshot-Metadaten — Szenenkontext + Klartextvorschau + Benutzerattribution
-- Ermöglicht: "wer hat wann an Szene X gearbeitet" im Verlauf-Panel

ALTER TABLE dokument_szenen_snapshots
  ADD COLUMN szene_nummer    TEXT,          -- z.B. "12" oder "12A"
  ADD COLUMN szene_info      TEXT,          -- z.B. "Waldweg I/A"
  ADD COLUMN text_preview    TEXT,          -- erste 150 Zeichen Klartext (kein JSON)
  ADD COLUMN created_by_name TEXT;          -- vollständiger Name des Users (denormalisiert)
