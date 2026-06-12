// DiffSummaryModal — KI-Zusammenfassung eines Fassungsvergleichs (Diff-Modus im Editor).
// Fragt POST /api/ki/diff-summary ab (base = Original/Vergleichsfassung, other = aktuelle Fassung)
// und zeigt die dramaturgische Zusammenfassung (erzählerische Änderungen + Figurenführung).
import { useEffect, useState } from 'react'
import { X, Sparkles, RefreshCw } from 'lucide-react'
import { api } from '../../api/client'

interface Props {
  baseWerkstufeId: string
  otherWerkstufeId: string
  baseLabel: string
  otherLabel: string
  onClose: () => void
}

export default function DiffSummaryModal({ baseWerkstufeId, otherWerkstufeId, baseLabel, otherLabel, onClose }: Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ summary: string | null; disabled?: boolean; changed?: number; added?: number; removed?: number; truncated?: boolean } | null>(null)

  const laden = () => {
    setLoading(true); setError(null)
    api.kiDiffSummary(baseWerkstufeId, otherWerkstufeId)
      .then(setResult)
      .catch(e => setError(String(e?.message ?? e)))
      .finally(() => setLoading(false))
  }

  useEffect(() => { laden() }, [baseWerkstufeId, otherWerkstufeId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const statsParts: string[] = []
  if (result?.changed) statsParts.push(`${result.changed} geändert`)
  if (result?.added) statsParts.push(`${result.added} neu`)
  if (result?.removed) statsParts.push(`${result.removed} gestrichen`)

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000 }} onClick={onClose} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: 'min(680px, calc(100vw - 48px))', maxHeight: 'min(80vh, 720px)',
        background: 'var(--bg-surface, #fff)', borderRadius: 12, zIndex: 1001,
        boxShadow: '0 16px 48px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Kopf */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid var(--border, #E0E0E0)', flexShrink: 0 }}>
          <Sparkles size={15} style={{ color: 'var(--sw-info, #007AFF)' }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>KI-Zusammenfassung der Änderungen</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {baseLabel} → {otherLabel}{statsParts.length ? ` · ${statsParts.join(' · ')} Szenen` : ''}
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
            <button
              onClick={laden}
              disabled={loading}
              title="Neu generieren"
              style={{ background: 'none', border: 'none', cursor: loading ? 'default' : 'pointer', color: 'var(--text-muted)', padding: 6, borderRadius: 6, display: 'flex' }}
            >
              <RefreshCw size={14} className={loading ? 'spin' : undefined} />
            </button>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 6, borderRadius: 6, display: 'flex' }}>
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Inhalt */}
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 13, padding: '24px 0' }}>
              <Sparkles size={14} style={{ opacity: 0.6 }} />
              Die KI analysiert die Änderungen — das kann einen Moment dauern…
            </div>
          )}
          {!loading && error && (
            <div style={{ color: 'var(--danger, #FF3B30)', fontSize: 13, padding: '12px 0' }}>
              Fehler bei der KI-Zusammenfassung: {error}
            </div>
          )}
          {!loading && !error && result?.disabled && (
            <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '12px 0' }}>
              Die KI-Funktion „Fassungsvergleich zusammenfassen" ist deaktiviert. Sie kann in den
              Admin-Einstellungen unter KI (Funktion <code>diff_summary</code>) aktiviert werden.
            </div>
          )}
          {!loading && !error && !result?.disabled && result?.summary && (
            <div style={{ fontSize: 13, lineHeight: 1.65, whiteSpace: 'pre-wrap', color: 'var(--text-primary)' }}>
              {result.summary}
            </div>
          )}
          {!loading && !error && !result?.disabled && result?.truncated && (
            <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
              Hinweis: Der Änderungsumfang war sehr groß — die Analyse basiert auf einem gekürzten Auszug.
            </div>
          )}
        </div>
      </div>
    </>
  )
}
