-- v210: Stimmungs-Kürzel (tageszeit_stimmungen.kuerzel) immer Großbuchstaben.
-- Anzeige + Eingabe werden zusätzlich im Code normalisiert; hier die Altbestände
-- einmalig hochziehen. Idempotent (nur betroffene Zeilen).
UPDATE tageszeit_stimmungen
   SET kuerzel = UPPER(kuerzel)
 WHERE kuerzel IS NOT NULL
   AND kuerzel <> UPPER(kuerzel);
