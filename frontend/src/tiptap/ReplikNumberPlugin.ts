import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export const replikNumberPluginKey = new PluginKey('replikNumbers')

interface ReplikPluginState {
  offset: number
  baseline: BaselineEntry[] | null
  isLocked: boolean
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
  const decos: Decoration[] = []
  let localIdx = 0

  doc.forEach((node: any, offset: number) => {
    if (!isCharacterNode(node)) return

    let label: string

    if (opts.isLocked && opts.baseline) {
      const baseCount = opts.baseline.reduce((sum, b) => sum + b.count, 0) > 0
        ? getBaselineNumber(opts, localIdx)
        : null
      if (baseCount !== null) {
        label = `${baseCount}.`
      } else {
        const { num, suffix } = getLockedInsertLabel(opts, localIdx)
        label = `${num}${suffix}.`
      }
    } else {
      const globalNum = opts.offset + localIdx + 1
      label = `${globalNum}.`
    }

    // Decorate the node itself — CSS ::before picks up the attribute and
    // renders the number inline, inheriting all character paragraph styles.
    decos.push(
      Decoration.node(offset, offset + node.nodeSize, {
        'data-replik-number': label,
      }, { key: `rn-${localIdx}` })
    )

    localIdx++
  })

  return DecorationSet.create(doc, decos)
}

/**
 * In locked mode, check if localIdx maps to a baseline replik.
 */
function getBaselineNumber(opts: ReplikPluginState, localIdx: number): number | null {
  if (!opts.baseline) return null
  // Find this scene's entry in the baseline
  // The baseline contains entries for ALL scenes. We need the entry for the current scene.
  // Since the plugin only knows the offset, we use it to find the right baseline segment.
  const sceneStart = opts.offset
  const globalIdx = sceneStart + localIdx
  // Check if this globalIdx exists in the baseline
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
 * For a newly inserted replik in locked mode, find the preceding baseline
 * number and append a/b/c suffix.
 */
function getLockedInsertLabel(opts: ReplikPluginState, localIdx: number): { num: number; suffix: string } {
  const globalIdx = opts.offset + localIdx
  // Find the last baseline replik before this position
  let lastBaseNum = 0
  let cumulative = 0
  if (opts.baseline) {
    for (const entry of opts.baseline) {
      for (let i = 0; i < entry.count; i++) {
        if (cumulative + i < globalIdx) {
          lastBaseNum = cumulative + i + 1
        }
      }
      cumulative += entry.count
    }
  }

  // Count how many non-baseline repliken have been inserted between lastBaseNum and this one
  // For simplicity: suffix is based on how many inserts after the same base number
  // This is an approximation — we count from the local perspective
  const suffixIdx = globalIdx - lastBaseNum
  const suffix = suffixIdx > 0 && suffixIdx <= 26
    ? String.fromCharCode(96 + suffixIdx) // a=1, b=2, ...
    : suffixIdx > 26 ? `${suffixIdx}` : 'a'

  return { num: lastBaseNum || 1, suffix }
}

export const REPLIK_NUMBER_CSS = `
/* Replik number rendered inline before the character name.
   Uses ::before so it inherits font-family, font-size, bold etc.
   from the character absatz — no hardcoded typography. */
.ProseMirror [data-replik-number]::before {
  content: attr(data-replik-number) "\\00A0";
  color: var(--text-muted, #999);
  pointer-events: none;
  user-select: none;
}
`
