# Script-App: Figuren-Autovervollständigung, NT-Handling & Freigabeprozess

Dieses Dokument beschreibt das technische Konzept und den Datenbankaufbau für drei zusammenhängende Systeme in der Script-App:
- Autovervollständigung von Figurennamen im Editor
- Behandlung von NT/VO/OFF/ONE-WAY-Suffixen
- Freigabeprozess für neue Rollen

---

## 1. Autovervollständigung der Figurennamen (CharAC)

### Überblick

Die Autovervollständigung greift wenn sich der Cursor in einem **CHARACTER-Absatzformat-Node** befindet (oder einem `screenplay_element` vom Typ `character`). Sie schlägt Figurennamen aus einer Pool-Liste vor.

Es gibt zwei Modi (`tweaks.charAcStyle`):
- `'inline'` — Ghost-Text: Der Vorschlag erscheint als ausgegrauer Inline-Text direkt nach dem Cursor
- `'menu'` — Dropdown-Menü unter der aktuellen Zeile

### Inline Ghost-Text (Standard-Modus)

**ProseMirror Plugin** (`inlineGhostPlugin` — Modul-Ebene in `UniversalEditor.tsx`):

```
PluginKey: 'inlineGhostText'
State: { suffix: string, pos: number }
```

Der Plugin-State wird bei jeder Dokumentänderung (`docChanged`) automatisch geleert. Bei `setMeta(inlineGhostKey, { suffix, pos })` speichert er den neuen Zustand und rendert eine `Decoration.widget` an Position `pos` mit `side: 1` (also nach dem letzten Zeichen im Node):

```html
<span style="color: var(--text-secondary, #aaa); pointer-events: none; user-select: none;">
  {{ ghostSuffix }}
</span>
```

**CSS-Wichtigkeit**: Das CHARACTER-Format hat `text-transform: uppercase` in `generateAbsatzCSS()`. Diese CSS-Eigenschaft vererbt sich auf den Ghost-Widget-Span — deshalb erscheint der Ghost automatisch in Großbuchstaben, auch wenn `ghostSuffix` lowercase gespeichert ist.

### Daten-Flow der Figuren-Pool

```
SceneEditor.tsx
  └── api.getSceneIdentityCharacters(scene_identity_id)
        → setzt sceneChars (scene_characters + characters)
        → feuert onCharsChange() nach oben

ScriptPage.tsx (DockedEditorPanels)
  └── handleCharsChange(chars)
        → filtert Komparsen heraus (kategorie_typ !== 'komparse')
        → baut sceneCharNames: string[] (nur Namen)
        → leert bei jedem Szenenwechsel: useEffect([selectedSzeneId])

EditorPanel.tsx
  └── sceneCharNames={sceneCharNames} → prop an UniversalEditor

UniversalEditor.tsx
  ├── wenn nurCharAusSzenenkopf === 'szenenkopf': pool = sceneCharNames
  └── wenn nurCharAusSzenenkopf === 'alle': pool = allCharObjsRef.current (names)
        ← geladen via GET /api/characters?produktion_id=X beim Produktionswechsel
```

### Update-Logik (vereinfacht aus UniversalEditor.tsx)

```typescript
// Im useEffect registriert auf editor.on('selectionUpdate') + editor.on('update')
function update() {
  const { $from } = editor.state.selection
  const node = $from.node()

  // Nur in CHARACTER-Nodes aktiv
  const isCharNode =
    node.type.name === 'absatz' && charFormatIds.includes(node.attrs.format_id) ||
    node.type.name === 'screenplay_element' && node.attrs.element_type === 'character'
  if (!isCharNode) { /* Ghost löschen, acActive=false */ return }

  // Rohtext des Nodes → Suffix herausparsen
  const rawText = node.textContent
  const { name: queryClean, suffix: detectedSuffix } = parseSuffix(rawText)
  detectedSuffixRef.current = detectedSuffix

  // Pool durchsuchen (case-insensitive Prefix-Match)
  const queryUpper = queryClean.toUpperCase()
  const pool = /* sceneCharNames oder allCharObjsRef */
  const bestMatch = pool.find(n => n.toUpperCase().startsWith(queryUpper))

  if (!queryClean) { resetInline(); return }
  if (suppressGhostUpdateRef.current) { suppressGhostUpdateRef.current = false; return }

  if (bestMatch) {
    // Ghost = Suffix des gefundenen Namens nach dem bereits eingetippten Teil
    const ghostSuffix = bestMatch.slice(queryClean.length)  // case-preserving
    inlineGhostAcceptNameRef.current = bestMatch
    inlineGhostNoMatchNameRef.current = null
    inlineGhostActiveRef.current = true
    setGhost(ghostSuffix, nodeEndPos)
  } else {
    // Kein Treffer → Dialog zum Neu-Anlegen anbieten
    inlineGhostNoMatchNameRef.current = queryClean
    inlineGhostAcceptNameRef.current = null
    inlineGhostActiveRef.current = true
    setGhost('', nodeEndPos)  // kein Ghost-Text, aber Modus aktiv
  }
}
```

