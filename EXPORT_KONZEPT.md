# Export-System — Konzept & Phasenplan (v2, 2026-05-23)

> Dieses Dokument ist die verbindliche Referenz für alle Export-Entscheidungen.
> Vor jeder Implementierung hier nachschlagen — die Fallstricke-Sektion ist Pflichtlektüre.

---

## Status

| Phase | Titel | Status |
|---|---|---|
| 1 | Neue Chips (persoenlicher_ausdruck, revision, revisions_farbe) | ✅ deployed |
| 2 | DB-Migration + Job-Infrastruktur Backend | ✅ deployed (v112) |
| 3 | PDF-Export Kern (pdfAssembler + Puppeteer) | ✅ deployed |
| 4 | Replacement Pages | ✅ deployed |
| 5 | DOCX-Export | ⬜ offen |
| 6 | Fountain + FDX | ⬜ offen |
| 7 | Export-Panel UI (alter Drawer) | ✅ deployed |
| 8 | Hilfe-Seite (alt) | ✅ deployed |
| A1 | DB-Migration v113: Titelseite-Felder | ⬜ offen |
| A2 | DB-Migration v114: Wasserzeichen Admin-Einstellungen | ⬜ offen |
| A3 | DK-Settings: Titelseite-Toggle für Notiz-Vorlagen | ⬜ offen |
| A4 | Backend: Statistik-HTML-Renderer (server-side) | ⬜ offen |
| A5 | Backend: pdfAssembler-Erweiterungen (WZ sichtbar, Bookmarks, Statistik-Seite, DnD-Reihenfolge) | ⬜ offen |
| A6 | Backend: Export-API neue Payload-Optionen | ⬜ offen |
| A7 | StatistikModal: Export-Callback | ⬜ offen |
| A8 | Export-Modal UI-Umbau (Modal, DnD, Akkordeons, Statistik-Flow) | ⬜ offen |
| A9 | Hilfe-Seite: User-Anleitung + Admin/Dev-Referenz | ⬜ offen |

---

## Format-Matrix

| Format | Drehbuch | Storyline | Notiz (standalone) | Notes |
|---|---|---|---|---|
| **PDF** | ✅ | ✅ | ✅ | Hauptformat, Layout aus DK-Einstellungen |
| **DOCX** | ✅ | ✅ | ✅ | Weiterbearbeitung in Word, Absatzformat-Mapping |
| **Fountain** | ✅ | ❌ | ❌ | Austausch mit Screenwriting-Tools |
| **FDX** | ✅ | ❌ | ❌ | Final Draft Weiterbearbeitung |

---

## PDF-Export — Aufbau (ab Phase A5)

```
[Export-Job — Dokument-Reihenfolge per DnD konfiguriert]

  ZONE "VOR HAUPTINHALT" (beliebig viele, DnD-geordnet):
  ├── Notiz-Werkstufe (z.B. Titelseite)   — abwählbar
  ├── Notiz-Werkstufe (z.B. Synopsis)     — abwählbar
  └── Statistik-Seite                     — abwählbar, konfigurierbar

  HAUPTINHALT (Drehbuch / Storyline)       — abwählbar (!)
  ├── Kopf-/Fußzeile aus gewählter Vorlage
  ├── Szenenkopf-Format aus DK-Einstellungen
  └── Absatzformate aus DK-Einstellungen

  ZONE "NACH HAUPTINHALT" (beliebig viele, DnD-geordnet):
  ├── Notiz-Werkstufe (z.B. Anhang)       — abwählbar
  └── Statistik-Seite                     — abwählbar (falls nicht vorgelagert)

  Fortlaufende Seitennummerierung über alle Teile
  ZWC-Wasserzeichen: automatisch, unsichtbar (alle Exporte)
  Sichtbares Wasserzeichen: nur wenn Admin aktiviert (PDF + Vorschau)
  PDF-Bookmarks: optional, als Checkbox im Export-Modal
```

### Titelseite-Erkennung

Eine Notiz-Werkstufe gilt als "Titelseite" wenn:
- Die zugehörige `dokument_vorlagen`-Vorlage das Feld `ist_titelseite = TRUE` hat
- ODER die Werkstufe selbst `ist_titelseite = TRUE` hat (propagiert beim Erstellen)

