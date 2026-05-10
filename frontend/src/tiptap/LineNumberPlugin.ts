import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export const lineNumberPluginKey = new PluginKey('lineNumbers')

/**
 * ProseMirror plugin that renders line numbers in the left gutter.
 * Uses widget decorations placed INSIDE each 5th block node.
 * The widget is absolutely positioned relative to its parent block.
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
      const num = lineNum
      // Place widget BETWEEN blocks (before this block)
      decos.push(
        Decoration.widget(offset, () => {
          const el = document.createElement('div')
          el.className = 'line-number-gutter'
          el.setAttribute('data-ln', String(num))
          el.textContent = String(num)
          return el
        }, { side: -1, key: `ln-${num}` })
      )
    }
  })

  return DecorationSet.create(doc, decos)
}

export const LINE_NUMBER_CSS = `
.ProseMirror.has-line-numbers {
  padding-left: 52px !important;
}
.line-number-gutter {
  height: 0 !important;
  overflow: visible !important;
  position: relative !important;
  pointer-events: none;
  user-select: none;
}
.line-number-gutter::after {
  content: attr(data-ln);
  position: absolute;
  left: -52px;
  bottom: 0;
  width: 28px;
  text-align: right;
  font-family: 'Courier Prime', 'Courier New', monospace;
  font-size: 10px;
  line-height: 1;
  color: var(--text-secondary);
}
`
