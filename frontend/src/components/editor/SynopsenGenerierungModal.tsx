import { useState, useEffect, useCallback } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import { Wand2, X, Sparkles, Bold, Italic, Underline as UnderlineIcon, Check, RefreshCw, RotateCcw, AlertTriangle, ChevronUp, Shield } from 'lucide-react'
import { api } from '../../api/client'
import { useSelectedProduction } from '../../contexts'

// ── Deskriptoren types & constants ─────────────────────────────────────────────

type DeskriptorStufe = 'leicht' | 'mittel' | 'stark'
interface DeskriptorItem {
  kategorie: string
  stufe: DeskriptorStufe
  beschreibung: string
}

const FSK_LEVELS = ['0', '6', '12', '16', '18']
const FSK_COLORS: Record<string, string> = {
  '0': '#00C853', '6': '#00C853', '12': '#FF9500', '16': '#FF6B00', '18': '#FF3B30'
}
const STUFE_COLORS: Record<DeskriptorStufe, string> = { leicht: '#00C853', mittel: '#FF9500', stark: '#FF3B30' }
const DESKRIPTOR_KATEGORIEN: string[] = [
  'GEWALT', 'SEXUELLE_INHALTE', 'ALKOHOL_DROGEN', 'ANGST', 'DISKRIMINIERUNG', 'THEMATISCH_BELASTEND', 'SPRACHE'
]

function renderSceneRefs(
  text: string,
  onSceneClick?: (nr: string) => void
): React.ReactNode[] {
  const parts = text.split(/(\(Sz\. \d+\))/g)
  return parts.map((part, i) => {
    const m = part.match(/\(Sz\. (\d+)\)/)
    if (m && onSceneClick) {
      return (
        <span key={i} onClick={() => onSceneClick(m[1])}
          style={{ color: '#AF52DE', cursor: 'pointer', textDecoration: 'underline dotted', fontWeight: 600 }}>
          {part}
        </span>
      )
    }
    return <span key={i}>{part}</span>
  })
}

// ── Text utilities ─────────────────────────────────────────────────────────────

function kiTextToHtml(raw: string, boldAllCaps = false): string {
  const paras = raw.split(/\n{2,}/).map(p => p.replace(/\n/g, ' ').trim()).filter(Boolean)
  if (!paras.length) return '<p></p>'
  return paras.map(p => {
    if (boldAllCaps) {
      return `<p>${p.replace(/\b([A-ZÄÖÜ][A-ZÄÖÜ0-9]{2,}(?:'[A-ZÄÖÜ][A-ZÄÖÜ0-9]*)?)\b/g, '<strong>$1</strong>')}</p>`
    }
    return `<p>${p}</p>`
  }).join('')
}

function kurzinhaltToHtml(raw: string): string {
  const lines = raw.split('\n')
  const result: string[] = []
  let currentPara: string[] = []
  const flushPara = () => {
    if (currentPara.length > 0) {
      result.push(`<p>${currentPara.join(' ').trim()}</p>`)
      currentPara = []
    }
  }
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) { flushPara(); continue }
    // Line that is ONLY a **heading:** → convert to bold paragraph
    const headMatch = trimmed.match(/^\*\*(.+?)\*\*:?\s*$/)
    if (headMatch) {
      flushPara()
      result.push(`<p><strong>${headMatch[1]}:</strong></p>`)
      continue
    }
    // Strip inline markdown from regular text lines
    const cleaned = trimmed
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/__(.+?)__/g, '$1')
      .replace(/_(.+?)_/g, '$1')
    currentPara.push(cleaned)
  }
  flushPara()
  return result.join('') || '<p></p>'
}

function wordCount(html: string): number {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).length
}

function charCount(html: string): number {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().length
}

// ── Minimal Rich Toolbar ───────────────────────────────────────────────────────

function RichToolbar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  if (!editor) return null
  const btn = (active: boolean, onPress: () => void, icon: React.ReactNode, title: string) => (
    <button
      onMouseDown={e => { e.preventDefault(); onPress() }}
      title={title}
      style={{
        width: 28, height: 28, borderRadius: 5, border: 'none', cursor: 'pointer',
        background: active ? 'rgba(255,255,255,0.15)' : 'transparent',
        color: active ? '#fff' : 'rgba(255,255,255,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >{icon}</button>
  )
  return (
    <div style={{ display: 'flex', gap: 2, padding: '5px 8px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
      {btn(editor.isActive('bold'),      () => editor.chain().focus().toggleBold().run(),      <Bold size={13} />,         'Fett')}
      {btn(editor.isActive('italic'),    () => editor.chain().focus().toggleItalic().run(),    <Italic size={13} />,       'Kursiv')}
      {btn(editor.isActive('underline'), () => editor.chain().focus().toggleUnderline().run(), <UnderlineIcon size={13} />, 'Unterstrichen')}
    </div>
  )
}

function RichEditor({ editor, minHeight = 140, zoom = 1 }: { editor: ReturnType<typeof useEditor>; minHeight?: number; zoom?: number }) {
  if (!editor) return null
  return (
    <div style={{ border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, overflow: 'hidden', background: 'rgba(0,0,0,0.3)' }}>
      <RichToolbar editor={editor} />
      <EditorContent editor={editor} style={{ minHeight, padding: '10px 12px', color: '#f0f0f0', fontSize: Math.round(14 * zoom), lineHeight: 1.7 }} />
    </div>
  )
}

// ── Pre-Check Dialog ──────────────────────────────────────────────────────────

function PreCheckDialog({ data, folgeNummer, onLoad, onNew, onAbort }: {
  data: { folgen_titel?: string; synopsis?: string; synopsis_kurzinhalt?: string; synopsis_300?: string; synopsis_presse?: string; synopsis_straenge?: string; synopsis_pressetext?: string }
  folgeNummer: number
  onLoad: () => void
  onNew: () => void
  onAbort: () => void
}) {
  const preview = (html: string | undefined | null, n = 150) => {
    if (!html) return null
    const plain = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    return plain.substring(0, n) + (plain.length > n ? '…' : '')
  }
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 10, borderRadius: 16,
      background: 'rgba(10,4,20,0.85)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: 480, maxWidth: 'calc(100% - 32px)', maxHeight: '80%',
        background: 'linear-gradient(160deg, #1a0a2e 0%, #120820 50%, #0d0518 100%)',
        border: '1px solid rgba(175,82,222,0.35)',
        borderRadius: 12, padding: '24px',
        overflowY: 'auto',
        boxShadow: '0 24px 60px rgba(0,0,0,0.7)',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <Wand2 size={16} color="#D18AFF" />
          <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>
            Folge {folgeNummer} hat bereits Synopsen-Daten
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 22 }}>
          {data.folgen_titel && (
            <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 8, padding: '8px 12px' }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 2 }}>TITEL</div>
              <div style={{ fontSize: 13, color: '#f0f0f0', fontWeight: 600 }}>{data.folgen_titel}</div>
            </div>
          )}
          {[
            { label: 'KURZINHALT', v: data.synopsis_kurzinhalt || data.synopsis_300 },
            { label: 'REDAKTION', v: data.synopsis },
            { label: 'PROGRAMMPRESSE', v: data.synopsis_presse },
            { label: 'PRESSETEXT', v: data.synopsis_pressetext },
            { label: 'STRÄNGE', v: data.synopsis_straenge },
            { label: 'LEKTOR', v: data.synopsis_lektor },
          ].filter(x => x.v).map(({ label, v }) => (
            <div key={label} style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 8, padding: '8px 12px' }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', lineHeight: 1.5 }}>{preview(v)}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button onClick={onLoad} style={dlgBtn('#AF52DE', true)}>
            <Check size={13} /> Vorhandene Daten anzeigen
          </button>
          <button onClick={onNew} style={dlgBtn('rgba(255,255,255,0.1)', false)}>
            <RefreshCw size={13} /> Neu generieren &amp; überschreiben
          </button>
          <button onClick={onAbort} style={{ ...dlgBtn('transparent', false), color: 'rgba(255,255,255,0.4)' }}>
            Abbrechen
          </button>
        </div>
      </div>
    </div>
  )
}

