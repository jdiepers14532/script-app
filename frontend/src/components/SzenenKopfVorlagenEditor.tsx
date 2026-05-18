/**
 * SzenenKopfVorlagenEditor
 *
 * WYSIWYG-Tiptap-Editor für Szenenkopf-Vorlagen.
 * - Jede Paragraph = eine Template-Zeile (wird beim Rendern ausgeblendet wenn leer)
 * - Farbige Chip-Nodes für Szenenkopf-Felder
 * - Lineal mit konfigurierbaren Tab-Stops (L/C/R) pro Paragraph
 * - Formatierungs-Toolbar: Schriftart, -größe, Zeilenabstand, B/I/U/UC
 * - Seitenformat: A4 (17 cm) oder US Letter (16.5 cm) beeinflusst Linealbreite
 * - Vorschau-Modus mit Dummy-Daten
 * - Serialisierung als JSON-String; Legacy-Text ({{...}}) wird automatisch konvertiert
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import type { CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useEditor, EditorContent } from '@tiptap/react'
import type { Editor } from '@tiptap/core'
import { Node, Extension, Mark, mergeAttributes } from '@tiptap/core'
import { StarterKit } from '@tiptap/starter-kit'
import { Underline } from '@tiptap/extension-underline'

// ── Chip-Definitionen ─────────────────────────────────────────────────────────

export interface SKChipDef {
  key: string
  label: string
  shortLabel: string
  color: string
  beschreibung: string
}

export const SK_CHIPS: SKChipDef[] = [
  { key: 'szene_nr',     label: 'Sz.Nr.',    shortLabel: '#',   color: '#007AFF', beschreibung: 'Szenen-Nummer' },
  { key: 'stoppzeit',    label: 'Stopp',     shortLabel: '⏱',  color: '#007AFF', beschreibung: 'Stoppzeit (mm:ss)' },
  { key: 'motiv',        label: 'Motiv',     shortLabel: 'M',   color: '#FF9500', beschreibung: 'Motiv-Bezeichnung' },
  { key: 'innen_aussen', label: 'I/A',       shortLabel: 'I/A', color: '#FF9500', beschreibung: 'Innen/Außen (I/A)' },
  { key: 'dt',           label: 'DT',        shortLabel: 'DT',  color: '#5856D6', beschreibung: 'Dramaturgischer Tag' },
  { key: 'oneliner',     label: 'Oneliner',  shortLabel: '1L',  color: '#AF52DE', beschreibung: 'Einzeiler / Zusammenfassung' },
  { key: 'rollen',       label: 'Rollen',    shortLabel: 'R',   color: '#34C759', beschreibung: 'Beteiligte Rollen' },
  { key: 'komparsen',    label: 'Komp.',     shortLabel: 'K',   color: '#00C7BE', beschreibung: 'Komparsen' },
  { key: 'info',         label: 'Info',      shortLabel: 'i',   color: '#FF3B30', beschreibung: 'Sonstige Info / Szenen-Info' },
  { key: 'page_length',  label: 'Seiten',    shortLabel: 'S.',  color: '#8E8E93', beschreibung: 'Seitenlänge der Szene (z.B. 2/8)' },
  { key: 'notiz',        label: 'Notiz',     shortLabel: 'N',   color: '#FF9500', beschreibung: 'Szenennotiz / Zusatzinfo' },
  { key: 'sondertyp',    label: 'Sondertyp', shortLabel: 'ST',  color: '#FF3B30', beschreibung: 'Sonder-Szenentyp (Flashback, Stockshot …)' },
  { key: 'partner',      label: 'WS Sz',     shortLabel: 'WS',  color: '#AF52DE', beschreibung: 'Weiterlaufende/Referenzszene' },
  { key: 'staffel',      label: 'Staffel',   shortLabel: 'S',   color: '#8E8E93', beschreibung: 'Staffel-Nummer' },
  { key: 'episode',      label: 'Episode',   shortLabel: 'Ep',  color: '#8E8E93', beschreibung: 'Episoden-Nummer' },
  { key: 'sk_kat',       label: 'SK Kat',    shortLabel: 'SK',  color: '#00C7BE', beschreibung: 'Stockshot-Kategorie' },
  { key: 'fb_ref',       label: 'FB Ref',    shortLabel: 'FB',  color: '#5856D6', beschreibung: 'Flashback-Referenzszene' },
]

// ── Uppercase Mark ─────────────────────────────────────────────────────────────

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    sk_chip:   { insertSKChip:   (key: string) => ReturnType }
    uppercase: { toggleUppercase: ()           => ReturnType }
    sk_if:     { insertSKIf:     ()            => ReturnType }
    sk_endif:  { insertSKEndIf:  ()            => ReturnType }
  }
}

const UppercaseMark = Mark.create({
  name: 'uppercase',
  parseHTML() { return [{ tag: 'span[data-uc]' }] },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-uc': 'true', style: 'text-transform:uppercase' }), 0]
  },
  addCommands() {
    return {
      toggleUppercase: () => ({ commands }: any) => commands.toggleMark('uppercase'),
    }
  },
})

// ── Chip-Extension ────────────────────────────────────────────────────────────

const SKChipExtension = Node.create({
  name: 'sk_chip',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      key: {
        default: null,
        parseHTML: el => el.getAttribute('data-sk-key'),
        renderHTML: attrs => ({ 'data-sk-key': attrs.key }),
      },
      collapsed: {
        default: false,
        parseHTML: el => el.getAttribute('data-collapsed') === 'true',
        renderHTML: attrs => attrs.collapsed ? { 'data-collapsed': 'true' } : {},
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-sk-key]' }]
  },

  renderHTML({ node }) {
    const chip = SK_CHIPS.find(c => c.key === node.attrs.key)
    const color = chip?.color ?? '#8E8E93'
    const label = node.attrs.collapsed
      ? (chip?.shortLabel ?? node.attrs.key)
      : (chip?.label ?? node.attrs.key)
    return [
      'span',
      mergeAttributes(
        {
          'data-sk-key': node.attrs.key,
          class: 'sk-chip',
          contenteditable: 'false',
          ...(node.attrs.collapsed ? { 'data-collapsed': 'true' } : {}),
        },
        {
          style: [
            'display:inline-flex', 'align-items:center',
            `background:${color}22`, `color:${color}`,
            `border:1px solid ${color}66`,
            'border-radius:4px', 'padding:1px 7px',
            'font-size:inherit', 'line-height:1.5',
            'white-space:nowrap', 'user-select:none',
            'cursor:pointer', 'vertical-align:middle', 'font-weight:500',
          ].join(';'),
        }
      ),
      label,
    ]
  },

  addNodeView() {
    return ({ node: initialNode, getPos, editor }: any) => {
      let currentAttrs = { ...initialNode.attrs }

      const tooltipEl = document.createElement('div')
      tooltipEl.style.cssText = [
        'position:fixed', 'background:#111', 'color:#fff',
        'font-size:11px', 'line-height:1.5', 'padding:4px 9px',
        'border-radius:5px', 'pointer-events:none', 'z-index:99999',
        'white-space:nowrap', 'box-shadow:0 2px 10px rgba(0,0,0,0.35)',
        'display:none',
      ].join(';')
      document.body.appendChild(tooltipEl)

      const span = document.createElement('span')
      span.className = 'sk-chip'
      ;(span as any).contentEditable = 'false'

      const updateDom = (attrs: any) => {
        const chip = SK_CHIPS.find(c => c.key === attrs.key)
        const color = chip?.color ?? '#8E8E93'
        const label = attrs.collapsed
          ? (chip?.shortLabel ?? attrs.key)
          : (chip?.label ?? attrs.key)
        const padding = attrs.collapsed ? '0 2px' : '1px 7px'
        span.setAttribute('data-sk-key', attrs.key)
        span.style.cssText = [
          'display:inline-flex', 'align-items:center',
          `background:${color}22`, `color:${color}`,
          `border:1px solid ${color}66`,
          'border-radius:4px', `padding:${padding}`,
          'font-size:inherit', 'line-height:1.5',
          'white-space:nowrap', 'user-select:none',
          'cursor:pointer', 'vertical-align:middle', 'font-weight:500',
        ].join(';')
        span.textContent = label
        if (chip) tooltipEl.textContent = chip.beschreibung
      }

      span.addEventListener('mousedown', (e) => { e.preventDefault() })

      span.addEventListener('click', (e) => {
        e.stopPropagation()
        if (typeof getPos === 'function') {
          const pos = getPos()
          const newAttrs = { ...currentAttrs, collapsed: !currentAttrs.collapsed }
          const tr = editor.state.tr.setNodeMarkup(pos, undefined, newAttrs)
          editor.view.dispatch(tr)
        }
      })

      span.addEventListener('mouseenter', () => {
        const rect = span.getBoundingClientRect()
        tooltipEl.style.left = `${rect.left + rect.width / 2}px`
        tooltipEl.style.top = `${rect.top - 30}px`
        tooltipEl.style.transform = 'translateX(-50%)'
        tooltipEl.style.display = 'block'
      })

      span.addEventListener('mouseleave', () => {
        tooltipEl.style.display = 'none'
      })

      updateDom(initialNode.attrs)

      return {
        dom: span,
        update(updatedNode: any) {
          if (updatedNode.type.name !== 'sk_chip') return false
          currentAttrs = { ...updatedNode.attrs }
          updateDom(updatedNode.attrs)
          return true
        },
        destroy() {
          tooltipEl.remove()
        },
      }
    }
  },

  addCommands() {
    return {
      insertSKChip: (key: string) => ({ chain }: any) =>
        chain().insertContent({ type: 'sk_chip', attrs: { key, collapsed: false } }).run(),
    }
  },
})

// ── IF / ENDIF Chip-Extensions ───────────────────────────────────────────────

const IF_COLOR = '#5856D6'
const ENDIF_COLOR = '#8E8E93'

const SKIfExtension = Node.create({
  name: 'sk_if',
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
  parseHTML() { return [{ tag: 'span[data-sk-if]' }] },
  renderHTML({ node }) {
    const chip = SK_CHIPS.find(c => c.key === node.attrs.ref_key)
    const label = chip ? `▶ ${chip.label}` : '▶ ?'
    const color = chip?.color ?? IF_COLOR
    return ['span', mergeAttributes(
      { 'data-sk-if': 'true', contenteditable: 'false' },
      { style: `display:inline-flex;align-items:center;background:${color}18;color:${color};border:1px dashed ${color}88;border-radius:4px;padding:1px 6px;font-size:inherit;line-height:1.5;white-space:nowrap;user-select:none;cursor:pointer;vertical-align:middle;font-weight:500;` }
    ), label]
  },

  addNodeView() {
    return ({ node: initialNode, getPos, editor }: any) => {
      let currentRef = initialNode.attrs.ref_key

      // Tooltip
      const tooltipEl = document.createElement('div')
      tooltipEl.style.cssText = 'position:fixed;background:#111;color:#fff;font-size:11px;line-height:1.5;padding:4px 9px;border-radius:5px;pointer-events:none;z-index:99999;white-space:nowrap;box-shadow:0 2px 10px rgba(0,0,0,0.35);display:none;max-width:220px;'
      document.body.appendChild(tooltipEl)

      // Chip-Selector Dropdown
      const selector = document.createElement('div')
      selector.style.cssText = 'position:fixed;background:var(--bg-surface,#fff);border:1px solid #E0E0E0;border-radius:6px;padding:4px;z-index:99999;box-shadow:0 4px 16px rgba(0,0,0,0.15);display:none;max-height:200px;overflow-y:auto;min-width:140px;'
      SK_CHIPS.forEach(chip => {
        const btn = document.createElement('button')
        btn.textContent = chip.label
        btn.style.cssText = `display:block;width:100%;text-align:left;padding:3px 8px;border:none;background:none;cursor:pointer;font-size:11px;color:${chip.color};border-radius:3px;`
        btn.addEventListener('mouseenter', () => { btn.style.background = '#F5F5F5' })
        btn.addEventListener('mouseleave', () => { btn.style.background = 'none' })
        btn.addEventListener('mousedown', (e) => { e.preventDefault() })
        btn.addEventListener('click', (e) => {
          e.stopPropagation()
          if (typeof getPos === 'function') {
            const pos = getPos()
            editor.view.dispatch(
              editor.state.tr.setNodeMarkup(pos, undefined, { ref_key: chip.key })
            )
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

      // Span
      const span = document.createElement('span')
      ;(span as any).contentEditable = 'false'

      const updateDom = (ref_key: string | null) => {
        currentRef = ref_key
        const chip = SK_CHIPS.find(c => c.key === ref_key)
        const label = chip ? `▶ ${chip.label}` : '▶ ?'
        const color = chip?.color ?? IF_COLOR
        span.setAttribute('data-sk-if', 'true')
        if (ref_key) span.setAttribute('data-if-ref', ref_key); else span.removeAttribute('data-if-ref')
        span.style.cssText = `display:inline-flex;align-items:center;background:${color}18;color:${color};border:1px dashed ${color}88;border-radius:4px;padding:1px 6px;font-size:inherit;line-height:1.5;white-space:nowrap;user-select:none;cursor:pointer;vertical-align:middle;font-weight:500;`
        span.textContent = label
        tooltipEl.textContent = chip
          ? `Inhalt anzeigen wenn „${chip.label}" nicht leer ist. Klick = anderen Chip wählen.`
          : 'Noch kein Chip gewählt — klicken zum Zuweisen.'
      }

      span.addEventListener('mousedown', (e) => { e.preventDefault() })
      span.addEventListener('click', (e) => {
        e.stopPropagation()
        const rect = span.getBoundingClientRect()
        selector.style.left = `${rect.left}px`
        selector.style.top = `${rect.bottom + 4}px`
        selector.style.display = selector.style.display === 'none' ? 'block' : 'none'
      })
      span.addEventListener('mouseenter', () => {
        const rect = span.getBoundingClientRect()
        tooltipEl.style.left = `${rect.left + rect.width / 2}px`
        tooltipEl.style.top = `${rect.top - 30}px`
        tooltipEl.style.transform = 'translateX(-50%)'
        tooltipEl.style.display = 'block'
      })
      span.addEventListener('mouseleave', () => { tooltipEl.style.display = 'none' })

      updateDom(initialNode.attrs.ref_key)

      return {
        dom: span,
        update(updatedNode: any) {
          if (updatedNode.type.name !== 'sk_if') return false
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
      insertSKIf: () => ({ chain }: any) =>
        chain().insertContent({ type: 'sk_if', attrs: { ref_key: null } }).run(),
    }
  },
})

const SKEndIfExtension = Node.create({
  name: 'sk_endif',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() { return {} },
  parseHTML() { return [{ tag: 'span[data-sk-endif]' }] },
  renderHTML() {
    return ['span', {
      'data-sk-endif': 'true', contenteditable: 'false',
      style: `display:inline-flex;align-items:center;background:${ENDIF_COLOR}18;color:${ENDIF_COLOR};border:1px dashed ${ENDIF_COLOR}88;border-radius:4px;padding:1px 6px;font-size:inherit;line-height:1.5;white-space:nowrap;user-select:none;cursor:default;vertical-align:middle;font-weight:500;`,
    }, '◀']
  },

  addNodeView() {
    return () => {
      const tooltipEl = document.createElement('div')
      tooltipEl.style.cssText = 'position:fixed;background:#111;color:#fff;font-size:11px;line-height:1.5;padding:4px 9px;border-radius:5px;pointer-events:none;z-index:99999;white-space:nowrap;box-shadow:0 2px 10px rgba(0,0,0,0.35);display:none;'
      tooltipEl.textContent = 'Ende des IF-Blocks — Inhalt davor wird bedingt angezeigt.'
      document.body.appendChild(tooltipEl)
      const span = document.createElement('span')
      ;(span as any).contentEditable = 'false'
      span.setAttribute('data-sk-endif', 'true')
      span.style.cssText = `display:inline-flex;align-items:center;background:${ENDIF_COLOR}18;color:${ENDIF_COLOR};border:1px dashed ${ENDIF_COLOR}88;border-radius:4px;padding:1px 6px;font-size:inherit;line-height:1.5;white-space:nowrap;user-select:none;cursor:default;vertical-align:middle;font-weight:500;`
      span.textContent = '◀'
      span.addEventListener('mouseenter', () => {
        const rect = span.getBoundingClientRect()
        tooltipEl.style.left = `${rect.left + rect.width / 2}px`
        tooltipEl.style.top = `${rect.top - 30}px`
        tooltipEl.style.transform = 'translateX(-50%)'
        tooltipEl.style.display = 'block'
      })
      span.addEventListener('mouseleave', () => { tooltipEl.style.display = 'none' })
      return {
        dom: span,
        update: (n: any) => n.type.name === 'sk_endif',
        destroy() { tooltipEl.remove() },
      }
    }
  },

  addCommands() {
    return {
      insertSKEndIf: () => ({ chain }: any) =>
        chain().insertContent({ type: 'sk_endif', attrs: {} }).run(),
    }
  },
})

// ── Tab-Stop-Typen ────────────────────────────────────────────────────────────

export type TabAlign = 'left' | 'center' | 'right'
export interface TabStop { pos: number; align: TabAlign }

const TAB_ALIGN_NEXT: Record<TabAlign, TabAlign | null> = {
  left: 'center', center: 'right', right: null,
}
const TAB_ALIGN_SYMBOL: Record<TabAlign, string> = { left: 'L', center: 'C', right: 'R' }
const TAB_ALIGN_COLORS: Record<TabAlign, string> = {
  left: '#007AFF', center: '#FF9500', right: '#5856D6',
}

// ── Paragraph mit Tab-Stops + Formatierung ────────────────────────────────────

const ParagraphWithStops = Node.create({
  name: 'paragraph',
  group: 'block',
  content: 'inline*',

  addAttributes() {
    return {
      tabStops: {
        default: [],
        parseHTML: el => {
          try { return JSON.parse(el.getAttribute('data-tab-stops') || '[]') } catch { return [] }
        },
        renderHTML: () => ({}),
      },
      fontFamily: {
        default: null,
        parseHTML: el => el.getAttribute('data-ff') || null,
        renderHTML: () => ({}),
      },
      fontSize: {
        default: null,
        parseHTML: el => el.getAttribute('data-fs') || null,
        renderHTML: () => ({}),
      },
      lineHeight: {
        default: null,
        parseHTML: el => el.getAttribute('data-lh') || null,
        renderHTML: () => ({}),
      },
    }
  },

  parseHTML() { return [{ tag: 'p' }] },

  renderHTML({ node, HTMLAttributes }) {
    const { fontFamily, fontSize, lineHeight, tabStops } = node.attrs
    const extra: Record<string, any> = {}
    if (tabStops?.length) extra['data-tab-stops'] = JSON.stringify(tabStops)
    if (fontFamily) extra['data-ff'] = fontFamily
    if (fontSize) extra['data-fs'] = fontSize
    if (lineHeight) extra['data-lh'] = lineHeight
    const styleArr: string[] = []
    if (fontFamily) styleArr.push(`font-family:${fontFamily}`)
    if (fontSize) styleArr.push(`font-size:${fontSize}`)
    if (lineHeight) styleArr.push(`line-height:${lineHeight}`)
    if (styleArr.length) extra.style = styleArr.join(';')
    return ['p', mergeAttributes(HTMLAttributes, extra), 0]
  },
})

// ── Tab-Key Extension ─────────────────────────────────────────────────────────

const TabKeyExtension = Extension.create({
  name: 'tab_key',
  addKeyboardShortcuts() {
    return {
      Tab: () => {
        this.editor.commands.insertContent('\u00A0\u00A0\u00A0\u00A0')
        return true
      },
      'Shift-Tab': () => true,
    }
  },
})

// ── Serialize / Deserialize ───────────────────────────────────────────────────

export function serializeSKTemplate(doc: any): string {
  return JSON.stringify(doc)
}

export function parseSKTemplate(stored: string | null | undefined): any {
  if (!stored || !stored.trim()) return defaultSKDoc()
  const s = stored.trim()
  if (s.startsWith('{')) {
    try { return JSON.parse(s) } catch {}
  }
  const lines = s.split('\n')
  return {
    type: 'doc',
    content: lines.map(line => ({
      type: 'paragraph',
      attrs: { tabStops: [], fontFamily: null, fontSize: null, lineHeight: null },
      content: parseLegacyLine(line),
    })),
  }
}

function parseLegacyLine(line: string): any[] {
  const content: any[] = []
  const re = /\{\{([^}]+)\}\}/g
  let idx = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(line)) !== null) {
    if (m.index > idx) content.push({ type: 'text', text: line.slice(idx, m.index) })
    content.push({ type: 'sk_chip', attrs: { key: m[1] } })
    idx = m.index + m[0].length
  }
  if (idx < line.length) content.push({ type: 'text', text: line.slice(idx) })
  return content
}

function defaultSKDoc(): any {
  return {
    type: 'doc',
    content: [{ type: 'paragraph', attrs: { tabStops: [], fontFamily: null, fontSize: null, lineHeight: null }, content: [] }],
  }
}

export function renderSKTemplate(
  stored: string,
  fields: Partial<Record<string, string>>,
): string[] {
  let doc: any
  try { doc = parseSKTemplate(stored) } catch { return [] }

  const lines: string[] = []
  for (const para of (doc.content ?? [])) {
    if (para.type === 'horizontal_rule') { lines.push('---'); continue }
    if (para.type !== 'paragraph') continue
    let lineText = ''
    let hasNonEmptyChip = false
    let skipDepth = 0
    for (const node of (para.content ?? [])) {
      if (node.type === 'sk_if') {
        const val = fields[node.attrs?.ref_key] ?? ''
        if (!val.trim()) skipDepth++
        continue
      }
      if (node.type === 'sk_endif') {
        if (skipDepth > 0) skipDepth--
        continue
      }
      if (skipDepth > 0) continue
      if (node.type === 'text') {
        lineText += node.text ?? ''
      } else if (node.type === 'sk_chip') {
        const val = fields[node.attrs?.key] ?? ''
        lineText += val
        if (val.trim()) hasNonEmptyChip = true
      }
    }
    const hasText = lineText.replace(/\s/g, '').length > 0
    if (hasText && (hasNonEmptyChip || !lineText.match(/^\s*$/))) {
      lines.push(lineText.trim())
    }
  }
  return lines
}

// ── Vorschau ──────────────────────────────────────────────────────────────────

const DUMMY_FIELDS: Record<string, string> = {
  szene_nr:     '42',
  stoppzeit:    '01:23',
  motiv:        'BÜRO ROSEN',
  innen_aussen: 'I',
  dt:           '3',
  oneliner:     'Laura und Max streiten sich über das Familienrezept',
  rollen:       'Laura, Max, Kellner',
  komparsen:    'Gäste (3)',
  info:         'Stunt! Vorsicht Tisch',
  staffel:      '41',
  episode:      '8271',
  page_length:  '3/8',
  notiz:        'vgl. Staffel 38, Ep. 8104',
  sondertyp:    'Flashback',
  partner:      'Referenz: Sz. 18 (Ep. 8104)',
  sk_kat:       'Garten',
  fb_ref:       'Sz. 7 (Ep. 8090)',
}

type PreviewItem = { type: 'text'; text: string; style: CSSProperties } | { type: 'hr' }

function renderPreviewLines(stored: string): PreviewItem[] {
  let doc: any
  try { doc = parseSKTemplate(stored) } catch { return [] }

  const result: PreviewItem[] = []
  for (const node of (doc.content ?? [])) {
    if (node.type === 'horizontal_rule') { result.push({ type: 'hr' }); continue }
    if (node.type !== 'paragraph') continue
    let lineText = ''
    let hasNonEmptyChip = false
    let skipDepth = 0
    for (const child of (node.content ?? [])) {
      if (child.type === 'sk_if') {
        const val = DUMMY_FIELDS[child.attrs?.ref_key] ?? ''
        if (!val.trim()) skipDepth++
        continue
      }
      if (child.type === 'sk_endif') { if (skipDepth > 0) skipDepth--; continue }
      if (skipDepth > 0) continue
      if (child.type === 'text') lineText += child.text ?? ''
      else if (child.type === 'sk_chip') {
        const val = DUMMY_FIELDS[child.attrs?.key] ?? ''
        lineText += val
        if (val.trim()) hasNonEmptyChip = true
      }
    }
    const hasText = lineText.replace(/\s/g, '').length > 0
    if (!hasText || (!hasNonEmptyChip && lineText.match(/^\s*$/))) continue
    const { fontFamily, fontSize, lineHeight } = node.attrs ?? {}
    const style: CSSProperties = {
      fontFamily: fontFamily ?? "'Courier Prime','Courier New',monospace",
      fontSize: fontSize ?? 12,
      lineHeight: lineHeight ?? 1.7,
      whiteSpace: 'pre-wrap',
    }
    result.push({ type: 'text', text: lineText, style })
  }
  return result
}

function PreviewModal({
  stored, seitenformat, marginLeft, marginRight, onClose,
}: {
  stored: string
  seitenformat: 'a4' | 'letter'
  marginLeft: number
  marginRight: number
  onClose: () => void
}) {
  const items = renderPreviewLines(stored)
  const rulerCm = seitenformat === 'letter' ? 16.5 : 17
  // 1cm = 37.795px bei 96dpi
  const CM_PX = 37.795
  const contentWidthPx = Math.round(rulerCm * CM_PX)            // ~642px A4
  const plPx = Math.round((marginLeft  / 10) / rulerCm * contentWidthPx)
  const prPx = Math.round((marginRight / 10) / rulerCm * contentWidthPx)

  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        zIndex: 99998, display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: 60, overflowY: 'auto',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-surface)', borderRadius: 10,
          padding: '16px 20px 20px',
          width: contentWidthPx + 40,
          maxWidth: '95vw',
          boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
          marginBottom: 40,
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>
            Vorschau Szenenkopf — {seitenformat === 'a4' ? 'A4' : 'Letter'} 1:1
          </span>
          <button onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--text-secondary)', lineHeight: 1, padding: '0 4px' }}>
            ×
          </button>
        </div>
        {/* Seiten-Simulation */}
        <div style={{
          width: contentWidthPx, background: '#fff', color: '#000',
          border: '1px solid #ccc', borderRadius: 3,
          paddingTop: 10, paddingBottom: 10,
          paddingLeft: plPx, paddingRight: prPx,
          boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
        }}>
          {items.length === 0
            ? <span style={{ fontSize: 11, color: '#888', fontFamily: "'Courier Prime','Courier New',monospace" }}>
                — Keine sichtbaren Zeilen —
              </span>
            : items.map((item, i) => (
              item.type === 'hr'
                ? <hr key={i} style={{ border: 'none', borderTop: '1px solid #000', margin: '4px 0' }} />
                : <div key={i} style={item.style}>{item.text}</div>
            ))
          }
        </div>
        <div style={{ marginTop: 8, fontSize: 9, color: 'var(--text-secondary)' }}>
          Demo-Daten · Seitenränder: L {marginLeft}mm / R {marginRight}mm
        </div>
      </div>
    </div>,
    document.body
  )
}

