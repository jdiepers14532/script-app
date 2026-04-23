import { useState } from 'react'
import { Lock, MessageSquare, Search, ChevronDown, Plus } from 'lucide-react'
import { SCENES, ENV_COLORS, Scene } from '../data/scenes'

interface SceneListProps {
  activeSceneId: number
  onSelectScene: (id: number) => void
  colorMode?: 'full' | 'subtle' | 'off'
}

export default function SceneList({ activeSceneId, onSelectScene, colorMode = 'subtle' }: SceneListProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const folge = 4512

  const filtered = SCENES.filter(s =>
    s.folge === folge &&
    (searchQuery === '' ||
      s.motiv.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.nummer.includes(searchQuery))
  )

  return (
    <div className="scenes" data-colormode={colorMode}>
      {/* Episode bar */}
      <div className="ep-bar">
        <button className="ep-picker">
          <span>Folge {folge}</span>
          <ChevronDown size={12} />
        </button>
        <span className="spacer" />
        <button className="iconbtn" title="Neue Szene"><Plus size={13} /></button>
      </div>

      {/* Search bar */}
      <div className="searchbar" style={{ position: 'relative' }}>
        <Search size={11} style={{
          position: 'absolute', left: 20, top: '50%',
          transform: 'translateY(-50%)',
          color: 'var(--text-muted)', pointerEvents: 'none',
        }} />
        <input
          placeholder="Szene suchen…"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Scene rows */}
      <div className="list">
        {filtered.map(scene => (
          <SceneRow
            key={scene.id}
            scene={scene}
            active={scene.id === activeSceneId}
            onClick={() => onSelectScene(scene.id)}
            colorMode={colorMode}
          />
        ))}
      </div>
    </div>
  )
}

const STAGE_LABELS: Record<string, string> = {
  'ST 1': 'Freigelände',
  'ST 2': 'Studio 2',
  'ST 3': 'Studio 3',
  'ST 4': 'Studio 4',
  'ST 5': 'Ext. Motiv',
  'ST 6': 'Studio 6',
}

function SceneRow({
  scene,
  active,
  onClick,
  colorMode,
}: {
  scene: Scene
  active: boolean
  onClick: () => void
  colorMode: 'full' | 'subtle' | 'off'
}) {
  const envColor = ENV_COLORS[scene.env]
  const isDark = !!envColor.textDark

  const rowStyle = {} as Record<string, string>
  if (colorMode === 'full') {
    rowStyle['--row-bg'] = envColor.bg
  }
  if (colorMode === 'subtle' || colorMode === 'full') {
    rowStyle['--stripe'] = envColor.stripe
  }

  return (
    <div
      className={`row${active ? ' active' : ''}${colorMode === 'full' && isDark ? ' on-dark' : ''}`}
      style={rowStyle}
      onClick={onClick}
    >
      {/* Env stripe (subtle/full modes) */}
      {!active && (colorMode === 'subtle' || colorMode === 'full') && (
        <div className="env-stripe" style={{ background: envColor.stripe }} />
      )}

      {/* Scene number */}
      <div className="num">{scene.nummer}</div>

      {/* Body */}
      <div className="body">
        <div className="title-line">
          <span className="ie">{scene.intExt}</span>
          <span className="set">{scene.motiv}</span>
        </div>
        <div className="meta">
          <span
            className="env-dot"
            style={{ background: envColor.stripe }}
          />
          <span>{scene.tageszeit}</span>
          <span>·</span>
          <span>{scene.stageNr}</span>
          <span>·</span>
          <span>{scene.seiten} S.</span>
        </div>
      </div>

      {/* Right column */}
      <div className="rt">
        <span>{scene.dauer}</span>
        <div className="badges">
          {scene.locked && (
            <Lock
              size={11}
              className={`lock-ico${scene.contract ? ' contract' : ''}`}
            />
          )}
          {scene.comments && scene.comments.total > 0 && (
            <span className="comment-bubble">
              <MessageSquare size={10} />
              {scene.comments.unread > 0
                ? `${scene.comments.unread}·${scene.comments.total}`
                : scene.comments.total
              }
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// suppress unused import warning
const _unused = STAGE_LABELS
void _unused