**`setGhost(suffix, pos)`** — dispatcht eine Meta-Transaktion, geschützt durch `dispatchingGhostRef` gegen Rekursion:
```typescript
if (dispatchingGhostRef.current) return
if (same suffix+pos already set) return  // Dedup
dispatchingGhostRef.current = true
editor.view.dispatch(editor.state.tr.setMeta(inlineGhostKey, { suffix, pos }))
dispatchingGhostRef.current = false
```

### Keyboard-Handling

**`charAcKeyExtension`** (höchste Priorität, zuletzt in der Extensions-Liste):

| Taste | Bedingung | Aktion |
|-------|-----------|--------|
| `Tab` | `inlineGhostActiveRef.current === true` | Ruft `onAccept()` auf; return `opensDialog` (false wenn Accept-Name vorhanden → Tab fällt durch zu AbsatzExtension für Formatwechsel) |
| `Enter` | wie Tab | Wie Tab |
| `Escape` | `inlineGhostActiveRef.current === true` | `onDismiss()` → Ghost löschen |
| `ArrowUp/Down` | `acActiveRef.current === true` | Menü-Navigation (nur Menu-Modus) |

**Wichtig — Tab-Priorisierung**: Wenn ein Ghost-Name akzeptiert wird (`inlineGhostAcceptNameRef.current !== null`), gibt `charAcKeyExtension` `false` zurück — damit `AbsatzExtension.Tab` danach den Formatwechsel (Character → Action per `tab_next_format`) durchführen kann.

### Acceptance (`onAccept` im Inline-Modus)

```typescript
function acceptInline() {
  suppressGhostUpdateRef.current = true  // verhindert Tab-Loop
  const name = inlineGhostAcceptNameRef.current
  const suffix = detectedSuffixRef.current ?? sceneSuffixMemoryRef.current.get(name.toUpperCase()) ?? null
  insertNameIntoEditor(name, suffix)
}

function insertNameIntoEditor(name: string, suffix: string | null) {
  // Vollständigen Text: Name + Suffix zusammensetzen
  const fullText = suffix ? `${name} ${suffix}` : name
  // Node-Inhalt komplett ersetzen (deleteRange + insertContentAt)
  editor.chain()
    .deleteRange({ from: nodeStart, to: nodeEnd })
    .insertContentAt(nodeStart, fullText)
    .run()
}
```

**Suffix-Memory** (`sceneSuffixMemoryRef`): Nach jeder erfolgreichen Acceptance mit Suffix wird `sceneSuffixMemoryRef.current.set(name.toUpperCase(), suffix)` gesetzt. Beim nächsten Auftreten desselben Namens in der Szene wird der zuletzt verwendete Suffix automatisch vorausgefüllt.

### Auto-Acceptance bei Cursor-Verlassen

`wasInCharNodeRef` trackt ob der Cursor zuletzt in einem CHARACTER-Node war. Wenn der Cursor den NODE verlässt und ein Ghost aktiv war, wird automatisch accepted (falls `inlineGhostAcceptNameRef.current` gesetzt). Das ermöglicht: Pfeil-Taste → nächste Zeile → Name wurde übernommen.

---

## 2. NT/Suffix-Handling

### Die vier Suffixe

| Kürzel | Canonical Form | Bedeutung | NT-Eintrag? |
|--------|---------------|-----------|-------------|
| `(NT)` | `(NT)` | Nachton (Stimme, nicht sichtbar) | Ja → `nt_typ='stimme'` |
| `(VO)` | `(VO)` | Voice-Over | Ja → `nt_typ='vo'` |
| `(OFF)` | `(OFF)` | Off-Screen / Aus dem Off | Ja → `nt_typ='stimme'` (NT-Aufnahme nötig) |
| `(ONE-WAY)` | `(ONE-WAY)` | Einseitiges Gespräch (kein NT) | Nein |

