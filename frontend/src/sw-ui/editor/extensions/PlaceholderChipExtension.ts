import { Node, mergeAttributes } from '@tiptap/core'
import { Plugin, PluginKey, NodeSelection } from 'prosemirror-state'
import { DecorationSet, Decoration } from 'prosemirror-view'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    placeholder_chip: {
      insertPlaceholderChip: (key: string) => ReturnType
    }
    placeholder_if: {
      insertPlaceholderIf: () => ReturnType
    }
    placeholder_endif: {
      insertPlaceholderEndIf: () => ReturnType
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
    key: '{{persoenlicher_ausdruck}}', label: 'Pers. Ausdruck', zone: 'alle', color: '#FF3B30',
    beschreibung: 'Freitextfeld, das beim Export bef\u00fcllt wird \u2013 z.\u202fB. Name des Empf\u00e4ngers. Bleibt leer, wenn beim Export nichts eingegeben wird.',
    quelle: 'Export-Dialog \u00b7 Eingabe zur Export-Zeit',
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
    key: '{{aktuelles_uhrzeit}}', label: 'Aktuelle Uhrzeit (Prod.)', zone: 'alle', color: '#34C759',
    beschreibung: 'Die aktuelle Uhrzeit zum Zeitpunkt des Exports in der Zeitzone des Produktionslandes, z.\u202fB. \u201e14:32\u201c.\nFallback-Kette: Produktionsland (ProdDB) \u2192 Browser-Zeitzone \u2192 UTC.',
    quelle: 'Berechnet beim Export \u00b7 new Date() \u2192 HH:MM (Prod.-Zeitzone)',
  },
  {
    key: '{{aktuelles_uhrzeit_utc}}', label: 'Aktuelle Uhrzeit (UTC)', zone: 'alle', color: '#34C759',
    beschreibung: 'Die aktuelle Uhrzeit in koordinierter Weltzeit (UTC), z.\u202fB. \u201e12:32\u202f(UTC)\u201c.\nUTC ist das kanonische Speicherformat \u2014 f\u00fcr ortsunabh\u00e4ngige Zeitangaben.',
    quelle: 'Berechnet beim Export \u00b7 new Date() \u2192 UTC',
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
    key: '{{notiz_inhalt}}', label: 'Dokument-Inhalt', zone: 'alle', color: '#FF9F0A',
    beschreibung: 'Slot f\u00fcr den Freitext-Inhalt einer Notiz-Szene. Wird beim Export durch den tats\u00e4chlichen Szenen-Inhalt ersetzt. Diesen Chip genau einmal pro Vorlage platzieren.',
    quelle: 'script_db \u00b7 dokument_szenen.content (Notiz-Format)',
  },
  {
    key: '{{druckauswahl}}', label: 'Druckauswahl', zone: 'alle', color: '#FF6B35',
    beschreibung: 'Zeigt aktive Exportfilter an, z.\u202fB. \u201eAuswahl: Szenen 1\u20135\u201c oder \u201eNur Szenen mit Rolle X\u201c. Leer wenn kein Filter aktiv.',
    quelle: 'Export-Optionen \u00b7 szenenAuswahl + filterRollen + filterMotive + filterKomparsen',
  },
  {
    key: '{{synopsis_kurzinhalt}}', label: 'Kurzinhalt', zone: 'alle', color: '#AF52DE',
    beschreibung: 'Strukturierter Kurzinhalt der Folge (Haupthandlung \u00b7 Nebenhandlungen \u00b7 Cliffhanger).',
    quelle: 'script_db \u00b7 folgen.synopsis_kurzinhalt',
  },
  {
    key: '{{synopsis_redaktion}}', label: 'Synopse Redaktion', zone: 'alle', color: '#AF52DE',
    beschreibung: 'Dramaturgische Inhaltsangabe f\u00fcr die interne Redaktion (300\u2013500 W\u00f6rter).',
    quelle: 'script_db \u00b7 folgen.synopsis',
  },
  {
    key: '{{synopsis_presse}}', label: 'Programmpresse', zone: 'alle', color: '#AF52DE',
    beschreibung: 'Programm-Presse-Text f\u00fcr TV-Listings (ca. 300\u2013450 Zeichen, werblich, kein Spoiler).',
    quelle: 'script_db \u00b7 folgen.synopsis_presse',
  },
  {
    key: '{{synopsis_lektor}}', label: 'Lektor-Inhaltsangabe', zone: 'alle', color: '#AF52DE',
    beschreibung: 'Strukturierte Inhaltsangabe f\u00fcr die Lektor-Redaktion: Want & Need, Wendepunkte, Akt-Struktur, Str\u00e4nge mit CLIFF/PEN-Verweisen und Szenenreferenzen.',
    quelle: 'script_db \u00b7 folgen.synopsis_lektor',
  },
  {
    key: '{{synopsis_pressetext}}', label: 'Pressetext', zone: 'alle', color: '#AF52DE',
    beschreibung: 'Sachlicher Kurztext f\u00fcr Pressemitteilungen (280\u2013330 Zeichen).',
    quelle: 'script_db \u00b7 folgen.synopsis_pressetext',
  },
  {
    key: '{{synopsis_straenge}}', label: 'Handlungsstr\u00e4nge', zone: 'alle', color: '#AF52DE',
    beschreibung: 'Zeilenweise \u00dcbersicht der Handlungsstr\u00e4nge (STRANGNAME: Kurzbeschreibung).',
    quelle: 'script_db \u00b7 folgen.synopsis_straenge',
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
      collapsed: {
        default: false,
        parseHTML: el => el.getAttribute('data-collapsed') === 'true',
        renderHTML: attrs => attrs.collapsed ? { 'data-collapsed': 'true' } : {},
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-placeholder-key]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const key   = node.attrs.key as string
    const color = getPlaceholderColor(key)
    const label = node.attrs.collapsed
      ? getPlaceholderLabel(key).slice(0, 2)
      : getPlaceholderLabel(key)
    const a = node.attrs
    const padding = node.attrs.collapsed ? '1px 3px' : '2px 7px'
    const styleArr = [
      'display:inline-flex', 'align-items:center', 'gap:3px',
      `background:${color}1A`, `color:${color}`, `border:1px solid ${color}55`,
      'border-radius:4px', 'line-height:1',
      `padding:${padding}`, 'white-space:nowrap', 'user-select:none',
      'cursor:pointer', 'vertical-align:middle',
      `font-family:${a.fontFamily   || 'inherit'}`,
      `font-size:${a.fontSize       || 'inherit'}`,
      `font-weight:${a.fontWeight   || 'inherit'}`,
      `font-style:${a.fontStyle     || 'inherit'}`,
      a.textDecoration ? `text-decoration:${a.textDecoration}` : 'text-decoration:inherit',
    ]
    return ['span', mergeAttributes(HTMLAttributes, { class: 'placeholder-chip', contenteditable: 'false', style: styleArr.join(';') }), label]
  },

  addNodeView() {
    return ({ node: initialNode, getPos, editor }: any) => {
      let currentAttrs = { ...initialNode.attrs }

      const tooltipEl = document.createElement('div')
      tooltipEl.style.cssText = 'position:fixed;background:#111;color:#fff;font-size:11px;line-height:1.5;padding:4px 9px;border-radius:5px;pointer-events:none;z-index:99999;white-space:nowrap;box-shadow:0 2px 10px rgba(0,0,0,0.35);display:none;max-width:220px;'
      document.body.appendChild(tooltipEl)

      const span = document.createElement('span')
      span.className = 'placeholder-chip'
      ;(span as any).contentEditable = 'false'

      const updateDom = (attrs: any) => {
        currentAttrs = attrs
        const key   = attrs.key as string
        const def   = PLACEHOLDER_DEFS.find(p => p.key === key)
        const color = def?.color ?? '#757575'
        const label = attrs.collapsed
          ? (def?.label ?? key).slice(0, 2)
          : (def?.label ?? key)
        const padding = attrs.collapsed ? '1px 3px' : '2px 7px'
        span.setAttribute('data-placeholder-key', key)
        if (attrs.collapsed) span.setAttribute('data-collapsed', 'true')
        else span.removeAttribute('data-collapsed')
        span.style.cssText = [
          'display:inline-flex', 'align-items:center',
          `background:${color}1A`, `color:${color}`, `border:1px solid ${color}55`,
          'border-radius:4px', `padding:${padding}`, 'line-height:1',
          'white-space:nowrap', 'user-select:none',
          'cursor:pointer', 'vertical-align:middle',
          `font-family:${attrs.fontFamily || 'inherit'}`,
          `font-size:${attrs.fontSize || 'inherit'}`,
          `font-weight:${attrs.fontWeight || 'inherit'}`,
          `font-style:${attrs.fontStyle || 'inherit'}`,
          attrs.textDecoration ? `text-decoration:${attrs.textDecoration}` : 'text-decoration:inherit',
        ].join(';')
        span.textContent = label
        if (def) tooltipEl.textContent = attrs.collapsed
          ? `${def.label} — Klick zum Aufklappen`
          : `${def.beschreibung} — Klick zum Verkleinern`
      }

      span.addEventListener('mousedown', (e) => { e.preventDefault() })
      span.addEventListener('click', (e) => {
        e.stopPropagation()
        if (typeof getPos === 'function') {
          const pos = getPos()
          const newAttrs = { ...currentAttrs, collapsed: !currentAttrs.collapsed }
          editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, newAttrs))
        }
      })
      span.addEventListener('mouseenter', () => {
        const rect = span.getBoundingClientRect()
        tooltipEl.style.left = `${rect.left + rect.width / 2}px`
        tooltipEl.style.top  = `${rect.top - 30}px`
        tooltipEl.style.transform = 'translateX(-50%)'
        tooltipEl.style.display = 'block'
      })
      span.addEventListener('mouseleave', () => { tooltipEl.style.display = 'none' })

      updateDom(initialNode.attrs)

      return {
        dom: span,
        update(updatedNode: any) {
          if (updatedNode.type.name !== 'placeholder_chip') return false
          updateDom(updatedNode.attrs)
          return true
        },
        destroy() { tooltipEl.remove() },
      }
    }
  },

  addCommands() {
    return {
      insertPlaceholderChip:
        (key: string) =>
        ({ chain }: { chain: () => any }) =>
          chain().insertContent({ type: this.name, attrs: { key } }).run(),
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('chip-range-highlight'),
        props: {
          decorations(state) {
            const { selection } = state
            // NodeSelection (chip atom-selected) → handled via ProseMirror-selectednode CSS
            if (selection instanceof NodeSelection || selection.empty) return DecorationSet.empty
            const decos: Decoration[] = []
            state.doc.nodesBetween(selection.from, selection.to, (node, pos) => {
              if (node.type.name === 'placeholder_chip') {
                decos.push(Decoration.node(pos, pos + node.nodeSize, { class: 'chip-in-range' }))
              }
            })
            return DecorationSet.create(state.doc, decos)
          },
        },
      }),
    ]
  },
})

