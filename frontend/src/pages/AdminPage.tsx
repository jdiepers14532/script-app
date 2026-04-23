import { useState } from 'react'
import AppShell from '../components/AppShell'
import AdminKI from '../components/AdminKI'

const ADMIN_TABS = [
  { id: 'allgemein', label: 'Allgemein' },
  { id: 'ki', label: 'KI-Konfiguration' },
  { id: 'export', label: 'Export-Vorlagen' },
  { id: 'locks', label: 'Lock-Regeln' },
  { id: 'users', label: 'Benutzer & Rollen' },
  { id: 'audit', label: 'Audit-Log' },
]

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState('ki')

  return (
    <AppShell>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}>
        {/* Admin Header */}
        <div style={{
          padding: '14px 32px 0',
          borderBottom: '1px solid var(--c-line)',
          background: 'var(--c-paper)',
          flexShrink: 0,
        }}>
          <h2 style={{
            fontSize: 16, fontWeight: 600,
            marginBottom: 12, color: 'var(--c-text)',
          }}>
            Einstellungen
          </h2>
          {/* Tabs — text-link style */}
          <div style={{ display: 'flex', gap: 0 }}>
            {ADMIN_TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '7px 14px',
                  fontSize: 13,
                  fontWeight: activeTab === tab.id ? 500 : 400,
                  color: activeTab === tab.id ? 'var(--c-text)' : 'var(--c-text-3)',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: `2px solid ${activeTab === tab.id ? 'var(--c-ink)' : 'transparent'}`,
                  cursor: 'pointer',
                  transition: 'color var(--t-fast)',
                  fontFamily: 'var(--font-sans)',
                  marginBottom: -1,
                }}
                onMouseEnter={e => { if (activeTab !== tab.id) e.currentTarget.style.color = 'var(--c-text-2)' }}
                onMouseLeave={e => { if (activeTab !== tab.id) e.currentTarget.style.color = 'var(--c-text-3)' }}
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
