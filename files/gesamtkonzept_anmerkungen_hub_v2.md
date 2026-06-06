# Gesamtkonzept v2 — Anmerkungen-Hub (Script-App)

> Konsolidierte Fassung nach Discovery v3. Geerdet auf `serienwerft_suite_overview.md`,
> die Codebase-Discovery, Web-/Branchen-Recherche und den SyncOnSet-Abgleich. Aufgabe = der
> Hub (Anmerkungen). Breakdown und das app-übergreifende Dashboard werden nur **mitgedacht**,
> nicht hier gebaut. Offene, noch zu bestätigende Punkte sind **[D]** markiert.

---

## 1. Zweck & Scope

Ein zentraler Ort in der Script-App, an dem alle Anmerkungen zu einem Werk zusammenlaufen —
von Redaktion/Sender/Kunde wie auch aus Produktion und umsetzenden Abteilungen (Kostüm,
Ausstattung, Requisite …). Der/die Autor:in sieht alles vollständig, arbeitet es gezielt ab,
unterscheidet nach Quelle/Kategorie und entscheidet frei, was übernommen wird. Der Hub ist
zugleich der strukturierte Ablageort für Abnahme-/Besprechungsergebnisse.

Anmerkungen kommen von **Autoren** (untereinander) **und Nicht-Autoren**. Daraus folgen zwei
UX-Modi (Abschnitt 4): der bestehende Bearbeitungsmodus und ein neuer, schreibgeschützter
Lese-/Anmerkungs-Modus. Nicht-Autoren greifen meist aus anderen Apps auf den Viewer zu.

Nicht im Scope, nur mitgedacht: der Breakdown (teilt nur den Anker) und das cross-app
Dashboard (konsumiert nur den Event-Vertrag).

---

## 2. Architektur-Einordnung

Der Hub lebt in der Script-App (`script_db`, nächste Migration **v196**; Eintrag in der
hardcodierten `migrationFiles`-Liste in `backend/src/index.ts` ist Pflicht). Datenmodell:

```
produktionen → folgen → scene_identities → werkstufen (Drehbuch|Storyline|Notiz +version)
                                                  └── dokument_szenen (Kopf = Spalten, content = Tiptap-JSONB)
```

Bestätigt durch die Discovery: Der **Szenenkopf** sind strukturierte Spalten direkt auf
`dokument_szenen` (`scene_nummer`, `ort_name`, `int_ext`, `tageszeit`, `spieltag`,
`stoppzeit_sek`, `zusammenfassung`, `szeneninfo`, …); `content` ist der Tiptap-Body. Editor und
Kollaboration laufen **per Szene** über selbst gehostetes Hocuspocus/Yjs — daher eigener
Anker, kein Tiptap Pro Comments.

---

## 3. Der geteilte Anker-Baustein (mit Store-Diskriminator)

Eine Anmerkung „diese Zeile" und ein Breakdown-Tag „rotes Kleid = Kostüm" sind dieselbe
Operation: eine revisions-feste Verankerung. Der Baustein wird einmal gebaut und ist
mehrschichtig:

1. **Szenen-Ebene — `scene_identity_id`**: persistente Szenen-Identität, robustester Anker,
   übersteht jeden Werkstufenwechsel.
2. **Store-Diskriminator — `store` (`content` | `kopffeld`)**: Eine Anmerkung hängt entweder
   am Tiptap-Body oder an einem strukturierten Szenenkopf-Feld. Body-Anker = `node_id` + Span;
   Kopf-Anker = Feld-Referenz (`feldname`), kein `node_id`/Span.
3. **Block-Ebene — `node_id`** (nur bei `store='content'`): UUID v4, stabil bei Edit und
   **absichtlich identisch über Werkstufen hinweg** (Invariante 1.3 — Werkstufen-Copy kopiert
   den content per SQL, `node_id`s bleiben erhalten). Damit überlebt ein Anker den
   Werkstufenwechsel von Haus aus. Split → neue UUID, Merge → behält die erste.
4. **Intra-Block — Selektor-Bündel** `{ position:{start,end}, quote:{prefix,exact,suffix} }`
   nach W3C-Vorbild (Position = schnell, Quote = robustes Wiederfinden). Suchraum ist ein
   Block, daher ist auch Fuzzy-Matching billig.

**Speicherung: out-of-band als Kanon, Decorations zur Laufzeit.** Kanonisch ist eine DB-Zeile
(`anker`), kein Mark im `content`. Begründung: polymorphes Ziel (auch Konzept-/Future-Version,
kein ProseMirror-Doc), eine Anmerkung als *eine* Hub-Entität über Werkstufen hinweg, und
unabhängige Abfragbarkeit. Im Editor/Viewer werden Anker beim Laden aufgelöst und als
**Decorations** gerendert; während einer Edit-Session via ProseMirror-Mapping mitgeführt, beim
Speichern aus dem Range neu berechnet.

