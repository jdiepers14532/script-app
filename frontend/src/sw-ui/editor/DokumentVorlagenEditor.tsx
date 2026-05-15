import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import { Extension, Node as TiptapNode, mergeAttributes as mergeAttrs } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import UnderlineExt from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import TextStyle from '@tiptap/extension-text-style'
import FontFamily from '@tiptap/extension-font-family'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import { ResizableImageExtension } from './extensions/ResizableImageExtension'
import { FontSizeExtension } from './extensions/FontSizeExtension'
import { ParagraphStyleExtension } from './extensions/ParagraphStyleExtension'
import { PlaceholderChipExtension, PLACEHOLDER_CHIP_CSS, getPlaceholdersForZone, getPlaceholderLabel, getPlaceholderColor } from './extensions/PlaceholderChipExtension'
import type { PlaceholderZone } from './extensions/PlaceholderChipExtension'

// ── CSS injection ─────────────────────────────────────────────────────────────
let chipCssInjected = false
function injectChipCss() {
  if (chipCssInjected) return
  chipCssInjected = true
  const style = document.createElement('style')
  style.id = 'placeholder-chip-css'
  style.textContent = PLACEHOLDER_CHIP_CSS + `
/* Prevent editor content from expanding its container horizontally */
.ProseMirror { overflow-x: hidden !important; max-width: 100%; box-sizing: border-box; font-family: "Courier New", monospace; }
.ProseMirror img { max-width: 100% !important; }

/* Reset browser-default paragraph margins so line-height is the sole spacing control */
.ProseMirror p { margin: 0; }

/* ── Table styles ── */
.ProseMirror table { border-collapse: collapse; width: 100%; margin: 4px 0; }
.ProseMirror td, .ProseMirror th {
  border: 1px solid #d0d0d0; padding: 5px 10px; vertical-align: top;
  min-width: 32px; position: relative; box-sizing: border-box;
}
.ProseMirror th { background: #f5f5f5; font-weight: 600; }
.ProseMirror .selectedCell { background: rgba(0,122,255,0.08) !important; outline: 2px solid #007AFF55; }
.ProseMirror .column-resize-handle {
  position: absolute; right: -2px; top: 0; bottom: 0; width: 6px;
  background: #007AFF88; cursor: col-resize; z-index: 20;
}
.ProseMirror.resize-cursor * { cursor: col-resize !important; }
.ProseMirror .tableWrapper { overflow-x: auto; }

/* ── Table border style variants ── */
.ProseMirror table[data-border-style="none"] td,
.ProseMirror table[data-border-style="none"] th { border: none; }
.ProseMirror table[data-border-style="thick"] td,
.ProseMirror table[data-border-style="thick"] th { border: 2px solid #333; }
.ProseMirror table[data-border-style="dashed"] td,
.ProseMirror table[data-border-style="dashed"] th { border: 1px dashed #888; }
.ProseMirror table[data-border-style="dotted"] td,
.ProseMirror table[data-border-style="dotted"] th { border: 1px dotted #888; }
.ProseMirror table[data-border-style="double"] td,
.ProseMirror table[data-border-style="double"] th { border: 3px double #555; }
`
  document.head.appendChild(style)
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface SeitenLayout {
  format: 'a4' | 'letter'
  margin_top: number
  margin_bottom: number
  margin_left: number
  margin_right: number
}

/** 3-column content for header / footer */
export interface ZeilenContent {
  links:  any | null  // ProseMirror JSON
  mitte:  any | null
  rechts: any | null
}

export interface DokumentVorlagenEditorValue {
  body_content:            any          // ProseMirror JSON
  kopfzeile_content:       ZeilenContent | null
  fusszeile_content:       ZeilenContent | null
  kopfzeile_aktiv:         boolean
  fusszeile_aktiv:         boolean
  erste_seite_kein_header: boolean
  seiten_layout:           SeitenLayout
}

/** Real values shown in the preview strip instead of placeholder keys */
export interface PreviewContext {
  produktion?:     string
  staffel?:        string
  block?:          string
  folge?:          string | number
  folgentitel?:    string
  werkstufe?:      string
  fassung?:        string
  version?:        string
  stand_datum?:    string
  autor?:          string
  regie?:          string
  firmenname?:     string
  sender?:              string
  buero_adresse?:       string
  sendedatum?:          string
  produktionszeitraum?: string
}

interface DokumentVorlagenEditorProps {
  value:    DokumentVorlagenEditorValue
  onChange: (v: DokumentVorlagenEditorValue) => void
  /** Only KZ/FZ editors — no body zone (global DK-Settings) */
  noBody?: boolean
  /** Only body — no KZ/FZ zones (Vorlagen-Tab context) */
  noHeaderFooter?: boolean
  readOnly?: boolean
  /** URL of production logo (from produktion.serienwerft.studio) */
  produktionsLogoUrl?: string | null
  /** Values shown in the preview strip to replace placeholders */
  previewContext?: PreviewContext
  /** Hides inline toolbars; reports active editor via onActiveEditorChange */
  sidebarMode?: boolean
  /** CSS zoom applied to the A4 page (e.g. 0.85 = 85%) */
  zoom?: number
  /** Called when the active Tiptap editor changes */
  onActiveEditorChange?: (editor: Editor | null, zone: PlaceholderZone) => void
}

const DEFAULT_LAYOUT: SeitenLayout = {
  format: 'a4', margin_top: 25, margin_bottom: 25, margin_left: 30, margin_right: 25,
}

const MM_TO_PX = 96 / 25.4
const A4_W_PX  = 794
const A4_H_PX  = 1123

type ColKey = 'links' | 'mitte' | 'rechts'
const COL_LABELS: Record<ColKey, string> = { links: 'Links', mitte: 'Mitte', rechts: 'Rechts' }

/** Normalize old single-doc format or null to ZeilenContent */
function normalizeZeile(c: any): ZeilenContent {
  if (!c) return { links: null, mitte: null, rechts: null }
  if ('links' in c || 'mitte' in c || 'rechts' in c) {
    return { links: c.links ?? null, mitte: c.mitte ?? null, rechts: c.rechts ?? null }
  }
  // Old single ProseMirror doc → put in links
  if (c?.type === 'doc') return { links: c, mitte: null, rechts: null }
  return { links: null, mitte: null, rechts: null }
}

const FONT_FAMILIES = [
  { value: 'Courier New',   label: 'Courier New' },
  { value: 'Arial',         label: 'Arial' },
  { value: 'Helvetica',     label: 'Helvetica' },
  { value: 'Times New Roman', label: 'Times New Roman' },
  { value: 'Georgia',       label: 'Georgia' },
  { value: 'Inter',         label: 'Inter' },
]
const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24]
const LINE_HEIGHTS = [
  { value: '1',    label: '1,0' },
  { value: '1.15', label: '1,15' },
  { value: '1.5',  label: '1,5' },
  { value: '1.75', label: '1,75' },
  { value: '2',    label: '2,0' },
  { value: '2.5',  label: '2,5' },
  { value: '3',    label: '3,0' },
]
const SPACE_AFTER_OPTIONS = [
  { value: '',      label: '—' },
  { value: '2px',   label: '2 px' },
  { value: '4px',   label: '4 px' },
  { value: '6px',   label: '6 px' },
  { value: '8px',   label: '8 px' },
  { value: '10px',  label: '10 px' },
  { value: '12px',  label: '12 px' },
  { value: '16px',  label: '16 px' },
  { value: '20px',  label: '20 px' },
  { value: '24px',  label: '24 px' },
]
const TABLE_BORDER_OPTIONS = [
  { value: 'default', label: 'Dünn (Standard)' },
  { value: 'thick',   label: 'Dick (2px)' },
  { value: 'dashed',  label: 'Gestrichelt' },
  { value: 'dotted',  label: 'Gepunktet' },
  { value: 'double',  label: 'Doppelt' },
  { value: 'none',    label: 'Keine Linien' },
]
const SPECIAL_CHARS = [
  { char: '©', title: 'Copyright' },
  { char: '®', title: 'Registered Trademark' },
  { char: '™', title: 'Trademark' },
]