Beim Erstellen einer Notiz-Werkstufe aus einer Titelseite-Vorlage: `werkstufen.ist_titelseite = TRUE` setzen.

Standard-Reihenfolge im DnD: Titelseite-Werkstufen erscheinen automatisch vor anderen Notizen.

---

## Export-Modal UI (ab Phase A8)

### Konzept

**Drawer → zentriertes Modal** (~640px breit, max 85vh, scrollbar)

### Layout-Skizze

```
┌────────────────────── Export ──────────────────────── [×] ┐
│                                                            │
│  [PDF]  [Word]  [Fountain]  [FDX]           Format-Tabs   │
│                                                            │
│  ── Dokument-Inhalt ──────────────────────────────────    │
│                                                            │
│  VOR HAUPTINHALT                                           │
│  ┌──────────────────────────────────────────────────┐     │
│  │ ≡  [✓] Deckblatt             Titelseite · V2     │     │
│  │ ≡  [✓] Synopsis              Notiz · V1          │     │
│  │ ≡  [✓] Statistik    [Konfigurieren →]            │     │
│  └──────────────────────────────────────────────────┘     │
│                                                            │
│  ┌──────────────────────────────────────────────────┐     │
│  │  ●  [✓] Hauptinhalt — Drehbuch V3  (fix)         │     │
│  └──────────────────────────────────────────────────┘     │
│                                                            │
│  NACH HAUPTINHALT                                          │
│  ┌──────────────────────────────────────────────────┐     │
│  │ ≡  [✓] Anhang                Notiz · V1          │     │
│  └──────────────────────────────────────────────────┘     │
│                                                            │
│  ── Szenen-Filter ────────────────────────────────────    │
│  [● Alle Szenen]  [○ Nur Auswahl]                         │
│  ▶ Rollen (0 gewählt)                    [Alles / Nichts] │
│  ▶ Komparsen m. Sp. (0 gewählt)                           │
│  ▶ Motive (0 gewählt)                                     │
│                                                            │
│  ── Optionen ─────────────────────────────────────────    │
│  Persönlicher Ausdruck: [________________]  (optional)    │
│  [✓] PDF-Inhaltsverzeichnis (Bookmark-Sidebar)            │
│  [ ] Replacement Pages   [Vergleich mit V▼] [●Blau]      │
│                                                            │
│  ── Dateiname ────────────────────────────────────────    │
│  [Rote Rosen – 4402 – Drehbuch V3 – 2026-05-23_______]   │
│                                                            │
│           [Vorschau]        [Exportieren (PDF)]           │
└────────────────────────────────────────────────────────────┘
```

### DnD-Logik

- HTML5 native Drag & Drop (keine externe Library)
- Zwei separate Drop-Zonen: "VOR HAUPTINHALT" und "NACH HAUPTINHALT"
- Hauptinhalt-Block: nicht draggbar, aber abwählbar
- Initiale Reihenfolge: aus `werkstufen`-Prop (= Sidebar-Reihenfolge); Titelseite-Werkstufen zuerst
- Statistik-Element erscheint immer (wenn Statistik-Konfiguration gesetzt), initial in VOR-Zone
- State: `preItems: OrderedItem[]` und `postItems: OrderedItem[]`
- `OrderedItem`: `{ type: 'notiz' | 'statistik', id: string, label: string, enabled: boolean }`

### Akkordeon-Kategorien (Szenen-Filter)

- Rollen / Komparsen m. Sp. / Motive → Akkordeon, kein `maxHeight`-Scroll
- Default: zugeklappt, Badge zeigt Anzahl gewählter Items
- Aufgeklappt: alle Items sichtbar, kein overflow
- "Alles / Nichts" Button pro Kategorie

---

## Statistik-Seite im PDF

### Konzept

Die Statistik wird zur Export-Zeit **server-seitig als HTML gerendert** und als eigenständige Seite in das PDF eingebettet.

### Statistik-Konfiguration

```ts
interface StatistikExportConfig {
  folge_id: number
  folge_nummer: number
  mode: 'folge' | 'block'
  sections: string[]   // z.B. ['uebersicht', 'rollen', 'motive']
  includedSceneNumbers?: number[]  // null = alle; wenn Szenenfilter aktiv → gefiltert
}
```

### Flow: Export-Modal → StatistikModal → zurück