### `parseSuffix()` (Frontend)

```typescript
// UniversalEditor.tsx, ab Zeile 85
const CHAR_SUFFIX_PATTERNS = [
  { pattern: /(?:^|\s)\(?\s*one[-\s]?way\s*\)?$/i, canonical: '(ONE-WAY)' },
  { pattern: /(?:^|\s)\(?\s*v\.?o\.?\s*\)?$/i,     canonical: '(VO)' },
  { pattern: /(?:^|\s)\(?\s*n\.?t\.?\s*\)?$/i,     canonical: '(NT)' },
  { pattern: /(?:^|\s)\(?\s*(?:off|o\.s\.?)\s*\)?$/i, canonical: '(OFF)' },
]

function parseSuffix(text: string): { name: string; suffix: string | null }
// Beispiele:
// "BRITTA (NT)" → { name: "BRITTA", suffix: "(NT)" }
// "JAN nt"     → { name: "JAN",    suffix: "(NT)" }
// "TONI"       → { name: "TONI",   suffix: null   }
```

Das Frontend-Parsing läuft **ständig während der Eingabe**: Der eingetippte Text wird vor dem Pool-Vergleich durch `parseSuffix` gejagt, damit `queryClean` = reiner Name ohne Suffix für den Abgleich genutzt wird. Der detektierte Suffix wird in `detectedSuffixRef` gespeichert und beim Acceptance wieder angehängt.

### `parseSuffixServer()` (Backend)

Identische Logik in `backend/src/routes/nt-eintraege.ts` — spiegelt das Frontend. Wird beim serverseitigen Content-Scan genutzt.

### Szenen-Suffix-Memory

`sceneSuffixMemoryRef` ist eine `Map<string (NAME_UPPER), string (Suffix)>` — wird beim Szenenwechsel nicht geleert (bleibt für die aktuelle Sitzung). Wenn eine Figur in Szene 5 als `(NT)` eingetragen wurde und in Szene 6 neu eingegeben wird, schlägt die AC automatisch `NAME (NT)` vor.

### NT-Einträge: Server-seitiger Auto-Upsert

**Trigger**: Nach jedem `PUT /api/dokument-szenen/:id` (Szenen-Speicherung) ruft das Backend `autoUpsertNtEintraege(szeneId, content, userId, userName)` auf.

**Ablauf**:
1. Szenen-Metadaten laden (scene_identity_id, werkstufe_id, folge_id, produktion_id)
2. `extractNtCharacters(content, charFormatIds, diagFormatIds)` — scannt alle Nodes im ProseMirror-JSON
3. Für jeden NT/VO/OFF-Charakter: Figur in `characters` + `character_productions` nachschlagen oder neu anlegen
4. `nt_eintraege` upserten (ON CONFLICT auf `character_id, scene_identity_id, werkstufe_id`)
5. Figuren die nicht mehr NT/VO sind → `veraltet = TRUE` (Soft-Delete, nie Hard-Delete wegen Dispo-Verknüpfungen)

**`extractNtCharacters`** erkennt:
- Jede CHARACTER-Node (absatz mit Character-Format oder `screenplay_element[character]`)
- Zugehörige DIALOGUE-Nodes (für `repliken_text`)
- Wenn eine Figur NUR mit `(OFF)` vorkommt → `nt_typ='stimme'` (NT-Aufnahme trotzdem nötig)
- `(ONE-WAY)` → kein NT-Eintrag

---

## 3. Freigabeprozess für neue Rollen

### Konzept

Wenn eine **neue Figur** im Editor (via NT-Suffix oder manuell) verwendet wird, die noch nicht in der Rollendatenbank der Produktion existiert, kann optional ein **Genehmigungsworkflow** gestartet werden.

Die Konfiguration ist **pro Produktion** und **optional** (`freigabe_aktiv = FALSE` → alles sofort freigegeben).

### Status-Werte auf `character_productions.freigabe_status`

| Wert | Bedeutung |
|------|-----------|
| `'keine'` | Freigabe nicht aktiviert oder nicht nötig |
| `'ausstehend'` | Anfrage gestellt, warte auf Genehmiger |
| `'freigegeben'` | Mindestens alle obligatorischen Genehmiger haben zugestimmt |
| `'abgelehnt'` | Mindestens ein Genehmiger hat abgelehnt |
| `'zurueckgezogen'` | Antragsteller hat die Anfrage zurückgezogen |

### Entscheidungs-Logik (`recalcAnfrageStatus`)

