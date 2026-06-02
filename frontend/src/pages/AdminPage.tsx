import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import AppShell from '../components/AppShell'
import AdminKI from '../components/AdminKI'
import Tooltip from '../components/Tooltip'
import { api, ApiError } from '../api/client'
import { useSelectedProduction } from '../contexts'
import { useTerminologie } from '../sw-ui'

const ADMIN_TABS = [
  { id: 'ki',             label: 'KI-Konfiguration' },
  { id: 'dk-zugriff',     label: 'DK-Zugriff' },
  { id: 'fassungen',      label: 'Fassungen & Revision' },
  { id: 'dokument',       label: 'Dokument' },
  { id: 'autorenplan',    label: 'Autorenplan' },
  { id: 'analyse',        label: 'Analyse' },
  { id: 'private-docs',   label: 'Private Dokumente' },
  { id: 'users',          label: 'Benutzer & Rollen' },
  { id: 'audit',          label: 'Audit-Log' },
  { id: 'pwa',            label: 'App / PWA' },
]

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
  const [authUsers, setAuthUsers] = useState<{ id: string; name: string; email: string }[]>([])
  const [authRoles, setAuthRoles] = useState<{ id: string; name: string }[]>([])

  useEffect(() => {
    api.getDkAccessMeta()
      .then(d => { setAuthUsers(d.users); setAuthRoles(d.roles) })
      .catch(() => {})
  }, [])

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
    if (!newId) return
    if (entries.some(e => e.access_type === newType && e.identifier === newId)) return
    setEntries(prev => [...prev, { access_type: newType, identifier: newId }])
    setNewId('')
  }

  const removeEntry = (idx: number) => {
    setEntries(prev => prev.filter((_, i) => i !== idx))
  }

  const prodLabel = (p: any) => {
    const title = p.staffelnummer ? `${p.title} ${t('staffel')} ${p.staffelnummer}` : p.title
    return p.projektnummer ? `${p.projektnummer} · ${title}` : title
  }

  const displayLabel = (e: { access_type: string; identifier: string }) => {
    if (e.access_type === 'rolle') {
      return authRoles.find(r => r.name === e.identifier)?.name ?? e.identifier
    }
    return authUsers.find(u => u.id === e.identifier)?.name ?? e.identifier
  }

  const selectStyle: React.CSSProperties = {
    flex: 1, padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)',
    fontSize: 12, background: 'var(--bg-surface)', color: 'var(--text-primary)',
    fontFamily: 'inherit',
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 640 }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>DK-Zugriffsteuerung</h2>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 20px', lineHeight: 1.6 }}>
        Lege fest, welche Rollen und Nutzer Zugriff auf die Drehbuchkoordinations-Settings einer Produktion haben.
        Superadmin, Geschäftsführung und Herstellungsleitung haben immer Zugriff.
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
          <option value="">— Produktion wählen —</option>
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
        <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Lädt…</p>
      )}

      {selectedProdId && !loading && (
        <>
          {/* Current entries */}
          <div style={{ marginBottom: 20 }}>
            {entries.length === 0 && (
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 8px' }}>
                Kein zusätzlicher Zugriff konfiguriert (nur Tier-1-Rollen).
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
                  padding: '2px 8px', borderRadius: 99, whiteSpace: 'nowrap',
                }}>
                  {e.access_type === 'rolle' ? 'Rolle' : 'Nutzer'}
                </span>
                <span style={{ flex: 1, fontSize: 13 }}>{displayLabel(e)}</span>
                <button
                  onClick={() => removeEntry(i)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14, padding: '0 4px' }}
                >×</button>
              </div>
            ))}
          </div>

          {/* Add entry */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            <select
              value={newType}
              onChange={e => { setNewType(e.target.value as 'rolle' | 'user'); setNewId('') }}
              style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 12, background: 'var(--bg-surface)', color: 'var(--text-primary)', fontFamily: 'inherit' }}
            >
              <option value="rolle">Rolle</option>
              <option value="user">Nutzer</option>
            </select>

            {newType === 'rolle' ? (
              <select value={newId} onChange={e => setNewId(e.target.value)} style={selectStyle}>
                <option value="">— Rolle wählen —</option>
                {authRoles
                  .filter(r => !entries.some(e => e.access_type === 'rolle' && e.identifier === r.name))
                  .map(r => <option key={r.id} value={r.name}>{r.name}</option>)
                }
              </select>
            ) : (
              <select value={newId} onChange={e => setNewId(e.target.value)} style={selectStyle}>
                <option value="">— Nutzer wählen —</option>
                {authUsers
                  .filter(u => !entries.some(e => e.access_type === 'user' && e.identifier === u.id))
                  .map(u => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)
                }
              </select>
            )}

            <button
              onClick={addEntry}
              disabled={!newId}
              style={{
                padding: '7px 14px', borderRadius: 7, border: 'none',
                background: newId ? 'var(--text-primary)' : 'var(--bg-subtle)',
                color: newId ? '#fff' : 'var(--text-muted)',
                fontSize: 12, cursor: newId ? 'pointer' : 'not-allowed',
                fontFamily: 'inherit', whiteSpace: 'nowrap',
              }}
            >
              + Hinzufügen
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

