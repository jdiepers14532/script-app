import { Routes, Route, Navigate, NavLink, useLocation } from 'react-router-dom'
import { Kanban, GanttChart, BookOpen, History, Upload, AlertTriangle, HelpCircle } from 'lucide-react'
import AppShell from '../../components/AppShell'
import { useSelectedProduction } from '../../contexts'
import FutureBoardPage from './FutureBoardPage'
import RollenEinsatzPage from './RollenEinsatzPage'
import BiblePage from './BiblePage'
import VersionenPage from './VersionenPage'
import PlanungsImportPage from './PlanungsImportPage'
import BefundePage from './BefundePage'
import PlanungsHilfePage from './PlanungsHilfePage'

const TABS = [
  { to: 'board',    label: 'Future-Board',     icon: <Kanban size={14} /> },
  { to: 'einsatz',  label: 'Rollen-Einsatz',   icon: <GanttChart size={14} /> },
  { to: 'bible',    label: 'Bible',             icon: <BookOpen size={14} /> },
  { to: 'versionen',label: 'Versionen',         icon: <History size={14} /> },
  { to: 'import',   label: 'Import',            icon: <Upload size={14} /> },
  { to: 'befunde',  label: 'Befunde',           icon: <AlertTriangle size={14} /> },
  { to: 'hilfe',    label: 'Hilfe',             icon: <HelpCircle size={14} /> },
]

export default function PlanungsPage() {
  const { selectedProduction } = useSelectedProduction()
  const location = useLocation()

  return (
    <AppShell hideProductionSelector={false}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

        {/* Sub-Navigation */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 2,
          padding: '0 16px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-surface)',
          flexShrink: 0,
          overflowX: 'auto',
        }}>
          {TABS.map(tab => {
            const fullPath = `/planung/${tab.to}`
            const isActive = location.pathname === fullPath || location.pathname.startsWith(fullPath + '/')
            return (
              <NavLink
                key={tab.to}
                to={fullPath}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '10px 14px',
                  fontSize: 13, fontWeight: isActive ? 600 : 400,
                  color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                  borderBottom: isActive ? '2px solid var(--sw-info)' : '2px solid transparent',
                  textDecoration: 'none',
                  whiteSpace: 'nowrap',
                  transition: 'color 0.15s',
                  marginBottom: -1,
                }}
              >
                {tab.icon}
                {tab.label}
              </NavLink>
            )
          })}
        </div>

        {/* Tab-Inhalt */}
        {!selectedProduction ? (
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-muted)', fontSize: 13,
          }}>
            Bitte eine Produktion auswählen.
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
            <Routes>
              <Route index element={<Navigate to="board" replace />} />
              <Route path="board"     element={<FutureBoardPage />} />
              <Route path="einsatz"   element={<RollenEinsatzPage />} />
              <Route path="bible"     element={<BiblePage />} />
              <Route path="versionen" element={<VersionenPage />} />
              <Route path="import"    element={<PlanungsImportPage />} />
              <Route path="befunde"   element={<BefundePage />} />
              <Route path="hilfe"     element={<PlanungsHilfePage />} />
            </Routes>
          </div>
        )}
      </div>
    </AppShell>
  )
}
