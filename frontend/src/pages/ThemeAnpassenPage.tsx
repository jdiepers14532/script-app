import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import AppShell from '../components/AppShell'
import { DesignTokenEditor } from '../components/DesignTokenEditor'

export default function ThemeAnpassenPage() {
  const navigate = useNavigate()

  return (
    <AppShell>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        {/* Sub-Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 20px', borderBottom: '1px solid var(--border)',
          background: 'var(--bg-surface)', flexShrink: 0,
        }}>
          <button
            onClick={() => navigate(-1)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-secondary)', fontSize: 13, padding: '4px 8px',
              borderRadius: 6, fontFamily: 'inherit',
            }}
          >
            <ArrowLeft size={14} />
            Zurück
          </button>
          <div style={{ width: 1, height: 16, background: 'var(--border)' }} />
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Ansicht</span>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>›</span>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>Theme anpassen</span>
        </div>

        {/* Scrollbarer Inhalt */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <DesignTokenEditor />
        </div>
      </div>
    </AppShell>
  )
}
