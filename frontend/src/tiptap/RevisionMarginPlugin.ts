import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export const revisionMarginKey = new PluginKey('revisionMargin')

export interface RevisionMarginOptions {
  changedBlocks: Set<number>
  revisionColor: string | null
}

/**
 * Marks changed paragraphs with a CSS class that renders a `*` in the right margin.
 * Matches the WGA/Final-Draft standard for revision pages.
 */
export function createRevisionMarginPlugin(opts: RevisionMarginOptions) {
  return new Plugin({
    key: revisionMarginKey,
    state: {
      init(_, state) { return buildDecorations(state.doc, opts) },
      apply(tr, old) {
        if (tr.docChanged) return buildDecorations(tr.doc, opts)
        return old
      },
    },
    props: {
      decorations(state) { return this.getState(state) },
    },
  })
}

function buildDecorations(doc: any, opts: RevisionMarginOptions): DecorationSet {
  if (!opts.changedBlocks.size || !opts.revisionColor) return DecorationSet.empty
  const decos: Decoration[] = []
  let idx = 0
  doc.forEach((node: any, offset: number) => {
    if (opts.changedBlocks.has(idx)) {
      decos.push(
        Decoration.node(offset, offset + node.nodeSize, {
          class: 'revision-changed',
          style: `--revision-color: ${opts.revisionColor}`,
        })
      )
    }
    idx++
  })
  return DecorationSet.create(doc, decos)
}

export const REVISION_MARGIN_CSS = `
.revision-changed {
  position: relative;
}
.revision-changed::after {
  content: '*';
  position: absolute;
  right: -18px;
  top: 0;
  color: var(--revision-color, #FF3B30);
  font-weight: 700;
  font-size: 13px;
  line-height: 1.4;
  pointer-events: none;
  user-select: none;
}
`
