// Dünner ProseMirror-Adapter über anchorCore (Weg B). Kein PM-eigener Resolver mehr:
// Selektion → Selektor (block_index = $from.index(0), quote aus dem Startblock); Auflösung →
// SzeneBlock[] aus dem Doc (Top-Level via textBetween) → anchorCore.resolveInScene → PM-Positionen.
// Die Anker-Wahrheit liegt komplett in anchorCore.ts (Parität mit backend/utils/reanchor.ts).
import type { EditorState } from '@tiptap/pm/state'
import type { Node as PMNode } from '@tiptap/pm/model'
import { resolveInScene, type Selektor, type SzeneBlock } from './anchorCore'

const CTX = 32 // Kontextlänge beim Erfassen (prefix/suffix)

export type { Selektor } from './anchorCore'

export interface DecoAnker {
  anmerkung_id: string
  store: 'content' | 'kopffeld' | null
  node_id: string | null     // optionaler Hinweis (Weg B)
  feldname: string | null
  selektor: Selektor | null
  status: string             // anmerkung.status (offen|in_arbeit|uebernommen|abgelehnt) — steuert die Farbe
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

// ── Selektion → Anker, auf den Start-Top-Level-Block geklammert (block_index = $from.index(0)) ──
// quote wird NUR aus dem Startblock extrahiert: eine Selektion über zwei Top-Level-Blöcke klammert
// auf das Startblock-Ende, statt einen blockübergreifenden Quote zu erzeugen (der in keinem
// Einzelblock auflöste). Verhalten wie vorher beim node_id-Vorfahren, nur ohne node_id.
export function selektorFromSelection(state: EditorState):
  { node_id: string | null; selektor: Selektor } | null {
  const { from, to } = state.selection
  if (from === to) return null
  const $from = state.doc.resolve(from)
  if ($from.depth < 1) return null
  const blockIndex = $from.index(0)       // 0-basierter Top-Level-Index (matched Renderer/DOM)
  const blockStart = $from.start(1)       // content-Pos 0 des Top-Level-Blocks
  const blockNode = $from.node(1)
  const blockEnd = blockStart + blockNode.content.size
  const selTo = Math.min(to, blockEnd)    // Mehr-Block-Selektion → auf Start-Block-Ende klammern
  const start = from - blockStart
  const end = selTo - blockStart
  if (end <= start) return null
  const text = blockNode.textBetween(0, blockNode.content.size, '\n')
  return {
    node_id: blockNode.attrs?.node_id ?? null,
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

// Top-Level-Blöcke des Doc → SzeneBlock[] + Map(block_index → content-Start-PM-Position).
function sceneBlocksFromDoc(doc: PMNode): { blocks: SzeneBlock[]; starts: Map<number, number> } {
  const blocks: SzeneBlock[] = []
  const starts = new Map<number, number>()
  doc.forEach((node, offset, index) => {
    blocks.push({
      text: node.textBetween(0, node.content.size, '\n'),
      block_index: index,
      node_id: node.attrs?.node_id ?? null,
    })
    starts.set(index, offset + 1) // content-Pos 0 des Blocks (offset = Position VOR dem Block)
  })
  return { blocks, starts }
}

// ── Anker im Live-Dokument auflösen (für Decorations) ──
export function resolveAnchorInDoc(doc: PMNode, anker: DecoAnker):
  { status: 'verankert' | 'verschoben' | 'verwaist'; konfidenz: number | null; from?: number; to?: number } {
  if (anker.store !== 'content') return { status: 'verankert', konfidenz: 1 } // kopffeld separat
  const sel = anker.selektor
  if (!sel) return { status: 'verwaist', konfidenz: null }

  const { blocks, starts } = sceneBlocksFromDoc(doc)
  const r = resolveInScene(blocks, sel, anker.node_id ?? null)
  if (r.anker_status === 'verwaist' || r.block_index == null || !r.position) {
    return { status: r.anker_status, konfidenz: r.konfidenz }
  }
  const blockStart = starts.get(r.block_index)
  if (blockStart == null) return { status: 'verwaist', konfidenz: null }
  return { status: r.anker_status, konfidenz: r.konfidenz, from: blockStart + r.position.start, to: blockStart + r.position.end }
}

// Alle content-Anker einer Szene gegen das Doc auflösen — für pushDecorations + prüfen-Queue.
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
