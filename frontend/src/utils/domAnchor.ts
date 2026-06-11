// domAnchor — DOM-Adapter über anchorCore (Weg B), Pendant zu anchorResolve.ts (ProseMirror).
// Arbeitet gegen das iframe-contentDocument der DokumentVorschau: das Export-HTML trägt
// [data-scene-identity-id] (Szenen-Wrapper) und [data-block-index] (Top-Level-Blöcke) — exakt die
// Granularität von anchorCore. Selektion → Selektor (block_index + Quote aus dem Startblock);
// Auflösung → resolveInScene → DOM-Range → Highlight-Span. KEINE eigene Resolver-Logik (Parität!).
import { resolveInScene, type Selektor, type SzeneBlock } from './anchorCore'

const CTX = 32 // Kontextlänge prefix/suffix — identisch zu anchorResolve.ts

export interface DomAnker {
  anmerkung_id: string
  scene_identity_id: string | null
  node_id: string | null
  selektor: Selektor | null
  status: string  // Anzeige-Status → CSS-Klasse (offen|in_arbeit|gelesen|…)
  quelle: string
}

// Alle Szenen-Wrapper [data-scene-identity-id] → erste pro Identität.
export function findSceneWrappers(doc: Document): Map<string, Element> {
  const map = new Map<string, Element>()
  doc.querySelectorAll('[data-scene-identity-id]').forEach(el => {
    const sid = el.getAttribute('data-scene-identity-id')
    if (sid && !map.has(sid)) map.set(sid, el)
  })
  return map
}

// Alle [data-block-index]-Blöcke EINER Szene → SzeneBlock[] (+ Element-Map für Range-Aufbau).
// Eine Szene kann im Lesemodus über mehrere A4-Blätter (.a4-page) verteilt sein — alle tragen
// dieselbe data-scene-identity-id; deshalb über ALLE Wrapper-Teile sammeln, nicht nur den ersten.
function collectSceneBlocks(doc: Document, sceneIdentityId: string): { blocks: SzeneBlock[]; elems: Map<number, Element> } {
  const blocks: SzeneBlock[] = []
  const elems = new Map<number, Element>()
  doc.querySelectorAll(`[data-scene-identity-id="${sceneIdentityId}"]`).forEach(wrapper => {
    wrapper.querySelectorAll('[data-block-index]').forEach(el => {
      const bi = parseInt(el.getAttribute('data-block-index') || '', 10)
      if (Number.isNaN(bi) || elems.has(bi)) return
      elems.set(bi, el)
      blocks.push({ text: el.textContent ?? '', block_index: bi, node_id: el.getAttribute('data-node-id') || null })
    })
  })
  blocks.sort((a, b) => a.block_index - b.block_index)
  return { blocks, elems }
}

// char-Offset von (node, offset) relativ zum textContent von root.
function charOffset(root: Element, node: Node, offset: number): number {
  const doc = root.ownerDocument!
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let count = 0
  let cur = walker.nextNode()
  while (cur) {
    if (cur === node) return count + offset
    count += (cur.textContent ?? '').length
    cur = walker.nextNode()
  }
  // node nicht gefunden (z.B. Selektion endet auf Element-Grenze) → Gesamtlänge bis node-Anfang
  return count
}

// DOM-Range über char-Offsets [start,end) im textContent von el.
function rangeFromCharOffsets(el: Element, start: number, end: number): Range | null {
  const doc = el.ownerDocument!
  const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  let count = 0
  let startNode: Node | null = null, startOff = 0
  let endNode: Node | null = null, endOff = 0
  let cur = walker.nextNode()
  while (cur) {
    const len = (cur.textContent ?? '').length
    if (startNode === null && count + len >= start) { startNode = cur; startOff = start - count }
    if (count + len >= end) { endNode = cur; endOff = end - count; break }
    count += len
    cur = walker.nextNode()
  }
  if (!startNode || !endNode) return null
  try {
    const range = doc.createRange()
    range.setStart(startNode, startOff)
    range.setEnd(endNode, endOff)
    return range
  } catch { return null }
}

