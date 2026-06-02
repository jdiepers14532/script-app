# Handoff 1 — Block-Identität als Fundament

**Für Claude Code** · Repo: `jdiepers14532/script-app` (branch `main`) · DB `script_db`

Dieser Handoff legt das gemeinsame Fundament für mehrere Folgefeatures: stabile Block-Identität (Bug 2), race-freies Revision-Tracking (Bug 3), dauerhafte/vergleichbare Revisionsstufen (Bug 4), revisionssichere NT-Verweise und den Fassungsvergleich Phase A. Alle hängen an **einer** Idee: ProseMirror-Blöcke bekommen eine stabile UUID, die mit dem Block wandert und beim Kopieren erhalten bleibt.

Reihenfolge der Phasen ist verbindlich — Phase 1 ist Voraussetzung für alles Weitere.

---

## 0. Voraussetzungen (zuerst, blockierend)

**Migrations-Stand klären.** DB-HEAD ist v167, v168 ist pending, lokal fehlt v162, v108 fehlt in der DB. Bevor irgendeine neue Migration angelegt wird:
- v168 deployen (oder bewusst zurückstellen), v162 lokal nachziehen (`git pull`), v108-Lücke bewerten (Inhalt prüfen — wird beim nächsten Server-Neustart nachgeholt).
- Danach die **tatsächlich** nächste freie Nummer bestimmen. In diesem Dokument heißen die neuen Migrationen provisorisch v169…v173 — Claude Code vergibt die echten fortlaufenden Nummern.
- **PFLICHT:** jede neue Migration in die hardcodierte `migrationFiles`-Liste in `backend/src/index.ts` eintragen — das Verzeichnis wird nicht automatisch gescannt.

**Discovery (rein lesend, vor Code-Änderungen):**
```bash
grep -rn "block_index" backend/src frontend/src
grep -rn "recordRevisionDeltas" backend/src
grep -rn "szenen_revisionen" backend/src
grep -rn "RevisionMarginPlugin\|revision-changed" frontend/src
grep -rn "extractNtCharacters\|autoUpsertNtEintraege\|repliken_positionen" backend/src
grep -rn "ScreenplayExtension\|AbsatzExtension\|addAttributes" frontend/src
grep -rn "source_werkstuf_id\|INSERT INTO dokument_szenen" backend/src   # die Copy-Stelle
grep -rn "werkstufen/.*diff\|DiffPanel\|recreateTransform" frontend/src backend/src
```

---

## 1. Block-UUID — das Fundament (Bug 2)

### Datenmodell-Klarstellung
`dokument_szenen.content` ist **ein** JSONB-Feld mit einem ProseMirror-Dokument. Die oberste Ebene ist ein Array von Blöcken (Action, Figur/CHARACTER, Dialog, Parenthetical, Szenenkopf-Elemente …). `block_index` ist nur die Array-Position. Absatzformate (v56) sind bereits Attribute an diesen Blöcken. **Es entsteht keine neue Tabelle** — die UUID wird ein zusätzliches Block-Attribut im selben JSONB.

### 1.1 Tiptap/ProseMirror-Schema
- In `ScreenplayExtension` / `AbsatzExtension` (und jedem anderen Top-Level-Blocktyp) ein Attribut ergänzen:
  ```
  addAttributes() {
    return {
      ...,
      node_id: {
        default: null,
        parseHTML: el => el.getAttribute('data-node-id'),
        renderHTML: attrs => attrs.node_id ? { 'data-node-id': attrs.node_id } : {},
      },
    }
  }
  ```
- Beim **Erzeugen** eines neuen Blocks (Enter, Split, Einfügen) wird `node_id` gesetzt, falls leer — als ProseMirror-Plugin (`appendTransaction`), das jeden neuen Block ohne `node_id` mit `crypto.randomUUID()` versieht. Splitten erzeugt für den neuen Block eine **neue** UUID; der Ursprungsblock behält seine.
- **Wichtig:** UUIDs gelten für **alle** Blocktypen, nicht nur CHARACTER. NT braucht nur Figuren, der Fassungsvergleich (Phase 5) braucht alle.

