# Umsetzungsplan – Story-Planungsbereich (`/planung`)

> **Zielgruppe:** Claude Code (Implementierung).
> **Begleitdokument:** `KONZEPT.md` (Fachkonzept). Dieses Dokument ist der technische Plan.
> **Grundregel:** Bestehende Muster wiederverwenden, nichts still schreiben (Human-in-the-loop), pro Schritt erst Ist-Zustand prüfen, dann bauen.

---

## 0. Verbindliche Leitplanken

- **Eigener Frontend-Bereich** unter Route `/planung` (React 18 + TS + Vite + React Router v6 + Tiptap). Eigener Menüpunkt, eigene Komponenten, geteilte API/Auth/DB. Der bestehende Editor wird **nicht** verändert.
- **DnD:** `@dnd-kit` einführen (es gibt heute keine DnD-Lib; nur Vanilla-DnD in `SceneList.tsx`). In einem geteilten Wrapper kapseln, den Future-Board **und** Gantt nutzen.
- **KI nie generativ:** nur strukturieren / abgleichen / prüfen. Jeder KI-Call wird in `ki_audit_log` protokolliert. `recordUsage` (Token-Aggregat) bleibt parallel.
- **Wiederzuverwendende Muster (verifiziert vorhanden):**
  - Preview/Commit-Import → `rollenprofil-import.ts` (Preview ohne DB-Write, Commit schreibt user-editiertes JSON)
  - Snapshot-Versionierung → `werkstufen_snapshots` (v140): Header-Tabelle + Content-Tabelle + Restore
  - Review-UI (Accept/Reject pro Item) → `SearchReplaceDialog.tsx` + `useSearchReplace`-Hook → als generisches `KiVorschlagReviewPanel` extrahieren
  - Async/Langläufer → Analysis-Runner (`setImmediate` fire-and-forget, Client pollt `GET /run/:id`, Ergebnis als JSONB)
  - KI-Aufruf → `ki.ts` (`getProviderApiKey`, `recordUsage`), strukturierter Output via `###JSON_START###…###JSON_END###` + `parseKiSections`
  - OCR/Parsing → Mistral OCR (`mistral-ocr-latest`, liefert Markdown mit Tabellen), `pdf-parse`, `mammoth` (DOCX), Multer memoryStorage (20 MB)
  - Block-Auflösung → `lib/blocks/resolver.ts` → `resolveBlock()` liefert `folge_ids`; Blöcke aus `GET /api/produktionen/:id/bloecke`
- **Auth/Rechte:** alle Routes unter `authMiddleware`. Freigabe-Akt role-gated via `requireRole(...)` (Muster: `watermark-admin.ts`, `app-settings.ts`). Admin-Konfig ggf. `requireDkAccess()` (Muster: `rollen-freigabe.ts`).

---

## 1. Datenmodell – alle Änderungen gesammelt

> Reihenfolge der Migrationen entspricht den Schritten in Kapitel 2. **Feldtypen/Constraints vor jeder Migration gegen das reale Schema verifizieren.**