// ── Formatierungs-Toolbar ─────────────────────────────────────────────────────

const FONT_OPTIONS = [
  { value: "'Courier Prime','Courier New',monospace", label: 'Courier' },
  { value: 'Arial,Helvetica,sans-serif',             label: 'Arial' },
  { value: "'Times New Roman',Georgia,serif",        label: 'Times' },
  { value: "'Helvetica Neue',Helvetica,sans-serif",  label: 'Helvetica' },
]
const SIZE_OPTIONS = ['8pt', '9pt', '10pt', '11pt', '12pt', '14pt']
const LH_OPTIONS = [
  { value: '1',   label: '1×' },
  { value: '1.2', label: '1.2×' },
  { value: '1.5', label: '1.5×' },
  { value: '2',   label: '2×' },
]

const selStyle: CSSProperties = {
  fontSize: 10, padding: '1px 4px', borderRadius: 3,
  border: '1px solid var(--border)', background: 'var(--bg-surface)',
  color: 'var(--text-primary)', cursor: 'pointer', height: 22,
}

function fmtBtn(active: boolean, extra?: CSSProperties): CSSProperties {
  return {
    padding: '0 7px', height: 22, borderRadius: 3, lineHeight: '22px',
    border: `1px solid ${active ? 'transparent' : 'var(--border)'}`,
    fontSize: 11, fontWeight: 600, cursor: 'pointer',
    background: active ? 'var(--text-primary)' : 'transparent',
    color: active ? '#fff' : 'var(--text-primary)',
    ...extra,
  }
}

