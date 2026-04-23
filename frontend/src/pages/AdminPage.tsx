import AppShell from '../components/AppShell'
import AdminKI from '../components/AdminKI'

const ADMIN_TABS = [
  { id: 'allgemein', label: 'Allgemein' },
  { id: 'ki', label: 'KI-Konfiguration', active: true },
  { id: 'export', label: 'Export-Vorlagen' },
  { id: 'locks', label: 'Lock-Regeln' },
  { id: 'users', label: 'Benutzer & Rollen' },
  { id: 'audit', label: 'Audit-Log' },
]

export default function AdminPage() {
  return (
    <AppShell stage="drehbuch">
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}>
        {/* Admin Header */}
        <div style={{
          padding: '16px 32px 0',
          borderBottom: '1px solid var(--c-border)',
          background: 'var(--c-paper)',
          flexShrink: 0,
        }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12, color: 'var(--c-text)' }}>
            Einstellungen
          </h2>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 0 }}>
            {ADMIN_TABS.map(tab => (
              <button
                key={tab.id}
                style={{
                  padding: '8px 16px',
                  fontSize: 13,
                  fontWeight: tab.active ? 600 : 400,
                  color: tab.active ? 'var(--c-text)' : 'var(--c-text-4)',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: `2px solid ${tab.active ? 'var(--c-ink)' : 'transparent'}`,
                  cursor: 'pointer',
                  transition: 'color var(--t-fast)',
                  fontFamily: 'var(--font-sans)',
                  marginBottom: -1,
                }}
                onMouseEnter={e => { if (!tab.active) e.currentTarget.style.color = 'var(--c-text-2)' }}
                onMouseLeave={e => { if (!tab.active) e.currentTarget.style.color = 'var(--c-text-4)' }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <AdminKI />
      </div>
    </AppShell>
  )
}
