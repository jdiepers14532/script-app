import { useState } from 'react'
import { Lock, MessageSquare, Plus, SlidersHorizontal, ArrowUpDown, Search, ChevronDown } from 'lucide-react'
import { SCENES, ENV_COLORS, Scene } from '../data/scenes'

interface SceneListProps {
  activeSceneId: number
  onSelectScene: (id: number) => void
}

export default function SceneList({ activeSceneId, onSelectScene }: SceneListProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [folge, setFolge] = useState(4512)

  const filtered = SCENES.filter(s =>
    s.folge === folge &&
    (searchQuery === '' ||
      s.motiv.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.nummer.includes(searchQuery))
  )

  return (
    <div style={{
      width: 280,
      flexShrink: 0,
      borderRight: '1px solid var(--c-border)',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--c-paper)',
      height: '100%',
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 12px 8px',
        borderBottom: '1px solid var(--c-border)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}>
        {/* Folge Picker Row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '5px 10px',
              borderRadius: 'var(--r-md)',
              border: '1px solid var(--c-border)',
              background: 'var(--c-paper)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
              color: 'var(--c-text)',
              flex: 1,
            }}
          >
            Folge {folge}
            <ChevronDown size={13} style={{ marginLeft: 'auto', color: 'var(--c-text-4)' }} />
          </button>
          <button className="btn-icon btn-sm" title="Sortieren"><ArrowUpDown size={13} /></button>
          <button className="btn-icon btn-sm" title="Filtern"><SlidersHorizontal size={13} /></button>
          <button className="btn-icon btn-sm" title="Neue Szene" style={{ background: 'var(--c-ink)', color: 'var(--c-paper)', border: 'none' }}>
            <Plus size={13} />
          </button>
        </div>

        {/* Search */}
        <div style={{ position: 'relative' }}>
          <Search size={13} style={{
            position: 'absolute',
            left: 8,
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--c-text-4)',
            pointerEvents: 'none',
          }} />
          <input
            className="input input-sm"
            style={{ paddingLeft: 26 }}
            placeholder="Szene suchen…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Scene Count */}
      <div style={{
        padding: '6px 12px',
        fontSize: 11,
        color: 'var(--c-text-4)',
        borderBottom: '1px solid var(--c-border-l)',
        display: 'flex',
        justifyContent: 'space-between',
      }}>
        <span>{filtered.length} Szenen</span>
        <span>∑ {filtered.reduce((a, s) => {
          const [whole, frac = '0'] = s.seiten.split(' ')
          return a + parseInt(whole) + parseInt(frac) / 8
        }, 0).toFixed(1)} S.</span>
      </div>

      {/* Scene List */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {filtered.map(scene => (
          <SceneRow
            key={scene.id}
            scene={scene}
            active={scene.id === activeSceneId}
            onClick={() => onSelectScene(scene.id)}
          />
        ))}
      </div>
    </div>
  )
}

function SceneRow({ scene, active, onClick }: { scene: Scene; active: boolean; onClick: () => void }) {
  const envColor = ENV_COLORS[scene.env]
  const isDarkBg = envColor.textDark === true
  const textColor = isDarkBg ? '#ffffff' : 'var(--c-text)'
  const textSecondary = isDarkBg ? 'rgba(255,255,255,0.65)' : 'var(--c-text-3)'

  const intExtLabel = scene.intExt

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'stretch',
        cursor: 'pointer',
        background: active ? (isDarkBg ? 'rgba(255,255,255,0.1)' : 'var(--c-surface)') : envColor.bg,
        borderLeft: active ? '3px solid var(--c-ink)' : `3px solid transparent`,
        borderBottom: '1px solid rgba(0,0,0,0.05)',
        transition: 'background var(--t-fast)',
        position: 'relative',
      }}
    >
      {/* Color Stripe */}
      <div style={{
        width: 4,
        flexShrink: 0,
        background: envColor.stripe,
      }} />

      {/* Content */}
      <div style={{
        flex: 1,
        padding: '8px 10px',
        minWidth: 0,
      }}>
        {/* Row 1: Number + Int/Ext Badge + Motiv */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
          <span style={{
            fontSize: 11,
            fontWeight: 700,
            color: textColor,
            fontFamily: 'var(--font-mono)',
            minWidth: 20,
          }}>
            {scene.nummer}
          </span>
          <span style={{
            fontSize: 10,
            fontWeight: 600,
            padding: '1px 5px',
            borderRadius: 'var(--r-sm)',
            background: isDarkBg ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.07)',
            color: textColor,
          }}>
            {intExtLabel}
          </span>
          <span style={{
            fontSize: 12,
            fontWeight: 500,
            color: textColor,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
          }}>
            {scene.motiv}
          </span>
        </div>

        {/* Row 2: Meta */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: textSecondary }}>{scene.tageszeit}</span>
          <span style={{ fontSize: 10, color: textSecondary }}>·</span>
          <span style={{ fontSize: 11, color: textSecondary }}>{scene.stageNr}</span>
          <span style={{ fontSize: 10, color: textSecondary }}>·</span>
          <span style={{ fontSize: 11, color: textSecondary }}>{scene.seiten} S.</span>

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5 }}>
            {/* Lock */}
            {scene.locked && (
              <Lock
                size={11}
                style={{ color: scene.contract ? 'var(--c-info)' : textSecondary }}
                fill={scene.contract ? 'var(--c-info)' : 'currentColor'}
              />
            )}

            {/* Comment Bubble */}
            {scene.comments && scene.comments.total > 0 && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                fontSize: 10,
                color: textSecondary,
              }}>
                <MessageSquare size={11} />
                <span>
                  {scene.comments.total}
                  {scene.comments.unread > 0 && (
                    <>
                      ·
                      <span style={{ color: 'var(--c-info)', fontWeight: 600, marginLeft: 2 }}>
                        {scene.comments.unread}
                      </span>
                    </>
                  )}
                </span>
              </div>
            )}

            {/* Duration */}
            <span style={{ fontSize: 10, color: textSecondary }}>{scene.dauer}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
