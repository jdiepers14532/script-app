import { useEffect, useRef, useState, useCallback } from 'react'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import UnderlineExt from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import { ResizableImageExtension } from '../../tiptap/ResizableImageExtension'
import { PlaceholderChipExtension, PLACEHOLDER_CHIP_CSS, getPlaceholdersForZone, getPlaceholderLabel } from '../../tiptap/PlaceholderChipExtension'
import type { PlaceholderZone } from '../../tiptap/PlaceholderChipExtension'

// ── CSS injection ─────────────────────────────────────────────────────────────
let chipCssInjected = false
function injectChipCss() {
  if (chipCssInjected) return
  chipCssInjected = true
  const style = document.createElement('style')
  style.id = 'placeholder-chip-css'
  style.textContent = PLACEHOLDER_CHIP_CSS
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

const TIPTAP_EXTENSIONS = [
  StarterKit,
  UnderlineExt,
  TextAlign.configure({ types: ['paragraph', 'heading'] }),
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
    <div style={{ minHeight: minHeight ?? 60 }}>
      {editor && (
        <EditorContent editor={editor} style={{ minHeight: minHeight ?? 60, fontSize: 13, lineHeight: 1.7, cursor: 'text', outline: 'none' }} />
      )}
    </div>
  )
}

// ── Shared toolbar for the active column ─────────────────────────────────────
function SharedColumnToolbar({
  editor, zone, produktionsLogoUrl, fileInputRef,
}: {
  editor: Editor | null
  zone: PlaceholderZone
  produktionsLogoUrl?: string | null
  fileInputRef: React.RefObject<HTMLInputElement | null>
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

  const chips = getPlaceholdersForZone(zone)

  const fmtBtn = (label: string, active: boolean, cb: () => void, title: string, extra?: React.CSSProperties) => (
    <button
      key={label}
      title={title}
      disabled={!editor}
      onMouseDown={e => { e.preventDefault(); cb() }}
      style={{
        width: 24, height: 24, border: '1px solid var(--border)', borderRadius: 4,
        background: active ? 'var(--text-primary)' : 'transparent',
        color: active ? 'var(--text-inverse)' : editor ? 'var(--text-secondary)' : 'var(--text-muted)',
        cursor: editor ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, flexShrink: 0, ...extra,
      }}
    >{label}</button>
  )

  const sep = <div style={{ width: 1, height: 14, background: 'var(--border)', margin: '0 3px', flexShrink: 0 }} />

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 3, padding: '5px 8px',
      borderBottom: '1px solid var(--border)', background: 'var(--bg-subtle)',
      alignItems: 'center', minHeight: 36,
    }}>
      {/* Formatting */}
      {fmtBtn('B', editor?.isActive('bold') ?? false,      () => editor?.chain().focus().toggleBold().run(),      'Fett',          { fontWeight: 700 })}
      {fmtBtn('I', editor?.isActive('italic') ?? false,    () => editor?.chain().focus().toggleItalic().run(),    'Kursiv',        { fontStyle: 'italic' })}
      {fmtBtn('U', editor?.isActive('underline') ?? false, () => editor?.chain().focus().toggleUnderline().run(), 'Unterstrichen', { textDecoration: 'underline' })}
      {sep}
      {fmtBtn('≡L', editor?.isActive({ textAlign: 'left' })   ?? false, () => editor?.chain().focus().setTextAlign('left').run(),   'Linksbündig')}
      {fmtBtn('≡M', editor?.isActive({ textAlign: 'center' }) ?? false, () => editor?.chain().focus().setTextAlign('center').run(), 'Zentriert')}
      {fmtBtn('≡R', editor?.isActive({ textAlign: 'right' })  ?? false, () => editor?.chain().focus().setTextAlign('right').run(),  'Rechtsbündig')}
      {sep}
      {/* Images */}
      <button
        disabled={!editor || !!imgLoading}
        onMouseDown={e => { e.preventDefault(); loadFirmenlogo() }}
        style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-subtle)', cursor: editor ? 'pointer' : 'default', fontFamily: 'inherit', color: 'var(--text-secondary)', whiteSpace: 'nowrap', flexShrink: 0 }}
      >{imgLoading === 'firma' ? '…' : 'Firmenlogo'}</button>
      <button
        disabled={!editor || !produktionsLogoUrl || !!imgLoading}
        onMouseDown={e => { e.preventDefault(); if (produktionsLogoUrl) insertImg(produktionsLogoUrl) }}
        style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-subtle)', cursor: editor && produktionsLogoUrl ? 'pointer' : 'default', fontFamily: 'inherit', color: editor && produktionsLogoUrl ? 'var(--text-secondary)' : 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0, opacity: produktionsLogoUrl ? 1 : 0.4 }}
      >{imgLoading === 'prod' ? '…' : 'Produktionslogo'}</button>
      <button
        disabled={!editor}
        onMouseDown={e => { e.preventDefault(); fileInputRef.current?.click() }}
        style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-subtle)', cursor: editor ? 'pointer' : 'default', fontFamily: 'inherit', color: 'var(--text-secondary)', whiteSpace: 'nowrap', flexShrink: 0 }}
      >↑ Bild</button>
      {sep}
      {/* Placeholder chips */}
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
      {!editor && (
        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>
          ← Bereich anklicken
        </span>
      )}
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
  const editorsRef = useRef<Record<ColKey, Editor | null>>({ links: null, mitte: null, rechts: null })
  const [activeCol, setActiveCol] = useState<ColKey | null>(null)
  const [, setTick] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleEditorReady = (col: ColKey, ed: Editor) => {
    editorsRef.current[col] = ed
    ed.on('focus', () => setActiveCol(col))
    ed.on('blur', () => setActiveCol(prev => prev === col ? null : prev))
    ed.on('selectionUpdate', () => setTick(n => n + 1))
    ed.on('transaction', () => setTick(n => n + 1))
  }

  const activeEditor = activeCol ? editorsRef.current[activeCol] : null

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !activeEditor) return
    const reader = new FileReader()
    reader.onloadend = () => {
      ;(activeEditor as any).chain().focus().setResizableImage({ src: reader.result as string, width: 120 }).run()
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const cols: ColKey[] = ['links', 'mitte', 'rechts']

  return (
    <div style={{ marginBottom: 8 }}>
      {/* Zone header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color, flex: 1 }}>{label}</label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, cursor: 'pointer' }}>
          <input type="checkbox" checked={aktiv} onChange={e => onAktivChange(e.target.checked)} />
          Aktiv
        </label>
        {ersteSeiteOhneLabel && onErsteSeiteOhneChange && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, cursor: 'pointer' }}>
            <input type="checkbox" checked={!!ersteSeiteOhne} onChange={e => onErsteSeiteOhneChange(e.target.checked)} />
            {ersteSeiteOhneLabel}
          </label>
        )}
      </div>

      {aktiv && (
        <div style={{ border: `1px solid ${color}44`, borderRadius: 6, overflow: 'hidden' }}>
          {/* Shared toolbar — shows tools for the focused column */}
          <SharedColumnToolbar
            editor={activeEditor}
            zone={zone}
            produktionsLogoUrl={produktionsLogoUrl}
            fileInputRef={fileRef}
          />
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />

          {/* Three-column editor grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', background: 'white' }}>
            {cols.map((col, i) => (
              <div
                key={col}
                style={{
                  borderLeft: i > 0 ? `1px dashed ${color}33` : 'none',
                  minHeight: 48,
                  position: 'relative',
                  background: activeCol === col ? `${color}08` : 'transparent',
                  transition: 'background 0.15s',
                }}
              >
                {/* Column label */}
                <div style={{
                  fontSize: 9, color: `${color}88`, padding: '3px 8px 1px',
                  fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4,
                  textAlign: col === 'rechts' ? 'right' : col === 'mitte' ? 'center' : 'left',
                }}>
                  {COL_LABELS[col]}
                </div>
                {/* Column editor */}
                <div style={{ padding: '2px 8px 6px' }}>
                  <ZoneEditor
                    key={col}
                    initialContent={content[col]}
                    onChange={doc => onChange({ ...content, [col]: doc })}
                    readOnly={readOnly}
                    onEditorReady={ed => handleEditorReady(col, ed)}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* WYSIWYG preview strip */}
          <div style={{
            borderTop: `1px solid ${color}22`,
            background: `${color}05`,
            padding: '4px 8px',
          }}>
            <div style={{ fontSize: 9, color: `${color}66`, marginBottom: 2, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>
              Vorschau
            </div>
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
              gap: 4, background: 'white', border: `1px solid ${color}22`,
              borderRadius: 3, padding: '4px 8px', minHeight: 24, fontSize: 11,
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

// ── Preview: ProseMirror JSON → HTML with real images + resolved chips ────────

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

  function renderInline(node: any): string {
    if (!node) return ''
    if (node.type === 'text') {
      let t = escHtml(node.text ?? '')
      for (const mark of (node.marks ?? [])) {
        if (mark.type === 'bold')      t = `<strong>${t}</strong>`
        if (mark.type === 'italic')    t = `<em>${t}</em>`
        if (mark.type === 'underline') t = `<u>${t}</u>`
      }
      return t
    }
    if (node.type === 'placeholder_chip') {
      const key   = node.attrs?.key ?? ''
      const field = PREVIEW_CONTEXT_MAP[key]
      const color = getPlaceholderColor(key)
      const label = getPlaceholderLabel(key)
      // Real value available → show as styled text
      if (field && ctx?.[field] != null) {
        return `<span style="color:${color};font-weight:600">${escHtml(String(ctx[field]))}</span>`
      }
      // Dynamic (seite/seiten_gesamt) or no value → show as chip
      return `<span style="background:${color}22;color:${color};border:1px solid ${color}55;border-radius:3px;font-size:9px;font-weight:600;padding:1px 4px;white-space:nowrap">${escHtml(label)}</span>`
    }
    if (node.type === 'hardBreak') return '<br>'
    if (node.type === 'resizable_image') {
      const src = node.attrs?.src ?? ''
      const w   = Math.min(Number(node.attrs?.width) || 60, 80) // max 80px in preview
      return `<img src="${src}" style="width:${w}px;max-width:100%;vertical-align:middle" />`
    }
    return (node.content ?? []).map(renderInline).join('')
  }

  function renderBlock(node: any): string {
    if (node.type === 'paragraph') {
      const align = node.attrs?.textAlign
      const style = align && align !== 'left' ? ` style="text-align:${align}"` : ''
      const inner = (node.content ?? []).map(renderInline).join('')
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

// ── Body zone toolbar (single editor) ────────────────────────────────────────
function BodyToolbar({ editor, produktionsLogoUrl, fileInputRef }: {
  editor: Editor | null
  produktionsLogoUrl?: string | null
  fileInputRef: React.RefObject<HTMLInputElement | null>
}) {
  const [imgLoading, setImgLoading] = useState<string | null>(null)
  const [, setTick] = useState(0)

  useEffect(() => {
    if (!editor) return
    const h = () => setTick(n => n + 1)
    editor.on('selectionUpdate', h); editor.on('transaction', h)
    return () => { editor.off('selectionUpdate', h); editor.off('transaction', h) }
  }, [editor])

  const insertImg = (src: string) => {
    ;(editor as any)?.chain().focus().setResizableImage({ src, width: 120 }).run()
  }

  const loadFirmenlogo = async () => {
    setImgLoading('firma')
    try {
      const res = await fetch('https://auth.serienwerft.studio/api/public/company-info')
      const data = await res.json()
      const url = data?.logos?.light ?? data?.logo_url
      if (!url) { alert('Kein Firmenlogo konfiguriert.'); return }
      insertImg(url)
    } catch { alert('Firmenlogo konnte nicht geladen werden.') }
    finally { setImgLoading(null) }
  }

  const btn = (label: string, active: boolean, cb: () => void, title: string, extra?: React.CSSProperties) => (
    <button key={label} title={title} onMouseDown={e => { e.preventDefault(); cb() }} style={{
      width: 24, height: 24, border: '1px solid var(--border)', borderRadius: 4,
      background: active ? 'var(--text-primary)' : 'transparent',
      color: active ? 'var(--text-inverse)' : 'var(--text-secondary)',
      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 11, flexShrink: 0, ...extra,
    }}>{label}</button>
  )
  const sep = <div style={{ width: 1, height: 14, background: 'var(--border)', margin: '0 3px', flexShrink: 0 }} />
  const imgBtnStyle: React.CSSProperties = { fontSize: 10, padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-subtle)', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text-secondary)', whiteSpace: 'nowrap', flexShrink: 0 }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, padding: '5px 8px', borderBottom: '1px solid var(--border)', background: 'var(--bg-subtle)', alignItems: 'center' }}>
      {btn('B', editor?.isActive('bold')      ?? false, () => editor?.chain().focus().toggleBold().run(),      'Fett',          { fontWeight: 700 })}
      {btn('I', editor?.isActive('italic')    ?? false, () => editor?.chain().focus().toggleItalic().run(),    'Kursiv',        { fontStyle: 'italic' })}
      {btn('U', editor?.isActive('underline') ?? false, () => editor?.chain().focus().toggleUnderline().run(), 'Unterstrichen', { textDecoration: 'underline' })}
      {sep}
      {btn('≡L', editor?.isActive({ textAlign: 'left' })   ?? false, () => editor?.chain().focus().setTextAlign('left').run(),   'Linksbündig')}
      {btn('≡M', editor?.isActive({ textAlign: 'center' }) ?? false, () => editor?.chain().focus().setTextAlign('center').run(), 'Zentriert')}
      {btn('≡R', editor?.isActive({ textAlign: 'right' })  ?? false, () => editor?.chain().focus().setTextAlign('right').run(),  'Rechtsbündig')}
      {sep}
      <button style={imgBtnStyle} onMouseDown={e => { e.preventDefault(); loadFirmenlogo() }} disabled={!!imgLoading}>{imgLoading === 'firma' ? '…' : 'Firmenlogo'}</button>
      <button style={{ ...imgBtnStyle, opacity: produktionsLogoUrl ? 1 : 0.4 }} disabled={!produktionsLogoUrl || !!imgLoading} onMouseDown={e => { e.preventDefault(); if (produktionsLogoUrl) insertImg(produktionsLogoUrl) }}>{imgLoading === 'prod' ? '…' : 'Produktionslogo'}</button>
      <button style={imgBtnStyle} onMouseDown={e => { e.preventDefault(); fileInputRef.current?.click() }}>↑ Bild</button>
    </div>
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
                <BodyToolbar editor={bodyEditor} produktionsLogoUrl={produktionsLogoUrl} fileInputRef={bodyFileRef} />
                <input ref={bodyFileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleBodyFileChange} />
                <div style={{ padding: '8px 12px', minHeight: 200, background: '#00C85308' }}>
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
