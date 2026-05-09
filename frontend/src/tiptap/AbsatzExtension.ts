import { Node, mergeAttributes, Command } from '@tiptap/core'

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

    // Build Alt+1 through Alt+9 shortcuts for format selection
    const altShortcuts: Record<string, () => boolean> = {}
    for (let i = 1; i <= 9; i++) {
      altShortcuts[`Alt-${i}`] = () => {
        const fmt = this.options.formate.sort((a, b) => a.sort_order - b.sort_order)[i - 1]
        if (!fmt) return false
        return this.editor.chain()
          .updateAttributes('absatz', { format_id: fmt.id, format_name: fmt.name })
          .run()
      }
    }

    return {
      ...altShortcuts,

      Tab: () => {
        const { state } = this.editor
        const { $from } = state.selection
        const node = $from.node()
        if (node.type.name !== 'absatz') return false

        const currentFmt = getFormatById(node.attrs.format_id)
        if (!currentFmt?.tab_next_format) return false

        const nextFmt = getFormatById(currentFmt.tab_next_format)
        if (!nextFmt) return false

        return this.editor.chain()
          .updateAttributes('absatz', {
            format_id: nextFmt.id,
            format_name: nextFmt.name,
          })
          .run()
      },

      Enter: () => {
        const { state } = this.editor
        const { $from, empty } = state.selection
        const node = $from.node()
        if (node.type.name !== 'absatz') return false

        const currentFmt = getFormatById(node.attrs.format_id)
        if (!currentFmt?.enter_next_format) return false

        const nextFmt = getFormatById(currentFmt.enter_next_format)
        if (!nextFmt) return false

        if (!empty || $from.parentOffset < node.nodeSize - 2) {
          return this.editor.chain()
            .splitBlock()
            .updateAttributes('absatz', {
              format_id: nextFmt.id,
              format_name: nextFmt.name,
            })
            .run()
        }
        return this.editor.chain()
          .updateAttributes('absatz', {
            format_id: nextFmt.id,
            format_name: nextFmt.name,
          })
          .run()
      },
    }
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
    if (fmt.margin_left > 0) rules.push(`margin-left: ${fmt.margin_left}in`)
    if (fmt.margin_right > 0) rules.push(`margin-right: ${fmt.margin_right}in`)
    if (fmt.space_before > 0) rules.push(`margin-top: ${fmt.space_before / 12}em`)
    if (fmt.space_after > 0) rules.push(`margin-bottom: ${fmt.space_after / 12}em`)

    css += `.ProseMirror .absatz-fmt-${fmt.id} { ${rules.join('; ')}; }\n`
  }

  return css
}

// Map old screenplay_element types to absatzformat names
const ELEMENT_TYPE_TO_NAME: Record<string, string> = {
  scene_heading: 'Szenenueberschrift',
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
