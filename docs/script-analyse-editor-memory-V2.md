# script.serienwerft.app — Analyse-Editor

> **Status:** Konzept-V1, geschrieben aus der konkreten Erfahrung der Block-900-Analyse (Rote Rosen S25)
> **Stack:** Node.js, SQLite, PM2, nginx auf IONOS VPS — Anthropic API direkt eingebettet, kein Claude Code als Runtime
> **DSGVO:** EU-Provider (Anthropic EU-Endpoint primär, Mistral als Fallback für Modelle, die nicht über AWS Frankfurt routen)
> **SSO:** auth.serienwerft.studio
> **Datenherkunft:** Bestehende Import-Funktion liefert strukturierte Szenen (Szenenkopf, Body, Metadaten)

---

## 1. Zweck und Abgrenzung

Der Analyse-Editor ist **keine** Schreibumgebung. Schreiben passiert im bestehenden TipTap/ProseMirror-Editor von script.app. Der Analyse-Editor ist eine **parallele Sicht** auf vorhandene Treatments, die strukturelle Dramaturgie-Bewertung in produktionsverwertbarer Form liefert: pro Szene, pro Strang, pro Block.

**Use Cases:**

1. **Story-Edit-Session vorbereiten** — Head of Story bekommt vor dem Meeting eine Übersicht: welche Stränge stagnieren, wo sind redundante Beats, wo fehlt Subtext.
2. **Block-Abnahme** — Writer Producer prüft vor der Freigabe: trägt der Block, sind die Cliffs richtig gewichtet, gibt es serielles Suchtpotenzial.
3. **Iterations-Review** — beim Vergleich V1 → V2 → V3 eines Treatments sehen, welche Wendepunkte dazugekommen sind, welche Stränge verbessert wurden, welche neu stagnieren.
4. **Pitching** — automatische Generierung von Strang-Zusammenfassungen für Sender-Kommunikation.

Der Editor **ersetzt nicht** das Urteil des Head of Story. Er macht **sichtbar**, was sonst nur in den Köpfen ist.

### 1.1 Wiederholung ist im Daily-Soap-Format kein Bug

Das Daily-Soap-Format unterscheidet sich grundlegend von Primetime-Serial-Storytelling. Jason Mittell (NYU/Middlebury) hat das 2007 prägnant formuliert: *Events are narrated to audiences with a great deal of redundancy, not only to ensure that all viewers share sufficient story knowledge, but also to explore how the retelling of an event impacts the web of relationships that comprise the centerpiece of any soap opera's storyworld.* Bestätigt durch die Genre-Konventionen, die mehrfache Industrie-Quellen festhalten: tägliche Soaps öffnen typischerweise mit Recaps, transportieren Schlüsselinformationen über mehrere Figurenpaarungen, und nutzen Wiederholung als Beziehungs-Resonanzraum.

Konsequenz für das Tool: Eine naive "Redundanz-Erkennung" markiert zu viel als problematisch. Der Analyse-Editor muss **drei Arten von Wiederholung unterscheiden**:

| Typ | Beschreibung | Bewertung |
|---|---|---|
| **Recap-Redundanz** | Gleicher Inhalt, andere Figurenpaarung über Episoden hinweg (Bsp.: Flora erzählt Franka vom Kuss in 4488.10, Raphael erzählt Gisela in 4488.7) | strukturell nötig — bedient Zuschauer mit Episoden-Lücken |
| **Beziehungs-Web-Redundanz** | Gleiche Information wird von mehreren Figuren aufgenommen, baut emotionale Resonanz | dramaturgisch erwünscht, das ist Mittells Punkt |
| **Echte Dialog-Redundanz** | Gleiche Figurenpaarung, gleiche Episode, keine neue Information, kein neuer Subtext (Bsp.: 4488.10 und 4488.21 — Flora gesteht Franka in derselben Episode zweimal dasselbe) | problematisch — eine der zwei Szenen ist verschwendeter Slot |

Operationale Regel im Tool: Eine Szene wird nur dann als problematische Redundanz markiert, wenn sie **alle drei Bedingungen** erfüllt:
1. Gleiche Figurenpaarung wie eine andere Szene desselben Strangs
2. In derselben Episode oder im selben Block-Halb
3. Keine neue Information, kein neuer Subtext, keine Eskalationsstufe gegenüber der vorherigen Szene

