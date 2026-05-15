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
  /** Short description of what this chip outputs */
  beschreibung: string
  /** Data source: "App · Tabelle.Feld" */
  quelle: string
}

export const PLACEHOLDER_DEFS: PlaceholderDef[] = [
  {
    key: '{{produktion}}', label: 'Produktion', zone: 'alle', color: '#007AFF',
    beschreibung: 'Titel der Produktion, z.\u202fB. \u201eRote Rosen\u201c.',
    quelle: 'script_db \u00b7 produktionen.titel',
  },
  {
    key: '{{staffel}}', label: 'Staffel', zone: 'alle', color: '#007AFF',
    beschreibung: 'Staffel-Nummer der Produktion (sofern in produktion.app gepflegt).',
    quelle: 'produktion.app \u00b7 productions.staffelnummer',
  },
  {
    key: '{{block}}', label: 'Block', zone: 'alle', color: '#007AFF',
    beschreibung: 'Block-Bezeichnung der Episode (derzeit nicht bef\u00fcllt).',
    quelle: '\u2013 (in Planung)',
  },
  {
    key: '{{folge}}', label: 'Folge', zone: 'alle', color: '#007AFF',
    beschreibung: 'Episodennummer, z.\u202fB. \u201e3841\u201c.',
    quelle: 'script_db \u00b7 folgen.folge_nummer',
  },
  {
    key: '{{folgentitel}}', label: 'Folgentitel', zone: 'alle', color: '#007AFF',
    beschreibung: 'Titel der Episode.',
    quelle: 'script_db \u00b7 folgen.folgen_titel',
  },
  {
    key: '{{werkstufe}}', label: 'Werkstufe', zone: 'alle', color: '#007AFF',
    beschreibung: 'Dokumenttyp + Versionsnummer, z.\u202fB. \u201eDrehbuch V2\u201c oder \u201eStoryline V1\u201c.',
    quelle: 'script_db \u00b7 werkstufen.typ + version_nummer',
  },
  {
    key: '{{fassung}}', label: 'Fassung', zone: 'alle', color: '#007AFF',
    beschreibung: 'Frei vergebener Name der Werkstufe, z.\u202fB. \u201eRohfassung\u201c. Kann leer sein.',
    quelle: 'script_db \u00b7 werkstufen.label',
  },
  {
    key: '{{version}}', label: 'Version', zone: 'alle', color: '#007AFF',
    beschreibung: 'Automatisch hochgez\u00e4hlte Versionsnummer, formatiert als \u201eV1\u201c, \u201eV2\u201c usw.',
    quelle: 'script_db \u00b7 werkstufen.version_nummer',
  },
  {
    key: '{{stand_datum}}', label: 'Stand-Datum', zone: 'alle', color: '#007AFF',
    beschreibung: 'Datum des Dokumentenstands (manuell gesetzt oder heute).',
    quelle: 'script_db \u00b7 werkstufen.stand_datum',
  },
  {
    key: '{{autor}}', label: 'Autor', zone: 'alle', color: '#007AFF',
    beschreibung: 'Name des Nutzers, der den Export ausl\u00f6st.',
    quelle: 'auth.app \u00b7 users.name',
  },
  {
    key: '{{regie}}', label: 'Regie', zone: 'alle', color: '#007AFF',
    beschreibung: 'Regisseur der Episode (derzeit nicht bef\u00fcllt).',
    quelle: '\u2013 (in Planung)',
  },
  {
    key: '{{firmenname}}', label: 'Firmenname', zone: 'alle', color: '#5856D6',
    beschreibung: 'Name der Produktionsfirma aus den globalen Unternehmenseinstellungen.',
    quelle: 'auth.app \u00b7 company_info.company_name',
  },
  {
    key: '{{sender}}', label: 'Sender', zone: 'alle', color: '#FF9500',
    beschreibung: 'Ausstrahlender TV-Sender der Produktion.',
    quelle: 'produktion.app \u00b7 productions.sender',
  },
  {
    key: '{{buero_adresse}}', label: 'B\u00fcro-Adresse', zone: 'alle', color: '#5856D6',
    beschreibung: 'Adresse des Produktionsb\u00fcros.',
    quelle: 'produktion.app \u00b7 productions.buero_adresse',
  },
  {
    key: '{{sendedatum}}', label: 'Sendedatum', zone: 'alle', color: '#FF9500',
    beschreibung: 'Geplantes Ausstrahlungsdatum der Episode, z.\u202fB. \u201eMo. 12.05.2026\u201c.',
    quelle: 'produktion.app \u00b7 broadcast_events.air_date (via reihen_id)',
  },
  {
    key: '{{produktionszeitraum}}', label: 'Produktionszeitraum', zone: 'alle', color: '#34C759',
    beschreibung: 'Drehzeitraum der Produktion (von\u2013bis).',
    quelle: 'produktion.app \u00b7 productions.drehzeitraum',
  },
  {
    key: '{{seite}}', label: 'Seitenzahl', zone: 'fusszeile', color: '#FF9500',
    beschreibung: 'Aktuelle Seitenzahl. Nur in Fu\u00dfzeilen verf\u00fcgbar.',
    quelle: 'Berechnet beim PDF-Export',
  },
  {
    key: '{{seiten_gesamt}}', label: 'Seiten gesamt', zone: 'fusszeile', color: '#FF9500',
    beschreibung: 'Gesamtanzahl Seiten des Dokuments. Nur in Fu\u00dfzeilen verf\u00fcgbar.',
    quelle: 'Berechnet beim PDF-Export',
  },
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
          'border-radius:4px', 'font-size:11px', 'font-weight:inherit', 'font-style:inherit', 'line-height:1',
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