**Re-Anchoring** (pro Block): `scene_identity` → bei `content`: `node_id` → `position` gegen
`quote.exact` verifizieren → sonst `exact` mit prefix/suffix → sonst Fuzzy → sonst über die
`block_uuid`-Lineage (`szenen_revisionen`, ab v174 per `node_id` getrackt) den Nachfolge-Block;
erst dann „verwaist". Neu gefundene Anker mit Konfidenz < 1 sind eine **Vermutung**, kein
binärer Zustand → speist eine „prüfen"-Queue.

**[D]/Doku:** Konzept-/Future-Versionen sind Freiform-`snapshot_json` ohne `node_id`-Blöcke und
ohne gemeinsamen Block-Schlüssel mit `dokument_szenen`. Anmerkungen dort daher nur grob
(Versions-/Szenen-Ebene), nicht block-/spangenau. Das polymorphe Ziel bleibt, aber asymmetrisch.

---

## 4. Die zwei Modi

Gleiche App-Shell, gleiche Szenen-Sidebar; **neu gestaltet wird nur der Mittelteil**.

**Bearbeitungsmodus (Autor)** — der bestehende Per-Szene-Editor (`SceneEditor` Kopf-Felder +
`UniversalEditor` Tiptap-Body), volle Werkzeuge. Plus Anmerkungs-Ebene: markieren → „Anmerken",
Decorations, und **Übernehmen/Ablehnen** an den Margin-Karten.

**Lese-/Anmerkungs-Modus** — der Mittelteil wird zur zusammengefügten, seitenweisen,
schreibgeschützten Ansicht, **gerendert über `assemblePreviewHtml()`** (der Export-HTML-Renderer
ist bereits isoliert; damit gilt Ansicht == Ausdruck, ohne Doppelbau). Blattgrenzen entstehen
durch dieselbe A4-CSS im Browser; `seite_von/seite_bis` (Dezimal, szenen-granular) dient der
Szene→Blatt-Navigation. Hier sind nur Navigation/Lesen/Anmerken aktiv; Auflösen ist
ausgeblendet (nur Autor). Beide Modi haben einen **Fokus-Modus**; in anderen Apps wird daraus
ein schwebendes, größen-/positionsveränderbares Blatt-Modal.

**Keep/Disable im Lesemodus.** Aktiv: Episodenwahl, Szenen-Sidebar, Blatt-Navigation/Zoom,
Fokus, **Suchen** (ohne Ersetzen), Anzeige von KI-Ausgaben/Entity-Hervorhebungen, Anmerkungen
anlegen/kommentieren/filtern/zur-Stelle, Export (optional, rollen-gebunden). Deaktiviert: jede
Bearbeitung von Body und Szenenkopf, Ersetzen, Szenen-/Werkstufen-/Sondertyp-/Story-Strang-
Verwaltung, Vorlagen-/Kopf-Fußzeilen-Editor, KI-Generierung, Import, **Übernehmen/Ablehnen**,
Lock/Abgeben/Freigabe.

---

## 5. Auswert-Funktionen im Szenen-Kontextmenü

Drei Auswert-Funktionen pro Szene, alle **nur lesbar** für Nicht-Autoren: **Meta-Daten**
(Motiv, Figuren, Stoppzeit, Seiten), **Statistik** (Replikenanteil, Sprechzeit) und
**Stoppzeiten-Übersicht** (gepflegt von den Script-Contis, hier reine Ansicht). Im Lesemodus
sind Meta-Daten und Statistik für Nicht-Autoren sichtbar; die Stoppzeiten-Übersicht ist
autoren-/contis-intern, aber ebenfalls nur lesend.

---

## 6. Quellen, Kategorien, Status, Audit

**Quelle** (woher) gemappt auf Auth-Rollen + externe Sprecher: `redaktion`, `sender`, `kunde`,
`produktion`, `kostuem`, `ausstattung`, `requisite`, … — farb-/icon-codiert, primäres Filter.
**Kategorie** (fachliche Art): frei konfigurierbares Tag (Continuity, Dialog, Dramaturgie,
Faktencheck, Rechte). **Status-Lebenszyklus**: `offen → in_arbeit → uebernommen | abgelehnt`,
in TR-Semantik (in Arbeit `#FFCC00`, übernommen `#00C853`, abgelehnt `#FF3B30`). **Audit**:
`erstellt_von/_am`, `aufgeloest_von/_am`, `aufloesung`. Davon getrennt der **Anker-Status**
(`verankert | verschoben | verwaist` + Konfidenz) als technischer Verortungszustand.

---

## 7. Datenmodell (Vorschlag)

