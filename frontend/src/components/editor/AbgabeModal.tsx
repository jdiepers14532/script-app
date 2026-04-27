import { useState } from 'react'
import { X, Send } from 'lucide-react'
import { api } from '../../api/client'

interface Props {
  dokumentId: string
  fassungId: string
  fassungNummer: number
  onDone: (result: { frozen: any; naechste: any | null }) => void
  onClose: () => void
}

export default function AbgabeModal({ dokumentId, fassungId, fassungNummer, onDone, onClose }: Props) {
  const [erstelleNaechste, setErstelleNaechste] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleAbgabe = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await api.abgabeFassung(dokumentId, fassungId, erstelleNaechste)
      onDone(result)
    } catch (e: any) {
      setError(e.message)
      setLoading(false)
    }
  }

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 998, background: 'rgba(0,0,0,0.4)' }} onClick={onClose} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        zIndex: 999, width: 420,
        background: 'var(--bg-surface)', border: '1px solid var(--border)',
        borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <Send size={14} style={{ color: 'var(--text-secondary)' }} />
          <span style={{ fontWeight: 600, fontSize: 14 }}>Fassung {fassungNummer} abgeben</span>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{ width: 24, height: 24, border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: 4, display: 'grid', placeItems: 'center', color: 'var(--text-secondary)' }}>
            <X size={13} />
          </button>
        </div>

        <div style={{ padding: 20 }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 16px' }}>
            Die Fassung wird eingefroren und kann danach nicht mehr bearbeitet werden.
            Der Status wechselt zu <strong>Review</strong>.
          </p>

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', fontSize: 13 }}>
            <input
              type="checkbox"
              checked={erstelleNaechste}
              onChange={e => setErstelleNaechste(e.target.checked)}
              style={{ marginTop: 2, width: 14, height: 14, cursor: 'pointer', flexShrink: 0 }}
            />
            <div>
              <div style={{ fontWeight: 500 }}>Neue Fassung {fassungNummer + 1} anlegen</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                Inhalt wird kopiert — du kannst sofort weiterarbeiten
              </div>
            </div>
          </label>

          {error && (
            <div style={{ marginTop: 12, padding: '8px 12px', background: 'rgba(255,59,48,0.08)', border: '1px solid rgba(255,59,48,0.3)', borderRadius: 6, fontSize: 12, color: 'var(--sw-danger)' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
            <button onClick={onClose} disabled={loading} style={{
              padding: '7px 16px', fontSize: 13, border: '1px solid var(--border)',
              borderRadius: 6, background: 'transparent', color: 'var(--text-secondary)',
              cursor: 'pointer', fontFamily: 'inherit',
            }}>Abbrechen</button>
            <button onClick={handleAbgabe} disabled={loading} style={{
              padding: '7px 16px', fontSize: 13, border: 'none',
              borderRadius: 6, background: 'var(--text-primary)', color: 'var(--text-inverse)',
              cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontWeight: 500,
              opacity: loading ? 0.7 : 1,
            }}>
              {loading ? 'Wird verarbeitet…' : 'Abgeben'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
