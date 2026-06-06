# Handoff 4 — Auswert-Funktionen (Phase 5) + Hub-Liste (Phase 6)

> Zwei UI-Schichten über überwiegend bestehenden Daten/Endpoints. `[align]` = gegen die echte
> Codebase abzugleichen (existierende Statistik-/Szenen-Endpoints wiederverwenden, nicht neu bauen).

---

# Teil A — Auswert-Funktionen im Szenen-Kontextmenü (Phase 5)

Drei Funktionen, aufgerufen aus dem Kontextmenü einer Szenenzeile in `SceneList`. Alle **rein
lesend** (auch für Autoren — Stoppzeiten werden von den Script-Contis anderswo gepflegt, hier nur
Ansicht). Für Nicht-Autoren im Lesemodus sichtbar.

## A1 — Kontextmenü
Pro Szenenzeile (Rechtsklick / `ti-dots-vertical`) eine Gruppe „Auswertung":
```
Meta-Daten        (Auge — im Lesemodus sichtbar)
Statistik         (Auge — im Lesemodus sichtbar)
Stoppzeiten-Übersicht  (Auge — lesend)
─────────────
Zur Szene springen
```
Rollen-/Modus-Gating: im Lesemodus für Nicht-Autoren nur diese lesenden Einträge; mutierende
Szenen-Aktionen (anlegen/löschen/umsortieren) erscheinen nur im Bearbeitungsmodus mit Autorrecht.

## A2 — Meta-Daten (szenen-skopiert)
Read-only-Panel/Modal mit den strukturierten Feldern aus `dokument_szenen` + Figuren:
`scene_nummer(+suffix)`, `ort_name`, `int_ext`, `tageszeit`, `spieltag`, `stoppzeit_sek`,
`page_length`/`seite_von`–`seite_bis`, `zusammenfassung`, `szeneninfo`, `sondertyp`, plus `rollen`
(JOIN `scene_characters`). Datenquelle: bestehender Szenen-Read (`dokument-szenen.ts:30`,
`SELECT * … WHERE werkstufe_id=$1 AND scene_identity_id=$2`) + Figuren-JOIN. `[align]` ob ein
dedizierter `GET …/meta` lohnt oder der bestehende Read reicht.

## A3 — Statistik (szenen-skopiert)
Surfacing des bestehenden **Statistik-Systems** (6 Tabs/Charts laut Overview): hier der
szenenbezogene Ausschnitt (Replikenanteil je Figur, Sprechzeit). **Nicht neu bauen** — den
vorhandenen Statistik-Endpoint mit Szenen-Filter aufrufen. `[align]` Endpoint-Name/Parameter
(Besetzungsmatrix / Replikenanalyse).

## A4 — Stoppzeiten-Übersicht (folgen-skopiert)
Read-only-Tabelle aller Szenen der Folge mit `stoppzeit_sek`, sortiert nach `sort_order`, die
aktuelle Szene hervorgehoben, plus Summe. Daten: `GET` der Folgen-Szenen mit `stoppzeit_sek`.
Pflege passiert bei den Contis an anderer Stelle — hier ausschließlich Anzeige. Scope ist
folgen-weit (bestätigt). `[align]` ob es schon einen Stoppzeiten-Aggregat-Endpoint gibt.

---

# Teil B — Hub-Liste (Phase 6)

Die werk-weite, abarbeitbare Liste über **alle** Anmerkungen einer Folge/Werkstufe. Wiederverwendet
die Anmerkungs-Karte und den `AnnotationContext` aus Handoff 2; Unterschied ist nur der Scope
(ganze Folge statt einer Szene) plus Filter-/Queue-Chrome.