```
anker
  id, werkstufe_id|konzept_version_id|future_version_id (genau eines, FK, ON DELETE CASCADE),
  scene_identity_id null, store ('content'|'kopffeld'),
  node_id text null, feldname null,            -- kein block_uuid_ref: node_id IST der Schlüssel
  selektor jsonb null,            -- {position:{start,end}, quote:{prefix,exact,suffix}}
  anker_status, konfidenz null, erstellt_am

anmerkung
  id, anker_id fk, quelle, kategorie null,
  status ('offen'|'in_arbeit'|'uebernommen'|'abgelehnt'),
  body jsonb, erstellt_von, erstellt_am,
  aufgeloest_von null, aufgeloest_am null, aufloesung null

anmerkung_kommentar           -- Thread, in der Script-App (kein Messenger)
  id, anmerkung_id fk, autor, body jsonb, erstellt_am

anmerkung_tag                 -- Person-Tagging
  id, anmerkung_id fk, getaggter_user_id    -- löst Notification-Event aus
```

`breakdown_tag` (nur skizziert, später): `anker_id` + `{element_typ, element_id, farbcode}` —
zeigt, dass der `anker` neutral bleibt und trägt.

**Migrationspunkt:** Bestehende szenen-granulare Kommentare (heute in Messenger,
`anchor_app='script'`) und `scene_comment_read_state` (v26) werden durch dieses System ersetzt.

---

## 8. Eingangskanäle

1. **Manuell im Editor/Viewer**: markieren → „Anmerken" → Anker aus Selektion (`store='content'`)
   oder aus einem Kopffeld (`store='kopffeld'`).
2. **Aus anderen Apps (API)**: Kostüm/Ausstattung/Requisite erzeugen Anmerkungen über einen
   Endpoint (Quelle = Abteilung), ohne ins Drehbuch zu schreiben.
3. **Transkription → KI → Entwürfe → Sichtung**: Sitzungs-/Abnahme-Transkription wird per KI in
   kategorisierte **Entwürfe** ausgewertet — nie auto-angewendet, Staging außerhalb des
   `content`, menschlich gesichtet übernommen. **[D]/Doku:** `entity-check` liefert keine
   Spans/Offsets → Auto-Tagging braucht einen Positions-Auflöser (Frontend-Regex oder neue
   Span-Erkennung).

---

## 9. Übernehmen/Ablehnen — die Invariante

Schreibt **nur** in die editierbare Werkstufe, **nie** in eine eingefrorene — serverseitig schon
durch den `eingefroren`-Freeze-Guard (v177, 403 auf Content-Writes) erzwungen. Übernehmen wendet
die Änderung in der Arbeitsfassung an; Ablehnen löst nur auf (Audit), ohne Content zu berühren.
Konzeptionell identisch zum Fassungsvergleich — und es läuft bereits eine **Fassungsvergleich-
Arbeit (Phase 5)** auf der Revisions-/Freeze-Infrastruktur: das Übernehmen/Ablehnen dockt dort
an, nicht parallel.

---

## 10. Sichtbarkeit / welche Fassung sieht wer

