# Phase-1-Briefing V1 (freigegeben) — Analyse-Editor

**Stand:** 20. Mai 2026 · **Status:** freigegeben, ersetzt `phase1-briefing-DRAFT.md`
**Auftraggeber:** Jan Diepers, GF Studio Hamburg Serienwerft
**Begleitdokumente:** `architektur-methoden-module.md`, `script-analyse-editor-memory-V2.md`, `story-consultant-pur-v1.md`, `story-consultant-framework-v1.md`

---

## Kontext

Du arbeitest am bestehenden `script.serienwerft.app`-Stack:
- **Backend:** Node.js + TypeScript, Express
- **DB:** PostgreSQL (64+ Migrations)
- **Deploy:** PM2, nginx, IONOS VPS, Ubuntu 24.04
- **Import:** PDF/Fountain/FDX/DOCX/Celtx/WriterDuet → ProseMirror-JSON in `dokument_szenen.content`
- **SSO:** auth.serienwerft.studio

Lies zuerst `docs/import-schema-snapshot.md` (Import-Datenmodell) und
`architektur-methoden-module.md` (Methoden-System).

---

## Ziel von Phase 1

Ein Writer Producer wählt im Frontend eine Produktion und einen Block, wählt eine oder
beide Story-Consultant-Methoden, klickt "Analyse starten" und bekommt nach ~90 Sekunden
pro Methode eine Markdown-formatierte Analyse. Ergebnisse werden persistiert und sind
ohne neuen API-Call erneut abrufbar.

**Phase 1 implementiert:**
- Methode 1: Story-Consultant Pur
- Methode 2: Story-Consultant Framework
- Modulares Datenmodell (vorbereitet für alle 5 Methoden)
- Auswahl-Panel (Methode 3–5 sichtbar, aber ausgegraut)

**Phase 1 implementiert NICHT:**
- Methoden 3–5 (Toubia, Reagan, Rocchi) — spätere Phasen
- Strang-Trennung — Phase 2
- Strang-Management-UI — Phase 1.5 (separates Briefing)
- Visualisierungen, Diff-View — spätere Phasen

---

## Akzeptanzkriterien

1. cURL-POST gegen `/api/analysis/run` mit `{produktion_id, block_nummer, methods: ['story_consultant_pur']}` liefert innerhalb 120 s eine Analyse.
2. Mit `methods: ['story_consultant_pur', 'story_consultant_framework']` laufen beide Methoden, das Ergebnis enthält zwei `method_results`.
3. Ergebnisse werden in `analysis_runs` + `analysis_method_results` persistiert.
4. Ein zweiter identischer Aufruf liefert die gecachten Methoden-Ergebnisse zurück (`from_cache: true` pro Methode), ohne neuen API-Call.
5. Pro kostenpflichtiger Methode wird ein `analysis_costs`-Eintrag geschrieben (Input-/Output-/Cache-Tokens, EUR-Cent).
6. Frontend-Seite `/analysis`: Produktion + Block wählen, Methoden-Auswahl-Panel mit Live-Kostenschätzung, Run starten, Loading-Indikator, Ergebnis je Methode als gerendertes Markdown.
7. Smoke-Test mit Block 900 (Rote Rosen S25, Folgen 4487–4491): beide Methoden liefern strukturell vollständige Analysen. Regressionsvergleich gegen `docs/blockanalysen/Block_900_Analyse_RR_S25.md`.

---

## Architektur

### Datenfluss

```
Frontend (AnalysisPage)
  → POST /api/analysis/run { produktion_id, block_nummer, methods[], strang_filter? }
       → Block-Resolver: produktion_id + block_nummer → folgen-Range
            (Lookup via Produktionsdatenbank, GET /api/produktionen/:id/bloecke-Logik)
       → pro Folge die aktuellste Werkstufe bestimmen
       → block_version_hash = sha256(sortedFolgenIds + ':' + sortedWerkstufenHashes)
       → analysis_runs-Eintrag anlegen
       → pro angeforderter Methode:
            → Cache-Lookup (block_version_hash + method + method_version)
                 Hit  → method_result mit from_cache=true
                 Miss → Methoden-Runner ausführen:
                          Szenen laden → Scene-Renderer → Prompt-Builder
                          → Anthropic API → Persistenz → Cost-Logging
       → return { run_id, method_results[] }
```

