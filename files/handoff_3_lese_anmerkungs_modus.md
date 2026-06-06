# Handoff 3 — Lese-/Anmerkungs-Modus (Phase 4)

> Der Mittelteil wird zur zusammengefügten, blattweisen, **nicht-editierbaren** Ansicht über
> `assemblePreviewHtml()`. Gleiche App-Shell + Szenen-Sidebar wie im Bearbeitungsmodus; nur der
> Mittelteil ist neu. Geteilte Review-Fläche (Autoren + Nicht-Autoren); Auflösen nur Autor.
> `[align]` = gegen die echte Codebase abzugleichen.

---

## 1. Grundprinzip — DOM-Anchoring statt ProseMirror

Im Bearbeitungsmodus (Handoff 2) sind Anker ProseMirror-Decorations auf einer Live-Editor-View.
Hier ist der Content **server-gerendertes HTML** (aus `assemblePreviewHtml()` → `renderPmJson`),
kein ProseMirror-Dokument. Verankert wird daher gegen das **DOM**: Der Export rendert pro Block
ein `data-node-id`-Attribut — das ist unser Anker-Wurzelpunkt (robust, kein fragiles XPath nötig,
weil wir den node_id-Block als Scope haben). Das ist das klassische W3C/Hypothesis-Muster,
diesmal sauber pro `data-node-id` skopiert.

Das **Selektor-Modell ist identisch** zum Edit-Modus (`{position, quote}`), nur die
Implementierung wechselt von ProseMirror-Positionen auf DOM-Ranges. Backend, Datenmodell,
Status-Semantik, das `AnnotationPanel` und der `AnnotationContext` aus Handoff 2 werden
unverändert wiederverwendet.

---

## 2. Assembly einbinden

```ts
// resolved werkstufe (siehe §3) → Export-HTML holen und injizieren
const html = await api.getText(`/api/export/preview?werkstufe_id=${werkstufeId}`)  // [align] Query/Param
container.innerHTML = sanitize(html)   // eigenes HTML, aber DOMPurify als Gürtel-und-Hosenträger
```
Den Container mit der **Export-A4-CSS** stylen (Seitenformat, Ränder, `line-height:1.2`,
`fontSize:12pt` — dieselben DK-Settings wie der Export), damit Bildschirm == Ausdruck.

**Voraussetzung im Export-HTML** (`[align]`/ggf. kleine Renderer-Ergänzung):
- pro Block `data-node-id` — laut Discovery vorhanden;
- pro Szenen-Abschnitt ein umschließendes `data-scene-identity-id` — **falls nicht vorhanden, im
  Renderer ergänzen** (`renderMainScenes`), damit beim Anmerken `scene_identity_id` + `node_id`
  gemeinsam erfasst werden.

---

## 3. Sichtbarkeits-Auflösung — welche Fassung sieht wer

Der Viewer bekommt eine **Folge** (immer eine Episode gewählt) und löst die anzuzeigende
Werkstufe rollenabhängig auf:
- Werkstufen der Folge laden, gefiltert über den bestehenden `werkstufen.sichtbarkeit`-Filter
  aus `werkstufen.ts` (Nicht-Autoren: `sichtbarkeit='produktion'`).
- Unter den sichtbaren nach der bestehenden Auswahlregel wählen: Drehbuch > Storyline > andere,
  dann höchste `version_nummer` (nie Datum).

Damit sieht eine Nicht-Autorin nur die für „Produktion" freigegebene Fassung; Anker, die an einer
für sie nicht sichtbaren Werkstufe hängen, werden weder geladen noch in Tags zugestellt.

---

## 4. DOM-Anchoring