function EditorToolbar({ editor }: { editor: Editor | null }) {
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    if (!editor) return
    const handler = () => forceUpdate(n => n + 1)
    editor.on('selectionUpdate', handler)
    editor.on('update', handler)
    return () => { editor.off('selectionUpdate', handler); editor.off('update', handler) }
  }, [editor])

  if (!editor) return null

  const para = editor.getAttributes('paragraph')
  const curFont = para.fontFamily ?? ''
  const curSize = para.fontSize ?? ''
  const curLH   = para.lineHeight ?? ''

  const setParaAttr = (key: string, val: string | null) =>
    editor.chain().focus().updateAttributes('paragraph', { [key]: val || null }).run()

  return (
    <div style={{
      display: 'flex', gap: 3, padding: '4px 8px',
      borderBottom: '1px solid var(--border)', background: 'var(--bg-subtle)',
      flexWrap: 'wrap', alignItems: 'center',
    }}>
      <select value={curFont} onChange={e => setParaAttr('fontFamily', e.target.value)} style={selStyle}>
        <option value="">Schrift…</option>
        {FONT_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
      </select>

      <select value={curSize} onChange={e => setParaAttr('fontSize', e.target.value)} style={selStyle}>
        <option value="">Größe…</option>
        {SIZE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
      </select>

      <select value={curLH} onChange={e => setParaAttr('lineHeight', e.target.value)} style={selStyle}>
        <option value="">ZA…</option>
        {LH_OPTIONS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
      </select>

      <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 2px', flexShrink: 0 }} />

      <button onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleBold().run() }}
        style={fmtBtn(editor.isActive('bold'))}>B</button>
      <button onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleItalic().run() }}
        style={fmtBtn(editor.isActive('italic'), { fontStyle: 'italic' })}>I</button>
      <button onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleUnderline().run() }}
        style={fmtBtn(editor.isActive('underline'), { textDecoration: 'underline' })}>U</button>
      <button onMouseDown={e => { e.preventDefault(); editor.commands.toggleUppercase() }}
        style={fmtBtn(editor.isActive('uppercase'))}>UC</button>

      <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 2px', flexShrink: 0 }} />

      <button
        title="Horizontale Trennlinie einfügen"
        onMouseDown={e => { e.preventDefault(); editor.chain().focus().setHorizontalRule().run() }}
        style={{ ...fmtBtn(false), fontWeight: 400, letterSpacing: 1, fontSize: 10 }}
      >─ HR</button>
    </div>
  )
}

