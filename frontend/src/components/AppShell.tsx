import { ReactNode, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, FileText, Settings, Minimize2, Maximize2,
  Bell, SlidersHorizontal, Sun, Moon, Film, BookOpen, Users, Lock, BarChart2,
  X
} from 'lucide-react'
import { useFocus } from '../App'
import { useOfflineQueue } from '../hooks/useOfflineQueue'

interface AppShellProps {
  children: ReactNode
  staffeln?: any[]
  selectedStaffelId?: string
  onSelectStaffel?: (id: string) => void
  bloecke?: any[]
  selectedBlockId?: number | null
  onSelectBlock?: (id: number) => void
  episoden?: any[]
  selectedEpisodeId?: number | null
  onSelectEpisode?: (id: number) => void
  stages?: any[]
  selectedStageId?: number | null
  onSelectStage?: (id: number) => void
}

type ColorMode = 'full' | 'subtle' | 'off'
type PanelMode = 'both' | 'treatment' | 'script'
type Density = 'compact' | 'normal'

export interface TweakState {
  theme: 'light' | 'dark'
  colorMode: ColorMode
  panelMode: PanelMode
  density: Density
  breakdown: boolean
  conn: 'online' | 'offline'
}

const selectStyle: React.CSSProperties = {
  fontSize: 12,
  border: 'none',
  background: 'transparent',
  color: 'inherit',
  cursor: 'pointer',
  fontFamily: 'inherit',
  padding: '2px 4px',
  borderRadius: 4,
  outline: 'none',
}

