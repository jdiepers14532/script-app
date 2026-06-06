import { Node, mergeAttributes, Command } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'

export interface AbsatzFormat {
  id: string
  name: string
  kuerzel: string | null
  textbaustein: string | null
  font_family: string
  font_size: number
  bold: boolean
  italic: boolean
  underline: boolean
  uppercase: boolean
  text_align: string
  margin_left: number
  margin_right: number
  space_before: number
  space_after: number
  line_height: number
  enter_next_format: string | null
  tab_next_format: string | null
  sort_order: number
  ist_standard: boolean
  kategorie: string
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    absatz: {
      setAbsatzFormat: (formatId: string) => ReturnType
    }
  }
}

export const AbsatzExtension = Node.create<{ formate: AbsatzFormat[] }>({
  name: 'absatz',
  group: 'block',
  content: 'inline*',

  addOptions() {
    return { formate: [] }
  },

  addAttributes() {
    return {
      format_id: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-format-id') || null,
        renderHTML: (attrs) => attrs.format_id ? { 'data-format-id': attrs.format_id } : {},
      },
      format_name: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-format-name') || null,
        renderHTML: (attrs) => attrs.format_name ? { 'data-format-name': attrs.format_name } : {},
      },
      node_id: {
        // Stable per-block UUID. Assigned by NodeIdExtension.appendTransaction.
        // Preserved on Werkstufe full-copy (content copied 1:1 → Invariante 1.3).
        // Required on ALL top-level block types for revision tracking and diff.
        default: null,
        parseHTML: (el) => el.getAttribute('data-node-id') || null,
        renderHTML: (attrs) => attrs.node_id ? { 'data-node-id': attrs.node_id } : {},
      },
    }
  },

  parseHTML() {
    return [{ tag: 'p[data-format-id]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const fmtId = node.attrs.format_id
    return ['p', mergeAttributes(HTMLAttributes, {
      class: `absatz-node absatz-fmt-${fmtId || 'default'}`,
    }), 0]
  },

  addCommands() {
    return {
      setAbsatzFormat: (formatId: string): Command => ({ chain }) => {
        const fmt = this.options.formate.find(f => f.id === formatId)
        return chain()
          .updateAttributes('absatz', {
            format_id: formatId,
            format_name: fmt?.name ?? null,
          })
          .run()
      },
    }
  },

  addKeyboardShortcuts() {
    const getFormatById = (id: string | null) =>
      id ? this.options.formate.find(f => f.id === id) : null

    return {
      Tab: () => {
        const { state } = this.editor
        const { $from } = state.selection
        const node = $from.node()
        if (node.type.name !== 'absatz') return false

        const currentFmt = getFormatById(node.attrs.format_id)
        // Consume Tab in absatz nodes even when no next format — prevents editor defocus
        if (!currentFmt?.tab_next_format) return true

        const nextFmt = getFormatById(currentFmt.tab_next_format)
        if (!nextFmt) return true

        return this.editor.chain()
          .updateAttributes('absatz', {
            format_id: nextFmt.id,
            format_name: nextFmt.name,
          })
          .run()
      },

      Enter: () => {
        const { state } = this.editor
        const { $from } = state.selection
        const node = $from.node()
        if (node.type.name !== 'absatz') return false

        const currentFmt = getFormatById(node.attrs.format_id)
        if (!currentFmt?.enter_next_format) return false

        const nextFmt = getFormatById(currentFmt.enter_next_format)
        if (!nextFmt) return false

        const { from } = state.selection
        const tr = state.tr

        // Non-empty line: split block and apply follow-up format to the new block.
        // We use direct transaction manipulation instead of chain().splitBlock().updateAttributes()
        // because updateAttributes() uses state.doc (pre-split) to resolve positions from tr.selection
        // (post-split), which causes it to update the original block instead of the new one.
        if (node.content.size > 0) {
          tr.split(from)
          // After split, tr.selection points to start of the new block
          const newBlockPos = tr.selection.$from.before()
          tr.setNodeMarkup(newBlockPos, undefined, {
            format_id: nextFmt.id,
            format_name: nextFmt.name,
          })
          this.editor.view.dispatch(tr)
          return true
        }

        // Empty line: change format in-place (single-step chain, no position mismatch)
        return this.editor.chain()
          .updateAttributes('absatz', {
            format_id: nextFmt.id,
            format_name: nextFmt.name,
          })
          .run()
      },
    }
  },

  // Alt+1…9 = Absatzformat (nach sort_order). e.code-basiert für Mac-Korrektheit
  // (⌥+Ziffer liefert auf Mac kein '1'..'9' in event.key). Alt statt Strg wegen Browser-Tabs.
  addProseMirrorPlugins() {
    const editor = this.editor
    const getFormate = () => [...this.options.formate].sort((a, b) => a.sort_order - b.sort_order)
    return [
      new Plugin({
        key: new PluginKey('absatz-alt-digit'),
        props: {
          handleKeyDown: (_view, event) => {
            if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false
            const m = /^Digit([1-9])$/.exec(event.code)
            if (!m) return false
            const fmt = getFormate()[parseInt(m[1], 10) - 1]
            if (!fmt) return false
            event.preventDefault()
            const { $from } = editor.state.selection
            if ($from.node().type.name === 'absatz') {
              editor.chain().updateAttributes('absatz', { format_id: fmt.id, format_name: fmt.name }).run()
            } else {
              editor.chain().setNode('absatz', { format_id: fmt.id, format_name: fmt.name }).run()
            }
            return true
          },
        },
      }),
    ]
  },
})

