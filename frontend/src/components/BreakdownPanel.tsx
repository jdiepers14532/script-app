import { BREAKDOWN_CATEGORIES } from '../data/scenes'
import { ChevronRight } from 'lucide-react'

export default function BreakdownPanel() {
  return (
    <div style={{
      width: 220,
      flexShrink: 0,
      borderLeft: '1px solid var(--c-border)',
      background: 'var(--c-paper)',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 14px 10px',
        borderBottom: '1px solid var(--c-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-text)' }}>Breakdown</span>
        <span style={{ fontSize: 11, color: 'var(--c-text-4)' }}>Szene 7</span>
      </div>

      {/* Categories */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {BREAKDOWN_CATEGORIES.map(cat => (
          <div
            key={cat.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 14px',
              borderBottom: '1px solid var(--c-border-l)',
              cursor: 'pointer',
              transition: 'background var(--t-fast)',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--c-surface)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            {/* Color Dot */}
            <div style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: cat.color,
              flexShrink: 0,
            }} />

            {/* Name */}
            <span style={{
              fontSize: 12,
              color: cat.count > 0 ? 'var(--c-text)' : 'var(--c-text-4)',
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {cat.name}
            </span>

            {/* Count Badge */}
            {cat.count > 0 ? (
              <span style={{
                fontSize: 11,
                fontWeight: 600,
                padding: '1px 6px',
                borderRadius: 'var(--r-full)',
                background: 'var(--c-surface)',
                color: 'var(--c-text-3)',
                border: '1px solid var(--c-border)',
              }}>
                {cat.count}
              </span>
            ) : (
              <span style={{ fontSize: 10, color: 'var(--c-text-4)' }}>—</span>
            )}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{
        padding: '10px 14px',
        borderTop: '1px solid var(--c-border)',
        display: 'flex',
        gap: 6,
        flexDirection: 'column',
      }}>
        <button className="btn btn-sm" style={{ width: '100%', justifyContent: 'center', gap: 4 }}>
          KI-Vorschläge laden
        </button>
        <button className="btn btn-sm btn-ghost" style={{ width: '100%', justifyContent: 'center', fontSize: 11, color: 'var(--c-text-3)' }}>
          Vollständige Ansicht
          <ChevronRight size={11} />
        </button>
      </div>
    </div>
  )
}
