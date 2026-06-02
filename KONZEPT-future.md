# Konzept – Story-Planungsbereich der Script-App

> **Status:** v0.2 · code-verifiziert (vier Claude-Code-Analysen)
> **Scope:** Neuer, in sich geschlossener Frontend-Bereich der Script-App für die Story-Planung einer Staffel.
> **Nicht im Scope:** Drehbuch- und Storyline-Editor (getrennt entwickelt). Die Storyline wird nur für einen KI-Abgleich gelesen.

---

## 0. Worum es geht

Die Script-App soll die lebendige, versionierte und maschinenlesbare Heimat von **Konzept** und **Future** einer Staffel werden – als gemeinsame Wahrheitsquelle für das Story-Team. Heute leben diese Informationen verteilt über Word-Konzepte, eine farbige Excel-Planung und freie Textfelder. Das Ziel ist ein eigener Bereich, in dem Stränge, Beats, Figuren-Chronologie und Rollen-Einsatz zusammenlaufen.

**Leitprinzip durchgehend:** Human-in-the-loop. Die KI prüft, strukturiert und schlägt vor – sie schreibt keine Bücher und ändert nichts still. Jeder Vorschlag wird von einem Menschen bestätigt.

---

## 1. Begriffe

| Begriff | Bedeutung |
|---|---|
| **Strang / Stränge** | Durchgehende Erzähleinheit, der eine Figurengruppe zugeordnet ist (Tabelle `straenge`). Zeilen des Future-Boards. |
| **Block** | Produktions-Klammer aus ~5 Folgen, im Produktionsplan der Produktions-App festgelegt, durchnummeriert. Wird live aus der ProdDB abgerufen. |
| **Beat** | Dramaturgische Einheit mit eigenem Rhythmus (`strang_beats`). Eine Strang×Block-Zelle. Trägt Prosa + Kurztext. |
| **Future** | Mittelfristige Planung über eine definierbare Anzahl Blöcke. Zwei Lesarten: Raster (Kurztext) und Prosa (ausformuliert). |
| **Konzept** | Staffelweite Klammer: Stränge + Figurenprofile. Keine eigene Tabelle, sondern die Summe aus `straenge[]` + Figuren-Feldern. |
| **Bible** | Dauerhafte, staffelübergreifende Wahrheit über Figuren, Beziehungen und Chronologie. |
| **Rollen-Einsatzplanung** | Vorgelagerte Planung, in welchen Blöcken welche **Rollen geschrieben** werden (nicht Besetzung!). Dargestellt als Gantt. |
| **Befund** | Eine vom System erkannte Inkonsistenz. Bleibt offen, bis gelöst. |

> **Wichtige Unterscheidung:** Beats sind dramaturgisch und haben einen eigenen Rhythmus. Prosatexte sind folgen-/blockgebunden und damit gleichmäßig getaktet. Die block-getaktete Prosa-Ansicht (wie in der S24-Future) ist deshalb eine Zusammenstellung der Beat-Prosatexte eines Blocks – nicht ihr Gegenteil.

---

## 2. Die sechs Bausteine

### Baustein 1 · Future-Board
Ein 2D-Board: **Spalten = Blöcke** (live aus ProdDB), **Zeilen = Stränge**. Jede Zelle ist ein Beat. Beats sind per Drag-and-drop verschiebbar (`@dnd-kit`) und mit Figuren getaggt. Das Future-Raster ist nur eine Ansicht dieser Beats; die KI füllt den Kurztext aus der Prosa.

- Figuren-Tags auf **Beat-Ebene** (nicht nur Strang), weil eine Figur nicht in jedem Block vorkommt. Das Feld `rolle` unterscheidet **handelt** vs. **erwähnt** – Grundlage für Chronologie und Cast-Checks.
- Motive (= Handlungsorte) werden bewusst **nicht** auf Beat-Ebene getaggt – ein Handlungsort gehört zur Szene/zum Drehbuch.

