import { useState, useEffect, useCallback } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import { Wand2, X, Sparkles, Bold, Italic, Underline as UnderlineIcon, Check, RefreshCw } from 'lucide-react'
import { api } from '../../api/client'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Bereinigt KI-Artefakte und gibt sauberes HTML zurück. boldAllCaps=true boldet GROSSBUCHSTABEN-Wörter. */
function kiTextToHtml(raw: string, boldAllCaps = false): string {
  const clean = raw
    .replace(/\*{1,3}/g, '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^>\s*/gm, '')
    .replace(/^[-=]{3,}\s*$/gm, '')
    .trim()

  const paras = clean.split(/\n{2,}/).map(p => p.replace(/\n/g, ' ').trim()).filter(Boolean)
  if (!paras.length) return '<p></p>'

  return paras.map(p => {
    if (boldAllCaps) {
      const bolded = p.replace(/\b([A-ZÄÖÜ][A-ZÄÖÜ0-9]{2,}(?:'[A-ZÄÖÜ][A-ZÄÖÜ0-9]*)?)\b/g, '<strong>$1</strong>')
      return `<p>${bolded}</p>`
    }
    return `<p>${p}</p>`
  }).join('')
}

/** Zählt Wörter in HTML-String */
function wordCount(html: string): number {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).length
}

// ── Minimal Toolbar ───────────────────────────────────────────────────────────

function RichToolbar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  if (!editor) return null
  const btn = (active: boolean, onClick: () => void, children: React.ReactNode, title: string) => (
    <button
      onMouseDown={e => { e.preventDefault(); onClick() }}
      title={title}
      style={{
        width: 28, height: 28, borderRadius: 5, border: 'none', cursor: 'pointer',
        background: active ? 'rgba(255,255,255,0.15)' : 'transparent',
        color: active ? '#fff' : 'rgba(255,255,255,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background 0.12s, color 0.12s',
      }}
    >{children}</button>
  )
  return (
    <div style={{
      display: 'flex', gap: 2, padding: '5px 8px',
      borderBottom: '1px solid rgba(255,255,255,0.1)',
    }}>
      {btn(editor.isActive('bold'),      () => editor.chain().focus().toggleBold().run(),      <Bold size={13} />,         'Fett (Ctrl+B)')}
      {btn(editor.isActive('italic'),    () => editor.chain().focus().toggleItalic().run(),    <Italic size={13} />,       'Kursiv (Ctrl+I)')}
      {btn(editor.isActive('underline'), () => editor.chain().focus().toggleUnderline().run(), <UnderlineIcon size={13} />, 'Unterstrichen (Ctrl+U)')}
    </div>
  )
}

// ── Rich Editor ───────────────────────────────────────────────────────────────

function RichEditor({ editor, minHeight = 140 }: { editor: ReturnType<typeof useEditor>; minHeight?: number }) {
  if (!editor) return null
  return (
    <div style={{
      border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: 8, overflow: 'hidden',
      background: 'rgba(0,0,0,0.3)',
    }}>
      <RichToolbar editor={editor} />
      <EditorContent
        editor={editor}
        style={{ minHeight, padding: '10px 12px', color: '#f0f0f0', fontSize: 13, lineHeight: 1.65 }}
      />
    </div>
  )
}

// ── Pre-Check Dialog ──────────────────────────────────────────────────────────

function PreCheckDialog({
  data, folgeNummer, onLoad, onNew, onAbort,
}: {
  data: { folgen_titel?: string; synopsis?: string; synopsis_300?: string }
  folgeNummer: number
  onLoad: () => void
  onNew: () => void
  onAbort: () => void
}) {
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 10, borderRadius: 16,
      background: 'linear-gradient(160deg, #1a0a2e 0%, #120820 50%, #0d0518 100%)',
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
      padding: '28px 28px 24px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Wand2 size={16} color="#D18AFF" />
        <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>
          Folge {folgeNummer} hat bereits Synopsen-Daten
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 22 }}>
        {data.folgen_titel && (
          <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 8, padding: '8px 12px' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 2 }}>TITEL</div>
            <div style={{ fontSize: 13, color: '#f0f0f0', fontWeight: 600 }}>{data.folgen_titel}</div>
          </div>
        )}
        {data.synopsis_300 && (
          <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 8, padding: '8px 12px' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 2 }}>SYNOPSIS 300</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}
              dangerouslySetInnerHTML={{ __html: data.synopsis_300.substring(0, 200) + (data.synopsis_300.length > 200 ? '…' : '') }}
            />
          </div>
        )}
        {data.synopsis && (
          <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 8, padding: '8px 12px' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 2 }}>SYNOPSIS (LANG)</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}
              dangerouslySetInnerHTML={{ __html: data.synopsis.substring(0, 200) + (data.synopsis.length > 200 ? '…' : '') }}
            />
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button onClick={onLoad} style={btnStyle('#AF52DE', true)}>
          <Check size={13} /> Vorhandene Daten anzeigen
        </button>
        <button onClick={onNew} style={btnStyle('rgba(255,255,255,0.1)', false)}>
          <RefreshCw size={13} /> Neu generieren &amp; überschreiben
        </button>
        <button onClick={onAbort} style={{ ...btnStyle('transparent', false), color: 'rgba(255,255,255,0.4)' }}>
          Abbrechen
        </button>
      </div>
    </div>
  )
}