```
WENN irgendein Genehmiger abgelehnt hat → 'abgelehnt'
SONST WENN alle obligatorischen Genehmiger freigegeben haben → 'freigegeben'
SONST → 'ausstehend'
```

Optionale Genehmiger (`ist_obligatorisch = FALSE`) können Feedback geben, blockieren aber nicht.

### Workflow-Ablauf

```
1. Neue Figur wird erkannt (NT-Suffix im Editor gespeichert)
        ↓
2. autoCreateCharacterForNT():
   - characters: INSERT (oder vorhanden?)
   - character_productions: INSERT (idempotent)
   - starteFreigabeAnfrage() aufrufen
        ↓
3. starteFreigabeAnfrage():
   - rollen_freigabe_konfiguration laden
   - WENN freigabe_aktiv = FALSE → freigabe_status = 'keine', RETURN
   - WENN keine Genehmiger konfiguriert → freigabe_status = 'keine', RETURN
   - rollen_freigabe_anfragen: UPSERT (status = 'ausstehend')
   - character_productions.freigabe_status = 'ausstehend'
   - Für jeden Genehmiger: 2 Token erzeugen (freigeben + ablehnen, je 32 Byte hex)
   - rollen_freigabe_genehmiger_status: UPSERT (Token, gültig 7 Tage)
   - E-Mail mit 2 Buttons an jeden Genehmiger senden
        ↓
4. Genehmiger klickt Link in E-Mail:
   - GET /api/public/freigabe/:token → zeigt Rollenname + Produktionsbezug
   - POST /api/public/freigabe/:token/entscheiden → setzt entschieden = 'freigegeben'|'abgelehnt'
   - recalcAnfrageStatus() → aktualisiert Gesamt-Status + character_productions.freigabe_status
        ↓
5. ALTERNATIV: DK-Override in der App:
   - POST /api/rollen-freigabe/:productionId/anfragen/:id/freigeben  (requireDkAccess)
   - POST /api/rollen-freigabe/:productionId/anfragen/:id/ablehnen   (requireDkAccess)
   - POST /api/rollen-freigabe/:productionId/anfragen/:id/erneut-anfragen (neue Token)
   - POST /api/rollen-freigabe/:productionId/anfragen/:id/erinnerung (Erinnerungsmail)
```

### E-Mail-Template

- Subject: `Freigabe erbeten: Neue Rolle „{name}"`
- Enthält: Rollenname, Produktion, Szenenkontext (Folge, Werkstufe, Szenen-Nr, Motiv, I/A), Link zurück zur Szene in der App
- Zwei Buttons: "Rolle freigeben" (schwarzer Button) / "Ablehnen" (grauer Button)
- Links sind 7 Tage gültig, Einmal-Verwendung
- Bei erneutem Anfragen: gelber Hinweis-Block mit Notiz des Antragstellers

### Token-Format

Ein Token-Eintrag in `rollen_freigabe_genehmiger_status.token` enthält beide Token kombiniert:
```
{hex32}:freigeben,{hex32}:ablehnen
```
Das Backend sucht via `LIKE '%{token}%'` und ermittelt dann den Entscheidungstyp aus dem Parsing.

---

## 4. Datenbankschema

### Kernstruktur Figuren

```sql
-- Globale Figuren-Tabelle (produktionsübergreifend)
characters (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  meta_json   JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
)
-- Index: idx_characters_name ON characters(name)

-- Produktions-spezifische Daten pro Figur
character_productions (
  character_id     UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  produktion_id    TEXT NOT NULL REFERENCES produktionen(id) ON DELETE CASCADE,
  rollen_nummer    INT,         -- Unique per Produktion (wenn nicht NULL)
  komparsen_nummer INT,         -- Unique per Produktion (wenn nicht NULL)
  kategorie_id     INT REFERENCES character_kategorien(id) ON DELETE SET NULL,
  darsteller_name  TEXT,        -- Schauspieler-Name (frei)
  is_active        BOOLEAN DEFAULT TRUE,
  freigabe_status  TEXT DEFAULT 'keine',
  -- 'keine' | 'ausstehend' | 'freigegeben' | 'abgelehnt'
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (character_id, produktion_id)
)

-- Kategorien (Hauptrolle / Episodenrolle / Komparse etc.) — pro Produktion
character_kategorien (
  id            SERIAL PRIMARY KEY,
  produktion_id TEXT NOT NULL REFERENCES produktionen(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  typ           TEXT NOT NULL CHECK (typ IN ('rolle', 'komparse')),
  sort_order    INT DEFAULT 0,
  UNIQUE (produktion_id, name)
)
-- Default-Kategorien bei Neuanlage:
--   'Hauptrolle' (rolle), 'Episoden-Rolle' (rolle),
--   'Kleines Fach' (rolle), 'Komparse o.T.' (komparse)

-- Figuren in Szenen (N:M)
scene_characters (
  id                  SERIAL PRIMARY KEY,
  scene_identity_id   UUID REFERENCES scene_identities(id) ON DELETE CASCADE,  -- neues Modell
  szene_id            INT,   -- legacy (veraltet, nicht mehr befüllen)
  character_id        UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  kategorie_id        INT REFERENCES character_kategorien(id) ON DELETE SET NULL,
  anzahl              INT NOT NULL DEFAULT 1,
  ist_gruppe          BOOLEAN NOT NULL DEFAULT FALSE,
  werkstufe_id        UUID REFERENCES werkstufen(id),
  UNIQUE (scene_identity_id, character_id) WHERE scene_identity_id IS NOT NULL
)
```

