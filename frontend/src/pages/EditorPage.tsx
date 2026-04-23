import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft, GripVertical, Search, Plus, X,
  Hash, Clock, MessageSquare, MoreHorizontal,
  Minimize2, Maximize2
} from 'lucide-react'
import { SCRIPTS, VERSIONS, COMMENTS, AUTHORS } from '../data/editorData'
import { BlockType } from '../data/editorData'
import { useFocus } from '../App'

type TweakTheme = 'light' | 'dark'
type TweakConn = 'online' | 'offline'

export default function EditorPage() {
  const [activeTab, setActiveTab] = useState<'history' | 'comments'>('history')
  const [showNav, setShowNav] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [theme, setTheme] = useState<TweakTheme>('light')
  const [conn] = useState<TweakConn>('online')
  const [showMenu, setShowMenu] = useState(false)
  const [unsaved] = useState(false)
  const { focus, toggle: toggleFocus } = useFocus()

  const script = SCRIPTS[7]
  const versions = VERSIONS[7]
  const comments = COMMENTS[7]
  const activeScene = { id: 7, title: 'Die lange Nacht', meta: 'NACHT-INT.', stageNr: 'ST 3', seiten: '0 6/8' }

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

  const ENV_STRIPES: Record<string, string> = {
    d_i: '#9E9E9E', d_e: '#22C55E', d_ie: '#84CC16',
    evening_i: '#10B981', n_i: '#F97316', n_e: '#3B82F6', n_ie: '#F59E0B',
  }

  const getBlockStyle = (type: BlockType): React.CSSProperties => {
    const base: React.CSSProperties = {
      fontFamily: 'var(--font-script)',
      fontSize: 13,
      lineHeight: 1.7,
      outline: 'none',
      margin: 0,
      padding: '1px 0',
      color: 'var(--c-text)',
    }
    switch (type) {
      case 'heading':       return { ...base, fontWeight: 700, textTransform: 'uppercase', marginTop: '2em', marginBottom: '0.3em' }
      case 'action':        return { ...base, marginTop: '0.4em', marginBottom: '0.4em' }
      case 'character':     return { ...base, textAlign: 'center', textTransform: 'uppercase', fontWeight: 600, marginTop: '1.2em' }
      case 'parenthetical': return { ...base, textAlign: 'center', fontStyle: 'italic', color: 'var(--c-text-3)' }
      case 'dialogue':      return { ...base, marginLeft: '15%', marginRight: '15%', marginTop: '0.2em', lineHeight: 1.6 }
      case 'transition':    return { ...base, textAlign: 'right', textTransform: 'uppercase', fontSize: 11, color: 'var(--c-text-3)', marginTop: '1em' }
      case 'shot':          return { ...base, textDecoration: 'underline', color: 'var(--c-text-2)' }
      default:              return base
    }
  }

  const closeAllPanels = () => {
    setShowNav(false)
    setShowHistory(false)
    setShowMenu(false)
  }

  return (
    <div
      data-theme={theme}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        background: 'var(--c-paper)',
        color: 'var(--c-text)',
        overflow: 'hidden',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {/* Topbar */}
      <div style={{
        height: 'var(--topbar-height)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '0 16px',
        borderBottom: '1px solid var(--c-line)',
        background: 'var(--c-paper)',
        flexShrink: 0,
        zIndex: 50,
      }}>
        <Link to="/" style={{
          fontSize: 12, color: 'var(--c-text-3)',
          textDecoration: 'none', display: 'flex',
          alignItems: 'center', gap: 4,
        }}>
          <ArrowLeft size={12} />
          Zurück
        </Link>

        <span style={{ fontSize: 13, color: 'var(--c-ghost)', flexShrink: 0 }}>·</span>

        <span style={{ fontSize: 12, color: 'var(--c-text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          Rote Rosen · Block 028 · Folge 4512 · Szene 7
        </span>

        <div style={{ flex: 1 }} />

        {/* Save indicator — only visible when unsaved */}
        {unsaved && (
          <button className="btn-primary" style={{ fontSize: 12, padding: '4px 12px' }}>
            Speichern
          </button>
        )}

        {/* Focus toggle */}
        <button
          className="focus-toggle"
          onClick={toggleFocus}
          title="Fokus-Modus (F10)"
          aria-label={focus ? 'Fokus-Modus beenden' : 'Fokus-Modus aktivieren'}
        >
          {focus ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
        </button>

        {/* More menu */}
        <button
          className="btn-icon"
          onClick={() => setShowMenu(v => !v)}
          title="Mehr"
          style={{ position: 'relative' }}
        >
          <MoreHorizontal size={16} />
        </button>

        {/* ⋯ dropdown */}
        {showMenu && (
          <>
            <div
              style={{ position: 'fixed', inset: 0, zIndex: 150 }}
              onClick={() => setShowMenu(false)}
            />
            <div style={{
              position: 'absolute',
              top: 40,
              right: 16,
              zIndex: 200,
              background: 'var(--c-paper)',
              border: '1px solid var(--c-line)',
              borderRadius: 'var(--r-lg)',
              boxShadow: 'var(--sh-paper)',
              minWidth: 180,
              padding: '4px 0',
            }}>
              <MenuButton
                icon={<Hash size={13} />}
                label="Navigator"
                active={showNav}
                onClick={() => { setShowNav(v => !v); setShowMenu(false) }}
              />
              <MenuButton
                icon={<Clock size={13} />}
                label="Historie"
                active={showHistory && activeTab === 'history'}
                onClick={() => { setShowHistory(true); setActiveTab('history'); setShowMenu(false) }}
              />
              <MenuButton
                icon={<MessageSquare size={13} />}
                label="Kommentare"
                active={showHistory && activeTab === 'comments'}
                onClick={() => { setShowHistory(true); setActiveTab('comments'); setShowMenu(false) }}
              />
              <div style={{ height: 1, background: 'var(--c-line)', margin: '4px 0' }} />
              <MenuButton
                icon={null}
                label={theme === 'light' ? 'Dunkel-Modus' : 'Hell-Modus'}
                onClick={() => { setTheme(t => t === 'light' ? 'dark' : 'light'); setShowMenu(false) }}
              />
            </div>
          </>
        )}
      </div>

      {/* Body */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>

        {/* Scene Navigator — slide-in from left */}
        {showNav && (
          <>
            <div
              className="panel-backdrop"
              style={{ zIndex: 199 }}
              onClick={() => setShowNav(false)}
            />
            <div style={{
              position: 'fixed',
              top: 'var(--topbar-height)',
              left: 0,
              bottom: 0,
              width: 280,
              background: 'var(--c-paper)',
              borderRight: '1px solid var(--c-line)',
              zIndex: 201,
              display: 'flex',
              flexDirection: 'column',
            }}>
              <div style={{
                padding: '10px 12px 8px',
                borderBottom: '1px solid var(--c-line)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}>
                <span style={{ flex: 1, fontSize: 12, fontWeight: 500, color: 'var(--c-text)' }}>
                  Navigator
                </span>
                <button className="btn-icon" style={{ width: 26, height: 26 }} onClick={() => setShowNav(false)}>
                  <X size={13} />
                </button>
              </div>
              <div style={{ padding: '6px 10px' }}>
                <div style={{ position: 'relative' }}>
                  <Search size={11} style={{
                    position: 'absolute', left: 7, top: '50%',
                    transform: 'translateY(-50%)', color: 'var(--c-muted)',
                    pointerEvents: 'none',
                  }} />
                  <input className="input input-sm" style={{ paddingLeft: 24, fontSize: 11 }} placeholder="Szene suchen…" />
                </div>
              </div>
              <div style={{ overflow: 'auto', flex: 1 }}>
                {SCENE_LIST.map(s => (
                  <div
                    key={s.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '7px 12px',
                      cursor: 'pointer',
                      background: s.active ? 'var(--c-ui)' : 'transparent',
                      borderLeft: s.active ? '2px solid var(--c-ink)' : '2px solid transparent',
                      fontSize: 12,
                      color: s.active ? 'var(--c-text)' : 'var(--c-text-3)',
                      fontWeight: s.active ? 500 : 400,
                      transition: 'background var(--t-fast)',
                    }}
                    onMouseEnter={e => { if (!s.active) e.currentTarget.style.background = 'var(--c-ui)' }}
                    onMouseLeave={e => { if (!s.active) e.currentTarget.style.background = 'transparent' }}
                  >
                    <GripVertical size={11} style={{ color: 'var(--c-ghost)', flexShrink: 0 }} />
                    <div style={{
                      width: 3, height: 18, borderRadius: 2,
                      background: ENV_STRIPES[s.env] || '#ccc',
                      flexShrink: 0,
                    }} />
                    <span style={{ fontFamily: 'var(--font-script)', fontSize: 10, minWidth: 16, color: 'var(--c-muted)' }}>{s.nummer}</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.motiv}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Canvas */}
        <div className="ed-doc" style={{
          flex: 1,
          overflow: 'auto',
          background: 'var(--c-ui)',
          display: 'flex',
          justifyContent: 'center',
          padding: '32px 24px',
        }}>
          <div className="script-canvas page">
            {/* Scene Header */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                <span style={{
                  fontFamily: 'var(--font-script)',
                  fontSize: 13,
                  fontWeight: 700,
                  color: 'var(--c-text)',
                }}>
                  SZ {activeScene.id}
                </span>
                <span
                  contentEditable
                  suppressContentEditableWarning
                  style={{
                    fontFamily: 'var(--font-script)',
                    fontSize: 13,
                    fontWeight: 700,
                    color: 'var(--c-text)',
                    flex: 1,
                    outline: 'none',
                  }}
                >
                  {activeScene.title}
                </span>
              </div>
              <div style={{
                fontFamily: 'var(--font-script)',
                fontSize: 12,
                color: 'var(--c-text-3)',
                lineHeight: 1.5,
              }}>
                INT · KAMINSKI SCHLAFZIMMER · NACHT
              </div>
            </div>

            {/* Script Blocks */}
            <div>
              {script?.blocks.map((block) => (
                <div
                  key={block.id}
                  style={getBlockStyle(block.type)}
                  contentEditable
                  suppressContentEditableWarning
                >
                  {block.text}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* History / Comments Panel — slide-in from right */}
        {showHistory && (
          <>
            <div
              className="panel-backdrop"
              style={{ zIndex: 199 }}
              onClick={() => setShowHistory(false)}
            />
            <div style={{
              position: 'fixed',
              top: 'var(--topbar-height)',
              right: 0,
              bottom: 0,
              width: 320,
              background: 'var(--c-paper)',
              borderLeft: '1px solid var(--c-line)',
              zIndex: 201,
              display: 'flex',
              flexDirection: 'column',
            }}>
              {/* Tabs */}
              <div style={{
                display: 'flex',
                borderBottom: '1px solid var(--c-line)',
                flexShrink: 0,
              }}>
                <button
                  onClick={() => setActiveTab('history')}
                  style={{
                    flex: 1, padding: '10px 0',
                    fontSize: 12, fontWeight: 500,
                    background: 'transparent', border: 'none',
                    cursor: 'pointer',
                    color: activeTab === 'history' ? 'var(--c-text)' : 'var(--c-text-3)',
                    borderBottom: `2px solid ${activeTab === 'history' ? 'var(--c-ink)' : 'transparent'}`,
                    fontFamily: 'var(--font-sans)',
                    transition: 'color var(--t-fast)',
                  }}
                >
                  Historie
                </button>
                <button
                  onClick={() => setActiveTab('comments')}
                  style={{
                    flex: 1, padding: '10px 0',
                    fontSize: 12, fontWeight: 500,
                    background: 'transparent', border: 'none',
                    cursor: 'pointer',
                    color: activeTab === 'comments' ? 'var(--c-text)' : 'var(--c-text-3)',
                    borderBottom: `2px solid ${activeTab === 'comments' ? 'var(--c-ink)' : 'transparent'}`,
                    fontFamily: 'var(--font-sans)',
                    transition: 'color var(--t-fast)',
                  }}
                >
                  Kommentare
                </button>
                <button
                  className="btn-icon"
                  style={{ margin: '0 8px' }}
                  onClick={() => setShowHistory(false)}
                >
                  <X size={13} />
                </button>
              </div>

              <div style={{ overflow: 'auto', flex: 1 }}>
                {activeTab === 'history' ? (
                  <div style={{ padding: '8px 0' }}>
                    {versions?.map(v => {
                      const author = AUTHORS[v.authorId]
                      return (
                        <div
                          key={v.id}
                          style={{
                            padding: '10px 14px',
                            borderBottom: '1px solid var(--c-line)',
                            cursor: 'pointer',
                            transition: 'background var(--t-fast)',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--c-ui)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <span style={{
                              fontSize: 12, fontWeight: 600,
                              fontFamily: 'var(--font-script)',
                              color: 'var(--c-text)',
                            }}>
                              {v.label}
                            </span>
                            {v.tag && (
                              <span style={{
                                fontSize: 10, padding: '1px 6px',
                                borderRadius: 'var(--r-full)',
                                background: v.milestone ? '#E5F0EA' : 'var(--c-ui)',
                                color: v.milestone ? 'var(--c-success)' : 'var(--c-text-3)',
                                fontWeight: 500,
                              }}>
                                {v.tag}
                              </span>
                            )}
                            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
                              {v.diffPlus !== undefined && v.diffPlus > 0 && (
                                <span style={{ fontSize: 10, color: 'var(--c-success)', fontWeight: 600 }}>+{v.diffPlus}</span>
                              )}
                              {v.diffMinus !== undefined && v.diffMinus > 0 && (
                                <span style={{ fontSize: 10, color: 'var(--c-danger)', fontWeight: 600 }}>-{v.diffMinus}</span>
                              )}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{
                              width: 16, height: 16, borderRadius: '50%',
                              background: author?.color ?? '#ccc',
                              color: '#fff', fontSize: 8, fontWeight: 700,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              flexShrink: 0,
                            }}>
                              {v.authorId}
                            </div>
                            <span style={{ fontSize: 11, color: 'var(--c-text-3)' }}>{v.time}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div style={{ padding: '8px 0' }}>
                    {comments?.map(c => {
                      const author = AUTHORS[c.authorId]
                      return (
                        <div
                          key={c.id}
                          style={{
                            padding: '12px 14px',
                            borderBottom: '1px solid var(--c-line)',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                            <div style={{
                              width: 20, height: 20, borderRadius: '50%',
                              background: author?.color ?? '#ccc',
                              color: '#fff', fontSize: 8, fontWeight: 700,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              flexShrink: 0,
                            }}>
                              {c.authorId}
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--c-text)' }}>
                              {author?.name ?? c.authorId}
                            </span>
                            <span style={{ fontSize: 11, color: 'var(--c-text-3)', marginLeft: 'auto' }}>
                              {c.time}
                            </span>
                          </div>

                          {c.quote && (
                            <div style={{
                              fontSize: 11, fontStyle: 'italic',
                              color: 'var(--c-text-3)',
                              borderLeft: '2px solid var(--c-line)',
                              paddingLeft: 8, marginBottom: 6, lineHeight: 1.5,
                            }}>
                              {c.quote}
                            </div>
                          )}

                          <p style={{ fontSize: 12, color: 'var(--c-text-2)', lineHeight: 1.6, margin: 0 }}>
                            {c.text}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Offline Banner — very subtle, bottom of screen */}
      {conn === 'offline' && (
        <div style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          borderTop: '1px solid var(--c-line)',
          padding: '4px 16px',
          background: 'var(--c-paper)',
          fontSize: 11,
          color: 'var(--c-text-3)',
          zIndex: 100,
          textAlign: 'center',
        }}>
          Offline — Änderungen gespeichert
        </div>
      )}
    </div>
  )
}

function MenuButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  active?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        padding: '7px 12px',
        fontSize: 13,
        color: active ? 'var(--c-text)' : 'var(--c-text-2)',
        fontWeight: active ? 500 : 400,
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        textAlign: 'left',
        fontFamily: 'var(--font-sans)',
        transition: 'background var(--t-fast)',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--c-ui)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      {icon && <span style={{ color: active ? 'var(--c-text)' : 'var(--c-muted)' }}>{icon}</span>}
      {label}
    </button>
  )
}
