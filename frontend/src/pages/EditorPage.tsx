import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft, Hash, Clock, MessageSquare, X, Search,
  Minimize2, Maximize2, ChevronLeft, ChevronRight,
  MoreHorizontal, FileDown, Lock, Bold, Italic,
  AlignLeft, List, Mic2
} from 'lucide-react'
import { useFocus } from '../App'

// Keep types inline — editorData.ts is no longer imported in production code
type BlockType = 'heading' | 'action' | 'character' | 'parenthetical' | 'dialogue' | 'transition' | 'shot'

interface Author {
  id: string
  name: string
  color: string
}

// Static author map (no user management yet)
const AUTHORS: Record<string, Author> = {
  JD: { id: 'JD', color: '#007AFF', name: 'Jan Diepers' },
  AK: { id: 'AK', color: '#FF9500', name: 'Anna König' },
  MS: { id: 'MS', color: '#00C853', name: 'Maria Schulz' },
  TW: { id: 'TW', color: '#FF3B30', name: 'Thomas Weber' },
  SP: { id: 'SP', color: '#AF52DE', name: 'Sandra Petersen' },
}

const ENV_STRIPES: Record<string, string> = {
  d_i: '#9E9E9E', d_e: '#22C55E', d_ie: '#84CC16',
  evening_i: '#10B981', n_i: '#F97316', n_e: '#3B82F6', n_ie: '#F59E0B',
}

// Fallback static data for the full-screen editor (no szeneId URL param yet)
const STATIC_VERSIONS = [
  { id: 'v4', label: 'v4', tag: 'Aktuell', authorId: 'JD', time: 'Heute, 14:32', diffPlus: 14, diffMinus: 3, milestone: false },
  { id: 'v3', label: 'v3', tag: 'Milestone', authorId: 'AK', time: 'Gestern, 18:07', diffPlus: 8, diffMinus: 12, milestone: true },
  { id: 'v2', label: 'v2', authorId: 'MS', time: 'Mo, 11:44', diffPlus: 22, diffMinus: 0, milestone: false },
  { id: 'v1', label: 'v1', tag: 'Erstfassung', authorId: 'JD', time: 'Fr, 09:15', diffPlus: 0, diffMinus: 0, milestone: false },
]

const STATIC_COMMENTS = [
  { id: 'c1', authorId: 'AK', time: 'Gestern, 19:12', quote: '„Ich weiß. Ich hab schon gewartet."', text: 'Der Dialog funktioniert gut, aber vielleicht ist Jonas hier zu verständnisvoll?' },
  { id: 'c2', authorId: 'TW', time: 'Heute, 09:03', quote: '„Das Zimmer liegt im Dunkeln."', text: 'Können wir die Regie-Anweisung präzisieren?' },
  { id: 'c3', authorId: 'JD', time: 'Heute, 14:30', text: 'Habe das Mondlicht weiter nach vorne gezogen.' },
]

const STATIC_BLOCKS: { id: string; type: BlockType; text: string }[] = [
  { id: 'b1', type: 'heading', text: 'INT. SCHLAFZIMMER WOLFSBERG – NACHT' },
  { id: 'b2', type: 'action', text: 'Das Zimmer liegt im Dunkeln. EVA (38) liegt im Bett, starrt an die Decke.' },
  { id: 'b3', type: 'action', text: 'Eva dreht sich um. Einmal. Zweimal. Seufzt leise.' },
  { id: 'b4', type: 'action', text: 'Sie steht auf, schleicht aus dem Zimmer.' },
  { id: 'b5', type: 'heading', text: 'INT. KÜCHE WOLFSBERG – MOMENTS LATER' },
  { id: 'b6', type: 'action', text: 'Eva steht am Fenster, hält ein Glas Wasser.' },
  { id: 'b8', type: 'character', text: 'JONAS' },
  { id: 'b9', type: 'dialogue', text: 'Wieder nicht schlafen können?' },
  { id: 'b10', type: 'character', text: 'EVA' },
  { id: 'b11', type: 'dialogue', text: 'Tut mir leid. Hab ich dich geweckt?' },
  { id: 'b23', type: 'transition', text: 'SCHNITT AUF:' },
]