// ── Dokument Tab ──────────────────────────────────────────────────────────────

function DokumentAdminTab() {
  const [overrideRollen, setOverrideRollen] = useState<string[]>([])
  const [newRolle, setNewRolle] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/dokument-override-rollen', { credentials: 'include' })
      .then(r => r.json())
      .then((d: any) => setOverrideRollen(d.rollen ?? []))
      .catch(() => {})
  }, [])

  const addRolle = () => {
    const r = newRolle.trim()
    if (!r || overrideRollen.includes(r)) return
    setOverrideRollen(prev => [...prev, r])
    setNewRolle('')
  }

  const handleSave = async () => {
    setSaving(true)
    setMsg(null)
    try {
      await fetch('/api/admin/dokument-override-rollen', {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rollen: overrideRollen }),
      })
      setMsg('Gespeichert.')
    } catch (e: any) { setMsg(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 600 }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Dokument-Einstellungen</h2>

      <section style={{ marginBottom: 32 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Status-Override-Rollen</h3>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
          Nutzer mit diesen Rollen können alle Dokumente lesen und bearbeiten,
          unabhängig von der Sichtbarkeits-Einstellung der Werkstufe.
        </p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            value={newRolle}
            onChange={e => setNewRolle(e.target.value)}
            placeholder="z.B. herstellungsleitung"
            onKeyDown={e => e.key === 'Enter' && addRolle()}
            style={{
              padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)',
              fontSize: 12, background: 'var(--bg-surface)', color: 'var(--text-primary)',
              fontFamily: 'inherit', width: 240,
            }}
          />
          <button
            onClick={addRolle}
            disabled={!newRolle.trim()}
            style={{
              padding: '7px 14px', borderRadius: 7, border: 'none',
              background: newRolle.trim() ? 'var(--text-primary)' : 'var(--bg-subtle)',
              color: newRolle.trim() ? '#fff' : 'var(--text-muted)',
              fontSize: 12, cursor: newRolle.trim() ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit',
            }}
          >
            + Hinzufügen
          </button>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
          {overrideRollen.map(r => (
            <span key={r} style={{
              display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
              borderRadius: 99, background: 'var(--bg-subtle)', border: '1px solid var(--border)', fontSize: 12,
            }}>
              {r}
              <button
                onClick={() => setOverrideRollen(prev => prev.filter(x => x !== r))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14, lineHeight: 1, padding: 0 }}
              >×</button>
            </span>
          ))}
          {overrideRollen.length === 0 && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Keine Override-Rollen konfiguriert.</span>
          )}
        </div>
        {msg && <p style={{ fontSize: 12, color: 'var(--sw-info)', marginBottom: 8 }}>{msg}</p>}
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '8px 24px', borderRadius: 8, border: 'none',
            background: 'var(--text-primary)', color: '#fff',
            fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          {saving ? 'Speichert…' : 'Speichern'}
        </button>
      </section>
    </div>
  )
}

// ── Autorenplan Tab ───────────────────────────────────────────────────────────

