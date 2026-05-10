import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export const lineNumberPluginKey = new PluginKey('lineNumbers')

/**
 * ProseMirror plugin: line numbers in the left gutter.
 *
 * Uses Decoration.node() to add a data-line-num attribute + CSS class
 * to every 5th block node. The number is rendered via ::after pseudo-element.
 * This is the most reliable approach because it modifies existing DOM elements
 * rather than inserting new ones (no contenteditable/widget issues).
 */
export function createLineNumberPlugin() {
  return new Plugin({
    key: lineNumberPluginKey,
    state: {
      init(_, state) { return buildDecorations(state.doc) },
      apply(tr, old) {
        if (tr.docChanged) return buildDecorations(tr.doc)
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

function buildDecorations(doc: any): DecorationSet {
  const decos: Decoration[] = []
  let lineNum = 0

  doc.forEach((node: any, offset: number) => {
    lineNum++
    if (lineNum % 5 === 0) {
      decos.push(
        Decoration.node(offset, offset + node.nodeSize, {
          class: 'ln-numbered',
          'data-line-num': String(lineNum),
        })
      )
    }
  })

  return DecorationSet.create(doc, decos)
}

export const LINE_NUMBER_CSS = `
.ProseMirror.has-line-numbers {
  padding-left: 52px !important;
}
.ProseMirror.has-line-numbers .ln-numbered {
  position: relative;
}
.ProseMirror.has-line-numbers .ln-numbered::after {
  content: attr(data-line-num);
  position: absolute;
  left: -48px;
  top: 0;
  width: 32px;
  text-align: right;
  font-family: 'Courier Prime', 'Courier New', monospace;
  font-size: 10px;
  line-height: inherit;
  color: var(--text-primary);
  opacity: 0.4;
  pointer-events: none;
}
`
