import { useEffect, useRef, useState, useCallback } from 'react'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import UnderlineExt from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import Image from '@tiptap/extension-image'
import { PlaceholderChipExtension, PLACEHOLDER_CHIP_CSS } from '../../tiptap/PlaceholderChipExtension'
import PlaceholderPalette from './PlaceholderPalette'

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
  margin_top: number    // mm
  margin_bottom: number
  margin_left: number
  margin_right: number
}

export interface DokumentVorlagenEditorValue {
  body_content: any          // ProseMirror JSON
  kopfzeile_content: any | null
  fusszeile_content: any | null
  kopfzeile_aktiv: boolean
  fusszeile_aktiv: boolean
  erste_seite_kein_header: boolean
  seiten_layout: SeitenLayout
}

interface DokumentVorlagenEditorProps {
  value: DokumentVorlagenEditorValue
  onChange: (v: DokumentVorlagenEditorValue) => void
  /** If true, only show KZ/FZ editors (no body) — for global DK-Settings */
  noBody?: boolean
  /** Locks the editor to read-only */
  readOnly?: boolean
}

const DEFAULT_LAYOUT: SeitenLayout = {
  format: 'a4',
  margin_top: 25,
  margin_bottom: 25,
  margin_left: 30,
  margin_right: 25,
}

const MM_TO_PX = 96 / 25.4
const A4_W_PX = 794

// ── Mini Tiptap editor used for each zone ────────────────────────────────────
function ZoneEditor({
  initialContent,
  onChange,
  placeholder,
  minHeight,
  readOnly,
}: {
  initialContent: any
  onChange: (c: any) => void
  placeholder?: string
  minHeight?: number
  readOnly?: boolean
}) {
  // Use key pattern: content is initialized once, then managed internally
  const lastEmitted = useRef<string>('')

  const editor = useEditor({
    editable: !readOnly,
    extensions: [
      StarterKit,
      UnderlineExt,
      TextAlign.configure({ types: ['paragraph', 'heading'] }),
      Image.configure({ inline: true, allowBase64: true }),
      PlaceholderChipExtension,
    ],
    content: initialContent || { type: 'doc', content: [{ type: 'paragraph' }] },
    onUpdate: ({ editor: e }) => {
      const json = JSON.stringify(e.getJSON())
      if (json !== lastEmitted.current) {
        lastEmitted.current = json
        onChange(e.getJSON())
      }
    },
  })

  // Expose editor instance via a ref pattern — parent can call insertPlaceholderChip
  // We store it on the DOM node's data for simplicity
  const wrapRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (wrapRef.current && editor) {
      (wrapRef.current as any).__tiptapEditor = editor
    }
  }, [editor])

  return (
    <div ref={wrapRef} style={{ minHeight: minHeight ?? 60 }}>
      {!editor ? null : (
        <EditorContent
          editor={editor}
          style={{
            minHeight: minHeight ?? 60,
            fontSize: 13,
            lineHeight: 1.7,
            cursor: 'text',
            outline: 'none',
          }}
        />
      )}
      {placeholder && !editor?.getText().trim() && (
        <div style={{
          position: 'absolute', top: 8, left: 0,
          fontSize: 13, color: 'var(--text-muted)', pointerEvents: 'none',
        }}>
          {placeholder}
        </div>
      )}
    </div>
  )
}