// ── Lineal-Komponente ─────────────────────────────────────────────────────────

interface RulerBarProps {
  tabStops: TabStop[]
  onToggle: (pos: number) => void
  containerRef: React.RefObject<HTMLDivElement | null>
  rulerCm: number
  marginLeftCm: number
  marginRightCm: number
}

function RulerBar({ tabStops, onToggle, containerRef, rulerCm, marginLeftCm, marginRightCm }: RulerBarProps) {
  const [width, setWidth] = useState(600)
  const rulerRef = useRef<HTMLDivElement>(null)
  const [rulerTooltip, setRulerTooltip] = useState<{ x: number; top: number; cm: number } | null>(null)
  const [cursorInMargin, setCursorInMargin] = useState(false)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    obs.observe(el)
    setWidth(el.getBoundingClientRect().width)
    return () => obs.disconnect()
  }, [containerRef])

  const cmToPx = (cm: number) => (cm / rulerCm) * width

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!rulerRef.current) return
    const rect = rulerRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const pos = Math.round((x / width) * rulerCm * 4) / 4
    if (pos < 0.1 || pos > rulerCm - 0.1) return
    // Keine Tab-Stops im Seitenrand-Bereich
    if (pos <= marginLeftCm || pos >= rulerCm - marginRightCm) return
    onToggle(pos)
  }

  const inMargin = (cm: number) =>
    (marginLeftCm > 0 && cm <= marginLeftCm) || (marginRightCm > 0 && cm >= rulerCm - marginRightCm)

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = rulerRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = e.clientX - rect.left
    const cm = Math.max(0, Math.min(rulerCm, (x / width) * rulerCm))
    setRulerTooltip({ x: e.clientX, top: rect.top, cm })
    setCursorInMargin(inMargin(cm))
  }

  const H = 29
  const TICK_5CM  = Math.round(H * 0.50)   // war 0.62, 20% kürzer
  const TICK_1CM  = Math.round(H * 0.38)
  const TICK_05CM = Math.round(H * 0.21)

  return (
    <>
      <div
        ref={rulerRef}
        onMouseDown={e => e.preventDefault()}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => { setRulerTooltip(null); setCursorInMargin(false) }}
        style={{
          position: 'relative', height: H,
          background: 'var(--bg-subtle)', borderBottom: '2px solid var(--border)',
          cursor: cursorInMargin ? 'not-allowed' : 'crosshair', userSelect: 'none', overflow: 'hidden', flexShrink: 0,
        }}
      >
        {Array.from({ length: rulerCm + 1 }, (_, i) => {
          const is5 = i % 5 === 0
          const tickH = is5 ? TICK_5CM : TICK_1CM
          return (
            <div key={i} style={{
              position: 'absolute', left: cmToPx(i), bottom: 0,
              width: is5 ? 2 : 1, height: tickH,
              background: is5 ? 'var(--text-secondary)' : 'var(--text-muted)',
              opacity: is5 ? 1 : 0.6, pointerEvents: 'none',
            }}>
              {is5 && i > 0 && (
                <span style={{
                  position: 'absolute', bottom: tickH + 2,
                  left: i === rulerCm ? undefined : -4,
                  right: i === rulerCm ? 0 : undefined,
                  fontSize: 9, fontWeight: 600, color: 'var(--text-secondary)',
                  pointerEvents: 'none', whiteSpace: 'nowrap', lineHeight: 1,
                }}>{i} cm</span>
              )}
            </div>
          )
        })}
        {Array.from({ length: Math.round(rulerCm * 2) }, (_, i) => {
          if (i % 2 === 0) return null
          return (
            <div key={`h${i}`} style={{
              position: 'absolute', left: cmToPx(i * 0.5), bottom: 0,
              width: 1, height: TICK_05CM,
              background: 'var(--text-muted)', opacity: 0.4, pointerEvents: 'none',
            }} />
          )
        })}
        {/* Seitenrand-Overlays */}
        {marginLeftCm > 0 && (
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0,
            width: cmToPx(marginLeftCm), background: 'rgba(0,0,0,0.08)',
            borderRight: '1px solid rgba(0,0,0,0.18)', pointerEvents: 'none', zIndex: 1,
          }} />
        )}
        {marginRightCm > 0 && (
          <div style={{
            position: 'absolute', left: cmToPx(rulerCm - marginRightCm), top: 0, bottom: 0,
            width: cmToPx(marginRightCm), background: 'rgba(0,0,0,0.08)',
            borderLeft: '1px solid rgba(0,0,0,0.18)', pointerEvents: 'none', zIndex: 1,
          }} />
        )}
        {tabStops.map(ts => (
          <div
            key={`${ts.pos}-${ts.align}`}
            onMouseDown={e => { e.stopPropagation(); e.preventDefault() }}
            onClick={e => { e.stopPropagation(); onToggle(ts.pos) }}
            style={{
              position: 'absolute', left: cmToPx(ts.pos) - 7, bottom: 1,
              width: 14, height: H - 2, display: 'flex', alignItems: 'center',
              justifyContent: 'center', color: TAB_ALIGN_COLORS[ts.align],
              fontSize: 10, fontWeight: 700, cursor: 'pointer', zIndex: 2,
              lineHeight: 1, borderLeft: `2px solid ${TAB_ALIGN_COLORS[ts.align]}`,
            }}
          >
            <span style={{ marginLeft: 3 }}>{TAB_ALIGN_SYMBOL[ts.align]}</span>
          </div>
        ))}
      </div>
      {rulerTooltip && createPortal(
        <div style={{
          position: 'fixed', left: rulerTooltip.x, top: rulerTooltip.top - 26,
          transform: 'translateX(-50%)', background: '#111', color: '#fff',
          fontSize: 10, fontWeight: 500, padding: '3px 8px', borderRadius: 4,
          pointerEvents: 'none', zIndex: 99999, whiteSpace: 'nowrap',
          lineHeight: 1.5, boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        }}>
          {inMargin(rulerTooltip.cm) ? `${rulerTooltip.cm.toFixed(2)} cm · Seitenrand` : `${rulerTooltip.cm.toFixed(2)} cm · Klick = tab`}
        </div>,
        document.body
      )}
    </>
  )
}