### Neue Dateien

| Pfad | Funktion |
|---|---|
| `backend/src/migrations/v65_analysis_runs.sql` | `analysis_runs` + `analysis_method_results` + `analysis_costs` |
| `backend/src/lib/blocks/resolver.ts` | Block → Folgen-Range (via Produktionsdatenbank) |
| `backend/src/lib/analysis/scene-renderer.ts` | ProseMirror-JSON → Klartext |
| `backend/src/lib/analysis/prompt-builder.ts` | Baut Anthropic-Prompt aus System-Prompt + Block-Kontext |
| `backend/src/lib/analysis/methods/story-consultant.ts` | Runner für Methode 1 + 2 (gemeinsam, Prompt-Datei unterscheidet) |
| `backend/src/lib/analysis/runner.ts` | Orchestrierung: Cache, Methoden-Dispatch, Persistenz |
| `backend/src/routes/analysis.ts` | Express-Routen |
| `frontend/src/pages/AnalysisPage.tsx` | Auswahl-Panel + Ergebnisanzeige |
| `prompts/story-consultant-pur-v1.md` | System-Prompt Methode 1 (liegt vor) |
| `prompts/story-consultant-framework-v1.md` | System-Prompt Methode 2 (liegt vor) |
| `docs/blockanalysen/Block_900_Analyse_RR_S25.md` | Referenz für Regressionstest (liegt vor, aus docx) |

### Geänderte Dateien

| Pfad | Änderung |
|---|---|
| `backend/src/index.ts` | Route registrieren |
| `backend/package.json` | `@anthropic-ai/sdk` als Dependency |
| `frontend/src/App.tsx` | Route `/analysis` |

---

## Datenmodell

Vollständige DDL in `architektur-methoden-module.md`, Abschnitt 3. Kurz:

- **`analysis_runs`** — ein Run, ausgelöst durch einen Klick. Enthält `requested_methods` JSONB, `block_version_hash`, `werkstufen_ids`, `folgen_ids`, optionalen `strang_filter`.
- **`analysis_method_results`** — ein Eintrag pro Methode pro Run. `result_markdown`, `result_structured` JSONB, `method_version`, `status`, `duration_ms`.
- **`analysis_costs`** — ein Eintrag pro kostenpflichtiger Methode. Token-Counts, `cost_eur_cent`.

Migration heißt `v65_analysis_runs.sql` (alle drei Tabellen in einer Migration, da sie zusammengehören).

---

## Komponenten

### 1. `lib/blocks/resolver.ts`

```typescript
resolveBlock(produktion_id: string, block_nummer: number): Promise<{
  produktion_id: string
  block_nummer: number
  folge_von: number
  folge_bis: number
  folgen_ids: number[]   // konkrete folgen.id in script_db
  dreh_von: string
  dreh_bis: string
}>
```

Block-Zuordnung ist **nicht** in `script_db` persistiert. Sie kommt aus der
Produktionsdatenbank: `productions.bloecke` (JSONB-Array mit `folge_von`/`folge_bis`),
Block-Nummer = `erster_block + Array-Index`. Nutze die bestehende Logik aus
`produktionen.ts` (`GET /api/produktionen/:id/bloecke`) bzw. den internen Endpoint
`/api/internal/productions/:id/script-context`.

Der Resolver kapselt diese Logik sauber, damit andere Tools (Live-Dispo, QuotenMeter)
ihn später nutzen können.

### 2. `lib/analysis/scene-renderer.ts`

```typescript
renderSceneForPrompt(scene: DocumentScene): string
```

Wandelt das `content`-JSONB einer Szene in sauberen Klartext. Output-Format pro Szene:

```
=== Szene 4487.29 ===
INT/EXT: Außendreh · Tageszeit: TAG · Spieltag: 53
Ort: A. D. Stadtcafé
Figuren: Flora, Raphael
Komparsen: —
Marker: CLIFF
Zusammenfassung: Flora gibt sich einem leidenschaftlichen Kuss mit Raphael hin ...
Inhalt:
Feierabend. Das Café ist leer ...
```