## B1 — Endpoint
```
GET /api/anmerkungen
    ?folge_id=&werkstufe_id=
    &quelle[]=&kategorie[]=&status[]=&anker_status[]=
    &gruppe=szene&cursor=
  → SICHTBARKEITS-GATE: nur Anmerkungen an Werkstufen, die der Anfragende sehen darf
    (werkstufen.sichtbarkeit-Filter aus werkstufen.ts).
  → { items: [{
        anmerkung,                         // id, quelle, kategorie, status, body, audit
        anker: { status, konfidenz, store, node_id, feldname },   // serverseitig aufgelöst
        szene: { scene_identity_id, scene_nummer, ort_name },     // JOIN über anker.scene_identity_id
        kommentar_count, tags: [user_id…]
      }], next_cursor }
  → sortiert/gruppiert nach Szene über dokument_szenen.sort_order (JOIN scene_identity_id+werkstufe_id).
```
Cursor-Pagination (gleiches Muster wie eure bestehenden Listen) — Daily-Soap-Mengen, also
virtualisieren/paginieren, nicht alles laden.

## B2 — Filter, Gruppierung, Karte
Filter: Quelle, Kategorie, Status (Mehrfachauswahl); Gruppierung nach Szene (Reihenfolge =
`sort_order`); Suchfeld über `body`. Karte (aus Handoff 2 §6): Quelle-Badge, Status, Anker-
Vorschau (zitierter Ausschnitt), Thread-Zähler, Tags. Aktionen: **zur Stelle springen** (über
`AnnotationContext` → im Edit-Modus Editor-Scroll, im Lese-Modus DOM-Scroll), kommentieren, taggen;
**Übernehmen/Ablehnen** nur Autor + editierbare Werkstufe (Freeze-Guard).

## B3 — „Anker prüfen"-Queue
Eigener Tab/Filter: `anker_status IN ('verschoben','verwaist')`, mit Konfidenz-Anzeige.
- `verschoben`: zeigt die vermutete neue Stelle → „bestätigen" (Konfidenz auf 1, Selektor
  auffrischen) oder „verwerfen".
- `verwaist`: „neu verorten" → Nutzer markiert die richtige Stelle → `PATCH /api/anmerkungen/:id`
  (neuer Anker: node_id + Selektor).
- Zusätzlich speist `GET /api/werkstufen/:id/diff/:otherId` ein Flag „Anker auf geändertem Block".
  Die Antwort ist **verschachtelt pro Szene**: `{ diff:[{ scene_identity_id, changed_block_uuids[] }],
  total_changed_scenes }` (nicht flach) — Flag setzen, wenn der `node_id` eines Ankers in den
  `changed_block_uuids` *seiner* Szene liegt; damit man nach einer Überarbeitung gezielt prüfen kann.

## B4 — Verortung im UI
Die Hub-Liste ist eine **werk-weite Ansicht** (eigene Route/Tab „Anmerkungen" oder ein breites
Modal), nicht der schmale Szenen-Panel aus Handoff 2 — sie teilen aber die Karte und die API. Der
Szenen-Panel bleibt der „hier in dieser Szene"-Ausschnitt; die Hub-Liste ist „alles im Werk".
Abnahme-/Besprechungsergebnisse erscheinen hier automatisch (gemeinsame Quelle/Kategorie); ein
eigenes „Sitzungs"-Gruppierungsobjekt ist optional und kann später ergänzt werden.

---

## Gegenzuprüfen (`[align]`)
1. Bestehende Statistik-Endpoints + Parameter (szenen-/figurenbezogen) für A3.
2. Stoppzeiten: Aggregat-Endpoint vorhanden? Scope „Übersicht" = folgen-weit?
3. Cursor-Pagination-Muster, das ihr für Listen nutzt (Base64-Cursor wie in anderen Apps?).
4. `scene_characters`-JOIN für `rollen` (Meta-Daten + Anker-Szenenzuordnung).

---

## Danach
Handoff 5 — Phase 7 (**Eingangskanäle**: App-API für andere Abteilungen, Transkription→KI→
Entwürfe→Sichtung) + Phase 8 (**Tagging + Event-Emission + Minimal-Inbox** + Event-Vertrag).
Damit ist der Hub vollständig spezifiziert; Notification-Dienst/Dashboard und Breakdown bleiben
eigene Folgeprojekte.
