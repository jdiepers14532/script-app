import { useState, useEffect, useCallback, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import { X, Check, Bold, Italic, Underline as UnderlineIcon, Shield, GripVertical, ChevronLeft, ChevronRight } from 'lucide-react'
import { api } from '../../api/client'
import { useSelectedProduction } from '../../contexts'

// ── Types & constants ─────────────────────────────────────────────────────────

type DeskriptorStufe = 'leicht' | 'mittel' | 'stark'
interface DeskriptorItem { kategorie: string; stufe: DeskriptorStufe; beschreibung: string }

const FSK_LEVELS = ['0', '6', '12', '16', '18']
const FSK_COLORS: Record<string, string> = {
  '0': '#00C853', '6': '#00C853', '12': '#FF9500', '16': '#FF6B00', '18': '#FF3B30'
}
const STUFE_COLORS: Record<DeskriptorStufe, string> = { leicht: '#00C853', mittel: '#FF9500', stark: '#FF3B30' }
const DESKRIPTOR_KATEGORIEN: string[] = [
  'Gewaltdarstellungen', 'Sexualisierte Darstellungen', 'Beängstigende Szenen',
  'Sprache (Schimpfwörter)', 'Drogen, Alkohol & Tabak', 'Diskriminierung',
  'Suizid & Selbstverletzung', 'Thematisch belastend',
]

type Tab = 'titel' | 'kurzinhalt' | 'redaktion' | 'lektor' | 'strang' | 'programmpresse' | 'pressetext' | 'deskriptoren' | 'fsk'

const TABS: { id: Tab; label: string; desc: string }[] = [
  { id: 'titel',          label: 'Titel',          desc: '1–3 Wörter' },
  { id: 'kurzinhalt',     label: 'Kurzinhalt',     desc: 'strukturiert' },
  { id: 'redaktion',      label: 'Redaktion',      desc: '300–500 Wörter' },
  { id: 'lektor',         label: 'Lektor',         desc: 'chronol.' },
  { id: 'strang',         label: 'Strang',         desc: '≤300 Zeichen' },
  { id: 'programmpresse', label: 'Programmpresse', desc: '300–450 Zeichen' },
  { id: 'pressetext',     label: 'Pressetext',     desc: '280–330 Zeichen' },
  { id: 'deskriptoren',   label: 'Deskriptoren',   desc: 'JuSchG' },
  { id: 'fsk',            label: 'FSK',            desc: 'Altersfreigabe' },
]

// ── Layout constants ───────────────────────────────────────────────────────────

const DEFAULT_W = 840
const DEFAULT_H = 680
const MIN_W = 520
const MIN_H = 380

interface Layout { x: number; y: number; width: number; height: number }

// Module-level cache — survives modal close/reopen within same session (no flicker)
let cachedLayout: Layout | null = null

function centeredLayout(): Layout {
  const w = Math.min(DEFAULT_W, window.innerWidth - 32)
  const h = Math.min(DEFAULT_H, window.innerHeight - 32)
  return {
    x: Math.round((window.innerWidth  - w) / 2),
    y: Math.round((window.innerHeight - h) / 2),
    width: w,
    height: h,
  }
}

function clampLayout(l: Layout): Layout {
  const w = Math.max(MIN_W, Math.min(l.width,  window.innerWidth))
  const h = Math.max(MIN_H, Math.min(l.height, window.innerHeight))
  const x = Math.max(0, Math.min(l.x, window.innerWidth  - w))
  const y = Math.max(0, Math.min(l.y, window.innerHeight - 60))
  return { x, y, width: w, height: h }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function charCount(html: string) {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().length
}
function wordCount(html: string) {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).length
}
function isEmpty(h: string | undefined) { return !h || h === '<p></p>' }

function clientXY(e: MouseEvent | TouchEvent): { x: number; y: number } {
  if ('touches' in e) return { x: e.touches[0].clientX, y: e.touches[0].clientY }
  return { x: e.clientX, y: e.clientY }
}

// ── Rich Editor ───────────────────────────────────────────────────────────────

function RichToolbar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  if (!editor) return null
  const btn = (active: boolean, onPress: () => void, icon: React.ReactNode, title: string) => (
    <button
      onMouseDown={e => { e.preventDefault(); onPress() }}
      title={title}
      style={{
        width: 28, height: 28, borderRadius: 5, border: 'none', cursor: 'pointer',
        background: active ? 'var(--bg-active)' : 'transparent',
        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >{icon}</button>
  )
  return (
    <div style={{ display: 'flex', gap: 2, padding: '5px 8px', borderBottom: '1px solid var(--border)', background: 'var(--bg-subtle)' }}>
      {btn(editor.isActive('bold'),      () => editor.chain().focus().toggleBold().run(),      <Bold size={13} />,          'Fett')}
      {btn(editor.isActive('italic'),    () => editor.chain().focus().toggleItalic().run(),    <Italic size={13} />,        'Kursiv')}
      {btn(editor.isActive('underline'), () => editor.chain().focus().toggleUnderline().run(), <UnderlineIcon size={13} />, 'Unterstrichen')}
    </div>
  )
}

function RichEditor({ editor, minHeight = 140 }: { editor: ReturnType<typeof useEditor>; minHeight?: number }) {
  if (!editor) return null
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      <RichToolbar editor={editor} />
      <EditorContent
        editor={editor}
        style={{ minHeight, padding: '10px 12px', fontSize: 14, lineHeight: 1.7, background: 'var(--input-bg)', color: 'var(--text-primary)' }}
      />
    </div>
  )
}

// ── Modal ─────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onClose: () => void
  folgeId: number
  folgeNummer: number
  folgenList?: Array<{ id: number; folge_nummer: number }>
  onNavigate?: (folgeId: number, folgeNummer: number) => void
}