Hinweise:
- ProseMirror-Nodes (`screenplay_element` oder `absatz`) aus dem content-Array extrahieren, `text` konkatenieren
- `character` → "FIGUR: ", `dialogue` eingerückt, `direction`/`shot` → "(Anweisung: ...)"
- Marker (PEN/CLIFF/DPU/IPU/SOLO/SBSA/WS) aus `zusammenfassung` per Regex extrahieren: `/^(PEN|CLIFF|DPU|IPU|SOLO|SBSA|WS)[\s:.\-]/i`
- NMDP und andere inline-Marker bleiben als Klartext im Body — kein eigenes Feld
- bei `isWechselschnitt`: im Output vermerken inkl. `wechselschnittPartner`

### 3. `lib/analysis/prompt-builder.ts`

```typescript
buildPrompt(opts: {
  method: 'story_consultant_pur' | 'story_consultant_framework'
  produktion: Produktion
  block_nummer: number
  folgen: Folge[]
  szenen: DocumentScene[]
}): { system: SystemPromptPart[], messages: Message[] }
```

Drei Bausteine:

**System-Prompt-Header** (gecached, `cache_control: ephemeral`):
Inhalt aus `prompts/story-consultant-pur-v1.md` bzw. `...-framework-v1.md`, je nach
`method`. Die Dateien liegen vor.

**Block-Kontext** (gecached, `cache_control: ephemeral`):
- Produktions-Header (Titel, Staffel, Block, Drehtermin, Writer Producer, Head of Story aus `roteRosenMeta`)
- Folgenliste
- Alle Szenen, gerendert via `renderSceneForPrompt`, sortiert nach folge_nummer ASC, scene_nummer ASC
- **Identische Reihenfolge und Whitespace bei jedem Build** — sonst keine Cache-Treffer

**User-Message** (nicht gecached):
```
Analysiere diesen Block nach dem im System-Prompt definierten Schema.
Antworte auf Deutsch, mit Markdown-Headern.
```

Caching: Bei mehreren Methoden im selben Run teilen sich Methode 1 und 2 den
Block-Kontext-Cache (gleicher Kontext, nur anderer System-Header). Das spart beim
zweiten Methoden-Call die Kontext-Tokens.

### 4. `lib/analysis/methods/story-consultant.ts`

```typescript
runStoryConsultant(opts: {
  method: 'story_consultant_pur' | 'story_consultant_framework'
  produktion, block_nummer, folgen, szenen
}): Promise<{ markdown: string; usage: TokenUsage; duration_ms: number }>
```

- Modell: `claude-opus-4-7` (per ENV konfigurierbar)
- `max_tokens: 16000`
- Anthropic SDK, `apiKey` aus `ki_providers`-Tabelle (Routing wie bei Mistral OCR)
- synchroner Call, Timeout 180 s
- Streaming nicht nötig in Phase 1
- Fehler → `{ status: 'error', error_detail }`, kein DB-Schreiben des Ergebnisses

### 5. `lib/analysis/runner.ts`

```typescript
runAnalysis(opts: {
  produktion_id: string
  block_nummer: number
  methods: AnalysisMethod[]
  strang_filter?: string[]
  created_by: string
}): Promise<{ run_id: string; method_results: MethodResult[] }>
```

Ablauf:
1. `resolveBlock` → Folgen-Range
2. Pro Folge aktuellste Werkstufe (typ storyline oder drehbuch, höchste version_nummer)
3. `block_version_hash` berechnen
4. `analysis_runs`-Eintrag anlegen
5. Pro Methode: Cache-Lookup; bei Miss den Methoden-Runner; Ergebnis + Kosten persistieren
6. Return

Cost-Logging: aus Anthropic-Response `usage.input_tokens`, `output_tokens`,
`cache_read_input_tokens`, `cache_creation_input_tokens`. Preise als Konstanten
(Opus 4.7, Mai 2026): Input $15/M, Output $75/M, Cache-Write $18,75/M, Cache-Read
$1,50/M. USD→EUR 0,92 statisch. Berechnung in EUR-Cent (Integer).

### 6. `routes/analysis.ts`

```
POST /api/analysis/run
  Auth: erforderlich. POST nur für writer-producer, story-edit, admin.
  Body: { produktion_id, block_nummer, methods[], strang_filter? }
  Response 200: { run_id, method_results: [{ method, markdown, from_cache, status }] }

GET /api/analysis/run/:id
  Auth: erforderlich (alle authentifizierten Nutzer).
  Response: voller Run mit allen method_results.

GET /api/analysis/block/:produktion_id/:block_nummer
  Auth: erforderlich.
  Response: Liste aller Runs für den Block, sortiert created_at DESC.
  ?latest=true → nur neuester Run.
```

