import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft, Calendar, FileText, Image, User, Tag, Sparkles,
  MessageSquare, Eye, FileDown, Lock, Wifi, WifiOff, Sun, Moon,
  Settings, ChevronRight, Plus, Search, GripVertical, CheckCircle,
  Bold, Italic, Underline, Hash, AlignLeft, Mic, Clapperboard, Camera,
  ArrowRight, Minus, Clock
} from 'lucide-react'
import { SCRIPTS, VERSIONS, COMMENTS, AUTHORS } from '../data/editorData'
import { BlockType } from '../data/editorData'

type TweakTheme = 'light' | 'dark'
type TweakConn = 'online' | 'offline'
type TweakGutter = 'hover' | 'always' | 'off'

export default function EditorPage() {
  const [activeTab, setActiveTab] = useState<'history' | 'comments'>('history')
  const [showNav, setShowNav] = useState(true)
  const [showHistory, setShowHistory] = useState(true)
  const [theme, setTheme] = useState<TweakTheme>('light')
  const [conn, setConn] = useState<TweakConn>('online')
  const [gutterMode, setGutterMode] = useState<TweakGutter>('hover')
  const [showTweaks, setShowTweaks] = useState(false)
  const [hoveredBlock, setHoveredBlock] = useState<string | null>(null)

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

  const BLOCK_LABELS: Record<BlockType, string> = {
    heading: 'Szenenkopf',
    action: 'Aktion',
    character: 'Figur',
    parenthetical: 'Parenthese',
    dialogue: 'Dialog',
    transition: 'Transition',
    shot: 'Shot',
  }

  const getBlockStyle = (type: BlockType): React.CSSProperties => {
    const base: React.CSSProperties = {
      fontFamily: 'var(--font-mono)',
      fontSize: 13,
      lineHeight: 1.7,
      outline: 'none',
      margin: 0,
      padding: '2px 0',
      color: 'var(--c-text)',
    }
    switch (type) {
      case 'heading':       return { ...base, fontWeight: 700, textTransform: 'uppercase', marginTop: 24, marginBottom: 8 }
      case 'action':        return { ...base, marginTop: 4, marginBottom: 4 }
      case 'character':     return { ...base, textAlign: 'center', textTransform: 'uppercase', fontWeight: 600, marginTop: 16 }
      case 'parenthetical': return { ...base, textAlign: 'center', fontStyle: 'italic', color: '#757575' }
      case 'dialogue':      return { ...base, marginLeft: 80, marginRight: 80, marginTop: 4 }
      case 'transition':    return { ...base, textAlign: 'right', textTransform: 'uppercase', fontSize: 12, color: '#757575', marginTop: 24 }
      case 'shot':          return { ...base, textDecoration: 'underline' }
      default:              return base
    }
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
        height: 56,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '0 16px',
        borderBottom: '1px solid var(--c-border)',
        background: 'var(--c-paper)',
        flexShrink: 0,
        zIndex: 50,
      }}>
        {/* Brand + Back */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 24, height: 24, background: 'var(--c-ink)', borderRadius: 4,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--c-paper)', fontSize: 13, fontWeight: 700,
          }}>S</div>
          <span style={{ fontSize: 14, fontWeight: 600 }}>script</span>
          <div style={{ width: 1, height: 18, background: 'var(--c-border)' }} />
          <Link to="/" style={{
            display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 12, color: 'var(--c-text-3)',
            textDecoration: 'none',
          }}>
            <ArrowLeft size={13} />
            Zurück
          </Link>
        </div>

        <div style={{ width: 1, height: 18, background: 'var(--c-border)' }} />

        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--c-text-3)' }}>
          <span>Rote Rosen</span>
          <ChevronRight size={11} />
          <span>Block 28 · Folge 4512</span>
          <ChevronRight size={11} />
          <span style={{ color: 'var(--c-text)', fontWeight: 500 }}>Szene 7 · Die lange Nacht</span>
        </div>

        <div style={{ flex: 1 }} />

        {/* Presence */}
        <div style={{ display: 'flex', alignItems: 'center', gap: -4 }}>
          {[
            { initials: 'AK', color: '#FF9500' },
            { initials: 'MS', color: '#00C853' },
          ].map((u, i) => (
            <div key={u.initials} style={{
              width: 26, height: 26, borderRadius: '50%',
              background: u.color, color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 600,
              border: '2px solid var(--c-paper)',
              marginLeft: i > 0 ? -6 : 0,
            }}>{u.initials}</div>
          ))}
          <div style={{ marginLeft: 6, fontSize: 11, color: 'var(--c-text-4)' }}>2 online</div>
        </div>

        {/* Save State */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--c-success)' }}>
          <CheckCircle size={13} />
          Alle Änderungen gespeichert
        </div>

        {/* Action Buttons */}
        <button className="btn btn-sm" style={{ gap: 4, position: 'relative' }}>
          <MessageSquare size={13} />
          Kommentare
          <span style={{
            position: 'absolute', top: -5, right: -5,
            width: 16, height: 16, borderRadius: '50%',
            background: 'var(--c-info)', color: '#fff',
            fontSize: 9, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>3</span>
        </button>
        <button className="btn btn-sm">
          <Eye size={13} />
          Vorschau
        </button>
        <button className="btn btn-sm">
          <FileDown size={13} />
          PDF
        </button>
        <button className="btn btn-sm" style={{ background: '#FFF4E5', borderColor: '#FFD9A0', color: 'var(--c-warn)' }}>
          <Lock size={13} />
          Lock aktiv
        </button>
      </div>

      {/* Format Toolbar */}
      <div style={{
        height: 40,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '0 16px',
        borderBottom: '1px solid var(--c-border)',
        background: 'var(--c-surface-2)',
        flexShrink: 0,
      }}>
        {/* Format Selector */}
        <button style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '4px 10px', borderRadius: 'var(--r-md)',
          border: '1px solid var(--c-border)', background: 'var(--c-paper)',
          fontSize: 12, fontWeight: 500, cursor: 'pointer', color: 'var(--c-text)',
          fontFamily: 'var(--font-sans)', minWidth: 120,
        }}>
          <AlignLeft size={12} />
          Aktion
          <ChevronRight size={10} style={{ marginLeft: 'auto', rotate: '90deg' }} />
        </button>

        <div style={{ width: 1, height: 20, background: 'var(--c-border)', margin: '0 4px' }} />

        {/* Quick Buttons */}
        {[
          { label: 'F1', title: 'Szenenkopf' },
          { label: 'F2', title: 'Aktion', active: true },
          { label: 'F3', title: 'Figur' },
          { label: 'F4', title: 'Parenthese' },
          { label: 'F5', title: 'Dialog' },
          { label: 'F6', title: 'Transition' },
          { label: 'F7', title: 'Shot' },
        ].map(btn => (
          <button
            key={btn.label}
            className={`btn-icon btn-sm${btn.active ? ' active' : ''}`}
            title={btn.title}
            style={{ width: 28, height: 28, fontSize: 11, fontWeight: 600 }}
          >
            {btn.label}
          </button>
        ))}

        <div style={{ width: 1, height: 20, background: 'var(--c-border)', margin: '0 4px' }} />

        {/* Text Format Buttons */}
        <button className="btn-icon btn-sm" title="Fett"><Bold size={13} /></button>
        <button className="btn-icon btn-sm" title="Kursiv"><Italic size={13} /></button>
        <button className="btn-icon btn-sm" title="Unterstreichen"><Underline size={13} /></button>

        <div style={{ width: 1, height: 20, background: 'var(--c-border)', margin: '0 4px' }} />

        <button className="btn btn-sm" style={{ gap: 4 }}>
          <Tag size={12} />
          Taggen
        </button>
        <button className="btn btn-sm" style={{ gap: 4 }}>
          <MessageSquare size={12} />
          Kommentar
        </button>

        <div style={{ flex: 1 }} />

        {/* Panel Toggle Buttons */}
        <button
          className={`btn-icon btn-sm${showNav ? ' active' : ''}`}
          onClick={() => setShowNav(v => !v)}
          title="Navigator"
        >
          <Hash size={13} />
        </button>
        <button
          className={`btn-icon btn-sm${showHistory ? ' active' : ''}`}
          onClick={() => setShowHistory(v => !v)}
          title="Historie"
        >
          <Clock size={13} />
        </button>
      </div>

      {/* Body */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Mini Rail */}
        <div style={{
          width: 40,
          borderRight: '1px solid var(--c-border)',
          background: 'var(--c-surface)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: 8,
          gap: 4,
          flexShrink: 0,
        }}>
          <RailButton icon={<Calendar size={15} />} title="Drehplan" />
          <RailButton icon={<FileText size={15} />} title="Editor" active />
          <RailButton icon={<Image size={15} />} title="Bilder" />
          <RailButton icon={<User size={15} />} title="Szenen-Profile" />
          <div style={{ flex: 1 }} />
          <div style={{ width: 24, height: 1, background: 'var(--c-border)', margin: '4px 0' }} />
          <RailButton icon={<Tag size={15} />} title="Tag" />
          <RailButton icon={<Sparkles size={15} />} title="KI-Assistent" />
          <div style={{ paddingBottom: 8 }} />
        </div>

        {/* Scene Navigator */}
        {showNav && (
          <div style={{
            width: 220,
            borderRight: '1px solid var(--c-border)',
            background: 'var(--c-paper)',
            display: 'flex',
            flexDirection: 'column',
            flexShrink: 0,
          }}>
            <div style={{
              padding: '10px 12px 8px',
              borderBottom: '1px solid var(--c-border-l)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}>
              <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--c-text)' }}>
                Szenen <span style={{ color: 'var(--c-text-4)', fontWeight: 400 }}>12</span>
              </span>
              <button className="btn-icon" style={{ width: 22, height: 22, border: 'none', background: 'transparent', color: 'var(--c-text-3)' }}>
                <Plus size={13} />
              </button>
            </div>
            <div style={{ padding: '6px 10px' }}>
              <div style={{ position: 'relative' }}>
                <Search size={11} style={{ position: 'absolute', left: 7, top: '50%', transform: 'translateY(-50%)', color: 'var(--c-text-4)', pointerEvents: 'none' }} />
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
                    padding: '6px 12px',
                    cursor: 'pointer',
                    background: s.active ? 'var(--c-surface)' : 'transparent',
                    borderLeft: s.active ? '2px solid var(--c-ink)' : '2px solid transparent',
                    fontSize: 11,
                    color: s.active ? 'var(--c-text)' : 'var(--c-text-3)',
                    fontWeight: s.active ? 500 : 400,
                    transition: 'background var(--t-fast)',
                  }}
                  onMouseEnter={e => !s.active && (e.currentTarget.style.background = 'var(--c-surface-2)')}
                  onMouseLeave={e => !s.active && (e.currentTarget.style.background = 'transparent')}
                >
                  <GripVertical size={11} style={{ color: 'var(--c-text-4)', flexShrink: 0 }} />
                  <div style={{
                    width: 3, height: 20, borderRadius: 2,
                    background: ENV_STRIPES[s.env] || '#ccc',
                    flexShrink: 0,
                  }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, minWidth: 16 }}>{s.nummer}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.motiv}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Canvas */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          background: 'var(--c-surface)',
          display: 'flex',
          justifyContent: 'center',
          padding: '32px 24px',
        }}>
          <div style={{
            width: '100%',
            maxWidth: 750,
            background: 'var(--c-paper)',
            borderRadius: 'var(--r-lg)',
            boxShadow: 'var(--sh-3)',
            padding: '32px 48px',
            minHeight: '100%',
          }}>
            {/* Scene Badge + Title */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span style={{
                padding: '3px 10px',
                borderRadius: 'var(--r-full)',
                background: 'var(--c-ink)',
                color: 'var(--c-paper)',
                fontSize: 11,
                fontWeight: 700,
                fontFamily: 'var(--font-mono)',
              }}>
                SZ 7
              </span>
            </div>

            <h1
              style={{
                fontSize: 20,
                fontWeight: 700,
                letterSpacing: -0.5,
                color: 'var(--c-text)',
                marginBottom: 10,
                outline: 'none',
              }}
              contentEditable
              suppressContentEditableWarning
            >
              {activeScene.title}
            </h1>

            {/* Meta Chips */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
              {[activeScene.meta, activeScene.stageNr, `0 6/8 S.`].map(chip => (
                <span key={chip} style={{
                  padding: '2px 8px',
                  borderRadius: 'var(--r-full)',
                  background: 'var(--c-surface)',
                  border: '1px solid var(--c-border)',
                  fontSize: 11,
                  color: 'var(--c-text-3)',
                  fontWeight: 500,
                }}>
                  {chip}
                </span>
              ))}
            </div>

            {/* Script Blocks */}
            <div style={{ position: 'relative' }}>
              {script?.blocks.map((block) => {
                const showGutter = gutterMode === 'always' ||
                  (gutterMode === 'hover' && hoveredBlock === block.id)

                return (
                  <div
                    key={block.id}
                    style={{ position: 'relative' }}
                    onMouseEnter={() => setHoveredBlock(block.id)}
                    onMouseLeave={() => setHoveredBlock(null)}
                  >
                    {/* Gutter Label */}
                    {showGutter && (
                      <div style={{
                        position: 'absolute',
                        left: -80,
                        top: block.type === 'heading' ? 26 : 4,
                        fontSize: 9,
                        color: 'var(--c-text-4)',
                        fontFamily: 'var(--font-mono)',
                        whiteSpace: 'nowrap',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}>
                        {BLOCK_LABELS[block.type]}
                      </div>
                    )}
                    <div
                      style={getBlockStyle(block.type)}
                      contentEditable
                      suppressContentEditableWarning
                    >
                      {block.text}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* History / Comments Panel */}
        {showHistory && (
          <div style={{
            width: 280,
            borderLeft: '1px solid var(--c-border)',
            background: 'var(--c-paper)',
            display: 'flex',
            flexDirection: 'column',
            flexShrink: 0,
          }}>
            {/* Tabs */}
            <div style={{
              display: 'flex',
              borderBottom: '1px solid var(--c-border)',
              flexShrink: 0,
            }}>
              <button
                onClick={() => setActiveTab('history')}
                style={{
                  flex: 1, padding: '10px 0',
                  fontSize: 12, fontWeight: 500,
                  background: 'transparent', border: 'none',
                  cursor: 'pointer', color: activeTab === 'history' ? 'var(--c-text)' : 'var(--c-text-4)',
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
                  cursor: 'pointer', color: activeTab === 'comments' ? 'var(--c-text)' : 'var(--c-text-4)',
                  borderBottom: `2px solid ${activeTab === 'comments' ? 'var(--c-ink)' : 'transparent'}`,
                  fontFamily: 'var(--font-sans)',
                  transition: 'color var(--t-fast)',
                  position: 'relative',
                }}
              >
                Kommentare
                <span style={{
                  marginLeft: 5, fontSize: 10,
                  padding: '1px 5px',
                  borderRadius: 'var(--r-full)',
                  background: 'var(--c-info)', color: '#fff',
                  fontWeight: 600,
                }}>3</span>
              </button>
            </div>

            {/* Panel Content */}
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
                          borderBottom: '1px solid var(--c-border-l)',
                          cursor: 'pointer',
                          transition: 'background var(--t-fast)',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--c-surface)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <span style={{
                            fontSize: 12, fontWeight: 700,
                            fontFamily: 'var(--font-mono)',
                            color: 'var(--c-text)',
                          }}>
                            {v.label}
                          </span>
                          {v.tag && (
                            <span style={{
                              fontSize: 10, padding: '1px 6px',
                              borderRadius: 'var(--r-full)',
                              background: v.milestone ? '#E8FAF0' : 'var(--c-surface)',
                              color: v.milestone ? 'var(--c-success)' : 'var(--c-text-4)',
                              border: `1px solid ${v.milestone ? '#A8E6C0' : 'var(--c-border)'}`,
                              fontWeight: 500,
                            }}>
                              {v.tag}
                            </span>
                          )}
                          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
                            {v.diffPlus !== undefined && v.diffPlus > 0 && (
                              <span style={{ fontSize: 10, color: 'var(--c-success)', fontWeight: 600 }}>
                                +{v.diffPlus}
                              </span>
                            )}
                            {v.diffMinus !== undefined && v.diffMinus > 0 && (
                              <span style={{ fontSize: 10, color: 'var(--c-danger)', fontWeight: 600 }}>
                                -{v.diffMinus}
                              </span>
                            )}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{
                            width: 18, height: 18, borderRadius: '50%',
                            background: author?.color ?? '#ccc',
                            color: '#fff', fontSize: 9, fontWeight: 700,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0,
                          }}>
                            {v.authorId}
                          </div>
                          <span style={{ fontSize: 11, color: 'var(--c-text-4)' }}>{v.time}</span>
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
                          borderBottom: '1px solid var(--c-border-l)',
                        }}
                      >
                        {/* Author + Time */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                          <div style={{
                            width: 22, height: 22, borderRadius: '50%',
                            background: author?.color ?? '#ccc',
                            color: '#fff', fontSize: 9, fontWeight: 700,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0,
                          }}>
                            {c.authorId}
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--c-text)' }}>
                            {author?.name ?? c.authorId}
                          </span>
                          <span style={{ fontSize: 11, color: 'var(--c-text-4)', marginLeft: 'auto' }}>
                            {c.time}
                          </span>
                        </div>

                        {/* Quote */}
                        {c.quote && (
                          <div style={{
                            fontSize: 11,
                            fontStyle: 'italic',
                            color: 'var(--c-text-4)',
                            borderLeft: '2px solid var(--c-border)',
                            paddingLeft: 8,
                            marginBottom: 6,
                            lineHeight: 1.5,
                          }}>
                            {c.quote}
                          </div>
                        )}

                        {/* Text */}
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
        )}
      </div>

      {/* Status Bar */}
      <div style={{
        height: 28,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '0 16px',
        borderTop: '1px solid var(--c-border)',
        background: 'var(--c-surface)',
        fontSize: 11,
        color: 'var(--c-text-4)',
        flexShrink: 0,
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: conn === 'online' ? 'var(--c-success)' : 'var(--c-warn)', display: 'inline-block' }} />
          {conn === 'online' ? 'Online · Sync aktiv' : 'Offline · Lokal gespeichert'}
        </span>
        <span style={{ color: 'var(--c-border)' }}>|</span>
        <span>Lock: Du · seit 2 Std.</span>
        <span style={{ color: 'var(--c-border)' }}>|</span>
        <span>Version: v4</span>
        <div style={{ flex: 1 }} />
        <span>0 Wörter</span>
        <span style={{ color: 'var(--c-border)' }}>|</span>
        <span>0 Blöcke</span>
        <span style={{ color: 'var(--c-border)' }}>|</span>
        <span>0 0/8 Seiten</span>
        <span style={{ color: 'var(--c-border)' }}>|</span>
        <span>≈ 0:00</span>
      </div>

      {/* Offline Banner */}
      {conn === 'offline' && (
        <div style={{
          position: 'fixed',
          bottom: 28,
          left: 0,
          right: 0,
          background: '#FFF3CD',
          borderTop: '1px solid var(--c-warn)',
          padding: '8px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          zIndex: 1000,
          fontSize: 13,
          color: '#7a4800',
        }}>
          <WifiOff size={15} style={{ color: 'var(--c-warn)' }} />
          <span>Offline – Änderungen werden lokal gespeichert und beim nächsten Verbindungsaufbau synchronisiert.</span>
        </div>
      )}

      {/* Tweaks FAB */}
      <div style={{ position: 'fixed', bottom: 48, right: 16, zIndex: 200 }}>
        {showTweaks && (
          <div style={{
            position: 'absolute',
            bottom: 44,
            right: 0,
            width: 240,
            background: 'var(--c-paper)',
            border: '1px solid var(--c-border)',
            borderRadius: 'var(--r-lg)',
            boxShadow: 'var(--sh-3)',
            padding: 14,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Tweaks
            </div>

            <TweakRow label="Theme">
              <div className="segmented">
                <button className={theme === 'light' ? 'active' : ''} onClick={() => setTheme('light')}>Hell</button>
                <button className={theme === 'dark' ? 'active' : ''} onClick={() => setTheme('dark')}>Dunkel</button>
              </div>
            </TweakRow>

            <TweakRow label="Navigator">
              <div className="segmented">
                <button className={showNav ? 'active' : ''} onClick={() => setShowNav(true)}>An</button>
                <button className={!showNav ? 'active' : ''} onClick={() => setShowNav(false)}>Aus</button>
              </div>
            </TweakRow>

            <TweakRow label="Seiten-Panel">
              <div className="segmented">
                <button className={showHistory ? 'active' : ''} onClick={() => setShowHistory(true)}>An</button>
                <button className={!showHistory ? 'active' : ''} onClick={() => setShowHistory(false)}>Aus</button>
              </div>
            </TweakRow>

            <TweakRow label="Gutter-Labels">
              <div className="segmented">
                <button className={gutterMode === 'hover' ? 'active' : ''} onClick={() => setGutterMode('hover')}>Hover</button>
                <button className={gutterMode === 'always' ? 'active' : ''} onClick={() => setGutterMode('always')}>Immer</button>
                <button className={gutterMode === 'off' ? 'active' : ''} onClick={() => setGutterMode('off')}>Aus</button>
              </div>
            </TweakRow>

            <TweakRow label="Verbindung">
              <div className="segmented">
                <button className={conn === 'online' ? 'active' : ''} onClick={() => setConn('online')}>Online</button>
                <button className={conn === 'offline' ? 'active' : ''} onClick={() => setConn('offline')}>Offline</button>
              </div>
            </TweakRow>
          </div>
        )}

        <button
          onClick={() => setShowTweaks(v => !v)}
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: 'var(--c-ink)',
            color: 'var(--c-paper)',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: 'var(--sh-3)',
          }}
          title="Tweaks"
        >
          <Settings size={15} />
        </button>
      </div>
    </div>
  )
}

function RailButton({ icon, title, active }: { icon: React.ReactNode; title: string; active?: boolean }) {
  return (
    <button
      title={title}
      style={{
        width: 32,
        height: 32,
        borderRadius: 'var(--r-md)',
        border: 'none',
        background: active ? 'var(--c-ink)' : 'transparent',
        color: active ? 'var(--c-paper)' : 'var(--c-text-4)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background var(--t-fast), color var(--t-fast)',
      }}
      onMouseEnter={e => { if (!active) { e.currentTarget.style.background = 'var(--c-border)'; e.currentTarget.style.color = 'var(--c-text)' } }}
      onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--c-text-4)' } }}
    >
      {icon}
    </button>
  )
}

function TweakRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <span style={{ fontSize: 12, color: 'var(--c-text-2)', flexShrink: 0 }}>{label}</span>
      {children}
    </div>
  )
}
