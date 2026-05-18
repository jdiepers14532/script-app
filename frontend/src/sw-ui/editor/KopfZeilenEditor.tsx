/**
 * KopfZeilenEditor
 *
 * Ersetzt DokumentVorlagenEditor (noBody=true) mit SK-UX:
 * - Lineal + Tab-Stops + Rand-Drag
 * - Toolbar: Font, Größe, ZA, B/I/U, Ausrichtung, Sonderzeichen, Chips, Bild, Logo
 * - Drei Zonen: Links / Mitte / Rechts (per Tab-Switch)
 * - Kopfzeile + Fußzeile (per Tab-Switch)
 * - "Erste Seite: kein Header/Footer" Toggle
 *
 * Value-Format kompatibel mit DokumentVorlagenEditorValue (Subset).
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useEditor, EditorContent } from '@tiptap/react'
import type { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import UnderlineExt from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import TextStyle from '@tiptap/extension-text-style'
import FontFamily from '@tiptap/extension-font-family'
import { RulerBar } from './primitives/RulerBar'
import { TabKeyExtension } from './primitives/TabStopExtension'
import type { TabStop } from './primitives/TabStopExtension'
import { TAB_ALIGN_NEXT } from './primitives/TabStopExtension'
import { FontSizeExtension } from './extensions/FontSizeExtension'
import { ParagraphStyleExtension } from './extensions/ParagraphStyleExtension'
import { ResizableImageExtension } from './extensions/ResizableImageExtension'
import { PlaceholderChipExtension, PLACEHOLDER_CHIP_CSS, getPlaceholdersForZone, getPlaceholderColor, getPlaceholderLabel, PLACEHOLDER_DEFS } from './extensions/PlaceholderChipExtension'
import type { PlaceholderZone } from './extensions/PlaceholderChipExtension'

// ── CSS ───────────────────────────────────────────────────────────────────────

let cssInjected = false
function injectCss() {
  if (cssInjected || typeof document === 'undefined') return
  cssInjected = true
  const s = document.createElement('style')
  s.textContent = PLACEHOLDER_CHIP_CSS + `
.kz-editor .ProseMirror { outline: none; min-height: 28px; font-family: "Courier New", monospace; }
.kz-editor .ProseMirror p { margin: 0; }
`
  document.head.appendChild(s)
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SeitenLayout {
  format: 'a4' | 'letter'
  margin_top: number
  margin_bottom: number
  margin_left: number
  margin_right: number
}

export interface ZeilenContent {
  links:  any | null
  mitte:  any | null
  rechts: any | null
}

export interface KopfZeilenEditorValue {
  kopfzeile_content:       ZeilenContent | null
  fusszeile_content:       ZeilenContent | null
  kopfzeile_aktiv:         boolean
  fusszeile_aktiv:         boolean
  erste_seite_kein_header: boolean
  seiten_layout:           SeitenLayout
  tab_stops?:              TabStop[]
}

export function emptyKopfZeilenEditorValue(): KopfZeilenEditorValue {
  return {
    kopfzeile_content:       null,
    fusszeile_content:       null,
    kopfzeile_aktiv:         true,
    fusszeile_aktiv:         true,
    erste_seite_kein_header: true,
    seiten_layout:           { format: 'a4', margin_top: 20, margin_bottom: 20, margin_left: 30, margin_right: 25 },
    tab_stops:               [],
  }
}

function normalizeZone(c: any): ZeilenContent {
  if (!c) return { links: null, mitte: null, rechts: null }
  if ('links' in c || 'mitte' in c || 'rechts' in c) return c
  if (c?.type === 'doc') return { links: c, mitte: null, rechts: null }
  return { links: null, mitte: null, rechts: null }
}

// ── Tiptap-Extensions ────────────────────────────────────────────────────────

const KZ_EXTENSIONS = [
  StarterKit.configure({ horizontalRule: false }),
  UnderlineExt,
  TextAlign.configure({ types: ['paragraph'] }),
  TextStyle,
  FontFamily,
  FontSizeExtension,
  ParagraphStyleExtension,
  ResizableImageExtension,
  PlaceholderChipExtension,
  TabKeyExtension,
]

// ── Preview ────────────────────────────────────────────────────────────────────

export interface KZPreviewContext {
  produktion?: string; staffel?: string; block?: string; folge?: string | number
  folgentitel?: string; werkstufe?: string; fassung?: string; version?: string
  stand_datum?: string; autor?: string; regie?: string; firmenname?: string
  sender?: string; buero_adresse?: string; tel_produktion?: string
  sendedatum?: string; produktionszeitraum?: string; aktuelles_datum?: string
  aktuelles_uhrzeit?: string; aktuelles_jahr?: string; folge_laenge_netto?: string
  firmen_adresse?: string; rechtsform?: string; handelsregister?: string
  ust_id?: string; geschaeftsfuehrung?: string; firmen_email?: string
  firmen_telefon?: string; notiz_inhalt?: string
}

const DUMMY_CTX: KZPreviewContext = {
  produktion: 'Rote Rosen', staffel: '41', block: 'Block 4', folge: '8271',
  folgentitel: 'Das Familienrezept', werkstufe: 'Drehbuch', fassung: 'Rohfassung',
  version: 'V1', stand_datum: '15.05.2026', autor: 'Max Mustermann',
  regie: 'Lena Kaufmann', firmenname: 'Serienwerft GmbH', sender: 'Das Erste',
  buero_adresse: 'Hansestraße 1, 21335 Lüneburg', tel_produktion: '+49 4131 12345',
  sendedatum: 'Mo. 16.06.2026', produktionszeitraum: '01.02.2026 – 31.07.2026',
  aktuelles_datum: new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }),
  aktuelles_uhrzeit: new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', hour12: false }),
  aktuelles_jahr: String(new Date().getFullYear()),
  folge_laenge_netto: '42:18', firmen_adresse: 'Hansestraße 1, 21335 Lüneburg',
  rechtsform: 'GmbH', handelsregister: 'Amtsgericht Lüneburg HRB 205045',
  ust_id: 'DE118621282', geschaeftsfuehrung: 'Jan Diepers',
  firmen_email: 'info@serienwerft.studio', firmen_telefon: '+49 4131 98765',
  notiz_inhalt: '(Notiz-Inhalt)',
}

function buildCtxMap(ctx: KZPreviewContext): Record<string, string> {
  const map: Record<string, string> = {}
  PLACEHOLDER_DEFS.forEach(p => { map[p.key] = '' })
  map['{{produktion}}']         = String(ctx.produktion ?? '')
  map['{{staffel}}']            = String(ctx.staffel ?? '')
  map['{{block}}']              = String(ctx.block ?? '')
  map['{{folge}}']              = String(ctx.folge ?? '')
  map['{{folgentitel}}']        = String(ctx.folgentitel ?? '')
  map['{{werkstufe}}']          = String(ctx.werkstufe ?? '')
  map['{{fassung}}']            = String(ctx.fassung ?? '')
  map['{{version}}']            = String(ctx.version ?? '')
  map['{{stand_datum}}']        = String(ctx.stand_datum ?? '')
  map['{{autor}}']              = String(ctx.autor ?? '')
  map['{{regie}}']              = String(ctx.regie ?? '')
  map['{{firmenname}}']         = String(ctx.firmenname ?? '')
  map['{{firmen_adresse}}']     = String(ctx.firmen_adresse ?? '')
  map['{{rechtsform}}']         = String(ctx.rechtsform ?? '')
  map['{{handelsregister}}']    = String(ctx.handelsregister ?? '')
  map['{{ust_id}}']             = String(ctx.ust_id ?? '')
  map['{{geschaeftsfuehrung}}'] = String(ctx.geschaeftsfuehrung ?? '')
  map['{{firmen_email}}']       = String(ctx.firmen_email ?? '')
  map['{{firmen_telefon}}']     = String(ctx.firmen_telefon ?? '')
  map['{{sender}}']             = String(ctx.sender ?? '')
  map['{{buero_adresse}}']      = String(ctx.buero_adresse ?? '')
  map['{{tel_produktion}}']     = String(ctx.tel_produktion ?? '')
  map['{{sendedatum}}']         = String(ctx.sendedatum ?? '')
  map['{{produktionszeitraum}}'] = String(ctx.produktionszeitraum ?? '')
  map['{{aktuelles_datum}}']    = String(ctx.aktuelles_datum ?? '')
  map['{{aktuelles_uhrzeit}}']  = String(ctx.aktuelles_uhrzeit ?? '')
  map['{{aktuelles_jahr}}']     = String(ctx.aktuelles_jahr ?? '')
  map['{{folge_laenge_netto}}'] = String(ctx.folge_laenge_netto ?? '')
  map['{{notiz_inhalt}}']       = String(ctx.notiz_inhalt ?? '')
  map['{{seite}}']              = '42'
  map['{{seiten_gesamt}}']      = '84'
  return map
}

function pmInlineToReact(node: any, ctxMap: Record<string, string>, key: string): React.ReactNode {
  if (node.type === 'text') {
    let el: React.ReactNode = node.text ?? ''
    const marks: any[] = node.marks ?? []
    const tsAttr = marks.find((m: any) => m.type === 'textStyle')?.attrs ?? {}
    const style: React.CSSProperties = {}
    if (tsAttr.fontFamily) style.fontFamily = tsAttr.fontFamily
    if (tsAttr.fontSize)   style.fontSize   = tsAttr.fontSize
    if (Object.keys(style).length) el = <span style={style}>{el}</span>
    if (marks.find((m: any) => m.type === 'bold'))      el = <strong>{el}</strong>
    if (marks.find((m: any) => m.type === 'italic'))    el = <em>{el}</em>
    if (marks.find((m: any) => m.type === 'underline')) el = <u>{el}</u>
    return <span key={key}>{el}</span>
  }
  if (node.type === 'placeholder_chip') {
    const chipKey = node.attrs?.key ?? ''
    const val = ctxMap[chipKey] ?? chipKey
    return <span key={key} style={{ color: getPlaceholderColor(chipKey) }}>{val}</span>
  }
  if (node.type === 'hard_break') return <br key={key} />
  return null
}

function pmDocToReact(json: any, ctxMap: Record<string, string>): React.ReactNode {
  if (!json) return null
  const nodes = json.content ?? []
  return nodes.map((node: any, pi: number) => {
    if (node.type !== 'paragraph') return null
    const pa = node.attrs ?? {}
    const style: React.CSSProperties = {
      margin: 0,
      fontFamily: pa.fontFamily ?? undefined,
      fontSize:   pa.fontSize   ?? 10,
      lineHeight: pa.lineHeight ?? 1.4,
      textAlign:  pa.textAlign  ?? undefined,
    }
    const children = (node.content ?? []).map((child: any, ci: number) =>
      pmInlineToReact(child, ctxMap, `${pi}-${ci}`)
    )
    return <p key={pi} style={style}>{children.length ? children : <br />}</p>
  })
}

function ZonePreviewCell({ json, ctxMap, align }: { json: any; ctxMap: Record<string, string>; align: 'left' | 'center' | 'right' }) {
  return (
    <div style={{ flex: 1, textAlign: align, overflow: 'hidden' }}>
      {json ? pmDocToReact(json, ctxMap) : <span style={{ color: '#ddd', fontSize: 9 }}>—</span>}
    </div>
  )
}

const MM_TO_PX_PREV = 96 / 25.4

function KZPreviewModal({ value, previewContext, onClose }: {
  value: KopfZeilenEditorValue; previewContext?: KZPreviewContext; onClose: () => void
}) {
  const ctx    = previewContext ?? DUMMY_CTX
  const ctxMap = buildCtxMap(ctx)
  const sl     = value.seiten_layout
  const kz     = normalizeZone(value.kopfzeile_content)
  const fz     = normalizeZone(value.fusszeile_content)

  const A4_W   = 794
  const mL     = Math.round(sl.margin_left   * MM_TO_PX_PREV)
  const mR     = Math.round(sl.margin_right  * MM_TO_PX_PREV)
  const mT     = Math.round(sl.margin_top    * MM_TO_PX_PREV)
  const mB     = Math.round(sl.margin_bottom * MM_TO_PX_PREV)
  const SCALE  = Math.min(0.78, (window.innerWidth * 0.85) / A4_W)

  return createPortal(
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      zIndex: 99998, display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      paddingTop: 50, overflowY: 'auto',
    }} onClick={onClose}>
      <div style={{
        background: 'var(--bg-surface, #fff)', borderRadius: 12,
        padding: '16px 20px 20px',
        width: Math.round(A4_W * SCALE) + 64,
        maxWidth: '95vw', boxShadow: '0 8px 40px rgba(0,0,0,0.3)', marginBottom: 40,
      }} onClick={e => e.stopPropagation()}>

        {/* Modal-Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
            Vorschau Kopf-/Fußzeile — {sl.format === 'a4' ? 'A4' : 'US Letter'}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--text-secondary)', lineHeight: 1, padding: '0 4px' }}>×</button>
        </div>

        {/* Seiten-Simulation */}
        <div style={{ zoom: `${SCALE}`, width: A4_W, transformOrigin: 'top left' }}>
          <div style={{ width: A4_W, background: '#fff', color: '#000', border: '1px solid #ccc', borderRadius: 2, boxShadow: '0 2px 12px rgba(0,0,0,0.15)', overflow: 'hidden' }}>

            {/* Kopfzeile */}
            {value.kopfzeile_aktiv ? (
              <div style={{ paddingTop: mT, paddingLeft: mL, paddingRight: mR, paddingBottom: 8, borderBottom: '1px dashed #007AFF44' }}>
                <div style={{ fontSize: 8, color: '#007AFF', fontWeight: 700, marginBottom: 4, letterSpacing: 0.5 }}>KOPFZEILE</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <ZonePreviewCell json={kz.links}  ctxMap={ctxMap} align="left" />
                  <ZonePreviewCell json={kz.mitte}  ctxMap={ctxMap} align="center" />
                  <ZonePreviewCell json={kz.rechts} ctxMap={ctxMap} align="right" />
                </div>
              </div>
            ) : (
              <div style={{ paddingTop: mT, paddingLeft: mL, paddingRight: mR, paddingBottom: 8 }}>
                <div style={{ fontSize: 8, color: '#ccc' }}>KOPFZEILE (deaktiviert)</div>
              </div>
            )}

            {/* Seiten-Inhalt (Platzhalter) */}
            <div style={{
              margin: `12px ${mL}px`,
              height: 220,
              background: 'repeating-linear-gradient(0deg, #fafafa, #fafafa 15px, #f0f0f0 15px, #f0f0f0 16px)',
              borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontSize: 10, color: '#ccc', fontStyle: 'italic' }}>Seiteninhalt</span>
            </div>

            {/* Fußzeile */}
            {value.fusszeile_aktiv ? (
              <div style={{ paddingBottom: mB, paddingLeft: mL, paddingRight: mR, paddingTop: 8, borderTop: '1px dashed #FF950044' }}>
                <div style={{ fontSize: 8, color: '#FF9500', fontWeight: 700, marginBottom: 4, letterSpacing: 0.5 }}>FUSSZEILE</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <ZonePreviewCell json={fz.links}  ctxMap={ctxMap} align="left" />
                  <ZonePreviewCell json={fz.mitte}  ctxMap={ctxMap} align="center" />
                  <ZonePreviewCell json={fz.rechts} ctxMap={ctxMap} align="right" />
                </div>
              </div>
            ) : (
              <div style={{ paddingBottom: mB, paddingLeft: mL, paddingRight: mR, paddingTop: 8 }}>
                <div style={{ fontSize: 8, color: '#ccc' }}>FUSSZEILE (deaktiviert)</div>
              </div>
            )}
          </div>
        </div>

        {/* Footer-Hinweis */}
        <div style={{ marginTop: 10, fontSize: 9, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          {previewContext ? 'Echte Vorschau-Daten' : 'Demo-Daten'} · L {sl.margin_left}mm / R {sl.margin_right}mm · T {sl.margin_top}mm / B {sl.margin_bottom}mm
          {value.erste_seite_kein_header && (
            <span style={{ marginLeft: 8 }}>· Erste Seite ohne KZ/FZ</span>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

// ── Konstanten ────────────────────────────────────────────────────────────────

const FONT_OPTIONS = [
  { value: 'Courier New',     label: 'Courier New' },
  { value: 'Arial',           label: 'Arial' },
  { value: 'Helvetica',       label: 'Helvetica' },
  { value: 'Times New Roman', label: 'Times New Roman' },
  { value: 'Georgia',         label: 'Georgia' },
  { value: 'Inter',           label: 'Inter' },
]
const SIZE_OPTIONS = ['8pt', '9pt', '10pt', '11pt', '12pt', '14pt', '16pt', '18pt', '20pt', '24pt']
const LH_OPTIONS = [
  { value: '1',    label: '1,0' },
  { value: '1.15', label: '1,15' },
  { value: '1.5',  label: '1,5' },
  { value: '2',    label: '2,0' },
]
const SPECIAL_CHARS = [
  { char: '©', title: 'Copyright' },
  { char: '®', title: 'Registered Trademark' },
  { char: '™', title: 'Trademark' },
]

// ── Toolbar ───────────────────────────────────────────────────────────────────

function selStyle(extra?: React.CSSProperties): React.CSSProperties {
  return {
    height: 22, fontSize: 11, border: '1px solid var(--border, #e0e0e0)',
    borderRadius: 3, background: 'var(--bg, #fff)', cursor: 'pointer',
    padding: '0 4px', fontFamily: 'inherit', ...extra,
  }
}
function btnStyle(active: boolean, extra?: React.CSSProperties): React.CSSProperties {
  return {
    padding: '0 7px', height: 22, borderRadius: 3, lineHeight: '22px',
    border: `1px solid ${active ? 'transparent' : 'var(--border, #e0e0e0)'}`,
    fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
    background: active ? 'var(--text-primary, #000)' : 'transparent',
    color: active ? '#fff' : 'var(--text-primary, #000)',
    ...extra,
  }
}
const Sep = () => <div style={{ width: 1, height: 16, background: 'var(--border, #e0e0e0)', margin: '0 2px', flexShrink: 0 }} />

interface KZToolbarProps {
  editor: Editor | null
  zone: PlaceholderZone
  onInsertImage: () => void
}

function KZToolbar({ editor, zone, onInsertImage }: KZToolbarProps) {
  const [, tick] = useState(0)
  useEffect(() => {
    if (!editor) return
    const h = () => tick(n => n + 1)
    editor.on('selectionUpdate', h)
    editor.on('transaction', h)
    return () => { editor.off('selectionUpdate', h); editor.off('transaction', h) }
  }, [editor])
  const [imgLoading, setImgLoading] = useState(false)

  if (!editor) return null

  const para = editor.getAttributes('paragraph')
  const ts   = editor.getAttributes('textStyle')

  const curFont = ts.fontFamily ?? para.fontFamily ?? ''
  const curSize = ts.fontSize   ?? para.fontSize   ?? ''
  const curLH   = para.lineHeight ?? ''

  const setParaAttr = (k: string, v: string | null) =>
    editor.chain().focus().updateAttributes('paragraph', { [k]: v || null }).run()

  const chips = getPlaceholdersForZone(zone)

  const loadFirmenlogo = async () => {
    setImgLoading(true)
    try {
      const res  = await fetch('https://auth.serienwerft.studio/api/public/company-info')
      const data = await res.json()
      const url  = data?.logos?.light ?? data?.logo_url
      if (!url) { alert('Kein Firmenlogo konfiguriert.'); return }
      ;(editor as any)?.chain().focus().setResizableImage({ src: url, width: 80 }).run()
    } catch { alert('Firmenlogo konnte nicht geladen werden.') }
    finally { setImgLoading(false) }
  }

  return (
    <div style={{
      display: 'flex', gap: 3, padding: '5px 8px',
      borderBottom: '1px solid var(--border, #e0e0e0)',
      background: 'var(--bg-subtle, #f5f5f5)',
      flexWrap: 'wrap', alignItems: 'center', flexShrink: 0,
    }}>
      {/* Font */}
      <select value={curFont} onChange={e => setParaAttr('fontFamily', e.target.value)} style={selStyle()}>
        <option value="">Schrift…</option>
        {FONT_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
      </select>
      <select value={curSize} onChange={e => setParaAttr('fontSize', e.target.value)} style={selStyle({ width: 62 })}>
        <option value="">Größe…</option>
        {SIZE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <select value={curLH} onChange={e => setParaAttr('lineHeight', e.target.value)} style={selStyle({ width: 56 })}>
        <option value="">ZA…</option>
        {LH_OPTIONS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
      </select>

      <Sep />

      {/* Formatierung */}
      <button onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleBold().run() }}
        style={btnStyle(editor.isActive('bold'))}>B</button>
      <button onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleItalic().run() }}
        style={btnStyle(editor.isActive('italic'), { fontStyle: 'italic' })}>I</button>
      <button onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleUnderline().run() }}
        style={btnStyle(editor.isActive('underline'), { textDecoration: 'underline' })}>U</button>

      <Sep />

      {/* Ausrichtung */}
      <button onMouseDown={e => { e.preventDefault(); editor.chain().focus().setTextAlign('left').run() }}
        style={btnStyle(editor.isActive({ textAlign: 'left' }))} title="Linksbündig">⬅</button>
      <button onMouseDown={e => { e.preventDefault(); editor.chain().focus().setTextAlign('center').run() }}
        style={btnStyle(editor.isActive({ textAlign: 'center' }))} title="Zentriert">↔</button>
      <button onMouseDown={e => { e.preventDefault(); editor.chain().focus().setTextAlign('right').run() }}
        style={btnStyle(editor.isActive({ textAlign: 'right' }))} title="Rechtsbündig">➡</button>

      <Sep />

      {/* Sonderzeichen */}
      {SPECIAL_CHARS.map(sc => (
        <button key={sc.char}
          onMouseDown={e => { e.preventDefault(); editor.chain().focus().insertContent(sc.char).run() }}
          style={btnStyle(false, { fontWeight: 400, minWidth: 22 })} title={sc.title}>
          {sc.char}
        </button>
      ))}

      <Sep />

      {/* Bild + Logo */}
      <button onMouseDown={e => { e.preventDefault(); onInsertImage() }}
        style={btnStyle(false, { fontWeight: 400 })} title="Bild einfügen">🖼</button>
      <button onMouseDown={e => { e.preventDefault(); void loadFirmenlogo() }}
        disabled={imgLoading}
        style={btnStyle(false, { fontWeight: 400, opacity: imgLoading ? 0.5 : 1 })} title="Firmenlogo einfügen">
        {imgLoading ? '…' : 'Logo'}
      </button>

      {chips.length > 0 && (
        <>
          <Sep />
          <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            {chips.map(p => (
              <button key={p.key}
                onMouseDown={e => {
                  e.preventDefault()
                  editor.chain().focus().insertContent({
                    type: 'placeholder_chip', attrs: { key: p.key }
                  }).run()
                }}
                style={{
                  padding: '0 6px', height: 20, borderRadius: 10, border: 'none',
                  background: getPlaceholderColor(p.key) + '22',
                  color: getPlaceholderColor(p.key),
                  fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                }} title={p.beschreibung}>
                {getPlaceholderLabel(p.key)}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Einzelner Zonen-Editor ────────────────────────────────────────────────────

function ZoneEditor({
  content, onChange, placeholder, onFocus,
}: {
  content: any; onChange: (c: any) => void; placeholder?: string; onFocus?: () => void
}) {
  const lastEmit = useRef('')
  const editor = useEditor({
    extensions: KZ_EXTENSIONS,
    content: content || { type: 'doc', content: [{ type: 'paragraph' }] },
    onUpdate: ({ editor: e }) => {
      const json = JSON.stringify(e.getJSON())
      if (json !== lastEmit.current) { lastEmit.current = json; onChange(e.getJSON()) }
    },
    onFocus: () => onFocus?.(),
    editorProps: {
      attributes: { class: 'kz-editor' },
    },
  })
  return (
    <div style={{ minHeight: 32, padding: '4px 8px', cursor: 'text' }}
      onClick={() => editor?.commands.focus()}>
      {(!content && placeholder && !editor?.isFocused) && (
        <div style={{ fontSize: 11, color: 'var(--text-muted, #aaa)', pointerEvents: 'none', position: 'absolute' }}>
          {placeholder}
        </div>
      )}
      {editor && <EditorContent editor={editor} />}
    </div>
  )
}

// ── Haupt-Komponente ──────────────────────────────────────────────────────────

interface KopfZeilenEditorProps {
  value: KopfZeilenEditorValue
  onChange: (v: KopfZeilenEditorValue) => void
  readOnly?: boolean
  previewContext?: KZPreviewContext
}

type ZeileName = 'kopfzeile' | 'fusszeile'
type ZoneName  = 'links' | 'mitte' | 'rechts'

export default function KopfZeilenEditor({ value, onChange, readOnly = false, previewContext }: KopfZeilenEditorProps) {
  injectCss()
  const containerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [showPreview, setShowPreview] = useState(false)

  const [activeZeile, setActiveZeile]   = useState<ZeileName>('kopfzeile')
  const [activeZone,  setActiveZone]    = useState<ZoneName>('links')
  const [activeEditor, setActiveEditor] = useState<Editor | null>(null)

  // Aktiven Tiptap-Editor tracken
  const [linksEditorKZ,  setLinksEditorKZ]  = useState<Editor | null>(null)
  const [mitteEditorKZ,  setMitteEditorKZ]  = useState<Editor | null>(null)
  const [rechtsEditorKZ, setRechtsEditorKZ] = useState<Editor | null>(null)
  const [linksEditorFZ,  setLinksEditorFZ]  = useState<Editor | null>(null)
  const [mitteEditorFZ,  setMitteEditorFZ]  = useState<Editor | null>(null)
  const [rechtsEditorFZ, setRechtsEditorFZ] = useState<Editor | null>(null)

  const kzContent = normalizeZone(value.kopfzeile_content)
  const fzContent = normalizeZone(value.fusszeile_content)

  const sl = value.seiten_layout
  const rulerCm      = sl.format === 'letter' ? 21.59 : 21
  const marginLeftCm  = sl.margin_left  / 10
  const marginRightCm = sl.margin_right / 10
  const tabStops      = value.tab_stops ?? []

  const setActiveByZoneZeile = (zeile: ZeileName, zone: ZoneName) => {
    const map: Record<string, Editor | null> = {
      'kopfzeile-links': linksEditorKZ, 'kopfzeile-mitte': mitteEditorKZ, 'kopfzeile-rechts': rechtsEditorKZ,
      'fusszeile-links': linksEditorFZ, 'fusszeile-mitte': mitteEditorFZ, 'fusszeile-rechts': rechtsEditorFZ,
    }
    setActiveEditor(map[`${zeile}-${zone}`] ?? null)
  }

  useEffect(() => {
    setActiveByZoneZeile(activeZeile, activeZone)
  }, [activeZeile, activeZone, linksEditorKZ, mitteEditorKZ, rechtsEditorKZ, linksEditorFZ, mitteEditorFZ, rechtsEditorFZ])

  const updateZone = (zeile: ZeileName, zone: ZoneName, content: any) => {
    const key   = zeile === 'kopfzeile' ? 'kopfzeile_content' : 'fusszeile_content'
    const cur   = normalizeZone(zeile === 'kopfzeile' ? value.kopfzeile_content : value.fusszeile_content)
    onChange({ ...value, [key]: { ...cur, [zone]: content } })
  }

  const handleToggleTabStop = useCallback((pos: number) => {
    const existing = tabStops.find(ts => Math.abs(ts.pos - pos) < 0.2)
    if (existing) {
      const next = TAB_ALIGN_NEXT[existing.align]
      const updated = next
        ? tabStops.map(ts => Math.abs(ts.pos - pos) < 0.2 ? { ...ts, align: next } : ts)
        : tabStops.filter(ts => Math.abs(ts.pos - pos) >= 0.2)
      onChange({ ...value, tab_stops: updated })
    } else {
      onChange({ ...value, tab_stops: [...tabStops, { pos, align: 'left' }] })
    }
  }, [tabStops, value, onChange])

  const handleMarginChange = useCallback((side: 'left' | 'right', mm: number) => {
    onChange({
      ...value,
      seiten_layout: {
        ...value.seiten_layout,
        [side === 'left' ? 'margin_left' : 'margin_right']: mm,
      },
    })
  }, [value, onChange])

  const handleInsertImage = () => fileInputRef.current?.click()
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !activeEditor) return
    const reader = new FileReader()
    reader.onload = ev => {
      const src = ev.target?.result as string
      ;(activeEditor as any)?.chain().focus().setResizableImage({ src, width: 120 }).run()
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const plZone: PlaceholderZone = activeZeile === 'kopfzeile' ? 'kopfzeile' : 'fusszeile'

  const ZEILEN: { id: ZeileName; label: string; aktiv: boolean }[] = [
    { id: 'kopfzeile', label: 'Kopfzeile', aktiv: value.kopfzeile_aktiv },
    { id: 'fusszeile', label: 'Fußzeile',  aktiv: value.fusszeile_aktiv },
  ]
  const ZONEN: ZoneName[] = ['links', 'mitte', 'rechts']

  return (
    <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--border, #e0e0e0)', borderRadius: 8, overflow: 'hidden' }}>
      {/* Toggle-Leiste */}
      <div style={{ display: 'flex', gap: 16, padding: '8px 12px', background: 'var(--bg-subtle, #f5f5f5)', borderBottom: '1px solid var(--border, #e0e0e0)', alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
        {ZEILEN.map(z => (
          <label key={z.id} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 12 }}>
            <input type="checkbox" checked={z.aktiv}
              onChange={e => onChange({ ...value, [z.id === 'kopfzeile' ? 'kopfzeile_aktiv' : 'fusszeile_aktiv']: e.target.checked })} />
            {z.label} aktiv
          </label>
        ))}
        <div style={{ width: 1, height: 16, background: 'var(--border, #e0e0e0)' }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 12 }}>
          <input type="checkbox" checked={value.erste_seite_kein_header}
            onChange={e => onChange({ ...value, erste_seite_kein_header: e.target.checked })} />
          Erste Seite: kein KZ/FZ
        </label>
        <div style={{ flex: 1 }} />
        {/* Seitenformat */}
        <select value={sl.format}
          onChange={e => onChange({ ...value, seiten_layout: { ...sl, format: e.target.value as 'a4' | 'letter' } })}
          style={selStyle({ fontSize: 11 })}>
          <option value="a4">A4</option>
          <option value="letter">US Letter</option>
        </select>
        <label style={{ fontSize: 11, color: 'var(--text-secondary, #666)' }}>L</label>
        <input type="number" value={sl.margin_left} min={0} max={80}
          onChange={e => onChange({ ...value, seiten_layout: { ...sl, margin_left: Number(e.target.value) } })}
          style={selStyle({ width: 42, textAlign: 'right' })} />
        <label style={{ fontSize: 11, color: 'var(--text-secondary, #666)' }}>R</label>
        <input type="number" value={sl.margin_right} min={0} max={80}
          onChange={e => onChange({ ...value, seiten_layout: { ...sl, margin_right: Number(e.target.value) } })}
          style={selStyle({ width: 42, textAlign: 'right' })} />
      </div>

      {/* Toolbar */}
      {!readOnly && (
        <KZToolbar
          editor={activeEditor}
          zone={plZone}
          onInsertImage={handleInsertImage}
        />
      )}

      {/* Lineal */}
      {!readOnly && (
        <div ref={containerRef} style={{ position: 'relative' }}>
          <RulerBar
            tabStops={tabStops}
            onToggle={handleToggleTabStop}
            containerRef={containerRef}
            rulerCm={rulerCm}
            marginLeftCm={marginLeftCm}
            marginRightCm={marginRightCm}
            onMarginChange={handleMarginChange}
          />
        </div>
      )}

      {/* Zeilen- + Zonen-Tabs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, borderBottom: '1px solid var(--border, #e0e0e0)', flexShrink: 0 }}>
        {/* Zeilen-Tabs */}
        <div style={{ display: 'flex' }}>
          {ZEILEN.map(z => (
            <button key={z.id} onClick={() => setActiveZeile(z.id)}
              style={{
                padding: '6px 14px', fontSize: 12, cursor: 'pointer', border: 'none',
                borderRight: '1px solid var(--border, #e0e0e0)',
                background: activeZeile === z.id ? 'var(--bg, #fff)' : 'var(--bg-subtle, #f5f5f5)',
                fontWeight: activeZeile === z.id ? 600 : 400,
                color: activeZeile === z.id ? 'var(--text-primary, #000)' : 'var(--text-secondary, #666)',
                borderBottom: activeZeile === z.id ? '2px solid #007AFF' : '2px solid transparent',
                fontFamily: 'inherit',
              }}>
              {z.label}
              {!z.aktiv && <span style={{ fontSize: 9, color: 'var(--text-muted, #aaa)', marginLeft: 4 }}>aus</span>}
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        {/* Zonen-Tabs */}
        <div style={{ display: 'flex', gap: 2, padding: '0 8px' }}>
          {ZONEN.map(z => (
            <button key={z} onClick={() => setActiveZone(z)}
              style={{
                padding: '4px 10px', fontSize: 11, cursor: 'pointer', borderRadius: 4,
                border: `1px solid ${activeZone === z ? '#007AFF' : 'var(--border, #e0e0e0)'}`,
                background: activeZone === z ? '#007AFF15' : 'transparent',
                color: activeZone === z ? '#007AFF' : 'var(--text-secondary, #666)',
                fontWeight: activeZone === z ? 600 : 400,
                fontFamily: 'inherit',
              }}>
              {z.charAt(0).toUpperCase() + z.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Editor-Bereiche */}
      <div style={{ display: 'flex', minHeight: 60, position: 'relative' }}>
        {/* Kopfzeile Zonen */}
        {activeZeile === 'kopfzeile' && (
          <>
            <div style={{ flex: 1, display: activeZone === 'links' ? 'block' : 'none', borderRight: '1px solid var(--border, #e0e0e0)' }}>
              <ZoneEditorWithRef content={kzContent.links} onChange={c => updateZone('kopfzeile', 'links', c)}
                placeholder="Links…" onReady={setLinksEditorKZ} onFocus={() => { setActiveZone('links'); setActiveZeile('kopfzeile') }} />
            </div>
            <div style={{ flex: 1, display: activeZone === 'mitte' ? 'block' : 'none', borderRight: '1px solid var(--border, #e0e0e0)' }}>
              <ZoneEditorWithRef content={kzContent.mitte} onChange={c => updateZone('kopfzeile', 'mitte', c)}
                placeholder="Mitte…" onReady={setMitteEditorKZ} onFocus={() => { setActiveZone('mitte'); setActiveZeile('kopfzeile') }} />
            </div>
            <div style={{ flex: 1, display: activeZone === 'rechts' ? 'block' : 'none' }}>
              <ZoneEditorWithRef content={kzContent.rechts} onChange={c => updateZone('kopfzeile', 'rechts', c)}
                placeholder="Rechts…" onReady={setRechtsEditorKZ} onFocus={() => { setActiveZone('rechts'); setActiveZeile('kopfzeile') }} />
            </div>
          </>
        )}
        {/* Fußzeile Zonen */}
        {activeZeile === 'fusszeile' && (
          <>
            <div style={{ flex: 1, display: activeZone === 'links' ? 'block' : 'none', borderRight: '1px solid var(--border, #e0e0e0)' }}>
              <ZoneEditorWithRef content={fzContent.links} onChange={c => updateZone('fusszeile', 'links', c)}
                placeholder="Links…" onReady={setLinksEditorFZ} onFocus={() => { setActiveZone('links'); setActiveZeile('fusszeile') }} />
            </div>
            <div style={{ flex: 1, display: activeZone === 'mitte' ? 'block' : 'none', borderRight: '1px solid var(--border, #e0e0e0)' }}>
              <ZoneEditorWithRef content={fzContent.mitte} onChange={c => updateZone('fusszeile', 'mitte', c)}
                placeholder="Mitte…" onReady={setMitteEditorFZ} onFocus={() => { setActiveZone('mitte'); setActiveZeile('fusszeile') }} />
            </div>
            <div style={{ flex: 1, display: activeZone === 'rechts' ? 'block' : 'none' }}>
              <ZoneEditorWithRef content={fzContent.rechts} onChange={c => updateZone('fusszeile', 'rechts', c)}
                placeholder="Rechts…" onReady={setRechtsEditorFZ} onFocus={() => { setActiveZone('rechts'); setActiveZeile('fusszeile') }} />
            </div>
          </>
        )}
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />

      {/* Footer: Vorschau-Button */}
      <div style={{
        padding: '4px 8px', borderTop: '1px solid var(--border, #e0e0e0)',
        background: 'var(--bg-subtle, #f5f5f5)',
        display: 'flex', justifyContent: 'flex-end', flexShrink: 0,
      }}>
        <button
          onMouseDown={e => e.preventDefault()}
          onClick={() => setShowPreview(true)}
          style={{
            padding: '2px 10px', borderRadius: 4, fontSize: 10, cursor: 'pointer',
            background: 'transparent', border: '1px solid var(--border, #e0e0e0)',
            color: 'var(--text-secondary)', fontFamily: 'inherit',
          }}
        >
          Vorschau
        </button>
      </div>

      {showPreview && (
        <KZPreviewModal
          value={value}
          previewContext={previewContext}
          onClose={() => setShowPreview(false)}
        />
      )}
    </div>
  )
}

// ── ZoneEditorWithRef ─────────────────────────────────────────────────────────

function ZoneEditorWithRef({
  content, onChange, placeholder, onReady, onFocus,
}: {
  content: any; onChange: (c: any) => void; placeholder?: string
  onReady: (e: Editor) => void; onFocus: () => void
}) {
  const lastEmit = useRef('')
  const editor = useEditor({
    extensions: KZ_EXTENSIONS,
    content: content || { type: 'doc', content: [{ type: 'paragraph' }] },
    onUpdate: ({ editor: e }) => {
      const json = JSON.stringify(e.getJSON())
      if (json !== lastEmit.current) { lastEmit.current = json; onChange(e.getJSON()) }
    },
    onFocus: () => onFocus(),
    editorProps: { attributes: { class: 'kz-editor' } },
  })
  useEffect(() => { if (editor) onReady(editor) }, [editor])

  return (
    <div style={{ minHeight: 32, padding: '4px 8px', cursor: 'text', position: 'relative' }}
      onClick={() => editor?.commands.focus()}>
      {!content && placeholder && (
        <div style={{ fontSize: 11, color: 'var(--text-muted, #aaa)', pointerEvents: 'none', position: 'absolute', top: 4, left: 8 }}>
          {placeholder}
        </div>
      )}
      {editor && <EditorContent editor={editor} />}
    </div>
  )
}