function dlgBtn(bg: string, primary: boolean): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
    padding: '10px 16px', borderRadius: 9,
    background: bg, border: `1px solid ${primary ? '#AF52DE' : 'rgba(255,255,255,0.12)'}`,
    color: primary ? '#fff' : 'rgba(255,255,255,0.75)',
    cursor: 'pointer', fontSize: 13, fontWeight: primary ? 700 : 500,
  }
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

type Tab = 'titel' | 'kurzinhalt' | 'redaktion' | 'lektor' | 'strang' | 'programmpresse' | 'pressetext' | 'deskriptoren' | 'fsk'

const TABS: { id: Tab; label: string; desc: string }[] = [
  { id: 'titel',          label: 'Titel',          desc: '1–3 Wörter' },
  { id: 'kurzinhalt',     label: 'Kurzinhalt',     desc: 'strukturiert' },
  { id: 'redaktion',      label: 'Redaktion',      desc: '300–500 Wörter' },
  { id: 'lektor',         label: 'Lektor',         desc: 'chronol. · Marker' },
  { id: 'strang',         label: 'Strang',         desc: '≤300 Zeichen' },
  { id: 'programmpresse', label: 'Programmpresse', desc: '300–450 Zeichen' },
  { id: 'pressetext',     label: 'Pressetext',     desc: '280–330 Zeichen' },
  { id: 'deskriptoren',   label: 'Deskriptoren',   desc: 'JuSchG' },
  { id: 'fsk',            label: 'FSK',            desc: 'Altersfreigabe' },
]

// ── Modal ─────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onClose: () => void
  folgeId: number
  folgeNummer: number
  onUebernehmen?: (html: string) => void
  onNavigateToScene?: (sceneNummer: string) => void
}