// Generate dynamic CSS from loaded formats
export function generateAbsatzCSS(formate: AbsatzFormat[]): string {
  let css = `.ProseMirror .absatz-node {
  margin: 0;
  padding: 0;
  white-space: pre-wrap;
  word-break: break-word;
}\n`

  for (const fmt of formate) {
    const rules: string[] = []
    rules.push(`font-family: '${fmt.font_family}', 'Courier New', monospace`)
    rules.push(`font-size: ${fmt.font_size}pt`)
    rules.push(`line-height: ${fmt.line_height}`)
    rules.push(`text-align: ${fmt.text_align}`)
    if (fmt.bold) rules.push('font-weight: bold')
    if (fmt.italic) rules.push('font-style: italic')
    if (fmt.underline) rules.push('text-decoration: underline')
    if (fmt.uppercase) rules.push('text-transform: uppercase')
    if (fmt.margin_left > 0) rules.push(`margin-left: ${fmt.margin_left}cm`)
    if (fmt.margin_right > 0) rules.push(`margin-right: ${fmt.margin_right}cm`)
    if (fmt.space_before > 0) rules.push(`margin-top: ${fmt.space_before / 12}em`)
    if (fmt.space_after > 0) rules.push(`margin-bottom: ${fmt.space_after / 12}em`)

    css += `.ProseMirror p[data-format-id="${fmt.id}"] { ${rules.join('; ')}; }\n`

    // Textbaustein: non-editable bold prefix via ::before
    if (fmt.textbaustein) {
      const escaped = fmt.textbaustein.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"')
      css += `.ProseMirror p[data-format-id="${fmt.id}"]::before {
  content: '${escaped} ';
  font-weight: 700;
  pointer-events: none;
}\n`
    }
  }

  return css
}

// Map old screenplay_element types to absatzformat names
const ELEMENT_TYPE_TO_NAME: Record<string, string> = {
  scene_heading: 'Standard',
  action: 'Action',
  character: 'Character',
  dialogue: 'Dialogue',
  parenthetical: 'Parenthetical',
  transition: 'Transition',
  shot: 'Shot',
}

// Convert screenplay_element content to absatz content
export function convertScreenplayToAbsatz(
  content: any,
  formate: AbsatzFormat[]
): any {
  if (!content || !content.content) return content

  const nameToFormat = new Map(formate.map(f => [f.name, f]))
  const defaultFormat = formate.find(f => f.ist_standard) ?? formate[0]

  const converted = {
    ...content,
    content: content.content.map((node: any) => {
      if (node.type === 'screenplay_element') {
        const elementType = node.attrs?.element_type ?? 'action'
        const formatName = ELEMENT_TYPE_TO_NAME[elementType] ?? 'Action'
        const fmt = nameToFormat.get(formatName) ?? defaultFormat

        return {
          type: 'absatz',
          attrs: {
            format_id: fmt?.id ?? null,
            format_name: fmt?.name ?? formatName,
          },
          content: node.content,
        }
      }
      return node
    }),
  }

  return converted
}
