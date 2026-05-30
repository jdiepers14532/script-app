import { useState, useEffect, useCallback } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import { Wand2, X, Sparkles, Bold, Italic, Underline as UnderlineIcon, Check, RefreshCw, RotateCcw } from 'lucide-react'
import { api } from '../../api/client'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Wandelt rohen KI-Text in HTML um. boldAllCaps boldet GROSSBUCHSTABEN-Wörter. */
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

/** Wandelt Kurzinhalt-Text (mit **Markdown**-Headings) in HTML mit <strong>-Headings um */
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
    // **Heading:** → <p><strong>Heading:</strong></p>
    const headMatch = trimmed.match(/^\*\*(.+?)\*\*:?\s*$/)
    if (headMatch) {
      flushPara()
      result.push(`<p><strong>${headMatch[1]}:</strong></p>`)
      continue
    }
    currentPara.push(trimmed)
  }
  flushPara()
  return result.join('') || '<p></p>'
}

function wordCount(html: string): number {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).length
}

// ── Minimal Toolbar ───────────────────────────────────────────────────────────

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

function RichEditor({ editor, minHeight = 140 }: { editor: ReturnType<typeof useEditor>; minHeight?: number }) {
  if (!editor) return null
  return (
    <div style={{ border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, overflow: 'hidden', background: 'rgba(0,0,0,0.3)' }}>
      <RichToolbar editor={editor} />
      <EditorContent editor={editor} style={{ minHeight, padding: '10px 12px', color: '#f0f0f0', fontSize: 13, lineHeight: 1.65 }} />
    </div>
  )
}

// ── Pre-Check Dialog ──────────────────────────────────────────────────────────