// ── Toolbar for a zone editor ─────────────────────────────────────────────────
function ZoneToolbar({ editorRef, onInsertImage }: {
  editorRef: React.RefObject<HTMLDivElement | null>
  onInsertImage?: (src: string) => void
}) {
  const getEditor = (): Editor | null => {
    return (editorRef.current as any)?.__tiptapEditor ?? null
  }

  const btn = (label: string, active: boolean, onClick: () => void, title?: string, extraStyle?: React.CSSProperties) => (
    <button
      key={label}
      title={title ?? label}
      onMouseDown={e => { e.preventDefault(); onClick() }}
      style={{
        width: 26, height: 26, border: '1px solid var(--border)', borderRadius: 4,
        background: active ? 'var(--text-primary)' : 'transparent',
        color: active ? 'var(--text-inverse)' : 'var(--text-secondary)',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, ...extraStyle,
      }}
    >{label}</button>
  )

  const [, forceRender] = useState(0)
  const ed = getEditor()

  // re-render on selection change
  useEffect(() => {
    const ed = getEditor()
    if (!ed) return
    const handler = () => forceRender(n => n + 1)
    ed.on('selectionUpdate', handler)
    ed.on('transaction', handler)
    return () => { ed.off('selectionUpdate', handler); ed.off('transaction', handler) }
  }, [editorRef.current])

  return (
    <div style={{ display: 'flex', gap: 3, padding: '4px 8px', borderBottom: '1px solid var(--border)', background: 'var(--bg-subtle)', flexWrap: 'wrap', alignItems: 'center' }}>
      {btn('B', ed?.isActive('bold') ?? false, () => getEditor()?.chain().focus().toggleBold().run(), 'Fett', { fontWeight: 700 })}
      {btn('I', ed?.isActive('italic') ?? false, () => getEditor()?.chain().focus().toggleItalic().run(), 'Kursiv', { fontStyle: 'italic' })}
      {btn('U', ed?.isActive('underline') ?? false, () => getEditor()?.chain().focus().toggleUnderline().run(), 'Unterstrichen', { textDecoration: 'underline' })}
      <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 2px' }} />
      {btn('≡L', ed?.isActive({ textAlign: 'left' }) ?? false, () => getEditor()?.chain().focus().setTextAlign('left').run(), 'Linksbündig')}
      {btn('≡C', ed?.isActive({ textAlign: 'center' }) ?? false, () => getEditor()?.chain().focus().setTextAlign('center').run(), 'Zentriert')}
      {btn('≡R', ed?.isActive({ textAlign: 'right' }) ?? false, () => getEditor()?.chain().focus().setTextAlign('right').run(), 'Rechtsbündig')}
    </div>
  )
}

