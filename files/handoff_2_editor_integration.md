# Handoff 2 — Editor-Integration (Bearbeitungsmodus, Phase 3)

> Frontend-Integration des Anker-Fundaments (Handoff 1) in den bestehenden Per-Szene-Editor.
> Stack: React 18 + Tiptap (ProseMirror) + Yjs/Hocuspocus. Code ist idiomatisch, aber gegen die
> echten Editor-/sw-ui-APIs abzugleichen — `[align]` markiert solche Stellen. Der Resolver und
> die Decoration-Extension hier sind **wiederverwendbar im Lese-Modus** (Handoff 3); dort nur
> mit nicht-editierbarer View und ohne Erzeugen/Auflösen.

---

## 1. Grundprinzip

Anker leben out-of-band (DB, Handoff 1). Im Editor werden sie **nicht** als Marks in den content
geschrieben, sondern beim Laden aufgelöst und als **ProseMirror-Decorations** über den Text
gelegt. Decorations sind eine reine View-Ebene: Sie kollidieren nicht mit dem Yjs-Collab-Plugin
(jeder Client berechnet seine Decorations lokal aus den geteilten DB-Ankern) und verändern den
gespeicherten content nicht. Während des Tippens wandern sie automatisch mit (`DecorationSet.map`).

Zwei Anker-Arten: `store='content'` (Body-Span, an `node_id` + Selektor) und `store='kopffeld'`
(strukturiertes Szenenkopf-Feld in `SceneEditor`, an `feldname`).

---

## 2. Selektion → Anker (`store='content'`)

Beim Klick auf „Anmerken" mit nicht-leerer Selektion im Body-Editor:

```ts
const CTX = 32

// nächstgelegener Vorfahr-Block mit node_id (absatz / screenplay_element / paragraph / list …)
function blockWithNodeId($pos) {
  for (let d = $pos.depth; d >= 1; d--) {
    const node = $pos.node(d)
    if (node.attrs?.node_id) return { node, start: $pos.start(d) } // start = content-Pos 0 im Block
  }
  return null
}

export function selektorFromSelection(state) {
  const { from, to } = state.selection
  if (from === to) return null
  const blk = blockWithNodeId(state.doc.resolve(from))
  if (!blk) return null
  // v1: auf den Start-Block klammern (Mehr-Block-Selektion → bis Block-Ende)
  const blockEnd = blk.start + blk.node.content.size
  const selTo = Math.min(to, blockEnd)
  const start = from - blk.start
  const end = selTo - blk.start
  const text = blk.node.textBetween(0, blk.node.content.size, '\n')
  return {
    node_id: blk.node.attrs.node_id,
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
```

Damit `POST /api/anmerkungen`:
```ts
const a = selektorFromSelection(editor.state)        // [align] editor-Instanz aus UniversalEditor
await api.post('/api/anmerkungen', {
  werkstufe_id: werkstufeId,
  scene_identity_id: sceneIdentityId, store: 'content',
  node_id: a.node_id, selektor: a.selektor,
  quelle, kategorie, body,
})
```

---

## 3. Anker im Dokument auflösen (für Decorations)

```ts
function findBlockByNodeId(doc, nodeId) {
  let hit = null
  doc.descendants((node, pos) => {
    if (hit) return false
    if (node.attrs?.node_id === nodeId) { hit = { node, pos }; return false }
    return true
  })
  return hit                              // pos = Position VOR dem Block; content ab pos+1
}

export function resolveAnchorInDoc(doc, anker) {
  if (anker.store !== 'content') return { status: 'verankert' } // kopffeld separat (s. §5)
  const hit = findBlockByNodeId(doc, anker.node_id)
  if (!hit) return { status: 'verwaist' }                       // Fallback: szenenweite Suche (Handoff 1 §3)
  const blockStart = hit.pos + 1
  const text = hit.node.textBetween(0, hit.node.content.size, '\n')
  const { position, quote } = anker.selektor
  // 1) Position + Verifikation
  if (text.slice(position.start, position.end) === quote.exact) {
    return { status: 'verankert', from: blockStart + position.start, to: blockStart + position.end }
  }
  // 2) exact mit Kontext (prefix/suffix-Bias)
  const idx = locateWithContext(text, quote)
  if (idx >= 0) return {
    status: 'verschoben', konfidenz: 0.8,
    from: blockStart + idx, to: blockStart + idx + quote.exact.length,
  }
  // 3) optional Fuzzy (diff-match-patch) im Block-Text; sonst:
  return { status: 'verwaist' }
}

function locateWithContext(text, quote) {       // bestes Vorkommen von exact
  let best = -1, bestScore = -1, i = -1
  while ((i = text.indexOf(quote.exact, i + 1)) !== -1) {
    const pre = text.slice(Math.max(0, i - quote.prefix.length), i)
    const suf = text.slice(i + quote.exact.length, i + quote.exact.length + quote.suffix.length)
    const score = (pre.endsWith(quote.prefix.slice(-8)) ? 1 : 0)
                + (suf.startsWith(quote.suffix.slice(0, 8)) ? 1 : 0)
    if (score > bestScore) { bestScore = score; best = i }
  }
  return best
}
```

