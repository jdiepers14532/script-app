# Import-Schema Snapshot — Treatment/Drehbuch-Parser

Stand: 2026-05-18 · Basis: Code-Analyse ohne DB-Abfrage (nur lesen, keine Änderungen)

---

## Schritt 1 — Relevante Dateien

| Pfad | Beschreibung |
|---|---|
| `backend/src/importers/types.ts` | Zentrale Typdefs: `ParsedScene`, `Textelement`, `ImportResult`, `NonSceneElement`, `BboxLayout`, `LineInfo` |
| `backend/src/importers/index.ts` | Dispatcher `parseScript()`: Format-Erkennung → Parser-Routing |
| `backend/src/importers/roteRosen.ts` | Hauptparser für Rote-Rosen-PDFs (Treatment + Drehbuch); Preprocessor, Szenen-Header-Parser, Content-Parser |
| `backend/src/importers/pdf.ts` | PDF-Extraktion (pdftotext → Mistral OCR → pdf-parse Fallback) + Bbox-Layout-Analyse; ruft `parseRoteRosen()` auf |
| `backend/src/importers/fountain.ts` | Fountain-Format-Parser (auch als PDF-Fallback) |
| `backend/src/importers/fdx.ts` | Final Draft XML-Parser |
| `backend/src/importers/docx.ts` | DOCX-Parser |
| `backend/src/importers/celtx.ts` | Celtx-Format-Parser |
| `backend/src/importers/writerduet.ts` | WriterDuet-Format-Parser |
| `backend/src/routes/import.ts` | HTTP-Endpunkte `/detect`, `/preview`, `/commit`; Persistenz-Logik (transaktion, Bulk-Insert) |
| `frontend/src/pages/ImportPage.tsx` | Import-Wizard (Upload → Preview → Bestätigen) |
| `backend/src/migrations/v38_scene_identities.sql` | Initiales `dokument_szenen`-Schema |
| `backend/src/migrations/v43_werkstufen_modell.sql` | `werkstufen`-Tabelle, `folgen`-Refactor |
| `backend/src/migrations/v47_rename_produktionen.sql` | `staffeln → produktionen`-Rename, Clean-Start |
| `backend/src/migrations/v50_drehorte_motive.sql` | `drehorte` + `motive`-Hierarchie |
| `backend/src/migrations/v52_element_type.sql` | `element_type`-Spalte auf `dokument_szenen` |
| `backend/src/migrations/v57_page_length.sql` | `page_length`-Spalte (Seitenachtel) |
| `backend/src/migrations/v63_sonderszenen.sql` | `sondertyp`, `wechselschnitt_partner`, Stockshot-/Flashback-Felder |
| `backend/src/migrations/v64_datei_archiv_hash.sql` | `datei_hash`, `original_datei`, `original_dateiname`, `datei_groesse` auf `werkstufen` |

---

## Schritt 2 — Eingangsformate

### Akzeptierte Formate

| Extension | Format | Parser |
|---|---|---|
| `.pdf` | PDF (binär) | `parsePdf()` → pdftotext / Mistral OCR / pdf-parse Fallback |
| `.fountain`, `.txt` | Fountain-Plaintext | `parseFountain()` |
| `.fdx` | Final Draft XML | `parseFdx()` |
| `.docx` | Word Open XML | `parseDocx()` |
| `.celtx` | Celtx XML | `parseCeltx()` |
| `.writerduet` | WriterDuet-Format | `parseWriterDuet()` |

### Format-Erkennung & Routing

```
POST /api/import/preview  (oder /commit)
  └─ detectFormat(filename, buffer)   → { format, confidence, hint }
       confidence < 0.5 → Error 422
  └─ parseScript(filename, buffer, opts)
       switch(format)
         'pdf'      → parsePdf(buffer, pdfOpts)
                        └─ pdftotext (bevorzugt, Poppler-CLI)
                        └─ [Mistral OCR fallback wenn pdf_method='mistral']
                        └─ [pdf-parse fallback]
                        └─ isRoteRosenFormat(text)?
                             ja  → parseRoteRosen(text, ocrMode, layout)
                             nein→ parseFountain(text)
         'fountain' → parseFountain(text)
         'fdx'      → parseFdx(text)
         'docx'     → parseDocx(buffer)
         'celtx'    → parseCeltx(buffer)
         'writerduet'→ parseWriterDuet(buffer)
```

### PDF-Extraktion (Reihenfolge)

1. **pdftotext** (Poppler, `spawnSync`) — bevorzugt, liefert sauberes Unicode-Layout
   - Optionale Crop-Parameter: `cropLeft`, `cropRight`, `cropBottom` (% der A4-Seite)
