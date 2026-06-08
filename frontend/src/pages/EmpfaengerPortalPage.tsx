/**
 * Öffentliches Empfänger-Portal — kein Login, Token-basiert.
 * Route: /v/:token  (Link aus der Verteiler-Mail, Schritt 3)
 *
 * Endpoints (Schritt 2):
 *   GET  /api/v/:token        → Metadaten (setzt opened_at) | 410 abgelaufen | 404 unbekannt
 *   GET  /api/v/:token/pdf    → PDF (Stub bis Schritt 7; setzt downloaded_at)
 *   POST /api/v/:token/resend → neuer Link an hinterlegte E-Mail
 *
 * Mobile-first, Tablet/Touch. Ausdrucken-Block = „Bald" (gesperrt).
 */
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

const AUTH_URL = 'https://auth.serienwerft.studio'
const C = { black: '#000', white: '#fff', green: '#00C853', surface: '#F5F5F5', border: '#E0E0E0', secondary: '#757575', warning: '#FFCC00', info: '#007AFF' }

const fmtDate = (s?: string | null) => { if (!s) return '—'; try { return new Date(s).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) } catch { return '—' } }

type State =
  | { kind: 'loading' }
  | { kind: 'gueltig'; d: any }
  | { kind: 'abgelaufen'; email?: string }
  | { kind: 'unbekannt' }

