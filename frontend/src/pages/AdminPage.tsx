import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import AppShell from '../components/AppShell'
import AdminKI from '../components/AdminKI'
import { api } from '../api/client'
import { useSelectedProduction } from '../contexts'
import { useTerminologie } from '../sw-ui'

const ADMIN_TABS = [
  { id: 'ki',             label: 'KI-Konfiguration' },
  { id: 'wasserzeichen',  label: 'Wasserzeichen & Export-Log' },
  { id: 'dk-zugriff',     label: 'DK-Zugriff' },
  { id: 'users',          label: 'Benutzer & Rollen' },
  { id: 'audit',          label: 'Audit-Log' },
  { id: 'pwa',            label: 'App / PWA' },
]

// ── Wasserzeichen Tab ─────────────────────────────────────────────────────────

function WasserzeichenTab() {
  const { t } = useTerminologie()
  const [decodeFile, setDecodeFile]   = useState<File | null>(null)
  const [decodeResult, setDecodeResult] = useState<any>(null)
  const [decoding, setDecoding]       = useState(false)
  const [logs, setLogs]               = useState<any[] | null>(null)
  const [logsLoading, setLogsLoading] = useState(false)
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

  const fmt = (d: string) => new Date(d).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })

  return (
    <div style={{ padding: '28px 32px', maxWidth: 820, display: 'flex', flexDirection: 'column', gap: 32 }}>

      {/* Decoder */}
      <section>
        <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 6px' }}>Wasserzeichen auslesen</h3>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 16px', lineHeight: 1.6 }}>
          Lade eine exportierte Datei (.fountain, .fdx) hoch. Das Wasserzeichen wird ausgelesen und
          dem ursprünglichen Export-Vorgang zugeordnet. Die Datei wird <strong>nicht</strong> importiert.
        </p>

        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div
            onClick={() => fileRef.current?.click()}
            style={{
              border: '1.5px dashed var(--border)',
              borderRadius: 8, padding: '12px 20px',
              cursor: 'pointer', fontSize: 13,
              color: decodeFile ? 'var(--text-primary)' : 'var(--text-secondary)',
              background: 'var(--bg-subtle)', minWidth: 240,
            }}
          >
            {decodeFile ? decodeFile.name : '+ Datei auswaehlen'}
            <input ref={fileRef} type="file" accept=".fountain,.fdx,.txt"
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
              <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Kein Wasserzeichen gefunden in dieser Datei.</div>
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
                      ['Zeitpunkt',      fmt(decodeResult.log.exported_at)],
                      ['Format',         decodeResult.log.format],
                      ['Fassung',        decodeResult.log.version_label || decodeResult.log.stage_type || '—'],
                      [t('staffel'),     decodeResult.log.staffel_titel || '—'],
                      [t('episode'),    decodeResult.log.folge_nummer || '—'],
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
                    Export-ID: <code>{decodeResult.export_id}</code> — kein Eintrag in der Datenbank gefunden.
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Export-Log */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Export-Log</h3>
          <button
            onClick={loadLogs}
            disabled={logsLoading}
            style={{
              fontSize: 12, padding: '4px 12px', borderRadius: 6,
              border: '1px solid var(--border)', background: 'var(--bg-subtle)',
              cursor: 'pointer', color: 'var(--text-secondary)',
            }}
          >
            {logsLoading ? 'Laedt…' : logs ? 'Aktualisieren' : 'Laden'}
          </button>
        </div>

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
                    <td style={{ padding: '6px 10px', border: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{fmt(log.exported_at)}</td>
                    <td style={{ padding: '6px 10px', border: '1px solid var(--border)' }}>{log.user_name}</td>
                    <td style={{ padding: '6px 10px', border: '1px solid var(--border)', fontFamily: 'monospace' }}>{log.format}</td>
                    <td style={{ padding: '6px 10px', border: '1px solid var(--border)' }}>{log.version_label || log.stage_type || '—'}</td>
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

// ── DK-Zugriff Tab ────────────────────────────────────────────────────────────

function DkZugriffTab() {
  const { t } = useTerminologie()
  const { productions } = useSelectedProduction()
  const [selectedProdId, setSelectedProdId] = useState<string>('')
  const [entries, setEntries] = useState<{ access_type: string; identifier: string }[]>([])
  const [newType, setNewType] = useState<'rolle' | 'user'>('rolle')
  const [newId, setNewId] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!selectedProdId) { setEntries([]); return }
    setLoading(true)
    api.getDkAccess(selectedProdId)
      .then(rows => setEntries(rows.map((r: any) => ({ access_type: r.access_type, identifier: r.identifier }))))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false))
  }, [selectedProdId])

  const handleSave = async () => {
    if (!selectedProdId) return
    setSaving(true); setMsg(null)
    try {
      await api.updateDkAccess(selectedProdId, entries)
      setMsg('Gespeichert.')
    } catch (e: any) { setMsg(e.message) }
    finally { setSaving(false) }
  }

  const addEntry = () => {
    const id = newId.trim()
    if (!id) return
    if (entries.some(e => e.access_type === newType && e.identifier === id)) return
    setEntries(prev => [...prev, { access_type: newType, identifier: id }])
    setNewId('')
  }

  const removeEntry = (idx: number) => {
    setEntries(prev => prev.filter((_, i) => i !== idx))
  }

  const prodLabel = (p: any) => {
    const title = p.staffelnummer ? `${p.title} ${t('staffel')} ${p.staffelnummer}` : p.title
    return p.projektnummer ? `${p.projektnummer} · ${title}` : title
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 640 }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>DK-Zugriffsteuerung</h2>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 20px', lineHeight: 1.6 }}>
        Lege fest, welche Rollen und User Zugriff auf die Drehbuchkoordinations-Settings einer Produktion haben.
        Tier-1-Rollen (Superadmin, Geschaeftsfuehrung, Herstellungsleitung) haben immer Zugriff.
      </p>

      {/* Production selector */}
      <div style={{ marginBottom: 24 }}>
        <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Produktion</label>
        <select
          value={selectedProdId}
          onChange={e => setSelectedProdId(e.target.value)}
          style={{
            width: '100%', padding: '8px 12px', borderRadius: 8,
            border: '1px solid var(--border)', fontSize: 13,
            background: 'var(--bg-surface)', color: 'var(--text-primary)',
            fontFamily: 'inherit',
          }}
        >
          <option value="">— Produktion waehlen —</option>
          {productions.filter(p => p.is_active).map(p => (
            <option key={p.id} value={p.id}>{prodLabel(p)}</option>
          ))}
          {productions.filter(p => !p.is_active).length > 0 && (
            <optgroup label="Inaktiv">
              {productions.filter(p => !p.is_active).map(p => (
                <option key={p.id} value={p.id}>{prodLabel(p)}</option>
              ))}
            </optgroup>
          )}
        </select>
      </div>

      {selectedProdId && loading && (
        <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Laedt…</p>
      )}

      {selectedProdId && !loading && (
        <>
          {/* Current entries */}
          <div style={{ marginBottom: 20 }}>
            {entries.length === 0 && (
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 8px' }}>
                Kein zusaetzlicher Zugriff konfiguriert (nur Tier-1-Rollen).
              </p>
            )}
            {entries.map((e, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                background: 'var(--bg-surface)', border: '1px solid var(--border)',
                borderRadius: 8, marginBottom: 4,
              }}>
                <span style={{
                  fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
                  color: e.access_type === 'rolle' ? 'var(--sw-info)' : 'var(--sw-green)',
                  background: e.access_type === 'rolle' ? 'rgba(0,122,255,0.08)' : 'rgba(0,200,83,0.08)',
                  padding: '2px 8px', borderRadius: 99,
                }}>
                  {e.access_type}
                </span>
                <span style={{ flex: 1, fontSize: 13 }}>{e.identifier}</span>
                <button
                  onClick={() => removeEntry(i)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14, padding: '0 4px' }}
                >x</button>
              </div>
            ))}
          </div>

          {/* Add entry */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            <select
              value={newType}
              onChange={e => setNewType(e.target.value as any)}
              style={{
                padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)',
                fontSize: 12, background: 'var(--bg-surface)', color: 'var(--text-primary)',
                fontFamily: 'inherit',
              }}
            >
              <option value="rolle">Rolle</option>
              <option value="user">User-ID</option>
            </select>
            <input
              value={newId}
              onChange={e => setNewId(e.target.value)}
              placeholder={newType === 'rolle' ? 'z.B. produktionsleitung' : 'z.B. user-abc-123'}
              onKeyDown={e => e.key === 'Enter' && addEntry()}
              style={{
                flex: 1, padding: '7px 10px', borderRadius: 7,
                border: '1px solid var(--border)', fontSize: 12,
                background: 'var(--bg-surface)', color: 'var(--text-primary)',
                fontFamily: 'inherit',
              }}
            />
            <button
              onClick={addEntry}
              disabled={!newId.trim()}
              style={{
                padding: '7px 14px', borderRadius: 7, border: 'none',
                background: newId.trim() ? 'var(--text-primary)' : 'var(--bg-subtle)',
                color: newId.trim() ? '#fff' : 'var(--text-muted)',
                fontSize: 12, cursor: newId.trim() ? 'pointer' : 'not-allowed',
                fontFamily: 'inherit',
              }}
            >
              + Hinzufuegen
            </button>
          </div>

          {/* Save */}
          {msg && <p style={{ fontSize: 12, color: 'var(--sw-info)', marginBottom: 8 }}>{msg}</p>}
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '8px 24px', borderRadius: 8, border: 'none',
              background: 'var(--text-primary)', color: '#fff',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {saving ? 'Speichert…' : 'Speichern'}
          </button>
        </>
      )}
    </div>
  )
}