1. User klickt "Konfigurieren →" neben Statistik-Element im Export-Modal
2. `StatistikModal` öffnet sich mit neuer optionaler Prop `onExportUebernehmen?: (config: StatistikExportConfig) => void`
3. Wenn `onExportUebernehmen` gesetzt: Button "Diese Statistik in Dokument übernehmen" einblenden
4. User konfiguriert Modal (Folge/Block, Sections), klickt Button → `onExportUebernehmen(config)` wird aufgerufen
5. Export-Modal schließt StatistikModal, markiert Statistik-Element als "konfiguriert" (grüner Haken)

### Server-seitiger HTML-Renderer

`backend/src/utils/statistikHtmlRenderer.ts`

- Ruft intern `/api/statistik/overview` (und weitere Endpoints) auf
- Gibt reines HTML zurück — optisch identisch mit StatistikModal-Styles
- Hyperlinks zu Szenen (`<a href="#scene-42">`) nur für Szenen, die im Export enthalten sind
- `includedSceneNumbers`-Set wird übergeben — nur enthaltene Szenen bekommen Anchor-Links
- Eingebettet in das Gesamt-HTML vor Puppeteer-Rendering

### Wichtig: Szenenfilter und Links

Wenn ein Szenenfilter aktiv ist (szenenAuswahl / filterRollen / filterMotive), müssen:
1. Der pdfAssembler die tatsächlich enthaltenen Szenen-Nummern berechnen
2. Diese als `includedSceneNumbers` an den statistikHtmlRenderer übergeben
3. Nur für enthaltene Szenen `<a href="#scene-N">` erzeugen

---

## Wasserzeichen

### ZWC (unsichtbar, steganographisch) — bereits deployed ✅

- `backend/src/utils/watermark.ts` — `encodeWatermark()`, `decodeWatermarkFromText()`
- Payload: `{ user_id, user_name, werkstufe_id, export_timestamp }`
- Eingebettet als versteckter `<span>` in jedes generierte HTML
- Import-Route strippt ZWC automatisch, decoded Payload für Audit
- Admin-Decoder: `POST /api/admin/watermark/decode`

### Sichtbares Diagonal-Wasserzeichen — Phase A2/A5

**Admin-Einstellungen** (neue Tabelle `export_admin_settings`):

| Key | Typ | Default | Beschreibung |
|---|---|---|---|
| `wm_sichtbar_aktiv` | BOOLEAN | false | Sichtbares Wasserzeichen aktivieren |
| `wm_sichtbar_text` | TEXT | 'VERTRAULICH' | Wasserzeichen-Text |
| `wm_sichtbar_opazitaet` | INTEGER | 8 | Opazität in % (1–30, empfohlen: 6–12) |

**Puppeteer-Implementierung:**

Das sichtbare Wasserzeichen kommt in das `headerTemplate` von `page.pdf()`:
```html
<div style="
  position:absolute; top:0; left:0;
  width:100vw; height:100vh;
  display:flex; align-items:center; justify-content:center;
  opacity:0.08;
  font-size:90px; font-weight:900; color:#000;
  transform:rotate(-45deg);
  pointer-events:none; overflow:hidden;
  font-family:Arial,sans-serif;
">VERTRAULICH</div>
```
`headerHeight: '0px'` + `overflow:visible` → erscheint auf jeder Seite.

**Gilt auch für PDF-Vorschau** (gleiche HTML-Quelle, gleicher Render-Pfad).

**Gilt NICHT für Fountain/FDX/DOCX** — nur PDF.

---

## PDF-Bookmarks / Inhaltsverzeichnis

### Puppeteer-Option (ab Phase A5)

```ts
await page.pdf({
  outline: true,    // PDF-Bookmark-Baum aus H-Tag-Hierarchie
  tagged: true,     // PDF/UA-Modus — Voraussetzung für outline
  ...restOptions
})
```

**Voraussetzungen im generierten HTML:**
- `<h1>` für Dokument-Abschnitte (Titelseite, Drehbuch, Statistik, Anhang)
- `<h2>` für Szenenköpfe ("Szene 1 — INT. WOHNZIMMER — TAG")
- `<h3>` für Sub-Elemente wenn sinnvoll (Folge-Überschrift bei Block-Export)

**User-Option im Export-Modal:**
Checkbox "PDF-Inhaltsverzeichnis" (Default: aus) — sendet `pdfBookmarks: true` im Options-Payload.