```sql
-- === Schritt 1: Beat-Migration ===
ALTER TABLE strang_beats ADD COLUMN IF NOT EXISTS prosa_text TEXT;     -- ausformuliert
ALTER TABLE strang_beats ADD COLUMN IF NOT EXISTS block_nummer INT;    -- echte Nr (ProdDB)
-- beat_text bleibt = Kurztext fürs Raster
-- block_label entfernen — ACHTUNG: future-import & raster-generieren schreiben es noch.
--   Erst diese beiden Endpunkte auf block_nummer umstellen, DANN:
ALTER TABLE strang_beats DROP COLUMN block_label;

CREATE TABLE beat_charaktere (
  beat_id      UUID REFERENCES strang_beats(id) ON DELETE CASCADE,
  character_id UUID REFERENCES characters(id)   ON DELETE CASCADE,
  rolle        TEXT CHECK (rolle IN ('haupt','neben','erwaehnt')),
  PRIMARY KEY (beat_id, character_id)
);

-- === Schritt 4: Versionierung & Import ===
CREATE TABLE future_versionen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produktion_id TEXT REFERENCES produktionen(id),
  zeitraum TEXT,                         -- z.B. "Blöcke 845–856"
  label TEXT, notiz TEXT,
  snapshot_json JSONB,
  freigabe_status TEXT DEFAULT 'entwurf' CHECK (freigabe_status IN ('entwurf','freigegeben')),
  freigegeben_von TEXT, freigegeben_am TIMESTAMPTZ,
  erstellt_von TEXT, erstellt_am TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE konzept_versionen ( -- analog, staffelweit
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produktion_id TEXT REFERENCES produktionen(id),
  staffel TEXT, label TEXT, notiz TEXT,
  snapshot_json JSONB,
  freigabe_status TEXT DEFAULT 'entwurf' CHECK (freigabe_status IN ('entwurf','freigegeben')),
  freigegeben_von TEXT, freigegeben_am TIMESTAMPTZ,
  erstellt_von TEXT, erstellt_am TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE versions_aenderungen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID, version_typ TEXT CHECK (version_typ IN ('konzept','future')),
  art TEXT CHECK (art IN ('inhaltlich','produktionell')),
  beschreibung TEXT, referenz TEXT
);

-- === Schritt 5: Rollen-Einsatzplanung ===
CREATE TABLE rollen_einsatz (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produktion_id TEXT REFERENCES produktionen(id),
  character_id UUID REFERENCES characters(id) ON DELETE CASCADE,
  block_von INT, block_bis INT,
  status TEXT, notiz TEXT,
  -- Menge bewusst NICHT in v1 (Balken trägt zunächst nichts) → spätere Erweiterung
  erstellt_am TIMESTAMPTZ DEFAULT NOW()
);

-- === Schritt 6: Befund-Register + KI-Audit ===
CREATE TABLE befunde (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produktion_id TEXT REFERENCES produktionen(id),
  typ TEXT,                 -- 'cast_luecke'|'cast_ueberschuss'|'leerlauf'|'beziehung'|'freigabe'|...
  identitaet TEXT,          -- stabiler Schlüssel: typ+rolle+block
  rolle_id UUID, block_nummer INT,
  beschreibung TEXT,
  status TEXT DEFAULT 'offen' CHECK (status IN ('offen','erledigt','auto_geloest')),
  erledigt_von TEXT, erledigt_am TIMESTAMPTZ, geloest_vermerk TEXT,
  erstellt_am TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(produktion_id, identitaet)   -- Reaktivierung statt Dublette
);
CREATE TABLE ki_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  funktion TEXT,            -- 'beat_kurztext'|'storyline_abgleich'|'konsistenz'|'import_*'
  input_summary TEXT,       -- erste ~200 Zeichen, kein Full-Dump
  output_summary TEXT,
  item_count INT, provider TEXT, model TEXT,
  tokens_in INT, tokens_out INT, user_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- === Schritt 7: Bible ===
ALTER TABLE charakter_beziehungen
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'aktiv'
      CHECK (status IN ('aktiv','beendet','historisch')),
  ADD COLUMN IF NOT EXISTS seit_block TEXT,
  ADD COLUMN IF NOT EXISTS bis_block TEXT,
  ADD COLUMN IF NOT EXISTS notiz TEXT;
-- + Auto-Gegenstück in der Schreiblogik (eltern_von↔kind_von, geschwister↔geschwister, partner↔partner)

CREATE TABLE bible_chronologie (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID REFERENCES characters(id) ON DELETE CASCADE,
  block_nummer INT, beat_id UUID,
  ereignis TEXT, quelle_future_version UUID
);
CREATE TABLE bible_felder_config (   -- OHNE produktion_id (staffelübergreifend)
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT, typ TEXT, sort_order INT
);
-- bible_snapshots nach Vorbild werkstufen_snapshots (Header + Content)
```

---

## 2. Schrittplan (mit Abhängigkeiten)

### Schritt 1 — Beat-Migration *(Fundament)*
**Abhängig von:** nichts. **Blockiert:** fast alles.
- Migration (s. o.). Reihenfolge: erst `future-import` + `raster-generieren` auf `block_nummer` umstellen, dann `block_label` droppen.
- `beat_charaktere` anlegen + CRUD-Endpunkte (Tag/Untag Figur an Beat, mit `rolle`).
- Testdaten, nicht live → kein Daten-Backfill nötig; aber bestehende Beats brauchen ggf. ein `block_nummer`-Mapping.

### Schritt 2 — Future-Board
**Abhängig von:** 1.
- Neuer Bereich `/planung/board`. Spalten aus `GET /api/produktionen/:id/bloecke`, Zeilen aus `straenge`.
- Beats als Zellen; `@dnd-kit` für Verschieben. Figuren-Tags pro Beat (aus `beat_charaktere`).
- Prosa (`prosa_text`) + Kurztext (`beat_text`) editierbar pro Beat.

### Schritt 3 — KI-Funktion A (Text→Raster)
**Abhängig von:** 1 (für `prosa_text`).
- `POST /api/straenge/beats/ki-kurztext` (Body `beat_ids[]`, `produktion_id`) → `[{beat_id, prosa_text, vorschlag_beat_text}]`, **kein** DB-Write. >20 Beats → Analysis-Runner.
- `POST /api/straenge/beats/ki-kurztext/commit` (Body `updates[{beat_id, beat_text}]`) → schreibt user-editierte Fassung.
- `KiVorschlagReviewPanel` aus `SearchReplaceDialog` extrahieren. Jeden Call in `ki_audit_log`.

