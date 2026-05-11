import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'

export const lineNumberPluginKey = new PluginKey('lineNumbers')

/**
 * ProseMirror plugin: line numbers via a SEPARATE gutter element.
 *
 * Inspired by CodeMirror's architecture: the gutter is a sibling DOM element
 * placed next to the editor, NOT inside contenteditable. Numbers are
 * positioned absolutely to match each block node's vertical position.
 *
 * References:
 * - https://discuss.prosemirror.net/t/line-numbers/849
 * - https://discuss.prosemirror.net/t/what-would-it-take-to-implement-line-numbers/4989
 * - CodeMirror gutter architecture (separate DOM layer)
 */
export function createLineNumberPlugin() {
  return new Plugin({
    key: lineNumberPluginKey,
    view(editorView) {
      return new LineNumberGutter(editorView)
    },
  })
}

class LineNumberGutter {
  private gutter: HTMLDivElement
  private view: EditorView
  private raf: number | null = null

  constructor(view: EditorView) {
    this.view = view

    // Create gutter element as overlay on the editor's padding area
    this.gutter = document.createElement('div')
    this.gutter.className = 'pm-line-gutter'
    this.gutter.setAttribute('contenteditable', 'false')
    this.gutter.setAttribute('aria-hidden', 'true')

    // Insert into DOM: place gutter as sibling before the editor
    const parent = view.dom.parentElement
    if (parent) {
      parent.style.position = 'relative'
      parent.insertBefore(this.gutter, view.dom)
    }

    this.renderNumbers()
  }

  update(view: EditorView) {
    this.view = view
    this.scheduleRender()
  }

  destroy() {
    if (this.raf) cancelAnimationFrame(this.raf)
    this.gutter.remove()
  }

  private scheduleRender() {
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = requestAnimationFrame(() => {
      this.raf = null
      this.renderNumbers()
    })
  }

  private renderNumbers() {
    const { view } = this
    const doc = view.state.doc
    const editorRect = view.dom.getBoundingClientRect()

    let html = ''
    let lineNum = 0

    doc.forEach((node: any, offset: number) => {
      lineNum++
      if (lineNum % 5 !== 0) return

      try {
        // Get the DOM element for this block node
        const domNode = view.nodeDOM(offset)
        if (!domNode || !(domNode instanceof HTMLElement)) return

        const blockRect = domNode.getBoundingClientRect()
        const top = blockRect.top - editorRect.top

        html += `<div class="pm-ln" style="top:${Math.round(top)}px">${lineNum}</div>`
      } catch {
        // nodeDOM can throw for some positions — skip silently
      }
    })

    this.gutter.innerHTML = html
  }
}

export const LINE_NUMBER_CSS = `
.ProseMirror.has-line-numbers {
  padding-left: 52px !important;
}
.pm-line-gutter {
  position: absolute;
  top: 0;
  left: 0;
  width: 52px;
  height: 100%;
  pointer-events: none;
  user-select: none;
  z-index: 1;
}
.pm-ln {
  position: absolute;
  left: 0;
  width: 36px;
  text-align: right;
  font-family: 'Courier Prime', 'Courier New', monospace;
  font-size: 10px;
  line-height: 1;
  color: var(--text-primary);
  opacity: 0.35;
}
`