**Bekannte Einschränkung:**
`tagged: true` aktiviert PDF/UA — kann Seitenumbrüche und Zeilenabstände leicht beeinflussen. **Pflicht-Test** nach Implementierung: exportiertes PDF mit und ohne `tagged:true` vergleichen.

**Fallback:**
Falls `tagged: true` Layoutprobleme erzeugt, wird die Option deaktiviert und eine entsprechende Notiz in die Hilfe-Seite geschrieben.

---

## Titelseite-Konzept

### DB-Felder (Phase A1, Migration v113)

```sql
ALTER TABLE dokument_vorlagen ADD COLUMN ist_titelseite BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE werkstufen ADD COLUMN ist_titelseite BOOLEAN NOT NULL DEFAULT FALSE;
```

### Propagation

Beim Erstellen einer neuen Notiz-Werkstufe (`POST /api/werkstufen`):
- Wenn `vorlage_id` übergeben und `dokument_vorlagen.ist_titelseite = TRUE`:
  → `werkstufen.ist_titelseite = TRUE` setzen

### DK-Settings UI (Phase A3)

In DK-Einstellungen → Tab "Notiz-Vorlagen":
- Pro Vorlage: Toggle "Als Titelseite markieren"
- Nur eine Vorlage kann Titelseite sein → beim Setzen einer neuen: alle anderen auf FALSE
- Backend: `PUT /api/vorlagen/:id` mit `{ ist_titelseite: true }` → UPDATE + alle anderen zurücksetzen

### Export-Default-Sortierung

Im DnD-Initialstate: Titelseite-Werkstufen zuerst in der VOR-Zone, danach alphabetisch/nach Version.

---

## Export-Job-Architektur (aktuell + neue Optionen)

### API-Endpunkte

```
POST /api/export/job
  Body: {
    werkstufId: string,
    format: 'pdf' | 'docx' | 'fountain' | 'fdx',
    options: {
      -- Dokumentstruktur (neu, ab Phase A6) --
      preItems:   OrderedExportItem[],   // VOR-Zone, in Reihenfolge
      postItems:  OrderedExportItem[],   // NACH-Zone, in Reihenfolge
      hauptinhaltAktiv: boolean,         // default true

      -- Statistik (neu) --
      statistik?: StatistikExportConfig,

      -- PDF-Optionen (neu) --
      pdfBookmarks?: boolean,            // outline + tagged

      -- Bestehend --
      persoenlicher_ausdruck?: string,
      szenenAuswahl?: string,
      filterRollen?: string[],
      filterKomparsen?: string[],
      filterMotive?: string[],
      revision?: string,
      revisions_farbe?: string,
      revisions_farbe_hex?: string,
      compareWerkstufId?: string,
      revisionNurGeaendert?: boolean,
      revisionAlleSeiten?: boolean,
      userTimezone?: string,
    }
  }
  → { jobId: string }

GET  /api/export/job/:id         → { status, progress, error? }
GET  /api/export/job/:id/download → File-Stream

POST /api/export/pdf-preview     → HTML-Stream (Puppeteer-Vorschau)
```

### OrderedExportItem

```ts
interface OrderedExportItem {
  type: 'notiz' | 'statistik'
  id?: string                    // bei type='notiz': werkstufe_id
  statistikConfig?: StatistikExportConfig  // bei type='statistik'
}
```

---

## Bekannte Fallstricke

> Pflichtlektüre vor jeder Änderung am Export-System.

### F1 — Puppeteer: position:fixed gilt nicht pro PDF-Seite

**Problem:** Ein `position:fixed` Element in der Seiten-HTML erscheint nur auf der ersten Seite oder überhaupt nicht — nicht auf jeder PDF-Seite.

**Lösung:** Seitenwiederholende Elemente (Wasserzeichen, KZ/FZ) kommen in das `headerTemplate`/`footerTemplate` von `page.pdf()`, nicht ins Body-HTML.

**Wo bereits umgesetzt:** KZ/FZ-Rendering in `pdfAssembler.ts` (dual-path: fixed im Browser-Preview, Puppeteer-Template für PDF).

---

### F2 — Puppeteer: headerTemplate hat Höhe 0 und `overflow:hidden` Default

