import { Node, mergeAttributes, Command } from '@tiptap/core'
import { uuidv4 } from '../utils/uuid'

export type ScreenplayElementType =
  | 'scene_heading'
  | 'action'
  | 'character'
  | 'dialogue'
  | 'parenthetical'
  | 'transition'
  | 'shot'

export interface FormatElement {
  element_typ: ScreenplayElementType
  einrueckung_links: number
  einrueckung_rechts: number
  ausrichtung: 'left' | 'center' | 'right'
  grossbuchstaben: boolean
  tab_folge_element: ScreenplayElementType
  enter_folge_element: ScreenplayElementType
}

// Final Draft Standard defaults (used when no template loaded from DB)
export const DEFAULT_FORMAT: Record<ScreenplayElementType, Omit<FormatElement, 'element_typ'>> = {
  scene_heading:  { einrueckung_links: 0,  einrueckung_rechts: 0,  ausrichtung: 'left',  grossbuchstaben: true,  tab_folge_element: 'action',        enter_folge_element: 'action' },
  action:         { einrueckung_links: 0,  einrueckung_rechts: 0,  ausrichtung: 'left',  grossbuchstaben: false, tab_folge_element: 'character',      enter_folge_element: 'action' },
  character:      { einrueckung_links: 37, einrueckung_rechts: 0,  ausrichtung: 'left',  grossbuchstaben: true,  tab_folge_element: 'action',         enter_folge_element: 'dialogue' },
  dialogue:       { einrueckung_links: 25, einrueckung_rechts: 25, ausrichtung: 'left',  grossbuchstaben: false, tab_folge_element: 'character',      enter_folge_element: 'character' },
  parenthetical:  { einrueckung_links: 30, einrueckung_rechts: 30, ausrichtung: 'left',  grossbuchstaben: false, tab_folge_element: 'dialogue',       enter_folge_element: 'dialogue' },
  transition:     { einrueckung_links: 0,  einrueckung_rechts: 0,  ausrichtung: 'right', grossbuchstaben: true,  tab_folge_element: 'scene_heading',  enter_folge_element: 'scene_heading' },
  shot:           { einrueckung_links: 0,  einrueckung_rechts: 0,  ausrichtung: 'left',  grossbuchstaben: true,  tab_folge_element: 'action',         enter_folge_element: 'action' },
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    screenplayElement: {
      setElementType: (type: ScreenplayElementType) => ReturnType
    }
  }
}

export const ScreenplayExtension = Node.create<{ formatElements: FormatElement[] }>({
  name: 'screenplay_element',
  group: 'block',
  content: 'inline*',

  addOptions() {
    return { formatElements: [] }
  },

  addAttributes() {
    return {
      element_type: {
        default: 'action',
        parseHTML: (el) => (el.getAttribute('data-sp-type') as ScreenplayElementType) || 'action',
        renderHTML: (attrs) => ({ 'data-sp-type': attrs.element_type }),
      },
      szene_uuid: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-szene-uuid') || null,
        renderHTML: (attrs) => attrs.szene_uuid ? { 'data-szene-uuid': attrs.szene_uuid } : {},
      },
    }
  },

  parseHTML() {
    return [{ tag: 'p[data-sp-type]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['p', mergeAttributes(HTMLAttributes, {
      class: `sp-el sp-${node.attrs.element_type}`,
    }), 0]
  },

  addCommands() {
    return {
      setElementType: (type: ScreenplayElementType): Command => ({ chain, state }) => {
        const { from } = state.selection
        const node = state.doc.nodeAt(from)
        const attrs: any = { element_type: type }
        // New scene_heading gets a fresh UUID if it doesn't have one
        if (type === 'scene_heading' && !node?.attrs?.szene_uuid) {
          attrs.szene_uuid = uuidv4()
        }
        return chain()
          .updateAttributes('screenplay_element', attrs)
          .run()
      },
    }
  },

  addKeyboardShortcuts() {
    const getFormat = (type: ScreenplayElementType) => {
      const custom = this.options.formatElements.find(el => el.element_typ === type)
      return custom ?? { ...DEFAULT_FORMAT[type], element_typ: type }
    }

    return {
      Tab: () => {
        const { state } = this.editor
        const { $from } = state.selection
        const node = $from.node()
        if (node.type.name !== 'screenplay_element') return false

        const currentType = node.attrs.element_type as ScreenplayElementType
        const fmt = getFormat(currentType)
        const nextType = fmt.tab_folge_element

        const attrs: any = { element_type: nextType }
        if (nextType === 'scene_heading') attrs.szene_uuid = uuidv4()

        return this.editor.chain()
          .updateAttributes('screenplay_element', attrs)
          .run()
      },

      Enter: () => {
        const { state } = this.editor
        const { $from, empty } = state.selection
        const node = $from.node()
        if (node.type.name !== 'screenplay_element') return false

        const currentType = node.attrs.element_type as ScreenplayElementType
        const fmt = getFormat(currentType)
        const nextType = fmt.enter_folge_element

        const attrs: any = { element_type: nextType }
        if (nextType === 'scene_heading') attrs.szene_uuid = uuidv4()

        // If at end of non-empty line: insert new element below
        if (!empty || $from.parentOffset < node.nodeSize - 2) {
          return this.editor.chain()
            .splitBlock()
            .updateAttributes('screenplay_element', attrs)
            .run()
        }
        // Empty line: just change type in-place
        return this.editor.chain()
          .updateAttributes('screenplay_element', attrs)
          .run()
      },

      // Final Draft keyboard shortcuts: Ctrl/Cmd + 1–7
      'Mod-1': () => this.editor.commands.setElementType('scene_heading'),
      'Mod-2': () => this.editor.commands.setElementType('action'),
      'Mod-3': () => this.editor.commands.setElementType('character'),
      'Mod-4': () => this.editor.commands.setElementType('parenthetical'),
      'Mod-5': () => this.editor.commands.setElementType('dialogue'),
      'Mod-6': () => this.editor.commands.setElementType('transition'),
      'Mod-7': () => this.editor.commands.setElementType('shot'),
    }
  },
})

// CSS for screenplay elements (inject into document)
export const SCREENPLAY_CSS = `
.ProseMirror .sp-el {
  font-family: 'Courier Prime', 'Courier New', Courier, monospace;
  font-size: 12pt;
  line-height: 1.0;
  margin: 0;
  padding: 0;
  white-space: pre-wrap;
  word-break: break-word;
}
.ProseMirror .sp-scene_heading {
  text-transform: uppercase;
  font-weight: bold;
  margin-top: 1em;
}
.ProseMirror .sp-action { margin-top: 0.5em; }
.ProseMirror .sp-character {
  text-transform: uppercase;
  margin-left: 37%;
  margin-top: 0.5em;
}
.ProseMirror .sp-dialogue {
  margin-left: 25%;
  margin-right: 25%;
}
.ProseMirror .sp-parenthetical {
  margin-left: 30%;
  margin-right: 30%;
}
.ProseMirror .sp-transition {
  text-transform: uppercase;
  text-align: right;
  margin-top: 0.5em;
}
.ProseMirror .sp-shot {
  text-transform: uppercase;
  margin-top: 0.5em;
}
/* element-type picker hint */
.ProseMirror .sp-el[data-sp-type]::before {
  content: attr(data-sp-type-label);
}
`
