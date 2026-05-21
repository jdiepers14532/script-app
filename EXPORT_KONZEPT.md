# Export-System — Konzept & Phasenplan

## Übersicht

Vollständiger Neu-Aufbau des Export-Systems nach Entfernung der alten Routine (2026-05-21).

---

## Format-Matrix

| Format   | Drehbuch | Storyline | Notiz (standalone) | Notes                                        |
|----------|----------|-----------|-------------------|----------------------------------------------|
| **PDF**  | ✅        | ✅         | ✅                 | Hauptformat, Layout aus DK-Einstellungen      |
| **DOCX** | ✅        | ✅         | ✅                 | Weiterbearbeitung in Word, Absatzformat-Mapping |
| **Fountain** | ✅   | ❌         | ❌                 | Austausch mit Screenwriting-Tools             |
| **FDX**  | ✅        | ❌         | ❌                 | Final Draft Weiterbearbeitung                 |

**Fountain / FDX**: Nur für Drehbuch-Werkstufen. Storyline + Notiz werden nicht exportiert.

---

## PDF-Export — Aufbau

```
[Export-Job]
  1. Notiz-Werkstufen (gleiche Folge, vorgelagert) — default alle, abwählbar
     └── Jede Notiz: eigene Vorlage (Titelseite, Synopsis, Recap, Precap, Custom)
         └── Inhalt via {{notiz_inhalt}}-Chip
  2. Drehbuch- oder Storyline-Werkstufe (Haupt)
     └── Kopf-/Fußzeile aus gewählter Vorlage
     └── Szenenkopf-Format aus DK-Einstellungen
     └── Absatzformate aus DK-Einstellungen
     └── Fortlaufende Seitennummerierung über alles
  → Wasserzeichen: Admin-Einstellung (diagonal, sichtbar)
  → Persönlicher Ausdruck: Export-time Name via {{persoenlicher_ausdruck}}-Chip
  → ZWC-Wasserzeichen: unsichtbar, automatisch (bestehend)
```

### PDF-Modi

| Modus | Beschreibung |
|---|---|
| **Normal** | Vollständiges Dokument |
| **Replacement Pages** | Nur geänderte Seiten vs. ältere Werkstufe; `*` rechts am Rand; 4px farbiger linker Randstreifen |

Replacement Pages = kein eigenes Format, nur ein besonderer PDF-Druck.

---

## Neue Chips (Phase 1)

| Chip | Label | Zone | Farbe | Verhalten |
|---|---|---|---|---|
| `{{persoenlicher_ausdruck}}` | Pers. Ausdruck | alle | `#FF3B30` | Export-time Eingabe; leer = unsichtbar |
| `{{revision}}` | Revision | alle | `#FF9500` | Revision-Label z.B. "Blaue Seiten"; leer = unsichtbar |
| `{{revisions_farbe}}` | Revisionsfarbe | alle | `#FF9500` | Farbiger Punkt `●` in Revisions-Hex-Farbe; leer = unsichtbar |

**Wichtig**: `{{stand_datum}}` (bereits vorhanden) = Revisionsdatum (werkstufen.stand_datum). `{{aktuelles_datum}}` (bereits vorhanden) = Druckdatum. Kein neuer Datum-Chip nötig.

**Stille Chips**: Im Normal-PDF-Modus rendern `{{revision}}` und `{{revisions_farbe}}` als leerer String. Bestehende Vorlagen bleiben unverändert.

---

## Export-Job-Architektur (Backend)

```
POST /api/export/job
  Body: { werkstufId, format, options: { notizWerkstufen, persoenlicher_ausdruck,
          revision, revisions_farbe, revisions_farbe_hex, compareWerkstufId,
          revisionNurGeaendert, revisionAlleSeiten } }
  → { jobId }

GET /api/export/job/:id
  → { status: 'pending'|'running'|'done'|'error', progress: 0-100, error? }

GET /api/export/job/:id/download
  → File (PDF/DOCX/Fountain/FDX) als Stream
```