### Rollenprofil-Felder (konfigurierbar)

```sql
-- Feld-Konfiguration pro Produktion/Staffel
charakter_felder_config (
  id          SERIAL PRIMARY KEY,
  staffel_id  TEXT NOT NULL REFERENCES staffeln(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  typ         TEXT NOT NULL DEFAULT 'text',  -- text | richtext | select | link | date | number | character_ref
  optionen    JSONB DEFAULT '[]',            -- für 'select'-Felder
  sort_order  INT DEFAULT 0,
  gilt_fuer   TEXT NOT NULL DEFAULT 'alle', -- 'alle' | 'rolle' | 'komparse'
  UNIQUE (staffel_id, name, gilt_fuer)
)

-- Standard-Felder (v33): Alter, Geburtsort, Familienstand, Eltern,
-- Kinder/Verwandte, Beruf, Typ (richtext), Charakter (richtext),
-- Aussehen/Stil, Dramaturgische Funktion, Stärken, Schwächen,
-- Verletzungen/Wunden, Ticks/Leidenschaften, Wünsche/Ziele,
-- Was braucht die Figur wirklich, Anbindung an den Cast, Wesen

-- Feldwerte
charakter_feldwerte (
  id           SERIAL PRIMARY KEY,
  character_id UUID REFERENCES characters(id) ON DELETE CASCADE,
  motiv_id     UUID REFERENCES motive(id) ON DELETE CASCADE,
  feld_id      INT NOT NULL REFERENCES charakter_felder_config(id) ON DELETE CASCADE,
  wert_text    TEXT,
  wert_json    JSONB,
  CHECK (character_id IS NOT NULL OR motiv_id IS NOT NULL)
)

-- Links zwischen Feldern (für character_ref-Typ)
charakter_feld_links (
  id             SERIAL PRIMARY KEY,
  character_id   UUID REFERENCES characters(id) ON DELETE CASCADE,
  feld_id        INT REFERENCES charakter_felder_config(id) ON DELETE CASCADE,
  linked_char_id UUID REFERENCES characters(id) ON DELETE CASCADE
)

-- Beziehungen zwischen Figuren
charakter_beziehungen (
  id                   SERIAL PRIMARY KEY,
  character_id         UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  related_character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  beziehungstyp        TEXT NOT NULL,
  label                TEXT,
  UNIQUE (character_id, related_character_id, beziehungstyp)
)

-- Fotos
charakter_fotos (
  id              SERIAL PRIMARY KEY,
  character_id    UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  dateiname       TEXT NOT NULL,
  originalname    TEXT NOT NULL,
  thumbnail_dateiname TEXT,
  media_typ       TEXT,
  label           TEXT,
  sort_order      INT DEFAULT 0,
  ist_primaer     BOOLEAN DEFAULT FALSE,
  hochgeladen_am  TIMESTAMPTZ DEFAULT NOW()
)
```

### NT-Einträge

```sql
nt_eintraege (
  id                SERIAL PRIMARY KEY,
  produktion_id     TEXT NOT NULL,
  character_id      UUID NOT NULL REFERENCES characters(id),
  szene_id          UUID REFERENCES dokument_szenen(id),
  scene_identity_id UUID REFERENCES scene_identities(id),
  werkstufe_id      UUID REFERENCES werkstufen(id),
  folge_id          INT REFERENCES folgen(id),
  nt_typ            TEXT NOT NULL,  -- 'stimme' | 'vo' | 'telefon'
  repliken_text     TEXT,           -- Replikentext für NT-Aufnahme
  notiz             TEXT,           -- manuelle Anmerkung
  veraltet          BOOLEAN NOT NULL DEFAULT FALSE,  -- Soft-Delete
  erstellt_am       TIMESTAMPTZ DEFAULT NOW(),
  aktualisiert_am   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (character_id, scene_identity_id, werkstufe_id)
)
```

