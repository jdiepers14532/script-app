import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export const lineNumberPluginKey = new PluginKey('lineNumbers')

/**
 * ProseMirror plugin: line numbers using Decoration.widget().
 *
 * Reference: ReplikNumberPlugin.ts in this codebase (proven working pattern).
 * Uses the same Decoration.widget approach — creates a zero-height flow element
 * between blocks, with the number positioned into the left padding area.
 */
export function createLineNumberPlugin() {
  return new Plugin({
    key: lineNumberPluginKey,
    state: {
      init(_, state) { return buildLineDecorations(state.doc) },
      apply(tr, old) {
        if (tr.docChanged) return buildLineDecorations(tr.doc)
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

function buildLineDecorations(doc: any): DecorationSet {
  const decos: Decoration[] = []
  let lineNum = 0

  doc.forEach((node: any, offset: number) => {
    lineNum++
    if (lineNum % 5 !== 0) return

    decos.push(
      Decoration.widget(offset, () => {
        const wrapper = document.createElement('div')
        wrapper.className = 'pm-ln-wrap'

        const span = document.createElement('span')
        span.className = 'pm-ln'
        span.textContent = String(lineNum)

        wrapper.appendChild(span)
        return wrapper
      }, { side: -1, key: `ln-${lineNum}` })
    )
  })

  return DecorationSet.create(doc, decos)
}

export const LINE_NUMBER_CSS = `
.ProseMirror.has-line-numbers {
  padding-left: 48px !important;
}
.pm-ln-wrap {
  height: 0;
  overflow: visible;
  position: relative;
  pointer-events: none;
  user-select: none;
  line-height: 0;
  margin: 0;
  padding: 0;
}
.pm-ln {
  position: absolute;
  left: -44px;
  top: 2px;
  display: block;
  width: 32px;
  text-align: right;
  font-family: 'Courier Prime', 'Courier New', monospace;
  font-size: 10px;
  line-height: 1;
  color: var(--text-primary);
  opacity: 0.35;
}
`