### 1.2 Backfill-Migration (v169)
Einmalig allen bestehenden Blöcken in `dokument_szenen.content` eine `node_id` geben, falls fehlend. JSONB-Rewrite pro Szene, idempotent (nur Blöcke ohne `node_id` anfassen). Als Node-Skript oder SQL mit JSONB-Funktionen — wegen der AST-Tiefe eher als Backend-Skript, das pro Zeile `content` lädt, Blöcke ergänzt, zurückschreibt. Idempotenz: erneuter Lauf darf vorhandene UUIDs nicht überschreiben.

### 1.3 FORWARD-COMPAT-INVARIANTE (kritisch, leicht zu übersehen)
**Beim Kopieren einer Werkstufe (`POST /api/werkstufen`, Modus `full`) MÜSSEN die `node_id`s erhalten bleiben — niemals neu generieren.** Nur so trägt derselbe Block in Version A und B dieselbe UUID, und der spätere Fassungsvergleich (Phase 5) kann Blöcke deterministisch matchen statt zu raten. Prüfe die Copy-Stelle (`INSERT INTO dokument_szenen SELECT … FROM predecessor`): der `content` wird 1:1 kopiert → UUIDs bleiben automatisch erhalten, **solange** kein Schritt die `node_id` strippt oder neu setzt. Sicherstellen und mit Test 5.1 absichern.

---

## 2. Revision-Delta: UUID-gekeyt + race-frei (Bug 2 + Bug 3)

### 2.1 Schema (v170)
- `ALTER TABLE szenen_revisionen ADD COLUMN block_uuid TEXT;`
- Backfill bestehender Deltas: wo möglich `block_index` → `node_id` der aktuellen Szene auflösen; nicht auflösbare Alt-Deltas als Legacy markieren (oder verwerfen, da Revisionen ohnehin intra-Werkstufe und kurzlebig sind — Entscheidung im PR begründen).
- Alten UNIQUE-Index ersetzen:
  ```sql
  DROP INDEX IF EXISTS uq_rev_dok_szene_block;
  CREATE UNIQUE INDEX uq_rev_dok_szene_block_uuid
    ON szenen_revisionen(dokument_szene_id, block_uuid)
    WHERE field_type = 'content_block';
  ```
- `block_index` als Legacy-Spalte (nullable) für 1 Release behalten, dann entfernen.

### 2.2 `recordRevisionDeltas` umschreiben
- Vergleich nicht mehr Position-gegen-Position, sondern **Map alt → neu über `node_id`**: Baseline-Map und Current-Map beide nach `block_uuid` schlüsseln, Set-Differenz bilden. Unverändert → Delta-Zeile löschen; geändert → UPSERT auf `(dokument_szene_id, block_uuid)`; gelöschter Block (UUID in Baseline, fehlt jetzt) → als Löschung markieren statt zu übergehen.
- **Bug 3:** Aufruf **synchron in derselben DB-Transaktion** wie das `PUT /api/dokument-szenen/:id` (kein fire-and-forget mehr). Bei 3s-Autosave-Debounce ist die Latenz unkritisch. Damit ist die Lost-Update-Race weg.
- `RevisionMarginPlugin` (Frontend) auf `node_id` umstellen: die `revision-changed`-Decoration (`content:'*'`) wird über die `node_id` des Blocks gesetzt, nicht über den Index. Position kommt aus `getPos(node)`, Identität aus `node.attrs.node_id`.

### 2.3 Optionale Bibliothek
Wer das Delta-Handling robuster will, kann `prosemirror-changeset` (offiziell, MIT) statt des manuellen Vergleichs nutzen — es liefert Insert/Delete-Spans korrekt. Nicht zwingend für diesen Handoff; als Code-Kommentar vermerken.

---

## 3. Revisionsstufen dauerhaft + vergleichbar (Bug 4)

