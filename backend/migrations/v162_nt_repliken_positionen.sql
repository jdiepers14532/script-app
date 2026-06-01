-- v162: NT-Einträge — Replik-Positionen (Szeneninterne Dialogzählung)
ALTER TABLE nt_eintraege ADD COLUMN IF NOT EXISTS repliken_positionen INTEGER[] DEFAULT NULL;
