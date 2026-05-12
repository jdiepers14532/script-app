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

    const num = lineNum // capture value for closure
    decos.push(
      Decoration.widget(offset, () => {
        const wrapper = document.createElement('div')
        wrapper.className = 'pm-ln-wrap'

        const span = document.createElement('span')
        span.className = 'pm-ln'
        span.textContent = String(num)

        wrapper.appendChild(span)
        return wrapper
      }, { side: -1, key: `ln-${num}` })
    )
  })

  return DecorationSet.create(doc, decos)
}

export interface LineNumberSettings {
  fontFamily: string
  fontSizePt: number
  color: string
  marginCm: number
}

export const LN_DEFAULTS: LineNumberSettings = {
  fontFamily: "'Courier Prime', 'Courier New', monospace",
  fontSizePt: 10,
  color: '#999999',
  marginCm: 1,
}

/**
 * Generate dynamic CSS for line numbers based on settings.
 *
 * Numbers are positioned in the left margin area of the PageWrapper.
 * Uses CSS variable --page-padding (set by PageWrapper) so line numbers
 * automatically adapt when the page margin changes.
 *
 * marginCm = distance from the physical paper left edge to the left edge of the number column.
 */
export function generateLineNumberCSS(opts: LineNumberSettings): string {
  return `
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
  left: calc(-1 * var(--page-padding, 96px) + ${opts.marginCm}cm);
  top: 2px;
  display: block;
  width: 1cm;
  text-align: right;
  font-family: ${opts.fontFamily};
  font-size: ${opts.fontSizePt}pt;
  line-height: 1;
  color: ${opts.color};
  pointer-events: none;
}
`
}