const SCENE_LIST = [
  { id: 1, nummer: '1', motiv: 'CAFÉ ROSA – THEKE', env: 'd_i' },
  { id: 2, nummer: '2', motiv: 'RATHAUSPLATZ', env: 'd_e' },
  { id: 3, nummer: '3', motiv: 'BÜRO WOLFSBERG', env: 'd_i' },
  { id: 4, nummer: '4', motiv: 'SCHLOSSPARK', env: 'd_e' },
  { id: 5, nummer: '5', motiv: 'KÜCHE ROSEN', env: 'evening_i' },
  { id: 6, nummer: '6', motiv: 'WOHNZIMMER WOLFSBERG', env: 'n_i' },
  { id: 7, nummer: '7', motiv: 'SCHLAFZIMMER – DIE LANGE NACHT', env: 'n_i', active: true },
  { id: 8, nummer: '8', motiv: 'GARTENTEICH – NACHT', env: 'n_e' },
]

const getBlockClass = (type: BlockType): string => {
  switch (type) {
    case 'heading':       return 'heading'
    case 'action':        return 'action'
    case 'character':     return 'character'
    case 'parenthetical': return 'parenthetical'
    case 'dialogue':      return 'dialogue'
    case 'transition':    return 'transition'
    case 'shot':          return 'shot'
    default:              return 'action'
  }
}

