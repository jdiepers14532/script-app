// Client-seitiges Anchoring/Re-Anchoring gegen das LIVE-ProseMirror-Dokument (Handoff 2 §2/§3).
// Parität mit backend/utils/reanchor.ts: gleiche Selektor-Shape + classifyInBlock-Semantik, nur
// auf ProseMirror-Positionen statt Strings.
//
// Resolve-Semantik (Schritt 2, geschärft — identisch zur Server-Seite):
//   - Position verifiziert ODER quote.exact eindeutig + voll-bestätigter prefix/suffix-Kontext
//     → 'verankert' (auch bei Offset-Shift). Bloßer Offset-Shift ist KEIN 'verschoben'.
//   - quote.exact mehrdeutig / nur teilweiser Kontext / nur szenenweiter Fund → 'verschoben'.
//     Nicht gefunden → 'verwaist'.

import type { EditorState } from '@tiptap/pm/state'
import type { Node as PMNode } from '@tiptap/pm/model'

const CTX = 32     // Kontextlänge beim Erfassen (prefix/suffix)
const CTXCMP = 8   // Vergleichslänge des Kontext-Endes beim Auflösen

export interface Selektor {
  position: { start: number; end: number }
  quote: { prefix: string; exact: string; suffix: string }
}

export interface DecoAnker {
  anmerkung_id: string
  store: 'content' | 'kopffeld' | null
  node_id: string | null
  feldname: string | null
  selektor: Selektor | null
  status: string   // anmerkung.status (offen|in_arbeit|uebernommen|abgelehnt) — steuert die Farbe
  quelle: string
}

export interface ResolvedAnchor {
  anmerkungId: string
  status: 'verankert' | 'verschoben' | 'verwaist'
  konfidenz: number | null
  quelle: string
  annStatus: string
  from?: number
  to?: number
}

// ── Selektion → Anker (store='content'), auf den Start-Block geklammert (Handoff §2) ──
function blockWithNodeId($pos: any): { node: PMNode; start: number } | null {
  for (let d = $pos.depth; d >= 1; d--) {
    const node = $pos.node(d)
    if (node.attrs?.node_id) return { node, start: $pos.start(d) }
  }
  return null
}

export function selektorFromSelection(state: EditorState):
  { node_id: string; selektor: Selektor } | null {
  const { from, to } = state.selection
  if (from === to) return null
  const blk = blockWithNodeId(state.doc.resolve(from))
  if (!blk) return null
  const blockEnd = blk.start + blk.node.content.size
  const selTo = Math.min(to, blockEnd) // Mehr-Block-Selektion → auf Start-Block-Ende klammern
  const start = from - blk.start
  const end = selTo - blk.start
  const text = blk.node.textBetween(0, blk.node.content.size, '\n')
  if (end <= start) return null
  return {
    node_id: blk.node.attrs.node_id,
    selektor: {
      position: { start, end },
      quote: {
        prefix: text.slice(Math.max(0, start - CTX), start),
        exact: text.slice(start, end),
        suffix: text.slice(end, Math.min(text.length, end + CTX)),
      },
    },
  }
}

// ── Klassifikation im Block-Text (identisch zur Server-Seite) ──
function matchesPrefix(text: string, i: number, quote: Selektor['quote']): boolean {
  if (!quote.prefix) return i === 0
  const seg = text.slice(Math.max(0, i - quote.prefix.length), i)
  return seg.endsWith(quote.prefix.slice(-CTXCMP))
}
function matchesSuffix(text: string, i: number, exLen: number, quote: Selektor['quote']): boolean {
  const after = i + exLen
  if (!quote.suffix) return after === text.length
  const seg = text.slice(after, after + quote.suffix.length)
  return seg.startsWith(quote.suffix.slice(0, CTXCMP))
}

