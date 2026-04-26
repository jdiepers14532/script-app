import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import AppShell from '../components/AppShell'
import AdminKI from '../components/AdminKI'
import { api } from '../api/client'
import { useSelectedProduction } from '../App'

const ADMIN_TABS = [
  { id: 'ki',         label: 'KI-Konfiguration' },
  { id: 'produktion', label: 'Produktion' },
  { id: 'wasserzeichen', label: 'Wasserzeichen & Export-Log' },
  { id: 'allgemein',  label: 'Allgemein' },
  { id: 'export',     label: 'Export-Vorlagen' },
  { id: 'locks',      label: 'Lock-Regeln' },
  { id: 'users',      label: 'Benutzer & Rollen' },
  { id: 'audit',      label: 'Audit-Log' },
]

function AllgemeinTab() {
  const [treatmentLabel, setTreatmentLabel] = useState<'Treatment' | 'Storylines' | 'Outline' | null>(null)
  const [roles, setRoles] = useState<string[] | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    // Treatment label from script backend
    fetch('/api/admin/app-settings', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((data: any) => { if (data?.treatment_label) setTreatmentLabel(data.treatment_label) })
      .catch(() => {})

    // Roles from auth app
    fetch('https://auth.serienwerft.studio/api/auth/my-apps', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((data: any) => {
        const script = (data?.apps || []).find((a: any) => a.subdomain === 'script')
        setRoles(script?.roles || [])
      })
      .catch(() => {})
  }, [])

  const saveTreatmentLabel = async (val: 'Treatment' | 'Storylines' | 'Outline') => {
    setTreatmentLabel(val)
    setSaving(true)
    await fetch('/api/admin/app-settings/treatment_label', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: val }),
    }).catch(() => {})
    setSaving(false)
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 600, display: 'flex', flexDirection: 'column', gap: 32 }}>

      <section>
        <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 4px' }}>Treatment-Bezeichnung</h3>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 16px', lineHeight: 1.6 }}>
          Legt fest, wie die Vorstufe vor dem Drehbuch in allen Apps dieser Produktion bezeichnet wird.
        </p>
        <div className="seg" style={{ display: 'inline-flex' }}>
          {(['Treatment', 'Storylines', 'Outline'] as const).map(opt => (
            <button
              key={opt}
              className={treatmentLabel === opt ? 'on' : ''}
              onClick={() => saveTreatmentLabel(opt)}
              disabled={saving}
            >
              {opt}
            </button>
          ))}
        </div>
        {saving && <span style={{ marginLeft: 12, fontSize: 12, color: 'var(--text-secondary)' }}>Wird gespeichert…</span>}
      </section>

      <section>
        <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 4px' }}>Zugriff</h3>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 12px', lineHeight: 1.6 }}>
          User mit Zugriff auf die Script-App werden in der Auth-App verwaltet.
        </p>
        <div className="admin-roles-list">
          {roles === null
            ? <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Lädt…</span>
            : roles.length === 0
            ? <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>—</span>
            : roles.map(r => <span key={r} className="admin-role-chip">{r}</span>)
          }
        </div>
      </section>

    </div>
  )
}