2. **Mistral OCR** (`mistral-ocr-latest`, API-Key aus `ki_providers`) — Fallback für gescannte PDFs; liefert Markdown → extra Preprocessor
3. **pdf-parse** (npm) — letzter Fallback; produziert zusammengeklebte Zeilen → extra Preprocessor

**Rote-Rosen-Erkennung im PDF-Text:**
```typescript
const TITLE_RE = /(?:Rote Rosen|Sturm der Liebe)\s+(?:Produktion|Staffel)\s+(\d+)/
const DOC_TYPE_RE = /(Treatment|Drehbuch)\s+-\s+Episode\s+(\d+)/
// beide müssen in den ersten 3000 Zeichen vorkommen
```

---

## Schritt 3 — Datenmodell der geparsten Szene

### TypeScript-Interface (aus `importers/types.ts`)

```typescript
export type TextelementType =
  | 'action'        // Regieanweisung / Fließtext (Treatment-Oneliner, Körper)
  | 'dialogue'      // Dialogzeile
  | 'character'     // Figurname vor Dialog
  | 'parenthetical' // (Regieanweisung in Klammern nach Figurnamen)
  | 'transition'    // Überblende
  | 'shot'          // Kamera-Anweisung / Crosscut-Location-Label
  | 'direction'     // Anmerkung/Regieanweisung (explizit via "Anm.")
  | 'general'       // Generischer Absatz
  | 'heading'       // Überschrift (Kapitelüberschrift in Notiz/Storyline)

export interface InlineMark {
  type: 'bold' | 'italic' | 'underline'
}

export interface InlineNode {
  type: 'text'
  text: string
  marks?: InlineMark[]
}

export interface Textelement {
  id: string              // Format: "te{timestamp}_{counter}" — eindeutig pro Parse-Lauf
  type: TextelementType   // Pflicht
  text: string            // Klartext-Inhalt — Pflicht
  character?: string      // Figurnamen-Attribut (nur bei type='character'|'dialogue'|'parenthetical')
  richContent?: InlineNode[]  // Optional: ProseMirror-kompatible Inline-Nodes mit Marks
  textAlign?: 'left' | 'center' | 'right'  // Optional
}

export interface ParsedScene {
  nummer: number                           // PFLICHT: Szenen-Nummer (z.B. 2 aus "4402.2")
  int_ext: 'INT' | 'EXT' | 'INT/EXT'     // PFLICHT
  tageszeit: 'TAG' | 'NACHT' | 'ABEND' | 'DÄMMERUNG'  // PFLICHT
  ort_name: string                         // PFLICHT: Rohtext, z.B. "Stu. 02 / Wohngemeinschaft"
  zusammenfassung?: string                 // Optional: Oneliner aus Treatment-Szenen-Kopf
  textelemente: Textelement[]              // PFLICHT: kann leer sein
  charaktere: string[]                     // PFLICHT: Figurnamen (aus Header + Dialog-Erkennung)
  komparsen?: string[]                     // Optional: Roh-Strings, z.B. ["2x Krankenpfleger o.T."]
  spieltag?: number                        // Optional: aus I/T4 → 4
  dauer_sekunden?: number                  // Optional: aus "1:52" → 112
  isWechselschnitt?: boolean               // Optional: true bei Kreuzschnitt-Szenen
  wechselschnittPartner?: number[]         // Optional: Szenen-Nummern der Kreuzschnitt-Partner
  isStockshot?: boolean                    // Optional: explizit via Keyword erkannt
  isStockshotVerdacht?: boolean            // Optional: heuristisch (kein Char + kurz + kleiner Body)
  szeneninfo?: string                      // Optional: Hinweiszeilen ("Bild aus Block 881", "Bitte...Memo")
}

export interface NonSceneElement {
  type: 'titelseite' | 'synopsis' | 'recap' | 'precap' | 'memo'
  label: string   // z.B. "FOLGE 4402", "Recap", "Titelseite"
  content: string // Plaintext oder vorformatierter Inhalt
}

export interface ImportResult {
  szenen: ParsedScene[]
  nonSceneElements?: NonSceneElement[]
  meta: {
    format: string          // z.B. "rote-rosen-treatment", "fountain", "fdx"
    version?: string
    total_scenes: number
    total_textelemente: number
    charaktere: string[]    // Deduplizierte Gesamt-Liste aller Figuren
    warnings: string[]
    roteRosenMeta?: Record<string, any>  // Deckelblatt-Metadaten (nur bei Rote Rosen)
  }
}
```

### Enums / Kontrollierte Vokabulare