### Erzeugen aus Selektion (alle Rollen)
```ts
const CTX = 32
export function selektorFromDomSelection() {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed) return null
  const range = sel.getRangeAt(0)
  const startEl = range.startContainer.nodeType === 3
    ? range.startContainer.parentElement : range.startContainer as Element
  const block = startEl?.closest('[data-node-id]')
  if (!block) return null
  const sceneEl = block.closest('[data-scene-identity-id]')
  const text = block.textContent ?? ''
  const start = textOffsetWithin(block, range.startContainer, range.startOffset)
  const end   = textOffsetWithin(block, range.endContainer,   range.endOffset)
  return {
    scene_identity_id: sceneEl?.getAttribute('data-scene-identity-id') ?? null,
    node_id: block.getAttribute('data-node-id'),
    selektor: {
      position: { start, end },
      quote: {
        prefix: text.slice(Math.max(0, start - CTX), start),
        exact:  text.slice(start, end),
        suffix: text.slice(end, Math.min(text.length, end + CTX)),
      },
    },
  }
}
function textOffsetWithin(block, node, offset) {
  const w = document.createTreeWalker(block, NodeFilter.SHOW_TEXT)
  let acc = 0, n
  while ((n = w.nextNode())) { if (n === node) return acc + offset; acc += n.textContent.length }
  return acc
}
```
→ `POST /api/anmerkungen { store:'content', node_id, scene_identity_id, werkstufe_id:werkstufeId,
selektor, quelle, body }`. Identischer Vertrag wie Edit-Modus.

### Auflösen + Hervorheben (Anzeige)
```ts
export function highlightAnker(container, anker, onClick) {
  let block = container.querySelector(`[data-node-id="${CSS.escape(anker.node_id)}"]`)
  const text = block?.textContent ?? ''
  const { position, quote } = anker.selektor
  let start = -1, end = -1
  if (block && text.slice(position.start, position.end) === quote.exact) {
    start = position.start; end = position.end                 // verankert
  } else if (block) {
    const i = locateWithContext(text, quote)                   // verschoben
    if (i >= 0) { start = i; end = i + quote.exact.length }
  }
  if (start < 0) {                                             // node_id-Block fehlt/verschoben:
    const found = searchScene(container, anker)                // szenenweite Suche (s. Korrektur v196)
    if (!found) return { status: 'verwaist' }
    ;({ block, start, end } = found)
  }
  const range = rangeFromOffsets(block, start, end)
  wrapRange(range, anker, onClick)                             // splittet über Textknoten und wrappt je Segment
  return { status: start === position.start ? 'verankert' : 'verschoben' }
}
```
`rangeFromOffsets` läuft die Textknoten des Blocks ab und baut eine DOM-`Range`; `wrapRange`
zerlegt die Range an Textknoten-Grenzen (wegen Marks/Inline-Elementen) und hüllt jedes Segment in
`<span class="sw-annot sw-annot--{status} sw-annot--q-{quelle}" data-anmerkung-id="…">` mit dem
`onClick` → öffnet die Anmerkung im Panel. `searchScene` = Fallback aus der v196-Korrektur:
fehlt der node_id-Block (Split/Merge → neue node_id), `quote.exact` über alle `[data-node-id]`
des Szenen-Abschnitts suchen; gefunden → `verschoben` + node_id serverseitig aktualisieren.

CSS: dieselben `.sw-annot--*`-Klassen wie Handoff 2 §8.

---

## 5. Keep / Disable im Mittelteil

Aktiv für alle: Blatt-Scroll/Zoom, Fokus, Suchen (ohne Ersetzen), Anzeige von
KI-Ausgaben/Entity-Hervorhebungen, Anmerkungen **anlegen/kommentieren/taggen/filtern**, zur
Stelle springen, Export (optional, rollen-gebunden). Aus: jede Inhalts-/Kopffeld-Bearbeitung,
Ersetzen, Szenen-/Werkstufen-Verwaltung, Vorlagen-Editor, KI-Generierung, Import. **Übernehmen/
Ablehnen** nur bei Autor-Rolle gerendert (im Lese-Modus für Nicht-Autoren generell aus). Kopffeld-
Anmerkungen hängen hier an den im HTML gerenderten Kopfzeilen (`data-scene-identity-id` + `feldname`).