function AutorenplanAdminTab() {
  const [entries, setEntries] = useState<{ id: number; name: string; used_count: number; last_used_at: string }[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [clearing, setClearing] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const load = () => {
    setLoading(true)
    fetch('/api/autorenplan/platzhalter-cache/list', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setEntries(d.entries || []); setTotal(d.total || 0) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleClearAll = async () => {
    setClearing(true)
    await fetch('/api/autorenplan/platzhalter-cache', { method: 'DELETE', credentials: 'include' })
    setEntries([]); setTotal(0); setConfirmClear(false); setClearing(false)
  }

  const handleDeleteOne = async (id: number) => {
    setDeletingId(id)
    await fetch(`/api/autorenplan/platzhalter-cache/${id}`, { method: 'DELETE', credentials: 'include' })
    setEntries(prev => prev.filter(e => e.id !== id))
    setTotal(prev => prev - 1)
    setDeletingId(null)
  }

  const sectionStyle: React.CSSProperties = { marginBottom: 32 }
  const sectionTitleStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-secondary)', marginBottom: 10 }

  return (
    <div style={{ padding: '28px 32px' }}>
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Platzhalter-Cache</div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6, maxWidth: 600 }}>
          Wenn im Autorenplan ein <strong>Platzhalter</strong> (noch kein verknüpfter Kontakt aus der Firmendatenbank)
          eingetragen wird, speichert die App den Namen automatisch in diesem Cache.
          Beim nächsten Eingeben eines Platzhalters erscheinen gespeicherte Namen als Vorschläge —
          das beschleunigt die Eingabe bei wiederkehrenden Platzhaltern.
          Der Cache enthält keine personenbezogenen Daten aus der Firmendatenbank.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>
            {loading ? '...' : `${total} ${total === 1 ? 'Eintrag' : 'Einträge'} gespeichert`}
          </div>
          <div style={{ flex: 1 }} />
          {!confirmClear ? (
            <button
              onClick={() => setConfirmClear(true)}
              disabled={total === 0}
              style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #FF3B30', background: 'none', color: '#FF3B30', cursor: total === 0 ? 'not-allowed' : 'pointer', fontSize: 12, opacity: total === 0 ? 0.4 : 1 }}
            >
              Cache leeren
            </button>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Wirklich alle {total} Einträge löschen?</span>
              <button onClick={() => setConfirmClear(false)} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', fontSize: 12 }}>Abbrechen</button>
              <button onClick={handleClearAll} disabled={clearing} style={{ padding: '5px 14px', borderRadius: 6, border: 'none', background: '#FF3B30', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                {clearing ? '...' : 'Löschen'}
              </button>
            </div>
          )}
        </div>
        {!loading && entries.length > 0 && (
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', maxHeight: 400, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--bg-subtle)' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' }}>Name</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)', width: 80 }}>Verwendet</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)', width: 130 }}>Zuletzt</th>
                  <th style={{ width: 36, borderBottom: '1px solid var(--border)' }} />
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr key={e.id} style={{ background: i % 2 === 0 ? 'var(--bg-page)' : 'var(--bg-subtle)' }}>
                    <td style={{ padding: '7px 12px', color: 'var(--text-primary)' }}>{e.name}</td>
                    <td style={{ padding: '7px 12px', textAlign: 'right', color: 'var(--text-secondary)' }}>{e.used_count}×</td>
                    <td style={{ padding: '7px 12px', textAlign: 'right', color: 'var(--text-secondary)' }}>{new Date(e.last_used_at).toLocaleDateString('de-DE')}</td>
                    <td style={{ padding: '7px 8px', textAlign: 'center' }}>
                      <button onClick={() => handleDeleteOne(e.id)} disabled={deletingId === e.id}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#FF3B30', fontSize: 14, lineHeight: 1, padding: '2px 4px', opacity: deletingId === e.id ? 0.4 : 1 }}>
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && entries.length === 0 && (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontStyle: 'italic' }}>Noch keine Platzhalter gespeichert.</div>
        )}
      </div>

      {/* Einstellungs-Zugriff */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Einstellungs-Zugriff</div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.6, maxWidth: 560 }}>
          Welche Rollen dürfen das Einstellungs-Zahnrad im Autorenplan sehen und Gagenkategorien sowie Pausenwochen verwalten?
        </p>
        <AutorenplanRollenConfig />
      </div>
    </div>
  )
}

// ── Autorenplan Rollen-Konfigurator ───────────────────────────────────────────

const ALL_ROLLEN = [
  'superadmin', 'geschaeftsfuehrung', 'herstellungsleitung', 'hauptbuchhaltung',
  'produktionsleitung', 'produktionsbuero', 'aufnahmeleitung', 'drehplanung',
  'vertragserstellung', 'buchhaltung_produktion',
  'Head_Writing', 'Writer_Producing',
]

function AutorenplanRollenConfig() {
  const [selected, setSelected] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch('/api/admin/app-settings', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        try { setSelected(JSON.parse(d.autorenplan_settings_rollen || '[]')) }
        catch { setSelected([]) }
      })
      .catch(() => {})
  }, [])

  const toggle = (rolle: string) => {
    setSelected(prev => prev.includes(rolle) ? prev.filter(r => r !== rolle) : [...prev, rolle])
    setSaved(false)
  }

  const save = async () => {
    setSaving(true)
    await fetch('/api/admin/app-settings/autorenplan_settings_rollen', {
      method: 'PUT', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: JSON.stringify(selected) }),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        {ALL_ROLLEN.map(rolle => (
          <button key={rolle} onClick={() => toggle(rolle)} style={{
            padding: '5px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
            border: selected.includes(rolle) ? '1.5px solid #000' : '1px solid var(--border)',
            background: selected.includes(rolle) ? '#000' : 'var(--bg-subtle)',
            color: selected.includes(rolle) ? '#fff' : 'var(--text-primary)',
            fontWeight: selected.includes(rolle) ? 600 : 400,
            transition: 'all 0.1s',
          }}>
            {rolle}
          </button>
        ))}
      </div>
      <button onClick={save} disabled={saving} style={{
        padding: '7px 20px', borderRadius: 7, border: 'none',
        background: saved ? '#00C853' : '#000', color: '#fff',
        fontSize: 12, fontWeight: 600, cursor: 'pointer',
        transition: 'background 0.3s',
      }}>
        {saving ? '...' : saved ? 'Gespeichert ✓' : 'Speichern'}
      </button>
    </div>
  )
}

