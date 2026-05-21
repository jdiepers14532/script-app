import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export const replikNumberPluginKey = new PluginKey('replikNumbers')

interface ReplikPluginState {
  offset: number
  baseline: BaselineEntry[] | null
  isLocked: boolean
  color?: string
}

interface BaselineEntry {
  scene_id: string
  start: number
  count: number
}

/**
 * ProseMirror plugin that displays replik numbers above CHARACTER blocks.
 *
 * - offset: cumulative replik count of all preceding scenes
 * - baseline: if locked, the snapshot of replik numbers at lock time
 * - isLocked: whether the werkstufe is locked
 *
 * Normal mode: sequential numbering (offset + local index)
 * Locked mode: baseline numbers + suffix a,b,c for inserted repliken
 */
export function createReplikNumberPlugin(opts: ReplikPluginState) {
  return new Plugin({
    key: replikNumberPluginKey,
    state: {
      init(_, state) { return buildDecorations(state.doc, opts) },
      apply(tr, old) {
        if (tr.docChanged) return buildDecorations(tr.doc, opts)
        return old
      },
    },
    props: {
      decorations(state) {
        return this.getState(state)
      },
    },
  })
}

function isCharacterNode(node: any): boolean {
  if (node.type.name === 'screenplay_element' && node.attrs?.element_type === 'character') return true
  if (node.type.name === 'absatz') {
    const name = (node.attrs?.format_name ?? '').toLowerCase()
    if (name === 'character' || name === 'rolle' || name === 'figur') return true
  }
  return false
}

function buildDecorations(doc: any, opts: ReplikPluginState): DecorationSet {
  // First pass: collect positions of all character nodes
  const characterNodes: Array<{ offset: number; nodeSize: number }> = []
  doc.forEach((node: any, offset: number) => {
    if (isCharacterNode(node)) characterNodes.push({ offset, nodeSize: node.nodeSize })
  })

  const allLocalIdxs = characterNodes.map((_, i) => i)
  const decos: Decoration[] = []

  characterNodes.forEach(({ offset, nodeSize }, localIdx) => {
    let label: string

    if (opts.isLocked && opts.baseline) {
      const baseNum = getBaselineNumber(opts, localIdx)
      if (baseNum !== null) {
        label = `${baseNum}.`
      } else {
        const { anchor, decimal } = getLockedInsertLabel(opts, localIdx, allLocalIdxs)
        label = `${anchor}.${decimal}`
      }
    } else {
      const globalNum = opts.offset + localIdx + 1
      label = `${globalNum}.`
    }

    decos.push(
      Decoration.node(offset, offset + nodeSize, {
        'data-replik-number': label,
      }, { key: `rn-${localIdx}` })
    )
  })

  return DecorationSet.create(doc, decos)
}

/**
 * In locked mode, check if localIdx maps to a baseline replik.
 * Returns the 1-based baseline number, or null if this is a new insertion.
 */
function getBaselineNumber(opts: ReplikPluginState, localIdx: number): number | null {
  if (!opts.baseline) return null
  const globalIdx = opts.offset + localIdx
  let cumulative = 0
  for (const entry of opts.baseline) {
    if (globalIdx >= cumulative && globalIdx < cumulative + entry.count) {
      return globalIdx + 1 // 1-based
    }
    cumulative += entry.count
  }
  return null // Not in baseline = newly inserted
}

/**
 * Build the ordered list of baseline global-indices for fast lookup.
 * Returns a sorted array of baseline positions (0-based global index).
 */
function buildBaselineSet(opts: ReplikPluginState): Set<number> {
  const set = new Set<number>()
  if (!opts.baseline) return set
  let cumulative = 0
  for (const entry of opts.baseline) {
    for (let i = 0; i < entry.count; i++) set.add(cumulative + i)
    cumulative += entry.count
  }
  return set
}

/**
 * For a newly inserted replik in locked mode:
 * - Find the preceding baseline replik number (= "anchor")
 * - Count how many new repliken have been inserted after the same anchor
 *   to determine the decimal suffix (.1, .2, .3, ...)
 *
 * Uses the full document character list (all localIdxs) to count sibling inserts.
 */
function getLockedInsertLabel(
  opts: ReplikPluginState,
  localIdx: number,
  allLocalIdxs: number[],
): { anchor: number; decimal: number } {
  const baselineSet = buildBaselineSet(opts)

  // Find the last baseline replik BEFORE this globalIdx
  const globalIdx = opts.offset + localIdx
  let anchorGlobal = -1
  for (const gIdx of baselineSet) {
    if (gIdx < globalIdx) anchorGlobal = gIdx
    else break
  }
  const anchor = anchorGlobal + 1 // 1-based (0 if before first baseline replik)

  // Count how many inserted (non-baseline) repliken share the same anchor
  // (i.e. come after the same last baseline replik and before the next one)
  let decimal = 0
  for (const li of allLocalIdxs) {
    const gi = opts.offset + li
    if (gi >= globalIdx) break // only count predecessors
    if (baselineSet.has(gi)) continue // skip baseline repliken
    // Is this insert's anchor the same as ours?
    let itsAnchorGlobal = -1
    for (const gIdx of baselineSet) {
      if (gIdx < gi) itsAnchorGlobal = gIdx
      else break
    }
    if (itsAnchorGlobal === anchorGlobal) decimal++
  }
  decimal++ // this one is next in sequence

  return { anchor, decimal }
}

export const REPLIK_NUMBER_CSS = `
/* Replik number rendered inline before the character name.
   Uses ::before so it inherits font-family, font-size, bold etc.
   from the character absatz — no hardcoded typography.
   Color is controlled via --replik-number-color CSS variable. */
.ProseMirror [data-replik-number]::before {
  content: attr(data-replik-number) "\\00A0";
  color: var(--replik-number-color, #999999);
  pointer-events: none;
  user-select: none;
}
`

/** Sets the replik number color on the editor container element. */
export function setReplikNumberColor(editorEl: HTMLElement | null, color: string) {
  if (editorEl) editorEl.style.setProperty('--replik-number-color', color)
}