export default function AppShell({
  children,
  staffeln = [],
  selectedStaffelId = '',
  onSelectStaffel,
  bloecke = [],
  selectedBlockId = null,
  onSelectBlock,
  episoden = [],
  selectedEpisodeId = null,
  onSelectEpisode,
  stages = [],
  selectedStageId = null,
  onSelectStage,
}: AppShellProps) {
  const location = useLocation()
  const { focus, toggle } = useFocus()
  const { isOnline, pendingCount, isSyncing } = useOfflineQueue()
  const [tweaksOpen, setTweaksOpen] = useState(false)
  const [tweaks, setTweaks] = useState<TweakState>({
    theme: 'light',
    colorMode: 'subtle',
    panelMode: 'both',
    density: 'normal',
    breakdown: true,
    conn: 'online',
  })

  const set = <K extends keyof TweakState>(k: K, v: TweakState[K]) =>
    setTweaks(t => ({ ...t, [k]: v }))

  const selectedStaffel = staffeln.find(s => s.id === selectedStaffelId)
  const selectedBlock = bloecke.find(b => b.id === selectedBlockId)
  const selectedEpisode = episoden.find(e => e.id === selectedEpisodeId)
  const selectedStage = stages.find(s => s.id === selectedStageId)

  const crumbStaffel = selectedStaffel?.titel ?? selectedStaffelId ?? 'Script'
  const crumbBlock = selectedBlock ? `Block ${selectedBlock.block_nummer}` : null
  const crumbEpisode = selectedEpisode ? `Folge ${selectedEpisode.episode_nummer}` : null
  const crumbStage = selectedStage ? selectedStage.stage_type : null

  return (
    <div
      className="app"
      data-theme={tweaks.theme}
    >
      {/* Topbar */}
      <header className="topbar">
        <div className="brand">
          <div className="mark">S</div>
          <span>script</span>
        </div>

        <div className="divider" />

        <div className="crumbs">
          {staffeln.length > 0 && onSelectStaffel ? (
            <select
              style={selectStyle}
              value={selectedStaffelId}
              onChange={e => onSelectStaffel(e.target.value)}
            >
              {staffeln.map(s => (
                <option key={s.id} value={s.id}>{s.titel}</option>
              ))}
            </select>
          ) : (
            <span>{crumbStaffel}</span>
          )}

          {bloecke.length > 0 && onSelectBlock && (
            <>
              <span>·</span>
              <select
                style={selectStyle}
                value={selectedBlockId ?? ''}
                onChange={e => onSelectBlock(Number(e.target.value))}
              >
                {bloecke.map(b => (
                  <option key={b.id} value={b.id}>Block {b.block_nummer}</option>
                ))}
              </select>
            </>
          )}
          {!bloecke.length && crumbBlock && (
            <>
              <span>·</span>
              <span>{crumbBlock}</span>
            </>
          )}

          {episoden.length > 0 && onSelectEpisode && (
            <>
              <span>·</span>
              <select
                style={selectStyle}
                value={selectedEpisodeId ?? ''}
                onChange={e => onSelectEpisode(Number(e.target.value))}
              >
                {episoden.map(e => (
                  <option key={e.id} value={e.id}>Folge {e.episode_nummer}</option>
                ))}
              </select>
            </>
          )}
          {!episoden.length && crumbEpisode && (
            <>
              <span>·</span>
              <b>{crumbEpisode}</b>
            </>
          )}

          {stages.length > 0 && onSelectStage && crumbStage && (
            <>
              <span className="chip topbar-extra">{crumbStage}</span>
            </>
          )}
        </div>

        <div className="spacer" />

        {/* Online pill */}
        <div className="status-pill topbar-extra" style={{ borderColor: isOnline ? undefined : 'var(--sw-warning)' }}>
          <span className="dot" style={{ background: isOnline && pendingCount === 0 ? 'var(--sw-green)' : isOnline ? 'var(--sw-warning)' : 'var(--sw-danger)' }} />
          <span>
            {!isOnline
              ? `Offline${pendingCount > 0 ? ` · ${pendingCount} ausstehend` : ''}`
              : isSyncing
              ? 'Synchronisiert…'
              : pendingCount > 0
              ? `${pendingCount} ausstehende Änderungen`
              : 'Online · Synced'}
          </span>
        </div>

        {/* Theme toggle */}
        <button
          className="iconbtn topbar-extra"
          onClick={() => set('theme', tweaks.theme === 'light' ? 'dark' : 'light')}
          title="Theme wechseln"
        >
          {tweaks.theme === 'light'
            ? <Moon size={14} />
            : <Sun size={14} />
          }
        </button>

        {/* Tweaks */}
        <button
          className="iconbtn topbar-extra"
          onClick={() => setTweaksOpen(v => !v)}
          title="Ansichtsoptionen"
        >
          <SlidersHorizontal size={14} />
        </button>

        {/* Bell */}
        <button className="iconbtn topbar-extra" title="Benachrichtigungen">
          <Bell size={14} />
        </button>

        {/* Focus toggle */}
        <button
          className="focus-toggle"
          onClick={toggle}
          title="Fokus-Modus (F10)"
          aria-label={focus ? 'Fokus-Modus beenden' : 'Fokus-Modus aktivieren'}
        >
          {focus ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
        </button>

        {/* Avatar */}
        <div className="avatar" title="Jan Diepers">JD</div>
      </header>

      {/* Left Nav */}
      <nav className="nav">
        <div className="section">Projekt</div>
        <NavItem to="/" icon={<LayoutDashboard size={15} />} label="Folgen" count="12" active={location.pathname === '/'} />
        <NavItem to="/editor" icon={<FileText size={15} />} label="Editor" active={location.pathname === '/editor'} />
        <NavItem to="/" icon={<Film size={15} />} label="Drehplan" active={false} />

        <div className="section">Autor</div>
        <NavItem to="/" icon={<BookOpen size={15} />} label="Treatments" count="4" active={false} />

        <div className="section">Blöcke</div>
        <NavItem to="/" icon={<BarChart2 size={15} />} label="Breakdown" active={false} />
        <NavItem to="/" icon={<Lock size={15} />} label="Lock-Status" active={false} />

        <div className="section">Verwaltung</div>
        <NavItem to="/admin" icon={<Settings size={15} />} label="Einstellungen" active={location.pathname === '/admin'} />
        <NavItem to="/" icon={<Users size={15} />} label="Benutzer" active={false} />
      </nav>

      {/* Main content — passes tweaks via data attrs */}
      <main
        className="app-main"
        data-colormode={tweaks.colorMode}
        data-panelmode={tweaks.panelMode}
        data-density={tweaks.density}
        data-breakdown={tweaks.breakdown ? 'on' : 'off'}
        style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
        {children}
      </main>

      {/* Tweaks panel */}
      <div className={`tweaks${tweaksOpen ? ' open' : ''}`}>
        <div className="th">
          <span className="title">Ansicht</span>
          <span className="spacer" />
          <button className="close" onClick={() => setTweaksOpen(false)}><X size={12} /></button>
        </div>
        <div className="body">
          <TweakGroup label="Theme">
            <div className="seg">
              <button className={tweaks.theme === 'light' ? 'on' : ''} onClick={() => set('theme', 'light')}>Hell</button>
              <button className={tweaks.theme === 'dark' ? 'on' : ''} onClick={() => set('theme', 'dark')}>Dunkel</button>
            </div>
          </TweakGroup>
          <TweakGroup label="Farbcodierung">
            <div className="seg">
              <button className={tweaks.colorMode === 'full' ? 'on' : ''} onClick={() => set('colorMode', 'full')}>Vollfarbe</button>
              <button className={tweaks.colorMode === 'subtle' ? 'on' : ''} onClick={() => set('colorMode', 'subtle')}>Subtil</button>
              <button className={tweaks.colorMode === 'off' ? 'on' : ''} onClick={() => set('colorMode', 'off')}>Aus</button>
            </div>
          </TweakGroup>
          <TweakGroup label="Panelmodus">
            <div className="seg">
              <button className={tweaks.panelMode === 'both' ? 'on' : ''} onClick={() => set('panelMode', 'both')}>Beide</button>
              <button className={tweaks.panelMode === 'treatment' ? 'on' : ''} onClick={() => set('panelMode', 'treatment')}>Treatment</button>
              <button className={tweaks.panelMode === 'script' ? 'on' : ''} onClick={() => set('panelMode', 'script')}>Drehbuch</button>
            </div>
          </TweakGroup>
          <TweakGroup label="Dichte">
            <div className="seg">
              <button className={tweaks.density === 'compact' ? 'on' : ''} onClick={() => set('density', 'compact')}>Kompakt</button>
              <button className={tweaks.density === 'normal' ? 'on' : ''} onClick={() => set('density', 'normal')}>Normal</button>
            </div>
          </TweakGroup>
          <TweakGroup label="Breakdown">
            <div className="seg">
              <button className={tweaks.breakdown ? 'on' : ''} onClick={() => set('breakdown', true)}>An</button>
              <button className={!tweaks.breakdown ? 'on' : ''} onClick={() => set('breakdown', false)}>Aus</button>
            </div>
          </TweakGroup>
          <TweakGroup label="Verbindung">
            <div className="seg">
              <button className={tweaks.conn === 'online' ? 'on' : ''} onClick={() => set('conn', 'online')}>Online</button>
              <button className={tweaks.conn === 'offline' ? 'on' : ''} onClick={() => set('conn', 'offline')}>Offline</button>
            </div>
          </TweakGroup>
        </div>
      </div>
    </div>
  )
}

function NavItem({
  to,
  icon,
  label,
  count,
  active,
}: {
  to: string
  icon: ReactNode
  label: string
  count?: string
  active: boolean
}) {
  return (
    <Link to={to} className={`item${active ? ' active' : ''}`}>
      <span className="i">{icon}</span>
      <span className="nav-label">{label}</span>
      {count && <span className="count">{count}</span>}
    </Link>
  )
}

function TweakGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="group">
      <div className="lbl">{label}</div>
      {children}
    </div>
  )
}