| Feld | Enum-Werte |
|---|---|
| `int_ext` | `'INT' \| 'EXT' \| 'INT/EXT'` |
| `tageszeit` | `'TAG' \| 'NACHT' \| 'ABEND' \| 'DÄMMERUNG'` |
| `TextelementType` | s.o. (8 Werte) |
| `InlineMark.type` | `'bold' \| 'italic' \| 'underline'` |
| `NonSceneElement.type` | `'titelseite' \| 'synopsis' \| 'recap' \| 'precap' \| 'memo'` |

### INT/EXT-Code-Dekodierung (Rote Rosen spezifisch)

```
Regex: /^([IE])\/([TNAD])(\d+)$/
  I → 'INT'    E → 'EXT'
  T → 'TAG'    N → 'NACHT'    A → 'ABEND'    D → 'DÄMMERUNG'
  Zahl → spieltag (INT)

Beispiele:
  I/T4  → INT, TAG, spieltag=4
  E/N12 → EXT, NACHT, spieltag=12
  I/A7  → INT, ABEND, spieltag=7
```

### `roteRosenMeta`-Struktur (Deckelblatt, nur bei Rote Rosen)

```typescript
{
  rote_rosen_format: true,
  document_type: 'treatment' | 'drehbuch',
  staffel: number,
  episode: number,
  block?: number,
  regie?: string,
  autor?: string,
  dialogautor?: string,
  writer_producer?: string,
  head_of_story?: string,
  storyliner?: string,
  story_edit?: string,
  script_edit?: string,
  dialog_edit?: string,
  drehtermin?: string,
  sendetermin?: string,
  gesamtlaenge?: string,
  synopsis?: string,
  recaps?: string[],
  precaps?: string[],
}
```

### Komparsen-Roh-Format

`komparsen[]` enthält unstrukturierte Strings direkt aus dem PDF-Text.
In `/preview` und `/commit` werden sie weiter geparst via `parseKomparseEntry()`:

```typescript
// "4x PatientInnen o.T." →
{ name: "PatientInnen", anzahl: 4, headerOT: true }
// "Krankenpfleger" →
{ name: "Krankenpfleger", anzahl: 1, headerOT: false }
```

---

## Schritt 4 — Persistenz

### Tabellen-Hierarchie

```
produktionen (TEXT PK)
  └─ folgen (SERIAL)
       └─ werkstufen (UUID)  ← eine pro Import
            └─ dokument_szenen (UUID)  ← eine pro Szene/Non-Scene-Element
                 ↕ (N:M)
            scene_identities (UUID)    ← stabile Szenen-UUID über alle Fassungen
                 └─ scene_characters   ← Figuren + Spieltyp pro Szene
                 └─ wechselschnitt_partner
```

### DDL — Kern-Tabellen (aus Migrations)