---

## 6. Blatt-Navigation

Aus `dokument_szenen.seite_von` / `seite_bis` (Dezimal, szenen-granular) einen **Szene→Blatt-
Index** bauen: Sidebar/Übersicht „Szene 8 → Blatt 3"; Klick → `scrollIntoView` auf den
`data-scene-identity-id`-Abschnitt; Blatt-Indikator „Blatt N / M". Die echten Seitenumbrüche
entstehen durch die A4-CSS im Browser (gleiches Layout wie der Druck); `seite_von/bis` ist die
Navigation, nicht die Umbruch-Berechnung.

---

## 7. Fokus-Modus & schwebendes Blatt-Modal (Nutzung aus anderen Apps)

`useFocusMode.ts` wird wiederverwendet (Fullscreen, Sidebar collapse). In **anderen Apps**
(Kostüm etc.) wird daraus ein schwebendes, beweg-/größenveränderbares Modal, das sich auf
Blattgröße verkleinert.

**Embedding-Entscheidung** (greenfield; `X-Frame-Options: DENY` blockiert iframes):
- **Entschieden — iframe + CSP**: `X-Frame-Options: DENY` durch `Content-Security-Policy:
  frame-ancestors 'self' *.serienwerft.studio` ersetzen (nur im Viewer-Vhost/-Pfad). Die andere
  App bettet `script.serienwerft.studio/viewer?folge=…` ein; Auth via Shared-Cookie, kein CORS,
  script-app besitzt Assembly + Anmerkungen + Auth komplett. Wenigster Code.
- **Alternative — geteilte sw-ui-Komponente**: `<AnnotationViewer folge=… />` aus sw-ui, die die
  script-app-APIs cross-subdomain ruft (Shared-Cookie + CORS-Allowlist `*.serienwerft.studio`).
  Sauberer ohne iframe-Nähte, aber CORS + Daten-Layer cross-app.

Das Modal-Chrome selbst ist eine neue sw-ui-Komponente `<FloatingModal>` (Drag + Resize,
Touch ≥44px, kein `position:fixed`-Problem auf Tablet) — die einzige greenfield-UI, die beide
Wege brauchen.

---

## 8. Wiederverwendung aus Handoff 2

`AnnotationPanel`, `AnnotationContext` (activeAnmerkungId-Brücke), die Erzeugen-/Kommentar-/
Status-/Tag-API und die Status-Semantik (Übernehmen = Status+Audit, kein Auto-Content,
Freeze-Guard) sind identisch. Nur die Highlight-Schicht ist DOM- statt ProseMirror-basiert. Der
gemeinsame Code (`selektor`-Shape, `locateWithContext`) liegt in einer Lib, beide Modi importieren.

---

## 9. Gegenzuprüfen (`[align]`)

1. `GET /api/export/preview` — exakter Param (`werkstufe_id`?) und ob `data-node-id` zuverlässig
   pro Block ausgegeben wird (Discovery: ja).
2. `data-scene-identity-id` pro Szenen-Abschnitt im Export-HTML — vorhanden oder in
   `renderMainScenes` zu ergänzen.
3. Export-A4-CSS/DK-Settings, die der Viewer-Container übernehmen muss (Seitenformat, Ränder).
4. Vhost/Pfad, auf dem das CSP `frame-ancestors` gesetzt wird (Security-Snippet pro location).

---

## 10. Danach

Phase 5 — **Auswert-Funktionen** im Szenen-Kontextmenü (Meta-Daten/Statistik/Stoppzeiten, lesend);
Phase 6 — **Hub-Liste** (Filter, Abarbeiten-Queue, Anker-prüfen-Queue); Phase 7 —
**Eingangskanäle** (App-API, Transkription→Entwürfe); Phase 8 — **Tagging + Event-Emission +
Minimal-Inbox** + Event-Vertrag. Notification-Dienst/Dashboard und Breakdown bleiben eigene
Folgeprojekte (mitgedacht).