Variante 1 und 2 (Recap, Beziehungs-Web) werden nicht als Warnung markiert, sondern in einem eigenen Feld erfasst: "Recap-Funktion erfüllt: ja/nein". Das hilft dem Writer Producer beim Pitchen ("dieser Block bedient Wenig-Seher in 4 Recap-Szenen") und beim Identifizieren von Lücken ("der Franka-Trauma-Strang wird nur Mo gegenüber kommuniziert — wenn Mo eine Folge fehlt, weiß niemand Bescheid").

---

## 2. Architektur (Hypothese V1)

```
                    Treatment im
                    bestehenden
                    script.app-Editor
                    (TipTap/ProseMirror)
                            │
                            ▼
                    Import-Funktion
                    (existiert bereits)
                            │
                            ▼
            Strukturierte Szenen-Daten in SQLite
                    (block, episode, scene_id,
                     location, characters, code,
                     one_liner, body, pen_cliff_flag)
                            │
                ┌───────────┴───────────┐
                ▼                       ▼
         Analyse-Editor          Andere bestehende
         (neues Modul)           Tools (Live-Dispo etc.)
                │
                ├─► Prompt-Builder
                │   (System-Prompt + Block-Kontext
                │    + Strang-Filter + Caching-Tag)
                │
                ├─► Anthropic API
                │   (mit prompt caching, max_tokens
                │    nach Analyse-Tiefe)
                │
                ├─► Post-Processor
                │   (JSON-output → DB-Persistierung)
                │
                └─► UI-Renderer
                    (Heatmaps, Tabellen, Plots)
```

### 2.1 Komponenten-Trennung

- **Prompt-Builder** (`/lib/prompt-builder.js`) — baut den Analyse-Prompt aus modularen Bausteinen (System-Prompt-Header, Treatment-Kontext, Analyse-Typ). Nutzt Anthropics prompt caching für den langen System-Prompt-Header (ca. 6000 Tokens). Cache-TTL: 5 Minuten zwischen Sessions, 1h innerhalb einer Session.

- **Szenen-Parser** (existiert bereits) — liefert strukturierte Szenen-Objekte.

- **Analyse-Runner** (`/lib/analysis-runner.js`) — orchestriert API-Calls. Drei Modi:
  - `per-scene` (eine Szene → Score-Card, max 800 Tokens Output)
  - `per-strang` (ein Strang über einen Block → Beat-Tabelle + Wissenschaftliche Analyse, max 4000 Tokens)
  - `per-block` (Vollanalyse über alle Stränge, max 16000 Tokens — der hier vorliegende Bericht)

- **Persistenz-Layer** (`/db/analyses.sqlite`) — speichert jede Analyse mit Verknüpfung zu Treatment-Version. Tabellen:
  - `analyses` (id, treatment_version_id, type, block, created_at, claude_model, tokens_used)
  - `scene_scores` (analysis_id, scene_id, attraktivitaet, serien_wert, action, notes)
  - `strang_diagnoses` (analysis_id, strang_name, vonnegut_shape, pacing_score, semantic_volume, circuitousness, escalation_quality, schwaechen)
  - `block_summary` (analysis_id, dominanter_arc, treibende_straenge, stagnierende_straenge, top_drei_empfehlungen)

- **UI-Renderer** (`/views/analysis/`) — rendert die Daten in:
  - Strang-Heatmap (SVG)
  - Szenen-Score-Tabelle (HTML-Table mit Sortierung/Filter)
  - Figuren-Agency-Matrix (SVG)
  - Vonnegut-Arc-Chart (SVG)
  - Diff-View (zwei Analysen nebeneinander)

### 2.2 Warum nicht Claude Code als Runtime

Claude Code ist ein interaktives CLI-Tool für Entwicklerinteraktion. Der Analyse-Editor ist ein produktiver Service, der:
- auf Benutzer-Klick im UI startet, nicht in einer Terminal-Session
- multi-tenant arbeitet (mehrere Writer Producer parallel)
- Ergebnisse in eine Datenbank persistiert
- Wiederholbare, deterministische API-Calls macht (kein agentisches Tool-Use, kein Filesystem-Zugriff)

Direkter API-Call ist einfacher, billiger, schneller. Geschätzter Aufwand: 1–2 Wochenenden für Prototyp, 2–4 Wochen für sauberen Production-Build.

