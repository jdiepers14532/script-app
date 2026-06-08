-- v208_verteiler_sides_character_ids.sql
-- Sides-Rollenfilter pro Mitglied: welche Script-Rollen (characters) das Mitglied
-- sehen darf. Verallgemeinert „Nur eigene Szenen" auf beliebige Rollen für JEDES
-- Mitglied (Auto-Vorschlag für erkannte Schauspieler:innen, sonst manuelle Wahl).
-- Beim Veröffentlichen wird daraus distribution_empfaenger.sides_figuren geschnappt.

BEGIN;

ALTER TABLE verteiler_mitglied ADD COLUMN IF NOT EXISTS sides_character_ids UUID[];

COMMIT;
