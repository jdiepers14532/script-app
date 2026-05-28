# Architektur — Modulares Methoden-System

**Datum:** 20. Mai 2026
**Kontext:** Analyse-Editor für `script.serienwerft.app`
**Status:** Konzept final, Grundlage für Briefing-V1 und Memory.md V2

---

## 1. Grundprinzip — Werkstatt statt Werkzeug

Der Analyse-Editor ist kein monolithisches KI-Tool mit einem "Analyse starten"-Button. Er ist eine **Werkstatt mit auswählbaren Methoden**. Jede Methode ist eine eigene Linse auf denselben Stoff und beantwortet eine andere strategische Frage.

Der Nutzer wählt vor jedem Run, welche Methoden laufen sollen. Das ermöglicht Kosten-Kontrolle, Methodenfokus je nach Anlass (Story-Edit vs. Pitching vs. Iterations-Review) und phasenweise Aktivierung neuer Methoden ohne Architektur-Umbau.

---

## 2. Die fünf Methoden

| # | Methode | Typ | Beantwortet | Phase |
|---|---|---|---|---|
| 1 | **Story-Consultant Pur** | LLM, ohne theoretischen Input | "Trägt der Block — unvoreingenommen beurteilt?" | 1 |
| 2 | **Story-Consultant Framework** | LLM, mit Vokabular der drei Paper | "Trägt der Block — gemessen an etablierten Dramaturgie-Modellen?" | 1 |
| 3 | **Toubia-Geometrie** | Embedding-basiert, kein LLM | "Springt die Episode zu wild? Ist der End-Sprung scharf?" | 3 |
| 4 | **Reagan-Arcs** | Sentiment-basiert, kein LLM | "Welcher Emotional-Arc pro Strang? Laufen alle synchron?" | 3 |
| 5 | **Rocchi-Isotopien** | LLM, enge Klassifikationsaufgabe | "Wie verteilt sich die narrative Biomass? Driftet die Identität?" | 2/3 |

### 2.1 Story-Consultant Pur vs. Framework — der methodische Sinn

Die beiden LLM-Methoden unterscheiden sich nur im System-Prompt:

- **Pur** bekommt nur die Grundaufgabe ("Bewerte diesen Block als erfahrener Head of Story"). Kein theoretisches Vokabular, keine Arc-Typologie, keine Frameworks. Der LLM nutzt sein gesamtes Trainingswissen unvoreingenommen.
- **Framework** bekommt das vollständige Vokabular: Reagan-Arc-Typen, Toubia-Konzepte, Rocchi-Isotopien, Pen/Cliff-Logik, Soap-Dramaturgie-Heuristiken.

**Warum beide?** Theorien fokussieren den Blick, aber sie verengen ihn auch. Ein LLM mit Reagans sechs Arc-Typen presst Stränge in sechs Schubladen — auch wenn ein Strang etwas tut, das in keine passt. "Pur" ist die Kontrolle gegen Theorie-Überanpassung: Wenn "Framework" einen Befund liefert, den "Pur" nicht sieht, ist der Befund möglicherweise ein Artefakt der Theorie. Wenn beide übereinstimmen, ist der Befund robust.

### 2.2 Cross-Validation als Kernwert

Der eigentliche Mehrwert der Methoden-Vielfalt liegt im **Vergleich der Ergebnisse**:

- Story-Consultant (LLM-Urteil) sagt "Franka-Strang ist Cinderella"
- Reagan-Arcs (Sentiment-Messung, methodisch unabhängig) sagt "Cinderella, 71% Confidence"
- → Übereinstimmung = starke Aussage

Wenn die Methoden sich widersprechen, ist das ein Signal, genauer hinzuschauen — kein Fehler, sondern Information. Das UI sollte Übereinstimmungen und Widersprüche zwischen Methoden explizit ausweisen.

---

## 3. Modulares Datenmodell

Statt einer Tabelle `block_analyses` mit einem einzigen `result_markdown` braucht es eine zweistufige Struktur: ein Run kann mehrere Methoden umfassen.