### 7. `AnalysisPage.tsx`

- Dropdowns: Produktion + Block-Nummer (Block-Nummern via bestehende `bloecke`-Logik)
- Methoden-Auswahl-Panel:
  - Methode 1 + 2 anwählbar, mit Kostenschätzung (~2 € je)
  - Methode 3–5 sichtbar, ausgegraut, Label "ab Phase 3"
  - Live-Summe der geschätzten Kosten
- Strang-Filter: in Phase 1 deaktiviert (kein Strang-Tagging vorhanden)
- Button "Analyse starten" → Loading-Indikator ("Claude analysiert, ~90 s pro Methode")
- Ergebnis: pro Methode ein Tab oder eine Sektion, Markdown gerendert (`react-markdown`)
- Bei vorhandenen früheren Runs: Liste mit Datum, Indikator "aktuell / veraltet"
- `from_cache`-Hinweis pro Methode
- Kopier-Button pro Methoden-Ergebnis

Phase 1: Funktion vor Polish.

---

## System-Prompts

Liegen als fertige Dateien vor: `story-consultant-pur-v1.md` und
`story-consultant-framework-v1.md`. In den Ordner `prompts/` legen (neu anlegen falls
nicht vorhanden). `method_version` in `analysis_method_results` korrespondiert zum
Dateinamen (`story-consultant-pur-v1`). Spätere Prompt-Änderungen → neue Datei `v2`,
alte bleibt für Reproduzierbarkeit.

---

## Reihenfolge der Implementierung

1. Migration `v65_analysis_runs.sql` anlegen, lokal anwenden
2. `lib/blocks/resolver.ts` — gegen echte Produktionsdatenbank testen
3. `scene-renderer.ts` — mit echten DB-Szenen testen
4. System-Prompt-Dateien nach `prompts/` legen
5. `prompt-builder.ts` — Prompt-Länge in Tokens prüfen (Block 900 sollte 30k–80k Input-Tokens ergeben)
6. `story-consultant.ts` — erst ohne Cache, ein einfacher End-to-End-Call
7. `runner.ts` — Cache und Cost-Logging dazu
8. `routes/analysis.ts` — registrieren, mit cURL testen
9. `AnalysisPage.tsx` — simpel, gegen lokale API
10. Smoke-Test Block 900, Regressionsvergleich

---

## Was du NICHT machst in Phase 1

- Keine Strang-Tabellen befüllen (Phase 2)
- Keine Strang-Management-UI (Phase 1.5, separates Briefing)
- Keine Methoden 3–5 implementieren (nur im UI ausgegraut zeigen)
- Keine NMDP-DB-Spalte (NMDP bleibt Klartext)
- Kein Anschluss-Referenz-Refactoring
- Keine Worker-Queue (synchroner Call genügt)
- Kein Streaming zum Frontend

---

## Risiken / offene Punkte

1. **Token-Budget:** Block 900 (5 Folgen) ~60k–80k Input-Tokens. Im 200k-Limit, aber bei >120k Tokens Frontend-Warnung und Bestätigung verlangen.
2. **Cache-Invalidierung:** `block_version_hash` enthält Folgen-IDs + Werkstufen-Hashes. Verschiebt sich die Block-Definition in der Produktionsdatenbank oder wird eine Werkstufe neu hochgeladen, ändert sich der Hash → Cache-Miss. Korrektes Verhalten.
3. **EU-Routing:** Vor Produktiv-Einsatz Anthropic-EU-Datenresidenz für den Account bestätigen. Test vorher OK.
4. **DSGVO-Logs:** API-Call-Logs dürfen keinen Treatment-Inhalt enthalten — nur Token-Counts und Request-IDs.

---

## Sign-off

Phase 1 fertig, wenn alle 7 Akzeptanzkriterien erfüllt sind und der Smoke-Test gegen
Block 900 erfolgreich war. Erste erfolgreiche Analyse beider Methoden in
`docs/blockanalysen/Block_900_Run_001_pur.md` und `..._framework.md` dokumentieren.

Erwartete Bauzeit: 1–2 Wochenenden.

Bei Unklarheiten: nicht raten, im PR als offene Frage markieren.
