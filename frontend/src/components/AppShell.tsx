import { ReactNode, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { LayoutDashboard, FileText, Settings } from 'lucide-react'

interface AppShellProps {
  children: ReactNode
}

export default function AppShell({ children }: AppShellProps) {
  const location = useLocation()
  const [sidebarExpanded, setSidebarExpanded] = useState(false)

  return (
    <div className={`app-shell${sidebarExpanded ? ' sidebar-expanded' : ''}`}>
      {/* Topbar — 44px, minimal */}
      <header className="app-topbar">
        <Link to="/" className="topbar-brand">
          <div className="topbar-brand-square">S</div>
          <span className="topbar-brand-name">script</span>
        </Link>
        <span className="topbar-sep">·</span>
        <span className="topbar-breadcrumb">Rote Rosen · Block 028 · Folge 4512</span>

        <div className="topbar-spacer" />

        <span className="online-dot" title="Online" />
        <div className="avatar" title="Jan Diepers">JD</div>
      </header>

      {/* Sidebar — collapsed 40px, hover to 200px */}
      <aside
        className={`app-sidebar${sidebarExpanded ? ' expanded' : ''}`}
        onMouseEnter={() => setSidebarExpanded(true)}
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
    <Link to={to} className={`sidebar-nav-item${active ? ' active' : ''}`}>
      <span className="sidebar-icon">{icon}</span>
      <span className="sidebar-label">{label}</span>
    </Link>
  )
}
