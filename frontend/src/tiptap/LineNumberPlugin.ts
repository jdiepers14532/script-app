import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export const lineNumberPluginKey = new PluginKey('lineNumbers')

/**
 * ProseMirror plugin that renders line numbers in the left gutter.
 * Lines are counted per block node (paragraph/screenplay_element/absatz).
 * Only every 5th line shows the number; counting resets per scene
 * (each scene is a separate editor instance, so reset is automatic).
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
        Decoration.widget(offset, () => {
          const el = document.createElement('span')
          el.className = 'line-number-gutter'
          el.textContent = String(lineNum)
          return el
        }, { side: -1, key: `ln-${lineNum}` })
      )
    }
  })

  return DecorationSet.create(doc, decos)
}

export const LINE_NUMBER_CSS = `
.ProseMirror {
  position: relative;
}
.ProseMirror.has-line-numbers {
  padding-left: 44px !important;
}
.line-number-gutter {
  position: absolute;
  left: 4px;
  width: 32px;
  text-align: right;
  font-family: 'Courier Prime', 'Courier New', monospace;
  font-size: 9px;
  line-height: inherit;
  color: var(--text-muted, #999);
  pointer-events: none;
  user-select: none;
}
`