Werkstufen speichern bereits vollständigen, eigenständigen Content (Full-Copy). Es fehlt nur Unveränderlichkeit + Semantik. Mein früherer „Soft-Delete der Deltas"-Vorschlag ist hinfällig — nichts wird gelöscht oder ersetzt.

### 3.1 Schema (v171)
```sql
ALTER TABLE werkstufen ADD COLUMN IF NOT EXISTS eingefroren BOOLEAN DEFAULT FALSE;
ALTER TABLE werkstufen ADD COLUMN IF NOT EXISTS eingefroren_am TIMESTAMPTZ;
ALTER TABLE werkstufen ADD COLUMN IF NOT EXISTS eingefroren_von TEXT;
ALTER TABLE werkstufen ADD COLUMN IF NOT EXISTS ist_revisionsstufe BOOLEAN DEFAULT FALSE;
ALTER TABLE werkstufen ADD COLUMN IF NOT EXISTS revisionsstufen_nr INT; -- 1 = Erstabgabe, 2 = 1. Überarbeitung …
```

### 3.2 Backend
- `PUT /api/werkstufen/:id/einfrieren` → setzt `eingefroren = TRUE`, `abgegeben = TRUE`, `ist_revisionsstufe = TRUE`, `eingefroren_am/_von`, vergibt `revisionsstufen_nr` (MAX+1 je Folge/Typ). Transaktional.
- **Guard:** jedes `PUT /api/dokument-szenen/:id` auf eine Szene einer eingefrorenen Werkstufe → `403 Frozen`. Damit ist jede abgegebene Revisionsstufe permanent und unveränderlich.
- „Revision beenden" ruft künftig `einfrieren` auf statt `szenen_revisionen` zu löschen.

### 3.3 Frontend
- Werkstufen-Panel zeigt die Stufen in der Reihenfolge Typ → Fassungslabel (aufsteigend) → Revisionsstufen (`revisionsstufen_nr`). Filter „nur Revisionsstufen".
- Freier Wechsel zwischen Stufen (bestehende Werkstufen-Auswahl, `selectedSzeneId`/`werkstufe_id`).
- Eingefrorene Stufen sind im Editor read-only (Guard + UI-Hinweis).

---

## 4. NT-Verweise revisionssicher (nutzt das UUID-Fundament)

NT-Liste (`nt_eintraege`, v134) referenziert Repliken heute positionsbasiert (`repliken_positionen INTEGER[]`, v162) → driftet bei Einfügungen/Verschiebungen. `autoUpsertNtEintraege` ist die einzige Schreibschicht (läuft bei jedem `PUT /api/dokument-szenen/:id`), `extractNtCharacters()` befüllt die Positionen. `veraltet` ist Soft-Delete — **niemals hard-delete** (Dispo-App referenziert `nt_eintraege.id`).

### 4.1 Sofort (kein Frontend nötig): Interims-Text-Drift-Check
Neuer Check `nt_replik_drift`: re-extrahiert pro aktivem NT-Eintrag den `repliken_text` aus dem aktuellen Szenen-Content und vergleicht mit dem gespeicherten `repliken_text`. Abweichung → Hinweis „Replikentext hat sich geändert / Block evtl. verschoben". Braucht keine Schemaänderung, deckt die häufigsten Fälle ab.

### 4.2 Robust (auf dem UUID-Fundament): Node-UUID-Verknüpfung (v172)
- `ALTER TABLE nt_eintraege ADD COLUMN repliken_node_ids UUID[] DEFAULT NULL;`
- `extractNtCharacters()` / `autoUpsertNtEintraege` schreiben zusätzlich die `node_id` des jeweiligen CHARACTER-Blocks in `repliken_node_ids` (parallel zu `repliken_positionen`, das für Dispo-App + UI-Anzeige rückwärtskompatibel bleibt).
- Check `nt_replik_konsistenz` (gegen die gelockte/eingefrorene Fassung): für jede `node_id` in `repliken_node_ids` prüfen — Block fehlt → Fehler „Replik-Block nicht mehr vorhanden"; Text geändert → Hinweis; vorhanden + unverändert → OK. Nutzt nur den Live-Content der Szene, kein neues Lookup-System.