Über `werkstufen.sichtbarkeit` (Hierarchie eng→weit: `privat` → `team:UUID`/`colab:UUID` →
`autoren` → `produktion`). Nicht-Autoren („Produktion") sehen Werkstufen mit
`sichtbarkeit='produktion'`. Es gibt keine Sender/Kunde-Stufe — bei Bedarf später ergänzen.
`abgegeben` ist ein Signal, kein Access-Gate. **Wichtig:** Diese Sichtbarkeit gilt auch für
Anmerkungen und für Benachrichtigungen — niemand darf über eine Anmerkung an einer für ihn nicht
sichtbaren Fassung informiert werden (Leak-Vermeidung).

---

## 11. Person-Tagging & Benachrichtigung

Im Hub können Personen getaggt werden (`anmerkung_tag`); die Personen-Liste kommt aus der
Auth-App (User + Rollen + Produktionszuweisung), kein neues Verzeichnis. Ein Tag (oder
Statuswechsel) emittiert ein **Event**.

**Jetzt im Hub bauen:** Tagging, Event-Emission und eine **minimale In-App-Inbox**, plus die
saubere Definition des **Event-Vertrags**.

**Mitgedacht, eigenes Folgeprojekt:** ein app-übergreifender **Notification-Dienst** + dünnes
persönliches Dashboard. Architektur dafür (festgehalten):
- Der Notification-Dienst ist das *eine* legitim zentrale Stück, aber **ein eigener Dienst**
  (eigene App + DB), **nicht** in der Auth-App — er liest Identität über die internen
  Auth-Endpoints. Apps posten Events mit Shared Secret (analog zum bestehenden KI-Trainer-
  Muster `POST /api/training-events`, `X-KI-Trainer-Secret`).
- **Benachrichtigungs-Präferenzen** („wie will ich kontaktiert werden") leben in der bestehenden
  Auth-gewurzelten Einstellungs-Hierarchie (global → Produktion → App, mit Redis-Cache); der
  Dienst liest/cacht sie zur Zustellzeit.
- Zustellkanäle nutzerkonfigurierbar: In-App immer, Mail/Messenger opt-in, mit Digests gegen die
  Flut (Daily-Soap-Mengen). Messenger ist **Zustellkanal, nicht Store**.
- Das **Dashboard** ist Pull (live-Aggregat „meine offenen Items"), der **Router** ist Push
  (Event-Zustellung) — zwei Mechanismen unter einer UI. Das Dashboard speichert keine
  Anmerkungsdaten.
- Nutzer-zentriert („MEINE Items/Benachrichtigungen"), keine Read-/Activity-Analytics;
  Betriebsrat (§87 BetrVG) und DSGVO von Anfang an.

---

## 12. Hub-Oberfläche

Filterbare, abarbeitbare Liste über alle Anmerkungen eines Werks (Filter: Quelle, Kategorie,
Status; gruppierbar nach Szene), tablet-tauglich (Touch ≥44px, mouse+touch, kein CSS-zoom),
TR/sw-ui-Stil (`AnnotationBadge` wiederverwenden — reine UI-Komponente). Pro Anmerkung:
Quelle-Badge, Status, Anker-Vorschau, Thread, Aktionen (zur Stelle, übernehmen/ablehnen [nur
Autor], kommentieren, taggen). Separate **„Anker prüfen"-Queue** für `verschoben`/`verwaist`.
Abnahme-/Besprechungs-Erfassung läuft über denselben Hub (manuell oder Transkription).

---

## 13. Abgrenzungen

**Breakdown** (eigenes System, nicht hier): `breakdown_tag` referenziert denselben `anker`;
Branchen-Farbcodes/Sheets/Master-Aggregation gehören dorthin, getrennt von den TR-Status-Farben.
Ein Kostüm-Tag referenziert künftig Outfit/Inventar.

**Kostüm-App** ist frei neu gestaltbar (grober Entwurf). Dokumentierte Probleme: kein aktiver
Pull-API-Endpoint, nur ein Outbound-`scriptsync`-Webhook; das generische Entity-System
(`external_app='kostuem-app'`) ist vorbereitet, aber nicht verdrahtet. Verbindung darf neu
gedacht werden.

**Embedding/Modal** (für die Nutzung aus anderen Apps): greenfield. `X-Frame-Options: DENY` auf
allen Vhosts blockiert iframes → entweder CSP auf `frame-ancestors *.serienwerft.studio` ändern,
oder (sauberer) eine geteilte **sw-ui-Annotations-/Viewer-Komponente** statt iframe. Ein
schwebendes Drag-/Resize-Blatt-Modal gibt es in sw-ui noch nicht.

---

## 14. Offene Punkte

- Konzept-/Future-Anker nur grob möglich (kein Block-Schlüssel) — bestätigen, ob das reicht.
- Embedding-Entscheidung: geteilte sw-ui-Komponente vs. iframe (+ CSP-Änderung).
- Auto-Tagging-Positionsauflöser (entity-check ohne Spans).
- Migration der Messenger-`anchor_app='script'`-Kommentare + `scene_comment_read_state`.

---

## 15. Umsetzungsschnitte (Handoff-Phase)

1. **Anker-Service + `anker`** (v196): erzeugen, auflösen, Re-Anchoring, `store`-Diskriminator,
   `anker_status`. Zuerst, weil alles darauf steht.
2. **`anmerkung` / `anmerkung_kommentar` / `anmerkung_tag` + CRUD-API**, Status, Audit.
3. **Editor-Integration (Bearbeitungsmodus)**: Selektion → Anker (content + kopffeld),
   Decorations, Übernehmen/Ablehnen am Freeze-Guard/Fassungsvergleich.
4. **Lese-/Anmerkungs-Modus**: Mittelteil über `assemblePreviewHtml()`, Blatt-Navigation,
   Keep/Disable, Fokus-/Blatt-Modal.
5. **Auswert-Funktionen** im Szenen-Kontextmenü (Meta-Daten/Statistik/Stoppzeiten, lesend).
6. **Hub-Oberfläche**: Liste, Filter, Abarbeiten-Queue, Anker-prüfen-Queue.
7. **Eingangskanäle**: App-API, dann Transkription→Entwürfe→Sichtung.
8. **Tagging + Event-Emission + Minimal-Inbox** + Event-Vertrag.
9. *(Folgeprojekte, mitgedacht)* Notification-Dienst + Dashboard; Breakdown als zweiter
   Anker-Konsument.
