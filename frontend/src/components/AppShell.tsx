import { ReactNode, useState, useMemo, useEffect, useRef } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, FileText, Settings, Minimize2, Maximize2,
  Bell, SlidersHorizontal, Sun, Moon, Film, BookOpen, Users, Lock, BarChart2,
  X, FileUp, PanelLeftClose, PanelLeftOpen, Building2, ChevronRight,
  MapPin, Receipt, FileCheck, CreditCard, BookMarked,
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

interface CompanyInfo {
  company_name: string
  company_legal_form: string
  company_address: { street: string; zip: string; city: string; country: string }
  company_register_court: string
  company_register_number: string
  company_vat_id: string
  company_tax_id: string
  logos: { light: string | null; dark: string | null }
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

const AUTH_URL = 'https://auth.serienwerft.studio'

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
  const navigate = useNavigate()
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

  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    try { return localStorage.getItem('script_sidebar_open') !== 'false' } catch { return true }
  })

  const [companyMenuOpen, setCompanyMenuOpen] = useState(false)
  const [scriptMenuOpen, setScriptMenuOpen] = useState(false)
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null)

  const companyBtnRef = useRef<HTMLButtonElement>(null)
  const scriptBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    fetch(`${AUTH_URL}/api/public/company-info`)
      .then(r => r.json())
      .then(d => setCompanyInfo(d))
      .catch(() => {})
  }, [])

  const toggleSidebar = () => {
    setSidebarOpen(v => {
      const next = !v
      try { localStorage.setItem('script_sidebar_open', String(next)) } catch {}
      return next
    })
  }

  const set = <K extends keyof TweakState>(k: K, v: TweakState[K]) =>
    setTweaks(t => ({ ...t, [k]: v }))

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

  const logoUrl = tweaks.theme === 'dark'
    ? (companyInfo?.logos?.dark || companyInfo?.logos?.light)
    : companyInfo?.logos?.light
  const logoNeedsInvert = tweaks.theme === 'dark' && !companyInfo?.logos?.dark

  const navSections = [
    {
      label: 'Projekt',
      items: [
        { to: '/', icon: <LayoutDashboard size={15} />, label: 'Folgen', count: '12', active: location.pathname === '/' },
        { to: '/editor', icon: <FileText size={15} />, label: 'Editor', active: location.pathname === '/editor' },
        { to: '/import', icon: <FileUp size={15} />, label: 'Import', active: location.pathname === '/import' },
        { to: '/', icon: <Film size={15} />, label: 'Drehplan', active: false },
      ],
    },
    {
      label: 'Autor',
      items: [
        { to: '/', icon: <BookOpen size={15} />, label: 'Treatments', count: '4', active: false },
      ],
    },
    {
      label: 'Blöcke',
      items: [
        { to: '/', icon: <BarChart2 size={15} />, label: 'Breakdown', active: false },
        { to: '/', icon: <Lock size={15} />, label: 'Lock-Status', active: false },
      ],
    },
    {
      label: 'Verwaltung',
      items: [
        { to: '/admin', icon: <Settings size={15} />, label: 'Einstellungen', active: location.pathname === '/admin' },
        { to: '/', icon: <Users size={15} />, label: 'Benutzer', active: false },
      ],
    },
  ]

  return (
    <div className="app" data-theme={tweaks.theme} data-sidebar={sidebarOpen ? 'open' : 'closed'}>
      {/* Topbar */}
      <header className="topbar">
        <div className="brand-area">
          {/* Firm logo */}
          <button
            ref={companyBtnRef}
            className="firm-logo-btn"
            onClick={() => { setCompanyMenuOpen(v => !v); setScriptMenuOpen(false) }}
            title="Firmenprofil"
          >
            {logoUrl
              ? <img
                  src={logoUrl}
                  alt="Logo"
                  className="firm-logo-img"
                  style={logoNeedsInvert ? { filter: 'invert(1)' } : undefined}
                />
              : <Building2 size={16} />
            }
          </button>

          {/* Script brand */}
          <button
            ref={scriptBtnRef}
            className="brand-btn"
            onClick={() => { setScriptMenuOpen(v => !v); setCompanyMenuOpen(false) }}
            title="Navigation"
          >
            <div className="mark">S</div>
            <span>script</span>
          </button>

          {/* Sidebar toggle */}
          <button
            className="iconbtn sidebar-toggle"
            onClick={toggleSidebar}
            title={sidebarOpen ? 'Sidebar schließen' : 'Sidebar öffnen'}
          >
            {sidebarOpen ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />}
          </button>
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
        {navSections.map(section => (
          <div key={section.label}>
            <div className="section">{section.label}</div>
            {section.items.map(item => (
              <NavItem key={item.label} to={item.to} icon={item.icon} label={item.label} count={(item as any).count} active={item.active} />
            ))}
          </div>
        ))}
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

      {/* ── Company Menu ── */}
      {companyMenuOpen && (
        <>
          <div className="menu-overlay" onClick={() => setCompanyMenuOpen(false)} />
          <div className="company-menu" data-theme="dark">
            {/* Header: Firm info */}
            <div className="cm-header">
              {logoUrl && (
                <img
                  src={logoUrl}
                  alt="Logo"
                  className="cm-logo"
                  style={logoNeedsInvert ? { filter: 'invert(1)' } : undefined}
                />
              )}
              <div className="cm-name">{companyInfo?.company_name || 'Serienwerft'}</div>
              {companyInfo?.company_legal_form && (
                <div className="cm-legal">{legalFormLabel(companyInfo.company_legal_form)}</div>
              )}
            </div>

            {companyInfo && (
              <div className="cm-info-block">
                {companyInfo.company_address?.street && (
                  <div className="cm-info-row">
                    <MapPin size={11} />
                    <span>
                      {companyInfo.company_address.street}<br />
                      {companyInfo.company_address.zip} {companyInfo.company_address.city}
                      {companyInfo.company_address.country !== 'Deutschland' ? `, ${companyInfo.company_address.country}` : ''}
                    </span>
                  </div>
                )}
                {companyInfo.company_vat_id && (
                  <div className="cm-info-row">
                    <Receipt size={11} />
                    <span>USt-ID: {companyInfo.company_vat_id}</span>
                  </div>
                )}
                {companyInfo.company_tax_id && (
                  <div className="cm-info-row">
                    <Receipt size={11} />
                    <span>St-Nr: {companyInfo.company_tax_id}</span>
                  </div>
                )}
                {companyInfo.company_register_number && (
                  <div className="cm-info-row">
                    <FileCheck size={11} />
                    <span>
                      HRB {companyInfo.company_register_number}
                      {companyInfo.company_register_court ? ` · ${companyInfo.company_register_court}` : ''}
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="cm-divider" />

            {/* Menu items — all "bald" */}
            <div className="cm-menu">
              <CompanyMenuItem
                icon={<Building2 size={14} />}
                label="Firmendaten"
                description="Adresse, Pflichtangaben, Register"
              />
              <CompanyMenuItem
                icon={<CreditCard size={14} />}
                label="Kontakt zur Buchhaltung"
                description="Abrechnungen, Bescheinigungen, Rechnung"
                hasArrow
              />
              <CompanyMenuItem
                icon={<BookMarked size={14} />}
                label="VG Wort"
                description="Meldungen und Ausschüttungen"
              />
            </div>
          </div>
        </>
      )}

      {/* ── Script / Nav Menu ── */}
      {scriptMenuOpen && (
        <>
          <div className="menu-overlay" onClick={() => setScriptMenuOpen(false)} />
          <div className="script-menu">
            <div className="sm-header">Navigation</div>
            {navSections.map(section => (
              <div key={section.label} className="sm-section">
                <div className="sm-section-label">{section.label}</div>
                {section.items.map(item => (
                  <Link
                    key={item.label}
                    to={item.to}
                    className={`sm-item${item.active ? ' active' : ''}`}
                    onClick={() => setScriptMenuOpen(false)}
                  >
                    <span className="sm-icon">{item.icon}</span>
                    <span className="sm-label">{item.label}</span>
                    {(item as any).count && <span className="sm-count">{(item as any).count}</span>}
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function legalFormLabel(lf: string) {
  const map: Record<string, string> = {
    gmbh: 'GmbH', ag: 'AG', ug: 'UG (haftungsbeschränkt)',
    gbr: 'GbR', kg: 'KG', ohg: 'OHG', einzelunternehmen: 'Einzelunternehmen',
  }
  return map[lf] || lf.toUpperCase()
}

function CompanyMenuItem({ icon, label, description, hasArrow }: {
  icon: ReactNode; label: string; description: string; hasArrow?: boolean
}) {
  return (
    <div className="cm-item disabled">
      <span className="cm-item-icon">{icon}</span>
      <span className="cm-item-body">
        <span className="cm-item-label">{label}</span>
        <span className="cm-item-desc">{description}</span>
      </span>
      <span className="cm-bald">Bald</span>
      {hasArrow && <ChevronRight size={12} className="cm-arrow" />}
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