// ── Logo loader ───────────────────────────────────────────────────────────────
async function fetchAsBase64(url: string): Promise<string> {
  const res = await fetch(url)
  const blob = await res.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

// ── Image toolbar ─────────────────────────────────────────────────────────────
function ImageToolbar({ editorRef, produktionsLogoUrl }: {
  editorRef: React.RefObject<HTMLDivElement | null>
  produktionsLogoUrl?: string | null
}) {
  const [loading, setLoading] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const getEditor = (): Editor | null => (editorRef.current as any)?.__tiptapEditor ?? null

  const insertImageSrc = useCallback((src: string) => {
    getEditor()?.chain().focus().setImage({ src }).run()
  }, [editorRef])

  const loadFirmenlogo = async () => {
    setLoading('firma')
    try {
      const res = await fetch('https://auth.serienwerft.studio/api/public/company-info')
      const data = await res.json()
      const url = data?.logos?.light ?? data?.logo_url
      if (!url) { alert('Kein Firmenlogo konfiguriert.'); return }
      const base64 = await fetchAsBase64(url)
      insertImageSrc(base64)
    } catch { alert('Firmenlogo konnte nicht geladen werden.') }
    finally { setLoading(null) }
  }

  const loadProdLogo = async () => {
    if (!produktionsLogoUrl) { alert('Kein Produktionslogo vorhanden.'); return }
    setLoading('prod')
    try {
      const base64 = await fetchAsBase64(produktionsLogoUrl)
      insertImageSrc(base64)
    } catch { alert('Produktionslogo konnte nicht geladen werden.') }
    finally { setLoading(null) }
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onloadend = () => insertImageSrc(reader.result as string)
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const btnStyle: React.CSSProperties = {
    fontSize: 11, padding: '3px 8px', borderRadius: 4, border: '1px solid var(--border)',
    background: 'var(--bg-subtle)', cursor: 'pointer', fontFamily: 'inherit',
    color: 'var(--text-secondary)', whiteSpace: 'nowrap',
  }

  return (
    <div style={{ display: 'flex', gap: 6, padding: '4px 8px', borderBottom: '1px solid var(--border)', background: 'var(--bg-subtle)', alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Bild:</span>
      <button style={btnStyle} onMouseDown={e => { e.preventDefault(); loadFirmenlogo() }} disabled={!!loading}>
        {loading === 'firma' ? '…' : 'Firmenlogo'}
      </button>
      <button style={{ ...btnStyle, opacity: produktionsLogoUrl ? 1 : 0.4 }} onMouseDown={e => { e.preventDefault(); loadProdLogo() }} disabled={!!loading || !produktionsLogoUrl}>
        {loading === 'prod' ? '…' : 'Produktionslogo'}
      </button>
      <button style={btnStyle} onMouseDown={e => { e.preventDefault(); fileRef.current?.click() }}>
        Bild hochladen
      </button>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileUpload} />
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function DokumentVorlagenEditor({
  value,
  onChange,
  noBody = false,
  readOnly = false,
}: DokumentVorlagenEditorProps) {
  useEffect(() => { injectChipCss() }, [])

  const layout: SeitenLayout = value.seiten_layout ?? DEFAULT_LAYOUT
  const marginLeftPx = Math.round(layout.margin_left * MM_TO_PX)
  const marginRightPx = Math.round(layout.margin_right * MM_TO_PX)
  const marginTopPx = Math.round(layout.margin_top * MM_TO_PX)
  const marginBottomPx = Math.round(layout.margin_bottom * MM_TO_PX)

  const kzRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const fzRef = useRef<HTMLDivElement>(null)

  const update = useCallback((patch: Partial<DokumentVorlagenEditorValue>) => {
    onChange({ ...value, ...patch })
  }, [value, onChange])

  // ── Zone: Kopfzeile ──────────────────────────────────────────────────────
  const KopfzeileZone = (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: '#007AFF', flex: 1 }}>Kopfzeile</label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={value.kopfzeile_aktiv}
            onChange={e => update({ kopfzeile_aktiv: e.target.checked })}
          />
          Aktiv
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={value.erste_seite_kein_header}
            onChange={e => update({ erste_seite_kein_header: e.target.checked })}
          />
          Erste Seite ohne
        </label>
      </div>
      {value.kopfzeile_aktiv && (
        <div style={{ border: '1px solid #007AFF44', borderRadius: 6, overflow: 'hidden' }}>
          <ZoneToolbar editorRef={kzRef} />
          <ImageToolbar editorRef={kzRef} />
          <div style={{ display: 'flex', gap: 6, padding: '6px 8px', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)' }}>
            <PlaceholderPalette editor={(kzRef.current as any)?.__tiptapEditor ?? null} zone="kopfzeile" label="Platzhalter:" />
          </div>
          <div ref={kzRef} style={{ padding: '8px 12px', minHeight: 48, background: '#007AFF08' }}>
            <ZoneEditor
              key={`kz-${JSON.stringify(value.kopfzeile_content)?.slice(0, 20)}`}
              initialContent={value.kopfzeile_content}
              onChange={c => update({ kopfzeile_content: c })}
              readOnly={readOnly}
            />
          </div>
        </div>
      )}
    </div>
  )

  // ── Zone: Body ───────────────────────────────────────────────────────────
  const BodyZone = !noBody ? (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#00C853', marginBottom: 4 }}>Inhalt</div>
      <div style={{ border: '1px solid #00C85344', borderRadius: 6, overflow: 'hidden' }}>
        <ZoneToolbar editorRef={bodyRef} />
        <ImageToolbar editorRef={bodyRef} />
        <div style={{ display: 'flex', gap: 6, padding: '6px 8px', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)' }}>
          <PlaceholderPalette editor={(bodyRef.current as any)?.__tiptapEditor ?? null} zone="alle" label="Platzhalter:" />
        </div>
        <div ref={bodyRef} style={{ padding: '8px 12px', minHeight: 200, background: '#00C85308' }}>
          <ZoneEditor
            key={`body-${JSON.stringify(value.body_content)?.slice(0, 20)}`}
            initialContent={value.body_content}
            onChange={c => update({ body_content: c })}
            readOnly={readOnly}
            minHeight={200}
          />
        </div>
      </div>
    </div>
  ) : null

  // ── Zone: Fußzeile ───────────────────────────────────────────────────────
  const FusszeileZone = (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: '#FF9500', flex: 1 }}>Fußzeile</label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={value.fusszeile_aktiv}
            onChange={e => update({ fusszeile_aktiv: e.target.checked })}
          />
          Aktiv
        </label>
      </div>
      {value.fusszeile_aktiv && (
        <div style={{ border: '1px solid #FF950044', borderRadius: 6, overflow: 'hidden' }}>
          <ZoneToolbar editorRef={fzRef} />
          <ImageToolbar editorRef={fzRef} />
          <div style={{ display: 'flex', gap: 6, padding: '6px 8px', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)' }}>
            <PlaceholderPalette editor={(fzRef.current as any)?.__tiptapEditor ?? null} zone="fusszeile" label="Platzhalter:" />
          </div>
          <div ref={fzRef} style={{ padding: '8px 12px', minHeight: 48, background: '#FF950008' }}>
            <ZoneEditor
              key={`fz-${JSON.stringify(value.fusszeile_content)?.slice(0, 20)}`}
              initialContent={value.fusszeile_content}
              onChange={c => update({ fusszeile_content: c })}
              readOnly={readOnly}
            />
          </div>
        </div>
      )}
    </div>
  )

  // ── A4 Page Frame ────────────────────────────────────────────────────────
  return (
    <div style={{ background: 'var(--bg-subtle)', padding: '24px 16px', borderRadius: 8 }}>
      {/* Page format selector */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>Seitenformat:</span>
        {(['a4', 'letter'] as const).map(f => (
          <label key={f} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
            <input
              type="radio"
              name="seitenformat"
              value={f}
              checked={layout.format === f}
              onChange={() => update({ seiten_layout: { ...layout, format: f } })}
            />
            {f === 'a4' ? 'A4' : 'US Letter'}
          </label>
        ))}
        <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>
          Ränder: {layout.margin_top}/{layout.margin_right}/{layout.margin_bottom}/{layout.margin_left} mm (O/R/U/L)
        </span>
      </div>

      {/* A4 sheet */}
      <div style={{
        width: A4_W_PX,
        maxWidth: '100%',
        margin: '0 auto',
        background: 'white',
        boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
        borderRadius: 2,
        overflow: 'hidden',
        color: '#000',
      }}>
        {/* Kopfzeile zone */}
        <div style={{
          paddingTop: marginTopPx,
          paddingLeft: marginLeftPx,
          paddingRight: marginRightPx,
          borderBottom: value.kopfzeile_aktiv ? '1px dashed #007AFF44' : undefined,
        }}>
          {KopfzeileZone}
        </div>

        {/* Body zone */}
        {!noBody && (
          <div style={{
            paddingLeft: marginLeftPx,
            paddingRight: marginRightPx,
            paddingTop: 16,
            paddingBottom: 16,
            minHeight: 400,
          }}>
            {BodyZone}
          </div>
        )}

        {/* Fußzeile zone */}
        <div style={{
          paddingBottom: marginBottomPx,
          paddingLeft: marginLeftPx,
          paddingRight: marginRightPx,
          borderTop: value.fusszeile_aktiv ? '1px dashed #FF950044' : undefined,
        }}>
          {FusszeileZone}
        </div>
      </div>
    </div>
  )
}

// ── Helper: empty default value ───────────────────────────────────────────────
export function emptyVorlagenEditorValue(): DokumentVorlagenEditorValue {
  return {
    body_content: { type: 'doc', content: [{ type: 'paragraph' }] },
    kopfzeile_content: null,
    fusszeile_content: null,
    kopfzeile_aktiv: false,
    fusszeile_aktiv: false,
    erste_seite_kein_header: true,
    seiten_layout: DEFAULT_LAYOUT,
  }
}
