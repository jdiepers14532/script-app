import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export const lineNumberPluginKey = new PluginKey('lineNumbers')

/**
 * ProseMirror plugin: line numbers using Decoration.widget().
 *
 * Uses the proven Decoration.widget pattern from ReplikNumberPlugin.ts.
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
        const el = document.createElement('div')
        el.className = 'pm-ln'
        el.dataset.ln = String(num)
        return el
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
 * Numbers sit in the page margin area. The .pm-ln div is zero-height (no layout
 * impact) while its ::after pseudo renders the visible number via position:absolute
 * anchored to the page div (which has position:relative from PageWrapper).
 *
 * marginCm = distance from the physical paper left edge to the right edge
 * of the number column.
 */
export function generateLineNumberCSS(opts: LineNumberSettings): string {
  return `
.pm-ln {
  height: 0;
  line-height: 0;
  overflow: visible;
  margin: 0;
  padding: 0;
  pointer-events: none;
  user-select: none;
  position: relative;
}
.pm-ln::after {
  content: attr(data-ln);
  position: absolute;
  top: 0;
  left: calc(-1 * var(--page-padding, 96px) + ${opts.marginCm}cm);
  width: calc(var(--page-padding, 96px) - ${opts.marginCm}cm - 4px);
  text-align: right;
  font-family: ${opts.fontFamily};
  font-size: ${opts.fontSizePt}pt;
  line-height: 1;
  color: ${opts.color};
  pointer-events: none;
}
`
}