```sql
-- produktionen (vormals staffeln, renamed v47)
-- (kein vollständiges CREATE in v47, da rename; Originalschema in v1_init.sql)
-- relevante Spalten: id TEXT PK, titel TEXT, seitenformat TEXT DEFAULT 'a4'

-- folgen (v43, column rename v47)
CREATE TABLE folgen (
  id           SERIAL PRIMARY KEY,
  produktion_id TEXT NOT NULL REFERENCES produktionen(id) ON DELETE CASCADE,
  folge_nummer  INT NOT NULL,
  folgen_titel  TEXT,
  synopsis      TEXT,
  erstellt_von  TEXT,
  erstellt_am   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(produktion_id, folge_nummer)
);

-- werkstufen (v43 + Erweiterungen v48, v64)
CREATE TABLE werkstufen (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folge_id            INT NOT NULL REFERENCES folgen(id) ON DELETE CASCADE,
  typ                 TEXT NOT NULL DEFAULT 'drehbuch', -- 'storyline'|'drehbuch'|'notiz' (docTyp aus stage_type)
  version_nummer      INT NOT NULL DEFAULT 1,
  label               TEXT,                            -- z.B. "Import 2026-04-30"
  sichtbarkeit        TEXT NOT NULL DEFAULT 'team',    -- 'privat'|'team'|'autoren'|'produktion'
  abgegeben           BOOLEAN NOT NULL DEFAULT false,
  bearbeitung_status  TEXT NOT NULL DEFAULT 'entwurf',
  erstellt_von        TEXT,
  erstellt_am         TIMESTAMPTZ DEFAULT NOW(),
  stand_datum         DATE,          -- aus Dateiname/PDF-Deckelblatt (v48)
  original_datei      TEXT,          -- relativer Pfad zum archivierten Original (v64)
  original_dateiname  TEXT,          -- ursprünglicher Dateiname (v64)
  datei_hash          TEXT,          -- SHA-256 für Duplikat-Erkennung (v64)
  datei_groesse       INTEGER        -- Bytes (v64)
);

-- scene_identities (v38, columns geändert v43+v47)
CREATE TABLE scene_identities (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folge_id   INT REFERENCES folgen(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT
);

-- dokument_szenen (v38 + Erweiterungen v43, v52, v57, v63)
CREATE TABLE dokument_szenen (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  werkstufe_id        UUID REFERENCES werkstufen(id) ON DELETE CASCADE,
  scene_identity_id   UUID REFERENCES scene_identities(id) ON DELETE CASCADE, -- nullable für Non-Scene
  sort_order          INT NOT NULL DEFAULT 0,
  scene_nummer        INT,           -- nullable für Non-Scene-Elemente (v52)
  scene_nummer_suffix VARCHAR(5),
  int_ext             TEXT DEFAULT 'INT',
  tageszeit           TEXT DEFAULT 'TAG',
  spieltag            INT,
  zusammenfassung     TEXT,          -- Oneliner aus Treatment-Kopf
  szeneninfo          TEXT,          -- Hinweiszeilen (Bild aus Block, Wechselschnitt-Info)
  content             JSONB DEFAULT '[]',  -- ProseMirror-JSON (Array von pm-Nodes)
  format              TEXT DEFAULT 'drehbuch',   -- 'drehbuch'|'storyline'|'notiz' (v43)
  stoppzeit_sek       INT,           -- aus dauer_sekunden (v43)
  geloescht           BOOLEAN DEFAULT false,      -- Soft-Delete (v43)
  updated_by          TEXT,
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  page_length         INT,           -- Seitenachtel (1 Seite = 8 Einheiten) (v57)
  sondertyp           TEXT CHECK (sondertyp IN ('wechselschnitt', 'stockshot', 'flashback')),  -- (v63)
  element_type        TEXT NOT NULL DEFAULT 'scene',  -- 'scene'|'cover'|'synopsis'|'memo' (v52)
  -- Sonderszenen-Felder (v63):
  stockshot_kategorie TEXT CHECK (stockshot_kategorie IN ('ortswechsel', 'zeit_vergeht', 'stimmungswechsel')),
  stockshot_stimmung  TEXT,
  stockshot_neu_drehen BOOLEAN DEFAULT false,
  flashback_referenz_id UUID REFERENCES scene_identities(id) ON DELETE SET NULL,
  UNIQUE(werkstufe_id, scene_identity_id)  -- eine Szene pro Werkstufe
);

-- wechselschnitt_partner (v63)
CREATE TABLE wechselschnitt_partner (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dokument_szene_id   UUID NOT NULL REFERENCES dokument_szenen(id) ON DELETE CASCADE,
  partner_identity_id UUID NOT NULL REFERENCES scene_identities(id) ON DELETE CASCADE,
  position            INT NOT NULL DEFAULT 0,
  UNIQUE (dokument_szene_id, partner_identity_id)
);

-- characters
CREATE TABLE characters (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name      TEXT NOT NULL,
  meta_json JSONB  -- { import_auto_created: true, is_komparse?: true, import_source: filename }
);

-- character_kategorien
CREATE TABLE character_kategorien (
  id            SERIAL PRIMARY KEY,
  produktion_id TEXT NOT NULL REFERENCES produktionen(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  typ           TEXT,   -- 'rolle' | 'komparse'
  sort_order    INT DEFAULT 0,
  UNIQUE (produktion_id, name)
);

-- character_productions
CREATE TABLE character_productions (
  character_id  UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  produktion_id TEXT NOT NULL REFERENCES produktionen(id) ON DELETE CASCADE,
  kategorie_id  INT REFERENCES character_kategorien(id),
  UNIQUE (character_id, produktion_id)
);

-- scene_characters (v39 + v45 spiel_typ)
CREATE TABLE scene_characters (
  scene_identity_id UUID NOT NULL REFERENCES scene_identities(id) ON DELETE CASCADE,
  character_id      UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  kategorie_id      INT REFERENCES character_kategorien(id),
  spiel_typ         TEXT,    -- 'o.t.' | 'spiel' | 'text'
  repliken_anzahl   INT DEFAULT 0,
  anzahl            INT DEFAULT 1,     -- Komparsen-Anzahl (z.B. 4 bei "4x Krankenpfleger")
  header_o_t        BOOLEAN DEFAULT false,  -- explizit "o.T." im Komparsen-Header
  werkstufe_id      UUID REFERENCES werkstufen(id),
  UNIQUE (werkstufe_id, scene_identity_id, character_id) WHERE werkstufe_id IS NOT NULL
);

-- drehorte (v50)
CREATE TABLE drehorte (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produktion_id TEXT NOT NULL REFERENCES produktionen(id) ON DELETE CASCADE,
  label         TEXT NOT NULL,
  sort_order    INT DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (produktion_id, label)
);

-- motive (v27 + v50 Hierarchie + v53 ist_studio)
CREATE TABLE motive (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produktion_id TEXT NOT NULL REFERENCES produktionen(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  typ           TEXT,    -- 'interior' | 'exterior'
  drehort_id    UUID REFERENCES drehorte(id),
  parent_id     UUID REFERENCES motive(id),  -- Hierarchie: Obermotiv → Untermotiv
  ist_studio    BOOLEAN DEFAULT true,
  meta_json     JSONB
);
```