// ── Analyse Admin Tab ─────────────────────────────────────────────────────────

const ANALYSIS_ROLLEN_VORSCHLAEGE = [
  'superadmin', 'Admin', 'Dramaturg', 'Head_Writing', 'Writer_Producing',
  'Lektor', 'Supervision_Script', 'AvD',
]

function AnalyseAdminTab() {
  const [model, setModel]           = useState('')
  const [models, setModels]         = useState<string[]>([])
  const [roles, setRoles]           = useState<string[]>([])
  const [newRole, setNewRole]       = useState('')
  const [saving, setSaving]         = useState(false)
  const [saved, setSaved]           = useState(false)
  const [modelsLoading, setModelsLoading] = useState(false)

  useEffect(() => {
    fetch('/api/admin/app-settings', { credentials: 'include' })
      .then(r => r.json())
      .then((d: any) => {
        setModel(d.analysis_model || 'claude-opus-4-6')
        try { setRoles(JSON.parse(d.analysis_allowed_roles || '[]')) } catch { setRoles([]) }
      })
      .catch(() => {})
  }, [])

  const loadModels = () => {
    setModelsLoading(true)
    fetch('/api/analysis/models', { credentials: 'include' })
      .then(r => r.json())
      .then((d: any) => setModels(d.models || []))
      .catch(() => {})
      .finally(() => setModelsLoading(false))
  }

  useEffect(() => { loadModels() }, [])

  const toggleRole = (r: string) => {
    setRoles(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r])
    setSaved(false)
  }

  const addCustomRole = () => {
    const r = newRole.trim()
    if (!r || roles.includes(r)) return
    setRoles(prev => [...prev, r])
    setNewRole('')
    setSaved(false)
  }

  const save = async () => {
    setSaving(true)
    setSaved(false)
    try {
      await Promise.all([
        fetch('/api/admin/app-settings/analysis_model', {
          method: 'PUT', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: model }),
        }),
        fetch('/api/admin/app-settings/analysis_allowed_roles', {
          method: 'PUT', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: JSON.stringify(roles) }),
        }),
      ])
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch {}
    finally { setSaving(false) }
  }

  const sectionStyle: React.CSSProperties = { marginBottom: 28 }
  const sectionTitleStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
    letterSpacing: '0.06em', color: 'var(--text-secondary)', marginBottom: 10,
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 680 }}>

      {/* Modell */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Claude-Modell für Analysen</div>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.6 }}>
          Modell für Story-Consultant-Methoden. Empfohlen: <code>claude-opus-4-6</code>.
          Die Liste wird live von der Anthropic-API geladen.
        </p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select
            value={model}
            onChange={e => { setModel(e.target.value); setSaved(false) }}
            style={{
              flex: 1, padding: '8px 10px', borderRadius: 6,
              border: '1px solid var(--border)', background: 'var(--bg-subtle)',
              fontSize: 13, color: 'var(--text-primary)',
            }}
          >
            {models.map(m => <option key={m} value={m}>{m}</option>)}
            {!models.includes(model) && model && <option value={model}>{model}</option>}
          </select>
          <button
            onClick={loadModels}
            disabled={modelsLoading}
            style={{
              padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)',
              background: 'var(--bg-subtle)', cursor: 'pointer', fontSize: 12,
              color: 'var(--text-secondary)', opacity: modelsLoading ? 0.5 : 1,
            }}
          >
            {modelsLoading ? '...' : '↻'}
          </button>
        </div>
      </div>

      {/* Berechtigte Rollen */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Berechtigte Rollen</div>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.6 }}>
          Nur Nutzer mit einer dieser Rollen können Analysen starten.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          {ANALYSIS_ROLLEN_VORSCHLAEGE.map(r => (
            <button key={r} onClick={() => toggleRole(r)} style={{
              padding: '5px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
              border: roles.includes(r) ? '1.5px solid #000' : '1px solid var(--border)',
              background: roles.includes(r) ? '#000' : 'var(--bg-subtle)',
              color: roles.includes(r) ? '#fff' : 'var(--text-primary)',
              fontWeight: roles.includes(r) ? 600 : 400,
            }}>
              {r}
            </button>
          ))}
          {roles.filter(r => !ANALYSIS_ROLLEN_VORSCHLAEGE.includes(r)).map(r => (
            <span key={r} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '5px 10px', borderRadius: 20, fontSize: 12,
              background: '#000', color: '#fff', fontWeight: 600,
            }}>
              {r}
              <button onClick={() => toggleRole(r)} style={{
                background: 'none', border: 'none', cursor: 'pointer', color: '#fff',
                padding: 0, fontSize: 12, lineHeight: 1,
              }}>×</button>
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            value={newRole}
            onChange={e => setNewRole(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addCustomRole()}
            placeholder="Weitere Rolle hinzufügen ..."
            style={{
              flex: 1, padding: '7px 10px', borderRadius: 6,
              border: '1px solid var(--border)', background: 'var(--bg-subtle)',
              fontSize: 13,
            }}
          />
          <button onClick={addCustomRole} style={{
            padding: '7px 14px', borderRadius: 6, border: '1px solid var(--border)',
            background: 'var(--bg-subtle)', cursor: 'pointer', fontSize: 12,
          }}>
            Hinzufügen
          </button>
        </div>
      </div>

      {/* Speichern */}
      <button onClick={save} disabled={saving} style={{
        padding: '9px 24px', borderRadius: 8, border: 'none',
        background: saved ? '#00C853' : '#000', color: '#fff',
        fontSize: 13, fontWeight: 600, cursor: 'pointer',
        transition: 'background 0.3s',
      }}>
        {saving ? '...' : saved ? 'Gespeichert ✓' : 'Einstellungen speichern'}
      </button>
    </div>
  )
}