// ── IF / ENDIF Node Extensions ────────────────────────────────────────────────

const IF_COLOR   = '#5856D6'
const ENDIF_COLOR = '#8E8E93'

export const PlaceholderIfExtension = Node.create({
  name: 'placeholder_if',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      ref_key: {
        default: null,
        parseHTML: el => el.getAttribute('data-if-ref') || null,
        renderHTML: attrs => attrs.ref_key ? { 'data-if-ref': attrs.ref_key } : {},
      },
    }
  },

  parseHTML() { return [{ tag: 'span[data-placeholder-if]' }] },

  renderHTML({ node }) {
    const def   = PLACEHOLDER_DEFS.find(p => p.key === node.attrs.ref_key)
    const label = def ? `▶ ${def.label}` : '▶ ?'
    const color = def?.color ?? IF_COLOR
    return ['span', mergeAttributes(
      { 'data-placeholder-if': 'true', contenteditable: 'false' },
      { style: `display:inline-flex;align-items:center;background:${color}18;color:${color};border:1px dashed ${color}88;border-radius:4px;padding:1px 6px;font-size:inherit;line-height:1.5;white-space:nowrap;user-select:none;cursor:pointer;vertical-align:middle;font-weight:500;` }
    ), label]
  },

  addNodeView() {
    return ({ node: initialNode, getPos, editor }: any) => {
      let currentRef = initialNode.attrs.ref_key

      const tooltipEl = document.createElement('div')
      tooltipEl.style.cssText = 'position:fixed;background:#111;color:#fff;font-size:11px;line-height:1.5;padding:4px 9px;border-radius:5px;pointer-events:none;z-index:99999;white-space:nowrap;box-shadow:0 2px 10px rgba(0,0,0,0.35);display:none;max-width:240px;'
      document.body.appendChild(tooltipEl)

      // Selector dropdown
      const selector = document.createElement('div')
      selector.style.cssText = 'position:fixed;background:var(--bg-surface,#fff);border:1px solid #E0E0E0;border-radius:6px;padding:4px;z-index:99999;box-shadow:0 4px 16px rgba(0,0,0,0.15);display:none;max-height:200px;overflow-y:auto;min-width:160px;'
      PLACEHOLDER_DEFS.filter(p => p.zone !== 'fusszeile').forEach(def => {
        const btn = document.createElement('button')
        btn.textContent = def.label
        btn.style.cssText = `display:block;width:100%;text-align:left;padding:3px 8px;border:none;background:none;cursor:pointer;font-size:11px;color:${def.color};border-radius:3px;`
        btn.addEventListener('mouseenter', () => { btn.style.background = '#F5F5F5' })
        btn.addEventListener('mouseleave', () => { btn.style.background = 'none' })
        btn.addEventListener('mousedown', (e) => { e.preventDefault() })
        btn.addEventListener('click', (e) => {
          e.stopPropagation()
          if (typeof getPos === 'function') {
            editor.view.dispatch(editor.state.tr.setNodeMarkup(getPos(), undefined, { ref_key: def.key }))
          }
          selector.style.display = 'none'
        })
        selector.appendChild(btn)
      })
      document.body.appendChild(selector)

      const closeSelector = (e: MouseEvent) => {
        if (!selector.contains(e.target as unknown as globalThis.Node)) selector.style.display = 'none'
      }
      document.addEventListener('click', closeSelector)

      const span = document.createElement('span')
      ;(span as any).contentEditable = 'false'

      const updateDom = (ref_key: string | null) => {
        currentRef = ref_key
        const def   = PLACEHOLDER_DEFS.find(p => p.key === ref_key)
        const label = def ? `▶ ${def.label}` : '▶ ?'
        const color = def?.color ?? IF_COLOR
        span.setAttribute('data-placeholder-if', 'true')
        if (ref_key) span.setAttribute('data-if-ref', ref_key)
        else span.removeAttribute('data-if-ref')
        span.style.cssText = `display:inline-flex;align-items:center;background:${color}18;color:${color};border:1px dashed ${color}88;border-radius:4px;padding:1px 6px;font-size:inherit;line-height:1.5;white-space:nowrap;user-select:none;cursor:pointer;vertical-align:middle;font-weight:500;`
        span.textContent = label
        tooltipEl.textContent = def
          ? `Inhalt anzeigen wenn „${def.label}" nicht leer. Klick = Chip wählen.`
          : 'Kein Chip gewählt — klicken zum Zuweisen.'
      }

      span.addEventListener('mousedown', (e) => { e.preventDefault() })
      span.addEventListener('click', (e) => {
        e.stopPropagation()
        const rect = span.getBoundingClientRect()
        selector.style.left = `${rect.left}px`
        selector.style.top  = `${rect.bottom + 4}px`
        selector.style.display = selector.style.display === 'none' ? 'block' : 'none'
      })
      span.addEventListener('mouseenter', () => {
        const rect = span.getBoundingClientRect()
        tooltipEl.style.left = `${rect.left + rect.width / 2}px`
        tooltipEl.style.top  = `${rect.top - 30}px`
        tooltipEl.style.transform = 'translateX(-50%)'
        tooltipEl.style.display = 'block'
      })
      span.addEventListener('mouseleave', () => { tooltipEl.style.display = 'none' })

      updateDom(initialNode.attrs.ref_key)

      return {
        dom: span,
        update(updatedNode: any) {
          if (updatedNode.type.name !== 'placeholder_if') return false
          updateDom(updatedNode.attrs.ref_key)
          return true
        },
        destroy() {
          tooltipEl.remove()
          selector.remove()
          document.removeEventListener('click', closeSelector)
        },
      }
    }
  },

  addCommands() {
    return {
      insertPlaceholderIf: () => ({ chain }: any) =>
        chain().insertContent({ type: 'placeholder_if', attrs: { ref_key: null } }).run(),
    }
  },
})

