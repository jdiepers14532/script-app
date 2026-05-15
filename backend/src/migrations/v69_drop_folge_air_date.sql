-- v69: Drop folgen.air_date — Sendedatum now sourced from broadcast_events in Produktionsdatenbank
ALTER TABLE folgen DROP COLUMN IF EXISTS air_date;
