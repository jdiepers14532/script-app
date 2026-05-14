import { useEffect, useRef, useState, useCallback } from 'react'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import UnderlineExt from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import TextStyle from '@tiptap/extension-text-style'
import FontFamily from '@tiptap/extension-font-family'
import { ResizableImageExtension } from '../../tiptap/ResizableImageExtension'
import { FontSizeExtension } from '../../tiptap/FontSizeExtension'
import { ParagraphStyleExtension } from '../../tiptap/ParagraphStyleExtension'
import { PlaceholderChipExtension, PLACEHOLDER_CHIP_CSS, getPlaceholdersForZone, getPlaceholderLabel, getPlaceholderColor } from '../../tiptap/PlaceholderChipExtension'
import type { PlaceholderZone } from '../../tiptap/PlaceholderChipExtension'

// ── CSS injection ─────────────────────────────────────────────────────────────
let chipCssInjected = false
function injectChipCss() {
  if (chipCssInjected) return
  chipCssInjected = true
  const style = document.createElement('style')
  style.id = 'placeholder-chip-css'
  style.textContent = PLACEHOLDER_CHIP_CSS + `
/* Prevent editor content from expanding its container horizontally */
.ProseMirror { overflow-x: hidden !important; max-width: 100%; box-sizing: border-box; }
.ProseMirror img { max-width: 100% !important; }
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
  produktion?:    string
  staffel?:       string
  block?:         string
  folge?:         string | number
  folgentitel?:   string
  fassung?:       string
  version?:       string
  stand_datum?:   string
  autor?:         string
  regie?:         string
  firmenname?:    string
}

interface DokumentVorlagenEditorProps {
  value:    DokumentVorlagenEditorValue
  onChange: (v: DokumentVorlagenEditorValue) => void
  /** Only KZ/FZ editors — no body zone (global DK-Settings) */
  noBody?: boolean
  readOnly?: boolean
  /** URL of production logo (from produktion.serienwerft.studio) */
  produktionsLogoUrl?: string | null
  /** Values shown in the preview strip to replace placeholders */
  previewContext?: PreviewContext
}

const DEFAULT_LAYOUT: SeitenLayout = {
  format: 'a4', margin_top: 25, margin_bottom: 25, margin_left: 30, margin_right: 25,
}

const MM_TO_PX = 96 / 25.4
const A4_W_PX  = 794

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
const SPECIAL_CHARS = [
  { char: '©', title: 'Copyright' },
  { char: '®', title: 'Registered Trademark' },
  { char: '™', title: 'Trademark' },
]

const TIPTAP_EXTENSIONS = [
  StarterKit,
  UnderlineExt,
  TextAlign.configure({ types: ['paragraph', 'heading'] }),
  TextStyle,
  FontFamily,
  FontSizeExtension,
  ParagraphStyleExtension,
  ResizableImageExtension,
  PlaceholderChipExtension,
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

// ── Shared toolbar ─────────────────────────────────────────────────────────────
function ToolbarContent({
  editor, zone, produktionsLogoUrl, fileInputRef, isBody,
}: {
  editor: Editor | null
  zone?: PlaceholderZone
  produktionsLogoUrl?: string | null
  fileInputRef: React.RefObject<HTMLInputElement | null>
  isBody?: boolean
}) {
  const [imgLoading, setImgLoading] = useState<string | null>(null)

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

  const curFontFamily = editor?.getAttributes('paragraph').fontFamily ?? ''
  const curFontSize   = editor?.getAttributes('paragraph').fontSize   ?? ''

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

  const sep = <div key={Math.random()} style={{ width: 1, height: 14, background: 'var(--border)', margin: '0 3px', flexShrink: 0 }} />
  const imgBtnStyle: React.CSSProperties = {
    fontSize: 10, padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border)',
    background: 'var(--bg-subtle)', cursor: editor ? 'pointer' : 'default',
    fontFamily: 'inherit', color: 'var(--text-secondary)', whiteSpace: 'nowrap', flexShrink: 0,
  }

  return (
    <>
      {/* Bold / Italic / Underline */}
      {fmtBtn('B', editor?.isActive('bold')      ?? false, () => editor?.chain().focus().toggleBold().run(),      'Fett',          { fontWeight: 700 })}
      {fmtBtn('I', editor?.isActive('italic')    ?? false, () => editor?.chain().focus().toggleItalic().run(),    'Kursiv',        { fontStyle: 'italic' })}
      {fmtBtn('U', editor?.isActive('underline') ?? false, () => editor?.chain().focus().toggleUnderline().run(), 'Unterstrichen', { textDecoration: 'underline' })}
      {sep}
      {/* Alignment */}
      {fmtBtn('≡L', editor?.isActive({ textAlign: 'left' })   ?? false, () => editor?.chain().focus().setTextAlign('left').run(),   'Linksbündig')}
      {fmtBtn('≡M', editor?.isActive({ textAlign: 'center' }) ?? false, () => editor?.chain().focus().setTextAlign('center').run(), 'Zentriert')}
      {fmtBtn('≡R', editor?.isActive({ textAlign: 'right' })  ?? false, () => editor?.chain().focus().setTextAlign('right').run(),  'Rechtsbündig')}
      {sep}
      {/* Font family — paragraph-level so chips inherit it */}
      <select
        value={curFontFamily}
        onChange={e => {
          editor?.chain().setParagraphFont(e.target.value || null).run()
        }}
        disabled={!editor}
        title="Schriftart (gilt für gesamte Zeile inkl. Chips)"
        style={{ fontSize: 10, height: 24, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-subtle)', fontFamily: 'inherit', color: 'var(--text-secondary)', maxWidth: 100, flexShrink: 0 }}
      >
        <option value="">— Schrift —</option>
        {FONT_FAMILIES.map(f => <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>{f.label}</option>)}
      </select>
      {/* Font size — paragraph-level */}
      <select
        value={curFontSize}
        onChange={e => {
          editor?.chain().setParagraphFontSize(e.target.value || null).run()
        }}
        disabled={!editor}
        title="Schriftgröße (gilt für gesamte Zeile inkl. Chips)"
        style={{ fontSize: 10, height: 24, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-subtle)', fontFamily: 'inherit', color: 'var(--text-secondary)', width: 60, flexShrink: 0 }}
      >
        <option value="">— Pt —</option>
        {FONT_SIZES.map(s => <option key={s} value={`${s}pt`}>{s} pt</option>)}
      </select>
      {sep}
      {/* Special characters */}
      {SPECIAL_CHARS.map(({ char, title }) =>
        fmtBtn(char, false, () => editor?.chain().focus().insertContent(char).run(), title, { fontWeight: 400, fontSize: 12 })
      )}
      {sep}
      {/* Images */}
      <button
        disabled={!editor || !!imgLoading}
        onMouseDown={e => { e.preventDefault(); loadFirmenlogo() }}
        style={imgBtnStyle}
      >{imgLoading === 'firma' ? '…' : 'Firmenlogo'}</button>
      <button
        disabled={!editor || !produktionsLogoUrl || !!imgLoading}
        onMouseDown={e => { e.preventDefault(); if (produktionsLogoUrl) insertImg(produktionsLogoUrl) }}
        style={{ ...imgBtnStyle, opacity: produktionsLogoUrl ? 1 : 0.4, color: editor && produktionsLogoUrl ? 'var(--text-secondary)' : 'var(--text-muted)' }}
      >{imgLoading === 'prod' ? '…' : 'Produktionslogo'}</button>
      <button
        disabled={!editor}
        onMouseDown={e => { e.preventDefault(); fileInputRef.current?.click() }}
        style={imgBtnStyle}
      >↑ Bild</button>
      {/* Placeholder chips (only for KZ/FZ zones, not body unless zone is provided) */}
      {chips.length > 0 && sep}
      {chips.map(p => (
        <button
          key={p.key}
          disabled={!editor}
          onMouseDown={e => { e.preventDefault(); if (editor) editor.chain().focus().insertPlaceholderChip(p.key).run() }}
          title={p.key}
          style={{
            display: 'inline-flex', alignItems: 'center',
            background: p.color + '1A', color: p.color, border: `1px solid ${p.color}55`,
            borderRadius: 4, fontSize: 10, fontWeight: 600, padding: '2px 6px',
            cursor: editor ? 'pointer' : 'default', fontFamily: 'inherit',
            whiteSpace: 'nowrap', flexShrink: 0, opacity: editor ? 1 : 0.4,
          }}
        >{p.label}</button>
      ))}
      {!editor && !isBody && (
        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>
          ← Bereich anklicken
        </span>
      )}
    </>
  )
}

// ── Toolbar wrapper ────────────────────────────────────────────────────────────
const TOOLBAR_STYLE: React.CSSProperties = {
  display: 'flex', flexWrap: 'wrap', gap: 3, padding: '5px 8px',
  borderBottom: '1px solid var(--border)', background: 'var(--bg-subtle)',
  alignItems: 'center', minHeight: 36, flexShrink: 0,
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
      {/* Zone header */}
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

          {/* Zone tabs */}
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

          {/* Toolbar */}
          <SharedColumnToolbar
            editor={activeEditor}
            zone={zone}
            produktionsLogoUrl={produktionsLogoUrl}
            fileInputRef={fileRef}
          />
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />

          {/* Zone editors — all mounted, only active visible */}
          {cols.map(col => (
            <div
              key={col}
              style={{
                display: activeCol === col ? 'block' : 'none',
                padding: '10px 14px',
                minHeight: 56,
                background: 'white',
                overflow: 'hidden',  // prevent wide images from breaking toolbar layout
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

          {/* Preview strip */}
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
  '{{produktion}}':   'produktion',
  '{{staffel}}':      'staffel',
  '{{block}}':        'block',
  '{{folge}}':        'folge',
  '{{folgentitel}}':  'folgentitel',
  '{{fassung}}':      'fassung',
  '{{version}}':      'version',
  '{{stand_datum}}':  'stand_datum',
  '{{autor}}':        'autor',
  '{{regie}}':        'regie',
  '{{firmenname}}':   'firmenname',
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function renderPmToPreviewHtml(doc: any, ctx?: PreviewContext): string {
  if (!doc) return ''

  function renderInline(node: any, paraFont?: { ff?: string | null; fs?: string | null }): string {
    if (!node) return ''

    if (node.type === 'text') {
      let t = escHtml(node.text ?? '')
      const inlineStyles: string[] = []
      for (const mark of (node.marks ?? [])) {
        if (mark.type === 'bold')           t = `<strong>${t}</strong>`
        else if (mark.type === 'italic')    t = `<em>${t}</em>`
        else if (mark.type === 'underline') t = `<u>${t}</u>`
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
      // Apply paragraph-level font to chip if set
      const fontStyles: string[] = []
      if (paraFont?.ff) fontStyles.push(`font-family:${paraFont.ff}`)
      if (paraFont?.fs) fontStyles.push(`font-size:${paraFont.fs}`)
      const fStr = fontStyles.length ? fontStyles.join(';') + ';' : ''
      if (field && ctx?.[field] != null) {
        return `<span style="${fStr}color:${color};font-weight:600">${escHtml(String(ctx[field]))}</span>`
      }
      return `<span style="${fStr}background:${color}22;color:${color};border:1px solid ${color}55;border-radius:3px;font-weight:600;padding:1px 4px;white-space:nowrap">${escHtml(label)}</span>`
    }

    if (node.type === 'hardBreak') return '<br>'

    if (node.type === 'resizable_image') {
      const src = node.attrs?.src ?? ''
      const w   = Number(node.attrs?.width) || 60  // no artificial cap — show actual size
      return `<img src="${src}" style="width:${w}px;max-width:100%;vertical-align:middle" />`
    }

    return (node.content ?? []).map((n: any) => renderInline(n, paraFont)).join('')
  }

  function renderBlock(node: any): string {
    if (node.type === 'paragraph') {
      const align = node.attrs?.textAlign
      const ff    = node.attrs?.fontFamily || null
      const fs    = node.attrs?.fontSize   || null
      const styles: string[] = []
      if (align && align !== 'left') styles.push(`text-align:${align}`)
      if (ff) styles.push(`font-family:${ff}`)
      if (fs) styles.push(`font-size:${fs}`)
      const style = styles.length ? ` style="${styles.join(';')}"` : ''
      const inner = (node.content ?? []).map((n: any) => renderInline(n, { ff, fs })).join('')
      return inner ? `<div${style}>${inner}</div>` : ''
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
  value, onChange, noBody = false, readOnly = false, produktionsLogoUrl, previewContext,
}: DokumentVorlagenEditorProps) {
  useEffect(() => { injectChipCss() }, [])

  const layout: SeitenLayout = value.seiten_layout ?? DEFAULT_LAYOUT
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
    <div style={{ background: 'var(--bg-subtle)', padding: '24px 16px', borderRadius: 8 }}>
      {/* Page format + margins */}
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

      {/* A4 sheet */}
      <div style={{
        width: A4_W_PX, maxWidth: '100%', margin: '0 auto',
        background: 'white', boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
        borderRadius: 2, overflow: 'hidden', color: '#000',
      }}>
        {/* Kopfzeile zone */}
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

        {/* Body zone */}
        {!noBody && (
          <div style={{ paddingLeft: marginLeftPx, paddingRight: marginRightPx, paddingTop: 16, paddingBottom: 16, minHeight: 400 }}>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#00C853', marginBottom: 4 }}>Inhalt</div>
              <div style={{ border: '1px solid #00C85344', borderRadius: 6, overflow: 'hidden' }}>
                <BodyToolbar editor={bodyEditor} produktionsLogoUrl={produktionsLogoUrl} fileInputRef={bodyFileRef} zone="alle" />
                <input ref={bodyFileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleBodyFileChange} />
                <div style={{ padding: '8px 12px', minHeight: 200, background: '#00C85308', overflow: 'hidden' }}>
                  <ZoneEditor
                    key="body"
                    initialContent={value.body_content}
                    onChange={c => update({ body_content: c })}
                    readOnly={readOnly}
                    minHeight={200}
                    onEditorReady={setBodyEditor}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Fußzeile zone */}
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