// ── TableStyle extension — adds border-style + row-height attributes ──────────
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    tableStyle: {
      setTableBorderStyle: (style: string) => ReturnType
      setTableRowHeight:   (height: number | null) => ReturnType
    }
  }
}
const TableStyleExtension = Extension.create({
  name: 'tableStyle',
  addGlobalAttributes() {
    return [
      {
        types: ['table'],
        attributes: {
          borderStyle: {
            default: 'default',
            parseHTML: el => (el as HTMLElement).getAttribute('data-border-style') || 'default',
            renderHTML: attrs => attrs.borderStyle && attrs.borderStyle !== 'default'
              ? { 'data-border-style': attrs.borderStyle } : {},
          },
        },
      },
      {
        types: ['tableRow'],
        attributes: {
          rowHeight: {
            default: null,
            parseHTML: el => {
              const h = (el as HTMLElement).getAttribute('data-row-height')
              return h ? Number(h) : null
            },
            renderHTML: attrs => attrs.rowHeight
              ? { style: `height:${attrs.rowHeight}px`, 'data-row-height': String(attrs.rowHeight) }
              : {},
          },
        },
      },
    ]
  },
  addCommands() {
    return {
      setTableBorderStyle: (style: string) => ({ commands }: any) =>
        commands.updateAttributes('table', { borderStyle: style }),
      // updateAttributes('tableRow') won't work because the cursor is inside tableCell.
      // We must traverse up the node tree to find the enclosing tableRow.
      setTableRowHeight: (height: number | null) => ({ editor: ed, tr, dispatch }: any) => {
        const { $from } = ed.state.selection
        for (let d = $from.depth; d > 0; d--) {
          const node = $from.node(d)
          if (node.type.name === 'tableRow') {
            if (dispatch) dispatch(tr.setNodeMarkup($from.before(d), undefined, { ...node.attrs, rowHeight: height }))
            return true
          }
        }
        return false
      },
    } as any
  },
})

// ── Custom HR extension — horizontal rule with thickness + width attrs ────────
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    customHr: {
      setCustomHr: (attrs?: { thickness?: number; width?: number }) => ReturnType
    }
  }
}
const CustomHrExtension = TiptapNode.create({
  name: 'customHr',
  group: 'block',
  atom: true,
  addAttributes() {
    return {
      thickness: { default: 1 },
      width: { default: 100 },
    }
  },
  parseHTML() { return [{ tag: 'hr[data-hr]' }] },
  renderHTML({ HTMLAttributes }) {
    const t = HTMLAttributes.thickness ?? 1
    const w = HTMLAttributes.width ?? 100
    return ['hr', mergeAttrs(HTMLAttributes, {
      'data-hr': '1',
      style: `border:none;border-top:${t}px solid #555;width:${w}%;margin:8px auto;display:block`,
    })]
  },
  addCommands() {
    return {
      setCustomHr: (attrs?: { thickness?: number; width?: number }) =>
        ({ chain }: any) => chain().insertContent({ type: 'customHr', attrs: attrs ?? {} }).run(),
    } as any
  },
})

const TIPTAP_EXTENSIONS = [
  StarterKit.configure({ horizontalRule: false }),
  UnderlineExt,
  TextAlign.configure({ types: ['paragraph', 'heading'] }),
  TextStyle,
  FontFamily,
  FontSizeExtension,
  ParagraphStyleExtension,
  ResizableImageExtension,
  CustomHrExtension,
  PlaceholderChipExtension,
  Table.configure({ resizable: true }),
  TableRow,
  TableCell,
  TableHeader,
  TableStyleExtension,
]

// ── Single-zone editor (used for body) ───────────────────────────────────────
function ZoneEditor({
  initialContent, onChange, minHeight, readOnly, onEditorReady,
}: {
  initialContent: any
  onChange: (c: any) => void
  minHeight?: number
  readOnly?: boolean
  onEditorReady?: (e: Editor) => void
}) {
  const lastEmitted = useRef<string>('')
  const editor = useEditor({
    editable: !readOnly,
    extensions: TIPTAP_EXTENSIONS,
    content: initialContent || { type: 'doc', content: [{ type: 'paragraph' }] },
    onUpdate: ({ editor: e }) => {
      const json = JSON.stringify(e.getJSON())
      if (json !== lastEmitted.current) { lastEmitted.current = json; onChange(e.getJSON()) }
    },
  })
  useEffect(() => { if (editor) onEditorReady?.(editor) }, [editor])
  return (
    <div style={{ minHeight: minHeight ?? 60, overflowX: 'hidden', width: '100%' }}>
      {editor && (
        <EditorContent editor={editor} style={{ minHeight: minHeight ?? 60, fontSize: 13, lineHeight: 1.7, cursor: 'text', outline: 'none', overflowX: 'hidden', maxWidth: '100%' }} />
      )}
    </div>
  )
}

// ── Chip tooltip ───────────────────────────────────────────────────────────────
function ChipTooltip({ beschreibung, quelle, children }: { beschreibung: string; quelle: string; children: React.ReactNode }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  return (
    <span
      style={{ display: 'inline-flex' }}
      onMouseEnter={e => {
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
        setPos({ x: r.left + r.width / 2, y: r.top })
      }}
      onMouseLeave={() => setPos(null)}
    >
      {children}
      {pos && createPortal(
        <div style={{
          position: 'fixed', left: pos.x, top: pos.y - 8,
          transform: 'translate(-50%, -100%)',
          background: '#111', color: '#fff', fontSize: 11, lineHeight: 1.5,
          padding: '6px 10px', borderRadius: 6, maxWidth: 260, whiteSpace: 'pre-line',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)', zIndex: 99999, pointerEvents: 'none',
        }}>
          {beschreibung}{'\n'}<span style={{ color: '#aaa', fontSize: 10 }}>{'Quelle: ' + quelle}</span>
        </div>,
        document.body
      )}
    </span>
  )
}