`repliken_positionen` bleibt erhalten. Der bestehende `nt_verweis`-Autofix (schreibt Notizzeilen in `dokument_szenen.notiz`) ist davon unberührt — er ist ein getrenntes System.

---

## 5. Fassungsvergleich Phase A — read-only Inline-Diff

Ziel: zwei Fassungen vergleichen, Änderungen inline markiert (Einfügungen grün, Löschungen durchgestrichen rot) — in Einzel- **und** Parallelansicht. **Read-only**, kein Annehmen/Ablehnen (das ist Phase B, unten nur dokumentiert).

### 5.1 Diff-Architektur
- **Blockebene über UUID:** dank erhaltener `node_id`s (Invariante 1.3) werden Blöcke zwischen Version A und B deterministisch gematcht — gleiche `node_id` = derselbe Block. Verschobene Blöcke werden als Verschiebung erkannt, nicht als Löschen+Einfügen (Vorteil gegenüber Word).
- **Wortebene im Block:** für gematchte Blöcke mit geändertem Text ein Wort-Diff (z. B. `diff-match-patch` oder der Token-Diff aus `prosemirror-changeset`).
- **Fallback** für Blöcke ohne `node_id` (Alt-Content vor Backfill) oder ohne Match: `@manuscripts/prosemirror-recreate-steps` (`recreateTransform`) rekonstruiert eine Step-Folge A→B, gespeist in `prosemirror-changeset`. Heuristisch — nur als Fallback.
- **Achtung:** der bestehende Diff-Endpunkt `GET /api/werkstufen/:a/szenen/diff/:b` ist **szenen-granular** (`JSON.stringify` pro `scene_identity_id`) — gut für die Navigation/Übersicht (welche Szenen unterscheiden sich), **nicht** ausreichend für die Inline-Markierung. Für Phase A eine neue Block-/Wort-Diff-Schicht ergänzen (Endpunkt erweitern oder neuen daneben). Szenen werden weiterhin über `scene_identity_id` gepaart.
- **Format-/Attributänderungen:** der Default-Token-Encoder von `prosemirror-changeset` ignoriert Marks/Attribute. Wenn Absatzformat-Änderungen sichtbar sein sollen, eigener `tokenEncoder` nötig. Für Phase A optional — als bewusste Entscheidung dokumentieren (Default: nur Textänderungen).

### 5.2 Darstellung
- **Einzelansicht (Redline):** ein synthetisches Diff-Dokument im aktuellen Editor read-only rendern — Einfügungen grün, Löschungen durchgestrichen rot. Farben aus `tokens.css` (`--color-success`/`--color-danger` bzw. die DiffPanel-Konvention `#d1fae5` neu / `#fee2e2` gelöscht / `#fef3c7` geändert), light/dark-fähig.
- **Parallelansicht:** die bestehende Zwei-Fassungen-Ansicht um Change-Highlighting + synchronisiertes Scrollen erweitern.
- Read-only: keine Editier-Interaktion in der Diff-Ansicht.

### 5.3 Phase B — NICHT umsetzen, nur als Code-Option dokumentieren
Als Kommentar/Doku-Stub an der Diff-Schicht hinterlegen, damit die Erweiterung später ohne Reverse-Engineering möglich ist:
- Annehmen/Ablehnen einzelner Änderungen (z. B. via `prosemirror-suggestion-mode` oder `@tiptap-pro/extension-snapshot-compare`).
- **Harte Invariante für später:** Annehmen/Ablehnen erzeugt ein gemergtes Ergebnis und darf **ausschließlich in die editierbare Werkstufe** schreiben — niemals in eine eingefrorene Stufe (kollidiert sonst mit dem Freeze-Guard aus 3.2). Eingefrorene Stufen sind reine Lese-Quellen.
- Build-vs-Buy-Hinweis: wegen Hocuspocus/Yjs ist Tiptap Pro Snapshot-Compare die risikoärmere Option gegenüber Eigenbau auf den offenen Plugins.