```sql
-- Ein Analyse-Lauf, ausgelöst durch einen Nutzer-Klick
CREATE TABLE analysis_runs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produktion_id       TEXT NOT NULL REFERENCES produktionen(id) ON DELETE CASCADE,
  block_nummer        INT NOT NULL,
  -- Hash über Werkstufen-Hashes + aufgelöste Folgen-Liste
  block_version_hash  TEXT NOT NULL,
  werkstufen_ids      JSONB NOT NULL,
  folgen_ids          JSONB NOT NULL,
  -- Welche Methoden wurden bei diesem Run angefordert
  requested_methods   JSONB NOT NULL,   -- ['story_consultant_pur', 'reagan_arcs', ...]
  -- Scope
  strang_filter       JSONB,            -- null = ganzer Block, sonst Array von strang_ids
  -- Metadaten
  created_by          TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  geloescht           BOOLEAN DEFAULT false
);

-- Ein Ergebnis pro Methode pro Run
CREATE TABLE analysis_method_results (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id              UUID NOT NULL REFERENCES analysis_runs(id) ON DELETE CASCADE,
  method              TEXT NOT NULL,    -- 'story_consultant_pur' etc.
  -- Markdown-Output (für LLM-Methoden)
  result_markdown     TEXT,
  -- Strukturierter Output (für quantitative Methoden, oder JSON-Mode-LLM)
  result_structured   JSONB DEFAULT '{}',
  -- Methoden-Metadaten
  method_version      TEXT NOT NULL,    -- 'story-consultant-pur-v1', 'reagan-v1' etc.
  status              TEXT NOT NULL DEFAULT 'pending',  -- pending|running|done|error
  error_detail        TEXT,
  duration_ms         INT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (run_id, method)
);

-- Cost-Logging pro Methode (nur für kostenpflichtige Methoden)
CREATE TABLE analysis_costs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  method_result_id    UUID REFERENCES analysis_method_results(id) ON DELETE CASCADE,
  provider            TEXT NOT NULL,    -- 'anthropic', 'mistral'
  model               TEXT NOT NULL,
  input_tokens        INT DEFAULT 0,
  output_tokens       INT DEFAULT 0,
  cache_read_tokens   INT DEFAULT 0,
  cache_write_tokens  INT DEFAULT 0,
  cost_eur_cent       INT NOT NULL,
  request_id          TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_runs_lookup ON analysis_runs (produktion_id, block_nummer, geloescht);
CREATE INDEX idx_runs_hash ON analysis_runs (block_version_hash);
CREATE INDEX idx_method_results_run ON analysis_method_results (run_id);
```

### 3.1 Caching-Logik mit modularem Modell

Cache-Granularität liegt auf **Methoden-Ebene**, nicht auf Run-Ebene. Wenn ein Nutzer heute Story-Consultant laufen lässt und morgen denselben Block mit Story-Consultant + Reagan, dann:

- Story-Consultant: Cache-Hit (gleiche `block_version_hash` + gleiche `method` + gleiche `method_version`)
- Reagan: Cache-Miss, wird neu berechnet

Lookup: `SELECT ... FROM analysis_method_results r JOIN analysis_runs run ON r.run_id = run.id WHERE run.block_version_hash = ? AND r.method = ? AND r.method_version = ? AND r.status = 'done'`

---

## 4. Gemeinsame Infrastruktur

Alle fünf Methoden teilen sich:

- **Block-Resolver** (`lib/blocks/resolver.ts`) — löst `produktion_id` + `block_nummer` zu Folgen-Range auf, via Produktionsdatenbank
- **Szenen-Loader** — lädt alle `dokument_szenen` der beteiligten Folgen
- **Scene-Renderer** (`lib/analysis/scene-renderer.ts`) — ProseMirror-JSON → Klartext
- **SSO-Middleware** — bestehende Auth
- **Frontend-Auswahl-Komponente** — das Methoden-Auswahl-Panel
- **Cost-Logger** — schreibt in `analysis_costs`

Methoden-spezifisch ist nur:

- der jeweilige Runner (`lib/analysis/methods/story-consultant-pur.ts`, `.../reagan-arcs.ts` etc.)
- das jeweilige UI-Rendering des Ergebnisses
- ggf. ein Python-Subprocess (Reagan, Toubia-lokal)

---

## 5. Frontend — Auswahl-Panel

Vor jedem Run zeigt das Tool ein Auswahl-Panel:

```
Block 900 — Analyse starten

Methoden:
☑ Story-Consultant Pur            ~90s · ~2 €
☐ Story-Consultant Framework      ~90s · ~2 €
☐ Toubia-Geometrie                ~10s · ~0,05 €
☐ Reagan-Arcs                     ~30s · lokal, ~0 €
☐ Rocchi-Isotopien                ~60s · ~0,50 €

Geschätzte Gesamtkosten: ~2 €

Umfang:
☑ Ganzer Block
☐ Nur ausgewählte Stränge: [Strang-Picker]

[Analyse starten]
```

- Kosten werden live aufsummiert
- In Phase 1 sind nur Methode 1 und 2 aktiv, der Rest ist ausgegraut mit "ab Phase 3"
- Strang-Filter ist nur aktiv, wenn für die Produktion Strang-Zuordnungen existieren (Phase 2+)

---

## 6. Strang-Modell

### 6.1 Stränge sind Produktions-Ebenen-Entitäten

Ein Strang (`straenge`-Tabelle, v61) existiert auf Produktionsebene, weil er sich über mehrere Blöcke ziehen kann. "Flora/Raphael/Tom" ist ein Eintrag, nicht pro Block ein neuer.

### 6.2 Zwei Arbeitsmodi am selben Strang

Die Unterscheidung Future-Strang vs. Block-Strang ist **kein** Typ-Unterschied, sondern ein **Arbeitsmodus-Unterschied**, abgebildet über `strang_beats.ebene`:

- **Future-Modus** — vorausschauende Planung. Arbeitet mit `strang_beats` der Ebene `future` und `block`. Hier entsteht die Strang-Bibel.
- **Block-Modus** — konkrete Ausarbeitung in einem Block. `strang_beats` der Ebene `folge`, Szenen-Zuordnung über `dokument_szenen_straenge`.

Das v61-Schema deckt beide Modi ab, ohne Änderung. Die UI bietet zwei Ansichten:

- **Strang-Bibel-Ansicht** — Future- und Block-Beats, vorausschauend, ein Strang über mehrere Blöcke
- **Block-Arbeits-Ansicht** — ein Block, alle Stränge, Szenen-Zuordnung

### 6.3 Strang-Management-UI (neue Phase 1.5)

Die `straenge`-Tabellen existieren seit v61, aber es gibt **keine UI** zum Befüllen. Aktuell managen Storyliner Stränge außerhalb des Tools. `future_notizen`, `redaktionelle_kommentare`, `produktionelle_kommentare` sind daher leer.

Daraus folgt eine eigene **Phase 1.5 — Strang-Management-UI**:

- CRUD für Stränge einer Produktion
- Szenen-zu-Strang-Zuordnung (Multi-Select oder Drag-and-Drop)
- Pflege der drei Textfelder pro Strang
- Pflege der `strang_beats` (Future/Block/Folge)
- **Multi-User-Editing** — alle haben Zugriff, gleichzeitiges Bearbeiten muss funktionieren (Last-Write-Wins als Minimum, optimistisches Locking als Kür)

Phase 1.5 braucht keinen LLM-Zugriff — reines CRUD auf bestehenden Tabellen. Kann parallel zu Phase 1 entwickelt werden. Sobald sie steht und Storyliner anfangen, Stränge zu pflegen, sammeln sich die Daten an, die Phase 2 nutzt.

### 6.4 Cross-Block-Strang-Ansicht

Eine Ansicht "Strang X über Block 899–902" ist wünschenswert. Datenstrukturell deckt v61 das ab. UI-Priorität: Phase 2 oder später (zu klären).

---

## 7. Phasen-Übersicht (aktualisiert)

| Phase | Inhalt | LLM | Dauer |
|---|---|---|---|
| **1** | Verkabelung: Story-Consultant Pur + Framework, modulares Datenmodell, Auswahl-Panel | ja | 1–2 WE |
| **1.5** | Strang-Management-UI (parallel zu Phase 1 möglich) | nein | ~1 WE |
| **2** | Rocchi-Isotopien-Klassifikation, Strang-spezifische Analysen, JSON-Output | ja | 2 W |
| **3** | Reagan-Arcs + Toubia-Geometrie (Python-Subprocess, Embeddings) | teils | 2 W |
| **4** | Diff-View, Block-Report-Export (docx/PDF) | nein | 1 W |
| **5** | Verzahnungs-Graph, Cross-Block-Features | nein | 2 W |
| **6** | Methoden-Veröffentlichung (optional) | — | offen |

---

## 8. Technologie-Entscheidungen

| Komponente | Technologie | Begründung |
|---|---|---|
| Backend-Kern | Node.js / TypeScript | bestehender Stack |
| Datenbank | PostgreSQL | bestehender Stack, JSONB, kein SQLite |
| LLM | Anthropic Claude Opus 4.7, EU-Endpoint | prompt caching, AVV |
| Sentiment (Reagan) | Python-Subprocess, BAWL-R-Lexikon primär | kontinuierliche Skala, Reagan-methodisch korrekt, kein GPU nötig |
| Embeddings (Toubia) | Mistral-Embed via API (EU/Paris) | EU-gehostet, ~0,003 €/Block, kein lokales Modell-Hosting |
| Embeddings-Fallback | lokales SBERT (Python) | dokumentiert, falls Mistral-Pricing sich ändert |
| Python-Integration | Subprocess via `child_process.spawn` | eine Deployment-Einheit, kein zweiter Service |

Python läuft als Subprocess, nicht als eigener Dienst. Bei steigender Aufruffrequenz (Phase 4 Live-Bewertung) Migration zu persistentem Python-Worker via Unix-Socket — klarer Pfad, kein Refactoring.

**Kein Architektur-Sprawl:** Keine eigene Subdomain `arc-analyzer.serienwerft.app`, keine zweite Datenbank. Alle Methoden sind Module im bestehenden `script.serienwerft.app`-Backend.

---

## 9. Offene Punkte

1. Cross-Block-Strang-Ansicht — Phase 2 oder später?
2. BAWL-R-Coverage auf echtem Soap-Material — Test in Phase 3
3. Optimistisches Locking für Multi-User-Strang-Editing — Phase 1.5 Minimum ist Last-Write-Wins
4. DSGVO: Anthropic-EU-Routing für den Account bestätigen