// ── Main AdminPage ────────────────────────────────────────────────────────────

// ── Private Dokumente Admin Tab ───────────────────────────────────────────────

const ALL_VIEWER_ROLES = [
  'produktionsleitung', 'produktionsbuero', 'aufnahmeleitung', 'drehplanung',
  'vertragserstellung', 'buchhaltung_produktion', 'hr_manager', 'redaktion',
]

function PrivateDokumenteAdminTab() {
  const [filter2, setFilter2] = useState(false)
  const [filter3, setFilter3] = useState(false)
  const [viewerRoles, setViewerRoles] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    api.getAdminAppSettings().then(d => {
      setFilter2(d?.private_docs_filter_2_enabled === 'true')
      setFilter3(d?.private_docs_filter_3_enabled === 'true')
      try { setViewerRoles(JSON.parse(d?.private_docs_viewer_roles ?? '[]')) } catch { setViewerRoles([]) }
    }).catch(() => {})
  }, [])

  const toggleRole = (role: string) =>
    setViewerRoles(prev => prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role])

  const handleSave = async () => {
    setSaving(true)
    try {
      await Promise.all([
        api.updateAdminAppSetting('private_docs_filter_2_enabled', String(filter2)),
        api.updateAdminAppSetting('private_docs_filter_3_enabled', String(filter3)),
        api.updateAdminAppSetting('private_docs_viewer_roles', JSON.stringify(viewerRoles)),
      ])
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch {} finally { setSaving(false) }
  }

  const s: React.CSSProperties = { padding: '28px 32px', maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 28 }
  const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '10px 12px', border: '1.5px solid var(--border)', borderRadius: 8 }
  const desc: React.CSSProperties = { fontSize: 12, color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.5 }

  return (
    <div style={s}>
      <section>
        <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 6px' }}>Sichtbare Filter in DK-Einstellungen</h3>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 16px', lineHeight: 1.6 }}>
          Filter 1 (Label „Folge für Sendung") ist immer aktiv. Hier kannst du die erweiterten Filter freischalten.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={row}>
            <input type="checkbox" checked={filter2} onChange={e => setFilter2(e.target.checked)} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>Filter 2 — Mit Folge verknüpfte Dokumente</div>
              <div style={desc}>Zeigt private freie Dokumente, die per „Mit Folge verknüpfen" einer Folge zugeordnet wurden.</div>
            </div>
          </label>
          <label style={row}>
            <input type="checkbox" checked={filter3} onChange={e => setFilter3(e.target.checked)} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>Filter 3 — Alle privaten freien Dokumente</div>
              <div style={desc}>Zeigt alle privaten freien Dokumente, unabhängig von Label oder Verknüpfung.</div>
            </div>
          </label>
        </div>
      </section>

      <section>
        <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 6px' }}>Zugriff auf „Private Dokumente" in DK-Einstellungen</h3>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 16px', lineHeight: 1.6 }}>
          Superadmin und Admin haben immer Zugriff. Hier können weitere Rollen freigeschaltet werden.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {ALL_VIEWER_ROLES.map(role => (
            <label key={role} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '6px 10px', borderRadius: 6, background: viewerRoles.includes(role) ? 'rgba(0,122,255,0.06)' : 'transparent' }}>
              <input type="checkbox" checked={viewerRoles.includes(role)} onChange={() => toggleRole(role)} />
              <span style={{ fontSize: 13 }}>{role}</span>
            </label>
          ))}
        </div>
      </section>

      <div>
        <button className="btn primary" onClick={handleSave} disabled={saving} style={{ minWidth: 110 }}>
          {saving ? 'Speichert…' : saved ? 'Gespeichert ✓' : 'Einstellungen speichern'}
        </button>
      </div>
    </div>
  )
}

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

// ── Fassungen & Revision Tab ──────────────────────────────────────────────────

