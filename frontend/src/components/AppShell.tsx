import { ReactNode, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { LayoutDashboard, FileText, Settings, Minimize2, Maximize2 } from 'lucide-react'
import { useFocus } from '../App'

interface AppShellProps {
  children: ReactNode
}

export default function AppShell({ children }: AppShellProps) {
  const location = useLocation()
  const [sidebarExpanded, setSidebarExpanded] = useState(false)
  const { focus, toggle } = useFocus()

  return (
    <div className={`app-shell${sidebarExpanded ? ' sidebar-expanded' : ''}`}>
      {/* Topbar */}
      <header className="app-topbar">
        <Link to="/" className="topbar-brand">
          <div className="topbar-brand-square">S</div>
          <span className="topbar-brand-name">script</span>
        </Link>

        {/* Normal mode: divider + breadcrumb with stage chip */}
        {!focus && (
          <>
            <span className="topbar-sep topbar-extra">·</span>
            <span className="topbar-breadcrumb">Rote Rosen · Block 028 · Folge 4512</span>
            <span className="stage-chip stage-drehbuch topbar-extra">Drehbuch</span>
          </>
        )}

        {/* Focus mode: dot separator + breadcrumb */}
        {focus && (
          <>
            <span className="topbar-sep">·</span>
            <span className="topbar-breadcrumb">Rote Rosen · Block 028 · Folge 4512</span>
          </>
        )}

        <div className="topbar-spacer" />

        {/* Normal mode extras */}
        {!focus && (
          <>
            <div className="online-pill topbar-extra">
              <span className="online-dot" />
              <span className="online-text">Online · Sync vor 12s</span>
            </div>
            <button className="btn-icon topbar-extra" title="Benachrichtigungen">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
            </button>
          </>
        )}

        {/* Focus mode: only green dot */}
        {focus && (
          <span className="online-dot" title="Online" />
        )}

        {/* Focus toggle button — always visible */}
        <button
          className="focus-toggle"
          onClick={toggle}
          title="Fokus-Modus (F10)"
          aria-label={focus ? 'Fokus-Modus beenden' : 'Fokus-Modus aktivieren'}
        >
          {focus ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
        </button>

        <div className="avatar" title="Jan Diepers">JD</div>
      </header>

      {/* Sidebar — collapsed 40px (focus), hover to 200px (normal) */}
      <aside
        className={`app-sidebar${sidebarExpanded ? ' expanded' : ''}`}
        onMouseEnter={() => !focus && setSidebarExpanded(true)}
        onMouseLeave={() => setSidebarExpanded(false)}
      >
        <SidebarNavItem
          to="/"
          icon={<LayoutDashboard size={15} />}
          label="Folgen"
          active={location.pathname === '/'}
        />
        <SidebarNavItem
          to="/editor"
          icon={<FileText size={15} />}
          label="Editor"
          active={location.pathname === '/editor'}
        />
        <SidebarNavItem
          to="/admin"
          icon={<Settings size={15} />}
          label="Einstellungen"
          active={location.pathname === '/admin'}
        />
      </aside>

      {/* Main Content */}
      <main className="app-main">
        {children}
      </main>
    </div>
  )
}

function SidebarNavItem({
  to,
  icon,
  label,
  active,
}: {
  to: string
  icon: ReactNode
  label: string
  active: boolean
}) {
  return (
    <Link to={to} className={`sidebar-nav-item sb-item${active ? ' active' : ''}`}>
      <span className="sidebar-icon">{icon}</span>
      <span className="sidebar-label sb-label">{label}</span>
    </Link>
  )
}
