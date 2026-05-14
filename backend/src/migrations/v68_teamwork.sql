-- v68: Team-Work — Colab-Gruppen, Sichtbarkeit, Sessions, Privat-Modus

-- 1. Sichtbarkeit auf Werkstufen
ALTER TABLE werkstufen ADD COLUMN IF NOT EXISTS sichtbarkeit TEXT DEFAULT 'autoren';
ALTER TABLE werkstufen ADD COLUMN IF NOT EXISTS privat_gesetzt_am TIMESTAMPTZ;
ALTER TABLE werkstufen ADD COLUMN IF NOT EXISTS privat_gesetzt_von TEXT;
ALTER TABLE werkstufen ADD COLUMN IF NOT EXISTS privat_permanent BOOLEAN DEFAULT false;
ALTER TABLE werkstufen ADD COLUMN IF NOT EXISTS previous_sichtbarkeit TEXT;

-- 2. Colab-Gruppen (Teams + Kollaboration — beide nutzen dieselbe Tabelle)
CREATE TABLE IF NOT EXISTS colab_gruppen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produktion_id TEXT NOT NULL REFERENCES produktionen(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  beschreibung TEXT,
  erstellt_von TEXT NOT NULL,
  erstellt_am TIMESTAMPTZ DEFAULT now(),
  geaendert_am TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_colab_gruppen_produktion ON colab_gruppen(produktion_id);

-- 3. Gruppen-Mitglieder
CREATE TABLE IF NOT EXISTS colab_gruppen_mitglieder (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gruppe_id UUID NOT NULL REFERENCES colab_gruppen(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  hinzugefuegt_am TIMESTAMPTZ DEFAULT now(),
  UNIQUE(gruppe_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_colab_mitglieder_gruppe ON colab_gruppen_mitglieder(gruppe_id);
CREATE INDEX IF NOT EXISTS idx_colab_mitglieder_user ON colab_gruppen_mitglieder(user_id);

-- 4. Werkstufen-Sessions (Heartbeat für Aktivitätserkennung)
-- DSGVO: nur last_active_at — kein Aktivitätslog
CREATE TABLE IF NOT EXISTS werkstufen_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  werkstufe_id UUID NOT NULL REFERENCES werkstufen(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  started_at TIMESTAMPTZ DEFAULT now(),
  last_active_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ,
  UNIQUE(werkstufe_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_werkstufe ON werkstufen_sessions(werkstufe_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON werkstufen_sessions(user_id);

-- 5. Privat-Modus Email-Tokens (One-Click-Links ohne Login)
CREATE TABLE IF NOT EXISTS privat_mode_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  werkstufe_id UUID NOT NULL REFERENCES werkstufen(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  aktion TEXT NOT NULL CHECK (aktion IN ('verlaengern', 'freigeben')),
  erstellt_am TIMESTAMPTZ DEFAULT now(),
  benutzt_am TIMESTAMPTZ,
  ablauf_am TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_privat_tokens_werkstufe ON privat_mode_tokens(werkstufe_id);

-- 6. DK-Settings: Privat-Modus Auto-Ablauf
INSERT INTO app_settings (key, value, updated_at)
VALUES ('privat_modus_ablauf_stunden', '4', NOW())
ON CONFLICT (key) DO NOTHING;