export default function EmpfaengerPortalPage() {
  const { token } = useParams<{ token: string }>()
  const [st, setSt] = useState<State>({ kind: 'loading' })
  const [brand, setBrand] = useState('SERIENWERFT')
  const [resendState, setResendState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [resendEmail, setResendEmail] = useState<string | null>(null)

  useEffect(() => {
    fetch(`${AUTH_URL}/api/public/company-info`).then(r => r.json())
      .then((d: any) => { if (d?.company_name) setBrand(String(d.company_name).toUpperCase()) }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!token) return
    fetch(`/api/v/${encodeURIComponent(token)}`)
      .then(async r => {
        const body = await r.json().catch(() => ({}))
        if (r.status === 200) setSt({ kind: 'gueltig', d: body })
        else if (r.status === 410) setSt({ kind: 'abgelaufen', email: body?.email })
        else setSt({ kind: 'unbekannt' })
      })
      .catch(() => setSt({ kind: 'unbekannt' }))
  }, [token])

  const pdfUrl = `/api/v/${encodeURIComponent(token || '')}/pdf`

  async function downloadPdf(d: any) {
    try {
      const r = await fetch(pdfUrl)
      if (!r.ok) throw new Error()
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `drehbuch-${d.folge ?? ''}-v${d.version ?? ''}.pdf`
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
    } catch { window.open(pdfUrl, '_blank') }
  }

  async function requestResend() {
    if (!token) return
    setResendState('loading')
    try {
      const r = await fetch(`/api/v/${encodeURIComponent(token)}/resend`, { method: 'POST' })
      const body = await r.json().catch(() => ({}))
      if (r.ok) { setResendEmail(body?.email ?? resendEmail); setResendState('done') }
      else setResendState('error')
    } catch { setResendState('error') }
  }

  // ── Layout-Bausteine ────────────────────────────────────────────────────────
  const page = (inner: React.ReactNode) => (
    <div style={{ minHeight: '100vh', background: '#ECECEC', fontFamily: "'Inter',system-ui,sans-serif", color: C.black, padding: '24px 12px', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', boxSizing: 'border-box' }}>
      <div style={{ width: '100%', maxWidth: 440 }}>
        <div style={{ background: C.white, borderRadius: 20, overflow: 'hidden', boxShadow: '0 8px 40px rgba(0,0,0,.12)' }}>
          <div style={{ background: C.black, color: C.white, padding: '16px 20px', fontWeight: 600, fontSize: 14, letterSpacing: '.02em' }}>{brand} · Drehbuch</div>
          {inner}
        </div>
      </div>
    </div>
  )
  const btn: React.CSSProperties = { font: 'inherit', fontWeight: 600, fontSize: 16, padding: 16, minHeight: 52, borderRadius: 12, border: `1px solid ${C.border}`, background: C.white, color: C.black, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, width: '100%' }
  const btnPrimary: React.CSSProperties = { ...btn, background: C.green, borderColor: C.green, color: C.white }
  const pill: React.CSSProperties = { fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 99, background: C.surface, border: `1px solid ${C.border}` }

  if (st.kind === 'loading') return page(<div style={{ padding: 40, textAlign: 'center', color: C.secondary }}>Lädt…</div>)

  if (st.kind === 'unbekannt') return page(
    <div style={{ padding: '40px 24px', textAlign: 'center' }}>
      <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#FFE9D6', color: '#C7621A', fontSize: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>🔒</div>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Link ungültig</h1>
      <p style={{ color: C.secondary, fontSize: 14 }}>Dieser Zugriffslink ist nicht gültig. Bitte wende dich an die Drehbuchkoordination.</p>
    </div>
  )

  if (st.kind === 'abgelaufen') return page(
    <>
      <div style={{ padding: '40px 24px', textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#FFE9D6', color: '#C7621A', fontSize: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>⏱</div>
        {resendState === 'done' ? (
          <>
            <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Neuer Link unterwegs</h1>
            <p style={{ color: C.secondary, fontSize: 14, marginBottom: 8 }}>Ein neuer Zugriffslink wurde an deine hinterlegte E-Mail gesendet.</p>
            {(resendEmail || st.email) && <p style={{ fontSize: 13 }}>Gesendet an: <b>{resendEmail || st.email}</b></p>}
          </>
        ) : (
          <>
            <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Link abgelaufen</h1>
            <p style={{ color: C.secondary, fontSize: 14, marginBottom: 20 }}>Dieser Zugriffslink ist nicht mehr gültig. Du kannst dir einen neuen Link an deine hinterlegte E-Mail schicken lassen.</p>
            <button style={{ ...btnPrimary, opacity: resendState === 'loading' ? 0.7 : 1 }} disabled={resendState === 'loading'} onClick={requestResend}>
              {resendState === 'loading' ? 'Wird angefordert…' : 'Neuen Link anfordern'}
            </button>
            {resendState === 'error' && <p style={{ color: '#FF3B30', fontSize: 13, marginTop: 12 }}>Anforderung fehlgeschlagen. Bitte später erneut versuchen.</p>}
            {st.email && <p style={{ marginTop: 16, fontSize: 12, color: C.secondary }}>Der neue Link geht an: {st.email}</p>}
          </>
        )}
      </div>
      <div style={{ padding: '16px 20px', background: C.surface, borderTop: `1px solid ${C.border}`, fontSize: 12, color: C.secondary, textAlign: 'center' }}>Die Drehbuchkoordination wird über die Anforderung informiert.</div>
    </>
  )

  // ── gültig ──────────────────────────────────────────────────────────────────
  const d = st.d
  return page(
    <>
      <div style={{ padding: 20 }}>
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 13, color: C.secondary }}>{d.produktion || ''}{d.folge != null ? ` · Folge ${d.folge}` : ''}</div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: '2px 0 8px' }}>Drehbuchfassung</h1>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ ...pill, background: '#E8F8EE', borderColor: '#bdebcd', color: '#0a7d3c' }}>{d.werkstufe || 'Fassung'}</span>
            <span style={pill}>Version {d.version}</span>
            {d.freigegeben_am && <span style={pill}>freigegeben {fmtDate(d.freigegeben_am)}</span>}
          </div>
        </div>

        <div style={{ margin: '6px 0 16px' }}>Hallo {d.empfaenger_name || 'zusammen'},<br />eine neue Drehbuchfassung steht für dich bereit.</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
          <button style={btnPrimary} onClick={() => window.open(pdfUrl, '_blank')}>Drehbuch ansehen</button>
          <button style={btn} onClick={() => downloadPdf(d)}>Als PDF herunterladen</button>
        </div>

        {d.sides?.nur_eigene && (
          <div style={{ background: '#F0EAFB', border: '1px solid #dcd2f4', color: '#4a328c', borderRadius: 12, padding: 14, marginBottom: 14, fontSize: 13 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Nur deine Szenen</div>
            <div>Diese Fassung enthält ausschließlich Szenen deiner Rolle{(d.sides.figuren_count ?? 0) > 1 ? 'n' : ''}.</div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, fontSize: 12, color: C.secondary, lineHeight: 1.45, marginTop: 14 }}>
          <span style={{ flex: 'none', width: 18, height: 18, borderRadius: 5, background: C.secondary, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>🔒</span>
          <span>{d.vertraulichkeit || 'Dieses Dokument ist personalisiert und mit einem für dich eindeutigen Wasserzeichen versehen. Bitte nicht weitergeben.'}</span>
        </div>

        {/* Ausdrucken — komplett „Bald" */}
        <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 18, paddingTop: 18, opacity: 0.5, position: 'relative' }}>
          <div style={{ position: 'absolute', inset: 0, cursor: 'not-allowed', zIndex: 1 }} />
          <h2 style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', color: C.secondary, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            Ausdrucken am Set <span style={{ background: '#FFF7E0', color: '#8a6d00', border: `1px dashed ${C.warning}`, fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 99 }}>Bald</span>
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
            {['Normal', 'Beidseitig', '2 auf 1 Seite', '4 auf 1 Seite'].map((v, i) => (
              <div key={v} style={{ border: `1px solid ${i === 0 ? C.green : C.border}`, borderRadius: 8, padding: 12, textAlign: 'center', fontWeight: 500, fontSize: 14, background: i === 0 ? '#E8F8EE' : C.white, color: i === 0 ? '#0a7d3c' : C.black }}>{v}</div>
            ))}
          </div>
          <button style={btn} disabled>Drucken &amp; am Set abholen</button>
          <div style={{ fontSize: 13, color: C.secondary, marginTop: 10 }}>Abholung: <b>Produktionsbüro, Fach „Drehbücher"</b>. Deine Auswahl wird für das nächste Mal gemerkt.</div>
        </div>
      </div>
      <div style={{ padding: '16px 20px', background: C.surface, borderTop: `1px solid ${C.border}`, fontSize: 12, color: C.secondary, textAlign: 'center' }}>
        Link gültig bis {fmtDate(d.token_ablauf)} · Funktioniert der Link nicht? Wende dich an die Drehbuchkoordination.
      </div>
    </>
  )
}
