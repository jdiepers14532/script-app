import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

type Status = 'loading' | 'success_freigeben' | 'success_verlaengern' | 'used' | 'expired' | 'error'

export default function PrivatModeTokenPage() {
  const { token } = useParams<{ token: string }>()
  const [status, setStatus] = useState<Status>('loading')

  useEffect(() => {
    if (!token) { setStatus('error'); return }
    fetch(`/api/privat-mode-tokens/${token}`)
      .then(async r => {
        if (r.ok) {
          const data = await r.json()
          setStatus(data.aktion === 'freigeben' ? 'success_freigeben' : 'success_verlaengern')
        } else if (r.status === 410) {
          const data = await r.json().catch(() => ({}))
          setStatus((data.error ?? '').includes('bereits') ? 'used' : 'expired')
        } else {
          setStatus('error')
        }
      })
      .catch(() => setStatus('error'))
  }, [token])

  const CONTENT: Record<Status, { icon: string; title: string; msg: string; color: string }> = {
    loading:            { icon: '⏳', title: 'Wird verarbeitet…', msg: '', color: '#757575' },
    success_freigeben:  { icon: '✅', title: 'Werkstufe freigegeben', msg: 'Die Sichtbarkeit wurde zurückgesetzt. Alle Autoren können die Werkstufe wieder sehen.', color: '#00C853' },
    success_verlaengern:{ icon: '🔄', title: 'Privat-Modus verlängert', msg: 'Der Privat-Modus wurde verlängert. Du erhältst nach Ablauf eine neue Benachrichtigung.', color: '#007AFF' },
    used:               { icon: '⚠️', title: 'Link bereits verwendet', msg: 'Dieser Link wurde bereits eingelöst.', color: '#FF9500' },
    expired:            { icon: '⏰', title: 'Link abgelaufen', msg: 'Dieser Link ist abgelaufen. Öffne die Script-App um die Sichtbarkeit manuell anzupassen.', color: '#FF9500' },
    error:              { icon: '❌', title: 'Ungültiger Link', msg: 'Der Link konnte nicht verarbeitet werden.', color: '#FF3B30' },
  }

  const c = CONTENT[status]

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#F5F5F5', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>
      <div style={{
        background: '#fff', borderRadius: 14, boxShadow: '0 4px 24px rgba(0,0,0,0.1)',
        padding: '40px 48px', maxWidth: 480, width: '90%', textAlign: 'center',
      }}>
        <div style={{ fontSize: 48, marginBottom: 16, lineHeight: 1 }}>{c.icon}</div>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 12px', color: c.color }}>{c.title}</h1>
        {c.msg && (
          <p style={{ fontSize: 14, color: '#555', lineHeight: 1.6, margin: '0 0 28px' }}>{c.msg}</p>
        )}
        {status === 'loading' ? null : (
          <a
            href="/"
            style={{
              display: 'inline-block', padding: '10px 24px',
              background: '#007AFF', color: '#fff',
              borderRadius: 8, textDecoration: 'none', fontSize: 14, fontWeight: 600,
            }}
          >
            Zur Script-App
          </a>
        )}
      </div>
    </div>
  )
}