---

## 3. Datenmodell

### 3.1 Szenen-Eingangsformat (aus Import)

```json
{
  "scene_id": "4487.29",
  "block": "900",
  "episode": "4487",
  "scene_number": 29,
  "studio": "Außendreh",
  "location": "A. D. Stadtcafé",
  "characters": ["Flora", "Raphael"],
  "code": "E/T53",
  "one_liner": "Flora gibt sich einem leidenschaftlichen Kuss mit Raphael hin...",
  "body": "Feierabend. Das Café ist leer...",
  "pen_cliff_flag": "CLIFF",
  "status_quo": null,
  "anschluss": "Direkter Anschluss an 4486.32",
  "treatment_version_id": "uuid"
}
```

### 3.2 Strang-Zuordnung

Stränge sind **nicht** automatisch identifizierbar. Sie müssen entweder:

(a) **Manuell getaggt** werden (Writer Producer markiert Szenen während/nach dem Schreiben mit Strang-Labels)

(b) **Halbautomatisch geclustert** werden (Claude bekommt alle Szenen eines Blocks und schlägt Strang-Cluster vor, der Mensch korrigiert)

(c) **Aus Figuren-Co-Occurrence inferiert** werden (z.B. Flora+Raphael in 60% der Szenen → eigener Strang)

**Empfehlung:** Variante (b) — Claude schlägt vor, Mensch korrigiert in einer dedizierten "Strang-Definition"-UI. Einmal pro Block. Resultat wird in `straenge` gespeichert:

```json
{
  "strang_id": "uuid",
  "block": "900",
  "label": "Flora/Raphael/Tom",
  "scene_ids": ["4487.1", "4487.7", "4487.10", "4487.18", "4487.21", ...],
  "color": "#E24B4A"
}
```

### 3.3 Analyse-Output-Schema

Claude wird explizit angewiesen, JSON zurückzugeben (mit Schema-Validierung serverseitig). Beispiel `per-strang`:

```json
{
  "strang": "Flora/Raphael/Tom",
  "block": "900",
  "dramaturgische_funktion": "Liebesdreieck unter umgekehrtem Vorzeichen...",
  "leitfrage": "Wem gehört Floras Herz wirklich?",
  "vonnegut_shape": "icarus-doppelpeak",
  "pacing_score": 8,
  "semantic_volume": 9,
  "circuitousness": 3,
  "escalation_quality": 9,
  "zustandsaendernde_szenen": [
    {"scene_id": "4487.29", "beat": "Tabubruch", "irreversibility": 10}
  ],
  "redundante_szenen": [
    {"scene_ids": ["4488.10", "4488.21"], "reason": "doppelte Beichte"}
  ],
  "beat_table": [
    {
      "scene_id": "4487.29",
      "ziel": "Café schließen",
      "konflikt": "Raphael kommt unbedingt",
      "wendung_neue_info": "Tabubruch: der Kuss",
      "attraktivitaet": 10,
      "serien_wert": 10,
      "action": "behalten",
      "notes": "körperlicher Akt, nicht rückgängig"
    }
  ],
  "schwaechen": ["zu wenig moralischer Konflikt zwischen Flora und Raphael selbst..."],
  "verbesserungsvorschlaege": [
    {
      "scene_id": "4488.13",
      "vorschlag": "Konfrontationsszene: Flora wirft Raphael vor...",
      "begruendung": "Raphael ist zu glatt..."
    }
  ]
}
```

---

## 4. UI-Konzept

### 4.1 Drei Ebenen, drei Sichten

**Mikro — Szenen-Score-Card** (rechter Editor-Rand)
Live während des Schreibens. Bewertet eine Szene im Kontext ihres Strangs.
- Score-Badges: Attraktivität, Serien-Wert
- Diagnose-Snippet (max 2 Sätze)
- Action-Empfehlung (behalten / kürzen / streichen / Setup ergänzen)
- "Alternative generieren"-Button

**Meso — Strang-Panel** (eigenes Panel)
Auswahl: Strang × Block. Zeigt:
- Heatmap-Zeile (5 Episoden mit Druck-Score)
- Vonnegut-Arc-Kurve
- Beat-Tabelle (alle Szenen des Strangs in diesem Block)
- Schwächenliste
- Verbesserungsvorschläge