// ── Selektion → Anker (block_index = Startblock; Quote aus dessen textContent) ──
export function selektorFromDomSelection(doc: Document):
  { scene_identity_id: string; node_id: string | null; selektor: Selektor } | null {
  const sel = doc.getSelection()
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null
  const range = sel.getRangeAt(0)
  const startEl = range.startContainer.nodeType === Node.TEXT_NODE
    ? range.startContainer.parentElement
    : (range.startContainer as Element)
  const block = startEl?.closest('[data-block-index]')
  const wrapper = startEl?.closest('[data-scene-identity-id]')
  if (!block || !wrapper) return null
  const sceneIdentityId = wrapper.getAttribute('data-scene-identity-id')
  if (!sceneIdentityId) return null
  const blockIndex = parseInt(block.getAttribute('data-block-index') || '', 10)
  if (Number.isNaN(blockIndex)) return null

  const text = block.textContent ?? ''
  const start = charOffset(block, range.startContainer, range.startOffset)
  // Mehr-Block-Selektion → auf das Startblock-Ende klammern (wie die PM-Version).
  const sameBlock = block.contains(range.endContainer)
  const end = sameBlock ? charOffset(block, range.endContainer, range.endOffset) : text.length
  if (end <= start) return null

  return {
    scene_identity_id: sceneIdentityId,
    node_id: block.getAttribute('data-node-id') || null,
    selektor: {
      block_index: blockIndex,
      position: { start, end },
      quote: {
        prefix: text.slice(Math.max(0, start - CTX), start),
        exact: text.slice(start, end),
        suffix: text.slice(end, Math.min(text.length, end + CTX)),
      },
    },
  }
}

export interface DomHighlightResult {
  anmerkung_id: string
  status: 'verankert' | 'verschoben' | 'verwaist'
  el: HTMLElement | null  // der erzeugte Highlight-Span (für Scroll/Active)
}

// Einen Anker im iframe-Dokument auflösen + als Span markieren. Span trägt data-anmerkung-id für Klicks.
export function highlightAnker(doc: Document, anker: DomAnker): DomHighlightResult {
  const base = { anmerkung_id: anker.anmerkung_id }
  if (!anker.scene_identity_id || !anker.selektor) return { ...base, status: 'verwaist', el: null }
  const { blocks, elems } = collectSceneBlocks(doc, anker.scene_identity_id)
  if (!blocks.length) return { ...base, status: 'verwaist', el: null }
  const r = resolveInScene(blocks, anker.selektor, anker.node_id)
  if (r.anker_status === 'verwaist' || r.block_index == null || !r.position) {
    return { ...base, status: r.anker_status, el: null }
  }
  const blockEl = elems.get(r.block_index)
  if (!blockEl) return { ...base, status: 'verwaist', el: null }
  const range = rangeFromCharOffsets(blockEl, r.position.start, r.position.end)
  if (!range) return { ...base, status: r.anker_status, el: null }

  const span = doc.createElement('span')
  span.className = `sw-annot sw-annot--${anker.status} sw-annot--q-${anker.quelle}`
  span.setAttribute('data-anmerkung-id', anker.anmerkung_id)
  try {
    range.surroundContents(span)
  } catch {
    // Range kreuzt Element-Grenzen → Inhalt extrahieren und neu einhängen.
    try {
      const frag = range.extractContents()
      span.appendChild(frag)
      range.insertNode(span)
    } catch { return { ...base, status: r.anker_status, el: null } }
  }
  return { ...base, status: r.anker_status, el: span }
}

// Alle Highlight-Spans entfernen (Text bleibt erhalten — Span auflösen).
export function clearHighlights(doc: Document) {
  doc.querySelectorAll('span.sw-annot[data-anmerkung-id]').forEach(span => {
    const parent = span.parentNode
    if (!parent) return
    while (span.firstChild) parent.insertBefore(span.firstChild, span)
    parent.removeChild(span)
    parent.normalize()
  })
}

// CSS für die Highlights im iframe (wird ins contentDocument injiziert).
export const DOM_ANNOT_CSS = `
.sw-annot              { border-radius:2px; cursor:pointer; transition:background .15s; }
.sw-annot--offen       { background:#FAEEDA; border-bottom:2px solid #EF9F27; }
.sw-annot--in_arbeit   { background:#FAEEDA; border-bottom:2px solid #FFCC00; }
.sw-annot--gelesen     { background:#F0F0F0; border-bottom:2px solid #BDBDBD; }
.sw-annot--uebernommen { background:#EAF3DE; border-bottom:2px solid #00C853; }
.sw-annot--abgelehnt   { opacity:.5; }
.sw-annot--active      { box-shadow:0 0 0 2px rgba(0,122,255,.5); border-radius:3px; }
`