const WGA_DEFAULTS = [
  { name: 'Blaue Seiten',     color: '#4A90D9' },
  { name: 'Pinke Seiten',     color: '#FF69B4' },
  { name: 'Gelbe Seiten',     color: '#FFD700' },
  { name: 'Grüne Seiten',     color: '#00A651' },
  { name: 'Goldgelbe Seiten', color: '#DAA520' },
  { name: 'Buff-Seiten',      color: '#D4B896' },
]

function FassungenRevisionTab() {
  const { productions } = useSelectedProduction()
  const [selectedProdId, setSelectedProdId] = useState('')
  const [stageLabels, setStageLabels] = useState<any[]>([])
  const [revColors, setRevColors] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [newLabelName, setNewLabelName] = useState('')
  const [newColorName, setNewColorName] = useState('')
  const [newColorHex, setNewColorHex] = useState('#4A90D9')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  // Rename
  const [editingLabelId, setEditingLabelId] = useState<number | null>(null)
  const [editingLabelName, setEditingLabelName] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)
  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<{ label: any; impact: any } | null>(null)
  const [deleteReplacement, setDeleteReplacement] = useState('')

  useEffect(() => {
    if (!selectedProdId) { setStageLabels([]); setRevColors([]); return }
    setLoading(true)
    Promise.all([
      api.getStageLabels(selectedProdId),
      api.getRevisionColors(selectedProdId),
    ]).then(([labels, colors]) => {
      setStageLabels(labels)
      setRevColors(colors)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [selectedProdId])

  const flash = (text: string) => { setMsg(text); setTimeout(() => setMsg(null), 3000) }

  const addLabel = async () => {
    const name = newLabelName.trim()
    if (!name || !selectedProdId) return
    setSaving(true)
    try {
      const row = await api.createStageLabel(selectedProdId, { name })
      setStageLabels(prev => [...prev, row])
      setNewLabelName('')
      flash('Gespeichert.')
    } catch (e: any) { flash(e.message) }
    finally { setSaving(false) }
  }

  const startRename = (l: any) => {
    setEditingLabelId(l.id)
    setEditingLabelName(l.name)
    setTimeout(() => renameInputRef.current?.select(), 30)
  }

  const commitRename = async (l: any) => {
    const newName = editingLabelName.trim()
    if (!newName || newName === l.name || !selectedProdId) { setEditingLabelId(null); return }
    setSaving(true)
    try {
      const updated = await api.updateStageLabel(selectedProdId, l.id, { name: newName })
      setStageLabels(prev => prev.map(x => x.id === updated.id ? updated : x))
      setEditingLabelId(null)
      const count = updated.affectedWerkstufen ?? 0
      flash(`Umbenannt.${count > 0 ? ` ${count} Werkstufe${count !== 1 ? 'n' : ''} aktualisiert.` : ''}`)
    } catch (e: any) {
      if (e instanceof ApiError && e.status === 409) flash('Fehler: Ein Label mit diesem Namen existiert bereits.')
      else flash(e.message)
    } finally { setSaving(false) }
  }

  const requestDeleteLabel = async (l: any) => {
    if (!selectedProdId) return
    try {
      await api.deleteStageLabel(selectedProdId, l.id)
      setStageLabels(prev => prev.filter(x => x.id !== l.id))
    } catch (e: any) {
      if (e instanceof ApiError && e.status === 409) {
        setDeleteConfirm({ label: l, impact: e.data })
        setDeleteReplacement('')
      } else if (e instanceof ApiError && e.status === 422) {
        flash('Löschen nicht möglich: Dieses Label ist als Produktionsfassung markiert und hat gesperrte Werkstufen.')
      } else {
        flash(e.message)
      }
    }
  }

  const confirmForceDelete = async () => {
    if (!deleteConfirm || !selectedProdId) return
    const { label } = deleteConfirm
    setSaving(true)
    try {
      const replacement = deleteReplacement.trim() || undefined
      await api.deleteStageLabel(selectedProdId, label.id, { force: true, replacementName: replacement })
      setStageLabels(prev => prev.filter(x => x.id !== label.id))
      setDeleteConfirm(null)
      flash('Label gelöscht.')
    } catch (e: any) {
      if (e instanceof ApiError && e.status === 422) {
        flash('Löschen nicht möglich: Aktive gesperrte Produktionsfassung.')
        setDeleteConfirm(null)
      } else {
        flash(e.message)
      }
    } finally { setSaving(false) }
  }

  const toggleLabelProd = async (label: any) => {
    if (!selectedProdId) return
    try {
      const updated = await api.updateStageLabel(selectedProdId, label.id, { is_produktionsfassung: !label.is_produktionsfassung })
      setStageLabels(prev => prev.map(l => l.id === updated.id ? updated : l))
    } catch {}
  }

  const addColor = async () => {
    const name = newColorName.trim()
    if (!name || !selectedProdId) return
    setSaving(true)
    try {
      const row = await api.createRevisionColor(selectedProdId, { name, color: newColorHex })
      setRevColors(prev => [...prev, row])
      setNewColorName('')
      flash('Gespeichert.')
    } catch (e: any) { flash(e.message) }
    finally { setSaving(false) }
  }

  const deleteColor = async (id: number) => {
    if (!selectedProdId) return
    try {
      await api.deleteRevisionColor(selectedProdId, id)
      setRevColors(prev => prev.filter(c => c.id !== id))
    } catch (e: any) { flash(e.message) }
  }

  const seedWgaDefaults = async () => {
    if (!selectedProdId) return
    setSaving(true)
    try {
      for (const d of WGA_DEFAULTS) {
        try { const row = await api.createRevisionColor(selectedProdId, d); setRevColors(prev => [...prev, row]) }
        catch {} // skip if name already exists
      }
      flash('WGA-Farben eingefügt.')
    } finally { setSaving(false) }
  }

  const inputStyle: React.CSSProperties = {
    padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)',
    fontSize: 12, background: 'var(--bg-surface)', color: 'var(--text-primary)', fontFamily: 'inherit', flex: 1,
  }
  const btnStyle: React.CSSProperties = {
    padding: '7px 14px', borderRadius: 7, border: 'none',
    background: 'var(--text-primary)', color: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
  }
  const prodLabel = (p: any) => p.projektnummer ? `${p.projektnummer} · ${p.title}` : p.title

  return (
    <div style={{ padding: '28px 32px', maxWidth: 760, display: 'flex', flexDirection: 'column', gap: 36 }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Fassungen & Revision</h2>

      {/* Produktion wählen */}
      <div>
        <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Produktion</label>
        <select
          value={selectedProdId}
          onChange={e => setSelectedProdId(e.target.value)}
          style={{ ...inputStyle, flex: undefined, width: '100%' }}
        >
          <option value="">— Produktion wählen —</option>
          {productions.filter(p => p.is_active).map(p => <option key={p.id} value={p.id}>{prodLabel(p)}</option>)}
          {productions.filter(p => !p.is_active).length > 0 && (
            <optgroup label="Inaktiv">
              {productions.filter(p => !p.is_active).map(p => <option key={p.id} value={p.id}>{prodLabel(p)}</option>)}
            </optgroup>
          )}
        </select>
      </div>

      {selectedProdId && loading && <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Lädt…</p>}

      {selectedProdId && !loading && (
        <>
          {/* Stage Labels */}
          <section>
            <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Werkstufen-Labels</h3>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 14px', lineHeight: 1.6 }}>
              Labels erscheinen im Werkstufen-Dropdown. „Produktionsfassung" markiert die finale Version.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
              {stageLabels.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>Noch keine Labels.</p>}
              {stageLabels.map(l => (
                <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8 }}>
                  {editingLabelId === l.id ? (
                    <input
                      ref={renameInputRef}
                      value={editingLabelName}
                      onChange={e => setEditingLabelName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') commitRename(l); if (e.key === 'Escape') setEditingLabelId(null) }}
                      onBlur={() => commitRename(l)}
                      style={{ flex: 1, fontSize: 13, padding: '2px 6px', borderRadius: 5, border: '1px solid var(--info)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontFamily: 'inherit', minHeight: 28 }}
                      autoFocus
                    />
                  ) : (
                    <Tooltip text="Klicken zum Umbenennen">
                      <span
                        onClick={() => startRename(l)}
                        style={{ flex: 1, fontSize: 13, cursor: 'text', minHeight: 28, display: 'flex', alignItems: 'center' }}
                      >{l.name}</span>
                    </Tooltip>
                  )}
                  {l.is_produktionsfassung && (
                    <span style={{ fontSize: 10, fontWeight: 600, color: '#00C853', background: 'rgba(0,200,83,0.1)', borderRadius: 4, padding: '1px 6px', flexShrink: 0 }}>Produktion</span>
                  )}
                  <Tooltip text={l.is_produktionsfassung ? 'Als Nicht-Produktionsfassung markieren' : 'Als Produktionsfassung markieren'}>
                    <button
                      onClick={() => toggleLabelProd(l)}
                      style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', fontSize: 11, padding: '4px 8px', color: 'var(--text-secondary)', minHeight: 28 }}
                    >
                      {l.is_produktionsfassung ? '✓ Prod' : 'Prod?'}
                    </button>
                  </Tooltip>
                  <Tooltip text="Label löschen">
                    <button
                      onClick={() => requestDeleteLabel(l)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 15, padding: '4px 6px', minHeight: 28, minWidth: 28 }}
                    >×</button>
                  </Tooltip>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={newLabelName} onChange={e => setNewLabelName(e.target.value)} placeholder="Label-Name…" style={inputStyle}
                onKeyDown={e => e.key === 'Enter' && addLabel()} />
              <button onClick={addLabel} disabled={!newLabelName.trim() || saving} style={btnStyle}>+ Hinzufügen</button>
            </div>
          </section>

          {/* Revision Colors */}
          <section>
            <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Revisionsfarben</h3>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 14px', lineHeight: 1.6 }}>
              WGA-Standardfarben für Revisionen. Die aktive Farbe wird als <code>*</code> im Editor angezeigt.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
              {revColors.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0, width: '100%' }}>Noch keine Farben.</p>}
              {revColors.map(c => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', background: 'var(--bg-surface)', border: `1.5px solid ${c.color}44`, borderRadius: 8 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: c.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: c.color, fontWeight: 600 }}>{c.name}</span>
                  <button onClick={() => deleteColor(c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 13, padding: '0 2px', marginLeft: 2 }}>×</button>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input value={newColorName} onChange={e => setNewColorName(e.target.value)} placeholder="Farb-Name…" style={{ ...inputStyle, maxWidth: 200 }}
                onKeyDown={e => e.key === 'Enter' && addColor()} />
              <input type="color" value={newColorHex} onChange={e => setNewColorHex(e.target.value)}
                style={{ width: 36, height: 32, borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer', padding: 2 }} />
              <button onClick={addColor} disabled={!newColorName.trim() || saving} style={btnStyle}>+ Hinzufügen</button>
              <button onClick={seedWgaDefaults} disabled={saving}
                style={{ ...btnStyle, background: 'var(--bg-subtle)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                WGA-Standard einfügen
              </button>
            </div>
          </section>
        </>
      )}

      {msg && <p style={{ fontSize: 12, color: 'var(--sw-green)' }}>{msg}</p>}

      {/* Delete-Confirmation-Modal */}
      {deleteConfirm && createPortal(
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) setDeleteConfirm(null) }}
        >
          <div style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: '28px 28px 24px', width: 420, maxWidth: '92vw', boxShadow: '0 8px 32px rgba(0,0,0,0.25)' }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 12px' }}>Label löschen</h3>
            <p style={{ fontSize: 13, color: 'var(--text-primary)', margin: '0 0 8px', lineHeight: 1.6 }}>
              Das Label <strong>„{deleteConfirm.label.name}"</strong> ist in Verwendung:
            </p>
            <ul style={{ margin: '0 0 14px', paddingLeft: 18, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
              {deleteConfirm.impact.affectedWerkstufen > 0 && (
                <li>{deleteConfirm.impact.affectedWerkstufen} Werkstufe{deleteConfirm.impact.affectedWerkstufen !== 1 ? 'n' : ''} tragen dieses Label</li>
              )}
              {deleteConfirm.impact.isTrigger && (
                <li style={{ color: 'var(--sw-warning, #FFCC00)', fontWeight: 600 }}>Dieses Label ist als Gate-Trigger konfiguriert — Gate wird deaktiviert</li>
              )}
            </ul>
            {deleteConfirm.impact.affectedWerkstufen > 0 && stageLabels.filter(l => l.id !== deleteConfirm.label.id).length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>Ersatz-Label (optional)</label>
                <select
                  value={deleteReplacement}
                  onChange={e => setDeleteReplacement(e.target.value)}
                  style={{ width: '100%', fontSize: 12, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontFamily: 'inherit', minHeight: 36 }}
                >
                  <option value="">— kein Ersatz (label wird NULL) —</option>
                  {stageLabels.filter(l => l.id !== deleteConfirm.label.id).map(l => (
                    <option key={l.id} value={l.name}>{l.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <button
                onClick={() => setDeleteConfirm(null)}
                style={{ padding: '8px 18px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-subtle)', color: 'var(--text-primary)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', minHeight: 36 }}
              >Abbrechen</button>
              <button
                onClick={confirmForceDelete}
                disabled={saving}
                style={{ padding: '8px 18px', borderRadius: 7, border: 'none', background: '#FF3B30', color: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, minHeight: 36 }}
              >Trotzdem löschen</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState('ki')
  const navigate = useNavigate()

  // ←→ Pfeiltasten-Navigation zwischen Admin-Tabs
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return
      const idx = ADMIN_TABS.findIndex(t => t.id === activeTab)
      if (idx === -1) return
      if (e.key === 'ArrowLeft' && idx > 0) setActiveTab(ADMIN_TABS[idx - 1].id)
      if (e.key === 'ArrowRight' && idx < ADMIN_TABS.length - 1) setActiveTab(ADMIN_TABS[idx + 1].id)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activeTab])

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
              &larr; Zurück
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
          {activeTab === 'dk-zugriff'     && <DkZugriffTab />}
          {activeTab === 'fassungen'      && <FassungenRevisionTab />}
          {activeTab === 'dokument'       && <DokumentAdminTab />}
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
          {activeTab === 'autorenplan'    && <AutorenplanAdminTab />}
          {activeTab === 'analyse'        && <AnalyseAdminTab />}
          {activeTab === 'private-docs'   && <PrivateDokumenteAdminTab />}
          {activeTab === 'pwa'            && <PwaAdminTab />}
        </div>
      </div>
    </AppShell>
  )
}