### Baustein 2 · Versionierung & Import
- **Versionierung (nur Konzept & Future):** Eingefrorener Snapshot (JSON) eines Standes + Notiz + kategorisierte Änderungen (`inhaltlich` / `produktionell`). Modell nach dem erprobten Vorbild `werkstufen_snapshots`. Manuelle Versionsanlage (Knopf), kein Auto-Trigger.
- **Freigabe role-gated:** Versions-Anlage = jeder DK-User; Freigabe-Akt = `requireRole('Head_Writing','Writer_Producing','Dramaturg','superadmin')`.
- **Schlüssel-Erkenntnis:** Einen Freigabe-Mechanismus für Konzept/Future gibt es heute nicht. Diese Versionierung **ist** zugleich der fehlende Freigabe-Workflow – und das Ereignis „Future-Version freigegeben" ist der Auslöser, der die Bible speist.
- **Import bestehender Dokumente:** Ein generischer Endpunkt mit Quelltyp-Parameter (A Konzept / B Future-Prosa / C Future-Raster), nach dem Preview/Commit-Muster aus `rollenprofil-import`. KI-Extraktion via `###JSON_START###…###JSON_END###`. Mistral-OCR für PDF (liefert Tabellenstruktur für Raster), `mammoth` für DOCX.
- Konzept = immer staffelweit; Future = definierbarer Blockbereich.
- **Fortführungs-Erkennung:** Die KI bekommt die Liste bestehender Stränge in den Prompt und fragt aktiv „Fortführung von Strang XY?" – Entscheidung pro Strang. Zusätzlicher Anker: Figuren-Overlap über `strang_charaktere`.

### Baustein 3 · Bible-Modus
Die dauerhafte, staffelübergreifende Wahrheit. Figuren-UUIDs sind bereits global stabil; `charakter_beziehungen` hängt schon heute nur an `character_id` – die Bible kann darauf aufsetzen.

- **Beziehungen erweitern** (kein Neubau): `status`, `seit_block`, `bis_block`, `notiz` + automatisches Gegenstück (`eltern_von A→B` ⇒ `kind_von B→A`, `geschwister`↔`geschwister`, `partner`↔`partner`).
- **Chronologie:** zeitlich geordnete Ereignisse pro Figur, automatisch aus den getaggten Beats **freigegebener** Future-Versionen abgeleitet.
- Eigene `bible_felder_config` **ohne** `produktion_id` (weil `charakter_felder_config` produktionsgebunden ist).
- **Staffelübergreifend:** jetzt pragmatisch über `produktion_ids[]`-Liste; eine echte `serien`-Container-Ebene ist bewusst als späterer Ausbau vorgemerkt.

### Baustein 4 · KI-Funktionen (nicht generativ)
Alle nutzen das vorhandene `ki.ts`, das verallgemeinerte Review-Panel (aus `SearchReplaceDialog`) und – bei langen Calls – das Analysis-Runner-Muster.

- **A · Text → Raster:** leitet aus `prosa_text` den `beat_text` (Kurztext) ab. Geringster Aufwand, braucht aber zuerst die `prosa_text`-Migration.
- **B · Storyline ↔ Future-Abgleich:** Storyline ist ein `werkstufen.typ` (Tiptap-JSON), Future ist plain TEXT – der Abgleich ist zwingend ein KI-Call. **Manuell getriggert**, Human-in-the-loop. Liefert ein Diff + Vorschlag, die Future nachzuziehen.
- **C · Konsistenz-Checks:** Freigabe-Status (sofort, Regelcheck), Beziehungswiderspruch (nach Bible), Rollen-Einsatz vs. Future (nach Mengen in Baustein 5), Bildbegrenzung (`ot_obergrenze`, vorhanden).
- **KI-Audit getrennt vom Befund-Register:** `ki_audit_log` ist passives Protokoll jeder KI-Nutzung (WGA-Best-Practice). `recordUsage` (Token-Aggregat) läuft parallel weiter.

### Baustein 5 · Rollen-Einsatzplanung (Gantt)
Die vorgelagerte Planung, in welchen Blöcken welche **Rollen geschrieben** werden – nicht die Besetzung. Eine reine Story-Entscheidung, vollständig in der App gepflegt. Gantt: Zeilen = Rollen, X-Achse = Blöcke (dieselbe Achse wie das Future-Board), ein Balken = die Spanne.

- Erster Wurf: Balken trägt nichts außer Anfang/Ende. Mengen/Intensität später.
- **Eigenständige Absichtsebene** (nicht aus Beats abgeleitet); das Future-Board ist die Ausführungsebene.
- **Gegenseitige Konsistenz:** eine Funktion `castFutureAbgleich(block)`, ausgelöst bei **beiden** Speicher-Events. Meldet: Lücke (Plan ohne Future), Überschuss (Future ohne Plan), Leerlauf (Plan ohne Future-Nutzung). **Präventive, nicht-blockierende Warnung**, wenn ein Future-Board-Eingriff eine festgelegte Rolle versehentlich ändern würde.

### Baustein 6 · Befund-Register
Alle Checks melden in ein gemeinsames Register. Ein Befund ist **nicht-blockierend**, bleibt aber **sichtbar offen**, bis er gelöst ist.