### `content`-Feld-Format (JSONB)

Das `content`-JSONB ist ein **ProseMirror-JSON-Array**. Der Inhalt hängt von `format` und dem verwendeten Absatzformat-System ab:

**Ohne Absatzformate** (`useAbsatzNodes = false`):
```json
[
  { "type": "screenplay_element", "attrs": { "element_type": "action" },
    "content": [{ "type": "text", "text": "Status Quo: FIGUR_A steht in der Küche." }] },
  { "type": "screenplay_element", "attrs": { "element_type": "action" },
    "content": [{ "type": "text", "text": "FIGUR_B kommt herein." }] }
]
```

**Mit Absatzformaten** (`useAbsatzNodes = true`, wenn `absatzformate`-Tabelle befüllt):
```json
[
  { "type": "absatz",
    "attrs": { "format_id": "uuid-of-format", "format_name": "Haupttext" },
    "content": [{ "type": "text", "text": "Status Quo: FIGUR_A steht in der Küche." }] }
]
```

### Mapping `stage_type` → DB-Felder

| Import-Parameter `stage_type` | `werkstufen.typ` (docTyp) | `dokument_szenen.format` |
|---|---|---|
| `treatment` | `storyline` | `storyline` |
| `draft` | `drehbuch` | `drehbuch` |
| `expose` | `notiz` | `notiz` |
| `final` | `drehbuch` | `drehbuch` |

Rote-Rosen-Dokument `treatment` → auto-setzt `stage_type = 'treatment'` wenn nicht explizit übergeben.

### `ort_name`-Parsing für `motive`-Tabelle

```
"Stu. 02 / Wohngemeinschaft"      → drehortLabel="Stu. 02", motivName="Wohngemeinschaft"
"Außendreh / A. D. Pferdehof"     → drehortLabel="Außendreh", motivName="Pferdehof", isAD=true
"Stu. 02 / WG / Küche"            → drehortLabel="Stu. 02", motivName="WG", untermotivName="Küche"
"Pferdehof"                       → motivName="Pferdehof" (kein Drehort)
```

---

## Schritt 5 — Beispiel-Output (anonymisiert, konstruiert aus Code-Kenntnis)

