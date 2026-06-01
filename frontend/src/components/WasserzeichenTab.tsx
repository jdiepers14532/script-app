import { useState, useRef } from 'react'
import { api } from '../api/client'
import { useTerminologie } from '../sw-ui'

export default function WasserzeichenTab() {
  const { t } = useTerminologie()
  const [decodeFile, setDecodeFile]     = useState<File | null>(null)
  const [decodeResult, setDecodeResult] = useState<any>(null)
  const [decoding, setDecoding]         = useState(false)
  const [logs, setLogs]                 = useState<any[] | null>(null)
  const [logsLoading, setLogsLoading]   = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleDecode = async () => {
    if (!decodeFile) return
    setDecoding(true)
    try {
      const result = await api.watermarkDecode(decodeFile)
      setDecodeResult(result)
    } catch (e: any) {
      setDecodeResult({ error: e.message })
    } finally {
      setDecoding(false)
    }
  }

  const loadLogs = async () => {
    setLogsLoading(true)
    try { setLogs(await api.watermarkLogs(100)) }
    catch { setLogs([]) }
    finally { setLogsLoading(false) }
  }

  const fmt = (d: string) =>
    d ? new Date(d).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '—'

  const S = {
    card: {
      background: 'var(--bg-subtle)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      padding: '18px 20px',
    } as React.CSSProperties,
    h3: { fontSize: 14, fontWeight: 700, margin: '0 0 6px' } as React.CSSProperties,
    p:  { fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 12px', lineHeight: 1.65 } as React.CSSProperties,
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 860, display: 'flex', flexDirection: 'column', gap: 28 }}>

      {/* ── Erklärung ──────────────────────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(0,122,255,0.06) 0%, rgba(175,82,222,0.06) 100%)',
        border: '1px solid rgba(0,122,255,0.2)',
        borderRadius: 12, padding: '18px 22px',
        display: 'flex', gap: 16, alignItems: 'flex-start',
      }}>
        <div style={{ fontSize: 28, lineHeight: 1, flexShrink: 0 }}>🔍</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Was ist ein unsichtbares Wasserzeichen?</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            Jedes exportierte PDF enthält einen <strong>versteckten Code</strong> in den Datei-Metadaten —
            unsichtbar für den Leser, aber maschinell auslesbar. Der Code verknüpft die Datei eindeutig
            mit dem Benutzer, der den Export durchgeführt hat, und der genauen Fassung.
            Taucht ein Drehbuch unerlaubt im Internet auf, kann mit dem Decoder unten in Sekunden
            festgestellt werden, <em>wer</em> es exportiert und vermutlich weitergegeben hat.
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            {[
              { icon: '👁', label: 'Für Leser unsichtbar', color: '#007AFF' },
              { icon: '📋', label: 'In PDF-Metadaten (Keywords)', color: '#AF52DE' },
              { icon: '🚫', label: 'KI-Training gesperrt (noai)', color: '#FF9500' },
              { icon: '©', label: 'Urheberrechtsvermerk', color: '#00C853' },
            ].map(b => (
              <div key={b.label} style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: b.color + '12', border: `1px solid ${b.color}30`,
                borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 500,
              }}>
                <span>{b.icon}</span>
                <span style={{ color: b.color }}>{b.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Decoder ────────────────────────────────────────────────────────── */}
      <section>
        <h3 style={S.h3}>Wasserzeichen auslesen</h3>
        <p style={S.p}>
          Lade eine exportierte Datei (.pdf, .fountain, .fdx) hoch. Das Wasserzeichen wird ausgelesen und
          dem ursprünglichen Export-Vorgang zugeordnet. Die Datei wird <strong>nicht</strong> importiert.
        </p>

        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div
            onClick={() => fileRef.current?.click()}
            style={{
              border: '1.5px dashed var(--border)', borderRadius: 8, padding: '12px 20px',
              cursor: 'pointer', fontSize: 13,
              color: decodeFile ? 'var(--text-primary)' : 'var(--text-secondary)',
              background: 'var(--bg-subtle)', minWidth: 240,
            }}
          >
            {decodeFile ? decodeFile.name : '+ Datei auswählen'}
            <input ref={fileRef} type="file" accept=".pdf,.fountain,.fdx,.txt"
              style={{ display: 'none' }}
              onChange={e => { setDecodeFile(e.target.files?.[0] || null); setDecodeResult(null) }}
            />
          </div>
          <button
            onClick={handleDecode}
            disabled={!decodeFile || decoding}
            style={{
              padding: '10px 18px', borderRadius: 8,
              background: decodeFile ? 'var(--text-primary)' : 'var(--bg-subtle)',
              color: decodeFile ? 'var(--bg-page)' : 'var(--text-secondary)',
              border: 'none', cursor: decodeFile ? 'pointer' : 'not-allowed',
              fontWeight: 600, fontSize: 13,
            }}
          >
            {decoding ? 'Lese aus…' : 'Wasserzeichen auslesen'}
          </button>
        </div>

        {decodeResult && (
          <div style={{
            marginTop: 16,
            border: `1.5px solid ${decodeResult.found ? 'var(--sw-green)' : decodeResult.error ? 'var(--sw-danger)' : 'var(--border)'}`,
            borderRadius: 8, padding: '14px 18px',
            background: decodeResult.found ? 'rgba(0,200,83,0.05)' : decodeResult.error ? 'rgba(255,59,48,0.05)' : 'var(--bg-subtle)',
          }}>
            {decodeResult.error && (
              <div style={{ color: 'var(--sw-danger)', fontSize: 13 }}>Fehler: {decodeResult.error}</div>
            )}
            {!decodeResult.error && !decodeResult.found && (
              <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                Kein Wasserzeichen gefunden. PDFs vor dem 01.06.2026 enthalten noch kein Wasserzeichen.
              </div>
            )}
            {decodeResult.found && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--sw-green)' }}>Wasserzeichen gefunden</div>
                {decodeResult.log ? (
                  <table style={{ fontSize: 12, borderCollapse: 'collapse', width: '100%' }}>
                    <tbody>
                    {[
                      ['Exportiert von', decodeResult.log.user_name],
                      ['User-ID',        decodeResult.log.user_id],
                      ['Zeitpunkt',      fmt(decodeResult.log.created_at)],
                      ['Format',         decodeResult.log.format],
                      ['Fassung',        decodeResult.log.werkstufe_typ && decodeResult.log.version_nummer
                                          ? `${decodeResult.log.werkstufe_typ} v${decodeResult.log.version_nummer}`
                                          : decodeResult.log.werkstufe_label || '—'],
                      [t('staffel'),     decodeResult.log.staffel_titel || '—'],
                      [t('episode'),     decodeResult.log.folge_nummer  || '—'],
                    ].map(([label, value]) => (
                      <tr key={label}>
                        <td style={{ padding: '4px 12px 4px 0', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{label}</td>
                        <td style={{ padding: '4px 0', fontWeight: 500 }}>{value}</td>
                      </tr>
                    ))}
                    </tbody>
                  </table>
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    Export-ID: <code style={{ fontFamily: 'monospace' }}>{decodeResult.export_id}</code> — kein Log-Eintrag gefunden
                    (PDF evtl. vor Aktivierung des Export-Logs exportiert).
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Export-Log ─────────────────────────────────────────────────────── */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <h3 style={{ ...S.h3, margin: 0 }}>Export-Log</h3>
          <button
            onClick={loadLogs}
            disabled={logsLoading}
            style={{
              fontSize: 12, padding: '4px 12px', borderRadius: 6,
              border: '1px solid var(--border)', background: 'var(--bg-subtle)',
              cursor: 'pointer', color: 'var(--text-secondary)',
            }}
          >
            {logsLoading ? 'Lädt…' : logs ? 'Aktualisieren' : 'Laden'}
          </button>
        </div>
        <p style={{ ...S.p, marginBottom: 12 }}>
          Alle PDF-Exports der letzten Zeit — unabhängig vom Wasserzeichen-Decoder.
          Exportiert von allen Benutzern mit Zugriff auf diese Produktion.
        </p>

        {logs === null && !logsLoading && (
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>
            Klicke "Laden" um die letzten 100 Exports zu sehen.
          </p>
        )}
        {logs !== null && logs.length === 0 && (
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>Noch keine Exports aufgezeichnet.</p>
        )}
        {logs !== null && logs.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--bg-subtle)' }}>
                  {['Zeitpunkt', 'Benutzer', 'Format', 'Fassung', t('staffel'), t('episode')].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '7px 10px', border: '1px solid var(--border)', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id}>
                    <td style={{ padding: '6px 10px', border: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{fmt(log.created_at)}</td>
                    <td style={{ padding: '6px 10px', border: '1px solid var(--border)' }}>{log.user_name}</td>
                    <td style={{ padding: '6px 10px', border: '1px solid var(--border)', fontFamily: 'monospace' }}>{log.format}</td>
                    <td style={{ padding: '6px 10px', border: '1px solid var(--border)' }}>
                      {log.werkstufe_typ && log.version_nummer
                        ? `${log.werkstufe_typ} v${log.version_nummer}`
                        : log.werkstufe_label || '—'}
                    </td>
                    <td style={{ padding: '6px 10px', border: '1px solid var(--border)' }}>{log.staffel_titel || '—'}</td>
                    <td style={{ padding: '6px 10px', border: '1px solid var(--border)' }}>{log.folge_nummer || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

    </div>
  )
}