// ── Shared toolbar ─────────────────────────────────────────────────────────────
export function ToolbarContent({
  editor, zone, produktionsLogoUrl, fileInputRef, isBody, wrap,
}: {
  editor: Editor | null
  zone?: PlaceholderZone
  produktionsLogoUrl?: string | null
  fileInputRef: React.RefObject<HTMLInputElement | null>
  isBody?: boolean
  /** Allow Row 1 to wrap (for sidebar layout) */
  wrap?: boolean
}) {
  // Re-render whenever editor selection / document changes
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!editor) return
    const h = () => setTick(n => n + 1)
    editor.on('selectionUpdate', h)
    editor.on('transaction', h)
    return () => { editor.off('selectionUpdate', h); editor.off('transaction', h) }
  }, [editor])

  const [imgLoading, setImgLoading] = useState<string | null>(null)
  const [hrThickness, setHrThickness] = useState(1)
  const [hrWidth, setHrWidth] = useState(100)

  // Detect if cursor is on a customHr node — read its attrs into the selects
  const isOnHr = editor?.isActive('customHr') ?? false
  const hrNodeAttrs = isOnHr ? (editor?.getAttributes('customHr') ?? {}) : {}
  const displayHrThickness = isOnHr ? (hrNodeAttrs.thickness ?? hrThickness) : hrThickness
  const displayHrWidth     = isOnHr ? (hrNodeAttrs.width     ?? hrWidth)     : hrWidth

  const insertImg = useCallback((src: string) => {
    ;(editor as any)?.chain().focus().setResizableImage({ src, width: 120 }).run()
  }, [editor])

  const loadFirmenlogo = async () => {
    setImgLoading('firma')
    try {
      const res  = await fetch('https://auth.serienwerft.studio/api/public/company-info')
      const data = await res.json()
      const url  = data?.logos?.light ?? data?.logo_url
      if (!url) { alert('Kein Firmenlogo konfiguriert.'); return }
      insertImg(url)
    } catch { alert('Firmenlogo konnte nicht geladen werden.') }
    finally { setImgLoading(null) }
  }

  const chips = zone ? getPlaceholdersForZone(zone) : []

  // Chip selected? (atom NodeSelection) — for rendering only
  const isChipSelected = editor?.isActive('placeholder_chip') ?? false
  const chipAttrs      = isChipSelected ? (editor?.getAttributes('placeholder_chip') ?? {}) : {}

  // Ref captures chip-selected state onMouseDown of selects (BEFORE editor loses focus)
  const chipSnap = useRef(false)

  // Helper: live check at callback time (for buttons — editor keeps focus via preventDefault)
  const liveChipSelected = () => editor?.isActive('placeholder_chip') ?? false

  const paraAttrsRaw   = editor?.getAttributes('paragraph') ?? {}
  const curFontFamily  = isChipSelected ? (chipAttrs.fontFamily  ?? '') : (paraAttrsRaw.fontFamily  ?? '')
  const curFontSize    = isChipSelected ? (chipAttrs.fontSize    ?? '') : (paraAttrsRaw.fontSize    ?? '')
  const curLineHeight  = paraAttrsRaw.lineHeight  ?? ''
  const curSpaceAfter  = paraAttrsRaw.spaceAfter  ?? ''

  // getAttributes('tableRow') won't work (cursor is in tableCell) — traverse up instead
  const curRowHeight = (() => {
    if (!editor) return ''
    const { $from } = editor.state.selection
    for (let d = $from.depth; d > 0; d--) {
      const node = $from.node(d)
      if (node.type.name === 'tableRow') return node.attrs.rowHeight ?? ''
    }
    return ''
  })()

  // B/I/U: chip selected → read/write chip attrs; otherwise text marks + paragraph attrs
  const isBold      = isChipSelected
    ? chipAttrs.fontWeight === 'bold'
    : ((editor?.isActive('bold') ?? false) || paraAttrsRaw.fontWeight === 'bold')
  const isItalic    = isChipSelected
    ? chipAttrs.fontStyle === 'italic'
    : ((editor?.isActive('italic') ?? false) || paraAttrsRaw.fontStyle === 'italic')
  const isUnderline = isChipSelected
    ? chipAttrs.textDecoration === 'underline'
    : ((editor?.isActive('underline') ?? false) || paraAttrsRaw.textDecoration === 'underline')

  const toggleBold = () => {
    if (liveChipSelected()) {
      const cur = editor?.getAttributes('placeholder_chip').fontWeight === 'bold'
      editor?.chain().focus().updateAttributes('placeholder_chip', { fontWeight: cur ? null : 'bold' }).run()
    } else {
      const next = !isBold
      editor?.chain().focus().toggleBold().updateAttributes('paragraph', { fontWeight: next ? 'bold' : null }).run()
    }
  }
  const toggleItalic = () => {
    if (liveChipSelected()) {
      const cur = editor?.getAttributes('placeholder_chip').fontStyle === 'italic'
      editor?.chain().focus().updateAttributes('placeholder_chip', { fontStyle: cur ? null : 'italic' }).run()
    } else {
      const next = !isItalic
      editor?.chain().focus().toggleItalic().updateAttributes('paragraph', { fontStyle: next ? 'italic' : null }).run()
    }
  }
  const toggleUnderline = () => {
    if (liveChipSelected()) {
      const cur = editor?.getAttributes('placeholder_chip').textDecoration === 'underline'
      editor?.chain().focus().updateAttributes('placeholder_chip', { textDecoration: cur ? null : 'underline' }).run()
    } else {
      const next = !isUnderline
      editor?.chain().focus().toggleUnderline().updateAttributes('paragraph', { textDecoration: next ? 'underline' : null }).run()
    }
  }

  const fmtBtn = (label: string, active: boolean, cb: () => void, title: string, extra?: React.CSSProperties) => (
    <button
      key={title}
      title={title}
      disabled={!editor}
      onMouseDown={e => { e.preventDefault(); cb() }}
      style={{
        width: 24, height: 24, border: '1px solid var(--border)', borderRadius: 4,
        background: active ? 'var(--text-primary)' : 'transparent',
        color: active ? 'var(--text-inverse)' : editor ? 'var(--text-secondary)' : 'var(--text-muted)',
        cursor: editor ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, flexShrink: 0, fontFamily: 'inherit', ...extra,
      }}
    >{label}</button>
  )

  const sep = (key: string) => (
    <div key={key} style={{ width: 1, height: 14, background: 'var(--border)', margin: '0 2px', flexShrink: 0 }} />
  )

  const imgBtnStyle: React.CSSProperties = {
    fontSize: 10, padding: '2px 5px', borderRadius: 4, border: '1px solid var(--border)',
    background: 'transparent', cursor: editor ? 'pointer' : 'default',
    fontFamily: 'inherit', color: 'var(--text-secondary)', whiteSpace: 'nowrap', flexShrink: 0,
  }

  return (
    <>
      {/* ── Row 1: Formatting tools ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: wrap ? 'wrap' : 'nowrap', padding: '4px 8px', minHeight: 32 }}>
        {fmtBtn('B', isBold,      toggleBold,      'Fett',          { fontWeight: 700 })}
        {fmtBtn('I', isItalic,    toggleItalic,    'Kursiv',        { fontStyle: 'italic' })}
        {fmtBtn('U', isUnderline, toggleUnderline, 'Unterstrichen', { textDecoration: 'underline' })}
        {sep('sep-align')}
        {fmtBtn('≡L', editor?.isActive({ textAlign: 'left' })   ?? false, () => editor?.chain().focus().setTextAlign('left').run(),   'Linksbündig')}
        {fmtBtn('≡M', editor?.isActive({ textAlign: 'center' }) ?? false, () => editor?.chain().focus().setTextAlign('center').run(), 'Zentriert')}
        {fmtBtn('≡R', editor?.isActive({ textAlign: 'right' })  ?? false, () => editor?.chain().focus().setTextAlign('right').run(),  'Rechtsbündig')}
        {sep('sep-font')}
        <select
          value={curFontFamily}
          onMouseDown={() => { chipSnap.current = liveChipSelected() }}
          onChange={e => {
            const v = e.target.value || null
            if (chipSnap.current) editor?.chain().focus().updateAttributes('placeholder_chip', { fontFamily: v }).run()
            else editor?.chain().setParagraphFont(v).run()
          }}
          disabled={!editor}
          title={isChipSelected ? 'Schriftart (Chip)' : 'Schriftart (gesamte Zeile)'}
          style={{ fontSize: 10, height: 24, borderRadius: 4, border: `1px solid ${isChipSelected ? '#007AFF' : 'var(--border)'}`, background: 'var(--bg-subtle)', fontFamily: 'inherit', color: 'var(--text-secondary)', width: 88, flexShrink: 0 }}
        >
          <option value="">— Schrift —</option>
          {FONT_FAMILIES.map(f => <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>{f.label}</option>)}
        </select>
        <select
          value={curFontSize}
          onMouseDown={() => { chipSnap.current = liveChipSelected() }}
          onChange={e => {
            const v = e.target.value || null
            if (chipSnap.current) editor?.chain().focus().updateAttributes('placeholder_chip', { fontSize: v }).run()
            else editor?.chain().setParagraphFontSize(v).run()
          }}
          disabled={!editor}
          title={isChipSelected ? 'Schriftgröße (Chip)' : 'Schriftgröße (gesamte Zeile)'}
          style={{ fontSize: 10, height: 24, borderRadius: 4, border: `1px solid ${isChipSelected ? '#007AFF' : 'var(--border)'}`, background: 'var(--bg-subtle)', fontFamily: 'inherit', color: 'var(--text-secondary)', width: 48, flexShrink: 0 }}
        >
          <option value="">Pt</option>
          {FONT_SIZES.map(s => <option key={s} value={`${s}pt`}>{s}</option>)}
        </select>
        {isChipSelected && (
          <span style={{ fontSize: 9, color: '#007AFF', background: '#007AFF15', border: '1px solid #007AFF44', borderRadius: 4, padding: '1px 5px', flexShrink: 0, whiteSpace: 'nowrap' }}>
            Chip-Format
          </span>
        )}
        <select
          value={curLineHeight}
          onChange={e => editor?.chain().setParagraphLineHeight(e.target.value || null).run()}
          disabled={!editor}
          title="Zeilenabstand"
          style={{ fontSize: 10, height: 24, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-subtle)', fontFamily: 'inherit', color: 'var(--text-secondary)', width: 54, flexShrink: 0 }}
        >
          <option value="">≡ Abs.</option>
          {LINE_HEIGHTS.map(lh => <option key={lh.value} value={lh.value}>{lh.label}</option>)}
        </select>
        <select
          value={curSpaceAfter}
          onChange={e => editor?.chain().setParagraphSpaceAfter(e.target.value || null).run()}
          disabled={!editor}
          title="Abstand nach Absatz"
          style={{ fontSize: 10, height: 24, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-subtle)', fontFamily: 'inherit', color: 'var(--text-secondary)', width: 54, flexShrink: 0 }}
        >
          {SPACE_AFTER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.value ? o.label : '↕ nach'}</option>)}
        </select>
        {sep('sep-chars')}
        {SPECIAL_CHARS.map(({ char, title }) =>
          fmtBtn(char, false, () => editor?.chain().focus().insertContent(char).run(), title, { fontWeight: 400, fontSize: 12 })
        )}
        {sep('sep-img')}
        <button
          disabled={!editor || !!imgLoading}
          onMouseDown={e => { e.preventDefault(); loadFirmenlogo() }}
          style={imgBtnStyle}
          title="Firmenlogo einfügen"
        >{imgLoading === 'firma' ? '…' : 'Logo'}</button>
        <button
          disabled={!editor || !produktionsLogoUrl || !!imgLoading}
          onMouseDown={e => { e.preventDefault(); if (produktionsLogoUrl) insertImg(produktionsLogoUrl) }}
          style={{ ...imgBtnStyle, opacity: produktionsLogoUrl ? 1 : 0.4 }}
          title="Produktionslogo einfügen"
        >{imgLoading === 'prod' ? '…' : 'Prod.'}</button>
        <button
          disabled={!editor}
          onMouseDown={e => { e.preventDefault(); fileInputRef.current?.click() }}
          style={imgBtnStyle}
          title="Bild aus Datei einfügen"
        >↑ Bild</button>
        {sep('sep-table')}
        {fmtBtn('⊞', false, () => editor?.chain().focus().insertTable({ rows: 3, cols: 2, withHeaderRow: false }).run(), 'Tabelle einfügen (3×2)', { fontSize: 14 })}
        {sep('sep-hr')}
        <button
          disabled={!editor}
          onMouseDown={e => {
            e.preventDefault()
            ;(editor as any)?.chain().focus().setCustomHr({ thickness: displayHrThickness, width: displayHrWidth }).run()
          }}
          style={{ ...imgBtnStyle, fontSize: 12, border: isOnHr ? '1px solid #007AFF88' : undefined }}
          title={isOnHr ? `Neue Linie einfügen (${displayHrThickness}px, ${displayHrWidth}%)` : `Linie einfügen (${displayHrThickness}px, ${displayHrWidth}%)`}
        >—</button>
        <select
          value={displayHrThickness}
          onChange={e => {
            const val = Number(e.target.value)
            setHrThickness(val)
            if (isOnHr) editor?.chain().focus().updateAttributes('customHr', { thickness: val }).run()
          }}
          title={isOnHr ? 'Linienstärke (ändert gewählte Linie)' : 'Linienstärke'}
          style={{ fontSize: 10, height: 24, borderRadius: 4, border: `1px solid ${isOnHr ? '#007AFF88' : 'var(--border)'}`, background: 'var(--bg-subtle)', fontFamily: 'inherit', color: 'var(--text-secondary)', width: 44, flexShrink: 0 }}
        >
          {[1,2,3,4,5].map(t => <option key={t} value={t}>{t}px</option>)}
        </select>
        <select
          value={displayHrWidth}
          onChange={e => {
            const val = Number(e.target.value)
            setHrWidth(val)
            if (isOnHr) editor?.chain().focus().updateAttributes('customHr', { width: val }).run()
          }}
          title={isOnHr ? 'Linienbreite (ändert gewählte Linie)' : 'Linienbreite'}
          style={{ fontSize: 10, height: 24, borderRadius: 4, border: `1px solid ${isOnHr ? '#007AFF88' : 'var(--border)'}`, background: 'var(--bg-subtle)', fontFamily: 'inherit', color: 'var(--text-secondary)', width: 46, flexShrink: 0 }}
        >
          {[25,50,75,100].map(w => <option key={w} value={w}>{w}%</option>)}
        </select>
        {!editor && !isBody && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4, flexShrink: 0 }}>
            ← Bereich anklicken
          </span>
        )}
      </div>

      {/* ── Row 2: Table controls — only when cursor is inside a table ── */}
      {editor?.isActive('table') && (
        <div style={{
          display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 3,
          padding: '4px 8px', borderTop: '1px solid var(--border)', background: '#007AFF08',
        }}>
          <span style={{ fontSize: 10, color: '#007AFF', fontWeight: 600, flexShrink: 0, marginRight: 2 }}>Tabelle:</span>
          {([
            ['+ Zeile oben',   () => editor.chain().focus().addRowBefore().run()],
            ['+ Zeile unten',  () => editor.chain().focus().addRowAfter().run()],
            ['− Zeile',        () => editor.chain().focus().deleteRow().run()],
            ['+ Spalte li.',   () => editor.chain().focus().addColumnBefore().run()],
            ['+ Spalte re.',   () => editor.chain().focus().addColumnAfter().run()],
            ['− Spalte',       () => editor.chain().focus().deleteColumn().run()],
            ['Verbinden',      () => editor.chain().focus().mergeCells().run()],
            ['Trennen',        () => editor.chain().focus().splitCell().run()],
          ] as [string, () => void][]).map(([label, action]) => (
            <button
              key={label}
              onMouseDown={e => { e.preventDefault(); action() }}
              style={{ fontSize: 10, padding: '2px 5px', borderRadius: 4, border: '1px solid #007AFF44', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', color: '#007AFF', whiteSpace: 'nowrap', flexShrink: 0 }}
              title={label}
            >{label}</button>
          ))}
          <button
            onMouseDown={e => { e.preventDefault(); editor.chain().focus().deleteTable().run() }}
            style={{ fontSize: 10, padding: '2px 5px', borderRadius: 4, border: '1px solid #FF3B3044', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', color: '#FF3B30', whiteSpace: 'nowrap', flexShrink: 0, marginLeft: 4 }}
            title="Tabelle löschen"
          >✕ Tabelle</button>
          <div style={{ width: 1, height: 14, background: 'var(--border)', margin: '0 4px', flexShrink: 0 }} />
          <span style={{ fontSize: 10, color: '#007AFF', fontWeight: 600, flexShrink: 0 }}>Rahmen:</span>
          <select
            value={editor?.getAttributes('table').borderStyle ?? 'default'}
            onChange={e => editor?.chain().focus().setTableBorderStyle(e.target.value).run()}
            style={{ fontSize: 10, height: 22, borderRadius: 4, border: '1px solid #007AFF44', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', color: '#007AFF', flexShrink: 0 }}
          >
            {TABLE_BORDER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <div style={{ width: 1, height: 14, background: 'var(--border)', margin: '0 4px', flexShrink: 0 }} />
          <span style={{ fontSize: 10, color: '#007AFF', fontWeight: 600, flexShrink: 0 }}>Zeilenhöhe:</span>
          <input
            type="number"
            min={20}
            max={300}
            step={4}
            value={curRowHeight}
            onChange={e => {
              const v = e.target.value ? Number(e.target.value) : null
              editor?.chain().focus().setTableRowHeight(v).run()
            }}
            placeholder="auto"
            title="Zeilenhöhe in Pixel (leer = automatisch)"
            style={{ fontSize: 10, height: 22, width: 58, borderRadius: 4, border: '1px solid #007AFF44', background: 'transparent', fontFamily: 'inherit', color: '#007AFF', padding: '0 4px', flexShrink: 0 }}
          />
        </div>
      )}

      {/* ── Row 3: Placeholder chips ── */}
      {chips.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 3,
          padding: '4px 8px', borderTop: '1px solid var(--border)',
        }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0, userSelect: 'none' }}>Chips:</span>
          {chips.map(p => (
            <ChipTooltip key={p.key} beschreibung={p.beschreibung} quelle={p.quelle}>
              <button
                disabled={!editor}
                onMouseDown={e => { e.preventDefault(); if (editor) editor.chain().focus().insertPlaceholderChip(p.key).run() }}
                style={{
                  display: 'inline-flex', alignItems: 'center',
                  background: p.color + '1A', color: p.color, border: `1px solid ${p.color}55`,
                  borderRadius: 4, fontSize: 10, fontWeight: 600, padding: '2px 6px',
                  cursor: editor ? 'pointer' : 'default', fontFamily: 'inherit',
                  whiteSpace: 'nowrap', flexShrink: 0, opacity: editor ? 1 : 0.4,
                }}
              >{p.label}</button>
            </ChipTooltip>
          ))}
        </div>
      )}
    </>
  )
}

// ── Toolbar wrapper ────────────────────────────────────────────────────────────
const TOOLBAR_STYLE: React.CSSProperties = {
  display: 'flex', flexDirection: 'column',
  borderBottom: '1px solid var(--border)', background: 'var(--bg-subtle)',
  flexShrink: 0,
}

function SharedColumnToolbar({
  editor, zone, produktionsLogoUrl, fileInputRef,
}: {
  editor: Editor | null
  zone: PlaceholderZone
  produktionsLogoUrl?: string | null
  fileInputRef: React.RefObject<HTMLInputElement | null>
}) {
  return (
    <div style={TOOLBAR_STYLE}>
      <ToolbarContent editor={editor} zone={zone} produktionsLogoUrl={produktionsLogoUrl} fileInputRef={fileInputRef} />
    </div>
  )
}

function BodyToolbar({ editor, produktionsLogoUrl, fileInputRef, zone }: {
  editor: Editor | null
  produktionsLogoUrl?: string | null
  fileInputRef: React.RefObject<HTMLInputElement | null>
  zone?: PlaceholderZone
}) {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!editor) return
    const h = () => setTick(n => n + 1)
    editor.on('selectionUpdate', h); editor.on('transaction', h)
    return () => { editor.off('selectionUpdate', h); editor.off('transaction', h) }
  }, [editor])

  return (
    <div style={TOOLBAR_STYLE}>
      <ToolbarContent editor={editor} zone={zone} produktionsLogoUrl={produktionsLogoUrl} fileInputRef={fileInputRef} isBody />
    </div>
  )
}

