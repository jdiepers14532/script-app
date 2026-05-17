import { useState, useEffect, useCallback } from 'react'
import { Clock, RotateCcw, X, ChevronDown, ChevronUp } from 'lucide-react'
import { api } from '../../api/client'

interface Snapshot {
  id: number
  created_by: string | null
  created_at: string
  content_preview: string | null
}

interface Props {
  szeneId: string
  onRestore: (content: any) => void
  onClose: () => void
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return 'gerade eben'
  const m = Math.floor(s / 60)
  if (m < 60) return `vor ${m} Min.`
  const h = Math.floor(m / 60)
  if (h < 24) return `vor ${h} Std.`
  const d = Math.floor(h / 24)
  if (d < 7) return `vor ${d} Tag${d > 1 ? 'en' : ''}`
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function formatAbsolute(iso: string): string {
  return new Date(iso).toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function SnapshotDrawer({ szeneId, onRestore, onClose }: Props) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [restoring, setRestoring] = useState<number | null>(null)
  const [confirmId, setConfirmId] = useState<number | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await api.getSnapshots(szeneId)
      setSnapshots(Array.isArray(list) ? list : [])
    } catch {
      setSnapshots([])
    } finally {
      setLoading(false)
    }
  }, [szeneId])

  useEffect(() => { load() }, [load])

  const handleRestore = async (snapId: number) => {
    setRestoring(snapId)
    try {
      const full = await api.getSnapshot(szeneId, snapId)
      if (full?.content) {
        onRestore(full.content)
      }
    } catch (err) {
      console.error('Restore failed:', err)
    } finally {
      setRestoring(null)
      setConfirmId(null)
    }
  }

  return (
    <div style={{
      position: 'absolute', top: 0, right: 0, bottom: 0,
      width: 300, zIndex: 200,
      background: 'var(--bg-surface)',
      borderLeft: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      boxShadow: '-4px 0 16px rgba(0,0,0,0.12)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 14px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <Clock size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>Verlauf</span>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px 4px', display: 'flex', alignItems: 'center' }}
        >
          <X size={14} />
        </button>
      </div>

      {/* Info banner */}
      <div style={{
        padding: '8px 14px',
        fontSize: 11,
        color: 'var(--text-muted)',
        borderBottom: '1px solid var(--border)',
        lineHeight: 1.5,
        flexShrink: 0,
        background: 'var(--bg-subtle)',
      }}>
        Auto-Sicherung alle 5 Min. nach einer Änderung. Die letzten 50 Versionen werden gespeichert.
      </div>

      {/* Snapshot list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ padding: 20, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
            Lädt…
          </div>
        ) : snapshots.length === 0 ? (
          <div style={{ padding: 20, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
            Noch keine Sicherungen vorhanden.{'\n'}
            Die erste wird nach 5 Minuten Schreiben angelegt.
          </div>
        ) : (
          snapshots.map((snap, i) => {
            const isExpanded = expandedId === snap.id
            const isConfirming = confirmId === snap.id
            const isRestoring = restoring === snap.id
            const isLatest = i === 0

            // Extract plain text preview from content_preview JSON fragment
            let previewText = ''
            try {
              // content_preview is the first 200 chars of the JSONB text representation
              // We just strip JSON markers to show some readable text
              previewText = (snap.content_preview ?? '')
                .replace(/[{}"\\[\]:]/g, ' ')
                .replace(/\s+/g, ' ')
                .replace(/type paragraph text/gi, '')
                .trim()
                .slice(0, 80)
            } catch { /* ignore */ }

            return (
              <div
                key={snap.id}
                style={{
                  borderBottom: '1px solid var(--border)',
                  background: isLatest ? 'rgba(0,200,83,0.04)' : undefined,
                }}
              >
                {/* Row */}
                <div
                  style={{
                    padding: '10px 14px',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'flex-start', gap: 8,
                  }}
                  onClick={() => setExpandedId(isExpanded ? null : snap.id)}
                >
                  {/* Timeline dot */}
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: isLatest ? '#00C853' : 'var(--border)',
                    marginTop: 4, flexShrink: 0,
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: isLatest ? 600 : 400 }}>
                        {formatRelative(snap.created_at)}
                      </span>
                      {isLatest && (
                        <span style={{
                          fontSize: 9, fontWeight: 700, color: '#00C853',
                          background: 'rgba(0,200,83,0.12)', borderRadius: 3,
                          padding: '1px 5px', letterSpacing: '0.04em', textTransform: 'uppercase',
                        }}>
                          Aktuell
                        </span>
                      )}
                      <div style={{ flex: 1 }} />
                      {isExpanded ? <ChevronUp size={11} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={11} style={{ color: 'var(--text-muted)' }} />}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
                      {formatAbsolute(snap.created_at)}
                    </div>
                    {previewText && !isExpanded && (
                      <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {previewText}
                      </div>
                    )}
                  </div>
                </div>

                {/* Expanded: confirm + restore */}
                {isExpanded && (
                  <div style={{ padding: '0 14px 12px 30px' }}>
                    {previewText && (
                      <div style={{
                        fontSize: 10, color: 'var(--text-muted)', marginBottom: 10,
                        background: 'var(--bg-subtle)', borderRadius: 6, padding: '6px 8px',
                        lineHeight: 1.5,
                      }}>
                        {previewText}…
                      </div>
                    )}
                    {!isConfirming ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); setConfirmId(snap.id) }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 5,
                          padding: '5px 10px', borderRadius: 6,
                          border: '1px solid var(--border)',
                          background: 'transparent', color: 'var(--text-primary)',
                          cursor: 'pointer', fontSize: 11, fontFamily: 'inherit',
                        }}
                      >
                        <RotateCcw size={11} />
                        Wiederherstellen
                      </button>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ fontSize: 11, color: '#FF9500', fontWeight: 500 }}>
                          Aktuellen Inhalt ersetzen?
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleRestore(snap.id) }}
                            disabled={isRestoring}
                            style={{
                              padding: '4px 10px', borderRadius: 5, border: 'none',
                              background: '#FF9500', color: '#fff',
                              cursor: isRestoring ? 'default' : 'pointer',
                              fontSize: 11, fontFamily: 'inherit', fontWeight: 500,
                              opacity: isRestoring ? 0.6 : 1,
                            }}
                          >
                            {isRestoring ? 'Stellt her…' : 'Ja, wiederherstellen'}
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setConfirmId(null) }}
                            style={{
                              padding: '4px 10px', borderRadius: 5,
                              border: '1px solid var(--border)',
                              background: 'transparent', color: 'var(--text-primary)',
                              cursor: 'pointer', fontSize: 11, fontFamily: 'inherit',
                            }}
                          >
                            Abbrechen
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
