// redlineDiff.ts — Redline-Transformation für den Werkstufen-Vergleich in der Leseansicht.
//
// Nimmt die Szenen der AKTUELL gelesenen Werkstufe (überarbeitete Fassung) und die Szenen
// der VERGLEICHS-Werkstufe (Original/ältere Fassung) und produziert eine gemergte
// Szenenliste, deren Tiptap-Top-Level-Nodes Diff-Attribute tragen:
//   attrs.__diff            'added' | 'deleted' | 'changed' | 'moved'
//   attrs.__diff_bi         echter Top-Level-Index in der aktuellen Szene (für data-block-index,
//                           da eingeschobene Streichungen die Positionen verschieben)
//   attrs.__diff_word_html  vorgerendertes, escaptes Inline-HTML mit <mark>/<del> (Wort-Diff)
// Gestrichene Szenen werden als synthetische Rows mit __diff_scene='deleted' eingefügt;
// neue Szenen erhalten __diff_scene='added'. Gerendert wird das im pdfAssembler
// (renderAbsatzNode / renderMainScenes) — nur im Lesemodus (mode=read).
//
// Diff-Richtung wie im Editor-Diff (Word-Semantik): base = Original, other = aktuelle Fassung.
// Klassifikation und Wort-Diff entsprechen GET /api/werkstufen/:id/diff-detail/:otherId.

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function toNodes(content: any): any[] {
  if (!content) return []
  const raw = typeof content === 'string' ? JSON.parse(content) : content
  return Array.isArray(raw) ? raw : (raw?.content ?? [])
}

function extractNodeText(node: any): string {
  const parts: string[] = []
  const walk = (n: any) => {
    if (n.type === 'text') parts.push(n.text ?? '')
    if (n.type === 'hardBreak') parts.push(' ')
    for (const c of n.content ?? []) walk(c)
  }
  walk(node)
  return parts.join('')
}

type DiffOp = { op: '=' | '+' | '-'; text: string }

// LCS-basierter Wort-Diff (gleiches Verfahren wie /diff-detail), 500 Tokens je Seite
function wordDiff(baseText: string, otherText: string): DiffOp[] {
  const tokenize = (s: string): string[] => s.match(/\S+|\s+/g) ?? []
  const a = tokenize(baseText).slice(0, 500)
  const b = tokenize(otherText).slice(0, 500)
  const m = a.length, n = b.length
  if (m === 0 && n === 0) return []
  if (m === 0) return b.map(t => ({ op: '+' as const, text: t }))
  if (n === 0) return a.map(t => ({ op: '-' as const, text: t }))
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1])
  const ops: DiffOp[] = []
  let i = m, j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) { ops.unshift({ op: '=', text: a[i - 1] }); i--; j-- }
    else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) { ops.unshift({ op: '+', text: b[j - 1] }); j-- }
    else { ops.unshift({ op: '-', text: a[i - 1] }); i-- }
  }
  return ops
}

const INS_STYLE = 'background:rgba(0,200,83,0.28);color:#005c00;border-radius:2px;padding:0 1px'
const DEL_STYLE = 'background:rgba(255,59,48,0.15);color:#bb2200;border-radius:2px;padding:0 1px;text-decoration:line-through'

function wordDiffHtml(baseText: string, otherText: string): string {
  return wordDiff(baseText, otherText).map(op => {
    if (op.op === '=') return esc(op.text)
    if (op.op === '+') return `<mark style="${INS_STYLE}">${esc(op.text)}</mark>`
    return `<del style="${DEL_STYLE}">${esc(op.text)}</del>`
  }).join('')
}

/** Markiert alle Top-Level-Nodes einer Szene (ganze Szene neu/gestrichen). */
function markAllBlocks(content: any, status: 'added' | 'deleted'): any[] {
  return toNodes(content).map((n, i) => {
    const attrs: any = { ...(n.attrs ?? {}), __diff: status }
    if (status === 'added') attrs.__diff_bi = i
    // Gestrichene Nodes existieren in der aktuellen Fassung nicht → keine doppelten node_ids im DOM
    if (status === 'deleted') delete attrs.node_id
    return { ...n, attrs }
  })
}

/**
 * Merged Redline-Nodes einer Szene: aktuelle Nodes in Reihenfolge, gestrichene
 * Original-Nodes an ihrer alten Position eingeschoben (gleicher Merge wie die
 * Redline-Ansicht in DiffView.mergedBlocks).
 */