**Problem:** Content im headerTemplate wird abgeschnitten, wenn er größer als die definierte Höhe ist.

**Lösung:** Für das Wasserzeichen-Overlay: `overflow:visible` auf dem äußersten Container; `position:absolute` statt `position:relative`. Header-Höhe auf `0px` setzen, damit der normale Seiteninhalt nicht verdrängt wird.

---

### F3 — Fortlaufende Seitennummerierung über mehrere HTML-Dokumente

**Problem:** Werden mehrere getrennte HTML-Strings zusammengesetzt (Notiz 1 + Notiz 2 + Drehbuch), haben alle Teile eine eigene `pageNumber`-Zählung ab 1.

**Lösung:** Alle Teile werden in **ein gemeinsames HTML-Dokument** zusammengefügt, bevor Puppeteer aufgerufen wird. Puppeteer's `<span class="pageNumber">` und `<span class="totalPages">` zählen dann über das gesamte Dokument.

**Aktueller Stand:** Bereits so umgesetzt — `buildPayload()` in `exportAssembler.ts` fügt alle Teile zusammen.

---

### F4 — ZWC-Wasserzeichen: Platzierung im Text

**Problem:** ZWC-Zeichen außerhalb von fließendem Text (in `<title>`, `<style>`, SVG-Elementen) gehen beim Copy-Paste verloren.

**Lösung:** ZWC-Block kommt als versteckter `<span>` in den Body-Text, nicht in Metadaten oder Style-Tags. Bereits korrekt umgesetzt.

**Import-Sicherheit:** Import-Route strippt ZWC automatisch vor dem Parsen — kein doppeltes Einbetten.

---

### F5 — Font-Loading im Puppeteer-Kontext

**Problem:** Fonts die via `@import` oder CDN geladen werden sind in Puppeteer nicht verfügbar (no internet, headless). Das erzeugt Fallback-Font und abweichendes Layout.

**Lösung:** Alle Fonts als Base64-Data-URIs oder via lokale Server-Pfade einbetten. In `pdfAssembler.ts` → `localFontCss`-Parameter. Inter-Font bereits als lokale CSS eingebettet.

**Warnung:** Nach Font-Änderungen im Frontend immer testen, ob der Puppeteer-Export noch die richtige Schrift verwendet.

---

### F6 — PDF-Vorschau vs. Export-Divergenz

**Problem:** Browser-Preview rendert CSS anders als Puppeteer (andere Viewport-Breite, kein `@media print`, unterschiedliche Scrollbar-Breite beeinflusst Layout).

**Lösung:** Export-Preview öffnet die PDF-Vorschau-Route (`/api/export/pdf-preview`), die dasselbe HTML wie der Export generiert — identische Ausgabe. **Keine** Browser-basierte "Live-Preview" des Editor-Inhalts als PDF-Preview verwenden.

---

### F7 — Szenenfilter und Statistik-Hyperlinks

**Problem:** Wenn ein Szenenfilter aktiv ist, enthält das PDF nur einen Teil der Szenen. Links in der Statistik-Seite auf nicht-enthaltene Szenen würden ins Leere zeigen.

**Lösung:** Bevor der `statistikHtmlRenderer` aufgerufen wird, berechnet der `pdfAssembler` die Menge der tatsächlich enthaltenen Szenen-Nummern aus dem Szenenfilter. Diese werden als `includedSceneNumbers: Set<number>` übergeben. Der Renderer erzeugt Links nur für enthaltene Szenen.

---

### F8 — tagged:true (PDF/UA) beeinflusst Layout

**Problem:** `page.pdf({ tagged: true })` aktiviert den PDF/UA-Accessibility-Modus. Dieser kann Zeilenabstände, Seitenumbrüche und Font-Rendering marginal verändern.

**Lösung:** Option `pdfBookmarks` ist default AUS. Bei Aktivierung im Export-Modal immer Vergleichs-Export mit und ohne durchführen. Bei Layoutabweichungen: Option deaktivieren + in Hilfe dokumentieren.

---

### F9 — Notiz-Werkstufe mit anderem Seitenformat als Hauptinhalt

**Problem:** Notiz-Vorlage kann A4 haben, Hauptinhalt US Letter — zusammengemischte Seitenformate in einem PDF sind technisch möglich, sehen aber schlecht aus.