// ── Haupt-Editor-Komponente ───────────────────────────────────────────────────

interface SzenenKopfVorlagenEditorProps {
  value: string
  onChange: (v: string) => void
  readOnly?: boolean
  seitenformat?: 'a4' | 'letter'
  marginLeft?: number   // mm
  marginRight?: number  // mm
}

export default function SzenenKopfVorlagenEditor({
  value,
  onChange,
  readOnly = false,
  seitenformat = 'a4',
  marginLeft = 25,
  marginRight = 20,
}: SzenenKopfVorlagenEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [activeTabStops, setActiveTabStops] = useState<TabStop[]>([])
  const [showPreview, setShowPreview] = useState(false)
  const [containerWidth, setContainerWidth] = useState(600)

  const rulerCm = seitenformat === 'letter' ? 16.5 : 17
  const marginLeftCm  = marginLeft  / 10
  const marginRightCm = marginRight / 10

  // Container-Breite tracken für proportionale Editor-Ränder
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new ResizeObserver(([e]) => setContainerWidth(e.contentRect.width))
    obs.observe(el)
    setContainerWidth(el.getBoundingClientRect().width)
    return () => obs.disconnect()
  }, [])

  const editorPL = Math.round((marginLeftCm  / rulerCm) * containerWidth)
  const editorPR = Math.round((marginRightCm / rulerCm) * containerWidth)

  const editor = useEditor({
    editable: !readOnly,
    extensions: [
      StarterKit.configure({
        paragraph: false,
        strike: false, code: false, codeBlock: false, heading: false, blockquote: false,
        bulletList: false, orderedList: false, listItem: false,
        hardBreak: false,
        dropcursor: false, gapcursor: false,
      }),
      Underline,
      UppercaseMark,
      ParagraphWithStops,
      SKChipExtension,
      SKIfExtension,
      SKEndIfExtension,
      TabKeyExtension,
    ],
    content: parseSKTemplate(value),
    onUpdate: ({ editor: ed }) => {
      onChange(serializeSKTemplate(ed.getJSON()))
    },
    onSelectionUpdate: ({ editor: ed }) => {
      const { $anchor } = ed.state.selection
      const node = $anchor.parent
      if (node.type.name === 'paragraph') setActiveTabStops(node.attrs.tabStops ?? [])
    },
  })

  const prevValue = useRef(value)
  useEffect(() => {
    if (!editor || value === prevValue.current) return
    prevValue.current = value
    editor.commands.setContent(parseSKTemplate(value), false)
  }, [value, editor])

  useEffect(() => {
    if (!editor) return
    const update = () => {
      const { $anchor } = editor.state.selection
      const node = $anchor.parent
      if (node.type.name === 'paragraph') setActiveTabStops(node.attrs.tabStops ?? [])
    }
    editor.on('selectionUpdate', update)
    editor.on('update', update)
    return () => { editor.off('selectionUpdate', update); editor.off('update', update) }
  }, [editor])

  const handleToggleTabStop = useCallback((pos: number) => {
    if (!editor) return
    const { $anchor } = editor.state.selection
    const node = $anchor.parent
    if (node.type.name !== 'paragraph') return
    const current: TabStop[] = node.attrs.tabStops ?? []
    const existingIdx = current.findIndex(ts => Math.abs(ts.pos - pos) < 0.2)
    let newStops: TabStop[]
    if (existingIdx >= 0) {
      const next = TAB_ALIGN_NEXT[current[existingIdx].align]
      if (next === null) {
        newStops = current.filter((_, i) => i !== existingIdx)
      } else {
        newStops = current.map((ts, i) => i === existingIdx ? { ...ts, align: next } : ts)
      }
    } else {
      newStops = [...current, { pos, align: 'left' as const }].sort((a, b) => a.pos - b.pos)
    }
    editor.chain().focus().updateAttributes('paragraph', { tabStops: newStops }).run()
    setActiveTabStops(newStops)
    onChange(serializeSKTemplate(editor.getJSON()))
  }, [editor, onChange])

  return (
    <div
      ref={containerRef}
      style={{
        border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden',
        background: readOnly ? 'var(--bg-subtle)' : 'var(--bg-surface)',
        display: 'flex', flexDirection: 'column',
      }}
    >
      {/* Formatierungs-Toolbar */}
      {!readOnly && <EditorToolbar editor={editor} />}

      {/* Chip-Toolbar */}
      {!readOnly && (
        <div style={{
          display: 'flex', gap: 4, padding: '5px 8px', flexWrap: 'wrap',
          borderBottom: '1px solid var(--border)', background: 'var(--bg-subtle)',
          alignItems: 'center',
        }}>
          <span style={{ fontSize: 9, color: 'var(--text-muted)', marginRight: 2, flexShrink: 0 }}>
            Felder:
          </span>
          {SK_CHIPS.map(chip => (
            <button
              key={chip.key}
              title={chip.beschreibung}
              onMouseDown={e => { e.preventDefault(); editor?.commands.insertSKChip(chip.key) }}
              style={{
                padding: '1px 6px', borderRadius: 4, fontSize: 10, cursor: 'pointer',
                background: chip.color + '22', color: chip.color,
                border: `1px solid ${chip.color}55`, fontWeight: 500, lineHeight: 1.6,
              }}
            >
              {chip.label}
            </button>
          ))}
          <div style={{ width: 1, height: 14, background: 'var(--border)', margin: '0 2px', flexShrink: 0 }} />
          <button
            title="IF-Block beginnen: Inhalt bis [◀] wird nur angezeigt wenn der gewählte Chip einen Wert hat. Klick auf [▶ ?] um Chip zu wählen."
            onMouseDown={e => { e.preventDefault(); editor?.commands.insertSKIf() }}
            style={{ padding: '1px 6px', borderRadius: 4, fontSize: 10, cursor: 'pointer', background: IF_COLOR + '18', color: IF_COLOR, border: `1px dashed ${IF_COLOR}88`, fontWeight: 500, lineHeight: 1.6 }}
          >▶ IF</button>
          <button
            title="IF-Block beenden"
            onMouseDown={e => { e.preventDefault(); editor?.commands.insertSKEndIf() }}
            style={{ padding: '1px 6px', borderRadius: 4, fontSize: 10, cursor: 'pointer', background: ENDIF_COLOR + '18', color: ENDIF_COLOR, border: `1px dashed ${ENDIF_COLOR}88`, fontWeight: 500, lineHeight: 1.6 }}
          >◀ /IF</button>
        </div>
      )}

      {/* Lineal */}
      {!readOnly && (
        <RulerBar
          tabStops={activeTabStops}
          onToggle={handleToggleTabStop}
          containerRef={containerRef}
          rulerCm={rulerCm}
          marginLeftCm={marginLeftCm}
          marginRightCm={marginRightCm}
        />
      )}

      {/* Editor-Inhalt */}
      <style>{`
        .sk-vorlage-editor .ProseMirror {
          outline: none; min-height: 42px; tab-size: 4; -moz-tab-size: 4; white-space: pre-wrap;
        }
        .sk-vorlage-editor .ProseMirror p { margin: 0 0 3px 0; padding: 0; }
        .sk-vorlage-editor .ProseMirror p:last-child { margin-bottom: 0; }
        .sk-vorlage-editor .sk-chip.ProseMirror-selectednode {
          outline: 2px solid #007AFF; outline-offset: 1px; border-radius: 4px;
        }
      `}</style>
      <div
        className="sk-vorlage-editor"
        style={{
          paddingTop: 8, paddingBottom: 8,
          paddingLeft: editorPL, paddingRight: editorPR,
          flex: 1,
          fontFamily: "'Courier Prime','Courier New',monospace",
          fontSize: 12, lineHeight: 1.7, cursor: readOnly ? 'default' : 'text',
        }}
        onClick={() => !readOnly && editor?.chain().focus().run()}
      >
        <EditorContent editor={editor} />
      </div>

      {/* Legende + Vorschau-Button */}
      <div style={{
        padding: '3px 8px', fontSize: 9, color: 'var(--text-primary)',
        borderTop: '1px solid var(--border)', background: 'var(--bg-subtle)',
        lineHeight: 1.4, display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{ flex: 1 }}>
          Enter = neue Zeile (leer = auto-ausgeblendet) · Tab = Einzug · Lineal: Klick = L-Tab → C-Tab → R-Tab → entfernen
        </span>
        <button
          onMouseDown={e => e.preventDefault()}
          onClick={() => setShowPreview(true)}
          style={{
            padding: '1px 8px', borderRadius: 3, fontSize: 9, cursor: 'pointer',
            background: 'transparent', border: '1px solid var(--border)',
            color: 'var(--text-primary)', flexShrink: 0, lineHeight: 1.6,
          }}
        >
          Vorschau
        </button>
      </div>

      {showPreview && (
        <PreviewModal
          stored={value}
          seitenformat={seitenformat}
          marginLeft={marginLeft}
          marginRight={marginRight}
          onClose={() => setShowPreview(false)}
        />
      )}
    </div>
  )
}