**In-Process Job Queue**: Einfache Map `jobId → JobState`. Kein Redis, kein Bull.
Jeder Job läuft in einer async-Funktion; Progress-Updates über einfache Zustandsmutation.
Jobs werden nach 10 Minuten automatisch aus der Map entfernt.

**Export-Log**: Jeder Export wird in `export_log` geloggt (wer, wann, was, welche Fassung, format, name).

---

## DOCX-Export

Library: `docx` npm-Paket (pure JS, keine System-Abhängigkeiten).

Absatzformat-Mapping: DK-Einstellungen Absatzformate → Word `ParagraphStyle` mit identischen Schrift- und Abstandseinstellungen.

Für Drehbuch: Scene Heading, Action, Character, Dialogue, Parenthetical als benannte Styles.
Für Storyline: Storyline-Absatzformate.
Für Notiz: Normal-Text mit einfachem Layout.

---

## Export-Panel UI

**Position**: Icon-Button (`Download`-Icon) rechts im Werkstufen-Header (neben Werkstufen-Menü).
**Keyboard**: `Ctrl+Shift+E`
**Form**: Side-Drawer, 380px, schließt über Escape oder X.

```
[Format-Tabs: PDF | DOCX | Fountain | FDX]

[PDF-Tab]
  Notiz-Seiten:  [✓ Titelseite] [✓ Synopsis] [✓ Recap] [✓ Precap] [✓ Custom-Notizen]
  Persönl. Ausdruck: [________________]  (leer = kein Ausdruck)
  Modus:         [● Normal]  [○ Replacement Pages]
    → [Replacement]: Vergleich mit [Dropdown] | Label ["Blaue Seiten"] | Farbe [#4A90D9 ●]
                     Seiten: [● Nur geänderte]  [○ Alle mit Markierungen]
  Dateiname:     [auto-generiert, editierbar]
  [Exportieren →]  ← Spinner + Progress-Bar während Job läuft

[DOCX-Tab]
  Werkstufen-Typen: Drehbuch, Storyline, Notiz
  Dateiname: [auto-generiert, editierbar]
  [Exportieren →]

[Fountain-Tab]
  Nur für Drehbuch-Werkstufen.
  Enthält: Szenenkopf, Action, Charakter, Dialog, Synopsen, Notizen
  [Exportieren →]

[FDX-Tab]
  Nur für Drehbuch-Werkstufen. Für Final Draft.
  [Exportieren →]
```

---

## Phasenplan

### Phase 1 — Neue Chips [ ]
- [ ] 3 neue PLACEHOLDER_DEFS in `sw-ui/editor/extensions/PlaceholderChipExtension.ts`
- [ ] Sync in `frontend/src/tiptap/PlaceholderChipExtension.ts`
- [ ] resolve-Fälle in `backend/src/utils/exportAssembler.ts` (ExportContext-Erweiterung)
- [ ] Preview-Mapping in `sw-ui/editor/KopfZeilenEditor.tsx`
- [ ] ChipsReferenzTab.tsx aktualisieren (Hilfe-Seite)
- [ ] Commit + Deploy

### Phase 2 — DB Migration + Job-Infrastruktur Backend [ ]
- [ ] Migration v81: `export_log`-Tabelle
- [ ] Migration in `backend/src/index.ts` registrieren
- [ ] `backend/src/utils/exportJobQueue.ts` — In-Process Job Queue
- [ ] `backend/src/routes/exports.ts` — POST /job, GET /job/:id, GET /job/:id/download
- [ ] Commit + Deploy

### Phase 3 — PDF-Export (Kern) [ ]
- [ ] `backend/src/utils/pdfAssembler.ts` — HTML-Builder (Notiz-Seiten + Drehbuch/Storyline)
  - DK-Einstellungen auslesen (Absatzformate, Kopf-/Fußzeile, Seitenformat)
  - Wasserzeichen (admin_settings)
  - Fortlaufende Seitennummerierung
  - Persönlicher Ausdruck