// ── Main AdminPage ────────────────────────────────────────────────────────────

// ── PWA / App Tab ─────────────────────────────────────────────────────────────

function PwaAdminTab() {
  const [action, setAction] = useState<'' | 'update' | 'uninstall'>('')
  const [current, setCurrent] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch('/api/admin/app-settings', { credentials: 'include' })
      .then(r => r.json())
      .then((d: any) => setCurrent(d?.pwa_update_action ?? ''))
      .catch(() => {})
  }, [])

  const save = async (value: '' | 'update' | 'uninstall') => {
    setSaving(true)
    setSaved(false)
    try {
      await fetch('/api/admin/app-settings/pwa_update_action', {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      })
      setCurrent(value)
      setAction(value)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch {}
    finally { setSaving(false) }
  }

  const statusLabel = current === 'update'
    ? 'Update erzwingen (wartet auf nächstes Öffnen)'
    : current === 'uninstall'
    ? 'Deinstallation erzwingen (wartet auf nächstes Öffnen)'
    : 'Kein Befehl aktiv'

  const statusColor = current === '' ? 'var(--text-secondary)' : '#FF9500'

  return (
    <div style={{ padding: '28px 32px', maxWidth: 600 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>PWA-Steuerung</h3>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        Befehle, die beim <strong>nächsten Öffnen</strong> der App durch jeden Nutzer automatisch ausgeführt werden.
        Der Befehl wird nach einmaliger Ausführung automatisch zurückgesetzt.
        <br />
        <span style={{ color: '#FF9500' }}>
          Hinweis: Funktioniert nur wenn der User die App aktiv öffnet — nicht wenn sie geschlossen ist.
        </span>
      </p>

      {/* Aktueller Status */}
      <div style={{
        padding: '10px 14px', borderRadius: 8,
        border: `1px solid ${current === '' ? 'var(--border)' : '#FF950066'}`,
        background: current === '' ? 'var(--bg-subtle)' : 'rgba(255,149,0,0.06)',
        marginBottom: 20, fontSize: 12,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
          background: statusColor,
        }} />
        <div>
          <span style={{ fontWeight: 600 }}>Aktueller Status: </span>
          <span style={{ color: statusColor }}>{statusLabel}</span>
        </div>
        {current !== '' && (
          <button
            onClick={() => save('')}
            disabled={saving}
            style={{
              marginLeft: 'auto', background: 'none', border: '1px solid var(--border)',
              borderRadius: 5, padding: '3px 8px', cursor: 'pointer',
              fontSize: 11, color: 'var(--text-secondary)',
            }}
          >
            Zurücksetzen
          </button>
        )}
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{
          padding: '16px', borderRadius: 8,
          border: '1px solid var(--border)', background: 'var(--bg-subtle)',
        }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Update erzwingen</div>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 12px', lineHeight: 1.5 }}>
            Aktiviert einen wartenden Service Worker und lädt die App neu — nützlich nach Deployments,
            wenn User die App lange offen haben.
          </p>
          <button
            onClick={() => save('update')}
            disabled={saving || current === 'update'}
            style={{
              padding: '8px 16px', borderRadius: 7, border: 'none',
              background: current === 'update' ? 'var(--bg-subtle)' : '#007AFF',
              color: current === 'update' ? 'var(--text-secondary)' : '#fff',
              fontWeight: 600, fontSize: 12, cursor: saving || current === 'update' ? 'default' : 'pointer',
            }}
          >
            {current === 'update' ? 'Bereits gesetzt' : 'Update-Befehl setzen'}
          </button>
        </div>

        <div style={{
          padding: '16px', borderRadius: 8,
          border: '1px solid var(--border)', background: 'var(--bg-subtle)',
        }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Deinstallation erzwingen</div>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 12px', lineHeight: 1.5 }}>
            Entfernt Service Worker und lokale Caches bei allen Usern — nützlich nach
            grundlegenden Architektur-Änderungen am SW oder Cache-Schema.
          </p>
          <button
            onClick={() => save('uninstall')}
            disabled={saving || current === 'uninstall'}
            style={{
              padding: '8px 16px', borderRadius: 7, border: 'none',
              background: current === 'uninstall' ? 'var(--bg-subtle)' : 'var(--sw-danger)',
              color: current === 'uninstall' ? 'var(--text-secondary)' : '#fff',
              fontWeight: 600, fontSize: 12, cursor: saving || current === 'uninstall' ? 'default' : 'pointer',
            }}
          >
            {current === 'uninstall' ? 'Bereits gesetzt' : 'Deinstallations-Befehl setzen'}
          </button>
        </div>
      </div>

      {saved && (
        <p style={{ fontSize: 12, color: 'var(--sw-green)', marginTop: 12 }}>
          Gespeichert. Wird beim nächsten Öffnen der App durch Nutzer ausgeführt.
        </p>
      )}
    </div>
  )
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState('ki')
  const navigate = useNavigate()

  return (
    <AppShell>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}>
        {/* Admin Header */}
        <div style={{
          padding: '14px 32px 0',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-page)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <button
              onClick={() => navigate('/')}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-secondary)', fontSize: 13, padding: '2px 6px 2px 0',
              }}
            >
              &larr; Zurueck
            </button>
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>
              Admin-Einstellungen
            </h2>
          </div>
          <div style={{ display: 'flex', gap: 0 }}>
            {ADMIN_TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '7px 14px',
                  fontSize: 13,
                  fontWeight: activeTab === tab.id ? 500 : 400,
                  color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: `2px solid ${activeTab === tab.id ? 'var(--text-primary)' : 'transparent'}`,
                  cursor: 'pointer',
                  transition: 'color 0.15s',
                  fontFamily: 'var(--font-sans)',
                  marginBottom: -1,
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {activeTab === 'ki'             && <AdminKI />}
          {activeTab === 'wasserzeichen'  && <WasserzeichenTab />}
          {activeTab === 'dk-zugriff'     && <DkZugriffTab />}
          {activeTab === 'users'          && (
            <div style={{ padding: '28px 32px', color: 'var(--text-secondary)', fontSize: 13 }}>
              Benutzer & Rollen werden in der Auth-App verwaltet.
            </div>
          )}
          {activeTab === 'audit'          && (
            <div style={{ padding: '28px 32px', color: 'var(--text-secondary)', fontSize: 13 }}>
              Dieser Bereich ist noch in Entwicklung.
            </div>
          )}
          {activeTab === 'pwa'            && <PwaAdminTab />}
        </div>
      </div>
    </AppShell>
  )
}
