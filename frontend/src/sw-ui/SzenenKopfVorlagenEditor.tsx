/**
 * SzenenKopfVorlagenEditor
 *
 * WYSIWYG-Tiptap-Editor für Szenenkopf-Vorlagen.
 * - Jede Paragraph = eine Template-Zeile (wird beim Rendern ausgeblendet wenn leer)
 * - Farbige Chip-Nodes für Szenenkopf-Felder
 * - Lineal mit konfigurierbaren Tab-Stops (L/C/R) pro Paragraph
 * - Formatierungs-Toolbar: Schriftart, -größe, Zeilenabstand, B/I/U/UC
 * - Seitenformat: A4 (21 cm) oder US Letter (21.59 cm) beeinflusst Linealbreite
 * - Vorschau-Modus mit Dummy-Daten
 * - Serialisierung als JSON-String; Legacy-Text ({{...}}) wird automatisch konvertiert
 */
import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useTerminologie } from './TerminologieContext'
import type { CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useEditor, EditorContent } from '@tiptap/react'
import type { Editor } from '@tiptap/core'
import { Node, Extension, Mark, mergeAttributes } from '@tiptap/core'
import { Plugin, PluginKey, NodeSelection } from 'prosemirror-state'
import { DecorationSet, Decoration } from 'prosemirror-view'
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
  { key: 'dt',           label: 'SP',        shortLabel: 'SP',  color: '#5856D6', beschreibung: 'Spieltag / Dramaturgischer Tag' },
  { key: 'oneliner',     label: 'Oneliner',  shortLabel: '1L',  color: '#AF52DE', beschreibung: 'Einzeiler / Zusammenfassung' },
  { key: 'rollen',       label: 'Rollen',    shortLabel: 'R',   color: '#34C759', beschreibung: 'Beteiligte Rollen' },
  { key: 'komparsen',    label: 'Komp.',     shortLabel: 'K',   color: '#00C7BE', beschreibung: 'Komparsen' },
  { key: 'info',         label: 'Info',      shortLabel: 'i',   color: '#FF3B30', beschreibung: 'Sonstige Info / Szenen-Info' },
  { key: 'page_length',  label: 'Seiten',    shortLabel: 'S.',  color: '#8E8E93', beschreibung: 'Seitenlänge der Szene (z.B. 2/8)' },
  { key: 'notiz',        label: 'Notiz',     shortLabel: 'N',   color: '#FF9500', beschreibung: 'Szenennotiz / Zusatzinfo' },
  { key: 'sondertyp',    label: 'Sondertyp', shortLabel: 'ST',  color: '#FF3B30', beschreibung: 'Sonder-Szenentyp (Flashback, Stockshot …)' },
  { key: 'ws_spez',      label: 'WS Spez.',  shortLabel: 'WSS', color: '#007AFF', beschreibung: 'Wechselschnitt-Spezifikation (Standard / Splitscreen / 2W Telefonat)' },
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
      fontFamily: {
        default: null,
        parseHTML: el => el.getAttribute('data-chip-ff') || null,
        renderHTML: () => ({}),
      },
      fontSize: {
        default: null,
        parseHTML: el => el.getAttribute('data-chip-fs') || null,
        renderHTML: () => ({}),
      },
      fontWeight: {
        default: null,
        parseHTML: el => el.getAttribute('data-chip-fw') || null,
        renderHTML: () => ({}),
      },
      fontStyle: {
        default: null,
        parseHTML: el => el.getAttribute('data-chip-fst') || null,
        renderHTML: () => ({}),
      },
      textDecoration: {
        default: null,
        parseHTML: el => el.getAttribute('data-chip-td') || null,
        renderHTML: () => ({}),
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
    const chipStyleParts = [
      'display:inline-flex', 'align-items:center',
      `background:${color}22`, `color:${color}`,
      `border:1px solid ${color}66`,
      'border-radius:4px', 'padding:1px 7px',
      `font-size:${node.attrs.fontSize ?? 'inherit'}`, 'line-height:1.5',
      'white-space:nowrap', 'user-select:none',
      'cursor:pointer', 'vertical-align:middle',
      `font-weight:${node.attrs.fontWeight ?? '500'}`,
    ]
    if (node.attrs.fontFamily) chipStyleParts.push(`font-family:${node.attrs.fontFamily}`)
    if (node.attrs.fontStyle) chipStyleParts.push(`font-style:${node.attrs.fontStyle}`)
    if (node.attrs.textDecoration) chipStyleParts.push(`text-decoration:${node.attrs.textDecoration}`)
    return [
      'span',
      mergeAttributes(
        {
          'data-sk-key': node.attrs.key,
          class: 'sk-chip',
          contenteditable: 'false',
          ...(node.attrs.collapsed ? { 'data-collapsed': 'true' } : {}),
        },
        { style: chipStyleParts.join(';') }
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
        const domStyleParts = [
          'display:inline-flex', 'align-items:center',
          `background:${color}22`, `color:${color}`,
          `border:1px solid ${color}66`,
          'border-radius:4px', `padding:${padding}`,
          `font-size:${attrs.fontSize ?? 'inherit'}`, 'line-height:1.5',
          'white-space:nowrap', 'user-select:none',
          'cursor:pointer', 'vertical-align:middle',
          `font-weight:${attrs.fontWeight ?? '500'}`,
        ]
        if (attrs.fontFamily) domStyleParts.push(`font-family:${attrs.fontFamily}`)
        if (attrs.fontStyle) domStyleParts.push(`font-style:${attrs.fontStyle}`)
        if (attrs.textDecoration) domStyleParts.push(`text-decoration:${attrs.textDecoration}`)
        span.style.cssText = domStyleParts.join(';')
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

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('sk-chip-range-highlight'),
        props: {
          decorations(state) {
            const { selection } = state
            if (selection instanceof NodeSelection || selection.empty) return DecorationSet.empty
            const decos: Decoration[] = []
            state.doc.nodesBetween(selection.from, selection.to, (node, pos) => {
              if (node.type.name === 'sk_chip') {
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
      fontWeight: {
        default: null,
        parseHTML: el => el.getAttribute('data-fw') || null,
        renderHTML: () => ({}),
      },
      fontStyle: {
        default: null,
        parseHTML: el => el.getAttribute('data-fst') || null,
        renderHTML: () => ({}),
      },
      textDecoration: {
        default: null,
        parseHTML: el => el.getAttribute('data-td') || null,
        renderHTML: () => ({}),
      },
      textTransform: {
        default: null,
        parseHTML: el => el.getAttribute('data-tt') || null,
        renderHTML: () => ({}),
      },
      spaceAfter: {
        default: null,
        parseHTML: el => el.getAttribute('data-sa') || null,
        renderHTML: () => ({}),
      },
    }
  },

  parseHTML() { return [{ tag: 'p' }] },

  renderHTML({ node, HTMLAttributes }) {
    const { fontFamily, fontSize, lineHeight, tabStops, fontWeight, fontStyle, textDecoration, textTransform, spaceAfter } = node.attrs
    const extra: Record<string, any> = {}
    if (tabStops?.length) extra['data-tab-stops'] = JSON.stringify(tabStops)
    if (fontFamily) extra['data-ff'] = fontFamily
    if (fontSize) extra['data-fs'] = fontSize
    if (lineHeight) extra['data-lh'] = lineHeight
    const styleArr: string[] = []
    if (fontFamily) styleArr.push(`font-family:${fontFamily}`)
    if (fontSize) styleArr.push(`font-size:${fontSize}`)
    if (lineHeight) styleArr.push(`line-height:${lineHeight}`)
    if (fontWeight) styleArr.push(`font-weight:${fontWeight}`)
    if (fontStyle) styleArr.push(`font-style:${fontStyle}`)
    if (textDecoration) styleArr.push(`text-decoration:${textDecoration}`)
    if (textTransform) styleArr.push(`text-transform:${textTransform}`)
    if (spaceAfter) styleArr.push(`margin-bottom:${spaceAfter}`)
    if (styleArr.length) extra.style = styleArr.join(';')
    return ['p', mergeAttributes(HTMLAttributes, extra), 0]
  },
})

// ── Tab-Char Node (inline, atom) ──────────────────────────────────────────────

const TabCharNode = Node.create({
  name: 'tab_char',
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes() {
    return {
      widthPx:    { default: 20 },
      align:      { default: 'left' },
      stopPosCm:  { default: 0 },  // Ziel-Tab-Stop in cm (für center/right Nachjustierung)
    }
  },
  parseHTML() { return [{ tag: 'span[data-tab-char]' }] },
  renderHTML({ node }) {
    const w = Math.max(4, node.attrs.widthPx)
    return ['span', {
      'data-tab-char': node.attrs.align,
      style: `display:inline-block;width:${w}px;vertical-align:baseline`,
    }, '\u200B']
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
      if (node.type === 'tab_char') { lineText += '\t'; continue }
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
      const trimmed = lineText.trim()
      lines.push(para.attrs?.textTransform === 'uppercase' ? trimmed.toUpperCase() : trimmed)
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
  ws_spez:      'Splitscreen',
  partner:      'Referenz: Sz. 18 (Ep. 8104)',
  sk_kat:       'Garten',
  fb_ref:       'Sz. 7 (Ep. 8090)',
}

// Ein Segment = entweder formatierter Text oder ein Tab-Spacer
type TextSeg = { kind: 'text'; text: string; bold?: boolean; italic?: boolean; underline?: boolean; uppercase?: boolean; fontFamily?: string; fontSize?: string }
type PreviewSegment =
  | TextSeg
  | { kind: 'tab'; posCm: number; align: TabAlign }

type PreviewItem =
  | { type: 'hr' }
  | { type: 'line'; segments: PreviewSegment[]; rulerCm: number; style: CSSProperties }

function renderPreviewLines(stored: string, rulerCm: number): PreviewItem[] {
  let doc: any
  try { doc = parseSKTemplate(stored) } catch { return [] }

  const result: PreviewItem[] = []
  for (const node of (doc.content ?? [])) {
    if (node.type === 'horizontalRule' || node.type === 'horizontal_rule') {
      // HR immer einfügen (außer doppelt)
      if (result.length === 0 || result[result.length - 1].type !== 'hr') result.push({ type: 'hr' })
      continue
    }
    if (node.type !== 'paragraph') continue

    let skipDepth = 0
    const segments: PreviewSegment[] = []

    const appendText = (text: string, bold?: boolean, italic?: boolean, underline?: boolean, uppercase?: boolean, fontFamily?: string, fontSize?: string) => {
      const last = segments[segments.length - 1]
      if (last?.kind === 'text' && last.bold === bold && last.italic === italic &&
          last.underline === underline && last.uppercase === uppercase &&
          last.fontFamily === fontFamily && last.fontSize === fontSize) {
        (last as TextSeg).text += text
      } else {
        segments.push({ kind: 'text', text, bold, italic, underline, uppercase, fontFamily, fontSize })
      }
    }

    for (const child of (node.content ?? [])) {
      if (child.type === 'sk_if') {
        const val = DUMMY_FIELDS[child.attrs?.ref_key] ?? ''
        if (!val.trim()) skipDepth++
        continue
      }
      if (child.type === 'sk_endif') { if (skipDepth > 0) skipDepth--; continue }
      if (skipDepth > 0) continue
      if (child.type === 'text') {
        const marks = child.marks ?? []
        appendText(
          child.text ?? '',
          marks.some((m: any) => m.type === 'bold'),
          marks.some((m: any) => m.type === 'italic'),
          marks.some((m: any) => m.type === 'underline'),
          marks.some((m: any) => m.type === 'uppercase'),
        )
      } else if (child.type === 'sk_chip') {
        const val = DUMMY_FIELDS[child.attrs?.key] ?? ''
        const ca = child.attrs ?? {}
        appendText(
          val,
          ca.fontWeight === 'bold',
          ca.fontStyle === 'italic',
          ca.textDecoration === 'underline',
          false,
          ca.fontFamily || undefined,
          ca.fontSize || undefined,
        )
      } else if (child.type === 'tab_char') {
        segments.push({ kind: 'tab', posCm: child.attrs?.stopPosCm ?? 0, align: child.attrs?.align ?? 'left' })
      }
    }

    const allText = segments.filter(s => s.kind === 'text').map(s => (s as TextSeg).text).join('')
    if (!allText.replace(/\s/g, '')) continue

    const { fontFamily, fontSize, lineHeight, fontWeight, fontStyle, textDecoration, textTransform, spaceAfter } = node.attrs ?? {}
    const style: CSSProperties = {
      fontFamily: fontFamily ?? "'Courier Prime','Courier New',monospace",
      fontSize: fontSize ?? 12,
      lineHeight: lineHeight ?? 1.7,
      fontWeight: fontWeight ?? undefined,
      fontStyle: fontStyle ?? undefined,
      textDecoration: textDecoration ?? undefined,
      textTransform: (textTransform as any) ?? undefined,
      marginBottom: spaceAfter ?? undefined,
      whiteSpace: 'pre',
    }
    result.push({ type: 'line', segments, rulerCm, style })
  }
  // Trailing-HR entfernen
  while (result.length > 0 && result[result.length - 1].type === 'hr') result.pop()
  // Leading-HR entfernen (wenn die erste Inhalt-Zeile vor dem HR gefiltert wurde)
  while (result.length > 0 && result[0].type === 'hr') result.shift()
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
  const rulerCm = seitenformat === 'letter' ? 21.59 : 21
  const items = renderPreviewLines(stored, rulerCm)
  // 1cm = 37.795px bei 96dpi
  const CM_PX = 37.795
  const contentWidthPx = Math.round(rulerCm * CM_PX)            // ~794px A4
  const mLcm = marginLeft / 10     // mm → cm
  const mRcm = marginRight / 10
  const textAreaCm = rulerCm - mLcm - mRcm
  const plPx = Math.round(mLcm / rulerCm * contentWidthPx)
  const prPx = Math.round(mRcm / rulerCm * contentWidthPx)

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
            : items.map((item, i) => {
              if (item.type === 'hr') return <hr key={i} style={{ border: 'none', borderTop: '1px solid #000', margin: '4px 0' }} />
              const hasTabs = item.segments.some(s => s.kind === 'tab')
              const renderTextSeg = (s: TextSeg, key: number) => (
                <span key={key} style={{
                  fontWeight:      s.bold      ? 'bold'      : undefined,
                  fontStyle:       s.italic    ? 'italic'    : undefined,
                  textDecoration:  s.underline ? 'underline' : undefined,
                  textTransform:   s.uppercase ? 'uppercase' : undefined,
                  fontFamily:      s.fontFamily ?? undefined,
                  fontSize:        s.fontSize   ?? undefined,
                }}>{s.text}</span>
              )
              if (!hasTabs) {
                const textSegs = item.segments.filter(s => s.kind === 'text') as TextSeg[]
                return <div key={i} style={{ ...item.style, whiteSpace: 'normal', wordBreak: 'break-word' }}>
                  {textSegs.map(renderTextSeg)}
                </div>
              }
              // Tab-Zeilen als Flex-Spalten — Spaltenbreite proportional zu Tab-Stop-Abständen.
              interface FlexCol { startFrac: number; endFrac: number; segs: TextSeg[]; align: TabAlign }
              const cols: FlexCol[] = []
              let colSegs: TextSeg[] = []
              let colAlign: TabAlign = 'left'
              let colStart = 0

              const pushCol = (endFrac: number) => {
                cols.push({ startFrac: colStart, endFrac, segs: colSegs, align: colAlign })
                colSegs = []
                colStart = endFrac
              }

              for (const seg of item.segments) {
                if (seg.kind === 'tab') {
                  const ts = seg as PreviewSegment & { kind: 'tab' }
                  const frac = Math.max(colStart, Math.min(1, (ts.posCm - mLcm) / textAreaCm))
                  pushCol(frac)
                  colAlign = ts.align
                } else {
                  colSegs.push(seg as TextSeg)
                }
              }
              pushCol(1)  // letzte Spalte bis rechter Rand

              return (
                <div key={i} style={{ ...item.style, display: 'flex', whiteSpace: 'normal' }}>
                  {cols.map((col, ci) => {
                    const widthPct = (col.endFrac - col.startFrac) * 100
                    const isLast = ci === cols.length - 1
                    return (
                      <span key={ci} style={{
                        flex: isLast ? '1 1 0' : `0 0 ${widthPct.toFixed(2)}%`,
                        minWidth: 0,
                        overflow: 'hidden',
                        wordBreak: 'break-word',
                        textAlign: col.align === 'right' ? 'right' : col.align === 'center' ? 'center' : 'left',
                      }}>
                        {col.segs.length > 0 ? col.segs.map(renderTextSeg) : '\u200B'}
                      </span>
                    )
                  })}
                </div>
              )
            })
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
const SPACE_AFTER_OPTIONS = [
  { value: '0pt',  label: '0 pt' },
  { value: '4pt',  label: '4 pt' },
  { value: '6pt',  label: '6 pt' },
  { value: '8pt',  label: '8 pt' },
  { value: '12pt', label: '12 pt' },
  { value: '18pt', label: '18 pt' },
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

  const { selection } = editor.state
  const chipSelected = selection instanceof NodeSelection && selection.node.type.name === 'sk_chip'
  const chipAttrs = chipSelected ? (selection as NodeSelection).node.attrs : null

  const para = editor.getAttributes('paragraph')
  const curLH  = para.lineHeight ?? ''
  const curSA  = para.spaceAfter ?? ''
  const isUppercase = para.textTransform === 'uppercase'

  // Font/size/B/I/U: chip-level when chip selected, else para-level
  const curFont     = chipAttrs ? (chipAttrs.fontFamily ?? '') : (para.fontFamily ?? '')
  const curSize     = chipAttrs ? (chipAttrs.fontSize ?? '')   : (para.fontSize ?? '')
  const isBold      = chipAttrs ? chipAttrs.fontWeight === 'bold'          : para.fontWeight === 'bold'
  const isItalic    = chipAttrs ? chipAttrs.fontStyle === 'italic'         : para.fontStyle === 'italic'
  const isUnderline = chipAttrs ? chipAttrs.textDecoration === 'underline' : para.textDecoration === 'underline'

  const setParaAttr = (key: string, val: string | null) =>
    editor.chain().focus().updateAttributes('paragraph', { [key]: val || null }).run()

  const setChipAttr = (key: string, val: string | null) => {
    if (!chipSelected) return
    const sel = editor.state.selection as NodeSelection
    editor.view.dispatch(
      editor.state.tr.setNodeMarkup(sel.from, undefined, { ...sel.node.attrs, [key]: val || null })
    )
  }

  const setFontAttr   = (key: string, val: string | null) => chipSelected ? setChipAttr(key, val) : setParaAttr(key, val)
  const toggleBold      = () => setFontAttr('fontWeight',    isBold      ? null : 'bold')
  const toggleItalic    = () => setFontAttr('fontStyle',     isItalic    ? null : 'italic')
  const toggleUnderline = () => setFontAttr('textDecoration', isUnderline ? null : 'underline')

  const Sep = () => <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 2px', flexShrink: 0 }} />

  return (
    <div style={{
      display: 'flex', gap: 3, padding: '4px 8px',
      borderBottom: '1px solid var(--border)', background: 'var(--bg-subtle)',
      flexWrap: 'wrap', alignItems: 'center',
    }}>
      {/* Schrift + Größe (chip oder para) */}
      <select value={curFont} onChange={e => setFontAttr('fontFamily', e.target.value)} style={selStyle}
        title={chipSelected ? 'Chip-Schrift' : 'Absatz-Schrift'}>
        <option value="">Schrift…</option>
        {FONT_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
      </select>

      <select value={curSize} onChange={e => setFontAttr('fontSize', e.target.value)} style={selStyle}
        title={chipSelected ? 'Chip-Größe' : 'Absatz-Größe'}>
        <option value="">Größe…</option>
        {SIZE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
      </select>

      {/* ZA + Abstand: immer para-level */}
      <select value={curLH} onChange={e => setParaAttr('lineHeight', e.target.value)} style={selStyle}>
        <option value="">ZA…</option>
        {LH_OPTIONS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
      </select>
      <select value={curSA} onChange={e => setParaAttr('spaceAfter', e.target.value || null)} style={selStyle}
        title="Abstand nach Absatz">
        <option value="">Ab…</option>
        {SPACE_AFTER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>

      <Sep />

      {/* B/I/U: chip-level wenn Chip selektiert, sonst para-level */}
      <button onMouseDown={e => { e.preventDefault(); toggleBold() }}
        style={fmtBtn(isBold)}
        title={chipSelected ? 'Chip: Fett' : 'Absatz: Fett'}>B</button>
      <button onMouseDown={e => { e.preventDefault(); toggleItalic() }}
        style={fmtBtn(isItalic, { fontStyle: 'italic' })}
        title={chipSelected ? 'Chip: Kursiv' : 'Absatz: Kursiv'}>I</button>
      <button onMouseDown={e => { e.preventDefault(); toggleUnderline() }}
        style={fmtBtn(isUnderline, { textDecoration: 'underline' })}
        title={chipSelected ? 'Chip: Unterstrichen' : 'Absatz: Unterstrichen'}>U</button>

      {/* UC: immer para-level */}
      <button onMouseDown={e => { e.preventDefault(); setParaAttr('textTransform', isUppercase ? null : 'uppercase') }}
        style={fmtBtn(isUppercase)} title="Absatz: Blockschrift (Uppercase)">UC</button>

      <Sep />

      <button
        title="Horizontale Trennlinie einfügen"
        onMouseDown={e => { e.preventDefault(); editor.chain().focus().setHorizontalRule().run() }}
        style={{ ...fmtBtn(false), fontWeight: 400, letterSpacing: 1, fontSize: 10 }}
      >─ HR</button>

      {chipSelected && (
        <span style={{ fontSize: 9, color: 'var(--text-muted, #888)', marginLeft: 4, fontStyle: 'italic' }}>
          Chip selektiert
        </span>
      )}
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
  onMarginChange?: (side: 'left' | 'right', mm: number) => void
}

function RulerBar({ tabStops, onToggle, containerRef, rulerCm, marginLeftCm, marginRightCm, onMarginChange }: RulerBarProps) {
  const [width, setWidth] = useState(600)
  const rulerRef = useRef<HTMLDivElement>(null)
  const [rulerTooltip, setRulerTooltip] = useState<{ x: number; top: number; cm: number; nearHandle: 'left' | 'right' | null } | null>(null)
  // 'physical' = Maß ab Seitenrand (Standard); 'content' = Maß ab gesetztem Textrand
  const [rulerOrigin, setRulerOrigin] = useState<'physical' | 'content'>('physical')
  // Drag-Zustand für Rand-Verschiebung
  const [dragging, setDragging] = useState<{ side: 'left' | 'right'; startX: number; startMm: number } | null>(null)

  // Refs für stabilen Drag-Handler (kein Effect-Neustart bei Prop-Änderung)
  const widthRef  = useRef(width)
  const mLRef     = useRef(marginLeftCm)
  const mRRef     = useRef(marginRightCm)
  const onMargRef = useRef(onMarginChange)
  useEffect(() => { widthRef.current  = width },          [width])
  useEffect(() => { mLRef.current     = marginLeftCm },   [marginLeftCm])
  useEffect(() => { mRRef.current     = marginRightCm },  [marginRightCm])
  useEffect(() => { onMargRef.current = onMarginChange }, [onMarginChange])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    obs.observe(el)
    setWidth(el.getBoundingClientRect().width)
    return () => obs.disconnect()
  }, [containerRef])

  // Drag-Event-Listener (nur aktiv während eines Drag)
  useEffect(() => {
    if (!dragging) return
    document.body.style.cursor = 'col-resize'
    const onMove = (e: MouseEvent | TouchEvent) => {
      if ('touches' in e) e.preventDefault()
      const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX
      const dx = clientX - dragging.startX
      const dMm = (dx / widthRef.current) * rulerCm * 10
      const mL = mLRef.current
      const mR = mRRef.current
      if (dragging.side === 'left') {
        const newMm = Math.round(Math.max(0, Math.min((rulerCm - mR - 2) * 10, dragging.startMm + dMm)))
        onMargRef.current?.('left', newMm)
      } else {
        const newMm = Math.round(Math.max(0, Math.min((rulerCm - mL - 2) * 10, dragging.startMm - dMm)))
        onMargRef.current?.('right', newMm)
      }
    }
    const onUp = () => { setDragging(null); document.body.style.cursor = '' }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    document.addEventListener('touchmove', onMove as EventListener, { passive: false })
    document.addEventListener('touchend', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.removeEventListener('touchmove', onMove as EventListener)
      document.removeEventListener('touchend', onUp)
      document.body.style.cursor = ''
    }
  }, [dragging, rulerCm])

  const cmToPx = (cm: number) => (cm / rulerCm) * width

  const displayCm = (physCm: number) =>
    rulerOrigin === 'content' ? physCm - marginLeftCm : physCm

  const inMargin = (cm: number) =>
    (marginLeftCm > 0 && cm <= marginLeftCm) || (marginRightCm > 0 && cm >= rulerCm - marginRightCm)

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!rulerRef.current) return
    const rect = rulerRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const pos = Math.round((x / width) * rulerCm * 4) / 4
    if (pos < 0.1 || pos > rulerCm - 0.1) return
    if (pos <= marginLeftCm || pos >= rulerCm - marginRightCm) return
    onToggle(pos)
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = rulerRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = e.clientX - rect.left
    const cm = Math.max(0, Math.min(rulerCm, (x / width) * rulerCm))
    // Nähe zur Randlinie erkennen (±5 px)
    let nearHandle: 'left' | 'right' | null = null
    if (onMarginChange) {
      if (marginLeftCm > 0  && Math.abs(x - cmToPx(marginLeftCm)) <= 5) nearHandle = 'left'
      else if (marginRightCm > 0 && Math.abs(x - cmToPx(rulerCm - marginRightCm)) <= 5) nearHandle = 'right'
    }
    setRulerTooltip({ x: e.clientX, top: rect.top, cm, nearHandle })
  }

  const startDrag = (side: 'left' | 'right') => (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX
    const startMm = side === 'left' ? marginLeftCm * 10 : marginRightCm * 10
    setDragging({ side, startX: clientX, startMm })
  }

  const toggleOrigin = (e: React.MouseEvent) => {
    e.stopPropagation()
    setRulerOrigin(prev => prev === 'physical' ? 'content' : 'physical')
  }

  const H = 29
  const TICK_5CM  = Math.round(H * 0.50)
  const TICK_1CM  = Math.round(H * 0.38)
  const TICK_05CM = Math.round(H * 0.21)

  const contentMode = rulerOrigin === 'content'
  const hasMargins  = marginLeftCm > 0 || marginRightCm > 0

  const tickLabel = (i: number) => {
    if (!contentMode) return `${i} cm`
    const v = parseFloat((i - marginLeftCm).toFixed(2))
    return Number.isInteger(v) ? `${v} cm` : `${v.toFixed(1)} cm`
  }

  return (
    <>
      <div
        ref={rulerRef}
        onMouseDown={e => e.preventDefault()}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setRulerTooltip(null)}
        style={{
          position: 'relative', height: H,
          background: 'var(--bg-subtle)', borderBottom: '2px solid var(--border)',
          cursor: 'crosshair', userSelect: 'none', overflow: 'hidden', flexShrink: 0,
        }}
      >
        {/* 1 cm-Striche mit Beschriftung */}
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
                }}>{tickLabel(i)}</span>
              )}
            </div>
          )
        })}

        {/* 0,5 cm-Striche */}
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

        {/* "0"-Markierung am Textrand-Beginn im content-Modus */}
        {contentMode && marginLeftCm > 0 && (
          <div style={{
            position: 'absolute', left: cmToPx(marginLeftCm), bottom: 0,
            width: 2, height: TICK_5CM,
            background: '#007AFF', opacity: 0.9, pointerEvents: 'none', zIndex: 4,
          }}>
            <span style={{
              position: 'absolute', bottom: TICK_5CM + 2, left: 2,
              fontSize: 9, fontWeight: 700, color: '#007AFF',
              pointerEvents: 'none', whiteSpace: 'nowrap', lineHeight: 1,
            }}>0</span>
          </div>
        )}

        {/* Seitenrand-Overlays — klickbar zum Umschalten des Maß-Ursprungs */}
        {marginLeftCm > 0 && (
          <div
            onClick={toggleOrigin}
            style={{
              position: 'absolute', left: 0, top: 0, bottom: 0,
              width: cmToPx(marginLeftCm),
              background: contentMode ? 'rgba(0,122,255,0.10)' : 'rgba(0,0,0,0.08)',
              borderRight: `${dragging?.side === 'left' ? 2 : 1}px solid ${dragging?.side === 'left' ? '#007AFF' : contentMode ? 'rgba(0,122,255,0.35)' : 'rgba(0,0,0,0.18)'}`,
              cursor: 'pointer', zIndex: 3,
            }}
          />
        )}
        {marginRightCm > 0 && (
          <div
            onClick={toggleOrigin}
            style={{
              position: 'absolute', left: cmToPx(rulerCm - marginRightCm), top: 0, bottom: 0,
              width: cmToPx(marginRightCm),
              background: contentMode ? 'rgba(0,122,255,0.10)' : 'rgba(0,0,0,0.08)',
              borderLeft: `${dragging?.side === 'right' ? 2 : 1}px solid ${dragging?.side === 'right' ? '#007AFF' : contentMode ? 'rgba(0,122,255,0.35)' : 'rgba(0,0,0,0.18)'}`,
              cursor: 'pointer', zIndex: 3,
            }}
          />
        )}

        {/* Drag-Handles an den Randlinien */}
        {onMarginChange && marginLeftCm > 0 && (
          <div
            onMouseDown={startDrag('left')}
            onTouchStart={startDrag('left')}
            style={{
              position: 'absolute', left: cmToPx(marginLeftCm) - 4, top: 0, bottom: 0,
              width: 8, cursor: 'col-resize', zIndex: 5,
            }}
          />
        )}
        {onMarginChange && marginRightCm > 0 && (
          <div
            onMouseDown={startDrag('right')}
            onTouchStart={startDrag('right')}
            style={{
              position: 'absolute', left: cmToPx(rulerCm - marginRightCm) - 4, top: 0, bottom: 0,
              width: 8, cursor: 'col-resize', zIndex: 5,
            }}
          />
        )}

        {/* Tab-Stops */}
        {tabStops.map(ts => (
          <div
            key={`${ts.pos}-${ts.align}`}
            onMouseDown={e => { e.stopPropagation(); e.preventDefault() }}
            onClick={e => { e.stopPropagation(); onToggle(ts.pos) }}
            style={{ position: 'absolute', left: cmToPx(ts.pos) - 7, bottom: 1, width: 14, height: H - 2, cursor: 'pointer', zIndex: 2 }}
          >
            {/* Vertikale Linie an exakter Tab-Stop-Position (Mitte des 14px-Klickbereichs = 7px) */}
            <div style={{ position: 'absolute', left: 6, top: 0, bottom: 0, width: 2, background: TAB_ALIGN_COLORS[ts.align] }} />
            {/* Buchstabe zentriert unterhalb der Linie */}
            <span style={{
              position: 'absolute', bottom: 1, left: 0, right: 0,
              textAlign: 'center', fontSize: 8, fontWeight: 700,
              color: TAB_ALIGN_COLORS[ts.align], lineHeight: 1,
            }}>{TAB_ALIGN_SYMBOL[ts.align]}</span>
          </div>
        ))}
      </div>

      {/* Tooltip */}
      {rulerTooltip && createPortal(
        <div style={{
          position: 'fixed', left: rulerTooltip.x, top: rulerTooltip.top - 26,
          transform: 'translateX(-50%)', background: '#111', color: '#fff',
          fontSize: 10, fontWeight: 500, padding: '3px 8px', borderRadius: 4,
          pointerEvents: 'none', zIndex: 99999, whiteSpace: 'nowrap',
          lineHeight: 1.5, boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        }}>
          {rulerTooltip.nearHandle
            ? `Rand ${rulerTooltip.nearHandle === 'left' ? 'links' : 'rechts'} verschieben`
            : inMargin(rulerTooltip.cm)
              ? (hasMargins
                  ? (contentMode ? 'Klick: Maß ab Seitenrand anzeigen' : 'Klick: Maß ab Textrand anzeigen')
                  : 'Seitenrand')
              : `${displayCm(rulerTooltip.cm).toFixed(2)} cm · Klick = Tab`
          }
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
  onMarginChange?: (side: 'left' | 'right', mm: number) => void
}

export default function SzenenKopfVorlagenEditor({
  value,
  onChange,
  readOnly = false,
  seitenformat = 'a4',
  marginLeft = 25,
  marginRight = 20,
  onMarginChange,
}: SzenenKopfVorlagenEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [activeTabStops, setActiveTabStops] = useState<TabStop[]>([])
  const [showPreview, setShowPreview] = useState(false)
  const [containerWidth, setContainerWidth] = useState(600)
  const { t } = useTerminologie()
  const spieltagLabel = t('spieltag')

  const rulerCm = seitenformat === 'letter' ? 21.59 : 21
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

  // Stabile Refs für den Tab-Plugin (lesen immer aktuelle Werte)
  const rulerCmRef = useRef(rulerCm)
  useEffect(() => { rulerCmRef.current = rulerCm }, [rulerCm])

  // Tab-Handler via addProseMirrorPlugins — zuverlässiger als addKeyboardShortcuts,
  // da handleKeyDown direkt am ProseMirror-View-Level sitzt, vor Tiptap-Keymap-Verarbeitung.
  const TabHandlerExtension = useMemo(() => {
    // Refs werden in der Closure gecaptured (stabile Identität)
    const _containerRef = containerRef
    const _rulerCmRef   = rulerCmRef
    return Extension.create({
      name: 'sk_tab_handler',
      addProseMirrorPlugins() {
        return [
          new Plugin({
            key: new PluginKey('sk_tab_handler'),
            props: {
              handleKeyDown(view, event) {
                if (event.key !== 'Tab' || event.shiftKey) return false
                event.preventDefault()

                const container = _containerRef.current
                const rCm = _rulerCmRef.current
                const { state } = view
                const { $anchor, from } = state.selection
                const tabStops: TabStop[] = ($anchor.parent.attrs.tabStops ?? [])
                  .slice().sort((a: TabStop, b: TabStop) => a.pos - b.pos)

                if (!tabStops.length || !container) {
                  view.dispatch(state.tr.insertText('\u00A0\u00A0\u00A0\u00A0'))
                  return true
                }

                const coords    = view.coordsAtPos(from)
                const rect      = container.getBoundingClientRect()
                const cW        = container.clientWidth
                const cursorPx  = coords.left - rect.left
                const cursorCm  = (cursorPx / cW) * rCm
                const nextStop  = tabStops.find((ts: TabStop) => ts.pos > cursorCm + 0.05)

                if (!nextStop) {
                  view.dispatch(state.tr.insertText('\u00A0\u00A0\u00A0\u00A0'))
                  return true
                }

                const targetPx = (nextStop.pos / rCm) * cW
                const widthPx  = Math.max(4, Math.round(targetPx - cursorPx))
                const tabNode  = state.schema.nodes.tab_char?.create({
                  widthPx, align: nextStop.align, stopPosCm: nextStop.pos,
                })
                if (tabNode) view.dispatch(state.tr.replaceSelectionWith(tabNode))
                return true
              },
            },
          }),
        ]
      },
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
      TabCharNode,
      TabHandlerExtension,
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

  // ── Center/Right Tab-Breiten dynamisch nachjustieren ──────────────────────────
  // Nach jedem State-Update: Für jedes center/right tab_char messen wir die
  // Textbreite des nachfolgenden Segments und korrigieren widthPx so dass
  // der Text tatsächlich zentriert oder rechtsbündig am Tab-Stop sitzt.
  const lastAdjustRef = useRef(0)
  useEffect(() => {
    if (!editor || !containerRef.current) return
    // Kurze Entprellung: verhindert Endlosschleife (eigenes Dispatch → neuer State → Effekt)
    if (Date.now() - lastAdjustRef.current < 50) return
    const view = editor.view
    const container = containerRef.current
    const containerLeft = container.getBoundingClientRect().left
    const containerWidth = container.clientWidth
    const { state } = editor
    const { doc } = state
    const adjustments: Array<{ nodePos: number; newWidth: number; currentAttrs: any }> = []

    doc.descendants((paraNode, paraPos) => {
      if (paraNode.type.name !== 'paragraph') return
      // Keine center/right Stops? Überspringen
      const tabStops: TabStop[] = paraNode.attrs.tabStops ?? []
      if (!tabStops.some((ts: TabStop) => ts.align !== 'left')) return false

      // Kinder des Paragraphen als Array sammeln
      const children: Array<{ node: any; offset: number }> = []
      paraNode.forEach((child: any, offset: number) => { children.push({ node: child, offset }) })

      children.forEach((item, i) => {
        if (item.node.type.name !== 'tab_char') return
        const { align, stopPosCm, widthPx } = item.node.attrs
        if (align === 'left' || !stopPosCm) return

        const tabNodePos = paraPos + 1 + item.offset
        // Segment-Ende = nächstes tab_char oder Paragraph-Ende
        const nextTab = children.slice(i + 1).find(c => c.node.type.name === 'tab_char')
        const segEndPos = nextTab
          ? paraPos + 1 + nextTab.offset
          : paraPos + paraNode.nodeSize - 1

        try {
          const tabStartCoords = view.coordsAtPos(tabNodePos)
          const tabEndCoords   = view.coordsAtPos(tabNodePos + 1)
          const segEndCoords   = view.coordsAtPos(segEndPos)
          const tabStart_px  = tabStartCoords.left - containerLeft
          const textStart_px = tabEndCoords.left   - containerLeft
          const textEnd_px   = segEndCoords.left   - containerLeft
          const textWidth    = Math.max(0, textEnd_px - textStart_px)
          const stopPx       = (stopPosCm / rulerCm) * containerWidth

          const newWidth = align === 'right'
            ? Math.max(4, Math.round(stopPx - tabStart_px - textWidth))
            : Math.max(4, Math.round(stopPx - tabStart_px - textWidth / 2)) // center

          if (Math.abs(newWidth - widthPx) > 1) {
            adjustments.push({ nodePos: tabNodePos, newWidth, currentAttrs: item.node.attrs })
          }
        } catch { /* coordsAtPos nicht verfügbar */ }
      })
      return false // nicht in Paragraph-Kinder rekursieren (bereits manuell behandelt)
    })

    if (adjustments.length) {
      lastAdjustRef.current = Date.now()
      const tr = state.tr
      adjustments.forEach(({ nodePos, newWidth, currentAttrs }) => {
        tr.setNodeMarkup(nodePos, undefined, { ...currentAttrs, widthPx: newWidth })
      })
      view.dispatch(tr)
    }
  }, [editor?.state, rulerCm])  // eslint-disable-line react-hooks/exhaustive-deps

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
    // Kein .focus() nötig — e.preventDefault() im onMouseDown hält den Focus im Editor.
    // prevValue sofort setzen, damit der setContent-Effect keinen Unterschied erkennt
    // und den Cursor nicht resettet. onUpdate → onChange wird ohnehin gefeuert.
    editor.chain().updateAttributes('paragraph', { tabStops: newStops }).run()
    prevValue.current = serializeSKTemplate(editor.getJSON())
    setActiveTabStops(newStops)
  }, [editor])

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
              title={chip.key === 'dt' ? spieltagLabel : chip.beschreibung}
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
          onMarginChange={onMarginChange}
        />
      )}

      {/* Editor-Inhalt */}
      <style>{`
        .sk-vorlage-editor .ProseMirror {
          outline: none; min-height: 42px; tab-size: 4; -moz-tab-size: 4; white-space: pre-wrap;
          caret-color: #333;
        }
        .sk-vorlage-editor .ProseMirror p { margin: 0 0 3px 0; padding: 0; }
        .sk-vorlage-editor .ProseMirror p:last-child { margin-bottom: 0; }
        /* Leerer Pflicht-Paragraph nach HR: dezenter anzeigen */
        .sk-vorlage-editor .ProseMirror hr + p:not(:has(*)):not(:focus-within) { opacity: 0.35; }
        .sk-vorlage-editor .ProseMirror ::selection { background: rgba(0, 122, 255, 0.18); }
        .sk-vorlage-editor .sk-chip.ProseMirror-selectednode {
          outline: 2px solid #007AFF; outline-offset: 2px; border-radius: 4px;
          box-shadow: 0 0 0 4px rgba(0, 122, 255, 0.12);
        }
        .sk-vorlage-editor .sk-chip.chip-in-range {
          outline: 1.5px solid rgba(0, 122, 255, 0.55);
          outline-offset: 1px; border-radius: 4px;
          background-color: rgba(0, 122, 255, 0.08) !important;
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
          Enter = neue Zeile (leer = auto-ausgeblendet) · Tab = springt zum nächsten Tab-Stop · Lineal: Klick = L-Tab → C-Tab → R-Tab → entfernen
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