- **Stabile Identität:** Typ + betroffene Rolle/Figur + Block (z. B. `cast_luecke·Victoria·895`) → Reaktivierung statt Dublette.
- **Automatisch schließen:** Verschwindet die Ursache, schließt der Befund automatisch – mit Vermerk „durch Änderung gelöst".
- **Manuell erledigen:** protokolliert wer/wann. Offen für das Story-Team (kein eigenes Rollen-Gate).

---

## 3. Verortung: eigener Frontend-Bereich

Die Erweiterung lebt als **abgegrenzter neuer Bereich** der Script-App – eigene Route, eigener Menüpunkt, eigene Komponenten –, getrennt vom Drehbuch-/Storyline-Editor. Geteilt werden API-Schicht, Auth und Datenbank; der laufende Editor-Betrieb wird nicht berührt.

```
script.serienwerft.studio
├── (bestehend) Editor / Drehbuch / Storyline
└── /planung           ← NEUER BEREICH
    ├── /planung/board          Future-Board (Stränge × Blöcke)
    ├── /planung/einsatz        Rollen-Einsatzplanung (Gantt)
    ├── /planung/bible          Bible (Figuren, Beziehungen, Chronologie)
    ├── /planung/versionen      Versionen & Freigabe (Konzept/Future)
    ├── /planung/import         Dokument-Import (A/B/C)
    └── /planung/befunde        Befund-Register
```

---

## 4. Was im Code schon steht – und was fehlt

| Baustein / Bezug | Status | Anmerkung |
|---|---|---|
| `straenge`, `strang_beats`, `strang_charaktere` | ✓ | Fundament des Boards vorhanden |
| Blöcke (Spalten) | ✓ | Live aus ProdDB; `resolveBlock()` liefert `folge_ids` |
| `beat_text` vs. `prosa_text` | ⚠ | Heute nur ein Textfeld; `prosa_text` fehlt |
| Figuren-Tags pro Beat | ⚠ | Heute nur am Strang; `beat_charaktere` fehlt |
| `block_label` (Freitext) | ⚠ | Wird durch echte `block_nummer` ersetzt + entfernt |
| Versionierung Konzept/Future | ⚠ | Existiert nicht; Vorbild `werkstufen_snapshots` |
| Datei-Import (Multer/OCR/KI) | ✓ | Infrastruktur da; Muster `rollenprofil-import` |
| `charakter_beziehungen` | ✓ | Global; Felder fehlen (status, seit/bis_block, notiz, Auto-Gegenstück) |
| Review-UI (Accept/Reject) | ✓ | `SearchReplaceDialog` + `useSearchReplace` – verallgemeinerbar |
| Async-Muster | ✓ | Analysis-Runner (setImmediate + Polling) |
| KI-Audit (Input/Output) | ⚠ | `recordUsage` zählt nur Tokens; `ki_audit_log` fehlt |
| Rollen-Einsatzplanung / Gantt | ⚠ | Existiert nicht; keine DnD-Lib → `@dnd-kit` |

---

## 5. Umsetzungsreihenfolge (nach echten Abhängigkeiten)

1. **Beat-Migration** – `prosa_text` + `beat_charaktere` + `block_nummer`, `block_label` entfernen. Fundament für fast alles.
2. **Future-Board** (Ansicht + `@dnd-kit`) – baut auf Schritt 1.
3. **KI-Funktion A: Text→Raster** – braucht nur Schritt 1; Review-UI aus `SearchReplaceDialog`.
4. **Versionierung + Import** – Snapshot-Modell + Freigabe-Workflow; Import nutzt vorhandene OCR/KI.
5. **Rollen-Einsatzplanung (Gantt)** – eigenständig; teilt `@dnd-kit` und Block-Achse.
6. **Befund-Register + Check C (Freigabe)** – Register + sofort machbarer Regelcheck.
7. **Bible-Modus** – Beziehungen erweitern + Chronologie aus freigegebenen Future-Ständen.
8. **KI-Funktion B + Check-Rest** – Storyline↔Future; Beziehungswiderspruch nach Bible.

---

## 6. Bewusst später (vorgemerkt)

- **Serien-Container-Ebene** (Bible-Entscheidung B): echte `serien`-Tabelle über den Staffeln statt `produktion_ids[]`.
- **Gantt-Balken mit Mengen:** Bild-/Beat-Kontingent pro Rolle pro Block → mengenbasierter Cast-Check.
- **Heatmap aus Beat-Tags:** die farbige Excel-Planung generiert statt von Hand gemalt.
- **Strang-Timeline & „Was-wäre-wenn"-Branch** auf Basis der Versionierung.