**Lösung (entschieden):** Das Seitenformat wird aus den DK-Einstellungen der **Haupt-Werkstufe** genommen und gilt für das gesamte Dokument. Notiz-Vorlagen ignorieren ihr eigenes Seitenformat-Setting beim kombiniertem Export.

---

### F10 — Statistik-Rendering bei Block-Modus und fehlenden Daten

**Problem:** Statistik im "Block"-Modus braucht Folgen-Daten über einen ganzen Block. Wenn der Block unvollständig importiert wurde (fehlende Folgen), gibt die API `null` oder leere Arrays zurück.

**Lösung:** Statistik-HTML-Renderer muss auf leere Daten graceful reagieren: Leere Sektionen weglassen (nicht "0" anzeigen), keine JavaScript-Errors bei Division durch 0. Defensive Rendering-Logik.

---

### F11 — Export von Hauptinhalt deaktiviert, keine Seitennummerierung

**Problem:** Wenn `hauptinhaltAktiv: false`, aber KZ/FZ enthalten `{{seite}}` oder `{{seiten_gesamt}}` — diese Chips haben keine Bedeutung mehr.

**Lösung:** Wenn `hauptinhaltAktiv: false`, Chips `{{seite}}`/`{{seiten_gesamt}}` zu leerem String rendern (statt Fehler). Keine KZ/FZ aus Haupt-Vorlage anwenden — Notiz-Seiten verwenden ihre eigenen Vorlagen.

---

### F12 — DnD und Touch auf Tablet

**Problem:** HTML5 native Drag & Drop funktioniert auf Touch-Geräten nicht (kein `dragstart`/`dragend` auf Touch).

**Lösung:** Im Export-Modal die Touch-Variante implementieren: `touchstart`/`touchmove`/`touchend` mit `{ passive: false }` + `preventDefault()`. Koordinaten via `ev.touches[0].clientY`. Der Drag-Handle muss mind. 44×44px Touch-Target sein (per `@media (pointer: coarse)`).

---

## DOCX-Export

Library: `docx` npm-Paket (pure JS, keine System-Abhängigkeiten).

Absatzformat-Mapping: DK-Einstellungen Absatzformate → Word `ParagraphStyle` mit identischen Schrift- und Abstandseinstellungen.

Für Drehbuch: Scene Heading, Action, Character, Dialogue, Parenthetical als benannte Styles.
Für Storyline: Storyline-Absatzformate.
Für Notiz: Normal-Text mit einfachem Layout.

---

## Fountain + FDX

**Fountain**: Nur Drehbuch-Werkstufen. ZWC-Wasserzeichen im Text-Content.
**FDX**: Nur Drehbuch-Werkstufen. XML-Format für Final Draft.

---

## Dateiname-Schema (auto-generiert, editierbar)

```
[Produktionstitel] – [Folge] – [Werkstufen-Typ] V[Version] – [Datum]
Rote Rosen – 4402 – Drehbuch V3 – 2026-05-23

Replacement Pages:
Rote Rosen – 4402 – Drehbuch V3 – Blaue Seiten – Revisionsseiten
```

---

## Phasenplan A — Neue Features

### Phase A1 — DB-Migration v113: Titelseite-Felder [ ]

```sql
-- v113_titelseite_felder.sql
ALTER TABLE dokument_vorlagen ADD COLUMN IF NOT EXISTS ist_titelseite BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE werkstufen        ADD COLUMN IF NOT EXISTS ist_titelseite BOOLEAN NOT NULL DEFAULT FALSE;
```

- [ ] SQL-Datei anlegen
- [ ] In `migrationFiles`-Liste in `backend/src/index.ts` eintragen
- [ ] `PUT /api/vorlagen/:id` um `ist_titelseite` erweitern (+ alle anderen auf FALSE wenn TRUE gesetzt)
- [ ] `POST /api/werkstufen` propagiert `ist_titelseite` aus Vorlage
- [ ] Commit + Deploy

### Phase A2 — DB-Migration v114: Wasserzeichen Admin-Einstellungen [ ]

```sql
-- v114_export_admin_settings.sql
CREATE TABLE IF NOT EXISTS export_admin_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT INTO export_admin_settings VALUES
  ('wm_sichtbar_aktiv',    'false'),
  ('wm_sichtbar_text',     'VERTRAULICH'),
  ('wm_sichtbar_opazitaet','8')
ON CONFLICT DO NOTHING;
```

