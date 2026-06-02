import { useEffect, useState, useCallback } from 'react'
import { Sparkles, X, Check, Loader2, AlertCircle, ChevronRight } from 'lucide-react'
import { api } from '../../api/client'

export type RunTyp = 'storyline_abgleich' | 'beziehungs_check'

interface AbweichungItem {
  strang_name?: string
  charakter_a?: string
  charakter_b?: string
  typ?: string
  beschreibung: string
  quellentext?: string
  _accepted: boolean
}

const TYP_LABELS: Record<string, { label: string; color: string }> = {
  fehlt_in_future:     { label: 'Fehlt im Future', color: '#FF9500' },
  fehlt_in_storyline:  { label: 'Fehlt in Storyline', color: '#007AFF' },
  widerspruch:         { label: 'Widerspruch', color: '#FF3B30' },
}

const RUN_TYP_INFO: Record<RunTyp, { title: string; emptyHint: string }> = {
  storyline_abgleich: {
    title: 'Storyline ↔ Future-Abgleich',
    emptyHint: 'Keine Abweichungen gefunden — Storyline und Future sind konsistent.',
  },
  beziehungs_check: {
    title: 'Beziehungswiderspruch-Check',
    emptyHint: 'Keine Widersprüche gefunden — Szenentext stimmt mit der Bible überein.',
  },
}

