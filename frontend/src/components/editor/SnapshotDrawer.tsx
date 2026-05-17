import { useState, useEffect, useCallback } from 'react'
import { Clock, RotateCcw, X, ChevronDown, ChevronUp, AlertTriangle, Shield } from 'lucide-react'
import { api } from '../../api/client'
import { useTweaks } from '../../contexts'

interface Snapshot {
  id: number
  created_by: string | null
  created_by_name: string | null
  created_at: string
  szene_nummer: string | null
  szene_info: string | null
  text_preview: string | null
  is_current: boolean
}

interface Props {
  szeneId: string
  szeneNummer?: string | null
  szeneInfo?: string | null
  sceneUpdatedAt?: string | null   // for conflict detection
  sceneUpdatedBy?: string | null   // name of last editor (for conflict warning)
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

export default function SnapshotDrawer({
  szeneId, szeneNummer, szeneInfo, sceneUpdatedAt, sceneUpdatedBy,
  onRestore, onClose,
}: Props) {
  const { tweaks } = useTweaks()
  const isDark = tweaks.theme === 'dark'

  // Inverted color scheme: dark drawer in light mode, light drawer in dark mode
  const INV = isDark ? {
    bg:      '#f4f4f5',
    bg2:     '#e4e4e7',
    bg3:     '#d4d4d8',
    text:    '#18181b',
    muted:   '#52525b',
    border:  '#d4d4d8',
    green:   '#16a34a',
    orange:  '#c2410c',
    red:     '#dc2626',
    cyan:    '#0891b2',
    shadow:  'rgba(0,0,0,0.08)',
  } : {
    bg:      '#18181b',
    bg2:     '#27272a',
    bg3:     '#3f3f46',
    text:    '#f4f4f5',
    muted:   '#a1a1aa',
    border:  '#3f3f46',
    green:   '#4ade80',
    orange:  '#fb923c',
    red:     '#f87171',
    cyan:    '#22d3ee',
    shadow:  'rgba(0,0,0,0.4)',
  }

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

  /** Conflict: scene was edited AFTER this snapshot by someone ELSE */
  const hasConflict = (snap: Snapshot): boolean => {
    if (!sceneUpdatedAt || !sceneUpdatedBy) return false
    const sceneTs = new Date(sceneUpdatedAt).getTime()
    const snapTs = new Date(snap.created_at).getTime()
    return sceneTs > snapTs && sceneUpdatedBy !== snap.created_by_name
  }

  const handleRestore = async (snapId: number) => {
    setRestoring(snapId)
    try {
      const full = await api.getSnapshot(szeneId, snapId)
      if (full?.content) onRestore(full.content)
    } catch (err) {
      console.error('Restore fehlgeschlagen:', err)
    } finally {
      setRestoring(null)
      setConfirmId(null)
    }
  }

  const headerLabel = szeneNummer
    ? `Sz. ${szeneNummer}${szeneInfo ? ` — ${szeneInfo}` : ''}`
    : 'Verlauf'

  return (
    <div style={{
      position: 'absolute', top: 0, right: 0, bottom: 0,
      width: 308, zIndex: 200,
      background: INV.bg,
      borderLeft: `1px solid ${INV.border}`,
      display: 'flex', flexDirection: 'column',
      boxShadow: `-6px 0 24px ${INV.shadow}`,
      color: INV.text,
    }}>

      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '11px 14px',
        borderBottom: `1px solid ${INV.border}`,
        flexShrink: 0,
      }}>
        <Clock size={14} style={{ color: INV.muted, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.2 }}>Verlauf</div>
          {szeneNummer && (
            <div style={{ fontSize: 10, color: INV.muted, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {headerLabel}
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: INV.muted, padding: '3px', display: 'flex', alignItems: 'center', borderRadius: 4 }}
        >
          <X size={14} />
        </button>
      </div>

      {/* ── Scope info banner ── */}
      <div style={{
        padding: '8px 14px',
        fontSize: 11, lineHeight: 1.5,
        borderBottom: `1px solid ${INV.border}`,
        background: INV.bg2,
        flexShrink: 0,
        display: 'flex', alignItems: 'flex-start', gap: 7,
      }}>
        <Shield size={12} style={{ color: INV.green, flexShrink: 0, marginTop: 1 }} />
        <div>
          <span style={{ color: INV.green, fontWeight: 600 }}>Nur diese Szene</span>
          <span style={{ color: INV.muted }}> — andere Szenen bleiben unverändert. Automatische Sicherung alle 5 Min. · max. 50 Einträge.</span>
        </div>
      </div>

      {/* ── Snapshot list ── */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ padding: 24, fontSize: 12, color: INV.muted, textAlign: 'center' }}>
            Lädt…
          </div>
        ) : snapshots.length === 0 ? (
          <div style={{ padding: 24, fontSize: 12, color: INV.muted, textAlign: 'center', lineHeight: 1.6 }}>
            Noch keine Sicherungen vorhanden.<br />
            Die erste wird nach 5 Minuten Schreiben angelegt.
          </div>
        ) : (
          snapshots.map((snap, i) => {
            const isExpanded = expandedId === snap.id
            const isConfirming = confirmId === snap.id
            const isRestoring = restoring === snap.id
            const isCurrent = snap.is_current
            const anyIsCurrent = snapshots.some(s => s.is_current)
            const isLatest = i === 0 && !anyIsCurrent
            const conflict = hasConflict(snap)
            const authorName = snap.created_by_name || '—'

            return (
              <div
                key={snap.id}
                style={{
                  borderBottom: `1px solid ${INV.border}`,
                  background: isCurrent ? `${INV.cyan}15` : isLatest ? `${INV.green}12` : undefined,
                }}
              >
                {/* ── Collapsed row ── */}
                <div
                  style={{ padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 8 }}
                  onClick={() => setExpandedId(isExpanded ? null : snap.id)}
                >
                  {/* Timeline dot */}
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%', marginTop: 4, flexShrink: 0,
                    background: isCurrent ? INV.cyan : isLatest ? INV.green : conflict ? INV.orange : INV.bg3,
                    boxShadow: conflict ? `0 0 0 2px ${INV.orange}44` : undefined,
                  }} />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Top row: time + badges */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, fontWeight: (isLatest || isCurrent) ? 700 : 500, color: INV.text }}>
                        {formatRelative(snap.created_at)}
                      </span>
                      {isLatest && (
                        <span style={{
                          fontSize: 9, fontWeight: 700, color: INV.green,
                          background: `${INV.green}20`, borderRadius: 3,
                          padding: '1px 5px', letterSpacing: '0.04em', textTransform: 'uppercase',
                        }}>Aktuell</span>
                      )}
                      {isCurrent && (
                        <span style={{
                          fontSize: 9, fontWeight: 700, color: INV.cyan,
                          background: `${INV.cyan}20`, borderRadius: 3,
                          padding: '1px 5px', letterSpacing: '0.04em', textTransform: 'uppercase',
                        }}>Aktueller Stand</span>
                      )}
                      {conflict && (
                        <span style={{
                          fontSize: 9, fontWeight: 700, color: INV.orange,
                          background: `${INV.orange}20`, borderRadius: 3,
                          padding: '1px 5px', letterSpacing: '0.04em', textTransform: 'uppercase',
                          display: 'flex', alignItems: 'center', gap: 3,
                        }}>
                          <AlertTriangle size={8} /> Fremde Änderung
                        </span>
                      )}
                      <div style={{ flex: 1 }} />
                      {isExpanded
                        ? <ChevronUp size={11} style={{ color: INV.muted }} />
                        : <ChevronDown size={11} style={{ color: INV.muted }} />}
                    </div>