function classifyInBlock(text: string, sel: Selektor):
  { status: 'verankert' | 'verschoben'; konfidenz: number; start: number; end: number } | null {
  const { position, quote } = sel
  const exLen = quote.exact.length
  if (exLen === 0) return null
  if (text.slice(position.start, position.end) === quote.exact) {
    return { status: 'verankert', konfidenz: 1, start: position.start, end: position.end }
  }
  const occ: number[] = []
  let i = -1
  while ((i = text.indexOf(quote.exact, i + 1)) !== -1) occ.push(i)
  if (occ.length === 0) return null

  const confirmed = occ.filter(j => matchesPrefix(text, j, quote) && matchesSuffix(text, j, exLen, quote))
  if (confirmed.length === 1) {
    return { status: 'verankert', konfidenz: 1, start: confirmed[0], end: confirmed[0] + exLen }
  }
  let best = occ[0], bestScore = -1
  for (const j of occ) {
    const score = (matchesPrefix(text, j, quote) ? 1 : 0) + (matchesSuffix(text, j, exLen, quote) ? 1 : 0)
    if (score > bestScore) { bestScore = score; best = j }
  }
  const konfidenz = bestScore >= 2 ? 0.7 : bestScore === 1 ? 0.6 : 0.5
  return { status: 'verschoben', konfidenz, start: best, end: best + exLen }
}

function locateWithContext(text: string, quote: Selektor['quote']): number {
  if (!quote?.exact) return -1
  let best = -1, bestScore = -1, i = -1
  while ((i = text.indexOf(quote.exact, i + 1)) !== -1) {
    const score = (matchesPrefix(text, i, quote) ? 1 : 0) + (matchesSuffix(text, i, quote.exact.length, quote) ? 1 : 0)
    if (score > bestScore) { bestScore = score; best = i }
  }
  return best
}

function findBlockByNodeId(doc: PMNode, nodeId: string): { node: PMNode; pos: number } | null {
  let hit: { node: PMNode; pos: number } | null = null
  doc.descendants((node, pos) => {
    if (hit) return false
    if (node.attrs?.node_id === nodeId) { hit = { node, pos }; return false }
    return true
  })
  return hit // pos = Position VOR dem Block; content ab pos+1
}

// ── Anker im Live-Dokument auflösen (für Decorations) ──
export function resolveAnchorInDoc(doc: PMNode, anker: DecoAnker):
  { status: 'verankert' | 'verschoben' | 'verwaist'; konfidenz: number | null; from?: number; to?: number } {
  if (anker.store !== 'content') return { status: 'verankert', konfidenz: 1 } // kopffeld separat
  const sel = anker.selektor
  if (!sel || !anker.node_id) return { status: 'verwaist', konfidenz: null }

  const hit = findBlockByNodeId(doc, anker.node_id)
  if (hit) {
    const blockStart = hit.pos + 1
    const text = hit.node.textBetween(0, hit.node.content.size, '\n')
    const r = classifyInBlock(text, sel)
    if (r) return { status: r.status, konfidenz: r.konfidenz, from: blockStart + r.start, to: blockStart + r.end }
  }

  // Block per node_id weg ODER exact nicht drin → szenenweite Suche über andere node_id-Blöcke.
  let result: { status: 'verankert' | 'verschoben' | 'verwaist'; konfidenz: number | null; from?: number; to?: number } =
    { status: 'verwaist', konfidenz: null }
  doc.descendants((node, pos) => {
    if (result.status !== 'verwaist') return false
    const nid = node.attrs?.node_id
    if (!nid || nid === anker.node_id) return true
    const text = node.textBetween(0, node.content.size, '\n')
    const idx = locateWithContext(text, sel.quote)
    if (idx >= 0) {
      const blockStart = pos + 1
      result = { status: 'verschoben', konfidenz: 0.6, from: blockStart + idx, to: blockStart + idx + sel.quote.exact.length }
      return false
    }
    return true
  })
  return result
}

// Alle Anker einer Szene gegen das Doc auflösen — für pushDecorations + prüfen-Queue.
export function resolveAll(doc: PMNode, anker: DecoAnker[]): ResolvedAnchor[] {
  return anker
    .filter(a => a.store === 'content')
    .map(a => {
      const r = resolveAnchorInDoc(doc, a)
      return {
        anmerkungId: a.anmerkung_id, status: r.status, konfidenz: r.konfidenz,
        quelle: a.quelle, annStatus: a.status, from: r.from, to: r.to,
      }
    })
}