function btnStyle(bg: string, primary: boolean): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
    padding: '10px 16px', borderRadius: 9,
    background: bg, border: `1px solid ${primary ? '#AF52DE' : 'rgba(255,255,255,0.12)'}`,
    color: primary ? '#fff' : 'rgba(255,255,255,0.75)',
    cursor: 'pointer', fontSize: 13, fontWeight: primary ? 700 : 500,
  }
}

// ── Haupt-Modal ───────────────────────────────────────────────────────────────

type Tab = 'titel' | 'kurz' | 'lang'

interface Props {
  open: boolean
  onClose: () => void
  folgeId: number
  folgeNummer: number
}

export default function SynopsenGenerierungModal({ open, onClose, folgeId, folgeNummer }: Props) {
  const [visible, setVisible] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('titel')

  // Pre-check
  const [checking, setChecking] = useState(false)
  const [preCheckData, setPreCheckData] = useState<any>(null)
  const [showPreCheck, setShowPreCheck] = useState(false)

  // Titel
  const [titelOptions, setTitelOptions] = useState<string[]>([])
  const [titelLoading, setTitelLoading] = useState(false)
  const [selectedTitel, setSelectedTitel] = useState('')
  const [titelMsg, setTitelMsg] = useState<string | null>(null)

  // Kurz (Synopsis 300)
  const [kurzLoading, setKurzLoading] = useState(false)
  const [kurzMsg, setKurzMsg] = useState<string | null>(null)

  // Lang (Synopsis)
  const [langLoading, setLangLoading] = useState(false)
  const [langMsg, setLangMsg] = useState<string | null>(null)

  // Save
  const [saveLoading, setSaveLoading] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)

  // Tiptap Editoren
  const kurzEditor = useEditor({
    extensions: [StarterKit, Underline],
    content: '<p></p>',
  })
  const langEditor = useEditor({
    extensions: [StarterKit, Underline],
    content: '<p></p>',
  })

  useEffect(() => {
    if (open) setTimeout(() => setVisible(true), 10)
    else { setVisible(false) }
  }, [open])

  // Pre-check beim Öffnen
  useEffect(() => {
    if (!open) return
    setChecking(true)
    setPreCheckData(null)
    setShowPreCheck(false)
    setTitelOptions([])
    setSelectedTitel('')
    setTitelMsg(null)
    setKurzMsg(null)
    setLangMsg(null)
    setSaveMsg(null)
    kurzEditor?.commands.setContent('<p></p>')
    langEditor?.commands.setContent('<p></p>')

    api.kiSynopsenCheck(folgeId)
      .then(data => {
        if (data?.hasData) {
          setPreCheckData(data)
          setShowPreCheck(true)
        }
      })
      .catch(() => {})
      .finally(() => setChecking(false))
  }, [open, folgeId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Escape schließt
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadExisting = useCallback(async () => {
    if (!preCheckData) return
    if (preCheckData.folgen_titel) setSelectedTitel(preCheckData.folgen_titel)
    if (preCheckData.synopsis_300 && kurzEditor) kurzEditor.commands.setContent(preCheckData.synopsis_300)
    if (preCheckData.synopsis   && langEditor) langEditor.commands.setContent(preCheckData.synopsis)
    setShowPreCheck(false)
  }, [preCheckData, kurzEditor, langEditor])

  // ── Generierungen ──────────────────────────────────────────────────────────

  async function generateTitel() {
    setTitelLoading(true); setTitelMsg(null); setTitelOptions([])
    try {
      const r = await api.kiSynopsenTitel(folgeId)
      if (r.disabled) { setTitelMsg('KI nicht aktiviert (Admin-Einstellungen)'); return }
      if (!r.titel?.length) { setTitelMsg('Keine Titel generiert.'); return }
      setTitelOptions(r.titel)
    } catch (e: any) { setTitelMsg('Fehler: ' + (e?.message ?? String(e))) }
    finally { setTitelLoading(false) }
  }

  async function generateKurz() {
    setKurzLoading(true); setKurzMsg(null)
    try {
      const r = await api.kiSynopsenKurz(folgeId)
      if (r.disabled) { setKurzMsg('KI nicht aktiviert (Admin-Einstellungen)'); return }
      if (!r.text) { setKurzMsg('Kein Text generiert.'); return }
      kurzEditor?.commands.setContent(kiTextToHtml(r.text, false))
      setKurzMsg(`Generiert (${r.szenen_count} Szenen)`)
    } catch (e: any) { setKurzMsg('Fehler: ' + (e?.message ?? String(e))) }
    finally { setKurzLoading(false) }
  }

  async function generateLang() {
    setLangLoading(true); setLangMsg(null)
    try {
      const r = await api.kiSynopsenLang(folgeId)
      if (r.disabled) { setLangMsg('KI nicht aktiviert (Admin-Einstellungen)'); return }
      if (!r.text) { setLangMsg('Kein Text generiert.'); return }
      langEditor?.commands.setContent(kiTextToHtml(r.text, true))
      setLangMsg(`Generiert (${r.szenen_count} Szenen) — Rollennamen fett markiert`)
    } catch (e: any) { setLangMsg('Fehler: ' + (e?.message ?? String(e))) }
    finally { setLangLoading(false) }
  }

  // ── Speichern ──────────────────────────────────────────────────────────────

  const save = useCallback(async (): Promise<boolean> => {
    setSaveLoading(true); setSaveMsg(null)
    try {
      await api.saveFolgenSynopsen(folgeId, {
        folgen_titel: selectedTitel.trim() || null,
        synopsis_300: kurzEditor?.getHTML() !== '<p></p>' ? kurzEditor?.getHTML() ?? null : null,
        synopsis:     langEditor?.getHTML() !== '<p></p>' ? langEditor?.getHTML() ?? null : null,
      })
      setSaveMsg('Gespeichert.')
      return true
    } catch (e: any) {
      setSaveMsg('Speicherfehler: ' + (e?.message ?? String(e)))
      return false
    } finally {
      setSaveLoading(false)
    }
  }, [folgeId, selectedTitel, kurzEditor, langEditor])

  async function handleClose() {
    await save()
    onClose()
  }

  if (!open) return null

  const TABS: { id: Tab; label: string; desc: string }[] = [
    { id: 'titel',  label: 'Titel',        desc: 'Episodentitel' },
    { id: 'kurz',   label: 'Synopsis 300', desc: 'Zuschauende' },
    { id: 'lang',   label: 'Synopsis',     desc: 'Redaktion' },
  ]

  return (
    <>
      <style>{`
        @keyframes magic-star { 0%{opacity:0;transform:scale(.5)} 40%{opacity:.7;transform:scale(1.2)} 100%{opacity:0;transform:scale(.5)} }
        @keyframes magic-glow { 0%,100%{box-shadow:0 0 18px 4px #AF52DE55,0 0 40px 8px #AF52DE22} 50%{box-shadow:0 0 28px 8px #AF52DE88,0 0 60px 16px #AF52DE44} }
        @keyframes magic-shimmer { 0%{background-position:-200% center} 100%{background-position:200% center} }
        @keyframes syn-fade-in { from{opacity:0;transform:translateY(14px) scale(.97)} to{opacity:1;transform:translateY(0) scale(1)} }
        .syn-modal .ProseMirror { outline: none; }
        .syn-modal .ProseMirror p { margin: 0 0 8px; }
        .syn-modal .ProseMirror p:last-child { margin-bottom: 0; }
        .syn-tab-btn:hover { background: rgba(255,255,255,0.08) !important; }
        .syn-titel-card:hover { border-color: #AF52DE88 !important; background: #AF52DE18 !important; }
        .syn-gen-btn:not(:disabled):hover { transform: translateY(-1px); box-shadow: 0 4px 16px #AF52DE55; }
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
          className="syn-modal"
          onMouseDown={e => e.stopPropagation()}
          style={{
            position: 'relative',
            width: 560, maxWidth: 'calc(100vw - 24px)', maxHeight: 'calc(100vh - 40px)',
            background: 'linear-gradient(160deg, #1a0a2e 0%, #120820 50%, #0d0518 100%)',
            borderRadius: 16, border: '1.5px solid #AF52DE55', overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
            animation: visible ? 'magic-glow 3s ease-in-out infinite, syn-fade-in 0.28s ease-out forwards' : 'none',
          }}
        >
          {/* Animated stars */}
          {[[12,8],[85,15],[50,5],[92,40],[8,60],[72,75],[25,85],[88,80],[45,92],[18,45]].map(([x,y], i) => (
            <div key={i} style={{
              position:'absolute', left:`${x}%`, top:`${y}%`,
              width: i%3===0?3:2, height: i%3===0?3:2, borderRadius:'50%',
              background:'#fff', opacity:0, pointerEvents:'none',
              animation:`magic-star 2.4s ${(i*0.3).toFixed(1)}s ease-in-out infinite`,
            }}/>
          ))}

          {/* Pre-check overlay */}
          {showPreCheck && preCheckData && (
            <PreCheckDialog
              data={preCheckData}
              folgeNummer={folgeNummer}
              onLoad={loadExisting}
              onNew={() => setShowPreCheck(false)}
              onAbort={onClose}
            />
          )}

          {/* Loading pre-check */}
          {checking && !showPreCheck && (
            <div style={{
              position:'absolute', inset:0, zIndex:5, borderRadius:16,
              background:'rgba(13,5,24,0.85)', display:'flex', alignItems:'center', justifyContent:'center',
              color:'rgba(255,255,255,0.5)', fontSize:13,
            }}>
              Prüfe vorhandene Daten…
            </div>
          )}

          {/* Header */}
          <div style={{ display:'flex', alignItems:'center', gap:12, padding:'20px 22px 14px', flexShrink:0 }}>
            <div style={{
              width:38, height:38, borderRadius:10, flexShrink:0,
              background:'linear-gradient(135deg,#AF52DE33,#7b2fa055)',
              border:'1.5px solid #AF52DE77',
              display:'flex', alignItems:'center', justifyContent:'center',
            }}>
              <Wand2 size={18} color="#D18AFF" />
            </div>
            <div>
              <div style={{
                fontSize:15, fontWeight:800, letterSpacing:0.3,
                background:'linear-gradient(90deg,#fff 20%,#D18AFF 60%,#fff 80%)',
                backgroundSize:'200% auto', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent',
                animation:'magic-shimmer 4s linear infinite',
              }}>
                Episoden-Synopsen — Folge {folgeNummer}
              </div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.45)', marginTop:1 }}>
                KI-gestützte Synopsen-Generierung
              </div>
            </div>
            <button onMouseDown={onClose} style={{ marginLeft:'auto', background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.45)', display:'flex', padding:4 }}>
              <X size={16}/>
            </button>
          </div>

          {/* Divider */}
          <div style={{ height:1, background:'linear-gradient(90deg,transparent,#AF52DE44,transparent)', flexShrink:0 }}/>

          {/* Tabs */}
          <div style={{ display:'flex', gap:2, padding:'10px 16px 0', flexShrink:0 }}>
            {TABS.map(t => (
              <button
                key={t.id}
                className="syn-tab-btn"
                onClick={() => setActiveTab(t.id)}
                style={{
                  flex:1, padding:'8px 4px', borderRadius:'8px 8px 0 0',
                  border:`1px solid ${activeTab===t.id ? '#AF52DE55' : 'rgba(255,255,255,0.08)'}`,
                  borderBottom: activeTab===t.id ? '1px solid #120820' : '1px solid rgba(255,255,255,0.08)',
                  background: activeTab===t.id ? 'rgba(175,82,222,0.12)' : 'transparent',
                  cursor:'pointer', transition:'background 0.15s',
                  display:'flex', flexDirection:'column', alignItems:'center', gap:1,
                }}
              >
                <span style={{ fontSize:12, fontWeight: activeTab===t.id ? 700 : 500, color: activeTab===t.id ? '#D18AFF' : 'rgba(255,255,255,0.55)' }}>{t.label}</span>
                <span style={{ fontSize:9, color:'rgba(255,255,255,0.3)' }}>{t.desc}</span>
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={{ flex:1, overflow:'auto', padding:'16px 22px' }}>

            {/* ── Tab: Titel ── */}
            {activeTab === 'titel' && (
              <div>
                <div style={{ marginBottom:14 }}>
                  <label style={{ fontSize:11, color:'rgba(255,255,255,0.5)', display:'block', marginBottom:6 }}>EPISODENTITEL</label>
                  <input
                    value={selectedTitel}
                    onChange={e => setSelectedTitel(e.target.value)}
                    placeholder="Titel eingeben oder aus Vorschlägen wählen…"
                    style={{
                      width:'100%', boxSizing:'border-box',
                      padding:'9px 12px', borderRadius:8,
                      border:'1px solid rgba(255,255,255,0.15)',
                      background:'rgba(0,0,0,0.3)', color:'#fff', fontSize:14, fontWeight:600,
                      outline:'none',
                    }}
                  />
                </div>

                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
                  <button
                    className="syn-gen-btn"
                    onClick={generateTitel}
                    disabled={titelLoading}
                    style={{
                      display:'inline-flex', alignItems:'center', gap:7,
                      padding:'7px 16px', borderRadius:8,
                      background: titelLoading ? 'rgba(175,82,222,0.15)' : 'linear-gradient(135deg,#AF52DE,#7b2fa0)',
                      color:'#fff', border:'1px solid #AF52DE',
                      cursor: titelLoading ? 'not-allowed' : 'pointer',
                      fontSize:12, fontWeight:700, opacity: titelLoading ? 0.7 : 1,
                      transition:'transform 0.12s, box-shadow 0.12s',
                    }}
                  >
                    <Sparkles size={12}/>
                    {titelLoading ? 'Generiere…' : '5 Titel generieren'}
                  </button>
                  {titelMsg && <span style={{ fontSize:11, color: titelMsg.startsWith('Fehler') ? '#FF9500' : 'rgba(255,255,255,0.5)' }}>{titelMsg}</span>}
                </div>

                {titelOptions.length > 0 && (
                  <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                    <div style={{ fontSize:10, color:'rgba(255,255,255,0.35)', marginBottom:2 }}>VORSCHLÄGE — Klicken zum Auswählen</div>
                    {titelOptions.map((t, i) => (
                      <button
                        key={i}
                        className="syn-titel-card"
                        onClick={() => setSelectedTitel(t)}
                        style={{
                          textAlign:'left', padding:'10px 14px', borderRadius:9, cursor:'pointer',
                          border:`1.5px solid ${selectedTitel === t ? '#AF52DE' : 'rgba(255,255,255,0.1)'}`,
                          background: selectedTitel === t ? '#AF52DE22' : 'rgba(255,255,255,0.04)',
                          color:'#fff', fontSize:13, fontWeight: selectedTitel===t ? 700 : 500,
                          display:'flex', alignItems:'center', gap:10, transition:'border-color 0.12s, background 0.12s',
                        }}
                      >
                        {selectedTitel === t && <Check size={13} color="#AF52DE" style={{flexShrink:0}}/>}
                        {t}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Tab: Synopsis 300 ── */}
            {activeTab === 'kurz' && (
              <div>
                <div style={{ marginBottom:10, fontSize:12, color:'rgba(255,255,255,0.45)', lineHeight:1.5 }}>
                  Kurze Episodensynopse für TV-Programm und Streaming. Zielgruppe: Zuschauende. Kein Spoiler. Max. 300 Wörter.
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
                  <button
                    className="syn-gen-btn"
                    onClick={generateKurz}
                    disabled={kurzLoading}
                    style={{
                      display:'inline-flex', alignItems:'center', gap:7,
                      padding:'7px 16px', borderRadius:8,
                      background: kurzLoading ? 'rgba(175,82,222,0.15)' : 'linear-gradient(135deg,#AF52DE,#7b2fa0)',
                      color:'#fff', border:'1px solid #AF52DE',
                      cursor: kurzLoading ? 'not-allowed' : 'pointer',
                      fontSize:12, fontWeight:700, opacity: kurzLoading ? 0.7 : 1,
                      transition:'transform 0.12s, box-shadow 0.12s',
                    }}
                  >
                    <Sparkles size={12}/>
                    {kurzLoading ? 'Generiere…' : 'Generieren'}
                  </button>
                  {kurzMsg && <span style={{ fontSize:11, color: kurzMsg.startsWith('Fehler') ? '#FF9500' : 'rgba(175,82,222,0.8)' }}>{kurzMsg}</span>}
                  {kurzEditor && kurzEditor.getText().length > 5 && (
                    <span style={{ marginLeft:'auto', fontSize:10, color:'rgba(255,255,255,0.3)' }}>
                      {wordCount(kurzEditor.getHTML())} Wörter
                    </span>
                  )}
                </div>
                <RichEditor editor={kurzEditor} minHeight={180} />
              </div>
            )}

            {/* ── Tab: Synopsis Lang ── */}
            {activeTab === 'lang' && (
              <div>
                <div style={{ marginBottom:10, fontSize:12, color:'rgba(255,255,255,0.45)', lineHeight:1.5 }}>
                  Ausführliche dramaturgische Synopsis. Zielgruppe: Autoren &amp; Produktion. Kann Spoiler enthalten. Rollennamen werden automatisch fett markiert.
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
                  <button
                    className="syn-gen-btn"
                    onClick={generateLang}
                    disabled={langLoading}
                    style={{
                      display:'inline-flex', alignItems:'center', gap:7,
                      padding:'7px 16px', borderRadius:8,
                      background: langLoading ? 'rgba(175,82,222,0.15)' : 'linear-gradient(135deg,#AF52DE,#7b2fa0)',
                      color:'#fff', border:'1px solid #AF52DE',
                      cursor: langLoading ? 'not-allowed' : 'pointer',
                      fontSize:12, fontWeight:700, opacity: langLoading ? 0.7 : 1,
                      transition:'transform 0.12s, box-shadow 0.12s',
                    }}
                  >
                    <Sparkles size={12}/>
                    {langLoading ? 'Generiere…' : 'Generieren'}
                  </button>
                  {langMsg && <span style={{ fontSize:11, color: langMsg.startsWith('Fehler') ? '#FF9500' : 'rgba(175,82,222,0.8)' }}>{langMsg}</span>}
                  {langEditor && langEditor.getText().length > 5 && (
                    <span style={{ marginLeft:'auto', fontSize:10, color:'rgba(255,255,255,0.3)' }}>
                      {wordCount(langEditor.getHTML())} Wörter
                    </span>
                  )}
                </div>
                <RichEditor editor={langEditor} minHeight={220} />
              </div>
            )}

          </div>

          {/* Footer */}
          <div style={{
            flexShrink:0, padding:'12px 22px', borderTop:'1px solid rgba(255,255,255,0.08)',
            display:'flex', alignItems:'center', gap:10,
          }}>
            <button
              onClick={save}
              disabled={saveLoading}
              style={{
                display:'inline-flex', alignItems:'center', gap:7,
                padding:'8px 20px', borderRadius:8,
                background: saveLoading ? 'rgba(0,200,83,0.15)' : '#00C853',
                color:'#fff', border:'1px solid #00C853',
                cursor: saveLoading ? 'not-allowed' : 'pointer',
                fontSize:12, fontWeight:700, opacity: saveLoading ? 0.7 : 1,
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
                marginLeft:'auto', padding:'8px 16px', borderRadius:8,
                background:'transparent', border:'1px solid rgba(255,255,255,0.12)',
                color:'rgba(255,255,255,0.55)', cursor:'pointer', fontSize:12,
              }}
            >
              Schließen & Autosave
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