```json
{
  "szenen": [
    {
      "nummer": 3,
      "int_ext": "INT",
      "tageszeit": "TAG",
      "ort_name": "Stu. 02 / Wohngemeinschaft",
      "zusammenfassung": "FIGUR_A erfährt von FIGUR_B, dass FIGUR_C das Haus verlassen will. Status quo: FIGUR_A und FIGUR_B wohnen seit Staffelbeginn zusammen.",
      "textelemente": [
        {
          "id": "te1716000000001_1",
          "type": "action",
          "text": "Status Quo: FIGUR_A und FIGUR_B wohnen seit Staffelbeginn zusammen."
        },
        {
          "id": "te1716000000001_2",
          "type": "action",
          "text": "FIGUR_A fragt überrascht nach, ob das wirklich stimmt. FIGUR_B bestätigt es zögernd und erklärt, FIGUR_C habe bereits gepackt."
        },
        {
          "id": "te1716000000001_3",
          "type": "direction",
          "text": "Anm.: Szene braucht starken emotionalen Abschluss."
        }
      ],
      "charaktere": ["FIGUR_A", "FIGUR_B"],
      "komparsen": [],
      "spieltag": 4,
      "dauer_sekunden": 114,
      "isWechselschnitt": false,
      "szeneninfo": "Bild aus Block 880"
    },
    {
      "nummer": 8,
      "int_ext": "INT",
      "tageszeit": "TAG",
      "ort_name": "Stu. 02 / Wohngemeinschaft",
      "zusammenfassung": "FIGUR_A und FIGUR_C telefonieren gleichzeitig — Wechselschnitt.",
      "textelemente": [
        {
          "id": "te1716000000002_1",
          "type": "action",
          "text": "WG: FIGUR_A hält ihr Handy ans Ohr."
        },
        {
          "id": "te1716000000002_2",
          "type": "shot",
          "text": "Pferdehof:"
        },
        {
          "id": "te1716000000002_3",
          "type": "action",
          "text": "FIGUR_C geht nervös auf dem Hof auf und ab."
        }
      ],
      "charaktere": ["FIGUR_A"],
      "komparsen": [],
      "spieltag": 4,
      "dauer_sekunden": 112,
      "isWechselschnitt": true,
      "wechselschnittPartner": [9],
      "szeneninfo": "Wechselschnitt mit Bild 4402.9"
    },
    {
      "nummer": 9,
      "int_ext": "EXT",
      "tageszeit": "TAG",
      "ort_name": "Außendreh / A. D. Pferdehof",
      "zusammenfassung": "FIGUR_C telefoniert auf dem Pferdehof.",
      "textelemente": [
        {
          "id": "te1716000000003_1",
          "type": "action",
          "text": "FIGUR_C hört die Nachricht und wirkt erschüttert."
        }
      ],
      "charaktere": ["FIGUR_C"],
      "komparsen": ["2x Stallburschen o.T."],
      "spieltag": 4,
      "dauer_sekunden": 70,
      "isWechselschnitt": true,
      "wechselschnittPartner": [8]
    }
  ],
  "nonSceneElements": [
    {
      "type": "titelseite",
      "label": "Titelseite",
      "content": "Staffel 24\nFolge 4402\nBlock 882\nAutor: AUTOR_NAME\nRegie: REGISSEUR_NAME\nDrehtermin: 15.07.2026\nSendetermin: 22.09.2026"
    },
    {
      "type": "synopsis",
      "label": "FOLGE 4402",
      "content": "FOLGE 4402\n\nFIGUR_A beginnt ihren Tag ahnungslos, während FIGUR_B..."
    },
    {
      "type": "recap",
      "label": "Recap",
      "content": "1. FIGUR_C hat in der letzten Folge erfahren, dass...\n2. FIGUR_A und FIGUR_B haben sich gestritten wegen..."
    }
  ],
  "meta": {
    "format": "rote-rosen-treatment",
    "total_scenes": 32,
    "total_textelemente": 89,
    "charaktere": ["FIGUR_A", "FIGUR_B", "FIGUR_C", "FIGUR_D"],
    "warnings": [],
    "roteRosenMeta": {
      "rote_rosen_format": true,
      "document_type": "treatment",
      "staffel": 24,
      "episode": 4402,
      "block": 882,
      "autor": "AUTOR_NAME",
      "regie": "REGISSEUR_NAME",
      "drehtermin": "15.07.2026",
      "sendetermin": "22.09.2026",
      "synopsis": "FIGUR_A beginnt ihren Tag...",
      "recaps": ["1. FIGUR_C hat in der letzten..."]
    }
  }
}
```

---

## Schritt 6 — Lücken und Erweiterungskandidaten

### Was aktuell NICHT geparst wird

#### 1. Strang-Codes im INT/EXT-Code (z.B. `E/T53`)

**Was im Material vorkommt:** `I/T53`, `E/N54` — die Zahl nach dem Tageszeitcode ist laut User ein
Episoden/Tag-Marker (z.B. "Tag 53 der Staffel" oder "Episode 53").

**Was der Parser tut:** Parst `I/T53` als `spieltag=53`. Das passt für fortlaufende Spieltage.
**Unklar:** Ist "53" hier Spieltag (laufende Nummer innerhalb der Produktion) oder etwas anderes
(z.B. Kalender-Tag, Drehtag, Block-Nummer)? Wenn mehrere Folgen Spieltag 53 haben, entsteht eine
semantische Kollision.
**Verloren geht:** Wenn die Zahl eine andere Bedeutung hat als fortlaufender Spieltag.

#### 2. Anschluss-Markierungen

**Was im Material vorkommt:** "Direkter Anschluss an 4486.32", "Flashback an..."

**Was der Parser tut:** "Bitte...Memo"-Zeilen und "Bild aus Block"-Zeilen gehen in `szeneninfo`.
Andere Anschluss-Hinweise im Fließtext werden als normale `action`-Textelemente erfasst oder
könnten verloren gehen, wenn sie in Header-Position auftauchen.

**Verloren geht:** Strukturierte Verlinkung zwischen Szenen (Scene-Referenz-Graph).

#### 3. NMDP-Marker

**Was im Material vorkommt:** Laut User tauchen `NMDP`-Markierungen auf.

**Was der Parser tut:** Keine spezielle Behandlung — würde als `action`-Textelement landen, wenn
im Fließtext, oder als Teil von `szeneninfo`, wenn in einer Hinweiszeile.

**Verloren geht:** Semantik vollständig. **Bedeutung der Abkürzung ist im Code nicht dokumentiert.**
Mögliche Interpretation: "Nicht mehr durch [Produktion/Producer]" oder "Neu/Möglicherweise Drehplan-Pflicht"
— **offene Frage**.

#### 4. Status-Quo-Blöcke als strukturiertes Feld

