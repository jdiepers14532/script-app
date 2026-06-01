import { useState } from 'react'
import { Check, X, Loader2, Sparkles, ChevronRight } from 'lucide-react'
import { api } from '../../api/client'

export interface KiVorschlag {
  beat_id: string
  prosa_text: string
  vorschlag_beat_text: string
  fehler?: string
}

type ItemStatus = 'pending' | 'accepted' | 'skipped'

interface Props {
  items: KiVorschlag[]
  provider: string
  model: string
  onClose: () => void
  /** Wird mit den final übernommenen beat_text-Werten aufgerufen */
  onCommit: (updates: Array<{ beat_id: string; beat_text: string }>) => void
}

export default function KiVorschlagReviewPanel({ items, provider, model, onClose, onCommit }: Props) {
  // editierter Text pro Beat (für Inline-Korrekturen vor dem Annehmen)
  const [texts, setTexts] = useState<Record<string, string>>(
    Object.fromEntries(items.map(it => [it.beat_id, it.vorschlag_beat_text]))
  )
  const [statuses, setStatuses] = useState<Record<string, ItemStatus>>(
    Object.fromEntries(items.map(it => [it.beat_id, it.fehler ? 'skipped' as ItemStatus : 'pending' as ItemStatus]))
  )
  const [committing, setCommitting] = useState(false)

  const accepted = Object.values(statuses).filter(s => s === 'accepted').length
  const skipped  = Object.values(statuses).filter(s => s === 'skipped').length
  const pending  = Object.values(statuses).filter(s => s === 'pending').length
  const total    = items.length

  function accept(beatId: string) {
    setStatuses(p => ({ ...p, [beatId]: 'accepted' }))
  }
  function skip(beatId: string) {
    setStatuses(p => ({ ...p, [beatId]: 'skipped' }))
  }
  function acceptAll() {
    setStatuses(p => {
      const next = { ...p }
      for (const id of Object.keys(next)) {
        if (next[id] === 'pending') next[id] = 'accepted'
      }
      return next
    })
  }

  async function handleCommit() {
    const updates = items
      .filter(it => statuses[it.beat_id] === 'accepted')
      .map(it => ({ beat_id: it.beat_id, beat_text: texts[it.beat_id] ?? it.vorschlag_beat_text }))
    if (updates.length === 0) { onClose(); return }

    setCommitting(true)
    try {
      await api.beatKurztextCommit(updates)
      onCommit(updates)
    } finally {
      setCommitting(false)
    }
  }

  const statusColor: Record<ItemStatus, string> = {
    pending:  'var(--border)',
    accepted: '#00C853',
    skipped:  'var(--text-muted)',
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9000,
    }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        width: 640, maxWidth: '95vw', maxHeight: '85vh',
        background: 'var(--bg-surface)', borderRadius: 12,
        boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>

        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Sparkles size={18} style={{ color: '#007AFF' }} />
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
                KI-Vorschläge: Kurztext
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                {provider} · {model} · {total} Beat{total !== 1 ? 's' : ''}
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, display: 'flex' }}>
            <X size={18} />
          </button>
        </div>

        {/* Status bar */}
        <div style={{
          padding: '10px 20px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0,
          background: 'var(--bg)',
        }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {accepted + skipped} von {total} bearbeitet
          </span>
          <span style={{ fontSize: 12, color: '#00C853', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Check size={12} /> {accepted} angenommen
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {skipped} übersprungen
          </span>
          {pending > 0 && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {pending} offen
            </span>
          )}
          {/* Progress bar */}
          <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 2, background: '#00C853',
              width: `${total > 0 ? ((accepted + skipped) / total) * 100 : 0}%`,
              transition: 'width 0.2s',
            }} />
          </div>
        </div>

        {/* Item list */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {items.map(it => {
            const status = statuses[it.beat_id]
            return (
              <div
                key={it.beat_id}
                style={{
                  padding: '14px 20px',
                  borderBottom: '1px solid var(--border)',
                  borderLeft: `3px solid ${statusColor[status]}`,
                  opacity: status === 'skipped' ? 0.5 : 1,
                  transition: 'opacity 0.15s, border-color 0.15s',
                }}
              >
                {/* Prosa (Quelle) */}
                <div style={{
                  fontSize: 11, color: 'var(--text-muted)', marginBottom: 6,
                  lineHeight: 1.4,
                  overflow: 'hidden', display: '-webkit-box',
                  WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                } as any}>
                  <span style={{ fontWeight: 600, marginRight: 4 }}>Prosa:</span>
                  {it.prosa_text}
                </div>

                {/* Fehler */}
                {it.fehler && (
                  <div style={{ fontSize: 12, color: '#FF3B30', marginBottom: 6 }}>
                    Fehler: {it.fehler}
                  </div>
                )}

                {/* Vorschlag (editierbar) */}
                {!it.fehler && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <ChevronRight size={14} style={{ color: '#007AFF', flexShrink: 0, marginTop: 9 }} />
                    <input
                      value={texts[it.beat_id] ?? ''}
                      onChange={e => setTexts(p => ({ ...p, [it.beat_id]: e.target.value }))}
                      disabled={status !== 'pending' && status !== 'accepted'}
                      placeholder="Kurztext…"
                      style={{
                        flex: 1, padding: '6px 9px', borderRadius: 6,
                        border: `1px solid ${status === 'accepted' ? '#00C853' : 'var(--border)'}`,
                        background: status === 'accepted' ? 'rgba(0,200,83,0.05)' : 'var(--bg)',
                        fontSize: 13, color: 'var(--text-primary)',
                        transition: 'border-color 0.15s',
                      }}
                      maxLength={200}
                    />
                    {/* Buttons */}
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      <button
                        onClick={() => status === 'accepted' ? skip(it.beat_id) : accept(it.beat_id)}
                        title={status === 'accepted' ? 'Rückgängig' : 'Annehmen'}
                        style={{
                          width: 30, height: 30, borderRadius: 6, border: 'none',
                          background: status === 'accepted' ? '#00C853' : 'var(--bg)',
                          color: status === 'accepted' ? '#fff' : '#00C853',
                          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          boxShadow: status === 'accepted' ? 'none' : '0 0 0 1px #00C853 inset',
                        }}
                      >
                        <Check size={14} />
                      </button>
                      {status !== 'skipped' && (
                        <button
                          onClick={() => skip(it.beat_id)}
                          title="Überspringen"
                          style={{
                            width: 30, height: 30, borderRadius: 6, border: '1px solid var(--border)',
                            background: 'var(--bg)', color: 'var(--text-muted)',
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 20px', borderTop: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0, gap: 8,
        }}>
          <button
            onClick={acceptAll}
            disabled={pending === 0}
            style={{
              padding: '7px 14px', borderRadius: 6, border: '1px solid var(--border)',
              background: 'transparent', cursor: pending === 0 ? 'default' : 'pointer',
              fontSize: 13, color: pending === 0 ? 'var(--text-muted)' : 'var(--text-primary)',
              opacity: pending === 0 ? 0.5 : 1,
            }}
          >
            Alle annehmen
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onClose}
              style={{
                padding: '7px 16px', borderRadius: 6, border: '1px solid var(--border)',
                background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'var(--text-primary)',
              }}
            >
              Abbrechen
            </button>
            <button
              onClick={handleCommit}
              disabled={committing || accepted === 0}
              style={{
                padding: '7px 20px', borderRadius: 6, border: 'none',
                background: accepted === 0 ? 'var(--border)' : '#000',
                color: accepted === 0 ? 'var(--text-muted)' : '#fff',
                cursor: accepted === 0 || committing ? 'default' : 'pointer',
                fontSize: 13, fontWeight: 500,
                display: 'flex', alignItems: 'center', gap: 6,
                opacity: committing ? 0.6 : 1,
              }}
            >
              {committing && <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} />}
              {accepted} übernehmen
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
