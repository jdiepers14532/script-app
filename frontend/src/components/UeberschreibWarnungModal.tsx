import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useTerminologie } from '../sw-ui'

interface IntentFaktor {
  key: string
  label: string
  richtung: 'weitermachen' | 'neufassung'
}

interface Props {
  risiko: 'medium' | 'high'
  faktoren: IntentFaktor[]
  werkstufTyp: string
  onNeuereFassung: () => void
  onWeitermachen: () => void
  onAbbrechen: () => void
}

export default function UeberschreibWarnungModal({
  risiko, faktoren, werkstufTyp, onNeuereFassung, onWeitermachen, onAbbrechen,
}: Props) {
  const { t } = useTerminologie()
  const isHigh = risiko === 'high'

  const typLabel = werkstufTyp === 'storyline'
    ? 'Storyline'
    : werkstufTyp === 'notiz'
    ? 'Dokument'
    : t('drehbuch')

  const neuerFassungFaktoren = faktoren.filter(f => f.richtung === 'neufassung')
  const weitermachenFaktoren = faktoren.filter(f => f.richtung === 'weitermachen')

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onAbbrechen() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onAbbrechen])

  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.5)' }}
        onClick={onAbbrechen}
      />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        zIndex: 9999, width: 460, maxWidth: 'calc(100vw - 32px)',
        background: 'var(--bg-surface)',
        border: `1px solid ${isHigh ? 'rgba(255,59,48,0.35)' : 'rgba(255,204,0,0.4)'}`,
        borderRadius: 12, boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
        padding: '20px 20px 16px',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
          <AlertTriangle
            size={18}
            style={{ color: isHigh ? '#FF3B30' : '#FFCC00', marginTop: 2, flexShrink: 0 }}
          />
          <div>
            <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-primary)', marginBottom: 4 }}>
              Fassung überschreiben?
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {isHigh
                ? 'Diese Bearbeitung überschreibt möglicherweise die Arbeit anderer. Besser eine neue Fassung anlegen.'
                : 'Es gibt Hinweise, dass eine neue Fassung sinnvoller wäre.'}
            </div>
          </div>
        </div>

        {/* Faktoren */}
        {(neuerFassungFaktoren.length > 0 || weitermachenFaktoren.length > 0) && (
          <div style={{
            marginBottom: 16,
            background: 'var(--bg-page, #F5F5F5)',
            borderRadius: 8, padding: '10px 12px',
            display: 'flex', flexDirection: 'column', gap: 5,
          }}>
            {neuerFassungFaktoren.map(f => (
              <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                <span style={{ color: '#FF3B30', fontWeight: 700, width: 14, flexShrink: 0 }}>!</span>
                <span style={{ color: 'var(--text-secondary)' }}>{f.label}</span>
              </div>
            ))}
            {weitermachenFaktoren.map(f => (
              <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                <span style={{ color: '#00C853', fontWeight: 700, width: 14, flexShrink: 0 }}>✓</span>
                <span style={{ color: 'var(--text-secondary)' }}>{f.label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            onClick={onNeuereFassung}
            style={{
              width: '100%', padding: '10px 16px', fontSize: 14, fontWeight: 500,
              border: 'none', borderRadius: 8, cursor: 'pointer',
              background: 'var(--text-primary)', color: 'var(--text-inverse)',
              fontFamily: 'inherit',
            }}
          >
            Neue {typLabel}-Fassung anlegen
          </button>
          <button
            onClick={onWeitermachen}
            style={{
              width: '100%', padding: '9px 16px', fontSize: 13,
              border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer',
              background: 'transparent', color: 'var(--text-secondary)',
              fontFamily: 'inherit',
            }}
          >
            Trotzdem in dieser Fassung bearbeiten
          </button>
          <button
            onClick={onAbbrechen}
            style={{
              width: '100%', padding: '8px 16px', fontSize: 12,
              border: 'none', borderRadius: 8, cursor: 'pointer',
              background: 'transparent', color: 'var(--text-muted, #999)',
              fontFamily: 'inherit',
            }}
          >
            Abbrechen
          </button>
        </div>
      </div>
    </>
  )
}