### Schritt 4 — Versionierung + Import
**Abhängig von:** 1, 2.
- Versionierung: `POST /versionen` (Anlage, jeder DK-User), `POST /versionen/:id/freigeben` (role-gated). Snapshot = `JSON.stringify({straenge, beats})`. Diff clientseitig aus zwei Snapshots.
- Import: **ein** generischer Endpunkt `POST /api/konzept-import/preview` + `/commit`, `quelltyp` A|B|C im Body. Preview = OCR (Mistral) + KI-Extraktion (`###JSON###`), kein Write. Commit = `switch(quelltyp)` → A `straenge`+Figuren / B `prosa_text` / C `beat_text`.
- Figuren-Mapping aus `rollenprofil-import` wiederverwenden („Need" = „Was braucht die Figur wirklich", „Wesen").
- Fortführungs-Erkennung: KI bekommt bestehende Stränge in den Prompt; Anker = Figuren-Overlap. Preview liefert Match-Kandidaten, Commit bekommt die Entscheidung pro Strang.
- Block→Folgen: ProdDB `folge_von/folge_bis` → Lookup/Upsert `folgen` (`ON CONFLICT DO NOTHING`).
- Nach Import automatisch erste Version anlegen.

### Schritt 5 — Rollen-Einsatzplanung (Gantt)
**Abhängig von:** 1 (Block-Achse), teilt `@dnd-kit` mit 2.
- Bereich `/planung/einsatz`. Tabelle `rollen_einsatz`. Gantt: Zeilen = Rollen, X = Blöcke, Balken = `block_von..block_bis`.
- Gemeinsame Funktion `castFutureAbgleich(block)` (ein Code-Pfad!), getriggert bei Speichern in **Future** *und* **Einsatzplan**. Ergebnis → `befunde`.
- Präventive Warnung im Future-Board **vor** dem Write, wenn eine festgelegte Rolle versehentlich geändert würde (nicht-blockierend, Bestätigung; Eintrag in `befunde`).

### Schritt 6 — Befund-Register + Check C (Freigabe)
**Abhängig von:** 5 (für Cast-Befunde), 1.
- Bereich `/planung/befunde`. Liste offener Befunde, manuelles Erledigen (protokolliert), Auto-Schließen mit Vermerk.
- Check „Rollen-Freigabe-Status" (sofort, reiner Regelcheck): `resolveBlock()` + `character_productions.freigabe_status` (Query liegt vor).
- Bildbegrenzung-Check über `ot_obergrenze_pro_block` (v150) + Beat-Zahl/Block.

### Schritt 7 — Bible-Modus
**Abhängig von:** 4 (freigegebene Future-Versionen als Quelle), 1 (`beat_charaktere`).
- Beziehungen erweitern + Auto-Gegenstück in der Schreiblogik.
- Chronologie aus den getaggten Beats **freigegebener** `future_versionen` ableiten (Auslöser = Freigabe-Event aus Schritt 4).
- `bible_felder_config` (ohne `produktion_id`), `bible_snapshots`. Staffelübergreifend via `produktion_ids[]` + JOIN über `character_productions`.

### Schritt 8 — KI-Funktion B + Check-Rest
**Abhängig von:** 7 (Bible für Beziehungs-Check), Storyline vorhanden.
- B: Storyline (`werkstufen.typ='storyline'`, Tiptap-JSON via Text-Extraktion aus `pdfAssembler.ts`) ↔ Future (`strang_beats`, TEXT). KI-Diff, Analysis-Runner, manuell getriggert. Vorschlag pro Punkt annehmbar.
- Check „Beziehungswiderspruch im Text" (KI-Sprachinterpretation), sobald Bible gepflegt.

---

## 3. Offene Entscheidungen (mit gesetzten Defaults)

| # | Frage | Default (änderbar beim Bauen) |
|---|---|---|
| 1 | Feldtypen/Constraints der Migrationen | Vorschlag oben; **vor jeder Migration gegen reales Schema prüfen** |
| 2 | Befund-Abhaken: Rollen-Gate? | Nein – offen fürs Story-Team, nur protokolliert |
| 3 | Gantt-Tabellenname | `rollen_einsatz` |
| 4 | Import: ein Endpunkt vs. drei | Ein generischer mit `quelltyp` |
| 5 | Snapshot vs. Event-Log | Snapshot-JSON (plain TEXT → trivial) |
| 6 | Serien-Ebene | `produktion_ids[]` jetzt, echte `serien`-Tabelle später |

---

## 4. Reihenfolge der ersten PRs (Vorschlag)

1. **PR 1:** Migration Schritt 1 + `beat_charaktere`-CRUD + Umstellung `future-import`/`raster-generieren` auf `block_nummer`.
2. **PR 2:** Bereich `/planung` Grundgerüst (Routing, Menüpunkt, leere Tabs) + `@dnd-kit`-Wrapper.
3. **PR 3:** Future-Board (Schritt 2).
4. **PR 4:** KI-Funktion A + `KiVorschlagReviewPanel` + `ki_audit_log` (Schritt 3).
5. … weiter entlang Kapitel 2.
