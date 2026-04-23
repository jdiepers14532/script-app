import { BREAKDOWN_CATEGORIES } from '../data/scenes'
import { Sparkles } from 'lucide-react'

export default function BreakdownPanel() {
  return (
    <div className="breakdown">
      {/* Header */}
      <div className="bd-head">
        <span className="title">Breakdown · SZ 7</span>
        <span className="spacer" />
        <span className="ai">
          <Sparkles size={10} />
          KI
        </span>
      </div>

      {/* Category rows */}
      <div className="bd-list">
        {BREAKDOWN_CATEGORIES.map(cat => (
          <div className="bd-row" key={cat.id}>
            <div className="dot" style={{ background: cat.color }} />
            <span className="lbl">{cat.name}</span>
            {cat.count > 0 ? (
              <span className={`cnt${cat.count >= 10 ? ' hot' : ''}`}>{cat.count}</span>
            ) : (
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>—</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