### Freigabe-Workflow Tabellen

```sql
-- Konfiguration pro Produktion
rollen_freigabe_konfiguration (
  id                    SERIAL PRIMARY KEY,
  production_id         TEXT NOT NULL REFERENCES produktionen(id) ON DELETE CASCADE,
  freigabe_aktiv        BOOLEAN NOT NULL DEFAULT FALSE,
  erinnerung_nach_tagen INTEGER NOT NULL DEFAULT 3,
  erstellt_am           TIMESTAMPTZ DEFAULT NOW(),
  geaendert_am          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (production_id)
)

-- Genehmiger-Liste pro Produktion
rollen_freigabe_genehmiger (
  id               SERIAL PRIMARY KEY,
  production_id    TEXT NOT NULL REFERENCES produktionen(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  email            TEXT NOT NULL,
  ist_obligatorisch BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  erstellt_am      TIMESTAMPTZ DEFAULT NOW()
)

-- Eine Freigabe-Anfrage pro Figur+Produktion (UNIQUE Constraint)
rollen_freigabe_anfragen (
  id                        SERIAL PRIMARY KEY,
  character_id              UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  production_id             TEXT NOT NULL REFERENCES produktionen(id) ON DELETE CASCADE,
  beantragt_von_user_id     TEXT NOT NULL,
  beantragt_von_name        TEXT,
  beantragt_am              TIMESTAMPTZ DEFAULT NOW(),
  status                    TEXT NOT NULL DEFAULT 'ausstehend',
  -- 'ausstehend' | 'freigegeben' | 'abgelehnt' | 'zurueckgezogen'
  entschieden_am            TIMESTAMPTZ,
  entschieden_von_user_id   TEXT,
  notiz                     TEXT,          -- Ablehnungsgrund
  erneut_anfrage_notiz      TEXT,          -- Hinweis bei erneutem Anfragen
  szene_id                  UUID,          -- Kontext: aus welcher Szene
  folge_nummer              INT,           -- Kontext: Folge
  UNIQUE (character_id, production_id)
)

-- Status pro Genehmiger pro Anfrage
rollen_freigabe_genehmiger_status (
  id                SERIAL PRIMARY KEY,
  anfrage_id        INTEGER NOT NULL REFERENCES rollen_freigabe_anfragen(id) ON DELETE CASCADE,
  genehmiger_id     INTEGER NOT NULL REFERENCES rollen_freigabe_genehmiger(id) ON DELETE CASCADE,
  token             TEXT UNIQUE,            -- Format: "{hex}:freigeben,{hex}:ablehnen"
  token_gueltig_bis TIMESTAMPTZ,
  entschieden       TEXT,                   -- NULL | 'freigegeben' | 'abgelehnt'
  entschieden_am    TIMESTAMPTZ,
  UNIQUE (anfrage_id, genehmiger_id)
)
```

### Absatzformate (relevant für AC-Kontext-Erkennung)

```sql
absatzformate (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produktion_id     TEXT NOT NULL REFERENCES produktionen(id) ON DELETE CASCADE,
  preset_id         UUID REFERENCES absatzformat_presets(id),
  name              TEXT NOT NULL,          -- 'Character', 'Action', 'Dialogue', etc.
  kuerzel           TEXT,
  textbaustein      TEXT,                   -- z.B. "INT." für Scene Heading
  font_family       TEXT NOT NULL DEFAULT 'Courier New',
  font_size         NUMERIC NOT NULL DEFAULT 12,
  bold              BOOLEAN NOT NULL DEFAULT FALSE,
  italic            BOOLEAN NOT NULL DEFAULT FALSE,
  underline         BOOLEAN NOT NULL DEFAULT FALSE,
  uppercase         BOOLEAN NOT NULL DEFAULT FALSE,  -- CHARACTER = TRUE
  text_align        TEXT NOT NULL DEFAULT 'left',
  margin_left       NUMERIC NOT NULL DEFAULT 0,
  margin_right      NUMERIC NOT NULL DEFAULT 0,
  space_before      NUMERIC NOT NULL DEFAULT 0,
  space_after       NUMERIC NOT NULL DEFAULT 0,
  line_height       NUMERIC NOT NULL DEFAULT 1,
  enter_next_format UUID REFERENCES absatzformate(id),  -- welches Format nach Enter
  tab_next_format   UUID REFERENCES absatzformate(id),  -- welches Format nach Tab
  sort_order        INT NOT NULL DEFAULT 0,
  ist_standard      BOOLEAN NOT NULL DEFAULT FALSE,
  kategorie         TEXT NOT NULL DEFAULT 'drehbuch',
  UNIQUE (produktion_id, name)
)
```