function PreCheckDialog({
  data, folgeNummer, onLoad, onNew, onAbort,
}: {
  data: { folgen_titel?: string; synopsis?: string; synopsis_300?: string; synopsis_presse?: string; synopsis_straenge?: string }
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
      background: 'linear-gradient(160deg, #1a0a2e 0%, #120820 50%, #0d0518 100%)',
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
      padding: '28px 28px 24px', overflowY: 'auto',
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
          { label: 'KURZINHALT', v: data.synopsis_300 },
          { label: 'REDAKTION', v: data.synopsis },
          { label: 'PRESSE', v: data.synopsis_presse },
          { label: 'STRÄNGE', v: data.synopsis_straenge },
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

// ── Haupt-Modal ───────────────────────────────────────────────────────────────

type Tab = 'titel' | 'kurzinhalt' | 'redaktion' | 'strang' | 'presse'

interface Props {
  open: boolean
  onClose: () => void
  folgeId: number
  folgeNummer: number
}

const TABS: { id: Tab; label: string; desc: string }[] = [
  { id: 'titel',      label: 'Titel',       desc: '1–3 Wörter' },
  { id: 'kurzinhalt', label: 'Kurzinhalt',  desc: 'strukturiert' },
  { id: 'redaktion',  label: 'Redaktion',   desc: 'dramaturgisch' },
  { id: 'strang',     label: 'Strang',      desc: '≤100 Zeichen' },
  { id: 'presse',     label: 'Presse',      desc: 'werblich' },
]

export default function SynopsenGenerierungModal({ open, onClose, folgeId, folgeNummer }: Props) {
  const [visible, setVisible] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('titel')

  // Pre-check
  const [checking, setChecking] = useState(false)
  const [preCheckData, setPreCheckData] = useState<any>(null)
  const [showPreCheck, setShowPreCheck] = useState(false)

  // Generierung
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)

  // Titel
  const [titelOptions, setTitelOptions] = useState<string[]>([])
  const [selectedTitel, setSelectedTitel] = useState('')
  const [titelMehrLoading, setTitelMehrLoading] = useState(false)
  const [titelMehrMsg, setTitelMehrMsg] = useState<string | null>(null)

  // Strang (plain textarea, kein rich editor)
  const [strangText, setStrangText] = useState('')

  // Tiptap Editoren
  const kurzEditor = useEditor({ extensions: [StarterKit, Underline], content: '<p></p>' })
  const redaktionEditor = useEditor({ extensions: [StarterKit, Underline], content: '<p></p>' })
  const presseEditor = useEditor({ extensions: [StarterKit, Underline], content: '<p></p>' })

  // Save state
  const [saveLoading, setSaveLoading] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)

  // ── Visible-Fade ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (open) setTimeout(() => setVisible(true), 10)
    else setVisible(false)
  }, [open])

  // ── Reset + Pre-Check beim Öffnen ────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    setActiveTab('titel')
    setTitelOptions([])
    setSelectedTitel('')
    setTitelMehrMsg(null)
    setStrangText('')
    setGenError(null)
    setSaveMsg(null)
    kurzEditor?.commands.setContent('<p></p>')
    redaktionEditor?.commands.setContent('<p></p>')
    presseEditor?.commands.setContent('<p></p>')

    setChecking(true)
    api.kiSynopsenCheck(folgeId)
      .then(data => {
        if (data?.hasData) {
          setPreCheckData(data)
          setShowPreCheck(true)
        } else {
          // Keine vorhandenen Daten → direkt generieren
          triggerGenerate()
        }
      })
      .catch(() => triggerGenerate())
      .finally(() => setChecking(false))
  }, [open, folgeId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── KI-Generierung (kombiniert) ──────────────────────────────────────────────
  const triggerGenerate = useCallback(async () => {
    setGenerating(true)
    setGenError(null)
    setTitelOptions([])
    setSelectedTitel('')
    setStrangText('')
    kurzEditor?.commands.setContent('<p></p>')
    redaktionEditor?.commands.setContent('<p></p>')
    presseEditor?.commands.setContent('<p></p>')
    try {
      const r = await api.kiSynopsenGeneriereAlle(folgeId)
      if (r.disabled) {
        setGenError('KI-Funktion nicht aktiviert (Admin-Einstellungen)')
        return
      }
      if (r.titel?.length) setTitelOptions(r.titel)
      if (r.kurzinhalt) kurzEditor?.commands.setContent(kurzinhaltToHtml(r.kurzinhalt))
      if (r.redaktion)  redaktionEditor?.commands.setContent(kiTextToHtml(r.redaktion, true))
      if (r.presse)     presseEditor?.commands.setContent(kiTextToHtml(r.presse, false))
      if (r.straenge)   setStrangText(r.straenge)
    } catch (e: any) {
      setGenError('Generierungsfehler: ' + (e?.message ?? String(e)))
    } finally {
      setGenerating(false)
    }
  }, [folgeId, kurzEditor, redaktionEditor, presseEditor]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadExisting = useCallback(() => {
    if (!preCheckData) return
    if (preCheckData.folgen_titel) setSelectedTitel(preCheckData.folgen_titel)
    if (preCheckData.synopsis_300 && kurzEditor)    kurzEditor.commands.setContent(preCheckData.synopsis_300)
    if (preCheckData.synopsis     && redaktionEditor) redaktionEditor.commands.setContent(preCheckData.synopsis)
    if (preCheckData.synopsis_presse  && presseEditor)   presseEditor.commands.setContent(preCheckData.synopsis_presse)
    if (preCheckData.synopsis_straenge) setStrangText(preCheckData.synopsis_straenge)
    setShowPreCheck(false)
  }, [preCheckData, kurzEditor, redaktionEditor, presseEditor])

  // ── Escape ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Weitere 5 Titel ──────────────────────────────────────────────────────────
  async function handleTitelMehr() {
    setTitelMehrLoading(true); setTitelMehrMsg(null)
    try {
      const r = await api.kiSynopsenTitelMehr(folgeId, titelOptions)
      if (r.disabled) { setTitelMehrMsg('KI nicht aktiviert'); return }
      if (!r.titel?.length) { setTitelMehrMsg('Keine neuen Titel generiert.'); return }
      setTitelOptions(prev => [...prev, ...r.titel])
    } catch (e: any) { setTitelMehrMsg('Fehler: ' + (e?.message ?? String(e))) }
    finally { setTitelMehrLoading(false) }
  }

  // ── Speichern ────────────────────────────────────────────────────────────────
  const save = useCallback(async (): Promise<boolean> => {
    setSaveLoading(true); setSaveMsg(null)
    try {
      const kurzHtml = kurzEditor?.getHTML()
      const redaktionHtml = redaktionEditor?.getHTML()
      const presseHtml = presseEditor?.getHTML()
      await api.saveFolgenSynopsen(folgeId, {
        folgen_titel:      selectedTitel.trim() || null,
        synopsis_300:      (kurzHtml && kurzHtml !== '<p></p>') ? kurzHtml : null,
        synopsis:          (redaktionHtml && redaktionHtml !== '<p></p>') ? redaktionHtml : null,
        synopsis_presse:   (presseHtml && presseHtml !== '<p></p>') ? presseHtml : null,
        synopsis_straenge: strangText.trim() || null,
      })
      setSaveMsg('Gespeichert.')
      return true
    } catch (e: any) {
      setSaveMsg('Speicherfehler: ' + (e?.message ?? String(e)))
      return false
    } finally {
      setSaveLoading(false)
    }
  }, [folgeId, selectedTitel, kurzEditor, redaktionEditor, presseEditor, strangText])

  async function handleClose() {
    await save()
    onClose()
  }

  if (!open) return null

  const isLoading = checking || generating

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
        .syn-gen-btn:not(:disabled):hover { transform: translateY(-1px); box-shadow: 0 4px 16px #AF52DE55; }
        .syn-strang-ta { resize: vertical; background: rgba(0,0,0,0.3); color: #f0f0f0; border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; padding: 10px 12px; font-size: 12px; line-height: 1.7; font-family: 'JetBrains Mono', 'Fira Code', monospace; width: 100%; box-sizing: border-box; outline: none; }
        .syn-strang-ta:focus { border-color: rgba(175,82,222,0.5); }
      `}</style>

      <div
        onMouseDown={handleClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 10001,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(5,0,20,0.75)', backdropFilter: 'blur(5px)',
          opacity: visible ? 1 : 0, transition: 'opacity 0.25s',
        }}
      >
        <div
          className="syn-m"
          onMouseDown={e => e.stopPropagation()}
          style={{
            position: 'relative',
            width: 580, maxWidth: 'calc(100vw - 24px)', maxHeight: 'calc(100vh - 40px)',
            background: 'linear-gradient(160deg, #1a0a2e 0%, #120820 50%, #0d0518 100%)',
            borderRadius: 16, border: '1.5px solid #AF52DE55', overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
            animation: visible ? 'syn-glow 3s ease-in-out infinite, syn-fade-in 0.28s ease-out forwards' : 'none',
          }}
        >
          {/* Animated stars */}
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

          {/* Full-screen loading */}
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
              <span style={{ fontSize:11, color:'rgba(255,255,255,0.3)' }}>Szenen werden einmalig analysiert</span>
            </div>
          )}

          {/* Header */}
          <div style={{ display:'flex', alignItems:'center', gap:12, padding:'18px 20px 12px', flexShrink:0, position:'relative', zIndex:1 }}>
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
                fontSize:14, fontWeight:800, letterSpacing:0.3,
                background:'linear-gradient(90deg,#fff 20%,#D18AFF 60%,#fff 80%)',
                backgroundSize:'200% auto', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent',
                animation:'syn-shimmer 4s linear infinite',
              }}>
                Episoden-Synopsen — Folge {folgeNummer}
              </div>
              <div style={{ fontSize:10, color:'rgba(255,255,255,0.4)', marginTop:1 }}>
                KI-Generierung · einmalige Analyse · alle Felder bearbeitbar
              </div>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
              {/* Neu generieren Button */}
              <button
                title="Alle Felder neu generieren"
                onClick={() => triggerGenerate()}
                disabled={isLoading}
                style={{
                  display:'flex', alignItems:'center', gap:5,
                  padding:'5px 10px', borderRadius:7,
                  background:'transparent', border:'1px solid rgba(175,82,222,0.35)',
                  color:'rgba(175,82,222,0.8)', cursor: isLoading ? 'not-allowed' : 'pointer',
                  fontSize:11, fontWeight:600, opacity: isLoading ? 0.4 : 1,
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

          {/* Divider */}
          <div style={{ height:1, background:'linear-gradient(90deg,transparent,#AF52DE44,transparent)', flexShrink:0 }}/>

          {/* Error banner */}
          {genError && (
            <div style={{ padding:'8px 20px', background:'rgba(255,149,0,0.1)', borderBottom:'1px solid rgba(255,149,0,0.25)', fontSize:11, color:'#FF9500', flexShrink:0 }}>
              {genError}
            </div>
          )}

          {/* Tabs */}
          <div style={{ display:'flex', padding:'10px 16px 0', flexShrink:0, gap:2 }}>
            {TABS.map(t => (
              <button
                key={t.id}
                className={`syn-tab${activeTab===t.id ? ' syn-tab-active' : ''}`}
                onClick={() => setActiveTab(t.id)}
                style={{
                  flex:1, padding:'7px 4px', borderRadius:'7px 7px 0 0',
                  border:`1px solid ${activeTab===t.id ? '#AF52DE55' : 'rgba(255,255,255,0.08)'}`,
                  borderBottom: activeTab===t.id ? '1px solid #120820' : '1px solid rgba(255,255,255,0.08)',
                  background: activeTab===t.id ? 'rgba(175,82,222,0.12)' : 'transparent',
                  cursor:'pointer', transition:'background 0.15s',
                  display:'flex', flexDirection:'column', alignItems:'center', gap:1,
                }}
              >
                <span style={{ fontSize:11, fontWeight: activeTab===t.id ? 700 : 500, color: activeTab===t.id ? '#D18AFF' : 'rgba(255,255,255,0.5)' }}>{t.label}</span>
                <span style={{ fontSize:9, color:'rgba(255,255,255,0.28)' }}>{t.desc}</span>
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={{ flex:1, overflow:'auto', padding:'14px 20px' }}>

            {/* ── Titel ── */}
            {activeTab === 'titel' && (
              <div>
                <div style={{ marginBottom:12 }}>
                  <label style={{ fontSize:10, color:'rgba(255,255,255,0.45)', display:'block', marginBottom:5 }}>GEWÄHLTER TITEL</label>
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
                  {selectedTitel && (
                    <div style={{ fontSize:10, color:'rgba(255,255,255,0.3)', marginTop:4 }}>
                      {selectedTitel.trim().split(/\s+/).length} {selectedTitel.trim().split(/\s+/).length === 1 ? 'Wort' : 'Wörter'}
                      {selectedTitel.trim().split(/\s+/).length > 3 && (
                        <span style={{ color:'#FF9500' }}> — Titel sollten 1–3 Wörter haben</span>
                      )}
                    </div>
                  )}
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
                        <span style={{ marginLeft:'auto', fontSize:9, color:'rgba(255,255,255,0.2)' }}>
                          {t.trim().split(/\s+/).length}W
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <button
                    className="syn-gen-btn"
                    onClick={handleTitelMehr}
                    disabled={titelMehrLoading || isLoading}
                    style={{
                      display:'inline-flex', alignItems:'center', gap:6,
                      padding:'7px 14px', borderRadius:7,
                      background: titelMehrLoading ? 'rgba(175,82,222,0.1)' : 'rgba(175,82,222,0.18)',
                      color:'#D18AFF', border:'1px solid rgba(175,82,222,0.35)',
                      cursor: (titelMehrLoading || isLoading) ? 'not-allowed' : 'pointer',
                      fontSize:11, fontWeight:600, opacity: (titelMehrLoading || isLoading) ? 0.5 : 1,
                      transition:'transform 0.12s, box-shadow 0.12s',
                    }}
                  >
                    <Sparkles size={11}/>
                    {titelMehrLoading ? 'Generiere…' : 'Weitere 5 Titel'}
                  </button>
                  {titelMehrMsg && <span style={{ fontSize:11, color:'rgba(255,149,0,0.8)' }}>{titelMehrMsg}</span>}
                </div>
              </div>
            )}

            {/* ── Kurzinhalt-strukturiert ── */}
            {activeTab === 'kurzinhalt' && (
              <div>
                <div style={{ marginBottom:10, fontSize:11, color:'rgba(255,255,255,0.4)', lineHeight:1.5 }}>
                  Format: <strong style={{color:'rgba(255,255,255,0.65)'}}>Haupthandlung</strong> · <strong style={{color:'rgba(255,255,255,0.65)'}}>Nebenhandlungen</strong> · <strong style={{color:'rgba(255,255,255,0.65)'}}>Cliffhanger</strong>
                </div>
                <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:8 }}>
                  {kurzEditor && kurzEditor.getText().length > 5 && (
                    <span style={{ fontSize:10, color:'rgba(255,255,255,0.25)' }}>{wordCount(kurzEditor.getHTML())} Wörter</span>
                  )}
                </div>
                <RichEditor editor={kurzEditor} minHeight={200} />
              </div>
            )}

            {/* ── Redaktion ── */}
            {activeTab === 'redaktion' && (
              <div>
                <div style={{ marginBottom:10, fontSize:11, color:'rgba(255,255,255,0.4)', lineHeight:1.5 }}>
                  Dramaturgisch · Wants &amp; Needs · Wendepunkte · Rollennamen in CAPS · ein Absatz pro Strang
                </div>
                <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:8 }}>
                  {redaktionEditor && redaktionEditor.getText().length > 5 && (
                    <span style={{ fontSize:10, color:'rgba(255,255,255,0.25)' }}>{wordCount(redaktionEditor.getHTML())} Wörter</span>
                  )}
                </div>
                <RichEditor editor={redaktionEditor} minHeight={240} />
              </div>
            )}

            {/* ── Strang ── */}
            {activeTab === 'strang' && (
              <div>
                <div style={{ marginBottom:10, fontSize:11, color:'rgba(255,255,255,0.4)', lineHeight:1.5 }}>
                  Je Handlungsstrang eine Zeile · max. 100 Zeichen · Format: FIGUR/STRANG: Inhalt
                </div>
                <textarea
                  className="syn-strang-ta"
                  value={strangText}
                  onChange={e => setStrangText(e.target.value)}
                  rows={8}
                  placeholder={"LOU: Entscheidung über München und Trennung von Richard\nBRITTA: Ehrenamt im Krankenhaus, Job-Angebot\nMO/JULIUS: Aussprache und Annäherung\nTONI: Neue Erfüllung als Grüne Dame"}
                  spellCheck={false}
                />
                {strangText && (
                  <div style={{ marginTop:6, display:'flex', flexDirection:'column', gap:2 }}>
                    {strangText.split('\n').filter(Boolean).map((line, i) => {
                      const len = line.length
                      return (
                        <div key={i} style={{ display:'flex', justifyContent:'space-between', fontSize:10, color: len > 100 ? '#FF9500' : 'rgba(255,255,255,0.2)' }}>
                          <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{line.substring(0, 40)}{line.length > 40 ? '…' : ''}</span>
                          <span style={{ flexShrink:0, marginLeft:8 }}>{len}/100</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── Presse ── */}
            {activeTab === 'presse' && (
              <div>
                <div style={{ marginBottom:10, fontSize:11, color:'rgba(255,255,255,0.4)', lineHeight:1.5 }}>
                  Programm-Presse · fließend, werblich · keine Cliffhanger oder Wendungen verraten · ca. 60–80 Wörter
                </div>
                <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:8 }}>
                  {presseEditor && presseEditor.getText().length > 5 && (
                    <span style={{ fontSize:10, color: wordCount(presseEditor.getHTML()) > 90 ? '#FF9500' : 'rgba(255,255,255,0.25)' }}>
                      {wordCount(presseEditor.getHTML())} Wörter
                    </span>
                  )}
                </div>
                <RichEditor editor={presseEditor} minHeight={140} />
              </div>
            )}

          </div>

          {/* Footer */}
          <div style={{
            flexShrink:0, padding:'11px 20px', borderTop:'1px solid rgba(255,255,255,0.08)',
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
            <button
              onClick={handleClose}
              style={{
                marginLeft:'auto', padding:'7px 14px', borderRadius:7,
                background:'transparent', border:'1px solid rgba(255,255,255,0.12)',
                color:'rgba(255,255,255,0.5)', cursor:'pointer', fontSize:12,
              }}
            >
              Schließen &amp; Autosave
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