---

## 6. /hilfe — Admin-Dokumentation
Eine Admin-Hilfe-Seite (analog `WerkstufenLabelsTab.tsx`) mit der grafischen Erklärung „Warum Position als Block-Identität bricht und warum die UUID das löst" (das Vorher/Nachher-Schaubild aus der Konzeptphase) anlegen. Zweck: künftige Bearbeiter verstehen, warum `node_id` existiert und warum sie beim Kopieren erhalten bleiben muss.

---

## 7. Tests (Playwright gegen `https://script.serienwerft.studio`, nur `claude`-Account, niemals Prod-Daten)
Wegwerf-Test-Produktion + Test-Folge verwenden.

1. **Block-UUID Persistenz:** Block in der Mitte einfügen → nur der neue Block bekommt Sternchen, vorher/nachher unveränderte Blöcke behalten/verlieren ihr Sternchen korrekt (kein Falsch-Sternchen durch Index-Verschiebung).
2. **Revision-Race:** zwei schnelle PUTs auf dieselbe Szene → `new_value` entspricht dem letzten Stand, kein Lost Update.
3. **Freeze-Guard:** Werkstufe einfrieren → PUT auf eine ihrer Szenen liefert 403; Stufe bleibt im Panel sicht- und vergleichbar.
4. **NT-Drift:** Block vor einer NT-Replik einfügen → Interims-Check meldet Drift; nach Node-UUID-Umbau zeigt `nt_replik_konsistenz` die Replik weiterhin korrekt (positionsunabhängig).
5. **UUID-Erhalt beim Kopieren:** neue Werkstufe (`full`) aus Vorgänger erzeugen → jeder kopierte Block trägt **dieselbe** `node_id` wie im Vorgänger (Invariante 1.3).
6. **Diff-Match:** identischer Block in A und B → kein Diff; geänderter Text im Block → Wort-Diff korrekt; verschobener Block (gleiche UUID) → als Verschiebung, nicht als Löschen+Einfügen.

---

## 8. Definition of Done
- [ ] Migrations-Stand reconciled, neue Migrationen in `migrationFiles` registriert.
- [ ] `node_id` auf allen Top-Level-Blocktypen; Backfill idempotent gelaufen.
- [ ] `node_id` bleibt beim Werkstufen-Copy (`full`) erhalten — durch Test 5.1 belegt.
- [ ] `szenen_revisionen` über `block_uuid` gekeyt; `recordRevisionDeltas` synchron in Transaktion; `RevisionMarginPlugin` UUID-basiert.
- [ ] Werkstufe einfrieren + Freeze-Guard + Revisionsstufen-Anzeige + freier Wechsel + Diff-Aufruf auf beliebiges Stufenpaar.
- [ ] NT: Interims-Text-Drift-Check live; `repliken_node_ids` + `nt_replik_konsistenz` gebaut; `repliken_positionen` unverändert rückwärtskompatibel; kein Hard-Delete.
- [ ] Fassungsvergleich Phase A: Block-/Wort-Inline-Diff in Einzel- und Parallelansicht, read-only; Format-Diff-Entscheidung dokumentiert; Phase B als Code-Doku-Stub inkl. Editierbar-nur-in-Werkstufe-Invariante.
- [ ] /hilfe-Admin-Seite mit Block-UUID-Schaubild.
- [ ] Tests 1–6 grün gegen Wegwerf-Produktion.

---

## Bewusst NICHT in diesem Handoff
- Lock-Regel-Engine / Pre-Lock-Checks (eigener Handoff 3).
- Fassungsbezogenes Label-Rename/Delete + PDF-Import-Fix (Handoff 2, Option C).
- Bug 7 (sort_order vs. Index im Lock-Gate) — gehört zum Lock-Gate, Handoff 2/3.
- Fassungsvergleich Phase B (Annehmen/Ablehnen) — nur dokumentiert, nicht implementiert.
