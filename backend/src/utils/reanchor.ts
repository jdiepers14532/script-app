// Serverseitiges Re-Anchoring der Anker (Handoff 1 §3) — spiegelt die Frontend-Logik aus
// anchorResolve.ts (resolveAnchorInDoc / locateWithContext). Suchraum ist immer EIN Block, im
// Fallback eine Szene → günstig. Fuzzy (diff-match-patch) ist bewusst weggelassen (Schritt 1/2).
//
// Resolve-Semantik (Schritt 2, geschärft — Parität mit anchorResolve.ts):
//   - Position verifiziert ODER quote.exact eindeutig + voll-bestätigter prefix/suffix-Kontext
//     → 'verankert' (1.0), AUCH bei verschobenem Offset. Ein bloßer Offset-Shift bei sonst
//       exaktem, eindeutigem Treffer ist KEIN 'verschoben' (verhindert Fluten der prüfen-Queue).
//   - quote.exact mehrdeutig / nur teilweiser Kontext / nur szenenweiter Fund → 'verschoben'
//     (Konfidenz nach Score). Nicht gefunden → 'verwaist'.

export interface Selektor {
  position: { start: number; end: number }
  quote: { prefix: string; exact: string; suffix: string }
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

export interface ResolveResult {
  anker_status: 'verankert' | 'verschoben' | 'verwaist'
  konfidenz: number | null
  node_id: string | null
  position: { start: number; end: number } | null
}

const CTXCMP = 8 // Vergleichslänge des Kontext-Endes (spiegelt Frontend)

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
// text -> text, hardBreak/leaf -> '', rekursive Konkatenation der Kinder. Deckt den 99%-Fall
// (paragraph / absatz / screenplay_element mit inline content) exakt ab; verschachtelte
// Block-Container sind eine Annäherung, die der exact-Suche genügt.
export function blockText(node: any): string {
  if (!node || typeof node !== 'object') return ''
  if (node.type === 'text') return node.text ?? ''
  const children = node.content ?? []
  let out = ''
  for (const c of children) out += blockText(c)
  return out
}

// Block per node_id finden: zuerst Top-Level (Normalfall), dann defensiv rekursiv
// (node_id kann auf einem Listen-Node statt dem Item sitzen — Handoff 2 §2/§10.2).
export function findBlockByNodeId(blocks: any[], nodeId: string): any | null {
  for (const b of blocks) if (b?.attrs?.node_id === nodeId) return b
  let hit: any = null
  const walk = (n: any) => {
    if (hit || !n || typeof n !== 'object') return
    if (n?.attrs?.node_id === nodeId) { hit = n; return }
    for (const c of n.content ?? []) walk(c)
  }
  for (const b of blocks) { walk(b); if (hit) break }
  return hit
}

function matchesPrefix(text: string, i: number, quote: Selektor['quote']): boolean {
  if (!quote.prefix) return i === 0 // Selektion begann am Blockanfang
  const seg = text.slice(Math.max(0, i - quote.prefix.length), i)
  return seg.endsWith(quote.prefix.slice(-CTXCMP))
}
function matchesSuffix(text: string, i: number, exLen: number, quote: Selektor['quote']): boolean {
  const after = i + exLen
  if (!quote.suffix) return after === text.length // Selektion endete am Blockende
  const seg = text.slice(after, after + quote.suffix.length)
  return seg.startsWith(quote.suffix.slice(0, CTXCMP))
}

// Klassifikation von quote im Block-Text. Position ist nur der Fast-Path. Liefert null, wenn
// quote.exact im Text gar nicht vorkommt (Aufrufer geht dann zur szenenweiten Suche).
function classifyInBlock(text: string, sel: Selektor):
  { status: 'verankert' | 'verschoben'; konfidenz: number; start: number; end: number } | null {
  const { position, quote } = sel
  const exLen = quote.exact.length
  if (exLen === 0) return null
  // Fast-Path: an der gespeicherten Position steht exact → verankert
  if (text.slice(position.start, position.end) === quote.exact) {
    return { status: 'verankert', konfidenz: 1, start: position.start, end: position.end }
  }
  // Alle Vorkommen von exact sammeln
  const occ: number[] = []
  let i = -1
  while ((i = text.indexOf(quote.exact, i + 1)) !== -1) occ.push(i)
  if (occ.length === 0) return null

  // Eindeutig + voll-kontext-bestätigt → verankert (auch bei Offset-Shift)
  const confirmed = occ.filter(j => matchesPrefix(text, j, quote) && matchesSuffix(text, j, exLen, quote))
  if (confirmed.length === 1) {
    return { status: 'verankert', konfidenz: 1, start: confirmed[0], end: confirmed[0] + exLen }
  }
  // Mehrdeutig oder nur teilweiser Kontext → verschoben (bester nach Kontext-Score)
  let best = occ[0], bestScore = -1
  for (const j of occ) {
    const score = (matchesPrefix(text, j, quote) ? 1 : 0) + (matchesSuffix(text, j, exLen, quote) ? 1 : 0)
    if (score > bestScore) { bestScore = score; best = j }
  }
  const konfidenz = bestScore >= 2 ? 0.7 : bestScore === 1 ? 0.6 : 0.5
  return { status: 'verschoben', konfidenz, start: best, end: best + exLen }
}

// Bestes Vorkommen von quote.exact (nur Index) — für die szenenweite Suche über fremde Blöcke.
export function locateWithContext(text: string, quote: Selektor['quote']): number {
  if (!quote?.exact) return -1
  let best = -1, bestScore = -1, i = -1
  while ((i = text.indexOf(quote.exact, i + 1)) !== -1) {
    const score = (matchesPrefix(text, i, quote) ? 1 : 0) + (matchesSuffix(text, i, quote.exact.length, quote) ? 1 : 0)
    if (score > bestScore) { bestScore = score; best = i }
  }
  return best
}

// Re-Anchoring eines content-Ankers im Szenen-content (Handoff 1 §3.2).
export function resolveContentAnker(anker: AnkerRow, content: any): ResolveResult {
  const sel = anker.selektor
  if (!sel || !anker.node_id) {
    return { anker_status: 'verwaist', konfidenz: null, node_id: anker.node_id, position: null }
  }
  const blocks = toBlocks(content)
  const block = findBlockByNodeId(blocks, anker.node_id)

  if (block) {
    const r = classifyInBlock(blockText(block), sel)
    if (r) {
      return { anker_status: r.status, konfidenz: r.konfidenz, node_id: anker.node_id, position: { start: r.start, end: r.end } }
    }
    // exact nicht im node_id-Block → szenenweite Suche
  }

  // Block per node_id weg (Split/Merge → neue node_id, keine Lineage) ODER exact nicht im Block:
  // SZENENWEITE SUCHE über die anderen Blöcke. Fund in einem ANDEREN Block ⇒ 'verschoben'
  // (node_id-Wechsel) + node_id serverseitig aktualisieren.
  for (const b of blocks) {
    const nid = b?.attrs?.node_id
    if (!nid || nid === anker.node_id) continue
    const idx = locateWithContext(blockText(b), sel.quote)
    if (idx >= 0) {
      return { anker_status: 'verschoben', konfidenz: 0.6, node_id: nid, position: { start: idx, end: idx + sel.quote.exact.length } }
    }
  }
  return { anker_status: 'verwaist', konfidenz: null, node_id: anker.node_id, position: null }
}

// Kopffeld-Anker: "Feld vorhanden & nicht leer" (Handoff 1 §3.1).
export function resolveKopffeld(feldValue: any): ResolveResult {
  const ok = feldValue != null && String(feldValue).trim() !== ''
  return { anker_status: ok ? 'verankert' : 'verwaist', konfidenz: ok ? 1 : null, node_id: null, position: null }
}

// Strukturierte Szenenkopf-Felder, die als kopffeld-Anker zulässig sind. Whitelist verhindert
// SQL-Injection beim dynamischen Spaltennamen und begrenzt auf sinnvolle Felder.
export const KOPFFELD_WHITELIST = new Set<string>([
  'scene_nummer', 'scene_nummer_suffix', 'ort_name', 'int_ext', 'tageszeit', 'spieltag',
  'zusammenfassung', 'szeneninfo', 'spielzeit', 'notiz', 'stoppzeit_sek',
])
