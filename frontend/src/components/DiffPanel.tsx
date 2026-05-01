import { useState, useEffect } from 'react'
import { api } from '../api/client'

interface DiffPanelProps {
  leftFassungId: string
  rightFassungId: string
  onClose: () => void
}

export default function DiffPanel({ leftFassungId, rightFassungId, onClose }: DiffPanelProps) {
  const [diff, setDiff] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    api.diffFassungen(leftFassungId, rightFassungId)
      .then(setDiff)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [leftFassungId, rightFassungId])

  if (loading) return <div style={{ padding: 24, color: 'var(--text-secondary)' }}>Vergleich wird geladen…</div>
  if (error) return <div style={{ padding: 24, color: 'var(--sw-danger)' }}>Fehler: {error}</div>
  if (!diff) return null

  const { left, right, matches } = diff

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', gap: 24, fontSize: 12 }}>
          <span style={{ fontWeight: 600 }}>
            Links: {left.fassung.fassung_label || `Fassung ${left.fassung.fassung_nummer}`}
          </span>
          <span style={{ fontWeight: 600 }}>
            Rechts: {right.fassung.fassung_label || `Fassung ${right.fassung.fassung_nummer}`}
          </span>
        </div>
        <button className="btn ghost" onClick={onClose} style={{ padding: '4px 8px', fontSize: 11 }}>
          Schließen
        </button>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 12, padding: '4px 16px', fontSize: 11, color: 'var(--text-secondary)', flexShrink: 0 }}>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#fef3c7', borderRadius: 2, marginRight: 4 }} />Geändert</span>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#d1fae5', borderRadius: 2, marginRight: 4 }} />Neu</span>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#fee2e2', borderRadius: 2, marginRight: 4 }} />Gestrichen</span>
      </div>

      {/* Side-by-side rows */}
      <div style={{ flex: 1, overflow: 'auto', display: 'flex' }}>
        {/* Left column */}
        <div style={{ flex: 1, borderRight: '1px solid var(--border)', overflow: 'auto' }}>
          {matches.map((m: any, i: number) => {
            const scene = m.left_idx != null ? left.szenen[m.left_idx] : null
            const bg = m.changes.includes('gestrichen')
              ? undefined
              : m.changes.includes('neu')
                ? undefined
                : m.changes.length > 0
                  ? '#fef3c7'
                  : undefined

            if (!scene) {
              return (
                <div key={i} style={{ padding: '8px 12px', minHeight: 40, background: '#d1fae5', borderBottom: '1px solid var(--border)', opacity: 0.4 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>— Szene nicht vorhanden —</span>
                </div>
              )
            }

            return (
              <div key={i} style={{ padding: '8px 12px', background: bg, borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontWeight: 600, fontSize: 12 }}>
                  {scene.scene_nummer}{scene.scene_nummer_suffix || ''}.{' '}
                  {scene.int_ext}. {scene.ort_name} - {scene.tageszeit}
                </div>
                {scene.zusammenfassung && (
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{scene.zusammenfassung}</div>
                )}
                {m.changes.includes('gestrichen') && (
                  <div style={{ fontSize: 10, color: 'var(--sw-danger)', marginTop: 4 }}>In rechter Fassung gestrichen</div>
                )}
              </div>
            )
          })}
        </div>

        {/* Right column */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {matches.map((m: any, i: number) => {
            const scene = m.right_idx != null ? right.szenen[m.right_idx] : null
            const bg = m.changes.includes('neu')
              ? '#d1fae5'
              : m.changes.includes('gestrichen')
                ? undefined
                : m.changes.length > 0
                  ? '#fef3c7'
                  : undefined

            if (!scene) {
              return (
                <div key={i} style={{ padding: '8px 12px', minHeight: 40, background: '#fee2e2', borderBottom: '1px solid var(--border)', opacity: 0.4 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>— Szene gestrichen —</span>
                </div>
              )
            }

            return (
              <div key={i} style={{ padding: '8px 12px', background: bg, borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontWeight: 600, fontSize: 12 }}>
                  {scene.scene_nummer}{scene.scene_nummer_suffix || ''}.{' '}
                  {scene.int_ext}. {scene.ort_name} - {scene.tageszeit}
                </div>
                {scene.zusammenfassung && (
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{scene.zusammenfassung}</div>
                )}
                {m.changes.includes('neu') && (
                  <div style={{ fontSize: 10, color: 'var(--sw-green)', marginTop: 4 }}>Neue Szene</div>
                )}
                {m.changes.length > 0 && !m.changes.includes('neu') && !m.changes.includes('gestrichen') && (
                  <div style={{ fontSize: 10, color: 'var(--sw-warning)', marginTop: 4 }}>
                    Geändert: {m.changes.join(', ')}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
