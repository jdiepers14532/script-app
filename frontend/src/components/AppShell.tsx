import { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, FileText, Image, Camera, Calendar,
  Users, Lock, MessageSquare, Settings, Bell, ChevronRight
} from 'lucide-react'

interface AppShellProps {
  children: ReactNode
  stage?: 'expose' | 'treatment' | 'drehbuch' | 'final'
}

const STAGE_LABELS: Record<string, string> = {
  expose: 'Exposé',
  treatment: 'Treatment',
  drehbuch: 'Drehbuch',
  final: 'Final',
}

const BLOCKS = [
  { id: '025', label: 'Block 025' },
  { id: '026', label: 'Block 026' },
  { id: '027', label: 'Block 027' },
  { id: '028', label: 'Block 028', active: true },
  { id: '029', label: 'Block 029' },
  { id: '030', label: 'Block 030' },
]

export default function AppShell({ children, stage = 'drehbuch' }: AppShellProps) {
  const location = useLocation()

  return (
    <div className="app-shell">
      {/* Topbar */}
      <header className="app-topbar">
        <Link to="/" className="topbar-brand">
          <div className="topbar-brand-square">S</div>
          <span className="topbar-brand-name">script</span>
        </Link>
        <span style={{ fontSize: 11, color: 'var(--c-text-4)', background: 'var(--c-surface)', padding: '2px 8px', borderRadius: 'var(--r-full)', border: '1px solid var(--c-border)' }}>
          serienwerft.studio
        </span>

        <div className="topbar-divider" />

        <nav className="topbar-breadcrumb">
          <span className="crumb">Rote Rosen</span>
          <ChevronRight size={12} />
          <span className="crumb">Block 028</span>
          <ChevronRight size={12} />
          <span className="crumb">Folge 4512</span>
          <ChevronRight size={12} />
          <span className={`stage-chip stage-${stage}`}>
            {STAGE_LABELS[stage]}
          </span>
        </nav>

        <div className="topbar-spacer" />

        <div className="online-pill">
          <span className="online-dot" />
          Online · Sync vor 12 s
        </div>

        <button className="btn-icon" style={{ border: 'none', background: 'transparent', color: 'var(--c-text-3)' }}>
          <Bell size={18} />
        </button>

        <div className="avatar" title="Jan Diepers">JD</div>
      </header>

      {/* Sidebar */}
      <aside className="app-sidebar">
        <div className="sidebar-section">
          <div className="sidebar-section-label">Projekt</div>
          <SidebarItem to="/" icon={<LayoutDashboard size={15} />} label="Dashboard" active={false} />
          <SidebarItem to="/" icon={<FileText size={15} />} label="Drehbuch" count={417} active={location.pathname === '/'} />
          <SidebarItem to="/" icon={<Image size={15} />} label="Bilder" count={417} active={false} />
          <SidebarItem to="/" icon={<Camera size={15} />} label="Shots" count={2184} active={false} />
          <SidebarItem to="/" icon={<Calendar size={15} />} label="Drehplan" active={false} />
          <SidebarItem to="/" icon={<Users size={15} />} label="Rollen & Cast" active={false} />
        </div>

        <div className="divider" style={{ margin: '0 12px' }} />

        <div className="sidebar-section">
          <div className="sidebar-section-label">Autor</div>
          <SidebarItem to="/" icon={<FileText size={15} />} label="Meine Szenen" count={7} active={false} />
          <SidebarItem to="/" icon={<Lock size={15} />} label="Meine Locks" count={3} active={false} />
          <SidebarItem to="/" icon={<MessageSquare size={15} />} label="Kommentare" count={12} active={false} />
        </div>

        <div className="divider" style={{ margin: '0 12px' }} />

        <div className="sidebar-section">
          <div className="sidebar-section-label">Blöcke</div>
          {BLOCKS.map(block => (
            <div
              key={block.id}
              className={`sidebar-block-item${block.active ? ' active' : ''}`}
            >
              <span className="sidebar-block-dot" />
              {block.label}
            </div>
          ))}
        </div>

        <div className="divider" style={{ margin: '0 12px' }} />

        <div className="sidebar-section">
          <div className="sidebar-section-label">Verwaltung</div>
          <SidebarItem to="/admin" icon={<Settings size={15} />} label="Einstellungen" active={location.pathname === '/admin'} />
        </div>
      </aside>

      {/* Main Content */}
      <main className="app-main">
        {children}
      </main>
    </div>
  )
}

function SidebarItem({
  to,
  icon,
  label,
  count,
  active,
}: {
  to: string
  icon: ReactNode
  label: string
  count?: number
  active: boolean
}) {
  return (
    <Link to={to} className={`sidebar-item${active ? ' active' : ''}`}>
      <span className="sidebar-item-icon">{icon}</span>
      <span>{label}</span>
      {count !== undefined && <span className="sidebar-item-count">{count.toLocaleString()}</span>}
    </Link>
  )
}