export default function PlanungsKiRunModal({
  runId,
  runTyp,
  onClose,
  onCommitted,
}: {
  runId: string
  runTyp: RunTyp
  onClose: () => void
  onCommitted: (count: number) => void
}) {
  const [status, setStatus] = useState<'queued' | 'running' | 'done' | 'error'>('queued')
  const [items, setItems] = useState<AbweichungItem[]>([])
  const [hinweis, setHinweis] = useState('')
  const [fehler, setFehler] = useState('')
  const [committing, setCommitting] = useState(false)

  const poll = useCallback(async () => {
    try {
      const run = await api.getPlanungRun(runId)
      setStatus(run.status)

      if (run.status === 'done' && run.ergebnis_json) {
        const e = run.ergebnis_json
        const rawItems: any[] =
          e.abweichungen ?? e.widersprueche ?? []
        setItems(rawItems.map((it: any) => ({ ...it, _accepted: true })))
        setHinweis(e.hinweis || '')
      }
      if (run.status === 'error') {
        setFehler(run.fehler || 'Unbekannter Fehler')
      }
    } catch {
      // Polling-Fehler ignorieren, nächster Versuch
    }
  }, [runId])

  useEffect(() => {
    poll()
    const interval = setInterval(() => {
      if (status === 'done' || status === 'error') {
        clearInterval(interval)
        return
      }
      poll()
    }, 2000)
    return () => clearInterval(interval)
  }, [poll, status])

  function toggleItem(idx: number) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, _accepted: !it._accepted } : it))
  }

  async function handleCommit() {
    const accepted = items
      .filter(it => it._accepted)
      .map(it => ({
        beschreibung: it.beschreibung,
        typ: it.typ,
      }))
    if (accepted.length === 0) { onClose(); return }

    setCommitting(true)
    try {
      const result = await api.commitPlanungBefunde(runId, accepted)
      onCommitted(result.created)
    } finally {
      setCommitting(false)
    }
  }

  const info = RUN_TYP_INFO[runTyp]
  const acceptedCount = items.filter(it => it._accepted).length

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 9100,
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        width: 660, maxWidth: '96vw', maxHeight: '88vh',
        background: 'var(--bg-surface)', borderRadius: 12,
        boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>

        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
        }}>
          <Sparkles size={18} style={{ color: '#007AFF' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{info.title}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
              {status === 'queued' && 'Warte auf Start…'}
              {status === 'running' && 'KI analysiert…'}
              {status === 'done' && `${items.length} Einträge gefunden`}
              {status === 'error' && 'Fehler aufgetreten'}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, display: 'flex' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {(status === 'queued' || status === 'running') && (
            <div style={{
              padding: 60, display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 16, color: 'var(--text-muted)',
            }}>
              <Loader2 size={32} style={{ animation: 'spin 0.8s linear infinite', color: '#007AFF' }} />
              <div style={{ fontSize: 13 }}>
                {status === 'queued' ? 'Analyse wird vorbereitet…' : 'KI analysiert Dokumente…'}
              </div>
              <div style={{ fontSize: 11, opacity: 0.6 }}>Das kann 10–30 Sekunden dauern.</div>
            </div>
          )}

          {status === 'error' && (
            <div style={{
              padding: 40, textAlign: 'center', color: '#FF3B30',
            }}>
              <AlertCircle size={32} style={{ marginBottom: 12 }} />
              <div style={{ fontSize: 13 }}>{fehler}</div>
            </div>
          )}

          {status === 'done' && items.length === 0 && (
            <div style={{
              padding: 48, textAlign: 'center', color: 'var(--text-muted)',
            }}>
              <Check size={36} style={{ color: '#00C853', marginBottom: 12 }} />
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
                {info.emptyHint}
              </div>
              {hinweis && (
                <div style={{ fontSize: 12, opacity: 0.7 }}>{hinweis}</div>
              )}
            </div>
          )}

          {status === 'done' && items.length > 0 && (
            <>
              {/* Status-Leiste */}
              <div style={{
                padding: '8px 20px', borderBottom: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', gap: 16,
                background: 'var(--bg)', flexShrink: 0,
              }}>
                <span style={{ fontSize: 12, color: '#00C853' }}>
                  {acceptedCount} / {items.length} ausgewählt
                </span>
                <div style={{ flex: 1, height: 3, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 2, background: '#00C853',
                    width: `${items.length > 0 ? (acceptedCount / items.length) * 100 : 0}%`,
                    transition: 'width 0.2s',
                  }} />
                </div>
                <button
                  onClick={() => setItems(p => p.map(it => ({ ...it, _accepted: true })))}
                  style={{
                    padding: '3px 10px', borderRadius: 5, fontSize: 11,
                    border: '1px solid var(--border)', background: 'var(--bg)',
                    cursor: 'pointer', color: 'var(--text-muted)',
                  }}
                >
                  Alle
                </button>
                <button
                  onClick={() => setItems(p => p.map(it => ({ ...it, _accepted: false })))}
                  style={{
                    padding: '3px 10px', borderRadius: 5, fontSize: 11,
                    border: '1px solid var(--border)', background: 'var(--bg)',
                    cursor: 'pointer', color: 'var(--text-muted)',
                  }}
                >
                  Keine
                </button>
              </div>

              {/* Item-Liste */}
              {items.map((item, idx) => {
                const typInfo = item.typ ? (TYP_LABELS[item.typ] ?? { label: item.typ, color: 'var(--text-muted)' }) : null
                const title = item.strang_name ||
                  (item.charakter_a && item.charakter_b ? `${item.charakter_a} ↔ ${item.charakter_b}` : '')

                return (
                  <div
                    key={idx}
                    style={{
                      padding: '12px 20px',
                      borderBottom: '1px solid var(--border)',
                      borderLeft: `3px solid ${item._accepted ? '#00C853' : 'var(--border)'}`,
                      opacity: item._accepted ? 1 : 0.55,
                      transition: 'opacity 0.15s, border-color 0.15s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {/* Meta-Zeile */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
                          {title && (
                            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>
                              {title}
                            </span>
                          )}
                          {typInfo && (
                            <span style={{
                              padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                              background: `${typInfo.color}18`, color: typInfo.color,
                            }}>
                              {typInfo.label}
                            </span>
                          )}
                        </div>

                        {/* Beschreibung */}
                        <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.4 }}>
                          {item.beschreibung}
                        </div>

                        {/* Quellentext */}
                        {item.quellentext && (
                          <div style={{
                            marginTop: 6, display: 'flex', alignItems: 'flex-start', gap: 4,
                            color: 'var(--text-muted)', fontSize: 11,
                          }}>
                            <ChevronRight size={11} style={{ marginTop: 1, flexShrink: 0 }} />
                            <em>{item.quellentext}</em>
                          </div>
                        )}
                      </div>

                      {/* Toggle */}
                      <button
                        onClick={() => toggleItem(idx)}
                        style={{
                          width: 28, height: 28, borderRadius: 6, border: 'none', flexShrink: 0,
                          background: item._accepted ? '#00C853' : 'var(--bg)',
                          color: item._accepted ? '#fff' : '#00C853',
                          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          boxShadow: item._accepted ? 'none' : '0 0 0 1px #00C853 inset',
                        }}
                      >
                        <Check size={13} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px', borderTop: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0, gap: 8,
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '7px 16px', borderRadius: 6, border: '1px solid var(--border)',
              background: 'transparent', cursor: 'pointer', fontSize: 13,
            }}
          >
            Schließen
          </button>

          {status === 'done' && items.length > 0 && (
            <button
              onClick={handleCommit}
              disabled={committing || acceptedCount === 0}
              style={{
                padding: '7px 20px', borderRadius: 6, border: 'none',
                background: acceptedCount === 0 ? 'var(--border)' : '#000',
                color: acceptedCount === 0 ? 'var(--text-muted)' : '#fff',
                cursor: acceptedCount === 0 || committing ? 'default' : 'pointer',
                fontSize: 13, fontWeight: 500,
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              {committing && <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} />}
              {acceptedCount} als Befunde eintragen
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