---

## 5. Backend-API-Übersicht

### Figuren (characters.ts)

| Methode | Pfad | Beschreibung |
|---------|------|-------------|
| GET | `/api/characters?produktion_id=X` | Alle Figuren einer Produktion |
| POST | `/api/characters` | Neue globale Figur anlegen + optional Produktion verknüpfen |
| GET | `/api/characters/search?q=X` | Globale Suche (ILIKE) |
| PUT | `/api/characters/:id` | Name/Meta ändern |
| DELETE | `/api/characters/:id` | Global löschen (alle Produktions-Links) |
| POST | `/api/characters/:id/productions` | Figur mit Produktion verknüpfen |
| PUT | `/api/characters/:id/productions/:prodId` | Produktions-Daten (Nummer, Darsteller, Kategorie) ändern |
| DELETE | `/api/characters/:id/productions/:prodId` | Produktions-Verknüpfung aufheben |
| POST | `/api/characters/:id/aktivieren` | `is_active = TRUE` setzen |
| GET | `/api/characters/:id/beziehungen` | Beziehungen laden |
| POST | `/api/characters/:id/beziehungen` | Beziehung anlegen |
| DELETE | `/api/characters/:id/beziehungen/:relId` | Beziehung löschen |

### Kategorien

| Methode | Pfad | Beschreibung |
|---------|------|-------------|
| GET | `/api/produktionen/:id/character-kategorien` | Alle Kategorien der Produktion |
| POST | `/api/produktionen/:id/character-kategorien` | Kategorie anlegen |
| PATCH | `/api/produktionen/:id/character-kategorien/reorder` | Reihenfolge ändern |
| PUT | `/api/produktionen/:id/character-kategorien/:katId` | Kategorie bearbeiten |
| DELETE | `/api/produktionen/:id/character-kategorien/:katId` | Kategorie löschen |

### Freigabe (rollen-freigabe.ts)

| Methode | Pfad | Auth | Beschreibung |
|---------|------|------|-------------|
| GET | `/api/rollen-freigabe/:prodId/config` | Auth | Konfiguration laden |
| PUT | `/api/rollen-freigabe/:prodId/config` | DK | Konfiguration speichern |
| GET | `/api/rollen-freigabe/:prodId/genehmiger` | Auth | Genehmiger-Liste |
| POST | `/api/rollen-freigabe/:prodId/genehmiger` | DK | Genehmiger hinzufügen |
| PUT | `/api/rollen-freigabe/:prodId/genehmiger/:id` | DK | Genehmiger bearbeiten |
| DELETE | `/api/rollen-freigabe/:prodId/genehmiger/:id` | DK | Genehmiger entfernen |
| GET | `/api/rollen-freigabe/:prodId/anfragen` | Auth | Alle Anfragen |
| POST | `/api/rollen-freigabe/:prodId/anfragen` | Auth | Neue Anfrage stellen |
| POST | `/api/rollen-freigabe/:prodId/anfragen/:id/freigeben` | DK | Override: freigeben |
| POST | `/api/rollen-freigabe/:prodId/anfragen/:id/ablehnen` | DK | Override: ablehnen |
| POST | `/api/rollen-freigabe/:prodId/anfragen/:id/zurueckziehen` | Auth | Anfrage zurückziehen |
| POST | `/api/rollen-freigabe/:prodId/anfragen/:id/erinnerung` | DK | Erinnerungsmail senden |
| POST | `/api/rollen-freigabe/:prodId/anfragen/:id/erneut-anfragen` | DK | Anfrage neu stellen |
| GET | `/api/public/freigabe/:token` | Kein Auth | Token-Info (E-Mail-Link) |
| POST | `/api/public/freigabe/:token/entscheiden` | Kein Auth | Entscheidung via E-Mail |

### NT-Einträge (nt-eintraege.ts)

