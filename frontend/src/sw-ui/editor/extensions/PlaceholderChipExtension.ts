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
    key: '{{staffel}}', label: 'Staffel', zone: 'alle', color: '#FF9500',
    beschreibung: 'Staffel-Nummer der Produktion (sofern in produktion.app gepflegt).',
    quelle: 'produktion.app \u00b7 productions.staffelnummer',
  },
  {
    key: '{{block}}', label: 'Block', zone: 'alle', color: '#FF9500',
    beschreibung: 'Block-Bezeichnung der Episode, ermittelt aus der Folgen-Nummer.',
    quelle: 'produktion.app \u00b7 script-context.blo\u00ecke',
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
    beschreibung: 'Dokumenttyp der Werkstufe, z.\u202fB. \u201eDrehbuch\u201c oder \u201eStoryline\u201c (ohne Versionsnummer \u2013 daf\u00fcr {{version}}).',
    quelle: 'script_db \u00b7 werkstufen.typ',
  },
  {
    key: '{{fassung}}', label: 'Fassung', zone: 'alle', color: '#007AFF',
    beschreibung: 'Frei vergebenes Label der ausgew\u00e4hlten Version, z.\u202fB. \u201eRohfassung\u201c oder \u201e2. \u00dcberarbeitung\u201c. Kann leer sein.',
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
    key: '{{autor}}', label: 'Autor', zone: 'alle', color: '#5856D6',
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
    key: '{{firmen_adresse}}', label: 'Firmenadresse', zone: 'alle', color: '#5856D6',
    beschreibung: 'Stra\u00dfe, PLZ und Stadt der Produktionsfirma.',
    quelle: 'auth.app \u00b7 company_info.company_address',
  },
  {
    key: '{{rechtsform}}', label: 'Rechtsform', zone: 'alle', color: '#5856D6',
    beschreibung: 'Rechtsform der Firma, z.\u202fB. \u201eGmbH\u201c oder \u201eAG\u201c.',
    quelle: 'auth.app \u00b7 company_info.company_legal_form',
  },
  {
    key: '{{handelsregister}}', label: 'Handelsregister', zone: 'alle', color: '#5856D6',
    beschreibung: 'Registergericht und Handelsregisternummer, z.\u202fB. \u201eAmtsgericht L\u00fcneburg HRB 205045\u201c.',
    quelle: 'auth.app \u00b7 company_info.company_register_court + company_register_number',
  },
  {
    key: '{{ust_id}}', label: 'USt-ID', zone: 'alle', color: '#5856D6',
    beschreibung: 'Umsatzsteuer-Identifikationsnummer, z.\u202fB. \u201eDE118621282\u201c.',
    quelle: 'auth.app \u00b7 company_info.company_vat_id',
  },
  {
    key: '{{geschaeftsfuehrung}}', label: 'Gesch\u00e4ftsf\u00fchrung', zone: 'alle', color: '#5856D6',
    beschreibung: 'Name(n) der Gesch\u00e4ftsf\u00fchrung, kommagetrennt.',
    quelle: 'auth.app \u00b7 company_info.company_management',
  },
  {
    key: '{{firmen_email}}', label: 'Firmen-E-Mail', zone: 'alle', color: '#5856D6',
    beschreibung: 'Offizielle E-Mail-Adresse der Produktionsfirma.',
    quelle: 'auth.app \u00b7 company_info.company_email',
  },
  {
    key: '{{firmen_telefon}}', label: 'Firmen-Telefon', zone: 'alle', color: '#5856D6',
    beschreibung: 'Telefonnummer der Produktionsfirma.',
    quelle: 'auth.app \u00b7 company_info.company_phone',
  },
  {
    key: '{{sender}}', label: 'Sender', zone: 'alle', color: '#FF9500',
    beschreibung: 'Ausstrahlender TV-Sender der Produktion.',
    quelle: 'produktion.app \u00b7 productions.sender',
  },
  {
    key: '{{buero_adresse}}', label: 'Produktionsb\u00fcro', zone: 'alle', color: '#FF9500',
    beschreibung: 'Adresse des Produktionsb\u00fcros.',
    quelle: 'produktion.app \u00b7 productions.buero_adresse',
  },
  {
    key: '{{tel_produktion}}', label: 'Tel. Produktion', zone: 'alle', color: '#FF9500',
    beschreibung: 'Telefonnummer des Produktionsb\u00fcros.',
    quelle: 'produktion.app \u00b7 productions.telefon',
  },
  {
    key: '{{sendedatum}}', label: 'Sendedatum', zone: 'alle', color: '#FF9500',
    beschreibung: 'Geplantes Ausstrahlungsdatum der Episode, z.\u202fB. \u201eMo. 12.05.2026\u201c.',
    quelle: 'produktion.app \u00b7 broadcast_events.air_date (via reihen_id)',
  },
  {
    key: '{{produktionszeitraum}}', label: 'Produktionszeitraum', zone: 'alle', color: '#FF9500',
    beschreibung: 'Drehzeitraum der Produktion (von\u2013bis).',
    quelle: 'produktion.app \u00b7 productions.drehzeitraum',
  },
  {
    key: '{{aktuelles_datum}}', label: 'Aktuelles Datum', zone: 'alle', color: '#34C759',
    beschreibung: 'Das aktuelle Datum zum Zeitpunkt des Exports, z.\u202fB. \u201e15.05.2026\u201c.',
    quelle: 'Berechnet beim Export \u00b7 new Date() \u2192 TT.MM.JJJJ',
  },
  {
    key: '{{aktuelles_uhrzeit}}', label: 'Aktuelle Uhrzeit', zone: 'alle', color: '#34C759',
    beschreibung: 'Die aktuelle Uhrzeit zum Zeitpunkt des Exports, z.\u202fB. \u201e14:32\u201c.',
    quelle: 'Berechnet beim Export \u00b7 new Date() \u2192 HH:MM',
  },
  {
    key: '{{aktuelles_jahr}}', label: 'Aktuelles Jahr', zone: 'alle', color: '#34C759',
    beschreibung: 'Das aktuelle Kalenderjahr zum Zeitpunkt des Exports, z.\u202fB. \u201e2026\u201c.',
    quelle: 'Berechnet beim Export \u00b7 new Date().getFullYear()',
  },
  {
    key: '{{folge_laenge_netto}}', label: 'Gesamtl\u00e4nge Netto', zone: 'alle', color: '#007AFF',
    beschreibung: 'Summe aller Szenen-Stoppzeiten der Werkstufe (Netto-L\u00e4nge der Folge), z.\u202fB. \u201e42:18\u201c.',
    quelle: 'script_db \u00b7 dokument_szenen.stoppzeit_sek (summiert)',
  },
  {
    key: '{{notiz_inhalt}}', label: 'Notiz-Inhalt', zone: 'alle', color: '#FF9F0A',
    beschreibung: 'Slot f\u00fcr den Freitext-Inhalt einer Notiz-Szene. Wird beim Export durch den tats\u00e4chlichen Szenen-Inhalt ersetzt. Diesen Chip genau einmal pro Vorlage platzieren.',
    quelle: 'script_db \u00b7 dokument_szenen.content (Notiz-Format)',
  },
  {
    key: '{{seite}}', label: 'Seitenzahl', zone: 'fusszeile', color: '#34C759',
    beschreibung: 'Aktuelle Seitenzahl. Nur in Fu\u00dfzeilen verf\u00fcgbar.',
    quelle: 'Berechnet beim PDF-Export',
  },
  {
    key: '{{seiten_gesamt}}', label: 'Seiten gesamt', zone: 'fusszeile', color: '#34C759',
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
      key:             { default: null, parseHTML: el => el.getAttribute('data-placeholder-key'), renderHTML: attrs => ({ 'data-placeholder-key': attrs.key }) },
      fontFamily:      { default: null, parseHTML: el => el.getAttribute('data-ff')  || null, renderHTML: attrs => attrs.fontFamily      ? { 'data-ff':  attrs.fontFamily }      : {} },
      fontSize:        { default: null, parseHTML: el => el.getAttribute('data-fs')  || null, renderHTML: attrs => attrs.fontSize        ? { 'data-fs':  attrs.fontSize }        : {} },
      fontWeight:      { default: null, parseHTML: el => el.getAttribute('data-fw')  || null, renderHTML: attrs => attrs.fontWeight      ? { 'data-fw':  attrs.fontWeight }      : {} },
      fontStyle:       { default: null, parseHTML: el => el.getAttribute('data-fst') || null, renderHTML: attrs => attrs.fontStyle       ? { 'data-fst': attrs.fontStyle }       : {} },
      textDecoration:  { default: null, parseHTML: el => el.getAttribute('data-td')  || null, renderHTML: attrs => attrs.textDecoration  ? { 'data-td':  attrs.textDecoration }  : {} },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-placeholder-key]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const key   = node.attrs.key as string
    const color = getPlaceholderColor(key)
    const label = getPlaceholderLabel(key)
    const a = node.attrs
    const styleArr = [
      'display:inline-flex', 'align-items:center', 'gap:3px',
      `background:${color}1A`, `color:${color}`, `border:1px solid ${color}55`,
      'border-radius:4px', 'line-height:1',
      'padding:2px 7px', 'white-space:nowrap', 'user-select:none',
      'cursor:default', 'vertical-align:middle',
      // Font: use chip's own attrs when set, otherwise inherit from paragraph
      `font-family:${a.fontFamily   || 'inherit'}`,
      `font-size:${a.fontSize       || 'inherit'}`,
      `font-weight:${a.fontWeight   || 'inherit'}`,
      `font-style:${a.fontStyle     || 'inherit'}`,
      a.textDecoration ? `text-decoration:${a.textDecoration}` : 'text-decoration:inherit',
    ]
    return ['span', mergeAttributes(HTMLAttributes, { class: 'placeholder-chip', contenteditable: 'false', style: styleArr.join(';') }), label]
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