- [ ] SQL-Datei anlegen + in `migrationFiles` eintragen
- [ ] `GET /api/admin/export-settings` — alle Einstellungen lesen
- [ ] `PUT /api/admin/export-settings` — Einstellungen schreiben (nur superadmin/herstellungsleitung)
- [ ] In `watermark-admin.ts`-Router integrieren
- [ ] Commit + Deploy

### Phase A3 — DK-Settings: Titelseite-Toggle [ ]

- [ ] In DK-Einstellungen → Notiz-Vorlagen-Tab: pro Vorlage Toggle "Als Titelseite verwenden"
- [ ] API-Call an `PUT /api/vorlagen/:id { ist_titelseite: true }`
- [ ] Visuelle Markierung der Titelseite-Vorlage (z.B. kleines Stern-Icon)
- [ ] Commit + Deploy

### Phase A4 — Backend: Statistik-HTML-Renderer [ ]

`backend/src/utils/statistikHtmlRenderer.ts`

- [ ] Funktion `renderStatistikHtml(config: StatistikExportConfig, db): Promise<string>`
- [ ] Interne DB-Abfragen (keine HTTP-Requests) — direkt gegen PostgreSQL
- [ ] Sektionen: Übersicht, Figuren in Szenen, Rollen, Motive, Drehorte (je nach `config.sections`)
- [ ] Optisch identisch mit StatistikModal-Output (gleiche Tabellen/Styles als inline CSS)
- [ ] Hyperlinks nur für `includedSceneNumbers` erzeugen (`<a href="#scene-N">`)
- [ ] Graceful Empty States (keine Division-by-0-Fehler, leere Sektionen weglassen)
- [ ] Playwright-Test: POST /api/export/job mit Statistik-Config → PDF prüfen
- [ ] Commit + Deploy

### Phase A5 — Backend: pdfAssembler-Erweiterungen [ ]

- [ ] **Sichtbares Wasserzeichen**: Admin-Settings aus DB laden → `headerTemplate`-Overlay
- [ ] **PDF-Bookmarks**: Option `pdfBookmarks` → `{ outline: true, tagged: true }` an Puppeteer; nach Layout-Test
- [ ] **DnD-Reihenfolge**: `preItems`/`postItems` aus Payload respektieren — HTML in dieser Reihenfolge zusammensetzen
- [ ] **`hauptinhaltAktiv: false`**: Hauptinhalt überspringen, Chips `{{seite}}`/`{{seiten_gesamt}}` → leer
- [ ] **Statistik-Seite**: `statistikHtmlRenderer` aufrufen, HTML einfügen, `includedSceneNumbers` korrekt berechnen
- [ ] **H-Tags** für Bookmarks: `<h1>` für Abschnitte, `<h2>` für Szenenköpfe — in bestehende Render-Funktion einbauen
- [ ] Export-Log erweitern: neue Felder (`hauptinhalt_aktiv`, `hat_statistik`, `pdf_bookmarks`)
- [ ] Playwright-Tests: Wasserzeichen (visuell-check), Bookmarks (Outline-Existenz), Reihenfolge
- [ ] Commit + Deploy

### Phase A6 — Backend: Export-API neue Payload-Optionen [ ]

- [ ] `POST /api/export/job`: `preItems`, `postItems`, `hauptinhaltAktiv`, `statistik`, `pdfBookmarks` validieren
- [ ] Validierung: `preItems`/`postItems` sind Arrays mit `type` + `id`
- [ ] Validierung: `statistik.folge_id` muss gültig sein wenn übergeben
- [ ] `POST /api/export/pdf-preview`: gleiche neue Optionen unterstützen
- [ ] Playwright-Test: neue Optionen durchspielen
- [ ] Commit + Deploy

### Phase A7 — StatistikModal: Export-Callback [ ]

`frontend/src/components/StatistikModal.tsx`

- [ ] Neue optionale Prop: `onExportUebernehmen?: (config: StatistikExportConfig) => void`
- [ ] Wenn gesetzt: Button "Diese Statistik in Dokument übernehmen" in der Modal-Fußzeile anzeigen
- [ ] Button-Klick: aktuelle `selectedFolgeId`, `mode`, aktive `sections` → `config` bauen → Callback aufrufen
- [ ] Kein State-Reset nach Callback (Modal bleibt offen, User kann noch anpassen)
- [ ] Commit + Deploy