- [ ] Puppeteer-Integration (existierender Chrome-Pfad auf Server)
- [ ] Export-Log INSERT
- [ ] Tests (Playwright API)
- [ ] Commit + Deploy

### Phase 4 — Replacement Pages [ ]
- [ ] Diff-Logik: Szenen-Vergleich alte vs. neue Werkstufe
- [ ] HTML-Assembler: nur geänderte Seiten / alle mit Markierungen
- [ ] `*`-Marker rechts am Rand für geänderte Zeilen
- [ ] 4px farbiger linker Randstreifen (CSS border-left in Revisions-Farbe)
- [ ] `{{revision}}` + `{{revisions_farbe}}` in Header aufgelöst
- [ ] Tests
- [ ] Commit + Deploy

### Phase 5 — DOCX-Export [ ]
- [ ] `docx`-npm-Paket installieren
- [ ] `backend/src/utils/docxAssembler.ts`
  - Absatzformat-Mapping DK-Einstellungen → Word ParagraphStyle
  - Drehbuch: Szenenköpfe + Absatzformate
  - Storyline: Storyline-Absatzformate
  - Notiz: Plaintext mit Header
- [ ] Export-Log INSERT
- [ ] Tests
- [ ] Commit + Deploy

### Phase 6 — Fountain + FDX [ ]
- [ ] `backend/src/utils/fountainAssembler.ts`
  - Titelseite aus Folge-Metadaten
  - INT./EXT. + Motiv + DT → Scene Heading
  - Action, Charakter, Dialog aus Szenen-Content
  - Zusammenfassung → `= Synopsis`
  - Notiz-Feld → `[[notiz]]`
- [ ] `backend/src/utils/fdxAssembler.ts`
  - XML-Struktur <FinalDraft><Content>
  - Szenen-Nummern als Attribute
  - Paragraph Type="Scene Heading", "Action", "Character", "Dialogue" etc.
- [ ] Tests
- [ ] Commit + Deploy

### Phase 7 — Export-Panel UI [ ]
- [ ] `frontend/src/components/ExportPanel.tsx` — Side-Drawer
- [ ] Export-Button im Werkstufen-Header
- [ ] Keyboard-Shortcut `Ctrl+Shift+E` in shortcuts.ts registrieren
- [ ] Job-Polling (GET /job/:id alle 1s), Progress-Bar, Auto-Download bei done
- [ ] Commit + Deploy

### Phase 8 — Hilfe-Seite + Tests [ ]
- [ ] Hilfe-Seite: Export-Tab aktualisieren/neu
- [ ] Playwright E2E-Tests (PDF, DOCX, Fountain, FDX)
- [ ] Commit + Deploy

---

## Dateiname-Schema (auto-generiert)

```
[Produktionstitel] – [Folge] – [Werkstufen-Typ] V[Version] – [Datum]
Beispiel: Rote Rosen – 4402 – Drehbuch V3 – 2026-05-21
```

Für Replacement Pages:
```
Rote Rosen – 4402 – Drehbuch V3 – Blaue Seiten – Revisionsseiten
```

---

## Offene Entscheidungen (bereits geklärt)

- Seitennummerierung: fortlaufend (kein römisch-vorgelagert)
- Notiz-Werkstufen: default alle, abwählbar
- Replacement Pages: digitale Distribution → farbiger Randstreifen + `{{revisions_farbe}}`-Chip
- Export-Log: jetzt (Phase 2)
- Job-Queue: jetzt, in-process (Phase 2)
- UX: Progress-Bar im Panel, kein Notification-System
- Persönlicher Ausdruck: leeres Feld (kein Auto-Prefill)
- Word für Storyline: Absatzformate gemappt
- Fountain/FDX: nur Drehbuch-Werkstufen
