import { useState, useEffect } from 'react'
import { ChevronDown, ChevronRight, AlertTriangle, X } from 'lucide-react'
import { api } from '../api/client'

interface Props {
  produktionId: string
  open: boolean
  onClose: () => void
}

const STATUS_LABEL: Record<string, string> = {
  aktiv: 'Aktiv',
  ruhend: 'Ruhend',
  beendet: 'Beendet',
}

export default function StoryRadarPanel({ produktionId, open, onClose }: Props) {
  const [radar, setRadar] = useState<any[]>([])
  const [pacing, setPacing] = useState<any | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !produktionId) return
    setLoading(true)
    Promise.all([
      api.getStrangRadar(produktionId),
      api.getStrangPacing(produktionId),
    ]).then(([r, p]) => {
      setRadar(r)
      setPacing(p)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [open, produktionId])

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  if (!open) return null

  const warnings = pacing?.warnungen ?? []

  return (
    <div className="story-radar-panel">
      <div className="story-radar-head">
        <span style={{ fontWeight: 700, fontSize: 13 }}>Story-Radar</span>
        <button className="iconbtn" onClick={onClose}><X size={14} /></button>
      </div>

      {loading && <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 12 }}>Lade...</div>}

      {/* Pacing warnings */}
      {warnings.length > 0 && (
        <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--sw-warning)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            <AlertTriangle size={10} style={{ marginRight: 4, verticalAlign: 'middle' }} />
            Pacing-Hinweise ({warnings.length})
          </div>
          {warnings.slice(0, 8).map((w: any, i: number) => (
            <div key={i} style={{ fontSize: 11, color: 'var(--text-secondary)', padding: '3px 0', lineHeight: 1.4, display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: w.schwere === 'hoch' ? '#FF3B30' : w.schwere === 'mittel' ? '#FF9500' : '#FFCC00', flexShrink: 0, marginTop: 3 }} />
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: w.farbe || '#888', flexShrink: 0 }} />
              <span><strong>{w.strang_name}</strong>: {w.nachricht}</span>
            </div>
          ))}
          {warnings.length > 8 && (
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>+{warnings.length - 8} weitere</div>
          )}
        </div>
      )}

      {/* Per-strand cards */}
      <div style={{ overflow: 'auto', flex: 1 }}>
        {radar.map((entry: any) => {
          const isOpen = expanded.has(entry.strang.id)
          return (
            <div key={entry.strang.id} style={{ borderBottom: '1px solid var(--border)' }}>
              <div
                style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                onClick={() => toggle(entry.strang.id)}
              >
                {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: entry.strang.farbe, flexShrink: 0 }} />
                <span style={{ fontWeight: 600, fontSize: 12, flex: 1 }}>{entry.strang.name}</span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', padding: '1px 6px', background: 'var(--bg-subtle)', borderRadius: 4 }}>
                  {STATUS_LABEL[entry.strang.status] || entry.strang.status}
                </span>
              </div>
              {isOpen && (
                <div style={{ padding: '4px 12px 10px 32px', fontSize: 11, color: 'var(--text-secondary)' }}>
                  {entry.strang.untertitel && (
                    <div style={{ marginBottom: 4, fontStyle: 'italic' }}>{entry.strang.untertitel}</div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 16px', marginBottom: 6 }}>
                    <span>Szenen: <strong>{entry.scene_count}</strong></span>
                    <span>Beats: <strong>{entry.beat_count}</strong></span>
                    <span>Offen: <strong>{entry.open_beat_count}</strong></span>
                    <span>Charaktere: <strong>{entry.characters?.length ?? 0}</strong></span>
                  </div>
                  {entry.characters?.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                      {entry.characters.map((c: any) => (
                        <span key={c.character_id} style={{ fontSize: 10, background: 'var(--bg-subtle)', padding: '1px 6px', borderRadius: 4 }}>
                          {c.character_name}
                        </span>
                      ))}
                    </div>
                  )}
                  {entry.beats?.length > 0 && (
                    <div style={{ marginTop: 4 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, marginBottom: 3, color: 'var(--text-muted)' }}>Offene Beats:</div>
                      {entry.beats.filter((b: any) => !b.abgearbeitet).slice(0, 5).map((b: any) => (
                        <div key={b.id} style={{ fontSize: 11, padding: '2px 0', display: 'flex', gap: 6, alignItems: 'baseline' }}>
                          <span style={{ color: 'var(--text-muted)' }}>{b.ebene === 'future' ? 'F' : b.ebene === 'block' ? 'B' : 'S'}</span>
                          <span>{b.titel}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
        {!loading && radar.length === 0 && (
          <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>
            Noch keine Str\u00e4nge angelegt.
          </div>
        )}
      </div>
    </div>
  )
}
