import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export const freigabeStatusPluginKey = new PluginKey('freigabeStatus')

export interface FreigabeStatusEntry {
  name_upper: string
  combined: 'abgelehnt' | 'ausstehend'
  notiz: string | null
}

export function createFreigabeStatusPlugin(entries: FreigabeStatusEntry[]) {
  const statusMap = new Map(entries.map(e => [e.name_upper, e]))

  return new Plugin({
    key: freigabeStatusPluginKey,
    state: {
      init(_, state) { return buildDecorations(state.doc, statusMap) },
      apply(tr, old) {
        if (tr.docChanged) return buildDecorations(tr.doc, statusMap)
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

function isCharacterNode(node: any): boolean {
  if (node.type.name === 'screenplay_element' && node.attrs?.element_type === 'character') return true
  if (node.type.name === 'absatz') {
    const name = (node.attrs?.format_name ?? '').toLowerCase()
    if (name === 'character' || name === 'rolle' || name === 'figur') return true
  }
  return false
}

function getNodeText(node: any): string {
  let text = ''
  node.forEach((child: any) => {
    if (child.isText) text += child.text
    else text += getNodeText(child)
  })
  return text
}

function buildDecorations(doc: any, statusMap: Map<string, FreigabeStatusEntry>): DecorationSet {
  if (statusMap.size === 0) return DecorationSet.empty
  const decos: Decoration[] = []

  doc.forEach((node: any, offset: number) => {
    if (!isCharacterNode(node)) return
    const rawText = getNodeText(node).trim()
    // Suffix abschneiden: (NT), (OFF), (VO), (ONE-WAY) etc.
    const namePart = rawText.replace(/\s*\([^)]*\)\s*$/, '').trim().toUpperCase()
    const entry = statusMap.get(namePart)
    if (!entry) return
    decos.push(
      Decoration.node(offset, offset + node.nodeSize, {
        'data-freigabe-status': entry.combined,
        'data-freigabe-notiz': entry.notiz ?? '',
      }, { key: `fgs-${namePart}` })
    )
  })

  return DecorationSet.create(doc, decos)
}

export const FREIGABE_STATUS_CSS = `
/* Freigabe-Status: Figurennamen im Editor einfärben (Phase 4) */
.ProseMirror [data-freigabe-status="ausstehend"] {
  color: #FFCC00 !important;
}
.ProseMirror [data-freigabe-status="abgelehnt"] {
  color: #FF3B30 !important;
}
`
