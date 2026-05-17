/**
 * SzenenKopfVorlagenEditor
 *
 * WYSIWYG-Tiptap-Editor für Szenenkopf-Vorlagen.
 * - Jede Paragraph = eine Template-Zeile (wird beim Rendern ausgeblendet wenn leer)
 * - Farbige Chip-Nodes für Szenenkopf-Felder ({{szene_nr}}, {{motiv}}, ...)
 * - Lineal mit konfigurierbaren Tab-Stops (L/C/R) pro Paragraph
 * - Serialisierung als JSON-String; Legacy-Text ({{...}}) wird automatisch konvertiert
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useEditor, EditorContent } from '@tiptap/react'
import { Node, Extension, mergeAttributes } from '@tiptap/core'
import { StarterKit } from '@tiptap/starter-kit'

// ── Chip-Definitionen ─────────────────────────────────────────────────────────

export interface SKChipDef {
  key: string
  label: string
  shortLabel: string   // kompakte Darstellung wenn Chip verkleinert
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
  { key: 'staffel',      label: 'Staffel',   shortLabel: 'S',   color: '#8E8E93', beschreibung: 'Staffel-Nummer' },
  { key: 'episode',      label: 'Episode',   shortLabel: 'Ep',  color: '#8E8E93', beschreibung: 'Episoden-Nummer' },
]

// ── Chip-Extension ────────────────────────────────────────────────────────────

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    sk_chip: { insertSKChip: (key: string) => ReturnType }
  }
}

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

      // Tooltip-Element: direkt im body, außerhalb aller overflow:hidden Container
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
        span.setAttribute('data-sk-key', attrs.key)
        span.style.cssText = [
          'display:inline-flex', 'align-items:center',
          `background:${color}22`, `color:${color}`,
          `border:1px solid ${color}66`,
          'border-radius:4px', 'padding:1px 7px',
          'font-size:inherit', 'line-height:1.5',
          'white-space:nowrap', 'user-select:none',
          'cursor:pointer', 'vertical-align:middle', 'font-weight:500',
        ].join(';')
        span.textContent = label
        if (chip) tooltipEl.textContent = chip.beschreibung
      }

      // mousedown: Editor-Cursor-Placement verhindern, Fokus bleibt im Editor
      span.addEventListener('mousedown', (e) => { e.preventDefault() })

      // click: collapsed toggle
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

// ── Paragraph mit Tab-Stops ───────────────────────────────────────────────────

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
        renderHTML: (attrs: any) =>
          attrs.tabStops?.length ? { 'data-tab-stops': JSON.stringify(attrs.tabStops) } : {},
      },
    }
  },

  parseHTML() { return [{ tag: 'p' }] },

  renderHTML({ HTMLAttributes }) {
    return ['p', mergeAttributes(HTMLAttributes), 0]
  },
})

// ── Tab-Key Extension ─────────────────────────────────────────────────────────

const TabKeyExtension = Extension.create({
  name: 'tab_key',
  addKeyboardShortcuts() {
    return {
      Tab: () => {
        this.editor.commands.insertContent('\u00A0\u00A0\u00A0\u00A0')  // 4 non-breaking spaces
        return true
      },
      'Shift-Tab': () => true,  // Fokus-Verlust verhindern
    }
  },
})

// ── Serialize / Deserialize ───────────────────────────────────────────────────

/** Tiptap-JSON → gespeicherter String */
export function serializeSKTemplate(doc: any): string {
  return JSON.stringify(doc)
}