// ── Three-column zone editor (for KZ / FZ) ───────────────────────────────────
function ThreeColumnZone({
  label, color, aktiv, ersteSeiteOhne, ersteSeiteOhneLabel,
  content, readOnly, produktionsLogoUrl, zone, previewContext,
  onAktivChange, onErsteSeiteOhneChange, onChange,
}: {
  label: string
  color: string
  aktiv: boolean
  ersteSeiteOhne?: boolean
  ersteSeiteOhneLabel?: string
  content: ZeilenContent
  readOnly?: boolean
  produktionsLogoUrl?: string | null
  zone: PlaceholderZone
  previewContext?: PreviewContext
  onAktivChange: (v: boolean) => void
  onErsteSeiteOhneChange?: (v: boolean) => void
  onChange: (c: ZeilenContent) => void
}) {
  const [activeCol, setActiveCol] = useState<ColKey>('links')
  const editorsRef = useRef<Record<ColKey, Editor | null>>({ links: null, mitte: null, rechts: null })
  const [, setTick] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleEditorReady = (col: ColKey, ed: Editor) => {
    editorsRef.current[col] = ed
    ed.on('selectionUpdate', () => setTick(n => n + 1))
    ed.on('transaction',     () => setTick(n => n + 1))
  }

  const switchCol = (col: ColKey) => {
    setActiveCol(col)
    setTimeout(() => editorsRef.current[col]?.commands.focus(), 30)
  }

  const activeEditor = editorsRef.current[activeCol]

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const ed = editorsRef.current[activeCol]
    if (!ed) return
    const reader = new FileReader()
    reader.onloadend = () => {
      ;(ed as any).chain().focus().setResizableImage({ src: reader.result as string, width: 200 }).run()
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const cols: ColKey[] = ['links', 'mitte', 'rechts']
  const COL_ALIGN: Record<ColKey, React.CSSProperties['textAlign']> = { links: 'left', mitte: 'center', rechts: 'right' }
  const toggleStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, cursor: 'pointer' }

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color, flex: 1 }}>{label}</label>
        <label style={toggleStyle}>
          <input type="checkbox" checked={aktiv} onChange={e => onAktivChange(e.target.checked)} />
          Aktiv
        </label>
        {ersteSeiteOhneLabel && onErsteSeiteOhneChange && (
          <label style={toggleStyle}>
            <input type="checkbox" checked={!!ersteSeiteOhne} onChange={e => onErsteSeiteOhneChange(e.target.checked)} />
            {ersteSeiteOhneLabel}
          </label>
        )}
      </div>

      {aktiv && (
        <div style={{ border: `1px solid ${color}44`, borderRadius: 6, overflow: 'hidden', display: 'flex', flexDirection: 'column', maxWidth: '100%' }}>

          <div style={{ display: 'flex', flexShrink: 0, background: 'var(--bg-subtle)', borderBottom: `1px solid ${color}22` }}>
            {cols.map(col => (
              <button
                key={col}
                onMouseDown={e => { e.preventDefault(); switchCol(col) }}
                style={{
                  flex: 1, padding: '7px 8px', border: 'none', cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: 11,
                  fontWeight: activeCol === col ? 700 : 400,
                  background: activeCol === col ? `${color}12` : 'transparent',
                  color:      activeCol === col ? color : 'var(--text-secondary)',
                  borderBottom: `2px solid ${activeCol === col ? color : 'transparent'}`,
                  textAlign: COL_ALIGN[col],
                  transition: 'all 0.12s',
                }}
              >
                {COL_LABELS[col]}
              </button>
            ))}
          </div>

          <SharedColumnToolbar
            editor={activeEditor}
            zone={zone}
            produktionsLogoUrl={produktionsLogoUrl}
            fileInputRef={fileRef}
          />
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />

          {cols.map(col => (
            <div
              key={col}
              style={{
                display: activeCol === col ? 'block' : 'none',
                padding: '10px 14px',
                minHeight: 56,
                maxHeight: 160,
                overflowY: 'auto',
                background: 'white',
                minWidth: 0,
                maxWidth: '100%',
                boxSizing: 'border-box',
              }}
            >
              <ZoneEditor
                key={col}
                initialContent={content[col]}
                onChange={doc => onChange({ ...content, [col]: doc })}
                readOnly={readOnly}
                onEditorReady={ed => handleEditorReady(col, ed)}
              />
            </div>
          ))}

          <div style={{ borderTop: `1px solid ${color}22`, background: `${color}05`, padding: '6px 10px' }}>
            <div style={{ fontSize: 9, color: `${color}77`, marginBottom: 3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Vorschau
            </div>
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
              background: 'white', border: `1px solid ${color}22`,
              borderRadius: 3, padding: '5px 10px', minHeight: 28,
            }}>
              <PreviewCell content={content.links}  align="left"   color={color} ctx={previewContext} />
              <PreviewCell content={content.mitte}  align="center" color={color} ctx={previewContext} />
              <PreviewCell content={content.rechts} align="right"  color={color} ctx={previewContext} />
            </div>
          </div>

        </div>
      )}
    </div>
  )
}

