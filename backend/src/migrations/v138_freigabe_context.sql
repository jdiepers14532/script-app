-- v138: Freigabe-Anfragen um Kontext (Szene, Folge, Antragsteller-Name, Erneut-Anfragen-Notiz) ergänzen
ALTER TABLE rollen_freigabe_anfragen
  ADD COLUMN IF NOT EXISTS szene_id UUID NULL,
  ADD COLUMN IF NOT EXISTS folge_nummer INT NULL,
  ADD COLUMN IF NOT EXISTS beantragt_von_name TEXT NULL,
  ADD COLUMN IF NOT EXISTS erneut_anfrage_notiz TEXT NULL;