export default function SynopsenGenerierungModal({ open, onClose, folgeId, folgeNummer, onUebernehmen, onNavigateToScene }: Props) {
  const { selectedProduction } = useSelectedProduction()
  const [deskriptorVorlagen, setDeskriptorVorlagen] = useState<string[]>(DESKRIPTOR_KATEGORIEN)
  const [visible, setVisible] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('titel')
  const [minimized, setMinimized] = useState(false)

  // Pre-check
  const [checking, setChecking] = useState(false)
  const [preCheckData, setPreCheckData] = useState<any>(null)
  const [showPreCheck, setShowPreCheck] = useState(false)

  // Generierung
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)
  const [missingSections, setMissingSections] = useState<string[]>([])

  // Titel
  const [titelOptions, setTitelOptions] = useState<string[]>([])
  const [selectedTitel, setSelectedTitel] = useState('')
  const [titelMehrLoading, setTitelMehrLoading] = useState(false)
  const [titelMehrMsg, setTitelMehrMsg] = useState<string | null>(null)

  // Strang (plain textarea)
  const [strangText, setStrangText] = useState('')

  // Deskriptoren + FSK
  const [deskriptoren, setDeskriptoren] = useState<DeskriptorItem[]>([])
  const [fskRating, setFskRating] = useState('12')
  const [fskBegruendung, setFskBegruendung] = useState('')

  // Race condition fix: KI result stored until editors are ready
  const [pendingKiResult, setPendingKiResult] = useState<{
    kurzinhalt?: string; redaktion?: string; lektor?: string; presse?: string; pressetext?: string
  } | null>(null)

  // Race condition fix: existing data stored until editors are ready
  const [pendingLoadData, setPendingLoadData] = useState<any>(null)

  // Zoom
  const [editorZoom, setEditorZoom] = useState(1.2)

  // Tiptap editors
  const kurzEditor       = useEditor({ extensions: [StarterKit, Underline], content: '<p></p>' })
  const redaktionEditor  = useEditor({ extensions: [StarterKit, Underline], content: '<p></p>' })
  const lektorEditor     = useEditor({ extensions: [StarterKit, Underline], content: '<p></p>' })
  const presseEditor     = useEditor({ extensions: [StarterKit, Underline], content: '<p></p>' })
  const pressetextEditor = useEditor({ extensions: [StarterKit, Underline], content: '<p></p>' })

  // Save
  const [saveLoading, setSaveLoading] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)

  // ── Apply pending KI result when editors ready ────────────────────────────
  useEffect(() => {
    if (!pendingKiResult) return
    if (!kurzEditor || !redaktionEditor || !lektorEditor || !presseEditor || !pressetextEditor) return
    if (pendingKiResult.kurzinhalt)  kurzEditor.commands.setContent(kurzinhaltToHtml(pendingKiResult.kurzinhalt))
    if (pendingKiResult.redaktion)   redaktionEditor.commands.setContent(kiTextToHtml(pendingKiResult.redaktion, true))
    if (pendingKiResult.lektor)      lektorEditor.commands.setContent(kurzinhaltToHtml(pendingKiResult.lektor))
    if (pendingKiResult.presse)      presseEditor.commands.setContent(kiTextToHtml(pendingKiResult.presse, false))
    if (pendingKiResult.pressetext)  pressetextEditor.commands.setContent(kiTextToHtml(pendingKiResult.pressetext, false))
    setPendingKiResult(null)
  }, [pendingKiResult, kurzEditor, redaktionEditor, lektorEditor, presseEditor, pressetextEditor])

  // ── Apply pending load-existing data when editors ready ───────────────────
  useEffect(() => {
    if (!pendingLoadData) return
    if (!kurzEditor || !redaktionEditor || !lektorEditor || !presseEditor || !pressetextEditor) return
    const d = pendingLoadData
    if (d.folgen_titel) setSelectedTitel(d.folgen_titel)
    const kurzHtml = d.synopsis_kurzinhalt || d.synopsis_300 || '<p></p>'
    kurzEditor.commands.setContent(kurzHtml)
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

  // ── Visible fade ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (open) setTimeout(() => setVisible(true), 10)
    else setVisible(false)
  }, [open])

  // ── Deskriptor-Vorlagen laden wenn Produktion bekannt ────────────────────
  useEffect(() => {
    if (!selectedProduction?.id) return
    api.getDeskriptorVorlagen(selectedProduction.id)
      .then(rows => {
        const names = rows.map((r: any) => r.name).filter(Boolean)
        if (names.length > 0) setDeskriptorVorlagen(names)
      })
      .catch(() => {})
  }, [selectedProduction?.id])

  // ── Reset + Pre-Check on open ─────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    setActiveTab('titel')
    setTitelOptions([])
    setSelectedTitel('')
    setTitelMehrMsg(null)
    setStrangText('')
    setDeskriptoren([])
    setFskRating('12')
    setFskBegruendung('')
    setMinimized(false)
    setGenError(null)
    setMissingSections([])
    setSaveMsg(null)
    kurzEditor?.commands.setContent('<p></p>')
    redaktionEditor?.commands.setContent('<p></p>')
    lektorEditor?.commands.setContent('<p></p>')
    presseEditor?.commands.setContent('<p></p>')
    pressetextEditor?.commands.setContent('<p></p>')

    setChecking(true)
    api.kiSynopsenCheck(folgeId)
      .then(data => {
        if (data?.hasData) {
          setPreCheckData(data)
          setShowPreCheck(true)
        } else {
          triggerGenerate()
        }
      })
      .catch(() => triggerGenerate())
      .finally(() => setChecking(false))
  }, [open, folgeId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Generate all synopses ─────────────────────────────────────────────────
  const triggerGenerate = useCallback(async () => {
    setGenerating(true)
    setGenError(null)
    setMissingSections([])
    setTitelOptions([])
    setSelectedTitel('')
    setStrangText('')
    setDeskriptoren([])
    setFskRating('12')
    setFskBegruendung('')
    kurzEditor?.commands.setContent('<p></p>')
    redaktionEditor?.commands.setContent('<p></p>')
    lektorEditor?.commands.setContent('<p></p>')
    presseEditor?.commands.setContent('<p></p>')
    pressetextEditor?.commands.setContent('<p></p>')
    try {
      const r = await api.kiSynopsenGeneriereAlle(folgeId)
      if (r.disabled) {
        setGenError('KI-Funktion nicht aktiviert (Admin-Einstellungen)')
        return
      }
      if (r.titel?.length) setTitelOptions(r.titel)
      if (r.straenge)      setStrangText(r.straenge)
      if (r.deskriptoren)  setDeskriptoren(r.deskriptoren)
      if (r.fsk_rating)    setFskRating(r.fsk_rating)
      if (r.fsk_begruendung !== undefined) setFskBegruendung(r.fsk_begruendung)
      if (r.missing_sections?.length) setMissingSections(r.missing_sections)
      // Store result — apply via useEffect (race condition fix)
      setPendingKiResult({
        kurzinhalt:  r.kurzinhalt  || undefined,
        redaktion:   r.redaktion   || undefined,
        lektor:      r.lektor      || undefined,
        presse:      r.presse      || undefined,
        pressetext:  r.pressetext  || undefined,
      })
    } catch (e: any) {
      setGenError('Generierungsfehler: ' + (e?.message ?? String(e)))
    } finally {
      setGenerating(false)
    }
  }, [folgeId, kurzEditor, redaktionEditor, lektorEditor, presseEditor, pressetextEditor]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load existing data ────────────────────────────────────────────────────
  const loadExisting = useCallback(() => {
    if (!preCheckData) return
    setPendingLoadData(preCheckData)
    setShowPreCheck(false)
  }, [preCheckData])

  // ── Escape ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Weitere 5 Titel ───────────────────────────────────────────────────────
  async function handleTitelMehr() {
    setTitelMehrLoading(true); setTitelMehrMsg(null)
    try {
      const r = await api.kiSynopsenTitelMehr(folgeId, titelOptions)
      if (r.disabled) { setTitelMehrMsg('KI nicht aktiviert'); return }
      if (!r.titel?.length) { setTitelMehrMsg('Keine neuen Titel generiert.'); return }
      setTitelOptions(prev => [...prev, ...r.titel])
    } catch (e: any) {
      setTitelMehrMsg('Fehler: ' + (e?.message ?? String(e)))
    } finally {
      setTitelMehrLoading(false)
    }
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  const save = useCallback(async (): Promise<boolean> => {
    setSaveLoading(true); setSaveMsg(null)
    try {
      const kurzHtml       = kurzEditor?.getHTML()
      const redaktionHtml  = redaktionEditor?.getHTML()
      const lektorHtml     = lektorEditor?.getHTML()
      const presseHtml     = presseEditor?.getHTML()
      const pressetextHtml = pressetextEditor?.getHTML()
      const isEmpty = (h: string | undefined) => !h || h === '<p></p>'
      const deskriptorenJson = deskriptoren.length > 0 ? JSON.stringify(deskriptoren) : null
      const fskJson = (fskRating || fskBegruendung.trim()) ? JSON.stringify({ rating: fskRating, begruendung: fskBegruendung }) : null
      await api.saveFolgenSynopsen(folgeId, {
        folgen_titel:           selectedTitel.trim() || null,
        synopsis_kurzinhalt:    isEmpty(kurzHtml)       ? null : kurzHtml!,
        synopsis:               isEmpty(redaktionHtml)  ? null : redaktionHtml!,
        synopsis_lektor:        isEmpty(lektorHtml)     ? null : lektorHtml!,
        synopsis_presse:        isEmpty(presseHtml)     ? null : presseHtml!,
        synopsis_pressetext:    isEmpty(pressetextHtml) ? null : pressetextHtml!,
        synopsis_straenge:      strangText.trim() || null,
        synopsis_deskriptoren:  deskriptorenJson,
        synopsis_fsk:           fskJson,
      })
      setSaveMsg('Gespeichert.')
      return true
    } catch (e: any) {
      setSaveMsg('Speicherfehler: ' + (e?.message ?? String(e)))
      return false
    } finally {
      setSaveLoading(false)
    }
  }, [folgeId, selectedTitel, kurzEditor, redaktionEditor, lektorEditor, presseEditor, pressetextEditor, strangText])

  async function handleClose() {
    await save()
    onClose()
  }

  function getCurrentTabHtml(): string {
    switch (activeTab) {
      case 'titel':          return selectedTitel ? `<p>${selectedTitel}</p>` : ''
      case 'kurzinhalt':     return kurzEditor?.getHTML() ?? ''
      case 'redaktion':      return redaktionEditor?.getHTML() ?? ''
      case 'lektor':         return lektorEditor?.getHTML() ?? ''
      case 'strang':         return strangText ? strangText.split('\n').filter(Boolean).map(l => `<p>${l}</p>`).join('') : ''
      case 'programmpresse': return presseEditor?.getHTML() ?? ''
      case 'pressetext':     return pressetextEditor?.getHTML() ?? ''
      case 'deskriptoren':   return deskriptoren.length ? deskriptoren.map(d => `<p><strong>${d.kategorie}</strong> (${d.stufe}): ${d.beschreibung}</p>`).join('') : ''
      case 'fsk':            return fskRating ? `<p>FSK ${fskRating}${fskBegruendung ? ': ' + fskBegruendung : ''}</p>` : ''
      default:               return ''
    }
  }

  async function handleUebernehmen() {
    await save()
    const html = getCurrentTabHtml()
    if (html && onUebernehmen) onUebernehmen(html)
    if (activeTab !== 'titel') onClose()
  }

  if (!open) return null

  // Minimized: only floating widget, no backdrop
  if (minimized) {
    return (
      <div
        onClick={() => setMinimized(false)}
        style={{
          position:'fixed', bottom:24, right:24, zIndex:10002,
          background:'linear-gradient(135deg,#1a0a2e,#0d0518)',
          border:'1.5px solid #AF52DE77', borderRadius:12,
          padding:'10px 16px', cursor:'pointer',
          boxShadow:'0 4px 24px rgba(0,0,0,0.7)',
          display:'flex', alignItems:'center', gap:8,
          animation:'syn-glow 3s ease-in-out infinite',
        }}
      >
        <Wand2 size={14} color="#D18AFF" />
        <span style={{ fontSize:12, color:'#D18AFF', fontWeight:700 }}>Folge {folgeNummer} · Synopsen</span>
        <ChevronUp size={12} color="#AF52DE77" />
      </div>
    )
  }

  const isLoading = checking || generating

  // ── Char/Word counters ────────────────────────────────────────────────────
  const pressetextChars = pressetextEditor ? charCount(pressetextEditor.getHTML()) : 0
  const pressetextInRange = pressetextChars >= 280 && pressetextChars <= 330
  const presseChars = presseEditor ? charCount(presseEditor.getHTML()) : 0
  const presseInRange = presseChars >= 300 && presseChars <= 450

  return (
    <>
      <style>{`
        @keyframes syn-star { 0%{opacity:0;transform:scale(.5)} 40%{opacity:.7;transform:scale(1.2)} 100%{opacity:0;transform:scale(.5)} }
        @keyframes syn-glow { 0%,100%{box-shadow:0 0 18px 4px #AF52DE55,0 0 40px 8px #AF52DE22} 50%{box-shadow:0 0 28px 8px #AF52DE88,0 0 60px 16px #AF52DE44} }
        @keyframes syn-shimmer { 0%{background-position:-200% center} 100%{background-position:200% center} }
        @keyframes syn-fade-in { from{opacity:0;transform:translateY(14px) scale(.97)} to{opacity:1;transform:translateY(0) scale(1)} }
        @keyframes syn-spin { to{transform:rotate(360deg)} }
        .syn-m .ProseMirror { outline: none; }
        .syn-m .ProseMirror p { margin: 0 0 7px; }
        .syn-m .ProseMirror p:last-child { margin-bottom: 0; }
        .syn-tab:hover:not(.syn-tab-active) { background: rgba(255,255,255,0.07) !important; }
        .syn-titel-card:hover { border-color: #AF52DE88 !important; background: #AF52DE18 !important; }
        .syn-strang-row input::placeholder { color: rgba(255,255,255,0.2); }
      `}</style>

      <div
        onMouseDown={handleClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 10001,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(5,0,20,0.82)', backdropFilter: 'blur(6px)',
          opacity: visible ? 1 : 0, transition: 'opacity 0.25s',
        }}
      >
        <div
          className="syn-m"
          onMouseDown={e => e.stopPropagation()}
          style={{
            position: 'relative',
            width: 'calc(100vw - 32px)',
            height: 'calc(100vh - 32px)',
            background: 'linear-gradient(160deg, #1a0a2e 0%, #120820 50%, #0d0518 100%)',
            borderRadius: 16,
            border: '1.5px solid #AF52DE55',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            animation: visible ? 'syn-glow 3s ease-in-out infinite, syn-fade-in 0.28s ease-out forwards' : 'none',
          }}
        >
          {/* Stars */}
          {[[12,8],[85,15],[50,5],[92,40],[8,60],[72,75],[25,85],[88,80],[45,92],[18,45]].map(([x,y], i) => (
            <div key={i} style={{
              position:'absolute', left:`${x}%`, top:`${y}%`,
              width: i%3===0?3:2, height: i%3===0?3:2, borderRadius:'50%',
              background:'#fff', opacity:0, pointerEvents:'none',
              animation:`syn-star 2.4s ${(i*0.3).toFixed(1)}s ease-in-out infinite`,
            }}/>
          ))}

          {/* Pre-check overlay */}
          {showPreCheck && preCheckData && (
            <PreCheckDialog
              data={preCheckData}
              folgeNummer={folgeNummer}
              onLoad={loadExisting}
              onNew={() => { setShowPreCheck(false); triggerGenerate() }}
              onAbort={onClose}
            />
          )}

          {/* Loading overlay */}
          {isLoading && !showPreCheck && (
            <div style={{
              position:'absolute', inset:0, zIndex:5, borderRadius:16,
              background:'rgba(13,5,24,0.88)', display:'flex', flexDirection:'column',
              alignItems:'center', justifyContent:'center', gap: 14,
            }}>
              <div style={{ width: 32, height: 32, border: '3px solid #AF52DE33', borderTopColor: '#AF52DE', borderRadius:'50%', animation:'syn-spin 0.8s linear infinite' }} />
              <span style={{ fontSize:13, color:'rgba(255,255,255,0.6)' }}>
                {checking ? 'Prüfe vorhandene Daten…' : 'KI generiert alle Synopsen…'}
              </span>
              <span style={{ fontSize:11, color:'rgba(255,255,255,0.3)' }}>Szenen werden einmalig analysiert · vier parallele KI-Calls</span>
            </div>
          )}

          {/* Header */}
          <div style={{ display:'flex', alignItems:'center', gap:12, padding:'16px 20px 10px', flexShrink:0, position:'relative', zIndex:1 }}>
            <div style={{
              width:36, height:36, borderRadius:10, flexShrink:0,
              background:'linear-gradient(135deg,#AF52DE33,#7b2fa055)',
              border:'1.5px solid #AF52DE77',
              display:'flex', alignItems:'center', justifyContent:'center',
            }}>
              <Wand2 size={17} color="#D18AFF" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize:18, fontWeight:800, letterSpacing:0.3,
                background:'linear-gradient(90deg,#fff 20%,#D18AFF 60%,#fff 80%)',
                backgroundSize:'200% auto', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent',
                animation:'syn-shimmer 4s linear infinite',
              }}>
                Episoden-Synopsen — Folge {folgeNummer}
              </div>
              <div style={{ fontSize:12, color:'rgba(255,255,255,0.72)', marginTop:3 }}>
                KI-Generierung · 6 Formate · alle Felder bearbeitbar · Autosave beim Schließen
              </div>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
              <button
                title="Alle Felder neu generieren"
                onClick={() => triggerGenerate()}
                disabled={isLoading}
                style={{
                  display:'flex', alignItems:'center', gap:5,
                  padding:'6px 12px', borderRadius:7,
                  background:'rgba(175,82,222,0.12)', border:'1px solid rgba(175,82,222,0.55)',
                  color:'#D18AFF', cursor: isLoading ? 'not-allowed' : 'pointer',
                  fontSize:12, fontWeight:700, opacity: isLoading ? 0.4 : 1,
                }}
              >
                <RotateCcw size={11} />
                Neu
              </button>
              <button onMouseDown={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.45)', display:'flex', padding:4 }}>
                <X size={16}/>
              </button>
            </div>
          </div>

          {/* Gradient divider */}
          <div style={{ height:1, background:'linear-gradient(90deg,transparent,#AF52DE44,transparent)', flexShrink:0 }}/>

          {/* Error / warning banner */}
          {(genError || missingSections.length > 0) && (
            <div style={{ padding:'7px 20px', background: genError ? 'rgba(255,149,0,0.1)' : 'rgba(255,204,0,0.08)', borderBottom:'1px solid rgba(255,149,0,0.2)', fontSize:11, color: genError ? '#FF9500' : '#FFCC00', flexShrink:0, display:'flex', alignItems:'center', gap:6 }}>
              <AlertTriangle size={12} />
              {genError || `Fehlende Abschnitte: ${missingSections.join(', ')} — KI-Antwort unvollständig. Neu generieren?`}
            </div>
          )}

          {/* Tabs */}
          <div style={{ display:'flex', flexWrap:'wrap', padding:'10px 16px 0', flexShrink:0, gap:2 }}>
            {TABS.map(t => (
              <button
                key={t.id}
                className={`syn-tab${activeTab===t.id ? ' syn-tab-active' : ''}`}
                onClick={() => setActiveTab(t.id)}
                style={{
                  flex:'0 0 auto', minWidth: 105, padding:'10px 18px', borderRadius:'7px 7px 0 0',
                  border:`1px solid ${activeTab===t.id ? '#AF52DE55' : 'rgba(255,255,255,0.12)'}`,
                  borderBottom: activeTab===t.id ? '1px solid #120820' : '1px solid rgba(255,255,255,0.12)',
                  background: activeTab===t.id ? 'rgba(175,82,222,0.15)' : 'rgba(255,255,255,0.04)',
                  cursor:'pointer', transition:'background 0.15s',
                  display:'flex', flexDirection:'column', alignItems:'center', gap:2,
                }}
              >
                <span style={{ fontSize:13, fontWeight: activeTab===t.id ? 700 : 500, color: activeTab===t.id ? '#D18AFF' : '#fff' }}>{t.label}</span>
                <span style={{ fontSize:10, color: activeTab===t.id ? 'rgba(209,138,255,0.7)' : 'rgba(255,255,255,0.55)' }}>{t.desc}</span>
              </button>
            ))}
          </div>

          {/* Zoom controls */}
          <div style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 20px 0', flexShrink:0, justifyContent:'flex-end' }}>
            <span style={{ fontSize:11, color:'rgba(255,255,255,0.4)', marginRight:4 }}>Schrift</span>
            <button onMouseDown={() => setEditorZoom(z => Math.max(0.7, Math.round((z - 0.1) * 10) / 10))} style={{ width:22, height:22, borderRadius:4, border:'1px solid rgba(255,255,255,0.15)', background:'transparent', color:'rgba(255,255,255,0.6)', cursor:'pointer', fontSize:13, lineHeight:'1', display:'flex', alignItems:'center', justifyContent:'center' }}>−</button>
            <span style={{ fontSize:11, color:'rgba(255,255,255,0.65)', minWidth:34, textAlign:'center' }}>{Math.round(editorZoom * 100)}%</span>
            <button onMouseDown={() => setEditorZoom(z => Math.min(2.0, Math.round((z + 0.1) * 10) / 10))} style={{ width:22, height:22, borderRadius:4, border:'1px solid rgba(255,255,255,0.15)', background:'transparent', color:'rgba(255,255,255,0.6)', cursor:'pointer', fontSize:13, lineHeight:'1', display:'flex', alignItems:'center', justifyContent:'center' }}>+</button>
            <button onMouseDown={() => setEditorZoom(1.2)} style={{ fontSize:10, padding:'2px 6px', borderRadius:3, border:'1px solid rgba(255,255,255,0.12)', background: Math.round(editorZoom * 10) === 12 ? 'rgba(255,255,255,0.15)' : 'transparent', color:'rgba(255,255,255,0.5)', cursor:'pointer' }}>Standard</button>
          </div>

          {/* Tab content */}
          <div style={{ flex:1, overflow:'auto', padding:'14px 20px' }}>

            {/* ── Titel ── */}
            {activeTab === 'titel' && (
              <div>
                <div style={{ marginBottom:12 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:5 }}>
                    <label style={{ fontSize:10, color:'rgba(255,255,255,0.45)' }}>GEWÄHLTER TITEL</label>
                    {selectedTitel && (
                      <span style={{ fontSize:12, fontWeight:600, color: selectedTitel.trim().split(/\s+/).length > 3 ? '#FF9500' : 'rgba(255,255,255,0.65)' }}>
                        {selectedTitel.trim().split(/\s+/).length} {selectedTitel.trim().split(/\s+/).length === 1 ? 'Wort' : 'Wörter'}
                        {selectedTitel.trim().split(/\s+/).length > 3 && ' — besser 1–3 Wörter'}
                      </span>
                    )}
                  </div>
                  <input
                    value={selectedTitel}
                    onChange={e => setSelectedTitel(e.target.value)}
                    placeholder="Titel eingeben oder Vorschlag anklicken…"
                    style={{
                      width:'100%', boxSizing:'border-box',
                      padding:'9px 12px', borderRadius:8,
                      border:'1px solid rgba(255,255,255,0.18)',
                      background:'rgba(0,0,0,0.35)', color:'#fff', fontSize:15, fontWeight:700,
                      outline:'none',
                    }}
                  />
                </div>

                {titelOptions.length > 0 && (
                  <div style={{ display:'flex', flexDirection:'column', gap:5, marginBottom:14 }}>
                    <div style={{ fontSize:10, color:'rgba(255,255,255,0.3)', marginBottom:2 }}>
                      VORSCHLÄGE — klicken zum Auswählen
                    </div>
                    {titelOptions.map((t, i) => (
                      <button
                        key={i}
                        className="syn-titel-card"
                        onClick={() => setSelectedTitel(t)}
                        style={{
                          textAlign:'left', padding:'9px 13px', borderRadius:8, cursor:'pointer',
                          border:`1.5px solid ${selectedTitel === t ? '#AF52DE' : 'rgba(255,255,255,0.1)'}`,
                          background: selectedTitel === t ? '#AF52DE22' : 'rgba(255,255,255,0.04)',
                          color:'#fff', fontSize:13, fontWeight: selectedTitel===t ? 700 : 500,
                          display:'flex', alignItems:'center', gap:10, transition:'border-color 0.12s, background 0.12s',
                        }}
                      >
                        {selectedTitel === t && <Check size={12} color="#AF52DE" style={{flexShrink:0}}/>}
                        {t}
                        <span style={{ marginLeft:'auto', fontSize:11, fontWeight:600, color: t.trim().split(/\s+/).length > 3 ? '#FF9500' : 'rgba(255,255,255,0.55)' }}>
                          {t.trim().split(/\s+/).length}W
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <button
                    onClick={handleTitelMehr}
                    disabled={titelMehrLoading || isLoading}
                    style={{
                      display:'inline-flex', alignItems:'center', gap:6,
                      padding:'7px 14px', borderRadius:7,
                      background:'rgba(175,82,222,0.18)', color:'#D18AFF',
                      border:'1px solid rgba(175,82,222,0.35)',
                      cursor: (titelMehrLoading || isLoading) ? 'not-allowed' : 'pointer',
                      fontSize:11, fontWeight:600, opacity: (titelMehrLoading || isLoading) ? 0.5 : 1,
                    }}
                  >
                    <Sparkles size={11}/>
                    {titelMehrLoading ? 'Generiere…' : 'Weitere 5 Titel'}
                  </button>
                  {titelMehrMsg && <span style={{ fontSize:11, color:'rgba(255,149,0,0.8)' }}>{titelMehrMsg}</span>}
                </div>
              </div>
            )}

            {/* ── Kurzinhalt ── */}
            {activeTab === 'kurzinhalt' && (
              <div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                  <span style={{ fontSize:11, color:'rgba(255,255,255,0.4)' }}>
                    Format: <strong style={{color:'rgba(255,255,255,0.65)'}}>Haupthandlung</strong> · <strong style={{color:'rgba(255,255,255,0.65)'}}>Nebenhandlungen</strong> · <strong style={{color:'rgba(255,255,255,0.65)'}}>Cliffhanger</strong>
                  </span>
                  {kurzEditor && kurzEditor.getText().length > 5 && (
                    <span style={{ fontSize:12, color:'rgba(255,255,255,0.65)' }}>
                      {wordCount(kurzEditor.getHTML())} Wörter
                    </span>
                  )}
                </div>
                <RichEditor editor={kurzEditor} minHeight={300} zoom={editorZoom} />
              </div>
            )}

            {/* ── Redaktion ── */}
            {activeTab === 'redaktion' && (
              <div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                  <span style={{ fontSize:11, color:'rgba(255,255,255,0.4)' }}>
                    Dramaturgisch · Wendepunkte · Rollennamen in CAPS · ein Absatz pro Strang
                  </span>
                  {redaktionEditor && redaktionEditor.getText().length > 5 && (() => {
                    const wc = wordCount(redaktionEditor.getHTML())
                    return (
                      <span style={{ fontSize:12, fontWeight:600, color: (wc < 300 || wc > 500) ? '#FF9500' : 'rgba(255,255,255,0.65)' }}>
                        {wc} Wörter {(wc < 300 || wc > 500) ? '(Ziel: 300–500)' : ''}
                      </span>
                    )
                  })()}
                </div>
                <RichEditor editor={redaktionEditor} minHeight={340} zoom={editorZoom} />
              </div>
            )}

            {/* ── Lektor ── */}
            {activeTab === 'lektor' && (
              <div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                  <span style={{ fontSize:11, color:'rgba(255,255,255,0.4)' }}>
                    Chronologischer Fließtext · [Want] [Need] [Akt X Ende] [Cliff] [Pen] · (Sz. X) Referenzen
                  </span>
                  {lektorEditor && lektorEditor.getText().length > 5 && (() => {
                    const wc = wordCount(lektorEditor.getHTML())
                    return (
                      <span style={{ fontSize:12, fontWeight:600, color: (wc < 300 || wc > 400) ? '#FF9500' : 'rgba(255,255,255,0.65)' }}>
                        {wc} Wörter {(wc < 300 || wc > 400) ? '(Ziel: 300–400)' : ''}
                      </span>
                    )
                  })()}
                </div>
                <RichEditor editor={lektorEditor} minHeight={400} zoom={editorZoom} />
              </div>
            )}

            {/* ── Strang ── */}
            {activeTab === 'strang' && (
              <div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                  <span style={{ fontSize:11, color:'rgba(255,255,255,0.4)' }}>
                    Je Handlungsstrang eine Zeile · max. 300 Zeichen
                  </span>
                  {strangText.trim() && (
                    <span style={{ fontSize:12, color:'rgba(255,255,255,0.65)' }}>
                      {strangText.split('\n').filter(Boolean).length} Stränge
                    </span>
                  )}
                </div>
                <div style={{ border:'1px solid rgba(255,255,255,0.12)', borderRadius:8, overflow:'hidden', background:'rgba(0,0,0,0.3)' }}>
                  {strangText.split('\n').filter(Boolean).map((line, i, arr) => {
                    const ci = line.indexOf(':')
                    const name = (ci >= 0 ? line.slice(0, ci) : line).trim()
                    const content = ci >= 0 ? line.slice(ci + 1).trim() : ''
                    const updateLine = (newName: string, newContent: string) => {
                      const lines = strangText.split('\n').filter(Boolean)
                      lines[i] = newContent ? `${newName}: ${newContent}` : newName
                      setStrangText(lines.join('\n'))
                    }
                    return (
                      <div key={i} style={{
                        display:'flex', alignItems:'center', gap:4,
                        padding:'7px 10px 7px 12px',
                        borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.07)' : 'none',
                      }}>
                        <input
                          value={name}
                          onChange={e => updateLine(e.target.value, content)}
                          placeholder="STRANG"
                          style={{
                            background:'transparent', border:'none', outline:'none',
                            fontWeight:700, color:'#D18AFF',
                            fontSize: Math.round(13 * editorZoom),
                            width:'28%', minWidth:60,
                          }}
                        />
                        <span style={{ color:'rgba(255,255,255,0.35)', fontWeight:700, flexShrink:0, fontSize: Math.round(13 * editorZoom) }}>:</span>
                        <input
                          value={content}
                          onChange={e => updateLine(name, e.target.value)}
                          placeholder="Kurzbeschreibung…"
                          style={{
                            flex:1, background:'transparent', border:'none', outline:'none',
                            color:'#f0f0f0', fontSize: Math.round(13 * editorZoom), lineHeight:1.7,
                          }}
                        />
                        <button
                          onMouseDown={() => {
                            const lines = strangText.split('\n').filter(Boolean)
                            lines.splice(i, 1)
                            setStrangText(lines.join('\n'))
                          }}
                          style={{ background:'none', border:'none', color:'rgba(255,255,255,0.2)', cursor:'pointer', padding:'2px 6px', fontSize:16, flexShrink:0 }}
                        >×</button>
                      </div>
                    )
                  })}
                  <div style={{ padding:'6px 12px', borderTop: strangText.trim() ? '1px solid rgba(255,255,255,0.07)' : 'none' }}>
                    <button
                      onMouseDown={() => setStrangText(prev => (prev.trim() ? prev.trimEnd() + '\n: ' : ': '))}
                      style={{ background:'none', border:'none', color:'rgba(175,82,222,0.6)', cursor:'pointer', fontSize:11, padding:0, fontWeight:600 }}
                    >
                      + Strang hinzufügen
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── Programmpresse ── */}
            {activeTab === 'programmpresse' && (
              <div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                  <span style={{ fontSize:11, color:'rgba(255,255,255,0.4)' }}>
                    TV-Listing / Programmpresse · werblich, neugierig machend · kein Spoiler
                  </span>
                  {presseEditor && presseEditor.getText().length > 3 && (
                    <span style={{
                      fontSize:11, fontWeight:600, padding:'2px 8px', borderRadius:5,
                      background: presseInRange ? 'rgba(0,200,83,0.12)' : 'rgba(255,149,0,0.12)',
                      border: `1px solid ${presseInRange ? '#00C85355' : '#FF950055'}`,
                      color: presseInRange ? '#00C853' : '#FF9500',
                    }}>
                      {presseChars} / 300–450 Zeichen
                    </span>
                  )}
                </div>
                <RichEditor editor={presseEditor} minHeight={160} zoom={editorZoom} />
              </div>
            )}

            {/* ── Pressetext ── */}
            {activeTab === 'pressetext' && (
              <div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                  <span style={{ fontSize:11, color:'rgba(255,255,255,0.4)' }}>
                    Sachlicher Pressetext · knapp · kein werblicher Ton · kein Spoiler
                  </span>
                  {pressetextEditor && pressetextEditor.getText().length > 3 && (
                    <span style={{
                      fontSize:11, fontWeight:600, padding:'2px 8px', borderRadius:5,
                      background: pressetextInRange ? 'rgba(0,200,83,0.12)' : 'rgba(255,59,48,0.12)',
                      border: `1px solid ${pressetextInRange ? '#00C85355' : '#FF3B3055'}`,
                      color: pressetextInRange ? '#00C853' : '#FF3B30',
                    }}>
                      {pressetextChars} / 280–330 Zeichen
                    </span>
                  )}
                </div>
                <RichEditor editor={pressetextEditor} minHeight={120} zoom={editorZoom} />
                {pressetextEditor && pressetextEditor.getText().length > 3 && !pressetextInRange && (
                  <div style={{ marginTop:8, fontSize:11, color:'rgba(255,255,255,0.35)' }}>
                    {pressetextChars < 280
                      ? `Noch ${280 - pressetextChars} Zeichen fehlen.`
                      : `${pressetextChars - 330} Zeichen zu viel — bitte kürzen.`}
                  </div>
                )}
              </div>
            )}

            {/* ── Deskriptoren ── */}
            {activeTab === 'deskriptoren' && (
              <div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                  <span style={{ fontSize:11, color:'rgba(255,255,255,0.4)' }}>
                    Jugendschutz-Inhaltsdeskriptoren (JuSchG) · Kategorien und Schweregrade
                  </span>
                  <span style={{ fontSize:11, color:'rgba(255,255,255,0.45)' }}>
                    {deskriptoren.length} {deskriptoren.length === 1 ? 'Deskriptor' : 'Deskriptoren'}
                  </span>
                </div>
                {deskriptoren.length === 0 ? (
                  <div style={{ textAlign:'center', padding:'40px 0', fontSize:13, color:'rgba(255,255,255,0.25)', fontStyle:'italic' }}>
                    Keine jugendschutzrelevanten Inhalte erkannt
                  </div>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:14 }}>
                    {deskriptoren.map((d, i) => (
                      <div key={i} style={{
                        background:'rgba(255,107,0,0.08)', border:'1px solid rgba(255,107,0,0.25)',
                        borderRadius:9, padding:'10px 12px',
                      }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                          <select
                            value={d.kategorie}
                            onChange={e => setDeskriptoren(prev => { const n=[...prev]; n[i]={...n[i],kategorie:e.target.value}; return n })}
                            style={{ background:'rgba(0,0,0,0.5)', border:'1px solid rgba(255,107,0,0.4)', borderRadius:5, color:'#FF9500', fontWeight:700, fontSize:12, padding:'2px 6px', cursor:'pointer' }}
                          >
                            {deskriptorVorlagen.map(k => <option key={k} value={k}>{k}</option>)}
                          </select>
                          <div style={{ display:'flex', gap:5 }}>
                            {(['leicht','mittel','stark'] as DeskriptorStufe[]).map(s => (
                              <button
                                key={s}
                                onClick={() => setDeskriptoren(prev => { const n=[...prev]; n[i]={...n[i],stufe:s}; return n })}
                                style={{
                                  padding:'2px 8px', borderRadius:4, fontSize:11, fontWeight:600, cursor:'pointer', border:'none',
                                  background: d.stufe===s ? `${STUFE_COLORS[s]}33` : 'rgba(255,255,255,0.06)',
                                  color: d.stufe===s ? STUFE_COLORS[s] : 'rgba(255,255,255,0.4)',
                                  outline: d.stufe===s ? `1.5px solid ${STUFE_COLORS[s]}88` : '1.5px solid transparent',
                                }}
                              >{s}</button>
                            ))}
                          </div>
                          <button
                            onClick={() => setDeskriptoren(prev => prev.filter((_,j)=>j!==i))}
                            style={{ marginLeft:'auto', background:'none', border:'none', color:'rgba(255,255,255,0.25)', cursor:'pointer', fontSize:16, padding:'0 4px' }}
                          >×</button>
                        </div>
                        <input
                          value={d.beschreibung}
                          onChange={e => setDeskriptoren(prev => { const n=[...prev]; n[i]={...n[i],beschreibung:e.target.value}; return n })}
                          placeholder="Kurzbeschreibung mit Szenenreferenz (Sz. X)…"
                          style={{
                            width:'100%', boxSizing:'border-box', background:'transparent', border:'none', outline:'none',
                            color:'rgba(255,255,255,0.8)', fontSize:12, lineHeight:1.6,
                          }}
                        />
                        {d.beschreibung && onNavigateToScene && (
                          <div style={{ marginTop:5, fontSize:11, color:'rgba(255,255,255,0.5)', lineHeight:1.6 }}>
                            {renderSceneRefs(d.beschreibung, (nr) => { setMinimized(true); onNavigateToScene(nr) })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => setDeskriptoren(prev => [...prev, { kategorie: deskriptorVorlagen[0] ?? 'Gewaltdarstellungen', stufe:'leicht', beschreibung:'' }])}
                  style={{ background:'none', border:'none', color:'rgba(255,107,0,0.65)', cursor:'pointer', fontSize:12, fontWeight:600, padding:0 }}
                >
                  + Deskriptor hinzufügen
                </button>
              </div>
            )}

            {/* ── FSK ── */}
            {activeTab === 'fsk' && (
              <div>
                <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', marginBottom:14 }}>
                  FSK-Altersfreigabe-Einschätzung — Auswahl + Begründung mit Szenenreferenzen
                </div>
                <div style={{ display:'flex', gap:10, marginBottom:16 }}>
                  {FSK_LEVELS.map(lvl => (
                    <button
                      key={lvl}
                      onClick={() => setFskRating(lvl)}
                      style={{
                        width:56, height:56, borderRadius:10, cursor:'pointer',
                        border: `2px solid ${fskRating===lvl ? FSK_COLORS[lvl] : 'rgba(255,255,255,0.12)'}`,
                        background: fskRating===lvl ? `${FSK_COLORS[lvl]}22` : 'rgba(0,0,0,0.3)',
                        color: fskRating===lvl ? FSK_COLORS[lvl] : 'rgba(255,255,255,0.45)',
                        fontSize:20, fontWeight:800, transition:'border-color 0.15s, background 0.15s',
                      }}
                    >{lvl}</button>
                  ))}
                </div>
                {fskRating && (
                  <div style={{
                    marginBottom:14, padding:'8px 14px', borderRadius:8,
                    background:`${FSK_COLORS[fskRating]}15`, border:`1px solid ${FSK_COLORS[fskRating]}44`,
                    fontSize:14, color:FSK_COLORS[fskRating], fontWeight:700,
                    display:'flex', alignItems:'center', gap:7,
                  }}>
                    <Shield size={14} />
                    FSK {fskRating}
                  </div>
                )}
                <label style={{ fontSize:11, color:'rgba(255,255,255,0.4)', display:'block', marginBottom:6 }}>BEGRÜNDUNG</label>
                <textarea
                  value={fskBegruendung}
                  onChange={e => setFskBegruendung(e.target.value)}
                  placeholder="Begründung für die FSK-Einschätzung, mit Szenenreferenzen (Sz. X)…"
                  style={{
                    width:'100%', boxSizing:'border-box', minHeight:160, padding:'10px 12px', borderRadius:8,
                    border:'1px solid rgba(255,255,255,0.15)', background:'rgba(0,0,0,0.35)',
                    color:'#f0f0f0', fontSize:Math.round(13 * editorZoom), lineHeight:1.7,
                    outline:'none', resize:'vertical', fontFamily:'inherit',
                  }}
                />
                {fskBegruendung && onNavigateToScene && (
                  <div style={{ marginTop:8, fontSize:12, color:'rgba(255,255,255,0.55)', lineHeight:1.7 }}>
                    {renderSceneRefs(fskBegruendung, (nr) => { setMinimized(true); onNavigateToScene(nr) })}
                  </div>
                )}
              </div>
            )}

          </div>

          {/* Footer */}
          <div style={{
            flexShrink:0, padding:'10px 20px', borderTop:'1px solid rgba(255,255,255,0.08)',
            display:'flex', alignItems:'center', gap:10,
          }}>
            <button
              onClick={() => save()}
              disabled={saveLoading || isLoading}
              style={{
                display:'inline-flex', alignItems:'center', gap:6,
                padding:'7px 18px', borderRadius:7,
                background: saveLoading ? 'rgba(0,200,83,0.15)' : '#00C853',
                color:'#fff', border:'1px solid #00C853',
                cursor: (saveLoading || isLoading) ? 'not-allowed' : 'pointer',
                fontSize:12, fontWeight:700, opacity: (saveLoading || isLoading) ? 0.7 : 1,
              }}
            >
              <Check size={12}/>
              {saveLoading ? 'Speichert…' : 'Speichern'}
            </button>
            {saveMsg && (
              <span style={{ fontSize:11, color: saveMsg.startsWith('Fehler') ? '#FF9500' : 'rgba(0,200,83,0.8)' }}>
                {saveMsg}
              </span>
            )}
            <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:11, color:'rgba(255,255,255,0.45)' }}>
                Folge {folgeNummer}
              </span>
              {onUebernehmen && (
                <button
                  onClick={handleUebernehmen}
                  disabled={saveLoading || isLoading}
                  style={{
                    display:'inline-flex', alignItems:'center', gap:6,
                    padding:'7px 16px', borderRadius:7,
                    background:'rgba(175,82,222,0.18)', border:'1px solid #AF52DE88',
                    color:'#D18AFF', cursor:(saveLoading || isLoading) ? 'not-allowed' : 'pointer',
                    fontSize:12, fontWeight:700, opacity:(saveLoading || isLoading) ? 0.6 : 1,
                  }}
                >
                  <Wand2 size={12}/>
                  Übernehmen — {TABS.find(t => t.id === activeTab)?.label}
                </button>
              )}
              <button
                onClick={handleClose}
                style={{
                  padding:'7px 14px', borderRadius:7,
                  background:'transparent', border:'1px solid rgba(255,255,255,0.2)',
                  color:'rgba(255,255,255,0.7)', cursor:'pointer', fontSize:12,
                }}
              >
                Schließen &amp; Autosave
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