// ── Preview: ProseMirror JSON → HTML ──────────────────────────────────────────

const PREVIEW_CONTEXT_MAP: Record<string, keyof PreviewContext> = {
  '{{produktion}}':    'produktion',
  '{{staffel}}':       'staffel',
  '{{block}}':         'block',
  '{{folge}}':         'folge',
  '{{folgentitel}}':   'folgentitel',
  '{{werkstufe}}':     'werkstufe',
  '{{fassung}}':       'fassung',
  '{{version}}':       'version',
  '{{stand_datum}}':   'stand_datum',
  '{{autor}}':         'autor',
  '{{regie}}':         'regie',
  '{{firmenname}}':    'firmenname',
  '{{sender}}':        'sender',
  '{{buero_adresse}}':       'buero_adresse',
  '{{sendedatum}}':          'sendedatum',
  '{{produktionszeitraum}}': 'produktionszeitraum',
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function renderPmToPreviewHtml(doc: any, ctx?: PreviewContext): string {
  if (!doc) return ''

  type ParaFont = { ff?: string|null; fs?: string|null; fw?: string|null; fst?: string|null; td?: string|null; lh?: string|null }

  function renderInline(node: any, paraFont?: ParaFont): string {
    if (!node) return ''

    if (node.type === 'text') {
      let t = escHtml(node.text ?? '')
      const inlineStyles: string[] = []
      for (const mark of (node.marks ?? [])) {
        if (mark.type === 'bold')           t = `<strong>${t}</strong>`
        else if (mark.type === 'italic')    t = `<em>${t}</em>`
        else if (mark.type === 'underline') t = `<u>${t}</u>`
        else if (mark.type === 'strike')    t = `<s>${t}</s>`
        else if (mark.type === 'textStyle') {
          if (mark.attrs?.fontFamily) inlineStyles.push(`font-family:${mark.attrs.fontFamily}`)
          if (mark.attrs?.fontSize)   inlineStyles.push(`font-size:${mark.attrs.fontSize}`)
        }
      }
      if (inlineStyles.length) t = `<span style="${inlineStyles.join(';')}">${t}</span>`
      return t
    }

    if (node.type === 'placeholder_chip') {
      const key   = node.attrs?.key ?? ''
      const field = PREVIEW_CONTEXT_MAP[key]
      const color = getPlaceholderColor(key)
      const label = getPlaceholderLabel(key)
      // Chip's own attrs override paragraph-level defaults
      const ca = node.attrs ?? {}
      const ff  = ca.fontFamily     || paraFont?.ff  || null
      const fs  = ca.fontSize       || paraFont?.fs  || null
      const fw  = ca.fontWeight     || paraFont?.fw  || null
      const fst = ca.fontStyle      || paraFont?.fst || null
      const td  = ca.textDecoration || paraFont?.td  || null
      const chipStyles: string[] = []
      if (ff)  chipStyles.push(`font-family:${ff}`)
      if (fs)  chipStyles.push(`font-size:${fs}`)
      if (fw)  chipStyles.push(`font-weight:${fw}`)
      if (fst) chipStyles.push(`font-style:${fst}`)
      if (td)  chipStyles.push(`text-decoration:${td}`)
      const fStr = chipStyles.length ? chipStyles.join(';') + ';' : ''
      if (field && ctx?.[field] != null) {
        return `<span style="${fStr}">${escHtml(String(ctx[field]))}</span>`
      }
      return `<span style="${fStr}background:${color}22;color:${color};border:1px solid ${color}55;border-radius:3px;padding:1px 4px;white-space:nowrap">${escHtml(label)}</span>`
    }

    if (node.type === 'hardBreak') return '<br>'

    if (node.type === 'resizable_image') {
      const src = node.attrs?.src ?? ''
      const w   = Number(node.attrs?.width) || 60
      const flt = node.attrs?.float
      const floatStyle = flt === 'left'   ? ';float:left;margin-right:8px'
                       : flt === 'right'  ? ';float:right;margin-left:8px'
                       : flt === 'center' ? ';display:block;margin-left:auto;margin-right:auto'
                       : ';display:block;margin:4px 0'
      return `<img src="${src}" style="width:${w}px;max-width:100%;vertical-align:middle${floatStyle}" />`
    }

    return (node.content ?? []).map((n: any) => renderInline(n, paraFont)).join('')
  }

  function renderBlock(node: any): string {
    if (node.type === 'table') {
      const borderStyle = node.attrs?.borderStyle ?? 'default'
      const cellBorder = borderStyle === 'none'   ? 'border:none'
        : borderStyle === 'thick'  ? 'border:2px solid #333'
        : borderStyle === 'dashed' ? 'border:1px dashed #888'
        : borderStyle === 'dotted' ? 'border:1px dotted #888'
        : borderStyle === 'double' ? 'border:3px double #555'
        : 'border:1px solid #d0d0d0'
      // Check if any cell has a fixed colwidth → use table-layout:fixed for accurate column sizing
      const firstRow = node.content?.[0]
      const hasColWidths = firstRow?.content?.some((c: any) => c.attrs?.colwidth?.[0])
      const tableLayout = hasColWidths ? 'table-layout:fixed;' : ''
      const rows = (node.content ?? []).map((row: any) => {
        const rh = row.attrs?.rowHeight
        const rowStyle = rh ? ` style="height:${rh}px"` : ''
        const cells = (row.content ?? []).map((cell: any) => {
          const isHeader = cell.type === 'tableHeader'
          const tag      = isHeader ? 'th' : 'td'
          const extra    = isHeader ? 'background:#f5f5f5;font-weight:600;' : ''
          const cw       = cell.attrs?.colwidth?.[0]
          const widthStr = cw ? `width:${cw}px;` : ''
          const colspan  = cell.attrs?.colspan  && cell.attrs.colspan  > 1 ? ` colspan="${cell.attrs.colspan}"`  : ''
          const rowspan  = cell.attrs?.rowspan  && cell.attrs.rowspan  > 1 ? ` rowspan="${cell.attrs.rowspan}"`  : ''
          const inner    = (cell.content ?? []).map((n: any) => renderBlock(n)).join('')
          return `<${tag}${colspan}${rowspan} style="${widthStr}${cellBorder};padding:5px 10px;vertical-align:top;${extra}">${inner}</${tag}>`
        }).join('')
        return `<tr${rowStyle}>${cells}</tr>`
      }).join('')
      return `<table style="border-collapse:collapse;${tableLayout}width:100%;margin:4px 0"><tbody>${rows}</tbody></table>`
    }

    if (node.type === 'horizontalRule') return '<hr style="border:none;border-top:1px solid #d0d0d0;width:100%;margin:8px 0">'
    if (node.type === 'customHr') {
      const t = node.attrs?.thickness ?? 1
      const w = node.attrs?.width ?? 100
      return `<hr style="border:none;border-top:${t}px solid #555;width:${w}%;margin:8px auto;display:block">`
    }

    if (node.type === 'bulletList') {
      const items = (node.content ?? []).map((li: any) =>
        `<li>${(li.content ?? []).map(renderBlock).join('')}</li>`
      ).join('')
      return `<ul style="margin:4px 0;padding-left:20px">${items}</ul>`
    }

    if (node.type === 'orderedList') {
      const items = (node.content ?? []).map((li: any) =>
        `<li>${(li.content ?? []).map(renderBlock).join('')}</li>`
      ).join('')
      return `<ol style="margin:4px 0;padding-left:20px">${items}</ol>`
    }

    if (node.type === 'heading') {
      const level = node.attrs?.level ?? 2
      const inner = (node.content ?? []).map((n: any) => renderInline(n)).join('')
      return `<h${level} style="margin:8px 0 4px">${inner}</h${level}>`
    }

    if (node.type === 'paragraph') {
      const align = node.attrs?.textAlign
      const ff    = node.attrs?.fontFamily     || null
      const fs    = node.attrs?.fontSize       || null
      const fw    = node.attrs?.fontWeight     || null
      const fst   = node.attrs?.fontStyle      || null
      const td    = node.attrs?.textDecoration || null
      const lh    = node.attrs?.lineHeight     || null
      const sa    = node.attrs?.spaceAfter     || null
      const styles: string[] = []
      if (align && align !== 'left') styles.push(`text-align:${align}`)
      if (ff)  styles.push(`font-family:${ff}`)
      if (fs)  styles.push(`font-size:${fs}`)
      if (fw)  styles.push(`font-weight:${fw}`)
      if (fst) styles.push(`font-style:${fst}`)
      if (td)  styles.push(`text-decoration:${td}`)
      if (lh)  styles.push(`line-height:${lh}`)
      if (sa)  styles.push(`margin-bottom:${sa}`)
      if (!node.content?.length) styles.push('min-height:1.2em')
      const style = styles.length ? ` style="${styles.join(';')}"` : ''
      const inner = (node.content ?? []).map((n: any) => renderInline(n, { ff, fs, fw, fst, td, lh })).join('')
      return `<div${style}>${inner || '&nbsp;'}</div>`
    }
    return (node.content ?? []).map(renderBlock).join('')
  }

  const root = doc.type === 'doc' ? doc : { content: [doc] }
  return (root.content ?? []).map(renderBlock).join('')
}

function PreviewCell({ content, align, color, ctx }: {
  content: any; align: string; color: string; ctx?: PreviewContext
}) {
  const html = renderPmToPreviewHtml(content, ctx)
  if (!html) {
    return <div style={{ textAlign: align as any, fontSize: 10, color: `${color}44`, minHeight: 16 }}>—</div>
  }
  return (
    <div
      style={{ textAlign: align as any, fontSize: 10, lineHeight: 1.5, minHeight: 16 }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function DokumentVorlagenEditor({
  value, onChange, noBody = false, noHeaderFooter = false, readOnly = false,
  produktionsLogoUrl, previewContext,
  sidebarMode = false, zoom, onActiveEditorChange,
}: DokumentVorlagenEditorProps) {
  useEffect(() => { injectChipCss() }, [])

  const layout: SeitenLayout = value.seiten_layout ?? DEFAULT_LAYOUT
  // Format-based page dimensions (96 DPI): A4 = 210×297mm, Letter = 8.5×11in
  const pageDims = layout.format === 'letter'
    ? { wPx: 816, hPx: 1056 }
    : { wPx: 794, hPx: 1123 }
  const marginLeftPx   = Math.round(layout.margin_left   * MM_TO_PX)
  const marginRightPx  = Math.round(layout.margin_right  * MM_TO_PX)
  const marginTopPx    = Math.round(layout.margin_top    * MM_TO_PX)
  const marginBottomPx = Math.round(layout.margin_bottom * MM_TO_PX)

  const [bodyEditor, setBodyEditor] = useState<Editor | null>(null)
  const bodyFileRef = useRef<HTMLInputElement>(null)

  const update = useCallback((patch: Partial<DokumentVorlagenEditorValue>) => {
    onChange({ ...value, ...patch })
  }, [value, onChange])

  const kzContent = normalizeZeile(value.kopfzeile_content)
  const fzContent = normalizeZeile(value.fusszeile_content)

  const handleBodyFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !bodyEditor) return
    const reader = new FileReader()
    reader.onloadend = () => {
      ;(bodyEditor as any).chain().focus().setResizableImage({ src: reader.result as string, width: 200 }).run()
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  return (
    <div style={{ background: noHeaderFooter || sidebarMode ? 'transparent' : 'var(--bg-subtle)', padding: noHeaderFooter || sidebarMode ? '0' : '24px 16px', borderRadius: 8 }}>
      {/* Page format + margins — hidden in body-only mode */}
      {!noHeaderFooter && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>Seitenformat:</span>
          {(['a4', 'letter'] as const).map(f => (
            <label key={f} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
              <input type="radio" name="seitenformat" value={f} checked={layout.format === f}
                onChange={() => update({ seiten_layout: { ...layout, format: f } })} />
              {f === 'a4' ? 'A4' : 'US Letter'}
            </label>
          ))}
          <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>
            Ränder: O {layout.margin_top} / R {layout.margin_right} / U {layout.margin_bottom} / L {layout.margin_left} mm
          </span>
        </div>
      )}

      {/* A4 sheet */}
      <div style={{
        width: pageDims.wPx, maxWidth: sidebarMode ? undefined : '100%', margin: '0 auto',
        background: 'white', boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
        borderRadius: 2, overflow: 'hidden', color: '#000',
        minHeight: sidebarMode ? pageDims.hPx : undefined,
        ...(zoom ? { zoom: `${zoom}` } as React.CSSProperties : {}),
      }}>
        {/* Kopfzeile zone */}
        {!noHeaderFooter && (
          <div style={{
            paddingTop: marginTopPx, paddingLeft: marginLeftPx, paddingRight: marginRightPx,
            borderBottom: value.kopfzeile_aktiv ? '1px dashed #007AFF44' : undefined,
          }}>
            <ThreeColumnZone
              label="Kopfzeile"
              color="#007AFF"
              aktiv={value.kopfzeile_aktiv}
              ersteSeiteOhne={value.erste_seite_kein_header}
              ersteSeiteOhneLabel="Erste Seite ohne"
              content={kzContent}
              readOnly={readOnly}
              produktionsLogoUrl={produktionsLogoUrl}
              zone="kopfzeile"
              previewContext={previewContext}
              onAktivChange={v => update({ kopfzeile_aktiv: v })}
              onErsteSeiteOhneChange={v => update({ erste_seite_kein_header: v })}
              onChange={c => update({ kopfzeile_content: c })}
            />
          </div>
        )}

        {/* Body zone */}
        {!noBody && (
          <div style={{
            paddingLeft: marginLeftPx, paddingRight: marginRightPx,
            paddingTop: noHeaderFooter ? marginTopPx : 16,
            paddingBottom: noHeaderFooter ? marginBottomPx : 16,
            minHeight: 400,
          }}>
            {!noHeaderFooter && !sidebarMode && (
              <div style={{ fontSize: 11, fontWeight: 600, color: '#00C853', marginBottom: 4 }}>Inhalt</div>
            )}
            <div style={{ border: noHeaderFooter || sidebarMode ? 'none' : '1px solid #00C85344', borderRadius: 6, overflow: 'hidden' }}>
              {!sidebarMode && (
                <BodyToolbar editor={bodyEditor} produktionsLogoUrl={produktionsLogoUrl} fileInputRef={bodyFileRef} zone="alle" />
              )}
              {!sidebarMode && (
                <input ref={bodyFileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleBodyFileChange} />
              )}
              <div style={{
                padding: '8px 12px',
                minHeight: sidebarMode ? pageDims.hPx - 200 : 200,
                maxHeight: sidebarMode ? undefined : 500,
                overflowY: sidebarMode ? undefined : 'auto',
                background: noHeaderFooter || sidebarMode ? 'transparent' : '#00C85308',
              }}>
                <ZoneEditor
                  key="body"
                  initialContent={value.body_content}
                  onChange={c => update({ body_content: c })}
                  readOnly={readOnly}
                  minHeight={sidebarMode ? pageDims.hPx - 200 : 200}
                  onEditorReady={ed => {
                    setBodyEditor(ed)
                    if (sidebarMode) onActiveEditorChange?.(ed, 'alle')
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Fußzeile zone */}
        {!noHeaderFooter && (
          <div style={{
            paddingBottom: marginBottomPx, paddingLeft: marginLeftPx, paddingRight: marginRightPx,
            borderTop: value.fusszeile_aktiv ? '1px dashed #FF950044' : undefined,
          }}>
            <ThreeColumnZone
              label="Fußzeile"
              color="#FF9500"
              aktiv={value.fusszeile_aktiv}
              content={fzContent}
              readOnly={readOnly}
              produktionsLogoUrl={produktionsLogoUrl}
              zone="fusszeile"
              previewContext={previewContext}
              onAktivChange={v => update({ fusszeile_aktiv: v })}
              onChange={c => update({ fusszeile_content: c })}
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Empty default value ───────────────────────────────────────────────────────
export function emptyVorlagenEditorValue(): DokumentVorlagenEditorValue {
  return {
    body_content:            { type: 'doc', content: [{ type: 'paragraph' }] },
    kopfzeile_content:       null,
    fusszeile_content:       null,
    kopfzeile_aktiv:         false,
    fusszeile_aktiv:         false,
    erste_seite_kein_header: true,
    seiten_layout:           DEFAULT_LAYOUT,
  }
}