export default function EditorPage() {
  const [activeTab, setActiveTab] = useState<'history' | 'comments'>('history')
  const [showNav, setShowNav] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const { focus, toggle: toggleFocus } = useFocus()

  const versions = STATIC_VERSIONS
  const comments = STATIC_COMMENTS

  return (
    <div className="editor-app">
      {/* Topbar */}
      <div className="ed-topbar">
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-secondary)' }}>
          <ArrowLeft size={12} />
          Zurück
        </Link>

        <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Rote Rosen</span>
          <span>·</span>
          <span>Block 028</span>
          <span>·</span>
          <span>Folge 4512</span>
          <span>·</span>
          <span>SZ 7</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 8 }}>
          <button style={{
            padding: '3px 8px', fontSize: 11, fontWeight: 700,
            background: 'var(--bg-subtle)', color: 'var(--text-secondary)',
            border: '1px solid var(--border)', borderRadius: 4,
          }}>v4</button>
          <span style={{ fontSize: 11, color: 'var(--sw-warning-alt)', fontWeight: 600 }}>In Arbeit</span>
        </div>

        <div style={{ flex: 1 }} />

        <button className="focus-toggle" onClick={toggleFocus} title="Fokus-Modus (F10)">
          {focus ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
        </button>

        <button
          style={{
            width: 30, height: 30, borderRadius: 6, border: '1px solid transparent',
            background: 'transparent', color: 'var(--text-secondary)',
            display: 'grid', placeItems: 'center', cursor: 'pointer', position: 'relative',
          }}
          onClick={() => setShowMenu(v => !v)}
          title="Mehr"
        >
          <MoreHorizontal size={15} />
        </button>

        {showMenu && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 150 }} onClick={() => setShowMenu(false)} />
            <div style={{
              position: 'fixed', top: 52, right: 16, zIndex: 200,
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderRadius: 10, boxShadow: 'var(--shadow-xl)', minWidth: 180, padding: '4px 0',
            }}>
              <EdMenuBtn icon={<Hash size={13} />} label="Navigator" active={showNav} onClick={() => { setShowNav(v => !v); setShowMenu(false) }} />
              <EdMenuBtn icon={<Clock size={13} />} label="Historie" active={showHistory && activeTab === 'history'} onClick={() => { setShowHistory(true); setActiveTab('history'); setShowMenu(false) }} />
              <EdMenuBtn icon={<MessageSquare size={13} />} label="Kommentare" active={showHistory && activeTab === 'comments'} onClick={() => { setShowHistory(true); setActiveTab('comments'); setShowMenu(false) }} />
              <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
              <EdMenuBtn icon={<Lock size={13} />} label="Szene locken" onClick={() => setShowMenu(false)} />
              <EdMenuBtn icon={<FileDown size={13} />} label="PDF exportieren" onClick={() => setShowMenu(false)} />
            </div>
          </>
        )}

        <div style={{ width: 28, height: 28, borderRadius: 999, background: 'var(--sw-info)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 600, flexShrink: 0 }}>JD</div>
      </div>

      {/* Rail (icon sidebar) */}
      <div className="ed-rail">
        <button title="Navigator" onClick={() => setShowNav(v => !v)} style={{ color: showNav ? 'var(--text-primary)' : undefined }}>
          <Hash size={14} />
        </button>
        <button title="Historie" onClick={() => { setShowHistory(true); setActiveTab('history') }} style={{ color: showHistory && activeTab === 'history' ? 'var(--text-primary)' : undefined }}>
          <Clock size={14} />
        </button>
        <button title="Kommentare" onClick={() => { setShowHistory(true); setActiveTab('comments') }} style={{ color: showHistory && activeTab === 'comments' ? 'var(--text-primary)' : undefined }}>
          <MessageSquare size={14} />
        </button>
        <span className="sep" />
        <button title="Vorherige Szene"><ChevronLeft size={14} /></button>
        <button title="Nächste Szene"><ChevronRight size={14} /></button>
      </div>

      {/* Format Toolbar */}
      <div className="ed-toolbar">
        {[
          { icon: <Bold size={13} />, label: 'Fett' },
          { icon: <Italic size={13} />, label: 'Kursiv' },
          { icon: <AlignLeft size={13} />, label: 'Absatz' },
          { icon: <List size={13} />, label: 'Liste' },
          { icon: <Mic2 size={13} />, label: 'Dialog' },
        ].map((t, i) => (
          <button key={i} title={t.label} style={{
            width: 28, height: 28, borderRadius: 5, border: 'none',
            background: 'transparent', color: 'var(--text-secondary)',
            display: 'grid', placeItems: 'center', cursor: 'pointer',
          }}>{t.icon}</button>
        ))}
        <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />
        {['Überschrift', 'Action', 'Charakter', 'Regieanweisung', 'Dialog', 'Transition'].map(t => (
          <button key={t} style={{
            padding: '3px 8px', fontSize: 11, borderRadius: 5, border: '1px solid var(--border)',
            background: 'transparent', color: 'var(--text-secondary)',
            cursor: 'pointer', whiteSpace: 'nowrap',
          }}>{t}</button>
        ))}
      </div>

      {/* Navigator panel */}
      {showNav && (
        <div className="ed-nav" style={{ position: 'fixed', top: 88, left: 40, bottom: 0, width: 240, zIndex: 201 }}>
          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ flex: 1, fontSize: 12, fontWeight: 600 }}>Navigator</span>
            <button onClick={() => setShowNav(false)} style={{ width: 22, height: 22, borderRadius: 5, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)', display: 'grid', placeItems: 'center' }}>
              <X size={12} />
            </button>
          </div>
          <div style={{ padding: '6px 10px' }}>
            <div style={{ position: 'relative' }}>
              <Search size={11} style={{ position: 'absolute', left: 7, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
              <input style={{
                width: '100%', padding: '5px 8px 5px 24px',
                border: '1px solid var(--border)', borderRadius: 6,
                font: 'inherit', fontSize: 11, background: 'var(--input-bg)', color: 'var(--text-primary)',
                outline: 'none',
              }} placeholder="Szene suchen…" />
            </div>
          </div>
          <div style={{ overflow: 'auto', flex: 1 }}>
            {SCENE_LIST.map(s => (
              <div key={s.id} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 12px', cursor: 'pointer',
                background: s.active ? 'var(--bg-active)' : 'transparent',
                borderLeft: s.active ? '2px solid var(--text-primary)' : '2px solid transparent',
                fontSize: 12, color: s.active ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontWeight: s.active ? 500 : 400,
              }}>
                <div style={{ width: 3, height: 18, borderRadius: 2, background: ENV_STRIPES[s.env] || '#ccc', flexShrink: 0 }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, minWidth: 16, color: 'var(--text-muted)' }}>{s.nummer}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.motiv}</span>
              </div>
            ))}
          </div>
          {showNav && (
            <div style={{ position: 'fixed', inset: 0, zIndex: 199 }} onClick={() => setShowNav(false)} />
          )}
        </div>
      )}

      {/* Canvas */}
      <div className="ed-canvas">
        <div className="page">
          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, marginBottom: 20, color: 'var(--text-primary)' }}>
            SZ 7 · DIE LANGE NACHT
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 20 }}>
            INT. KAMINSKI SCHLAFZIMMER · NACHT
          </div>

          {STATIC_BLOCKS.map(block => (
            <div
              key={block.id}
              className={getBlockClass(block.type)}
              contentEditable
              suppressContentEditableWarning
              style={{ fontFamily: 'var(--font-mono)', fontSize: 13, lineHeight: 1.7, outline: 'none', padding: '1px 0', color: 'var(--text-primary)' }}
            >
              {block.text}
            </div>
          ))}
        </div>
      </div>

      {/* History / Comments panel */}
      {showHistory && (
        <div className="ed-history" style={{ position: 'fixed', top: 88, right: 0, bottom: 0, width: 300, zIndex: 201 }}>
          <div style={{ position: 'fixed', inset: 0, zIndex: 199 }} onClick={() => setShowHistory(false)} />
          <div style={{ position: 'relative', zIndex: 202, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-surface)', borderLeft: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <button onClick={() => setActiveTab('history')} style={{
                flex: 1, padding: '10px 0', fontSize: 12, fontWeight: 500,
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: activeTab === 'history' ? 'var(--text-primary)' : 'var(--text-secondary)',
                borderBottom: `2px solid ${activeTab === 'history' ? 'var(--text-primary)' : 'transparent'}`,
                fontFamily: 'var(--font-sans)',
              }}>Historie</button>
              <button onClick={() => setActiveTab('comments')} style={{
                flex: 1, padding: '10px 0', fontSize: 12, fontWeight: 500,
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: activeTab === 'comments' ? 'var(--text-primary)' : 'var(--text-secondary)',
                borderBottom: `2px solid ${activeTab === 'comments' ? 'var(--text-primary)' : 'transparent'}`,
                fontFamily: 'var(--font-sans)',
              }}>Kommentare</button>
              <button onClick={() => setShowHistory(false)} style={{ margin: '0 8px', width: 28, height: 28, alignSelf: 'center', borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)', display: 'grid', placeItems: 'center' }}>
                <X size={13} />
              </button>
            </div>

            <div style={{ overflow: 'auto', flex: 1 }}>
              {activeTab === 'history' ? (
                <div style={{ padding: '8px 0' }}>
                  {versions.map(v => {
                    const author = AUTHORS[v.authorId]
                    return (
                      <div key={v.id} style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{v.label}</span>
                          {v.tag && (
                            <span style={{
                              fontSize: 10, padding: '1px 6px', borderRadius: 999,
                              background: v.milestone ? 'color-mix(in srgb,var(--sw-green) 15%,transparent)' : 'var(--bg-subtle)',
                              color: v.milestone ? 'var(--sw-green)' : 'var(--text-secondary)',
                              fontWeight: 600,
                            }}>{v.tag}</span>
                          )}
                          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
                            {v.diffPlus > 0 && <span style={{ fontSize: 10, color: 'var(--sw-green)', fontWeight: 700 }}>+{v.diffPlus}</span>}
                            {v.diffMinus > 0 && <span style={{ fontSize: 10, color: 'var(--sw-danger)', fontWeight: 700 }}>-{v.diffMinus}</span>}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{
                            width: 16, height: 16, borderRadius: '50%',
                            background: author?.color ?? '#ccc',
                            color: '#fff', fontSize: 8, fontWeight: 700,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                          }}>{v.authorId}</div>
                          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{v.time}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div style={{ padding: '8px 0' }}>
                  {comments.map(c => {
                    const author = AUTHORS[c.authorId]
                    return (
                      <div key={c.id} style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-subtle)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                          <div style={{
                            width: 20, height: 20, borderRadius: '50%',
                            background: author?.color ?? '#ccc',
                            color: '#fff', fontSize: 8, fontWeight: 700,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                          }}>{c.authorId}</div>
                          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>{author?.name ?? c.authorId}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 'auto' }}>{c.time}</span>
                        </div>
                        {c.quote && (
                          <div style={{
                            fontSize: 11, fontStyle: 'italic', color: 'var(--text-secondary)',
                            borderLeft: '2px solid var(--border)', paddingLeft: 8, marginBottom: 6, lineHeight: 1.5,
                          }}>{c.quote}</div>
                        )}
                        <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>{c.text}</p>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Status bar */}
      <div className="ed-status">
        <span>SZ 7 · Folge 4512</span>
        <span>|</span>
        <span>{STATIC_BLOCKS.length} Blöcke</span>
        <span>|</span>
        <span style={{ color: 'var(--sw-green)' }}>● Gespeichert</span>
      </div>
    </div>
  )
}

function EdMenuBtn({
  icon, label, active, onClick,
}: {
  icon: React.ReactNode
  label: string
  active?: boolean
  onClick: () => void
}) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 8,
      width: '100%', padding: '7px 12px',
      fontSize: 13, color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
      fontWeight: active ? 500 : 400,
      background: 'transparent', border: 'none',
      cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-sans)',
    }}>
      <span style={{ color: active ? 'var(--text-primary)' : 'var(--text-muted)' }}>{icon}</span>
      {label}
    </button>
  )
}
