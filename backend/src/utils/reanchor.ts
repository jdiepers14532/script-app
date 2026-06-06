// Szenen-Scope-Resolver (Weg B). scene_identity_id ist der Pflicht-Scope; selektor.block_index ein
// NICHT-autoritativer Fast-Path-Hinweis; quote (prefix/exact/suffix) ist die Wahrheit. node_id ist
// optionaler Hinweis. Grund: node_id ist in dokument_szenen.content nicht persistent (siehe v199).
//
// PARITÄTS-VERTRAG: Die Kernlogik (resolveInScene + matchesPrefix/Suffix) ist deckungsgleich mit
// frontend/src/utils/anchorCore.ts. Mechanisch geprüft über das gemeinsame Fixture
// (backend/src/utils/__fixtures__/anchorParity.fixture.json) durch scripts/anchorParity.check.ts.
// Drift zwischen beiden Implementierungen ⇒ Test schlägt fehl.
//
// Statusregel (festgenagelt): Ein eindeutiger, voll kontextbestätigter Quote-Treffer in der Szene
// = 'verankert' (1.0), AUCH bei verschobenem block_index/Offset ("Offset-Shift ≠ verschoben", auf
// den Block-Index verallgemeinert). 'verschoben' nur bei mehrdeutig/teilweise. 'verwaist' wenn der
// Quote nicht in der Szene vorkommt. block_index/node_id sind reine Tie-Breaker bei 'verschoben' —
// nie eine eigenständige Anker-Quelle (Quote+Kontext entscheidet immer).

// ── Kernlogik (Parität mit anchorCore.ts) ────────────────────────────────────

export interface Selektor {
  block_index?: number | null
  position: { start: number; end: number }
  quote: { prefix: string; exact: string; suffix: string }
}

// Ein Szenen-Block, reduziert auf das fürs Anchoring Nötige (FE/BE/DOM extrahieren das je eigen).
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

const CTXCMP = 8 // Vergleichslänge des Kontext-Endes

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

  // Mehrdeutig (>1 voll) oder nur teilweise → verschoben. Tie-Break: node_id-Treffer, dann block_index-Nähe, dann score.
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

// ── DB-Anbindung (backend-spezifisch) ────────────────────────────────────────

// content (JSONB: string | Array | {content:[]}) -> Top-Level-Block-Array.
export function toBlocks(content: any): any[] {
  if (!content) return []
  let raw = content
  if (typeof content === 'string') {
    try { raw = JSON.parse(content) } catch { return [] }
  }
  return Array.isArray(raw) ? raw : (raw?.content ?? [])
}

// Block-Text wie ProseMirror textBetween(0, size, '\n') für inline-content-Blöcke:
// text -> text, hardBreak/leaf -> '', rekursive Konkatenation.
export function blockText(node: any): string {
  if (!node || typeof node !== 'object') return ''
  if (node.type === 'text') return node.text ?? ''
  const children = node.content ?? []
  let out = ''
  for (const c of children) out += blockText(c)
  return out
}

// content-JSONB -> SzeneBlock[] (block_index = 0-basierter Top-Level-Index).
export function sceneBlocks(content: any): SzeneBlock[] {
  return toBlocks(content).map((b, i) => ({ text: blockText(b), block_index: i, node_id: b?.attrs?.node_id ?? null }))
}

export interface AnkerRow {
  id: string
  store: string | null
  node_id: string | null
  feldname: string | null
  selektor: Selektor | null
  scene_identity_id: string | null
  werkstufe_id: string | null
}

// content-Anker im Szenen-content auflösen (Weg B: Szenen-Scope + Quote, block_index als Hinweis).
export function resolveContentAnker(anker: AnkerRow, content: any): ResolveResult {
  const sel = anker.selektor
  if (!sel) return verwaist()
  return resolveInScene(sceneBlocks(content), sel, anker.node_id ?? null)
}

// Kopffeld-Anker: "Feld vorhanden & nicht leer" (Handoff 1 §3.1).
export function resolveKopffeld(feldValue: any): ResolveResult {
  const ok = feldValue != null && String(feldValue).trim() !== ''
  return { anker_status: ok ? 'verankert' : 'verwaist', konfidenz: ok ? 1 : null, block_index: null, node_id: null, position: null }
}

// Strukturierte Szenenkopf-Felder, die als kopffeld-Anker zulässig sind.
export const KOPFFELD_WHITELIST = new Set<string>([
  'scene_nummer', 'scene_nummer_suffix', 'ort_name', 'int_ext', 'tageszeit', 'spieltag',
  'zusammenfassung', 'szeneninfo', 'spielzeit', 'notiz', 'stoppzeit_sek',
])