export default function FolgeMetaDatenModal({ open, onClose, folgeId, folgeNummer, folgenList, onNavigate }: Props) {
  const { selectedProduction } = useSelectedProduction()
  const [deskriptorVorlagen, setDeskriptorVorlagen] = useState<string[]>(DESKRIPTOR_KATEGORIEN)
  const [activeTab, setActiveTab] = useState<Tab>('titel')
  const [loading, setLoading] = useState(false)

  const [selectedTitel, setSelectedTitel] = useState('')
  const [titelAlternativen, setTitelAlternativen] = useState<string[]>([])
  const [strangText, setStrangText]       = useState('')
  const [deskriptoren, setDeskriptoren]   = useState<DeskriptorItem[]>([])
  const [fskRating, setFskRating]         = useState('12')
  const [fskBegruendung, setFskBegruendung] = useState('')

  const [pendingLoadData, setPendingLoadData] = useState<any>(null)
  const [saveLoading, setSaveLoading] = useState(false)
  const [saveMsg, setSaveMsg]         = useState<string | null>(null)

  // ── Layout (position + size) ────────────────────────────────────────────────
  const [layout, setLayout] = useState<Layout | null>(null)
  const layoutRef = useRef<Layout | null>(null)
  const saveLayoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevFolgeRef = useRef<{ id: number; folge_nummer: number } | null>(null)
  const nextFolgeRef = useRef<{ id: number; folge_nummer: number } | null>(null)
  const navigateToRef = useRef<((f: { id: number; folge_nummer: number }) => void) | null>(null)

  // Sync ref so drag closures always see latest layout
  useEffect(() => { layoutRef.current = layout }, [layout])

  // Apply layout from backend or cache on first open
  useEffect(() => {
    if (!open) return
    if (cachedLayout) {
      setLayout(clampLayout(cachedLayout))
      return
    }
    api.getSettings()
      .then(s => {
        const saved = s?.ui_settings?.meta_daten_modal_layout
        const l = (saved?.width && saved?.height && saved?.x != null && saved?.y != null)
          ? clampLayout(saved as Layout)
          : centeredLayout()
        cachedLayout = l
        setLayout(l)
      })
      .catch(() => {
        const l = centeredLayout()
        cachedLayout = l
        setLayout(l)
      })
  }, [open])

  function applyLayout(l: Layout) {
    const clamped = clampLayout(l)
    cachedLayout = clamped
    setLayout(clamped)
    // Debounced backend save
    if (saveLayoutTimerRef.current) clearTimeout(saveLayoutTimerRef.current)
    saveLayoutTimerRef.current = setTimeout(() => {
      api.updateSettings({ ui_settings: { meta_daten_modal_layout: clamped } }).catch(() => {})
    }, 800)
  }

  // ── Drag (header) ─────────────────────────────────────────────────────────

  function handleDragStart(e: React.MouseEvent | React.TouchEvent) {
    if (!layoutRef.current) return
    // Don't drag when clicking buttons/inputs inside header
    if ((e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    const start = clientXY(e.nativeEvent as MouseEvent | TouchEvent)
    const startLayout = { ...layoutRef.current }
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'grabbing'

    function onMove(ev: MouseEvent | TouchEvent) {
      const cur = clientXY(ev)
      applyLayout({
        ...startLayout,
        x: startLayout.x + (cur.x - start.x),
        y: startLayout.y + (cur.y - start.y),
      })
    }
    function onUp() {
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.removeEventListener('touchmove', onMove as EventListener)
      document.removeEventListener('touchend', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    document.addEventListener('touchmove', onMove as EventListener, { passive: false })
    document.addEventListener('touchend', onUp)
  }

  // ── Resize (bottom-right grip) ────────────────────────────────────────────

  function handleResizeStart(e: React.MouseEvent | React.TouchEvent) {
    if (!layoutRef.current) return
    e.preventDefault()
    e.stopPropagation()
    const start = clientXY(e.nativeEvent as MouseEvent | TouchEvent)
    const startLayout = { ...layoutRef.current }
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'nwse-resize'

    function onMove(ev: MouseEvent | TouchEvent) {
      const cur = clientXY(ev)
      applyLayout({
        ...startLayout,
        width:  startLayout.width  + (cur.x - start.x),
        height: startLayout.height + (cur.y - start.y),
      })
    }
    function onUp() {
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.removeEventListener('touchmove', onMove as EventListener)
      document.removeEventListener('touchend', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    document.addEventListener('touchmove', onMove as EventListener, { passive: false })
    document.addEventListener('touchend', onUp)
  }

  // ── Editors ──────────────────────────────────────────────────────────────

  const kurzEditor       = useEditor({ extensions: [StarterKit, Underline], content: '<p></p>' })
  const redaktionEditor  = useEditor({ extensions: [StarterKit, Underline], content: '<p></p>' })
  const lektorEditor     = useEditor({ extensions: [StarterKit, Underline], content: '<p></p>' })
  const presseEditor     = useEditor({ extensions: [StarterKit, Underline], content: '<p></p>' })
  const pressetextEditor = useEditor({ extensions: [StarterKit, Underline], content: '<p></p>' })

  // Apply pending load data when editors are ready
  useEffect(() => {
    if (!pendingLoadData) return
    if (!kurzEditor || !redaktionEditor || !lektorEditor || !presseEditor || !pressetextEditor) return
    const d = pendingLoadData
    if (d.folgen_titel) setSelectedTitel(d.folgen_titel)
    if (d.folgen_titel_alternativen) {
      try {
        const alts = JSON.parse(d.folgen_titel_alternativen)
        if (Array.isArray(alts) && alts.length > 0) setTitelAlternativen(alts)
      } catch {}
    }
    kurzEditor.commands.setContent(d.synopsis_kurzinhalt || d.synopsis_300 || '<p></p>')
    redaktionEditor.commands.setContent(d.synopsis || '<p></p>')
    lektorEditor.commands.setContent(d.synopsis_lektor || '<p></p>')
    presseEditor.commands.setContent(d.synopsis_presse || '<p></p>')
    pressetextEditor.commands.setContent(d.synopsis_pressetext || '<p></p>')
    if (d.synopsis_straenge) setStrangText(d.synopsis_straenge)
    if (d.synopsis_deskriptoren) {
      try { setDeskriptoren(JSON.parse(d.synopsis_deskriptoren)) } catch {}
    }
    if (d.synopsis_fsk) {
      try {
        const fsk = JSON.parse(d.synopsis_fsk)
        if (fsk.rating) setFskRating(fsk.rating)
        if (fsk.begruendung !== undefined) setFskBegruendung(fsk.begruendung)
      } catch {}
    }
    setPendingLoadData(null)
  }, [pendingLoadData, kurzEditor, redaktionEditor, lektorEditor, presseEditor, pressetextEditor])

  // Deskriptor-Vorlagen laden
  useEffect(() => {
    if (!selectedProduction?.id) return
    api.getDeskriptorVorlagen(selectedProduction.id)
      .then(rows => {
        const names = rows.map((r: any) => r.name).filter(Boolean)
        if (names.length > 0) setDeskriptorVorlagen(names)
      })
      .catch(() => {})
  }, [selectedProduction?.id])

  // Load folgen data on open
  useEffect(() => {
    if (!open) return
    setActiveTab('titel')
    setSelectedTitel('')
    setTitelAlternativen([])
    setStrangText('')
    setDeskriptoren([])
    setFskRating('12')
    setFskBegruendung('')
    setSaveMsg(null)
    kurzEditor?.commands.setContent('<p></p>')
    redaktionEditor?.commands.setContent('<p></p>')
    lektorEditor?.commands.setContent('<p></p>')
    presseEditor?.commands.setContent('<p></p>')
    pressetextEditor?.commands.setContent('<p></p>')

    setLoading(true)
    api.getFolgenSynopsen(folgeId)
      .then(data => { if (data) setPendingLoadData(data) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [open, folgeId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Escape + Pfeiltasten-Navigation
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { handleClose(); return }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const tag = (e.target as HTMLElement).tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return
        e.preventDefault()
        const dest = e.key === 'ArrowLeft' ? prevFolgeRef.current : nextFolgeRef.current
        if (dest && navigateToRef.current) navigateToRef.current(dest)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = useCallback(async (): Promise<boolean> => {
    setSaveLoading(true); setSaveMsg(null)
    try {
      const kurzHtml       = kurzEditor?.getHTML()
      const redaktionHtml  = redaktionEditor?.getHTML()
      const lektorHtml     = lektorEditor?.getHTML()
      const presseHtml     = presseEditor?.getHTML()
      const pressetextHtml = pressetextEditor?.getHTML()
      const deskriptorenJson = deskriptoren.length > 0 ? JSON.stringify(deskriptoren) : null
      const fskJson = (fskRating || fskBegruendung.trim())
        ? JSON.stringify({ rating: fskRating, begruendung: fskBegruendung })
        : null
      await api.saveFolgenSynopsen(folgeId, {
        folgen_titel:                selectedTitel.trim() || null,
        folgen_titel_alternativen:   titelAlternativen.length > 0 ? JSON.stringify(titelAlternativen) : null,
        synopsis_kurzinhalt:   isEmpty(kurzHtml)       ? null : kurzHtml!,
        synopsis:              isEmpty(redaktionHtml)  ? null : redaktionHtml!,
        synopsis_lektor:       isEmpty(lektorHtml)     ? null : lektorHtml!,
        synopsis_presse:       isEmpty(presseHtml)     ? null : presseHtml!,
        synopsis_pressetext:   isEmpty(pressetextHtml) ? null : pressetextHtml!,
        synopsis_straenge:     strangText.trim() || null,
        synopsis_deskriptoren: deskriptorenJson,
        synopsis_fsk:          fskJson,
      })
      setSaveMsg('Gespeichert.')
      return true
    } catch (e: any) {
      setSaveMsg('Fehler: ' + (e?.message ?? String(e)))
      return false
    } finally {
      setSaveLoading(false)
    }
  }, [folgeId, selectedTitel, titelAlternativen, kurzEditor, redaktionEditor, lektorEditor, presseEditor, pressetextEditor, strangText, deskriptoren, fskRating, fskBegruendung])

  const navigateTo = useCallback((target: { id: number; folge_nummer: number }) => {
    save().then(() => onNavigate!(target.id, target.folge_nummer))
  }, [save, onNavigate])

  async function handleClose() {
    await save()
    onClose()
  }

  // Episode navigation — abgeleitete Werte + Refs aktualisieren
  const sortedFolgen = folgenList ? [...folgenList].sort((a, b) => a.folge_nummer - b.folge_nummer) : []
  const currentIdx = sortedFolgen.findIndex(f => f.id === folgeId)
  const prevFolge = currentIdx > 0 ? sortedFolgen[currentIdx - 1] : null
  const nextFolge = currentIdx >= 0 && currentIdx < sortedFolgen.length - 1 ? sortedFolgen[currentIdx + 1] : null
  prevFolgeRef.current = prevFolge
  nextFolgeRef.current = nextFolge
  navigateToRef.current = onNavigate ? navigateTo : null

  if (!open) return null

  const pressetextChars   = pressetextEditor ? charCount(pressetextEditor.getHTML()) : 0
  const pressetextInRange = pressetextChars >= 280 && pressetextChars <= 330
  const presseChars       = presseEditor ? charCount(presseEditor.getHTML()) : 0
  const presseInRange     = presseChars >= 300 && presseChars <= 450

  return (
    <>
      <style>{`
        .meta-modal .ProseMirror { outline: none; }
        .meta-modal .ProseMirror p { margin: 0 0 7px; }
        .meta-modal .ProseMirror p:last-child { margin-bottom: 0; }
        .meta-tab:hover:not(.meta-tab-active) { background: var(--bg-hover) !important; }
        .meta-drag-handle { cursor: grab; }
        .meta-drag-handle:active { cursor: grabbing; }
        .meta-resize-grip { cursor: nwse-resize; }
      `}</style>

      {/* Backdrop — click to close */}
      <div
        onMouseDown={handleClose}
        style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,0.35)' }}
      />

      {/* Modal — draggable + resizable, rendered independently of backdrop */}
      {layout && (
        <div
          className="meta-modal"
          onMouseDown={e => e.stopPropagation()}
          style={{
            position: 'fixed',
            left: layout.x,
            top: layout.y,
            width: layout.width,
            height: layout.height,
            zIndex: 9001,
            background: 'var(--bg-surface)',
            borderRadius: 12,
            border: '1px solid var(--border)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Header — drag handle */}
          <div
            className="meta-drag-handle"
            onMouseDown={handleDragStart}
            onTouchStart={handleDragStart}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '12px 16px 12px 12px',
              borderBottom: '1px solid var(--border)',
              flexShrink: 0,
              background: 'var(--bg-subtle)',
            }}
          >
            {/* Drag indicator */}
            <GripVertical size={14} style={{ color: 'var(--text-muted)', flexShrink: 0, opacity: 0.5 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                Meta-Daten — Folge {folgeNummer}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                Synopsen · Titel · Deskriptoren · FSK · Autosave beim Schließen
              </div>
            </div>
            {/* Episoden-Navigation */}
            {onNavigate && sortedFolgen.length > 1 && (
              <div onMouseDown={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                <button
                  onClick={() => prevFolge && navigateTo(prevFolge)}
                  disabled={!prevFolge}
                  title={prevFolge ? `← Folge ${prevFolge.folge_nummer}` : undefined}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 28, height: 28, borderRadius: 5, border: 'none',
                    background: 'transparent', cursor: prevFolge ? 'pointer' : 'default',
                    color: 'var(--text-secondary)', opacity: prevFolge ? 1 : 0.25,
                  }}
                >
                  <ChevronLeft size={14} />
                </button>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 36, textAlign: 'center' }}>
                  {currentIdx >= 0 ? `${currentIdx + 1} / ${sortedFolgen.length}` : '—'}
                </span>
                <button
                  onClick={() => nextFolge && navigateTo(nextFolge)}
                  disabled={!nextFolge}
                  title={nextFolge ? `Folge ${nextFolge.folge_nummer} →` : undefined}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 28, height: 28, borderRadius: 5, border: 'none',
                    background: 'transparent', cursor: nextFolge ? 'pointer' : 'default',
                    color: 'var(--text-secondary)', opacity: nextFolge ? 1 : 0.25,
                  }}
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
            <button
              onMouseDown={e => e.stopPropagation()}
              onClick={handleClose}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)', display: 'flex', padding: 6, borderRadius: 6,
                flexShrink: 0,
              }}
            >
              <X size={15} />
            </button>
          </div>

          {/* Tabs */}
          <div style={{
            display: 'flex', flexWrap: 'wrap',
            padding: '7px 14px 0', flexShrink: 0, gap: 2,
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg-subtle)',
          }}>
            {TABS.map(t => (
              <button
                key={t.id}
                className={`meta-tab${activeTab === t.id ? ' meta-tab-active' : ''}`}
                onClick={() => setActiveTab(t.id)}
                style={{
                  flex: '0 0 auto',
                  padding: '6px 12px',
                  borderRadius: '6px 6px 0 0',
                  border: `1px solid ${activeTab === t.id ? 'var(--border)' : 'transparent'}`,
                  borderBottom: activeTab === t.id ? '1px solid var(--bg-surface)' : '1px solid transparent',
                  marginBottom: activeTab === t.id ? -1 : 0,
                  background: activeTab === t.id ? 'var(--bg-surface)' : 'transparent',
                  cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
                  transition: 'background 0.12s',
                }}
              >
                <span style={{
                  fontSize: 12, fontWeight: activeTab === t.id ? 700 : 500,
                  color: activeTab === t.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                }}>{t.label}</span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{t.desc}</span>
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>

            {loading && (
              <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)', fontSize: 13 }}>
                Lade…
              </div>
            )}

            {/* ── Titel ── */}
            {!loading && activeTab === 'titel' && (
              <div>
                <label style={{
                  fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
                  display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5,
                }}>Arbeitstitel</label>
                <input
                  value={selectedTitel}
                  onChange={e => setSelectedTitel(e.target.value)}
                  placeholder="Titel der Folge…"
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    padding: '9px 12px', borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--input-bg)', color: 'var(--text-primary)',
                    fontSize: 15, fontWeight: 700, outline: 'none',
                  }}
                />
                {selectedTitel && (
                  <div style={{
                    marginTop: 6, fontSize: 11,
                    color: selectedTitel.trim().split(/\s+/).length > 3 ? '#FF9500' : 'var(--text-muted)',
                  }}>
                    {selectedTitel.trim().split(/\s+/).length} Wörter
                    {selectedTitel.trim().split(/\s+/).length > 3 && ' — ideal sind 1–3 Wörter'}
                  </div>
                )}
                {titelAlternativen.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Alternativen — klicken zum Auswählen (Favorit)
                    </div>
                    {titelAlternativen.map((t, i) => (
                      <button
                        key={i}
                        onClick={() => setSelectedTitel(prev => prev === t ? '' : t)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                          textAlign: 'left', padding: '8px 12px', marginBottom: 4, borderRadius: 7,
                          border: `1.5px solid ${selectedTitel === t ? '#007AFF' : 'var(--border)'}`,
                          background: selectedTitel === t ? 'rgba(0,122,255,0.07)' : 'var(--bg-subtle)',
                          cursor: 'pointer', fontFamily: 'inherit',
                          fontSize: 13, fontWeight: selectedTitel === t ? 700 : 500,
                          color: 'var(--text-primary)',
                        }}
                      >
                        {selectedTitel === t && <span style={{ color: '#007AFF', fontSize: 11, flexShrink: 0 }}>✓</span>}
                        <span style={{ flex: 1 }}>{t}</span>
                        <span style={{ fontSize: 11, color: t.trim().split(/\s+/).length > 3 ? '#FF9500' : 'var(--text-muted)', flexShrink: 0 }}>
                          {t.trim().split(/\s+/).length}W
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Kurzinhalt ── */}
            {!loading && activeTab === 'kurzinhalt' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    Format: <strong>Haupthandlung</strong> · <strong>Nebenhandlungen</strong> · <strong>Cliffhanger</strong>
                  </span>
                  {kurzEditor && kurzEditor.getText().length > 5 && (
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                      {wordCount(kurzEditor.getHTML())} Wörter
                    </span>
                  )}
                </div>
                <RichEditor editor={kurzEditor} minHeight={280} />
              </div>
            )}

            {/* ── Redaktion ── */}
            {!loading && activeTab === 'redaktion' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    Dramaturgisch · Wendepunkte · Rollennamen in CAPS · ein Absatz pro Strang
                  </span>
                  {redaktionEditor && redaktionEditor.getText().length > 5 && (() => {
                    const wc = wordCount(redaktionEditor.getHTML())
                    return (
                      <span style={{ fontSize: 11, fontWeight: 600, color: (wc < 300 || wc > 500) ? '#FF9500' : 'var(--text-secondary)' }}>
                        {wc} Wörter {(wc < 300 || wc > 500) ? '(Ziel: 300–500)' : ''}
                      </span>
                    )
                  })()}
                </div>
                <RichEditor editor={redaktionEditor} minHeight={320} />
              </div>
            )}

            {/* ── Lektor ── */}
            {!loading && activeTab === 'lektor' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    Chronologischer Fließtext · [Want] [Need] [Akt X Ende] [Cliff] [Pen] · (Sz. X) Referenzen
                  </span>
                  {lektorEditor && lektorEditor.getText().length > 5 && (() => {
                    const wc = wordCount(lektorEditor.getHTML())
                    return (
                      <span style={{ fontSize: 11, fontWeight: 600, color: (wc < 300 || wc > 400) ? '#FF9500' : 'var(--text-secondary)' }}>
                        {wc} Wörter {(wc < 300 || wc > 400) ? '(Ziel: 300–400)' : ''}
                      </span>
                    )
                  })()}
                </div>
                <RichEditor editor={lektorEditor} minHeight={380} />
              </div>
            )}

            {/* ── Strang ── */}
            {!loading && activeTab === 'strang' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    Je Handlungsstrang eine Zeile · max. 300 Zeichen
                  </span>
                  {strangText.trim() && (
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                      {strangText.split('\n').filter(Boolean).length} Stränge
                    </span>
                  )}
                </div>
                <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: 'var(--input-bg)' }}>
                  {strangText.split('\n').filter(Boolean).map((line, i, arr) => {
                    const ci = line.indexOf(':')
                    const name    = (ci >= 0 ? line.slice(0, ci) : line).trim()
                    const content = ci >= 0 ? line.slice(ci + 1).trim() : ''
                    const updateLine = (newName: string, newContent: string) => {
                      const lines = strangText.split('\n').filter(Boolean)
                      lines[i] = newContent ? `${newName}: ${newContent}` : newName
                      setStrangText(lines.join('\n'))
                    }
                    return (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'flex-start', gap: 4,
                        padding: '7px 10px 7px 12px',
                        borderBottom: i < arr.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                      }}>
                        <input value={name} onChange={e => updateLine(e.target.value, content)} placeholder="STRANG"
                          style={{ background: 'transparent', border: 'none', outline: 'none', fontWeight: 700, color: '#007AFF', fontSize: 13, width: '28%', minWidth: 60, marginTop: 2 }} />
                        <span style={{ color: 'var(--text-muted)', fontWeight: 700, flexShrink: 0, marginTop: 2 }}>:</span>
                        <textarea value={content} onChange={e => updateLine(name, e.target.value)} placeholder="Kurzbeschreibung…"
                          rows={Math.max(1, content.split('\n').length)}
                          onKeyDown={e => { if (e.key === 'Enter') e.preventDefault() }}
                          style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: 13, lineHeight: 1.6, resize: 'none', fontFamily: 'inherit', padding: 0 }} />
                        <button onMouseDown={() => { const lines = strangText.split('\n').filter(Boolean); lines.splice(i, 1); setStrangText(lines.join('\n')) }}
                          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px 6px', fontSize: 16, flexShrink: 0 }}>×</button>
                      </div>
                    )
                  })}
                  <div style={{ padding: '6px 12px', borderTop: strangText.trim() ? '1px solid var(--border-subtle)' : 'none' }}>
                    <button onMouseDown={() => setStrangText(prev => (prev.trim() ? prev.trimEnd() + '\n: ' : ': '))}
                      style={{ background: 'none', border: 'none', color: '#007AFF', cursor: 'pointer', fontSize: 11, padding: 0, fontWeight: 600 }}>
                      + Strang hinzufügen
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── Programmpresse ── */}
            {!loading && activeTab === 'programmpresse' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    TV-Listing / Programmpresse · werblich, neugierig machend · kein Spoiler
                  </span>
                  {presseEditor && presseEditor.getText().length > 3 && (
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 5, background: presseInRange ? 'rgba(0,200,83,0.1)' : 'rgba(255,149,0,0.1)', border: `1px solid ${presseInRange ? '#00C85355' : '#FF950055'}`, color: presseInRange ? '#00C853' : '#FF9500' }}>
                      {presseChars} / 300–450 Zeichen
                    </span>
                  )}
                </div>
                <RichEditor editor={presseEditor} minHeight={140} />
              </div>
            )}

            {/* ── Pressetext ── */}
            {!loading && activeTab === 'pressetext' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    Sachlicher Pressetext · knapp · kein werblicher Ton · kein Spoiler
                  </span>
                  {pressetextEditor && pressetextEditor.getText().length > 3 && (
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 5, background: pressetextInRange ? 'rgba(0,200,83,0.1)' : 'rgba(255,59,48,0.1)', border: `1px solid ${pressetextInRange ? '#00C85355' : '#FF3B3055'}`, color: pressetextInRange ? '#00C853' : '#FF3B30' }}>
                      {pressetextChars} / 280–330 Zeichen
                    </span>
                  )}
                </div>
                <RichEditor editor={pressetextEditor} minHeight={110} />
                {pressetextEditor && pressetextEditor.getText().length > 3 && !pressetextInRange && (
                  <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
                    {pressetextChars < 280 ? `Noch ${280 - pressetextChars} Zeichen fehlen.` : `${pressetextChars - 330} Zeichen zu viel — bitte kürzen.`}
                  </div>
                )}
              </div>
            )}

            {/* ── Deskriptoren ── */}
            {!loading && activeTab === 'deskriptoren' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Jugendschutz-Inhaltsdeskriptoren (JuSchG) · Kategorien und Schweregrade</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{deskriptoren.length} {deskriptoren.length === 1 ? 'Deskriptor' : 'Deskriptoren'}</span>
                </div>
                {deskriptoren.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 0', fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    Keine jugendschutzrelevanten Inhalte eingetragen
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                    {deskriptoren.map((d, i) => (
                      <div key={i} style={{ background: 'rgba(255,107,0,0.06)', border: '1px solid rgba(255,107,0,0.2)', borderRadius: 9, padding: '10px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <select value={d.kategorie}
                            onChange={e => setDeskriptoren(prev => { const n = [...prev]; n[i] = { ...n[i], kategorie: e.target.value }; return n })}
                            style={{ background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 5, color: '#FF9500', fontWeight: 700, fontSize: 12, padding: '2px 6px', cursor: 'pointer' }}>
                            {deskriptorVorlagen.map(k => <option key={k} value={k}>{k}</option>)}
                          </select>
                          <div style={{ display: 'flex', gap: 5 }}>
                            {(['leicht', 'mittel', 'stark'] as DeskriptorStufe[]).map(s => (
                              <button key={s}
                                onClick={() => setDeskriptoren(prev => { const n = [...prev]; n[i] = { ...n[i], stufe: s }; return n })}
                                style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: 'none', background: d.stufe === s ? `${STUFE_COLORS[s]}22` : 'var(--bg-subtle)', color: d.stufe === s ? STUFE_COLORS[s] : 'var(--text-muted)', outline: d.stufe === s ? `1.5px solid ${STUFE_COLORS[s]}88` : '1.5px solid transparent' }}>
                                {s}
                              </button>
                            ))}
                          </div>
                          <button onClick={() => setDeskriptoren(prev => prev.filter((_, j) => j !== i))}
                            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16, padding: '0 4px' }}>×</button>
                        </div>
                        <input value={d.beschreibung}
                          onChange={e => setDeskriptoren(prev => { const n = [...prev]; n[i] = { ...n[i], beschreibung: e.target.value }; return n })}
                          placeholder="Kurzbeschreibung mit Szenenreferenz (Sz. X)…"
                          style={{ width: '100%', boxSizing: 'border-box', background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: 12, lineHeight: 1.6 }} />
                      </div>
                    ))}
                  </div>
                )}
                <button onClick={() => setDeskriptoren(prev => [...prev, { kategorie: deskriptorVorlagen[0] ?? 'Gewaltdarstellungen', stufe: 'leicht', beschreibung: '' }])}
                  style={{ background: 'none', border: 'none', color: 'rgba(255,107,0,0.7)', cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: 0 }}>
                  + Deskriptor hinzufügen
                </button>
              </div>
            )}

            {/* ── FSK ── */}
            {!loading && activeTab === 'fsk' && (
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 14 }}>
                  FSK-Altersfreigabe-Einschätzung — Auswahl + Begründung mit Szenenreferenzen
                </div>
                <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                  {FSK_LEVELS.map(lvl => (
                    <button key={lvl} onClick={() => setFskRating(lvl)}
                      style={{ width: 52, height: 52, borderRadius: 10, cursor: 'pointer', border: `2px solid ${fskRating === lvl ? FSK_COLORS[lvl] : 'var(--border)'}`, background: fskRating === lvl ? `${FSK_COLORS[lvl]}18` : 'var(--bg-subtle)', color: fskRating === lvl ? FSK_COLORS[lvl] : 'var(--text-muted)', fontSize: 18, fontWeight: 800, transition: 'border-color 0.15s, background 0.15s' }}>
                      {lvl}
                    </button>
                  ))}
                </div>
                {fskRating && (
                  <div style={{ marginBottom: 14, padding: '8px 14px', borderRadius: 8, background: `${FSK_COLORS[fskRating]}12`, border: `1px solid ${FSK_COLORS[fskRating]}44`, fontSize: 14, color: FSK_COLORS[fskRating], fontWeight: 700, display: 'flex', alignItems: 'center', gap: 7 }}>
                    <Shield size={14} />FSK {fskRating}
                  </div>
                )}
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Begründung</label>
                <textarea value={fskBegruendung} onChange={e => setFskBegruendung(e.target.value)}
                  placeholder="Begründung für die FSK-Einschätzung, mit Szenenreferenzen (Sz. X)…"
                  style={{ width: '100%', boxSizing: 'border-box', minHeight: 140, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: 13, lineHeight: 1.7, outline: 'none', resize: 'vertical', fontFamily: 'inherit' }} />
              </div>
            )}

          </div>

          {/* Footer */}
          <div style={{ flexShrink: 0, padding: '10px 20px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => save()} disabled={saveLoading}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 7, background: '#00C853', color: '#fff', border: 'none', cursor: saveLoading ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 700, opacity: saveLoading ? 0.7 : 1 }}>
              <Check size={12} />
              {saveLoading ? 'Speichert…' : 'Speichern'}
            </button>
            {saveMsg && (
              <span style={{ fontSize: 11, color: saveMsg.startsWith('Fehler') ? '#FF9500' : '#00C853' }}>{saveMsg}</span>
            )}
            <button onClick={handleClose}
              style={{ marginLeft: 'auto', padding: '7px 14px', borderRadius: 7, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12 }}>
              Schließen &amp; Autosave
            </button>
          </div>

          {/* Resize grip — bottom-right corner */}
          <div
            className="meta-resize-grip"
            onMouseDown={handleResizeStart}
            onTouchStart={handleResizeStart}
            style={{
              position: 'absolute', right: 0, bottom: 0,
              width: 20, height: 20,
              display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end',
              padding: 4,
            }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" style={{ opacity: 0.35 }}>
              <line x1="10" y1="2" x2="2" y2="10" stroke="currentColor" strokeWidth="1.5" />
              <line x1="10" y1="6" x2="6" y2="10" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </div>
        </div>
      )}
    </>
  )
}