function mergeRedlineContent(baseContent: any, currentContent: any): any[] {
  const baseNodes = toNodes(baseContent)
  const currNodes = toNodes(currentContent)

  const baseByUuid = new Map<string, { idx: number; text: string }>()
  baseNodes.forEach((n, i) => {
    const u = n?.attrs?.node_id
    if (u) baseByUuid.set(u, { idx: i, text: extractNodeText(n) })
  })
  const currUuids = new Set(currNodes.map(n => n?.attrs?.node_id).filter(Boolean))

  // Aktuelle Nodes klassifizieren (i = echter data-block-index)
  type Entry = { node: any; baseIdx: number | null }
  const entries: Entry[] = currNodes.map((n, i) => {
    const u = n?.attrs?.node_id
    const attrs: any = { ...(n.attrs ?? {}), __diff_bi: i }
    if (u && baseByUuid.has(u)) {
      const b = baseByUuid.get(u)!
      const text = extractNodeText(n)
      if (text === b.text) {
        if (i !== b.idx) attrs.__diff = 'moved'
        return { node: { ...n, attrs }, baseIdx: b.idx }
      }
      attrs.__diff = 'changed'
      attrs.__diff_word_html = wordDiffHtml(b.text, text)
      return { node: { ...n, attrs }, baseIdx: b.idx }
    }
    if (!u) {
      // Legacy ohne node_id: positionsbasierter Vergleich
      const b = baseNodes[i]
      if (b && !b?.attrs?.node_id) {
        const bt = extractNodeText(b)
        const ct = extractNodeText(n)
        if (bt !== ct) {
          attrs.__diff = 'changed'
          attrs.__diff_word_html = wordDiffHtml(bt, ct)
        }
        return { node: { ...n, attrs }, baseIdx: i }
      }
    }
    attrs.__diff = 'added'
    return { node: { ...n, attrs }, baseIdx: null }
  })

  // Gestrichene Original-Nodes (UUID nicht mehr vorhanden; Legacy: Position über currNodes hinaus)
  const deleted: Array<{ node: any; baseIdx: number }> = []
  baseNodes.forEach((n, i) => {
    const u = n?.attrs?.node_id
    const gone = u ? !currUuids.has(u) : i >= currNodes.length
    if (!gone) return
    const attrs: any = { ...(n.attrs ?? {}), __diff: 'deleted' }
    delete attrs.node_id
    deleted.push({ node: { ...n, attrs }, baseIdx: i })
  })
  deleted.sort((a, b) => a.baseIdx - b.baseIdx)

  // Merge: vor jedem Anker (aktueller Node mit Original-Position) die Streichungen
  // einschieben, die im Original davor lagen.
  const result: any[] = []
  let prevAnchor = -1
  for (const e of entries) {
    if (e.baseIdx !== null) {
      for (const d of deleted) {
        if (d.baseIdx > prevAnchor && d.baseIdx < e.baseIdx) result.push(d.node)
      }
      prevAnchor = e.baseIdx
    }
    result.push(e.node)
  }
  for (const d of deleted) {
    if (d.baseIdx > prevAnchor) result.push(d.node)
  }
  return result
}

export interface RedlineSceneBase {
  scene_identity_id: string | null
  content: any
  sort_order: number
}

/**
 * currentScenes = Szenen der gerade gelesenen Werkstufe (überarbeitete Fassung),
 * baseScenes = Szenen der Vergleichs-Werkstufe (Original).
 * Ergebnis: currentScenes mit Redline-Content; ganze neue Szenen mit __diff_scene='added';
 * gestrichene Original-Szenen als synthetische Rows (__diff_scene='deleted') hinter der
 * letzten aktuellen Szene, die im Original vor ihnen lag.
 */
export function transformRedlineScenes<T extends RedlineSceneBase>(currentScenes: T[], baseScenes: T[]): T[] {
  const baseById = new Map<string, T>(
    baseScenes.filter(s => s.scene_identity_id).map(s => [s.scene_identity_id as string, s])
  )
  const currentIds = new Set(currentScenes.map(s => s.scene_identity_id).filter(Boolean) as string[])

  const transformed: T[] = currentScenes.map(s => {
    const base = s.scene_identity_id ? baseById.get(s.scene_identity_id) : undefined
    if (!base) return { ...s, __diff_scene: 'added', content: markAllBlocks(s.content, 'added') }
    return { ...s, content: mergeRedlineContent(base.content, s.content) }
  })

  const inserts: Array<{ after: string | null; scene: T }> = []
  let lastPresent: string | null = null
  for (const b of [...baseScenes].sort((a, c) => a.sort_order - c.sort_order)) {
    if (b.scene_identity_id && currentIds.has(b.scene_identity_id)) {
      lastPresent = b.scene_identity_id
      continue
    }
    inserts.push({ after: lastPresent, scene: { ...b, __diff_scene: 'deleted', content: markAllBlocks(b.content, 'deleted') } })
  }
  if (inserts.length === 0) return transformed

  const out: T[] = []
  for (const ins of inserts) {
    if (ins.after === null) out.push(ins.scene)
  }
  for (const s of transformed) {
    out.push(s)
    for (const ins of inserts) {
      if (ins.after && ins.after === s.scene_identity_id) out.push(ins.scene)
    }
  }
  return out
}