**Was im Material vorkommt:** Absätze die mit "Status Quo:" beginnen, als Hintergrund-Exposition
vor der eigentlichen Szenenhandlung.

**Was der Parser tut:** `TEXTBAUSTEIN_LINE_START_RE = /^(Status\s+[Qq]uo\s*:|Haupthandlung\s*:|Anmerkung(?:en)?\s*:)/i`
erzwingt einen Paragraph-Break an dieser Stelle. Der Text landet als normales `action`-Textelement.
Wenn Absatzformate konfiguriert sind, wird er über `textbaustein`-Matching einem Format zugewiesen.

**Verloren geht ohne Absatzformate:** Der Typ "Status Quo" ist nur als Textpräfix erkennbar,
kein eigenes strukturiertes Feld in `ParsedScene`.

#### 5. Haupthandlung / Nebenhandlung / Strang-Marker im Text

**Was im Material vorkommt:** "Haupthandlung:", "Nebenhandlung:", "Strang-Marker:"-Präfixe
im Treatment-Fließtext.

**Was der Parser tut:** Paragraph-Break-Erzwingung via `TEXTBAUSTEIN_LINE_START_RE` für
"Haupthandlung:" und "Anmerkung:"; kein Break für "Nebenhandlung:".

**Verloren geht:** Strukturierte Strang-Zuordnung. Es gibt zwar das Story-Strang-System in der DB
(`straenge`-Tabelle), aber der Parser befüllt es nicht automatisch.

#### 6. Komparsen-Detail im Treatment-Header

**Was im Material vorkommt:** "Komparsen: 4x PatientInnen o.T., 2x Ärzte mit Spiel"

**Was der Parser tut:** Komparsen werden als Roh-String-Array gespeichert (`komparsen[]`).
`parseKomparseEntry()` extrahiert Name/Anzahl/headerOT — aber dieses Parsing findet nur in
`/preview` und `/commit` statt, NICHT im `ParsedScene`-Objekt selbst.
Die `scene_characters`-Tabelle bekommt `spiel_typ`-Analyse via `analyzeInContent()`.

**Unklar:** Im Treatment gibt es keinen eigentlichen Dialog-Content zum Analysieren —
`analyzeInContent()` auf Treatment-Textelemente gibt meist `o.t.` zurück.

#### 7. Flashback-Referenzen

**Was im Material vorkommt:** "Flashback an Szene 4315.12"

**Was der Parser tut:** Kein strukturiertes Parsing. `sondertyp = 'flashback'` ist in der DB
vorgesehen, wird aber beim Import nur für explizit als Stockshot erkannte Szenen gesetzt.
`flashback_referenz_id` bleibt NULL.

#### 8. Mehrere Szenen-Nummern-Formate

Rote-Rosen-Format ist `NNNN.M` (Episode.Szene). Andere Formate (FDX, Fountain) haben andere
Szenen-Nummern-Schemata. Der `nummer`-Wert im `ParsedScene` enthält nur `M` (die Szenen-Nummer
innerhalb der Episode), nicht die vollständige `NNNN.M`-Referenz.

### Bekannte Bugs (nicht beheben, nur notieren)

1. **`scene_identities` Unique-Constraint fehlt bei Non-Scene-Elementen:** Non-Scene-Elemente
   bekommen eigene `scene_identities` ohne `folge_id`-FK-Validierung (wenn `folge_id` fehlt,
   wäre ein NULL möglich). In der Praxis passiert das nicht, da `folgeId` immer gesetzt ist.

2. **Spieltag-Semantik unklar:** `spieltag` aus `I/T53` könnte Spieltag oder Drehtag sein.
   Keine Validierung ob Wert realistisch ist (z.B. > 200 wäre ungewöhnlich für eine Folge).

3. **`isStockshotVerdacht` wird nicht in DB gespeichert:** Das Feld existiert in `ParsedScene`,
   aber in `/commit` wird nur `isStockshot` (nicht `isStockshotVerdacht`) geprüft für
   `sondertyp = 'stockshot'`. Szenen mit Verdacht landen ohne `sondertyp`.

---

## Schritt 7 — Zusammenfassung

### Datenmodell (TypeScript-Interface)