export const PlaceholderEndIfExtension = Node.create({
  name: 'placeholder_endif',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() { return {} },
  parseHTML() { return [{ tag: 'span[data-placeholder-endif]' }] },
  renderHTML() {
    return ['span', {
      'data-placeholder-endif': 'true', contenteditable: 'false',
      style: `display:inline-flex;align-items:center;background:${ENDIF_COLOR}18;color:${ENDIF_COLOR};border:1px dashed ${ENDIF_COLOR}88;border-radius:4px;padding:1px 6px;font-size:inherit;line-height:1.5;white-space:nowrap;user-select:none;cursor:default;vertical-align:middle;font-weight:500;`,
    }, '◀']
  },

  addNodeView() {
    return () => {
      const tooltipEl = document.createElement('div')
      tooltipEl.style.cssText = 'position:fixed;background:#111;color:#fff;font-size:11px;padding:4px 9px;border-radius:5px;pointer-events:none;z-index:99999;white-space:nowrap;box-shadow:0 2px 10px rgba(0,0,0,0.35);display:none;'
      tooltipEl.textContent = 'Ende des IF-Blocks.'
      document.body.appendChild(tooltipEl)
      const span = document.createElement('span')
      ;(span as any).contentEditable = 'false'
      span.setAttribute('data-placeholder-endif', 'true')
      span.style.cssText = `display:inline-flex;align-items:center;background:${ENDIF_COLOR}18;color:${ENDIF_COLOR};border:1px dashed ${ENDIF_COLOR}88;border-radius:4px;padding:1px 6px;font-size:inherit;line-height:1.5;white-space:nowrap;user-select:none;cursor:default;vertical-align:middle;font-weight:500;`
      span.textContent = '◀'
      span.addEventListener('mouseenter', () => {
        const rect = span.getBoundingClientRect()
        tooltipEl.style.left = `${rect.left + rect.width / 2}px`
        tooltipEl.style.top  = `${rect.top - 30}px`
        tooltipEl.style.transform = 'translateX(-50%)'
        tooltipEl.style.display = 'block'
      })
      span.addEventListener('mouseleave', () => { tooltipEl.style.display = 'none' })
      return {
        dom: span,
        update: (n: any) => n.type.name === 'placeholder_endif',
        destroy() { tooltipEl.remove() },
      }
    }
  },

  addCommands() {
    return {
      insertPlaceholderEndIf: () => ({ chain }: any) =>
        chain().insertContent({ type: 'placeholder_endif', attrs: {} }).run(),
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
  outline-offset: 2px;
  border-radius: 4px;
  box-shadow: 0 0 0 4px rgba(0, 122, 255, 0.12);
}
.ProseMirror .placeholder-chip.chip-in-range {
  outline: 1.5px solid rgba(0, 122, 255, 0.55);
  outline-offset: 1px;
  border-radius: 4px;
  background-color: rgba(0, 122, 255, 0.08) !important;
}
`
