import { ReactNode, useState, useMemo } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, FileText, Settings, Minimize2, Maximize2,
  Bell, SlidersHorizontal, Sun, Moon, Film, BookOpen, Users, Lock, BarChart2,
  X, FileUp
} from 'lucide-react'
import { useFocus, useSelectedProduction } from '../App'
import { useOfflineQueue } from '../hooks/useOfflineQueue'
import ProductionSelector from './ProductionSelector'

interface AppShellProps {
  children: ReactNode
  staffeln?: any[]
  selectedStaffelId?: string
  onSelectStaffel?: (id: string) => void
  bloecke?: any[]
  selectedBlock?: any | null
  onSelectBlock?: (block: any) => void
  selectedFolgeNummer?: number | null
  onSelectFolge?: (nr: number) => void
  stages?: any[]
  selectedStageId?: number | null
  onSelectStage?: (id: number) => void
  hideProductionSelector?: boolean
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
  selectedBlock = null,
  onSelectBlock,
  selectedFolgeNummer = null,
  onSelectFolge,
  stages = [],
  selectedStageId = null,
  onSelectStage,
  hideProductionSelector = false,
}: AppShellProps) {
  const location = useLocation()
  const { focus, toggle } = useFocus()
  const { isOnline, pendingCount, isSyncing } = useOfflineQueue()
  const { productions, selectedId: selectedProdId, selectProduction } = useSelectedProduction()
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

  // All folgen across all blocks, flat
  const allFolgen = useMemo(() => {
    const result: { nr: number; block: any }[] = []
    for (const b of bloecke) {
      if (b.folge_von != null && b.folge_bis != null) {
        for (let nr = b.folge_von; nr <= b.folge_bis; nr++) {
          result.push({ nr, block: b })
        }
      }
    }
    return result
  }, [bloecke])

  const handleFolgeSelect = (nr: number) => {
    const entry = allFolgen.find(f => f.nr === nr)
    if (!entry) return
    if (entry.block.proddb_id !== selectedBlock?.proddb_id) onSelectBlock?.(entry.block)
    onSelectFolge?.(nr)
  }

  const selectedStaffel = staffeln.find(s => s.id === selectedStaffelId)
  const selectedStage = stages.find(s => s.id === selectedStageId)

  const crumbStaffel = selectedStaffel?.titel ?? selectedStaffelId ?? 'Script'
  const crumbStage = selectedStage ? selectedStage.stage_type : null

  return (
    <div className="app" data-theme={tweaks.theme}>
      {/* Topbar */}
      <header className="topbar">
        <div className="brand">
          <div className="mark">S</div>
          <span>script</span>
        </div>

        <div className="divider" />

        <div className="crumbs">
          {!hideProductionSelector && productions.length > 0 ? (
            <ProductionSelector
              productions={productions}
              selectedId={selectedProdId}
              onSelect={selectProduction}
            />
          ) : !hideProductionSelector && staffeln.length > 0 && onSelectStaffel ? (
            <select style={selectStyle} value={selectedStaffelId} onChange={e => onSelectStaffel(e.target.value)}>
              {staffeln.map(s => <option key={s.id} value={s.id}>{s.titel}</option>)}
            </select>
          ) : (
            <span>{crumbStaffel}</span>
          )}

          {bloecke.length > 0 && onSelectBlock && (
            <>
              <span>·</span>
              <select
                style={selectStyle}
                value={selectedBlock?.proddb_id ?? ''}
                onChange={e => onSelectBlock(bloecke.find(b => b.proddb_id === e.target.value))}
              >
                {bloecke.map(b => (
                  <option key={b.proddb_id} value={b.proddb_id}>
                    Block {b.block_nummer}{b.folge_von != null ? ` (${b.folge_von}–${b.folge_bis})` : ''}
                  </option>
                ))}
              </select>
            </>
          )}

          {allFolgen.length > 0 && onSelectFolge && (
            <>
              <span>·</span>
              <select
                style={selectStyle}
                value={selectedFolgeNummer ?? ''}
                onChange={e => handleFolgeSelect(Number(e.target.value))}
              >
                {allFolgen.map(({ nr, block }) => (
                  <option
                    key={nr}
                    value={nr}
                    style={{ fontWeight: block.proddb_id === selectedBlock?.proddb_id ? 700 : 400 }}
                  >
                    Folge {nr}
                  </option>
                ))}
              </select>
            </>
          )}

          {stages.length > 0 && onSelectStage && crumbStage && (
            <span className="chip topbar-extra">{crumbStage}</span>
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

        <button className="iconbtn topbar-extra" onClick={() => set('theme', tweaks.theme === 'light' ? 'dark' : 'light')} title="Theme wechseln">
          {tweaks.theme === 'light' ? <Moon size={14} /> : <Sun size={14} />}
        </button>

        <button className="iconbtn topbar-extra" onClick={() => setTweaksOpen(v => !v)} title="Ansichtsoptionen">
          <SlidersHorizontal size={14} />
        </button>

        <button className="iconbtn topbar-extra" title="Benachrichtigungen">
          <Bell size={14} />
        </button>

        <button className="focus-toggle" onClick={toggle} title="Fokus-Modus (F10)" aria-label={focus ? 'Fokus-Modus beenden' : 'Fokus-Modus aktivieren'}>
          {focus ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
        </button>

        <div className="avatar" title="Jan Diepers">JD</div>
      </header>

      {/* Left Nav */}
      <nav className="nav">
        <div className="section">Projekt</div>
        <NavItem to="/" icon={<LayoutDashboard size={15} />} label="Folgen" count="12" active={location.pathname === '/'} />
        <NavItem to="/editor" icon={<FileText size={15} />} label="Editor" active={location.pathname === '/editor'} />
        <NavItem to="/import" icon={<FileUp size={15} />} label="Import" active={location.pathname === '/import'} />
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

      {/* Main content */}
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

function NavItem({ to, icon, label, count, active }: { to: string; icon: ReactNode; label: string; count?: string; active: boolean }) {
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