| Methode | Pfad | Beschreibung |
|---------|------|-------------|
| GET | `/api/nt-eintraege?produktion_id=X[&folge_id=Y][&nt_typ=Z][&veraltet=false]` | NT-Liste |
| GET | `/api/nt-eintraege/:id` | Einzelner Eintrag |
| PATCH | `/api/nt-eintraege/:id` | Notiz/nt_typ manuell ändern |
| GET | `/api/nt-eintraege/statistik/overview?produktion_id=X` | Übersicht + pro Figur |

NT-Einträge werden **automatisch** über `autoUpsertNtEintraege()` nach jedem Szenen-PUT angelegt — kein manuelles POST nötig.

---

## 6. Wichtige Refs in UniversalEditor.tsx (Inline-Modus)

| Ref | Typ | Bedeutung |
|-----|-----|-----------|
| `inlineGhostActiveRef` | `boolean` | Ghost-Modus aktiv (Tab/Enter soll triggern) |
| `inlineGhostAcceptNameRef` | `string \| null` | Name der akzeptiert werden soll (bei Treffer) |
| `inlineGhostNoMatchNameRef` | `string \| null` | Name ohne Treffer (Dialog zum Neu-Anlegen) |
| `suppressGhostUpdateRef` | `boolean` | Nächstes onUpdate ignorieren (verhindert Tab-Loop) |
| `dispatchingGhostRef` | `boolean` | Rekursions-Guard für setGhost() |
| `detectedSuffixRef` | `string \| null` | Aktuell eingetippter Suffix |
| `sceneSuffixMemoryRef` | `Map<string, string>` | Letzter Suffix pro Name in dieser Szene |
| `wasInCharNodeRef` | `boolean` | War Cursor zuletzt in CHARACTER-Node (für Auto-Accept) |
| `lastCharNodePosRef` | `{start, end} \| null` | Position des letzten CHARACTER-Nodes |
| `insertPosOverrideRef` | `{start, end} \| null` | Override für insertNameIntoEditor (Pfeil-Tasten-Pfad) |
| `allCharObjsRef` | `{id, name}[]` | Cache aller Produktions-Charaktere (für 'alle'-Modus) |
| `charAcStyleRef` | `'inline' \| 'menu'` | Aktueller AC-Stil (aus tweaks, synced via useEffect) |
| `charFormatIds` | `string[]` (useMemo) | IDs der Absatzformate mit name='Character' |

---

## 7. Konzept-Weiterentwicklung: Offene Fragen

### Freigabe-UX

- Wo im Frontend sieht der Autor, ob seine neu verwendete Figur noch `'ausstehend'` ist?
- Soll die Figur im Editor farblich markiert werden (orange = ausstehend, rot = abgelehnt)?
- Was passiert wenn eine abgelehnte Figur weiter im Skript bleibt?
- Soll der Autor benachrichtigt werden (Messenger-Notification) wenn eine Anfrage entschieden wird?

### NT-Workflow

- Aktuell kein Frontend für die NT-Liste — soll dort ein eigener Tab entstehen?
- `nt_typ='telefon'` taucht in der Statistik auf, wird aber nicht von `extractNtCharacters` erzeugt — manuell pflegbar via PATCH.
- Replikentext für NT-Aufnahme: Soll dieser im Editor direkt angezeigt/exportiert werden?

### AC-Erweiterungen

- Fuzzy-Matching statt Prefix-Only (Tipp: `name.toUpperCase().includes(queryUpper)` oder Levenshtein)?
- Shortcut Alt+1..9 aus AbsatzExtension vs. Tab aus charAcKeyExtension: Tab hat Vorrang wegen Extensionreihenfolge
- `nurCharAusSzenenkopf`-Setting: 'szenenkopf' (nur Szenenköpfe) vs. 'alle' (alle Produktions-Figuren) — ein dritter Modus "Szene + Block" wäre denkbar

### Datenbank-Erweiterungen

- `character_productions.freigabe_status` hat keinen Index → bei großen Produktionen Index anlegen
- `rollen_freigabe_genehmiger_status.token` LIKE-Suche ist slow bei vielen Einträgen → separate Token-Tabelle oder GIN-Index
- NT-Statistik enthält `nt_typ='telefon'` in der Zählung, aber kein `extractNtCharacters` erzeugt diesen Wert automatisch → Inkonsistenz dokumentieren

---

*Stand: 2026-05-31 · Script-App v117+ · Migrationen: v17, v27, v33, v39, v132, v138*
