// anchorCore — die FE-Wahrheit der Anker-Kernlogik (Weg B). Framework-agnostisch (nur String-Ops,
// kein ProseMirror/DOM) → von anchorResolve.ts (PM) und domAnchor.ts (DOM, Schritt 3) genutzt UND
// vom tsx-Paritäts-Check (Node) gegen reanchor.ts (BE) geprüft.
//
// PARITÄTS-VERTRAG: deckungsgleich mit backend/src/utils/reanchor.ts (resolveInScene +
// matchesPrefix/Suffix). Gemeinsames Fixture: anchorParity.fixture.json. Drift ⇒ test:anchor fail.
//
// Statusregel: Ein eindeutiger, voll kontextbestätigter Quote-Treffer in der Szene = 'verankert'
// (1.0), AUCH bei verschobenem block_index/Offset. 'verschoben' nur bei mehrdeutig/teilweise.
// 'verwaist' wenn der Quote nicht in der Szene vorkommt. block_index/node_id sind reine Tie-Breaker.

export interface Selektor {
  block_index?: number | null
  position: { start: number; end: number }
  quote: { prefix: string; exact: string; suffix: string }
}

export interface SzeneBlock {
  text: string
  block_index: number      // 0-basiert, Top-Level-Block der Szene (Kopf zählt nicht)
  node_id?: string | null
}

export interface ResolveResult {
  anker_status: 'verankert' | 'verschoben' | 'verwaist'
  konfidenz: number | null
  block_index: number | null
  node_id: string | null
  position: { start: number; end: number } | null
}

const CTXCMP = 8

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

function verwaist(): ResolveResult {
  return { anker_status: 'verwaist', konfidenz: null, block_index: null, node_id: null, position: null }
}

// Szenen-weite Auflösung: Quote+Kontext ist die Wahrheit, block_index/node_id nur Tie-Breaker.
export function resolveInScene(blocks: SzeneBlock[], sel: Selektor, nodeId?: string | null): ResolveResult {
  const { quote } = sel
  const exLen = quote.exact.length
  if (exLen === 0) return verwaist()

  interface Hit { block_index: number; node_id: string | null; start: number; full: boolean; score: number }
  const hits: Hit[] = []
  for (const b of blocks) {
    let i = -1
    while ((i = b.text.indexOf(quote.exact, i + 1)) !== -1) {
      const pre = matchesPrefix(b.text, i, quote)
      const suf = matchesSuffix(b.text, i, exLen, quote)
      hits.push({ block_index: b.block_index, node_id: b.node_id ?? null, start: i, full: pre && suf, score: (pre ? 1 : 0) + (suf ? 1 : 0) })
    }
  }
  if (hits.length === 0) return verwaist()

  const confirmed = hits.filter(h => h.full)
  // Kernregel: genau EIN voll-kontextbestätigter Treffer in der Szene → verankert (1.0), egal wo.
  if (confirmed.length === 1) {
    const h = confirmed[0]
    return { anker_status: 'verankert', konfidenz: 1, block_index: h.block_index, node_id: h.node_id, position: { start: h.start, end: h.start + exLen } }
  }

  // Mehrdeutig (>1 voll) oder nur teilweise → verschoben. Tie-Break: node_id, dann block_index-Nähe, dann score.
  const pool = confirmed.length > 1 ? confirmed : hits
  let best = pool[0]
  for (const h of pool) {
    if (h.score > best.score) { best = h; continue }
    if (h.score !== best.score) continue
    const hNode = nodeId && h.node_id === nodeId ? 1 : 0
    const bNode = nodeId && best.node_id === nodeId ? 1 : 0
    if (hNode > bNode) { best = h; continue }
    if (hNode === bNode && sel.block_index != null
        && Math.abs(h.block_index - sel.block_index) < Math.abs(best.block_index - sel.block_index)) best = h
  }
  const konf = best.score >= 2 ? 0.7 : best.score === 1 ? 0.6 : 0.5
  return { anker_status: 'verschoben', konfidenz: konf, block_index: best.block_index, node_id: best.node_id, position: { start: best.start, end: best.start + exLen } }
}
