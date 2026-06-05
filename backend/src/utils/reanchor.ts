// Serverseitiges Re-Anchoring der Anker (Handoff 1 §3) — spiegelt die Frontend-Logik aus
// Handoff 2 §3 (resolveAnchorInDoc / locateWithContext). Suchraum ist immer EIN Block, im
// Fallback eine Szene → günstig. Fuzzy (diff-match-patch) ist bewusst weggelassen (Schritt 1).

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

// Bestes Vorkommen von quote.exact mit prefix/suffix-Bias (spiegelt Frontend locateWithContext).
export function locateWithContext(text: string, quote: Selektor['quote']): number {
  if (!quote?.exact) return -1
  let best = -1, bestScore = -1, i = -1
  while ((i = text.indexOf(quote.exact, i + 1)) !== -1) {
    const pre = text.slice(Math.max(0, i - quote.prefix.length), i)
    const suf = text.slice(i + quote.exact.length, i + quote.exact.length + quote.suffix.length)
    const score = (quote.prefix && pre.endsWith(quote.prefix.slice(-8)) ? 1 : 0)
                + (quote.suffix && suf.startsWith(quote.suffix.slice(0, 8)) ? 1 : 0)
    if (score > bestScore) { bestScore = score; best = i }
  }
  return best
}

// Re-Anchoring eines content-Ankers im Szenen-content (Handoff 1 §3.2).
// kopffeld-Anker werden separat über resolveKopffeld aufgelöst.
export function resolveContentAnker(anker: AnkerRow, content: any): ResolveResult {
  const sel = anker.selektor
  if (!sel || !anker.node_id) {
    return { anker_status: 'verwaist', konfidenz: null, node_id: anker.node_id, position: null }
  }
  const blocks = toBlocks(content)
  const block = findBlockByNodeId(blocks, anker.node_id)

  if (block) {
    const text = blockText(block)
    const { position, quote } = sel
    // a) Position + exact-Verifikation -> verankert (1.0)
    if (text.slice(position.start, position.end) === quote.exact) {
      return { anker_status: 'verankert', konfidenz: 1, node_id: anker.node_id, position: { start: position.start, end: position.end } }
    }
    // b) exact mit prefix/suffix-Kontext im selben Block -> verschoben
    const idx = locateWithContext(text, quote)
    if (idx >= 0) {
      return { anker_status: 'verschoben', konfidenz: 0.8, node_id: anker.node_id, position: { start: idx, end: idx + quote.exact.length } }
    }
    // (Fuzzy optional — weggelassen) -> fällt zur szenenweiten Suche durch
  }

  // c) Block per node_id nicht gefunden (Split/Merge -> neue node_id, keine Lineage, V3)
  //    ODER exact nicht im Block -> SZENENWEITE SUCHE über alle Blöcke der Szene.
  for (const b of blocks) {
    const nid = b?.attrs?.node_id
    if (!nid) continue
    const text = blockText(b)
    const idx = locateWithContext(text, sel.quote)
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