### Phase A8 — Export-Modal UI-Umbau [ ]

`frontend/src/components/editor/ExportDrawer.tsx` (Umbau zu `ExportModal.tsx`)

- [ ] Drawer → Modal (zentriert, 640px, max-height 85vh)
- [ ] State: `preItems`, `postItems`, `hauptinhaltAktiv`, `statistikConfig`, `pdfBookmarks`
- [ ] Beim Öffnen: Items aus `werkstufen`-Prop befüllen, Titelseite-Werkstufen zuerst
- [ ] **DnD VOR-Zone**: HTML5 drag+touch, Items reorderbar
- [ ] **DnD NACH-Zone**: HTML5 drag+touch, Items reorderbar
- [ ] **Hauptinhalt-Block**: nicht draggbar, Checkbox "Im Export enthalten"
- [ ] **Statistik-Item**: erscheint sobald `statistikConfig` gesetzt; "Konfigurieren →" Button → öffnet StatistikModal mit `onExportUebernehmen`
- [ ] **Statistik-Item drag**: in beiden Zonen draggbar
- [ ] **Akkordeons** für Rollen/Komparsen/Motive (kein maxHeight, alle Items sichtbar)
- [ ] **Checkbox** "PDF-Inhaltsverzeichnis"
- [ ] **Dateiname** editierbar (auto-generiert)
- [ ] Touch-Support für DnD (F12-Fallstrick beachten)
- [ ] Export-Payload mit neuen Feldern aufbauen
- [ ] ScriptPage.tsx: ExportDrawer → ExportModal umbenennen (Prop-Signature prüfen)
- [ ] Playwright-Test: Modal öffnen, DnD, Statistik-Flow, Export auslösen
- [ ] Commit + Deploy

### Phase A9 — Hilfe-Seite: User-Anleitung + Admin/Dev-Referenz [ ]

**User-Anleitung** (`/hilfe` → Tab "Export"):
- [ ] Export-Modal Schritt-für-Schritt (Format wählen, Inhalte ordnen, Statistik einbetten, Wasserzeichen, Exportieren)
- [ ] Erklärung DnD (mit Screenshot-Mockup als ASCII oder Bild)
- [ ] Erklärung Titelseite-Vorlage markieren
- [ ] Erklärung Statistik konfigurieren
- [ ] Erklärung PDF-Inhaltsverzeichnis
- [ ] Replacement Pages kurz erklärt
- [ ] Persönlicher Ausdruck erklärt

**Admin/Dev-Referenz** (`/hilfe` → Admin-Tab → "Export-System"):
- [ ] API-Endpunkte vollständig dokumentiert
- [ ] Payload-Schema mit allen Optionen
- [ ] Wasserzeichen Admin-Einstellungen (Pfad, Keys, Werte)
- [ ] Statistik-Config-Schema
- [ ] Fallstricke-Zusammenfassung (F1–F12)
- [ ] Wie neue Export-Formate hinzugefügt werden (Erweiterungspunkte)
- [ ] Wie der Statistik-HTML-Renderer erweitert wird (neue Sektionen)
- [ ] PDF-Bookmarks Testvorgehen

---

## Offene Entscheidungen (Stand 2026-05-23)

| Frage | Entscheidung |
|---|---|
| Seitennummerierung | fortlaufend über alle Teile |
| Notiz-Seitenformat bei kombiniertem Export | aus Haupt-Werkstufe, nicht aus Notiz-Vorlage (F9) |
| Sichtbares Wasserzeichen in Vorschau | ja |
| PDF-Bookmarks Default | aus (opt-in) |
| DnD-Library | HTML5 nativ (keine externe Library) |
| Statistik Backend-Rendering | direkte DB-Abfragen, kein HTTP zu eigener API |
| Titelseite: max. 1 pro Produktion | ja (Backend erzwingt Uniqueness beim Setzen) |
| Export-Modal: Drawer vs. Modal | zentriertes Modal, ~640px |
| Akkordeon Default | zugeklappt mit Badge |
| DOCX/Fountain/FDX: neue Optionen | nur PDF-spezifische Optionen (Wasserzeichen, Bookmarks, DnD-Reihenfolge) betreffen nur PDF |
