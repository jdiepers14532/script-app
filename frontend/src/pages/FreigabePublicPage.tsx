/**
 * Öffentliche Freigabe-Seite — kein Login erforderlich
 * Aufgerufen via Einmal-URL aus Freigabe-Email
 * Route: /freigabe/:token
 */
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

type TokenInfo = {
  rollen_name: string
  prod_titel: string
  genehmiger_name: string
  anfrage_status: string
  bereits_entschieden: boolean
  eigene_entscheidung: string | null
  entscheidung_typ: 'freigeben' | 'ablehnen'
}

export default function FreigabePublicPage() {
  const { token } = useParams<{ token: string }>()
  const [info, setInfo] = useState<TokenInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [submitLoading, setSubmitLoading] = useState(false)

  useEffect(() => {
    if (!token) return
    fetch(`/api/public/freigabe/${token}`)
      .then(r => {
        if (r.status === 404) throw new Error('Link nicht gefunden oder ungültig.')
        if (r.status === 410) throw new Error('Dieser Link ist abgelaufen.')
        if (!r.ok) throw new Error('Fehler beim Laden.')
        return r.json()
      })
      .then(setInfo)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [token])

  async function handleEntscheiden() {
    if (!token || submitLoading) return
    setSubmitLoading(true)
    try {
      const r = await fetch(`/api/public/freigabe/${token}/entscheiden`, { method: 'POST' })
      if (r.status === 409) {
        const d = await r.json()
        setError(`Dieser Link wurde bereits verwendet (${d.entschieden === 'freigegeben' ? 'Freigegeben' : 'Abgelehnt'}).`)
        return
      }
      if (!r.ok) throw new Error('Fehler beim Speichern.')
      setSubmitted(true)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSubmitLoading(false)
    }
  }

  const isFreigeben = info?.entscheidung_typ === 'freigeben'

  return (
    <div style={{
      minHeight: '100vh', background: '#f5f5f5',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: '-apple-system, Inter, Arial, sans-serif', padding: 24,
    }}>
      <div style={{
        background: '#fff', borderRadius: 12, maxWidth: 480, width: '100%',
        padding: 32, boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
      }}>
        {/* Logo / Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, color: '#757575', marginBottom: 4 }}>Script-App · Serienwerft</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>Rollen-Freigabe</div>
        </div>

        {loading && (
          <div style={{ color: '#757575', fontSize: 14 }}>Lade...</div>
        )}

        {error && (
          <div style={{
            background: '#fff0f0', border: '1px solid #FF3B30', borderRadius: 8,
            padding: 16, fontSize: 14, color: '#FF3B30',
          }}>
            {error}
          </div>
        )}

        {!loading && !error && info && (
          <>
            {(info.bereits_entschieden || submitted) ? (
              <div style={{
                background: info.eigene_entscheidung === 'freigegeben' || (submitted && isFreigeben)
                  ? '#f0fff4' : '#fff0f0',
                border: `1px solid ${info.eigene_entscheidung === 'freigegeben' || (submitted && isFreigeben) ? '#00C853' : '#FF3B30'}`,
                borderRadius: 8, padding: 20, textAlign: 'center',
              }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>
                  {(info.eigene_entscheidung === 'freigegeben' || (submitted && isFreigeben)) ? '✓' : '✗'}
                </div>
                <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>
                  {(info.eigene_entscheidung === 'freigegeben' || (submitted && isFreigeben))
                    ? 'Rolle freigegeben'
                    : 'Rolle abgelehnt'}
                </div>
                <div style={{ fontSize: 13, color: '#757575' }}>
                  Deine Entscheidung wurde gespeichert.
                </div>
              </div>
            ) : (
              <>
                <div style={{
                  background: '#f5f5f5', borderRadius: 8, padding: 16,
                  marginBottom: 24, fontSize: 13, lineHeight: 1.8,
                }}>
                  <div><strong>Neue Rolle:</strong> {info.rollen_name}</div>
                  <div><strong>Produktion:</strong> {info.prod_titel}</div>
                </div>

                <p style={{ fontSize: 14, color: '#333', lineHeight: 1.7, marginBottom: 24 }}>
                  Hallo {info.genehmiger_name},<br />
                  du wirst gebeten, die neue Rolle <strong>{info.rollen_name}</strong> {isFreigeben ? 'freizugeben' : 'abzulehnen'}.
                </p>

                <button
                  onClick={handleEntscheiden}
                  disabled={submitLoading}
                  style={{
                    width: '100%', padding: '14px 0', borderRadius: 8,
                    border: 'none', cursor: submitLoading ? 'wait' : 'pointer',
                    fontSize: 15, fontWeight: 700,
                    background: isFreigeben ? '#000' : '#FF3B30',
                    color: '#fff',
                    opacity: submitLoading ? 0.6 : 1,
                  }}
                >
                  {submitLoading ? 'Wird gespeichert...' : (isFreigeben ? 'Rolle freigeben' : 'Rolle ablehnen')}
                </button>

                <p style={{ fontSize: 12, color: '#999', marginTop: 16, lineHeight: 1.5 }}>
                  Dieser Link kann nur einmal verwendet werden und ist 7 Tage gültig.
                  Du wirst nicht auf andere Seiten der App weitergeleitet.
                </p>
              </>
            )}

            {info.anfrage_status !== 'ausstehend' && !submitted && (
              <div style={{
                marginTop: 16, padding: 12, background: '#f5f5f5',
                borderRadius: 8, fontSize: 13, color: '#757575',
              }}>
                Diese Anfrage wurde bereits abgeschlossen (Status: {info.anfrage_status}).
              </div>
            )}
          </>
        )}

        <div style={{ marginTop: 32, paddingTop: 16, borderTop: '1px solid #eee', fontSize: 11, color: '#bbb' }}>
          Studio Hamburg Serienwerft · Script-App
        </div>
      </div>
    </div>
  )
}