`locateWithContext`/Fuzzy spiegeln den serverseitigen Algorithmus (Handoff 1 §3). Suchraum ist
immer ein Block → billig. `node_id` ist über Werkstufen identisch (Invariante 1.3), daher löst
derselbe Anker in jeder Fassung auf.

---

## 4. Decoration-Extension (Tiptap)

```ts
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export const annotKey = new PluginKey('swAnnotations')

export const AnnotationDecorations = Extension.create({
  name: 'swAnnotations',
  addProseMirrorPlugins() {
    const onOpen = this.options.onOpen          // (anmerkungId) => void
    return [new Plugin({
      key: annotKey,
      state: {
        init: () => DecorationSet.empty,
        apply(tr, set) {
          const meta = tr.getMeta(annotKey)
          if (meta?.decos) return DecorationSet.create(tr.doc, meta.decos)
          return set.map(tr.mapping, tr.doc)     // live: wandert mit Edits mit
        },
      },
      props: {
        decorations(state) { return annotKey.getState(state) },
        handleClick(view, pos) {
          const deco = annotKey.getState(view.state).find(pos, pos)[0]
          if (deco) { onOpen?.(deco.spec.anmerkungId); return true }
          return false
        },
      },
    })]
  },
})

// resolved = [{ anmerkungId, from, to, status, quelle }]
export function pushDecorations(view, resolved) {
  const decos = resolved.filter(r => r.from != null).map(r =>
    Decoration.inline(r.from, r.to, {
      class: `sw-annot sw-annot--${r.status} sw-annot--q-${r.quelle}`,
    }, { anmerkungId: r.anmerkungId }))
  view.dispatch(view.state.tr.setMeta(annotKey, { decos }))
}
```

Laden einer Szene: Anmerkungen holen (`GET /api/anmerkungen?werkstufe_id=…` mit Sichtbarkeits-
Gate), je Anker `resolveAnchorInDoc(editor.state.doc, anker)`, dann `pushDecorations`.
`verschoben`/`verwaist` zusätzlich an die „prüfen"-Queue im Panel melden.

**Selektor-Refresh (Debounce ~1s nach Edit):** Für Anker in geänderten Blöcken den aktuellen
Decoration-Range nehmen, `position`/`quote` neu aus dem Block-Text berechnen und per
`PATCH /api/anmerkungen` (selektor) auffrischen — die DB bleibt Source of Truth, die Verankerung
bleibt akkurat.

---

## 5. Kopffeld-Anker (`store='kopffeld'`) in `SceneEditor`

Jedes strukturierte Feld (`zusammenfassung`, `ort_name`, `szeneninfo`, …) bekommt eine
„Anmerken"-Affordance und einen Marker:
```tsx
<FeldMitAnmerkung feld="zusammenfassung">
  <textarea … />
  <AnnotationBadge count={n} status={…}              // [align] sw-ui-Props
    onClick={() => openFieldAnnotations('zusammenfassung')} />
</FeldMitAnmerkung>
```
Erzeugen: `POST /api/anmerkungen { store:'kopffeld', feldname:'zusammenfassung', scene_identity_id, werkstufe_id:werkstufeId, … }` (kein `node_id`/Selektor). Auflösen = „Feld
vorhanden & nicht leer" (Handoff 1 §3.1).

---

## 6. Panel + Brücke Editor ↔ Liste

