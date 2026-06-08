import { useEffect, useState } from 'react'
import { api, clearCacheByPrefix } from '../../api/client'

/**
 * Pflicht-Bestätigungsdialog für „Veröffentlichen". Niemals Versand auf einen Klick:
 * zeigt zuerst die byte-genaue Empfängerzahl (read-only Preview vom Backend, dieselbe
 * Auswahl-Logik wie der Versand), erst „Jetzt veröffentlichen" löst POST aus.
 */
export default function VeroeffentlichenDialog({ werkstufeId, onClose }: { werkstufeId: string; onClose: () => void }) {
  const [preview, setPreview] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<any | null>(null)

  useEffect(() => {
    setLoading(true)
    clearCacheByPrefix(`/werkstufen/${werkstufeId}/veroeffentlichen`) // immer frische Zahl
    api.veroeffentlichenPreview(werkstufeId)
      .then(setPreview)
      .catch((e: any) => setErr(/403/.test(String(e?.message)) ? 'Keine Freigabe-Berechtigung für diese Produktion.' : String(e?.message || e)))
      .finally(() => setLoading(false))
  }, [werkstufeId])

  async function confirm() {
    setSending(true); setErr(null)
    try {
      clearCacheByPrefix(`/werkstufen/${werkstufeId}`)
      const r = await api.veroeffentlichen(werkstufeId)
      setResult(r)
    } catch (e: any) {
      setErr(String(e?.message || e)); setSending(false)
    }
  }

  const total = preview?.total_empfaenger ?? 0
  const verteiler = preview?.verteiler ?? []
  const aktiveVerteiler = verteiler.filter((v: any) => v.empfaenger_count > 0)

  const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }
  const card: React.CSSProperties = { background: 'var(--bg-card,#fff)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 12, width: 460, maxWidth: '100%', maxHeight: '85vh', overflow: 'auto', fontFamily: 'var(--font-sans)' }
  const btn: React.CSSProperties = { font: 'inherit', fontWeight: 600, padding: '10px 16px', minHeight: 44, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card,#fff)', color: 'var(--text-primary)', cursor: 'pointer' }
  const btnPrimary: React.CSSProperties = { ...btn, background: '#00C853', borderColor: '#00C853', color: '#fff' }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={card} onClick={e => e.stopPropagation()}>
        <div style={{ padding: 20, borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 17, fontWeight: 600 }}>Veröffentlichen</h2>
          <button style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text-secondary)' }} onClick={onClose}>✕</button>
        </div>

        <div style={{ padding: 20 }}>
          {loading && <div style={{ color: 'var(--text-secondary)' }}>Lade Empfänger…</div>}

          {err && !result && <div style={{ padding: '10px 12px', background: '#FFF0F0', border: '1px solid #FFB3B3', borderRadius: 8, color: '#FF3B30', fontSize: 13 }}>{err}</div>}

          {/* Bestätigungsschritt */}
          {!loading && !err && !result && (
            total === 0 ? (
              <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
                {verteiler.length === 0
                  ? 'Kein passender aktiver Verteiler für diesen Werkstufe-Typ. Lege zuerst in den DK-Einstellungen → Verteiler einen passenden Verteiler an.'
                  : 'Keine aktiven Empfänger mit auflösbarer E-Mail in den passenden Verteilern.'}
              </div>
            ) : (
              <>
                <p style={{ fontSize: 15, marginBottom: 14 }}>
                  An <b>{total}</b> {total === 1 ? 'Empfänger' : 'Empfänger'} in{' '}
                  <b>{aktiveVerteiler.length}</b> {aktiveVerteiler.length === 1 ? 'Verteiler' : 'Verteilern'} veröffentlichen
                  {` (${preview.werkstufe ?? preview.typ} v${preview.version}, Folge ${preview.folge})`}?
                </p>
                <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 14 }}>
                  {aktiveVerteiler.map((v: any) => (
                    <div key={v.verteiler_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: 14 }}>
                      <span>{v.verteiler_name}</span>
                      <span style={{ color: 'var(--text-secondary)' }}>{v.empfaenger_count} Empf.</span>
                    </div>
                  ))}
                </div>
                {preview.uebersprungen_count > 0 && (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
                    {preview.uebersprungen_count} Mitglied(er) ohne auflösbare E-Mail werden übersprungen.
                  </div>
                )}
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  Versendet einen sicheren Link per E-Mail (Link-first). Diese Aktion löst echten Mailversand aus.
                </div>
              </>
            )
          )}

          {/* Ergebnis */}
          {result && (
            <div>
              <div style={{ padding: '10px 12px', background: '#E8F8EE', border: '1px solid #bdebcd', borderRadius: 8, color: '#0a7d3c', fontSize: 14, marginBottom: 12 }}>
                ✓ Veröffentlicht. {result.gesendet ?? 0} E-Mail(s) versendet.
              </div>
              {Array.isArray(result.versandfehler) && result.versandfehler.length > 0 && (
                <div style={{ fontSize: 13, color: '#FF3B30', marginBottom: 8 }}>{result.versandfehler.length} Versandfehler (Empfänger bleiben in Warteschlange).</div>
              )}
              {Array.isArray(result.uebersprungen) && result.uebersprungen.length > 0 && (
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{result.uebersprungen.length} übersprungen (keine E-Mail).</div>
              )}
              {result.hinweis && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{result.hinweis}</div>}
            </div>
          )}
        </div>

        <div style={{ padding: '14px 20px', display: 'flex', justifyContent: 'flex-end', gap: 10, background: 'var(--bg-surface)', borderTop: '1px solid var(--border)', borderRadius: '0 0 12px 12px' }}>
          {result ? (
            <button style={btnPrimary} onClick={onClose}>Schließen</button>
          ) : (
            <>
              <button style={btn} onClick={onClose} disabled={sending}>Abbrechen</button>
              <button style={btnPrimary} onClick={confirm} disabled={loading || sending || !!err || total === 0}>
                {sending ? 'Veröffentlicht…' : 'Jetzt veröffentlichen'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
