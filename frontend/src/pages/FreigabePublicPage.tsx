/**
 * Öffentliche Freigabe-Seite — kein Login erforderlich
 * Aufgerufen via Einmal-URL aus Freigabe-Email
 * Route: /freigabe/:token
 *
 * Verhalten:
 * - freigeben-Token: auto-bestätigt beim Laden → Bestätigungsscreen
 * - ablehnen-Token:  zeigt Ablehnungsgrund-Eingabe → Nutzer bestätigt manuell
 */
import { useEffect, useState, useRef } from 'react'
import { useParams } from 'react-router-dom'

const AUTH_URL = 'https://auth.serienwerft.studio'
const APP_URL = window.location.origin

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
  const [ablehnungsgrund, setAblehnungsgrund] = useState('')
  const [companyName, setCompanyName] = useState('Serienwerft')
  const autoSubmitFired = useRef(false)

  useEffect(() => {
    fetch(`${AUTH_URL}/api/public/company-info`)
      .then(r => r.json())
      .then((d: any) => { if (d?.company_name) setCompanyName(d.company_name) })
      .catch(() => {})
  }, [])

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

  // freigeben-Token: auto-submit sobald info geladen & noch nicht entschieden
  useEffect(() => {
    if (!info || autoSubmitFired.current) return
    if (info.bereits_entschieden || info.anfrage_status !== 'ausstehend') return
    if (info.entscheidung_typ !== 'freigeben') return
    autoSubmitFired.current = true
    handleEntscheiden()
  }, [info]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleEntscheiden(grund?: string) {
    if (!token || submitLoading) return
    setSubmitLoading(true)
    try {
      const body: any = {}
      if (grund) body.ablehnungsgrund = grund
      const r = await fetch(`/api/public/freigabe/${token}/entscheiden`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
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
  const isDone = info?.bereits_entschieden || submitted
  const finalFreigegeben = (info?.eigene_entscheidung === 'freigegeben') || (submitted && isFreigeben)

  const s = {
    page: {
      minHeight: '100vh', background: '#f5f5f5',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: '-apple-system, Inter, Arial, sans-serif', padding: 24,
    } as React.CSSProperties,
    card: {
      background: '#fff', borderRadius: 12, maxWidth: 480, width: '100%',
      padding: 32, boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
    } as React.CSSProperties,
    header: { marginBottom: 24 } as React.CSSProperties,
    sub: { fontSize: 13, color: '#757575', marginBottom: 4 } as React.CSSProperties,
    title: { fontSize: 22, fontWeight: 700 } as React.CSSProperties,
    info: { background: '#f5f5f5', borderRadius: 8, padding: 16, marginBottom: 24, fontSize: 13, lineHeight: 1.8 } as React.CSSProperties,
    footer: { marginTop: 32, paddingTop: 16, borderTop: '1px solid #eee', fontSize: 11, color: '#bbb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' } as React.CSSProperties,
  }

  const Footer = () => (
    <div style={s.footer}>
      <span>{companyName} · Script-App</span>
      <a href={APP_URL} style={{ fontSize: 11, color: '#007AFF', textDecoration: 'none' }}>→ Script-App öffnen</a>
    </div>
  )

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.header}>
          <div style={s.sub}>Script-App · {companyName}</div>
          <div style={s.title}>Rollen-Freigabe</div>
        </div>

        {loading && (
          <div style={{ color: '#757575', fontSize: 14 }}>Lade...</div>
        )}

        {error && (
          <div style={{ background: '#fff0f0', border: '1px solid #FF3B30', borderRadius: 8, padding: 16, fontSize: 14, color: '#FF3B30' }}>
            {error}
          </div>
        )}

        {!loading && !error && info && (
          <>
            {isDone ? (
              /* ── Bestätigungsscreen ── */
              <div style={{
                background: finalFreigegeben ? '#f0fff4' : '#fff0f0',
                border: `1px solid ${finalFreigegeben ? '#00C853' : '#FF3B30'}`,
                borderRadius: 8, padding: 24, textAlign: 'center',
              }}>
                <div style={{ fontSize: 40, marginBottom: 8 }}>{finalFreigegeben ? '✓' : '✗'}</div>
                <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>
                  {finalFreigegeben ? 'Rolle freigegeben' : 'Rolle abgelehnt'}
                </div>
                <div style={{ fontSize: 13, color: '#555', marginBottom: 4 }}>
                  <strong>{info.rollen_name}</strong> · {info.prod_titel}
                </div>
                <div style={{ fontSize: 12, color: '#999', marginTop: 8 }}>
                  Deine Entscheidung wurde gespeichert.
                </div>
              </div>
            ) : submitLoading && isFreigeben ? (
              /* ── Auto-submit läuft ── */
              <div style={{ textAlign: 'center', padding: '24px 0', color: '#757575', fontSize: 14 }}>
                Wird freigegeben…
              </div>
            ) : info.entscheidung_typ === 'ablehnen' ? (
              /* ── Ablehnen: Grund-Eingabe ── */
              <>
                <div style={s.info}>
                  <div><strong>Rolle:</strong> {info.rollen_name}</div>
                  <div><strong>Produktion:</strong> {info.prod_titel}</div>
                </div>
                <p style={{ fontSize: 14, color: '#333', lineHeight: 1.7, marginBottom: 16 }}>
                  Hallo {info.genehmiger_name}, du möchtest die Rolle <strong>{info.rollen_name}</strong> ablehnen.
                </p>
                <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 6 }}>
                  Ablehnungsgrund <span style={{ color: '#999', fontWeight: 400 }}>(optional)</span>
                </label>
                <textarea
                  value={ablehnungsgrund}
                  onChange={e => setAblehnungsgrund(e.target.value)}
                  placeholder="z.B. Budget nicht freigegeben, Rolle bereits besetzt…"
                  rows={3}
                  style={{
                    width: '100%', boxSizing: 'border-box', padding: '10px 12px',
                    border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 13,
                    fontFamily: 'inherit', resize: 'vertical', outline: 'none',
                    marginBottom: 16,
                  }}
                />
                <button
                  onClick={() => handleEntscheiden(ablehnungsgrund || undefined)}
                  disabled={submitLoading}
                  style={{
                    width: '100%', padding: '14px 0', borderRadius: 8,
                    border: 'none', cursor: submitLoading ? 'wait' : 'pointer',
                    fontSize: 15, fontWeight: 700,
                    background: '#FF3B30', color: '#fff',
                    opacity: submitLoading ? 0.6 : 1,
                  }}
                >
                  {submitLoading ? 'Wird gespeichert...' : 'Rolle ablehnen'}
                </button>
                <p style={{ fontSize: 12, color: '#999', marginTop: 12 }}>
                  Dieser Link kann nur einmal verwendet werden und ist 7 Tage gültig.
                </p>
              </>
            ) : null}

            {info.anfrage_status !== 'ausstehend' && !submitted && (
              <div style={{ marginTop: 16, padding: 12, background: '#f5f5f5', borderRadius: 8, fontSize: 13, color: '#757575' }}>
                Diese Anfrage wurde bereits abgeschlossen (Status: {info.anfrage_status}).
              </div>
            )}
          </>
        )}

        <Footer />
      </div>
    </div>
  )
}