`AnnotationPanel` (rechts, neben `EditorPanel`/`SceneEditor`) zeigt die Anmerkungen der Szene:
Quelle-Badge, Status, Anker-Vorschau, Thread, Aktionen. Bidirektionale Verknüpfung über einen
gemeinsamen State `activeAnmerkungId`:
- Klick auf Decoration → `onOpen(id)` (§4) setzt `activeAnmerkungId` → Panel scrollt/markiert die Karte.
- Klick auf Karte → setzt `activeAnmerkungId` → Editor scrollt zum Range (`view.dispatch(scrollIntoView)`) und flasht die Decoration.

Bereitstellen via React-Context (`AnnotationContext`) statt Prop-Drilling über `ScriptPage`.

---

## 7. Übernehmen / Ablehnen — Semantik (wichtig)

Eine Anmerkung ist **Freitext-Feedback**, kein strukturierter Änderungsvorschlag. Daher:
- **Übernehmen** = Status `uebernommen` + Audit. Es schreibt **nicht automatisch** in den content
  — der Autor macht die Textänderung selbst und markiert die Anmerkung als übernommen.
- **Ablehnen** = Status `abgelehnt` + Audit, berührt keinen content.
- Beides nur **Autor-Rolle**, und nur auf einer **editierbaren** (nicht eingefrorenen) Werkstufe —
  der `PATCH …/status`-Endpoint prüft serverseitig den `eingefroren`-Freeze-Guard (Handoff 1 §2).
- Die geteilte Invariante mit dem Fassungsvergleich ist genau diese: Auflösen passiert nur auf der
  editierbaren Fassung, nie auf einer eingefrorenen.

(Falls später „Vorschläge mit Ersatztext" kommen — Tracked-Changes-Stil —, würden *die* beim
Übernehmen content schreiben. Nicht in dieser Phase.)

Im UI: Resolve-Buttons nur rendern, wenn Autor-Rolle **und** Werkstufe editierbar; sonst
ausblenden (im Lese-Modus generell aus).

---

## 8. Styling (TR)

```css
.sw-annot              { border-radius: 2px; cursor: pointer; }
.sw-annot--offen       { background:#FAEEDA; border-bottom:2px solid #EF9F27; } /* neutral/offen */
.sw-annot--in_arbeit   { background:#FAEEDA; border-bottom:2px solid #FFCC00; }
.sw-annot--uebernommen { background:#EAF3DE; border-bottom:2px solid #00C853; }
.sw-annot--abgelehnt   { opacity:.5; text-decoration:line-through; }
```
Buttons/Targets ≥44px (Touch), `Tooltip.tsx` statt inline `title`. `AnnotationBadge` aus sw-ui
für die Zähler/Marker wiederverwenden.

---

## 9. Wiederverwendung im Lese-Modus (Handoff 3)

`resolveAnchorInDoc`, `AnnotationDecorations`, `pushDecorations` und `AnnotationPanel` werden im
Lese-Modus 1:1 weiterverwendet — dort auf einer **nicht-editierbaren** View, ohne „Anmerken"-
Erzeugen-Affordance (bzw. nur Erzeugen erlaubt, Resolve aus) und ohne den Selektor-Refresh
(read-only). Die Decoration-Logik ist identisch.

---

## 10. Gegenzuprüfen (`[align]`)

1. Wie man an die Tiptap-`editor`-Instanz in `UniversalEditor`/`EditorPanel` kommt und wo
   Extensions registriert werden.
2. Tragen wirklich alle relevanten Body-Blöcke `node_id` (absatz, screenplay_element, paragraph,
   Listen)? Listen: node_id sitzt auf dem Listen-Node, nicht den Items — Anker klammert auf den
   nächsten node_id-Vorfahren (§2 deckt das ab).
3. `AnnotationBadge`-Props (count/status/onClick).
4. Feldnamen in `SceneEditor` (Mapping `feldname` ↔ Input).
5. Kein Konflikt mit dem Yjs-Collab-Plugin (Decorations sind view-lokal — erwartet, aber prüfen).

---

## 11. Danach

Handoff 3 — Lese-/Anmerkungs-Modus: Mittelteil über `assemblePreviewHtml()` als blattweise,
nicht-editierbare View, Wiederverwendung von §3/§4/§6, plus Blatt-Navigation (`seite_von/bis`),
Keep/Disable-Matrix und das schwebende Blatt-Modal für die Nutzung aus anderen Apps.
