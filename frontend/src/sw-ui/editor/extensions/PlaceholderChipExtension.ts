import { Node, mergeAttributes } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    placeholder_chip: {
      insertPlaceholderChip: (key: string) => ReturnType
    }
  }
}

// ── Placeholder definitions ───────────────────────────────────────────────────

export type PlaceholderZone = 'alle' | 'kopfzeile' | 'fusszeile'

export interface PlaceholderDef {
  key: string
  label: string
  zone: PlaceholderZone
  color: string
}

export const PLACEHOLDER_DEFS: PlaceholderDef[] = [
  { key: '{{produktion}}',    label: 'Produktion',   zone: 'alle',      color: '#007AFF' },
  { key: '{{staffel}}',       label: 'Staffel',      zone: 'alle',      color: '#007AFF' },
  { key: '{{block}}',         label: 'Block',        zone: 'alle',      color: '#007AFF' },
  { key: '{{folge}}',         label: 'Folge',        zone: 'alle',      color: '#007AFF' },
  { key: '{{folgentitel}}',   label: 'Folgentitel',  zone: 'alle',      color: '#007AFF' },
  { key: '{{fassung}}',       label: 'Fassung',      zone: 'alle',      color: '#007AFF' },
  { key: '{{version}}',       label: 'Version',      zone: 'alle',      color: '#007AFF' },
  { key: '{{stand_datum}}',   label: 'Stand-Datum',  zone: 'alle',      color: '#007AFF' },
  { key: '{{autor}}',         label: 'Autor',        zone: 'alle',      color: '#007AFF' },
  { key: '{{regie}}',         label: 'Regie',        zone: 'alle',      color: '#007AFF' },
  { key: '{{firmenname}}',    label: 'Firmenname',    zone: 'alle',      color: '#5856D6' },
  { key: '{{sender}}',        label: 'Sender',        zone: 'alle',      color: '#FF9500' },
  { key: '{{buero_adresse}}', label: 'Büro-Adresse',  zone: 'alle',      color: '#5856D6' },
  { key: '{{seite}}',         label: 'Seitenzahl',    zone: 'fusszeile', color: '#FF9500' },
  { key: '{{seiten_gesamt}}', label: 'Seiten gesamt', zone: 'fusszeile', color: '#FF9500' },
]

export function getPlaceholdersForZone(zone: PlaceholderZone): PlaceholderDef[] {
  return PLACEHOLDER_DEFS.filter(p => p.zone === 'alle' || p.zone === zone)
}

export function getPlaceholderColor(key: string): string {
  return PLACEHOLDER_DEFS.find(p => p.key === key)?.color ?? '#757575'
}

export function getPlaceholderLabel(key: string): string {
  return PLACEHOLDER_DEFS.find(p => p.key === key)?.label ?? key
}

// ── Tiptap Node Extension ─────────────────────────────────────────────────────

export const PlaceholderChipExtension = Node.create({
  name: 'placeholder_chip',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      key: {
        default: null,
        parseHTML: el => el.getAttribute('data-placeholder-key'),
        renderHTML: attrs => ({ 'data-placeholder-key': attrs.key }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-placeholder-key]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const key   = node.attrs.key as string
    const color = getPlaceholderColor(key)
    const label = getPlaceholderLabel(key)
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        class: 'placeholder-chip',
        contenteditable: 'false',
        style: [
          'display:inline-flex', 'align-items:center', 'gap:3px',
          `background:${color}1A`, `color:${color}`, `border:1px solid ${color}55`,
          'border-radius:4px', 'font-size:11px', 'font-weight:600', 'line-height:1',
          'padding:2px 7px', 'white-space:nowrap', 'user-select:none',
          'cursor:default', 'vertical-align:middle', 'font-family:inherit',
        ].join(';'),
      }),
      label,
    ]
  },

  addCommands() {
    return {
      insertPlaceholderChip:
        (key: string) =>
        ({ chain }: { chain: () => any }) =>
          chain().insertContent({ type: this.name, attrs: { key } }).run(),
    }
  },
})

// ── CSS to inject once ────────────────────────────────────────────────────────

export const PLACEHOLDER_CHIP_CSS = `
.placeholder-chip {
  display: inline-flex !important;
  align-items: center;
  vertical-align: middle;
  user-select: none;
  cursor: default;
}
.ProseMirror .placeholder-chip.ProseMirror-selectednode {
  outline: 2px solid #007AFF;
  outline-offset: 1px;
  border-radius: 4px;
}
`