/** Gespeicherter String → Tiptap-JSON (mit Legacy-Text-Fallback für {{key}}-Format) */
export function parseSKTemplate(stored: string | null | undefined): any {
  if (!stored || !stored.trim()) return defaultSKDoc()
  const s = stored.trim()
  if (s.startsWith('{')) {
    try { return JSON.parse(s) } catch {}
  }
  // Legacy: plain text mit {{key}} Tokens, ggf. mehrzeilig
  const lines = s.split('\n')
  return {
    type: 'doc',
    content: lines.map(line => ({
      type: 'paragraph',
      attrs: { tabStops: [] },
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
    content: [{ type: 'paragraph', attrs: { tabStops: [] }, content: [] }],
  }
}

/**
 * Render-Hilfsfunktion: Tiptap-JSON → Text-Zeilen (für Vorschau und Export).
 * Zeilen, bei denen alle Chips leer sind, werden übersprungen (Auto-Collapse).
 */
export function renderSKTemplate(
  stored: string,
  fields: Partial<Record<string, string>>,
): string[] {
  let doc: any
  try { doc = parseSKTemplate(stored) } catch { return [] }

  const lines: string[] = []
  for (const para of (doc.content ?? [])) {
    if (para.type !== 'paragraph') continue
    let lineText = ''
    let hasNonEmptyChip = false
    for (const node of (para.content ?? [])) {
      if (node.type === 'text') {
        lineText += node.text ?? ''
      } else if (node.type === 'sk_chip') {
        const val = fields[node.attrs?.key] ?? ''
        lineText += val
        if (val.trim()) hasNonEmptyChip = true
      }
    }
    // Zeile ausblenden wenn: nur Leerzeichen + alle Chips leer
    const hasText = lineText.replace(/\s/g, '').length > 0
    if (hasText && (hasNonEmptyChip || !lineText.match(/^\s*$/))) {
      lines.push(lineText.trim())
    }
  }
  return lines
}

// ── Lineal-Komponente ─────────────────────────────────────────────────────────

const RULER_CM = 17  // Standard A4-Textbreite in cm

interface RulerBarProps {
  tabStops: TabStop[]
  onToggle: (pos: number) => void
  containerRef: React.RefObject<HTMLDivElement | null>
}

function RulerBar({ tabStops, onToggle, containerRef }: RulerBarProps) {
  const [width, setWidth] = useState(600)
  const rulerRef = useRef<HTMLDivElement>(null)
  const [rulerTooltip, setRulerTooltip] = useState<{ x: number; top: number; cm: number } | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    obs.observe(el)
    setWidth(el.getBoundingClientRect().width)
    return () => obs.disconnect()
  }, [containerRef])

  const cmToPx = (cm: number) => (cm / RULER_CM) * width

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!rulerRef.current) return
    const rect = rulerRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const pos = Math.round((x / width) * RULER_CM * 4) / 4  // auf 0.25cm runden
    if (pos < 0.1 || pos > RULER_CM - 0.1) return
    onToggle(pos)
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = rulerRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = e.clientX - rect.left
    const cm = Math.max(0, Math.min(RULER_CM, (x / width) * RULER_CM))
    setRulerTooltip({ x: e.clientX, top: rect.top, cm })
  }

  // Höhe: 29px (≈ 24px + 20%)
  const H = 29
  // Tick-Höhen
  const TICK_5CM  = Math.round(H * 0.62)  // ~18px — alle 5 cm
  const TICK_1CM  = Math.round(H * 0.38)  // ~11px — jeder cm
  const TICK_05CM = Math.round(H * 0.21)  //  ~6px — halbe cm

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
        {/* cm-Ticks (0, 1, 2, …, 17) */}
        {Array.from({ length: RULER_CM + 1 }, (_, i) => {
          const is5 = i % 5 === 0
          const tickH = is5 ? TICK_5CM : TICK_1CM
          return (
            <div
              key={i}
              style={{
                position: 'absolute', left: cmToPx(i), bottom: 0,
                width: is5 ? 2 : 1, height: tickH,
                background: is5 ? 'var(--text-secondary)' : 'var(--text-muted)',
                opacity: is5 ? 1 : 0.6,
                pointerEvents: 'none',
              }}
            >
              {/* Maßangabe bei 5er-Schritten: "5 cm", "10 cm", "15 cm" */}
              {is5 && i > 0 && (
                <span style={{
                  position: 'absolute', bottom: tickH + 2, left: i === RULER_CM ? undefined : -4,
                  right: i === RULER_CM ? 0 : undefined,
                  fontSize: 9, fontWeight: 600,
                  color: 'var(--text-secondary)', pointerEvents: 'none',
                  whiteSpace: 'nowrap', lineHeight: 1,
                }}>
                  {i} cm
                </span>
              )}
            </div>
          )
        })}
        {/* Halbe-cm-Ticks */}
        {Array.from({ length: RULER_CM * 2 }, (_, i) => {
          if (i % 2 === 0) return null
          return (
            <div key={`h${i}`} style={{
              position: 'absolute', left: cmToPx(i * 0.5), bottom: 0,
              width: 1, height: TICK_05CM,
              background: 'var(--text-muted)', opacity: 0.4,
              pointerEvents: 'none',
            }} />
          )
        })}
        {/* Tab-Stop-Marker */}
        {tabStops.map(ts => (
          <div
            key={`${ts.pos}-${ts.align}`}
            title={`${TAB_ALIGN_SYMBOL[ts.align]}-Tab bei ${ts.pos.toFixed(2)} cm — klicken zum Ändern/Entfernen`}
            onMouseDown={e => { e.stopPropagation(); e.preventDefault() }}
            onClick={e => { e.stopPropagation(); onToggle(ts.pos) }}
            style={{
              position: 'absolute', left: cmToPx(ts.pos) - 7, bottom: 1,
              width: 14, height: H - 2, display: 'flex', alignItems: 'center',
              justifyContent: 'center', color: TAB_ALIGN_COLORS[ts.align],
              fontSize: 10, fontWeight: 700, cursor: 'pointer', zIndex: 2,
              lineHeight: 1,
              borderLeft: `2px solid ${TAB_ALIGN_COLORS[ts.align]}`,
            }}
          >
            <span style={{ marginLeft: 3 }}>{TAB_ALIGN_SYMBOL[ts.align]}</span>
          </div>
        ))}
      </div>
      {/* Lineal-Tooltip via Portal — außerhalb overflow:hidden */}
      {rulerTooltip && createPortal(
        <div style={{
          position: 'fixed',
          left: rulerTooltip.x,
          top: rulerTooltip.top - 26,
          transform: 'translateX(-50%)',
          background: '#111',
          color: '#fff',
          fontSize: 10,
          fontWeight: 500,
          padding: '3px 8px',
          borderRadius: 4,
          pointerEvents: 'none',
          zIndex: 99999,
          whiteSpace: 'nowrap',
          lineHeight: 1.5,
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        }}>
          {rulerTooltip.cm.toFixed(2)} cm
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
}

export default function SzenenKopfVorlagenEditor({
  value,
  onChange,
  readOnly = false,
}: SzenenKopfVorlagenEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [activeTabStops, setActiveTabStops] = useState<TabStop[]>([])

  const editor = useEditor({
    editable: !readOnly,
    extensions: [
      StarterKit.configure({
        paragraph: false,  // durch ParagraphWithStops ersetzt
        bold: false, italic: false, strike: false, code: false,
        codeBlock: false, heading: false, blockquote: false,
        bulletList: false, orderedList: false, listItem: false,
        horizontalRule: false, hardBreak: false,
        dropcursor: false, gapcursor: false,
        // document, text, history bleiben aktiv
      }),
      ParagraphWithStops,
      SKChipExtension,
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

  // Externen value-Wechsel in Editor übernehmen
  const prevValue = useRef(value)
  useEffect(() => {
    if (!editor || value === prevValue.current) return
    prevValue.current = value
    editor.commands.setContent(parseSKTemplate(value), false)
  }, [value, editor])

  // Tab-Stops bei Cursor-Bewegung aktualisieren
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
        </div>
      )}

      {/* Lineal */}
      {!readOnly && (
        <RulerBar
          tabStops={activeTabStops}
          onToggle={handleToggleTabStop}
          containerRef={containerRef}
        />
      )}

      {/* Editor-Inhalt */}
      <style>{`
        .sk-vorlage-editor .ProseMirror {
          outline: none;
          min-height: 42px;
          tab-size: 4;
          -moz-tab-size: 4;
          white-space: pre-wrap;
        }
        .sk-vorlage-editor .ProseMirror p {
          margin: 0 0 3px 0;
          padding: 0;
        }
        .sk-vorlage-editor .ProseMirror p:last-child { margin-bottom: 0; }
        .sk-vorlage-editor .sk-chip.ProseMirror-selectednode {
          outline: 2px solid #007AFF;
          outline-offset: 1px;
          border-radius: 4px;
        }
      `}</style>
      <div
        className="sk-vorlage-editor"
        style={{
          padding: '8px 12px', flex: 1,
          fontFamily: "'Courier Prime', 'Courier New', monospace",
          fontSize: 12, lineHeight: 1.7, cursor: readOnly ? 'default' : 'text',
        }}
        onClick={() => !readOnly && editor?.chain().focus().run()}
      >
        <EditorContent editor={editor} />
      </div>

      {/* Legende */}
      {!readOnly && (
        <div style={{
          padding: '3px 8px', fontSize: 9, color: 'var(--text-muted)',
          borderTop: '1px solid var(--border)', background: 'var(--bg-subtle)',
          lineHeight: 1.4,
        }}>
          Enter = neue Zeile (leer = auto-ausgeblendet) · Tab = Einzug · Lineal: klicken = L-Tab setzen → C-Tab → R-Tab → entfernen
        </div>
      )}
    </div>
  )
}