**Makro — Block-Report** (eigene Seite, exportierbar als docx)
Die hier vorliegende Vollanalyse als generierter Report.

### 4.2 Diff-View (für Iterations-Review)

Zwei Analysen nebeneinander, mit Markierung der Veränderungen:
- Welche Szenen wurden umgeschrieben? (mit Score-Veränderung)
- Welche neuen Wendepunkte sind dazugekommen?
- Welche Stränge sind besser geworden, welche schlechter?
- Globaler Score-Delta

### 4.3 Strang-Verzahnungs-Graph

Netzwerk-Visualisierung: Knoten = Szenen, Kanten = Setup-Payoff-Beziehungen oder Strang-Verbindungen. Hilft beim Entdecken von verzahnten Beats (z.B. wenn Felix' KI-Bemerkung in 4490.10 Frankas KI-Befragung in 4490.17 vorbereitet).

---

## 5. Prompt-Engineering

### 5.1 System-Prompt-Architektur (mit prompt caching)

```
[CACHED — System-Prompt-Header, ca. 6000 Tokens]
- Definition Head of Story / Story Consultant Rolle
- Bewertungs-Frameworks (Reagan/Vonnegut, Toubia/Berger/Eliashberg,
  Soap-Dramaturgie, Pen/Cliff-Logik)
- Output-Schema (JSON-Format-Spezifikation)
- Bewertungs-Skalen (1–10 für Attraktivität, Serien-Wert, etc.)
- Beispiele für hochwertige Diagnosen

[CACHED — Block-Kontext, ca. 30000–60000 Tokens je nach Episodenzahl]
- Alle Treatments des Blocks (Treatment-Volltext)
- Strang-Definitionen (welche Szenen gehören zu welchem Strang)
- Figuren-Datenbank-Auszug (relevante Charakterhintergründe)

[NICHT CACHED — Analyse-Anweisung, ca. 200–800 Tokens]
- Analyse-Typ (per-scene / per-strang / per-block)
- Spezifisches Ziel (z.B. "analysiere Strang Flora/Raphael")
- Output-Constraints (Token-Limit, Detailgrad)
```

Cache-Effekt: ein vollständiger Block-Analyse-Run kostet einmal ~40000 Input-Tokens, Folge-Runs in derselben Session kosten nur die Differenz (Anweisungs-Tokens). Bei 5 Strang-Analysen + 1 Block-Report spart das ca. 80% der Input-Token-Kosten.

### 5.2 JSON-Output erzwingen

Anthropic API mit `tool_use` als Output-Constraint statt freier Text-Output. Pro Analyse-Typ ein Tool-Schema definiert. Garantiert valide JSON-Antworten, die ohne Regex-Parsing direkt in die DB geschrieben werden können.

### 5.3 Strang-Definition-Prompt (Initial-Setup pro Block)

Ein separater Lightweight-Call vor der eigentlichen Analyse: Claude bekommt die Szenen-Liste mit Figuren und schlägt Cluster vor. Output: Strang-Vorschläge mit Confidence-Score. Mensch reviewt, korrigiert, speichert. Danach läuft jeder Analyse-Call mit dieser Strang-Definition.

---

## 6. Roadmap

### Phase 1 — Prototyp (1–2 Wochenenden)
- Direkte Anthropic-API-Integration ins bestehende Node.js-Backend
- Ein-Klick-Auslöser im Treatment-View: "Analyse starten"
- System-Prompt mit dem Story-Consultant-Framework
- Output als Markdown im Browser, kein UI-Polish
- Persistierung in einer Tabelle (`analyses`), keine Strang-Trennung
- Test mit einem realen Block (z.B. dem hier analysierten Block 900)

**Acceptance:** Eine Analyse, die der manuellen entspricht, generiert in ~3 Minuten Compute-Zeit, kostet ~3–5€ in API-Tokens.

### Phase 2 — Strang-Trennung und JSON-Output (2 Wochen)
- Strang-Definition-UI (Cluster-Vorschlag + manuelle Korrektur)
- JSON-erzwingende Tool-Schemas für drei Analyse-Typen
- DB-Schema mit Strang-Verknüpfung
- Erste Visualisierungen (Heatmap, Beat-Tabelle) im UI

**Acceptance:** Writer Producer kann pro Strang eine eigene Analyse starten und die Beat-Tabelle als sortierbare HTML-Tabelle sehen.

### Phase 3 — Diff-View und Iteration (1 Woche)
- Versionierung von Treatments (Verknüpfung mit existierender Versionierung)
- Diff-Algorithmus zwischen zwei Analysen
- Visual-Diff für Beat-Tabellen
- Score-Delta-Anzeige

**Acceptance:** Vergleich V1 vs V2 eines Blocks zeigt Veränderungen in <5 Sekunden.

### Phase 4 — Live-Mikro-Bewertung (2 Wochen)
- Inline-Score-Card im TipTap-Editor (rechter Rand)
- Debounced Analyse pro Szene während des Schreibens (10s Cooldown)
- "Alternative generieren"-Button mit zwei Vorschlägen pro Szene

**Acceptance:** Beim Schreiben einer Szene erscheint nach 10s automatisch eine Score-Card. Cost-pro-Szene ~0.01€.

### Phase 5 — Block-Report-Export (1 Woche)
- docx-Generator analog zu diesem Report
- PDF-Variante mit eingebetteten SVG-Visualisierungen
- E-Mail-Versand an Story-Edit-Verteiler

**Acceptance:** Klick auf "Block-Report" generiert in <30 Sekunden eine versendbare docx-Datei.

### Phase 6 — Verzahnungs-Graph und Stagnation-Warnung (2 Wochen)
- Setup-Payoff-Erkennung über Block-Grenzen
- Strang-Verzahnungs-Graph als interaktive SVG
- E-Mail-Alert wenn ein Strang über 2 Blöcke ohne Beat stagniert

---

## 7. Kosten-Schätzung

Anthropic Claude Opus 4.7 Pricing (Stand Mai 2026):
- Input: ~$15/M Tokens
- Output: ~$75/M Tokens
- Cached Input: ~10% des normalen Input-Preises

Pro Block-Vollanalyse (5 Episoden):
- Input: ~60000 Tokens (erstmalig), bei Caching ~6000 effektiv
- Output: ~16000 Tokens
- Geschätzte Kosten: erstmalig ~$2, mit Caching ~$1.30

Pro Strang-Analyse:
- Input: ~3000 effektiv (mit Block-Cache)
- Output: ~4000 Tokens
- Geschätzte Kosten: ~$0.35

Pro Szenen-Score-Card:
- Input: ~500 effektiv
- Output: ~300 Tokens
- Geschätzte Kosten: ~$0.03

Bei aktiver Produktion (1 Block pro Woche, 6 Strang-Analysen, 100 Szenen-Cards): ca. 25€/Monat. Bei DSGVO-konformem Routing über Anthropic EU-Endpoints ein vertretbarer Posten.

---

## 8. DSGVO und Datenschutz

- Treatment-Inhalte werden über Anthropic API verarbeitet, primär EU-Endpoint (AWS Frankfurt) — Auftragsverarbeitungsvertrag liegt vor (Anthropic-AVV).
- Keine Speicherung bei Anthropic über die API-Call-Dauer hinaus (Zero Data Retention für Enterprise-Verträge — abklären).
- Personenbezogene Daten in Treatments (Figurennamen) sind fiktional, keine echten Personen — kein PII-Risiko.
- Fallback-Provider Mistral (Frankreich-Hosting) für Komponenten, die nicht über Anthropic laufen müssen (z.B. simple Klassifikations-Aufgaben).
- Server-Logs anonymisieren (keine Treatment-Inhalte in Logs).

---

## 9. Integration in bestehende Tools

### 9.1 SSO via auth.serienwerft.studio
Wiederverwendung der bestehenden OAuth-Flow. Rollen:
- `writer-producer` — Vollzugriff
- `story-edit` — Vollzugriff
- `storyliner` — Lesezugriff auf eigene Strang-Analysen
- `script-edit` — Lesezugriff auf Episoden-Analysen

### 9.2 Verzahnung mit vertraege.serienwerft.app
Bei Strang-Analyse: automatischer Abgleich, welche Schauspieler welche Episoden im Vertrag haben. Warnung wenn ein Strang Szenen für einen Schauspieler vorsieht, der laut Vertrag nicht verfügbar ist.

### 9.3 Verzahnung mit Live-Dispo
Wenn der Analyse-Editor "redundante Szene streichen" empfiehlt, prüft die Live-Dispo-Schnittstelle, ob die Szene bereits gedreht ist. Falls ja, Hinweis: "Szene 4488.21 bereits gedreht — Streichung erzeugt Schnittwaste". Schützt vor späten Empfehlungen, die produktionsökonomisch nicht mehr durchsetzbar sind.

---

## 10. Offene Entscheidungen

1. **Strang-Definition: manuell vs. Auto-Cluster?** Empfehlung: Auto-Cluster als Vorschlag, manuelle Korrektur. Aber: braucht UI-Aufwand für die Korrektur. Alternative: nur manuelles Tagging, einfacher zu bauen, aber mehr Aufwand pro Block.

2. **Live-Mikro-Bewertung wirklich sinnvoll?** Risiko: Writer Producer fühlen sich von Claude permanent überwacht. Alternative: Mikro-Bewertung nur auf Knopfdruck, nicht automatisch. Erwarte Stimmungsbild aus Phase 1.

3. **Export-Formate:** docx ist klar. PDF? HTML-Report? Notion-Embed?

4. **Multi-User-Sessions:** Wenn zwei Story-Editoren parallel an demselben Block arbeiten, brauchen sie verschiedene Analysen-Branches oder eine geteilte Analyse?

5. **Vertonungs-Feature später:** Audio-Generierung einer Analyse-Zusammenfassung (Claude liest die Top-3-Empfehlungen vor) — nice-to-have für mobile Konsumation während Pendelzeit.

---

## Anhang — Konkrete Engpässe aus der Block-900-Analyse

Diese Punkte sind in der Analyse aufgetaucht und ergeben direkte Feature-Anforderungen:

1. **Redundanz-Erkennung manuell mühsam** — Ich musste z.B. 4488.10 und 4488.21 selbst als doppelte Beichte identifizieren. Auto-Marker via semantischer Ähnlichkeit pro Strang wäre wertvoll. **Wichtig:** Marker muss zwischen drei Wiederholungs-Typen unterscheiden (siehe 1.1) — gleiche Figurenpaarung + gleiche Episode + kein neuer Beat = problematisch; andere Figurenpaarung über Episoden = Recap-Funktion, soll als Stärke ausgewiesen werden.

8. **Recap-Coverage pro Strang fehlt** — Wenn nur eine einzige Figur in einen Strang eingeweiht ist (z.B. Franka teilt das Trauma in 4490.13 mit Flora und sonst niemandem), wird der Strang fragil. Ein "Wer-weiß-was"-Tracker pro Strang würde sichtbar machen, ob die Information genügend Beziehungs-Knoten hat, um auch bei Episoden-Lücken anzukommen.

2. **Slot-Budget-Tracking fehlt** — Gunter/Elle hat 14 Slots für einen Witz gebraucht. Eine Slot-Budget-Ansicht pro Strang würde solche Disbalancen auf einen Blick zeigen.

3. **Setup-Payoff-Beziehungen schwer zu tracken** — Z.B. 4490.10 (Felix lobt KI) ist Setup für 4490.17 (Franka befragt KI). Ein Verzahnungs-Graph würde solche Beziehungen sichtbar machen.

4. **Cliff-Hierarchie pro Block** — Beim Bewerten musste ich mental alle 5 Episodenenden vergleichen, um zu sagen, dass 4490.31 der schwächste ist. Eine Sortierung mit Vorschlägen für Tausch (4490.30 PEN → CLIFF, 4490.31 CLIFF → PEN) wäre direkt aus dieser Analyse umsetzbar.

5. **Strang-Resets erkennen** — Kris' Nachfolge-Absage in 4489.26 wird in 4490.12 in einer Szene aufgelöst. Ein "Reset-Detector" (Konflikt etabliert → in N Szenen aufgelöst ohne Eskalation) würde solche Strang-Kollapse markieren.

6. **Subtext-Quote pro Block** — Ich habe diagnostiziert, dass Gunter/Elle keinen Subtext hat. Eine automatische Quote (Anteil Szenen mit Subtext vs. expliziter Aussprache) wäre eine harte Metrik für eine sonst weiche Diagnose.

7. **"Was steht für die Figur auf dem Spiel"-Auswertung** — Pro Strang sollte das Tool zwingen, die Fallhöhe zu benennen. Wenn Carla im Mittelteil keine Antwort hat — Warnung.

Alle sieben Punkte landen in den P0/P1-Features oben.