function WasserzeichenTab() {
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
            {decodeFile ? `📄 ${decodeFile.name}` : '+ Datei auswählen'}
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
                    {[
                      ['Exportiert von', decodeResult.log.user_name],
                      ['User-ID',        decodeResult.log.user_id],
                      ['Zeitpunkt',      fmt(decodeResult.log.exported_at)],
                      ['Format',         decodeResult.log.format],
                      ['Fassung',        decodeResult.log.version_label || decodeResult.log.stage_type || '—'],
                      ['Staffel',        decodeResult.log.staffel_titel || '—'],
                      ['Folge',          decodeResult.log.folge_nummer || '—'],
                    ].map(([label, value]) => (
                      <tr key={label}>
                        <td style={{ padding: '4px 12px 4px 0', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{label}</td>
                        <td style={{ padding: '4px 0', fontWeight: 500 }}>{value}</td>
                      </tr>
                    ))}
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
            {logsLoading ? 'Lädt…' : logs ? 'Aktualisieren' : 'Laden'}
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
                  {['Zeitpunkt', 'Benutzer', 'Format', 'Fassung', 'Staffel', 'Folge'].map(h => (
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

// ── Drag-sortable list helper ──────────────────────────────────────────────────
function SortableList({
  items, onReorder, renderItem,
}: {
  items: any[]
  onReorder: (newItems: any[]) => void
  renderItem: (item: any, dragHandle: React.ReactNode) => React.ReactNode
}) {
  const dragIdx = useRef<number | null>(null)
  const overIdx = useRef<number | null>(null)

  return (
    <div>
      {items.map((item, i) => (
        <div
          key={item.id}
          draggable
          onDragStart={() => { dragIdx.current = i }}
          onDragOver={e => { e.preventDefault(); overIdx.current = i }}
          onDrop={() => {
            if (dragIdx.current === null || dragIdx.current === overIdx.current) return
            const arr = [...items]
            const [moved] = arr.splice(dragIdx.current, 1)
            arr.splice(overIdx.current!, 0, moved)
            onReorder(arr)
            dragIdx.current = null; overIdx.current = null
          }}
          style={{ userSelect: 'none' }}
        >
          {renderItem(item, (
            <span style={{ cursor: 'grab', color: 'var(--text-muted)', fontSize: 14, lineHeight: 1, paddingRight: 8 }}>⠿</span>
          ))}
        </div>
      ))}
    </div>
  )
}

// ── Produktion Tab ─────────────────────────────────────────────────────────────
function ProduktionTab() {
  const { selectedProduction } = useSelectedProduction()
  // staffeln.id = produktion_db_id = selectedProduction.id (set during sync)
  const staffelId = selectedProduction?.id ?? ''

  const [kategorien, setKategorien] = useState<any[]>([])
  const [labels, setLabels] = useState<any[]>([])
  const [colors, setColors] = useState<any[]>([])
  const [memoSchwelle, setMemoSchwelle] = useState<number>(100)
  const [vorstoppEin, setVorstoppEin] = useState<{ methode: string; menge: number; dauer_sekunden: number }>({
    methode: 'seiten', menge: 54, dauer_sekunden: 60,
  })
  const [saving, setSaving] = useState<Record<string, boolean>>({})

  // New-item input state
  const [newKat, setNewKat] = useState({ name: '', typ: 'rolle' as 'rolle' | 'komparse' })
  const [newLabel, setNewLabel] = useState({ name: '', is_produktionsfassung: false })
  const [newColor, setNewColor] = useState({ name: '', color: '#4A90D9' })

  // Copy-settings state
  const [allStaffeln, setAllStaffeln] = useState<any[]>([])
  const [copyOpen, setCopyOpen] = useState(false)
  const [copySearch, setCopySearch] = useState('')
  const [copySourceId, setCopySourceId] = useState('')
  const [copySections, setCopySections] = useState<string[]>(['kategorien', 'labels', 'colors', 'einstellungen'])
  const [copyConfirm, setCopyConfirm] = useState(false)
  const [copying, setCopying] = useState(false)
  const [copyDropOpen, setCopyDropOpen] = useState(false)

  useEffect(() => {
    api.getStaffeln().then(setAllStaffeln).catch(() => {})
  }, [])

  useEffect(() => {
    if (!staffelId) return
    api.getCharKategorien(staffelId).then(setKategorien).catch(() => setKategorien([]))
    api.getStageLabels(staffelId).then(setLabels).catch(() => setLabels([]))
    api.getRevisionColors(staffelId).then(setColors).catch(() => setColors([]))
    api.getRevisionEinstellungen(staffelId).then(e => setMemoSchwelle(e.memo_schwellwert_zeichen ?? 100)).catch(() => {})
    api.getVorstoppEinstellungen(staffelId).then(e => setVorstoppEin({
      methode: e.methode ?? 'seiten',
      menge: e.menge ?? 54,
      dauer_sekunden: e.dauer_sekunden ?? 60,
    })).catch(() => {})
  }, [staffelId])

  const busy = (key: string) => saving[key]
  const set = (key: string, v: boolean) => setSaving(s => ({ ...s, [key]: v }))

  // ── Character Kategorien ──
  const addKat = async () => {
    if (!newKat.name.trim()) return
    set('kat', true)
    try {
      const r = await api.createCharKategorie(staffelId, newKat)
      setKategorien(prev => [...prev, r])
      setNewKat({ name: '', typ: 'rolle' })
    } catch {} finally { set('kat', false) }
  }
  const delKat = async (id: number) => {
    try { await api.deleteCharKategorie(staffelId, id); setKategorien(prev => prev.filter(k => k.id !== id)) } catch {}
  }
  const reorderKat = async (ordered: any[]) => {
    setKategorien(ordered)
    const order = ordered.map((k, i) => ({ id: k.id, sort_order: i + 1 }))
    try { const r = await api.reorderCharKategorien(staffelId, order); setKategorien(r) } catch {}
  }

  // ── Stage Labels ──
  const addLabel = async () => {
    if (!newLabel.name.trim()) return
    set('lbl', true)
    try {
      const r = await api.createStageLabel(staffelId, newLabel)
      setLabels(prev => [...prev, r])
      setNewLabel({ name: '', is_produktionsfassung: false })
    } catch {} finally { set('lbl', false) }
  }
  const delLabel = async (id: number) => {
    try { await api.deleteStageLabel(staffelId, id); setLabels(prev => prev.filter(l => l.id !== id)) } catch {}
  }
  const toggleProd = async (id: number, current: boolean) => {
    try {
      const r = await api.updateStageLabel(staffelId, id, { is_produktionsfassung: !current })
      setLabels(prev => prev.map(l => l.id === id ? r : l))
    } catch {}
  }
  const reorderLabels = async (ordered: any[]) => {
    setLabels(ordered)
    const order = ordered.map((l, i) => ({ id: l.id, sort_order: i + 1 }))
    try { const r = await api.reorderStageLabels(staffelId, order); setLabels(r) } catch {}
  }

  // ── Revision Colors ──
  const addColor = async () => {
    if (!newColor.name.trim()) return
    set('col', true)
    try {
      const r = await api.createRevisionColor(staffelId, newColor)
      setColors(prev => [...prev, r])
      setNewColor({ name: '', color: '#4A90D9' })
    } catch {} finally { set('col', false) }
  }
  const delColor = async (id: number) => {
    try { await api.deleteRevisionColor(staffelId, id); setColors(prev => prev.filter(c => c.id !== id)) } catch {}
  }
  const reorderColors = async (ordered: any[]) => {
    setColors(ordered)
    const order = ordered.map((c, i) => ({ id: c.id, sort_order: i + 1 }))
    try { const r = await api.reorderRevisionColors(staffelId, order); setColors(r) } catch {}
  }
  const saveMemo = async () => {
    set('memo', true)
    try { await api.updateRevisionEinstellungen(staffelId, { memo_schwellwert_zeichen: memoSchwelle }) }
    catch {} finally { set('memo', false) }
  }
  const saveVorstopp = async () => {
    set('vs', true)
    try { await api.updateVorstoppEinstellungen(staffelId, vorstoppEin) }
    catch {} finally { set('vs', false) }
  }

  const reloadAll = () => {
    if (!staffelId) return
    api.getCharKategorien(staffelId).then(setKategorien).catch(() => setKategorien([]))
    api.getStageLabels(staffelId).then(setLabels).catch(() => setLabels([]))
    api.getRevisionColors(staffelId).then(setColors).catch(() => setColors([]))
    api.getRevisionEinstellungen(staffelId).then(e => setMemoSchwelle(e.memo_schwellwert_zeichen ?? 100)).catch(() => {})
  }

  const executeCopy = async () => {
    if (!copySourceId || !copySections.length) return
    setCopying(true)
    try {
      await api.copySettings(staffelId, { source_staffel_id: copySourceId, sections: copySections })
      reloadAll()
      setCopyConfirm(false)
      setCopyOpen(false)
      setCopySourceId('')
      setCopySearch('')
    } catch (err: any) {
      alert('Fehler beim Kopieren: ' + err.message)
    } finally {
      setCopying(false)
    }
  }

  const sectionStyle: React.CSSProperties = { marginBottom: 40 }
  const h3Style: React.CSSProperties = { fontSize: 13, fontWeight: 600, margin: '0 0 4px' }
  const subStyle: React.CSSProperties = { fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 14px', lineHeight: 1.6 }
  const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 4 }
  const inputStyle: React.CSSProperties = { fontSize: 13, padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontFamily: 'inherit', outline: 'none' }
  const btnStyle: React.CSSProperties = { fontSize: 12, padding: '6px 14px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-subtle)', cursor: 'pointer', fontFamily: 'inherit' }
  const delBtnStyle: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14, padding: '0 4px', lineHeight: 1 }

  const copySourceName = allStaffeln.find(s => s.id === copySourceId)?.titel ?? ''
  const filteredStaffeln = allStaffeln.filter(s => s.id !== staffelId && (!copySearch || s.titel.toLowerCase().includes(copySearch.toLowerCase())))
  const COPY_SECTIONS = [
    { id: 'kategorien', label: 'Charakter-Kategorien' },
    { id: 'labels',     label: 'Fassungs-Labels' },
    { id: 'colors',     label: 'Revisions-Farben' },
    { id: 'einstellungen', label: 'Revisions-Export' },
  ]

  if (!selectedProduction) {
    return (
      <div style={{ padding: '28px 32px', color: 'var(--text-secondary)', fontSize: 13 }}>
        Keine Produktion ausgewählt. Wähle eine Produktion im Header aus.
      </div>
    )
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 640 }}>

      {/* Production header */}
      <div style={{ marginBottom: 28, padding: '14px 18px', background: 'var(--bg-subtle)', borderRadius: 10, border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
          Produktionsspezifische Einstellungen von
        </div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>
          {[
            selectedProduction.projektnummer,
            selectedProduction.title,
            selectedProduction.staffelnummer != null ? `Staffel ${selectedProduction.staffelnummer}` : null
          ].filter(Boolean).join(' · ')}
        </div>
        {selectedProduction.staffelnummer != null && (
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>
            Reihe: {selectedProduction.title}
          </div>
        )}
      </div>

      {/* Copy settings section */}
      <section style={{ ...sectionStyle, border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <button
          onClick={() => setCopyOpen(v => !v)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px', background: 'var(--bg-subtle)', border: 'none', cursor: 'pointer',
            fontFamily: 'inherit', fontSize: 13, fontWeight: 500, color: 'var(--text-primary)',
          }}
        >
          <span>Einstellungen kopieren von…</span>
          <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{copyOpen ? '▲' : '▼'}</span>
        </button>

        {copyOpen && (
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Source autocomplete */}
            <div style={{ position: 'relative' }}>
              <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                Quelle (Produktion)
              </label>
              <input
                style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
                placeholder="Produktion suchen…"
                value={copySourceId ? copySourceName : copySearch}
                onChange={e => { setCopySearch(e.target.value); setCopySourceId(''); setCopyDropOpen(true) }}
                onFocus={() => setCopyDropOpen(true)}
                onBlur={() => setTimeout(() => setCopyDropOpen(false), 150)}
              />
              {copyDropOpen && filteredStaffeln.length > 0 && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                  background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8,
                  marginTop: 2, maxHeight: 180, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
                }}>
                  {filteredStaffeln.map(s => (
                    <div
                      key={s.id}
                      onMouseDown={() => { setCopySourceId(s.id); setCopySearch(''); setCopyDropOpen(false) }}
                      style={{
                        padding: '8px 12px', cursor: 'pointer', fontSize: 13,
                        background: copySourceId === s.id ? 'var(--bg-subtle)' : undefined,
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-subtle)')}
                      onMouseLeave={e => (e.currentTarget.style.background = copySourceId === s.id ? 'var(--bg-subtle)' : '')}
                    >
                      {s.titel}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Section checkboxes */}
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8 }}>Bereiche kopieren</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {COPY_SECTIONS.map(sec => (
                  <label key={sec.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={copySections.includes(sec.id)}
                      onChange={e => setCopySections(prev =>
                        e.target.checked ? [...prev, sec.id] : prev.filter(s => s !== sec.id)
                      )}
                    />
                    {sec.label}
                  </label>
                ))}
              </div>
            </div>

            {/* Confirm / copy button */}
            {!copyConfirm ? (
              <button
                onClick={() => setCopyConfirm(true)}
                disabled={!copySourceId || !copySections.length}
                style={{
                  alignSelf: 'flex-start', padding: '8px 16px', borderRadius: 8,
                  background: copySourceId && copySections.length ? 'var(--text-primary)' : 'var(--bg-subtle)',
                  color: copySourceId && copySections.length ? 'var(--text-inverse)' : 'var(--text-muted)',
                  border: 'none', cursor: copySourceId && copySections.length ? 'pointer' : 'not-allowed',
                  fontFamily: 'inherit', fontWeight: 600, fontSize: 13,
                }}
              >
                Kopieren…
              </button>
            ) : (
              <div style={{ padding: '12px 14px', background: 'rgba(255,59,48,0.06)', borderRadius: 8, border: '1px solid rgba(255,59,48,0.3)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.5 }}>
                  <strong>Achtung:</strong> Die bestehenden Einstellungen von{' '}
                  <strong>{[selectedProduction.projektnummer, selectedProduction.title, selectedProduction.staffelnummer != null ? `Staffel ${selectedProduction.staffelnummer}` : null].filter(Boolean).join(' · ')}</strong>{' '}
                  werden durch die Einstellungen von <strong>{copySourceName}</strong> ersetzt.
                  Bereiche: {copySections.map(s => COPY_SECTIONS.find(c => c.id === s)?.label).join(', ')}.
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={executeCopy}
                    disabled={copying}
                    style={{ padding: '7px 16px', borderRadius: 7, background: 'var(--sw-danger)', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, fontSize: 13 }}
                  >
                    {copying ? 'Kopiert…' : 'Ja, ersetzen'}
                  </button>
                  <button
                    onClick={() => setCopyConfirm(false)}
                    disabled={copying}
                    style={btnStyle}
                  >
                    Abbrechen
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Character Kategorien ── */}
      <section style={sectionStyle}>
        <h3 style={h3Style}>Charakter-Kategorien</h3>
        <p style={subStyle}>Definiert die Kategorien für Rollen und Komparsen in dieser Produktion. Reihenfolge per Drag &amp; Drop.</p>

        <SortableList
          items={kategorien}
          onReorder={reorderKat}
          renderItem={(k, handle) => (
            <div style={rowStyle}>
              {handle}
              <span style={{ fontSize: 10, color: 'var(--text-muted)', background: 'var(--bg-subtle)', padding: '2px 7px', borderRadius: 99, fontWeight: 600, textTransform: 'uppercase', flexShrink: 0 }}>
                {k.typ === 'komparse' ? 'Komparse' : 'Rolle'}
              </span>
              <span style={{ flex: 1, fontSize: 13 }}>{k.name}</span>
              <button style={delBtnStyle} onClick={() => delKat(k.id)} title="Löschen">×</button>
            </div>
          )}
        />

        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input
            style={{ ...inputStyle, flex: 1 }}
            placeholder="Neue Kategorie…"
            value={newKat.name}
            onChange={e => setNewKat(v => ({ ...v, name: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && addKat()}
          />
          <select style={inputStyle} value={newKat.typ} onChange={e => setNewKat(v => ({ ...v, typ: e.target.value as any }))}>
            <option value="rolle">Rolle</option>
            <option value="komparse">Komparse</option>
          </select>
          <button style={btnStyle} onClick={addKat} disabled={busy('kat') || !newKat.name.trim()}>
            {busy('kat') ? '…' : '+ Hinzufügen'}
          </button>
        </div>
      </section>

      {/* ── Stage Labels ── */}
      <section style={sectionStyle}>
        <h3 style={h3Style}>Fassungs-Labels</h3>
        <p style={subStyle}>Labels für Fassungen (Stages) dieser Produktion. Ein Label kann als Produktionsfassung markiert werden — dieses löst den Schloss-Mechanismus aus.</p>

        <SortableList
          items={labels}
          onReorder={reorderLabels}
          renderItem={(l, handle) => (
            <div style={rowStyle}>
              {handle}
              <span style={{ flex: 1, fontSize: 13 }}>{l.name}</span>
              <button
                onClick={() => toggleProd(l.id, l.is_produktionsfassung)}
                style={{
                  fontSize: 11, padding: '2px 8px', borderRadius: 99, border: '1px solid',
                  cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
                  background: l.is_produktionsfassung ? 'var(--text-primary)' : 'var(--bg-subtle)',
                  color: l.is_produktionsfassung ? 'var(--text-inverse)' : 'var(--text-secondary)',
                  borderColor: l.is_produktionsfassung ? 'var(--text-primary)' : 'var(--border)',
                }}
                title="Als Produktionsfassung markieren"
              >
                {l.is_produktionsfassung ? '🔒 Produktion' : 'Kein PF'}
              </button>
              <button style={delBtnStyle} onClick={() => delLabel(l.id)} title="Löschen">×</button>
            </div>
          )}
        />

        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input
            style={{ ...inputStyle, flex: 1 }}
            placeholder="Neues Label…"
            value={newLabel.name}
            onChange={e => setNewLabel(v => ({ ...v, name: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && addLabel()}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={newLabel.is_produktionsfassung}
              onChange={e => setNewLabel(v => ({ ...v, is_produktionsfassung: e.target.checked }))}
            />
            Produktionsfassung
          </label>
          <button style={btnStyle} onClick={addLabel} disabled={busy('lbl') || !newLabel.name.trim()}>
            {busy('lbl') ? '…' : '+ Hinzufügen'}
          </button>
        </div>
      </section>

      {/* ── Revision Colors ── */}
      <section style={sectionStyle}>
        <h3 style={h3Style}>Revisions-Farben (WGA-Standard)</h3>
        <p style={subStyle}>Farbmarkierung für Revisionsstände. Reihenfolge bestimmt die Revisions-Sequenz.</p>

        <SortableList
          items={colors}
          onReorder={reorderColors}
          renderItem={(c, handle) => (
            <div style={rowStyle}>
              {handle}
              <span style={{ width: 16, height: 16, borderRadius: 4, background: c.color, flexShrink: 0, border: '1px solid rgba(0,0,0,0.1)' }} />
              <span style={{ flex: 1, fontSize: 13 }}>{c.name}</span>
              <code style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.color}</code>
              <button style={delBtnStyle} onClick={() => delColor(c.id)} title="Löschen">×</button>
            </div>
          )}
        />

        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <input
            style={{ ...inputStyle, flex: 1, minWidth: 160 }}
            placeholder="Name (z.B. Pinke Seiten)…"
            value={newColor.name}
            onChange={e => setNewColor(v => ({ ...v, name: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && addColor()}
          />
          <input
            type="color"
            value={newColor.color}
            onChange={e => setNewColor(v => ({ ...v, color: e.target.value }))}
            style={{ width: 44, height: 36, border: '1px solid var(--border)', borderRadius: 7, padding: 2, cursor: 'pointer' }}
          />
          <button style={btnStyle} onClick={addColor} disabled={busy('col') || !newColor.name.trim()}>
            {busy('col') ? '…' : '+ Hinzufügen'}
          </button>
        </div>
      </section>

      {/* ── Revision Export Einstellungen ── */}
      <section style={sectionStyle}>
        <h3 style={h3Style}>Revisions-Export</h3>
        <p style={subStyle}>Änderungen mit weniger als dieser Zeichenanzahl werden im Export als kurze Notiz (Memo-Zeile) statt als vollständiger Absatz dargestellt.</p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input
            type="number"
            style={{ ...inputStyle, width: 100 }}
            value={memoSchwelle}
            min={0}
            onChange={e => setMemoSchwelle(parseInt(e.target.value) || 0)}
          />
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Zeichen (Schwellwert)</span>
          <button style={btnStyle} onClick={saveMemo} disabled={busy('memo')}>
            {busy('memo') ? '…' : 'Speichern'}
          </button>
        </div>
      </section>

      {/* ── Vorstopp Einstellungen ── */}
      <section style={sectionStyle}>
        <h3 style={h3Style}>Vorstopp-Einstellungen</h3>
        <p style={subStyle}>Basis für die automatische Vorstopp-Berechnung aus der Seitenanzahl einer Szene.</p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Methode</span>
            <select
              style={inputStyle}
              value={vorstoppEin.methode}
              onChange={e => setVorstoppEin(v => ({ ...v, methode: e.target.value }))}
            >
              <option value="seiten">Seiten</option>
              <option value="sekunden">Sekunden direkt</option>
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              {vorstoppEin.methode === 'seiten' ? 'Sekunden pro Seite (1/8)' : 'Menge'}
            </span>
            <input
              type="number"
              style={{ ...inputStyle, width: 120 }}
              value={vorstoppEin.menge}
              min={0}
              step={0.5}
              onChange={e => setVorstoppEin(v => ({ ...v, menge: parseFloat(e.target.value) || 0 }))}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Dauer gesamt (Sek.)</span>
            <input
              type="number"
              style={{ ...inputStyle, width: 100 }}
              value={vorstoppEin.dauer_sekunden}
              min={0}
              onChange={e => setVorstoppEin(v => ({ ...v, dauer_sekunden: parseInt(e.target.value) || 0 }))}
            />
          </div>
          <button style={{ ...btnStyle, alignSelf: 'flex-end' }} onClick={saveVorstopp} disabled={busy('vs')}>
            {busy('vs') ? '…' : 'Speichern'}
          </button>
        </div>
      </section>

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
              ← Zurück
            </button>
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>
              Einstellungen
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
          {activeTab === 'ki'              && <AdminKI />}
          {activeTab === 'produktion'      && <ProduktionTab />}
          {activeTab === 'wasserzeichen'   && <WasserzeichenTab />}
          {activeTab === 'allgemein'       && <AllgemeinTab />}
          {activeTab !== 'ki' && activeTab !== 'produktion' && activeTab !== 'wasserzeichen' && activeTab !== 'allgemein' && (
            <div style={{ padding: '28px 32px', color: 'var(--text-secondary)', fontSize: 13 }}>
              Dieser Bereich ist noch in Entwicklung.
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
