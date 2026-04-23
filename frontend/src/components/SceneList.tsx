import { useState } from 'react'
import { Lock, MessageSquare, Search, X } from 'lucide-react'
import { SCENES, ENV_COLORS, Scene } from '../data/scenes'
import { useFocus } from '../App'

interface SceneListProps {
  activeSceneId: number
  onSelectScene: (id: number) => void
}

export default function SceneList({ activeSceneId, onSelectScene }: SceneListProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const { focus } = useFocus()
  const folge = 4512

  const filtered = SCENES.filter(s =>
    s.folge === folge &&
    (searchQuery === '' ||
      s.motiv.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.nummer.includes(searchQuery))
  )

  // Width is 280px in normal mode, 240px in focus mode — driven by CSS via .scene-list class
  // but we also set it inline as a fallback using the CSS variable
  const listWidth = focus ? 240 : 280

  return (
    <div
      className="scene-list"
      style={{
        width: listWidth,
        flexShrink: 0,
        borderRight: '1px solid var(--c-line)',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--c-paper)',
        height: '100%',
        transition: `width var(--t-med)`,
      }}
    >
      {/* Header */}
      <div style={{
        padding: '10px 12px 8px',
        borderBottom: '1px solid var(--c-line)',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        minHeight: 40,
      }}>
        {searchOpen ? (
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={11} style={{
              position: 'absolute', left: 7, top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--c-muted)', pointerEvents: 'none',
            }} />
            <input
              autoFocus
              className="input input-sm"
              style={{ paddingLeft: 24, fontSize: 12 }}
              placeholder="Szene suchen…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            <button
              onClick={() => { setSearchOpen(false); setSearchQuery('') }}
              style={{
                position: 'absolute', right: 6, top: '50%',
                transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--c-muted)', display: 'flex', alignItems: 'center',
                padding: 0,
              }}
            >
              <X size={11} />
            </button>
          </div>
        ) : (
          <>
            <span style={{
              flex: 1, fontSize: 12, fontWeight: 500,
              color: 'var(--c-text-2)',
            }}>
              Folge {folge}
            </span>
            <button
              className="btn-icon"
              style={{ width: 26, height: 26 }}
              onClick={() => setSearchOpen(true)}
              title="Suchen"
            >
              <Search size={13} />
            </button>
          </>
        )}
      </div>

      {/* Scene List */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {filtered.map(scene => (
          <SceneRow
            key={scene.id}
            scene={scene}
            active={scene.id === activeSceneId}
            onClick={() => onSelectScene(scene.id)}
            showMeta={!focus}
          />
        ))}
      </div>
    </div>
  )
}

function SceneRow({
  scene,
  active,
  onClick,
  showMeta,
}: {
  scene: Scene
  active: boolean
  onClick: () => void
  showMeta: boolean
}) {
  const envColor = ENV_COLORS[scene.env]

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'stretch',
        cursor: 'pointer',
        background: active ? 'var(--c-ui)' : 'transparent',
        borderLeft: active ? '2px solid var(--c-ink)' : '2px solid transparent',
        borderBottom: '1px solid var(--c-line)',
        transition: 'background var(--t-fast)',
      }}
      onMouseEnter={e => {
        if (!active) e.currentTarget.style.background = 'var(--c-ui)'
      }}
      onMouseLeave={e => {
        if (!active) e.currentTarget.style.background = 'transparent'
      }}
    >
      {/* Color Stripe */}
      <div style={{
        width: 3,
        flexShrink: 0,
        background: envColor.stripe,
      }} />

      {/* Content */}
      <div style={{
        flex: 1,
        padding: '7px 10px',
        minWidth: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}>
        {/* Scene Number */}
        <span style={{
          fontSize: 10,
          fontWeight: 600,
          color: 'var(--c-muted)',
          fontFamily: 'var(--font-script)',
          minWidth: 16,
          flexShrink: 0,
        }}>
          {scene.nummer}
        </span>

        {/* Motiv */}
        <span style={{
          fontSize: 12,
          color: active ? 'var(--c-text)' : 'var(--c-text-2)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
          fontWeight: active ? 500 : 400,
        }}>
          {scene.motiv}
        </span>

        {/* Indicators — hidden in focus mode via scene-row-meta class */}
        <div className="scene-row-meta" style={{ alignItems: 'center', gap: 3, flexShrink: 0 }}>
          {scene.locked && (
            <Lock size={11} style={{ color: 'var(--c-muted)' }} />
          )}
          {scene.comments && scene.comments.total > 0 && (
            <MessageSquare size={11} style={{ color: 'var(--c-muted)' }} />
          )}
        </div>

        {/* In focus mode: show a single compact indicator if locked/has comments */}
        {!showMeta && (scene.locked || (scene.comments && scene.comments.total > 0)) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
            {scene.locked && <Lock size={10} style={{ color: 'var(--c-muted)' }} />}
          </div>
        )}
      </div>
    </div>
  )
}