```typescript
interface ParsedScene {
  nummer: number                           // Pflicht
  int_ext: 'INT' | 'EXT' | 'INT/EXT'     // Pflicht
  tageszeit: 'TAG' | 'NACHT' | 'ABEND' | 'DÄMMERUNG'  // Pflicht
  ort_name: string                         // Pflicht
  zusammenfassung?: string                 // Oneliner aus Treatment-Kopf
  textelemente: Textelement[]              // Pflicht (kann leer sein)
  charaktere: string[]                     // Pflicht (kann leer sein)
  komparsen?: string[]                     // Roh-Strings "Nx Name o.T."
  spieltag?: number                        // Aus I/T{n}
  dauer_sekunden?: number                  // Aus "MM:SS"
  isWechselschnitt?: boolean
  wechselschnittPartner?: number[]         // Szenen-Nummern
  isStockshot?: boolean                    // Keyword-erkannt
  isStockshotVerdacht?: boolean            // Heuristisch (NICHT in DB)
  szeneninfo?: string                      // Hinweiszeilen aus Header
}

interface Textelement {
  id: string              // "te{timestamp}_{counter}"
  type: 'action' | 'dialogue' | 'character' | 'parenthetical'
       | 'transition' | 'shot' | 'direction' | 'general' | 'heading'
  text: string
  character?: string      // Nur bei character/dialogue/parenthetical
  richContent?: InlineNode[]
  textAlign?: 'left' | 'center' | 'right'
}
```

### DDL der Persistenz-Tabellen (gekürzt, nur Import-relevante Felder)

```sql
-- Hierarchie: produktionen → folgen → werkstufen → dokument_szenen
--                                                ← scene_identities (stabil über Fassungen)

CREATE TABLE werkstufen (
  id UUID PK, folge_id INT FK, typ TEXT,
  version_nummer INT, label TEXT, stand_datum DATE,
  datei_hash TEXT, original_dateiname TEXT
);

CREATE TABLE scene_identities (
  id UUID PK, folge_id INT FK
);

CREATE TABLE dokument_szenen (
  id UUID PK, werkstufe_id UUID FK, scene_identity_id UUID FK nullable,
  sort_order INT, scene_nummer INT nullable,
  int_ext TEXT, tageszeit TEXT, ort_name TEXT, spieltag INT,
  zusammenfassung TEXT, szeneninfo TEXT,
  content JSONB,       -- ProseMirror-JSON
  format TEXT,         -- 'drehbuch'|'storyline'|'notiz'
  stoppzeit_sek INT, page_length INT,
  sondertyp TEXT,      -- 'wechselschnitt'|'stockshot'|'flashback'
  element_type TEXT,   -- 'scene'|'cover'|'synopsis'|'memo'
  geloescht BOOLEAN
);

CREATE TABLE wechselschnitt_partner (
  dokument_szene_id UUID FK, partner_identity_id UUID FK, position INT
);

CREATE TABLE scene_characters (
  scene_identity_id UUID FK, character_id UUID FK, werkstufe_id UUID FK,
  spiel_typ TEXT,      -- 'o.t.'|'spiel'|'text'
  repliken_anzahl INT, anzahl INT, header_o_t BOOLEAN
);
```

### Top 3 Erweiterungs-Kandidaten

1. **NMDP-Marker** — Bedeutung klären und als Boolean-Flag in `ParsedScene` + Spalte in
   `dokument_szenen` aufnehmen. Hoher Wert für Produktionsplanung.

2. **Strang-Codes automatisch zu `strang_beats` verlinken** — Die geparsten
   `wechselschnittPartner[]` und der `ort_name` könnten beim Import direkt Strang-Zuweisungen
   vorschlagen (Textbaustein-Matching "Haupthandlung:" → Haupt-Strang).

3. **Anschluss-Referenzen strukturiert erfassen** — "Direkter Anschluss an 4486.32" und
   "Flashback an 4315.12" als FK `anschluss_referenz_id UUID → scene_identities` speichern,
   statt als Freitext in `szeneninfo`. Ermöglicht Szenen-Graph-Traversal.

---

## Offene Fragen

1. **NMDP** — Was bedeutet diese Abkürzung? Wo taucht sie im Treatment-PDF auf — im Szenen-Kopf
   als separates Feld, als Textmarker im Fließtext, oder als Annota­tion in der Seitenrandnummerierung?

2. **Strang-Codes `I/T53`** — Ist die Zahl der fortlaufende Spieltag der Produktion
   (= Tag 53 der Staffel-Dreharbeiten), oder codiert sie etwas anderes (Folgen-Woche, Drehtag)?
   Wenn mehrere Episoden denselben "53" haben können, ist `spieltag=53` in `dokument_szenen` mehrdeutig.

3. **Komparsen-Analyse im Treatment** — `analyzeInContent()` prüft Dialog-Elemente auf Figurnamen.
   Im Treatment gibt es keinen echten Dialog (nur `action`-Elemente) — sollte `spiel_typ` bei
   Treatment-Import immer auf `'spiel'` oder `'o.t.'` gemappt werden, oder explizit auf `null`?

4. **`isStockshotVerdacht` nicht in DB** — Soll das als separater Boolean in `dokument_szenen`
   aufgenommen werden, damit Redakteure heuristische Verdachts-Szenen in der UI prüfen können?