                    {/* Author + time */}
                    <div style={{ fontSize: 10, color: INV.muted, marginTop: 2 }}>
                      {authorName} · {formatAbsolute(snap.created_at)}
                    </div>

                    {/* Text preview (collapsed) */}
                    {snap.text_preview && !isExpanded && (
                      <div style={{
                        fontSize: 10, color: INV.muted, marginTop: 3,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        fontStyle: 'italic',
                      }}>
                        „{snap.text_preview}"
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Expanded ── */}
                {isExpanded && (
                  <div style={{ padding: '0 14px 14px 30px' }}>

                    {/* Text preview (expanded) */}
                    {snap.text_preview && (
                      <div style={{
                        fontSize: 11, color: INV.muted, marginBottom: 12,
                        background: INV.bg2, borderRadius: 6, padding: '7px 10px',
                        lineHeight: 1.6, fontStyle: 'italic',
                        borderLeft: `3px solid ${INV.bg3}`,
                      }}>
                        „{snap.text_preview}…"
                      </div>
                    )}

                    {/* Conflict warning */}
                    {conflict && (
                      <div style={{
                        background: `${INV.orange}15`,
                        border: `1px solid ${INV.orange}44`,
                        borderRadius: 6, padding: '8px 10px',
                        marginBottom: 12, fontSize: 11, lineHeight: 1.5,
                        display: 'flex', gap: 7, alignItems: 'flex-start',
                      }}>
                        <AlertTriangle size={12} style={{ color: INV.orange, flexShrink: 0, marginTop: 1 }} />
                        <div style={{ color: INV.text }}>
                          <strong style={{ color: INV.orange }}>Achtung:</strong>{' '}
                          <strong>{sceneUpdatedBy}</strong> hat diese Szene nach dieser Sicherung bearbeitet.
                          Wiederherstellen überschreibt diese Änderungen.
                        </div>
                      </div>
                    )}

                    {/* Restore button / confirm */}
                    {!isConfirming ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); setConfirmId(snap.id) }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: '6px 12px', borderRadius: 6,
                          border: `1px solid ${INV.border}`,
                          background: INV.bg2, color: INV.text,
                          cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', fontWeight: 500,
                        }}
                      >
                        <RotateCcw size={11} />
                        Auf diesen Stand zurückgehen
                      </button>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: conflict ? INV.orange : INV.text }}>
                          {conflict
                            ? `Änderungen von ${sceneUpdatedBy} werden überschrieben. Trotzdem?`
                            : 'Aktuellen Inhalt durch diesen Stand ersetzen?'}
                        </div>
                        <div style={{ display: 'flex', gap: 7 }}>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleRestore(snap.id) }}
                            disabled={isRestoring}
                            style={{
                              padding: '5px 12px', borderRadius: 5, border: 'none',
                              background: conflict ? INV.orange : INV.green,
                              color: isDark ? '#fff' : '#fff',
                              cursor: isRestoring ? 'default' : 'pointer',
                              fontSize: 12, fontFamily: 'inherit', fontWeight: 600,
                              opacity: isRestoring ? 0.6 : 1,
                            }}
                          >
                            {isRestoring ? 'Stellt her…' : 'Ja, wiederherstellen'}
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setConfirmId(null) }}
                            style={{
                              padding: '5px 12px', borderRadius: 5,
                              border: `1px solid ${INV.border}`,
                              background: 'transparent', color: INV.text,
                              cursor: 'pointer', fontSize: 12, fontFamily: 'inherit',
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

      {/* ── Footer: legend ── */}
      <div style={{
        padding: '8px 14px',
        borderTop: `1px solid ${INV.border}`,
        flexShrink: 0,
        display: 'flex', gap: 12, fontSize: 10, color: INV.muted,
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: INV.green, display: 'inline-block' }} />
          Aktuellste
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <AlertTriangle size={9} style={{ color: INV.orange }} />
          Fremde Änderung danach
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: INV.cyan, display: 'inline-block' }} />
          Aktueller Stand
        </span>
      </div>
    </div>
  )
}
