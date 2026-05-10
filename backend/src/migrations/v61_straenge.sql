-- v61_straenge.sql — Story-Strang-System
-- Tabellen: straenge, strang_beats, dokument_szenen_straenge, strang_charaktere

-- 1. Straenge (Story-Arcs auf Produktions-Ebene)
CREATE TABLE IF NOT EXISTS straenge (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    produktion_id TEXT NOT NULL REFERENCES produktionen(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    untertitel TEXT,
    kurzinhalt TEXT,
    farbe TEXT NOT NULL DEFAULT '#007AFF',
    typ TEXT NOT NULL DEFAULT 'soap'
        CHECK (typ IN ('soap', 'genre', 'anthology')),
    label TEXT,
    status TEXT NOT NULL DEFAULT 'aktiv'
        CHECK (status IN ('aktiv', 'ruhend', 'beendet')),
    sort_order INT NOT NULL DEFAULT 0,
    beendet_ab_folge_id INT REFERENCES folgen(id) ON DELETE SET NULL,
    future_notizen TEXT,
    redaktionelle_kommentare TEXT,
    produktionelle_kommentare TEXT,
    erstellt_am TIMESTAMPTZ DEFAULT NOW(),
    erstellt_von TEXT,
    aktualisiert_am TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Strang-Beats (hierarchisch: future → block → folge)
CREATE TABLE IF NOT EXISTS strang_beats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    strang_id UUID NOT NULL REFERENCES straenge(id) ON DELETE CASCADE,
    ebene TEXT NOT NULL DEFAULT 'future'
        CHECK (ebene IN ('future', 'block', 'folge')),
    block_label TEXT,
    folge_id INT REFERENCES folgen(id) ON DELETE SET NULL,
    beat_text TEXT NOT NULL,
    ist_abgearbeitet BOOLEAN DEFAULT FALSE,
    sort_order INT NOT NULL DEFAULT 0,
    parent_beat_id UUID REFERENCES strang_beats(id) ON DELETE SET NULL,
    erstellt_am TIMESTAMPTZ DEFAULT NOW()
);

-- 3. N:M Szene <-> Strang
CREATE TABLE IF NOT EXISTS dokument_szenen_straenge (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dokument_szene_id UUID NOT NULL REFERENCES dokument_szenen(id) ON DELETE CASCADE,
    strang_id UUID NOT NULL REFERENCES straenge(id) ON DELETE CASCADE,
    sort_order INT NOT NULL DEFAULT 0,
    erstellt_am TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(dokument_szene_id, strang_id)
);

-- 4. Strang-Charaktere (beteiligte Hauptfiguren)
CREATE TABLE IF NOT EXISTS strang_charaktere (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    strang_id UUID NOT NULL REFERENCES straenge(id) ON DELETE CASCADE,
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    rolle TEXT DEFAULT 'haupt'
        CHECK (rolle IN ('haupt', 'neben')),
    UNIQUE(strang_id, character_id)
);

-- Indizes
CREATE INDEX IF NOT EXISTS idx_straenge_produktion ON straenge(produktion_id);
CREATE INDEX IF NOT EXISTS idx_straenge_status ON straenge(status);
CREATE INDEX IF NOT EXISTS idx_strang_beats_strang ON strang_beats(strang_id);
CREATE INDEX IF NOT EXISTS idx_strang_beats_folge ON strang_beats(folge_id);
CREATE INDEX IF NOT EXISTS idx_strang_beats_parent ON strang_beats(parent_beat_id);
CREATE INDEX IF NOT EXISTS idx_dss_dokszene ON dokument_szenen_straenge(dokument_szene_id);
CREATE INDEX IF NOT EXISTS idx_dss_strang ON dokument_szenen_straenge(strang_id);
CREATE INDEX IF NOT EXISTS idx_strang_char_strang ON strang_charaktere(strang_id);
