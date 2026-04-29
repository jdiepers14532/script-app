import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import AppShell from '../components/AppShell'
import AdminKI from '../components/AdminKI'
import { api } from '../api/client'
import { useSelectedProduction } from '../contexts'

const ADMIN_TABS = [
  { id: 'ki',                   label: 'KI-Konfiguration' },
  { id: 'produktion',           label: 'Produktion' },
  { id: 'wasserzeichen',        label: 'Wasserzeichen & Export-Log' },
  { id: 'allgemein',            label: 'Allgemein' },
  { id: 'figuren',              label: 'Figuren' },
  { id: 'export',               label: 'Export-Vorlagen' },
  { id: 'locks',                label: 'Lock-Regeln' },
  { id: 'users',                label: 'Benutzer & Rollen' },
  { id: 'audit',                label: 'Audit-Log' },
  { id: 'dokument-typen',       label: 'Dokument-Typen' },
  { id: 'colab-gruppen',        label: 'Colab-Gruppen' },
  { id: 'format-templates',     label: 'Format-Templates' },
  { id: 'benachrichtigungen',   label: 'Benachrichtigungen' },
  { id: 'dokument-einstellungen', label: 'Dokument-Einstellungen' },
]

const KUERZEL_FIELDS = [
  { key: 'int',       label: 'Innen (INT)' },
  { key: 'ext',       label: 'Außen (EXT)' },
  { key: 'tag',       label: 'Tag' },
  { key: 'nacht',     label: 'Nacht' },
  { key: 'daemmerung',label: 'Dämmerung' },
  { key: 'abend',     label: 'Abend' },
]
const DEFAULT_KUERZEL: Record<string, string> = { int: 'I', ext: 'E', tag: 'T', nacht: 'N', daemmerung: 'D', abend: 'A' }

function AllgemeinTab() {
  const [treatmentLabel, setTreatmentLabel] = useState<'Treatment' | 'Storylines' | 'Outline' | null>(null)
  const [kuerzel, setKuerzel] = useState<Record<string, string>>(DEFAULT_KUERZEL)
  const [roles, setRoles] = useState<string[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [kuerzelSaving, setKuerzelSaving] = useState(false)

  useEffect(() => {
    // Treatment label from script backend
    fetch('/api/admin/app-settings', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((data: any) => {
        if (data?.treatment_label) setTreatmentLabel(data.treatment_label)
        if (data?.scene_kuerzel) {
          try { setKuerzel({ ...DEFAULT_KUERZEL, ...JSON.parse(data.scene_kuerzel) }) } catch {}
        }
      })
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

  const saveKuerzel = async (next: Record<string, string>) => {
    setKuerzel(next)
    setKuerzelSaving(true)
    await fetch('/api/admin/app-settings/scene_kuerzel', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: JSON.stringify(next) }),
    }).catch(() => {})
    setKuerzelSaving(false)
  }

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
        <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 4px' }}>Szenen-Kürzel</h3>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 16px', lineHeight: 1.6 }}>
          Abkürzungen für die einzeilige Szenenübersicht.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, maxWidth: 360 }}>
          {KUERZEL_FIELDS.map(({ key, label }) => (
            <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500 }}>{label}</span>
              <input
                type="text"
                maxLength={4}
                value={kuerzel[key] ?? ''}
                onChange={e => setKuerzel(prev => ({ ...prev, [key]: e.target.value }))}
                onBlur={() => saveKuerzel(kuerzel)}
                style={{ width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-surface)', fontSize: 13, fontFamily: 'inherit', textTransform: 'uppercase' }}
              />
            </label>
          ))}
        </div>
        <button
          style={{ marginTop: 12, padding: '6px 14px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-subtle)', fontSize: 12, cursor: 'pointer' }}
          onClick={() => saveKuerzel(DEFAULT_KUERZEL)}
          disabled={kuerzelSaving}
        >
          Zurücksetzen
        </button>
        {kuerzelSaving && <span style={{ marginLeft: 10, fontSize: 12, color: 'var(--text-secondary)' }}>Wird gespeichert…</span>}
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
  const { selectedProduction, productions } = useSelectedProduction()
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
  const [copyOpen, setCopyOpen] = useState(false)
  const [copySearch, setCopySearch] = useState('')
  const [copySourceId, setCopySourceId] = useState('')
  const [copySections, setCopySections] = useState<string[]>(['kategorien', 'labels', 'colors', 'einstellungen'])
  const [copyConfirm, setCopyConfirm] = useState(false)
  const [copying, setCopying] = useState(false)
  const [copyDropOpen, setCopyDropOpen] = useState(false)

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

  const prodLabel = (p: any) => {
    const title = p.staffelnummer ? `${p.title} Staffel ${p.staffelnummer}` : p.title
    return p.projektnummer ? `${p.projektnummer} · ${title}` : title
  }
  const copySourceProd = productions.find(p => p.id === copySourceId)
  const copySourceName = copySourceProd ? prodLabel(copySourceProd) : ''
  const othersActive   = productions.filter(p => p.id !== staffelId && p.is_active   && (!copySearch || prodLabel(p).toLowerCase().includes(copySearch.toLowerCase())))
  const othersInactive = productions.filter(p => p.id !== staffelId && !p.is_active  && (!copySearch || prodLabel(p).toLowerCase().includes(copySearch.toLowerCase())))
  const filteredProductions = [...othersActive, ...othersInactive]
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
              {copyDropOpen && filteredProductions.length > 0 && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                  background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8,
                  marginTop: 2, maxHeight: 220, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
                }}>
                  {othersActive.length > 0 && (
                    <div style={{ padding: '5px 10px 2px', fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Aktiv
                    </div>
                  )}
                  {othersActive.map(p => (
                    <div key={p.id} onMouseDown={() => { setCopySourceId(p.id); setCopySearch(''); setCopyDropOpen(false) }}
                      style={{ padding: '7px 12px', cursor: 'pointer', fontSize: 13, background: copySourceId === p.id ? 'var(--bg-subtle)' : undefined }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-subtle)')}
                      onMouseLeave={e => (e.currentTarget.style.background = copySourceId === p.id ? 'var(--bg-subtle)' : '')}
                    >{prodLabel(p)}</div>
                  ))}
                  {othersInactive.length > 0 && (
                    <div style={{ padding: '7px 10px 2px', fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', borderTop: othersActive.length > 0 ? '1px solid var(--border-subtle)' : undefined }}>
                      Inaktiv
                    </div>
                  )}
                  {othersInactive.map(p => (
                    <div key={p.id} onMouseDown={() => { setCopySourceId(p.id); setCopySearch(''); setCopyDropOpen(false) }}
                      style={{ padding: '7px 12px', cursor: 'pointer', fontSize: 13, background: copySourceId === p.id ? 'var(--bg-subtle)' : undefined, opacity: 0.7 }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-subtle)')}
                      onMouseLeave={e => (e.currentTarget.style.background = copySourceId === p.id ? 'var(--bg-subtle)' : '')}
                    >{prodLabel(p)}</div>
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


// ── Admin: Dokument-Typen ──────────────────────────────────────────────────────

function DokumentTypenTab() {
  const { selectedProduction } = useSelectedProduction()
  const staffelId = selectedProduction?.id ?? ''
  const [typen, setTypen] = useState<any[]>([])
  const [name, setName] = useState('')
  const [modus, setModus] = useState<'richtext' | 'screenplay'>('richtext')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const load = async () => {
    if (!staffelId) return
    try { setTypen(await api.getDokumentTypen(staffelId)) } catch {}
  }

  useEffect(() => { load() }, [staffelId])

  const handleAdd = async () => {
    if (!name.trim() || !staffelId) return
    setLoading(true); setMsg(null)
    try {
      await api.createDokumentTyp(staffelId, { name: name.trim(), editor_modus: modus })
      setName(''); await load(); setMsg('Typ erstellt.')
    } catch (e: any) { setMsg(e.message ?? 'Fehler') } finally { setLoading(false) }
  }

  const handleDelete = async (typName: string, typId: number) => {
    if (!confirm(`Typ "${typName}" loeschen?`)) return
    try { await api.deleteDokumentTyp(staffelId, typId); await load() } catch (e: any) { setMsg(e.message) }
  }

  return (
    <div style={{ padding: '28px 32px' }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>Dokument-Typen</h2>
      {!staffelId && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Bitte zuerst eine Produktion wählen.</p>}
      {staffelId && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 24, alignItems: 'center' }}>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Typ-Name (z.B. Expose)"
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, width: 200 }} />
            <select value={modus} onChange={e => setModus(e.target.value as any)}
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, background: 'var(--bg-surface)' }}>
              <option value="richtext">Rich Text</option>
              <option value="screenplay">Drehbuch-Format</option>
            </select>
            <button onClick={handleAdd} disabled={loading || !name.trim()}
              style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: 'var(--text-primary)', color: '#fff', fontSize: 12, cursor: 'pointer' }}>
              Hinzufügen
            </button>
          </div>
          {msg && <p style={{ fontSize: 12, color: 'var(--sw-info)', marginBottom: 12 }}>{msg}</p>}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-secondary)', fontWeight: 500 }}>Name</th>
              <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-secondary)', fontWeight: 500 }}>Editor</th>
              <th style={{ padding: '6px 8px' }} />
            </tr></thead>
            <tbody>
              {typen.map(t => (
                <tr key={t.name} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px' }}>{t.name}</td>
                  <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>{t.editor_modus}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>
                    <button onClick={() => handleDelete(t.name, t.id)}
                      style={{ fontSize: 11, color: '#FF3B30', background: 'none', border: 'none', cursor: 'pointer' }}>Löschen</button>
                  </td>
                </tr>
              ))}
              {typen.length === 0 && <tr><td colSpan={3} style={{ padding: 12, color: 'var(--text-muted)' }}>Keine Custom-Typen.</td></tr>}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}

// ── Admin: Colab-Gruppen ───────────────────────────────────────────────────────

function ColabGruppenTab() {
  const { selectedProduction } = useSelectedProduction()
  const staffelId = selectedProduction?.id ?? ''
  const [gruppen, setGruppen] = useState<any[]>([])
  const [name, setName] = useState('')
  const [typ, setTyp] = useState<'colab' | 'produktion'>('colab')
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [mitglieder, setMitglieder] = useState<Record<number, any[]>>({})
  const [newUserId, setNewUserId] = useState('')
  const [newUserName, setNewUserName] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  const load = async () => {
    if (!staffelId) return
    try { setGruppen(await api.getColabGruppen(staffelId)) } catch {}
  }

  useEffect(() => { load() }, [staffelId])

  const loadMitglieder = async (gruppeId: number) => {
    try {
      const res = await fetch(`/api/admin/colab-gruppen/${gruppeId}/mitglieder`, { credentials: 'include' })
      const data = await res.json()
      setMitglieder(prev => ({ ...prev, [gruppeId]: data }))
    } catch {}
  }

  const handleCreate = async () => {
    if (!name.trim() || !staffelId) return
    try {
      await api.createColabGruppe(staffelId, { name: name.trim(), typ })
      setName(''); await load(); setMsg('Gruppe erstellt.')
    } catch (e: any) { setMsg(e.message) }
  }

  const handleDelete = async (gruppeId: number) => {
    if (!confirm('Gruppe loeschen?')) return
    try { await api.deleteColabGruppe(staffelId, gruppeId); await load() } catch (e: any) { setMsg(e.message) }
  }

  const handleAddMitglied = async (gruppeId: number) => {
    if (!newUserId.trim()) return
    try {
      await fetch(`/api/admin/colab-gruppen/${gruppeId}/mitglieder`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: newUserId.trim(), user_name: newUserName.trim() || newUserId.trim() }),
      })
      setNewUserId(''); setNewUserName(''); loadMitglieder(gruppeId)
    } catch {}
  }

  const handleRemoveMitglied = async (gruppeId: number, userId: string) => {
    try {
      await fetch(`/api/admin/colab-gruppen/${gruppeId}/mitglieder/${userId}`, { method: 'DELETE', credentials: 'include' })
      loadMitglieder(gruppeId)
    } catch {}
  }

  return (
    <div style={{ padding: '28px 32px' }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>Colab-Gruppen</h2>
      {!staffelId && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Bitte zuerst eine Produktion waehlen.</p>}
      {staffelId && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Gruppenname"
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, width: 200 }} />
            <select value={typ} onChange={e => setTyp(e.target.value as any)}
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, background: 'var(--bg-surface)' }}>
              <option value="colab">Colab</option>
              <option value="produktion">Produktion</option>
            </select>
            <button onClick={handleCreate} disabled={!name.trim()}
              style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: 'var(--text-primary)', color: '#fff', fontSize: 12, cursor: 'pointer' }}>
              Erstellen
            </button>
          </div>
          {msg && <p style={{ fontSize: 12, color: 'var(--sw-info)', marginBottom: 8 }}>{msg}</p>}
          <div style={{ marginTop: 16 }}>
            {gruppen.map(g => (
              <div key={g.id} style={{ border: '1px solid var(--border)', borderRadius: 8, marginBottom: 8, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', gap: 8, cursor: 'pointer', background: 'var(--bg-surface)' }}
                  onClick={() => { setExpandedId(expandedId === g.id ? null : g.id); if (expandedId !== g.id) loadMitglieder(g.id) }}>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{g.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-subtle)', padding: '2px 6px', borderRadius: 4 }}>{g.typ}</span>
                  <button onClick={e => { e.stopPropagation(); handleDelete(g.id) }}
                    style={{ fontSize: 11, color: '#FF3B30', background: 'none', border: 'none', cursor: 'pointer' }}>Loeschen</button>
                </div>
                {expandedId === g.id && (
                  <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                      <input value={newUserId} onChange={e => setNewUserId(e.target.value)} placeholder="User-ID"
                        style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)', fontSize: 11, width: 120 }} />
                      <input value={newUserName} onChange={e => setNewUserName(e.target.value)} placeholder="Name"
                        style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)', fontSize: 11, width: 140 }} />
                      <button onClick={() => handleAddMitglied(g.id)}
                        style={{ padding: '4px 10px', borderRadius: 4, border: 'none', background: 'var(--text-primary)', color: '#fff', fontSize: 11, cursor: 'pointer' }}>+</button>
                    </div>
                    {(mitglieder[g.id] ?? []).map((m: any) => (
                      <div key={m.user_id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, fontSize: 12 }}>
                        <span style={{ flex: 1 }}>{m.user_name ?? m.user_id}</span>
                        <button onClick={() => handleRemoveMitglied(g.id, m.user_id)}
                          style={{ fontSize: 11, color: '#FF3B30', background: 'none', border: 'none', cursor: 'pointer' }}>x</button>
                      </div>
                    ))}
                    {(mitglieder[g.id] ?? []).length === 0 && <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Keine Mitglieder.</p>}
                  </div>
                )}
              </div>
            ))}
            {gruppen.length === 0 && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Keine Gruppen.</p>}
          </div>
        </>
      )}
    </div>
  )
}

// ── Admin: Format-Templates ────────────────────────────────────────────────────

function FormatTemplatesTab() {
  const [templates, setTemplates] = useState<any[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [elemente, setElemente] = useState<any[]>([])
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    api.getFormatTemplates().then(setTemplates).catch(() => {})
  }, [])

  const loadElemente = async (id: number) => {
    setSelectedId(id)
    try {
      const ts = await api.getFormatTemplates()
      const found = ts.find((x: any) => x.id === id)
      setElemente(found?.elemente ?? [])
    } catch {}
  }

  const handleSaveElemente = async () => {
    if (!selectedId) return
    try {
      await api.updateFormatElemente(selectedId, elemente)
      setMsg('Gespeichert.')
    } catch (e: any) { setMsg(e.message) }
  }

  const updateEl = (idx: number, field: string, val: any) => {
    setElemente(prev => prev.map((e, i) => i === idx ? { ...e, [field]: val } : e))
  }

  return (
    <div style={{ padding: '28px 32px' }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>Format-Templates</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {templates.map(t => (
          <button key={t.id} onClick={() => loadElemente(t.id)}
            style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, cursor: 'pointer',
              background: selectedId === t.id ? 'var(--text-primary)' : 'transparent',
              color: selectedId === t.id ? '#fff' : 'var(--text-primary)' }}>
            {t.name}{t.ist_standard ? ' (Standard)' : ''}
          </button>
        ))}
      </div>
      {selectedId && (
        <>
          {msg && <p style={{ fontSize: 12, color: 'var(--sw-info)', marginBottom: 8 }}>{msg}</p>}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Element', 'Links %', 'Rechts %', 'Ausrichtung', 'Grossbuchst.', 'Tab-Folge', 'Enter-Folge'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-secondary)', fontWeight: 500 }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {elemente.map((e, i) => (
                  <tr key={e.element_typ} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '6px 8px', fontWeight: 500 }}>{e.element_typ}</td>
                    <td style={{ padding: '6px 4px' }}><input type="number" value={e.einrueckung_links} onChange={ev => updateEl(i, 'einrueckung_links', +ev.target.value)}
                      style={{ width: 48, padding: '2px 4px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 11 }} /></td>
                    <td style={{ padding: '6px 4px' }}><input type="number" value={e.einrueckung_rechts} onChange={ev => updateEl(i, 'einrueckung_rechts', +ev.target.value)}
                      style={{ width: 48, padding: '2px 4px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 11 }} /></td>
                    <td style={{ padding: '6px 4px' }}>
                      <select value={e.ausrichtung} onChange={ev => updateEl(i, 'ausrichtung', ev.target.value)}
                        style={{ padding: '2px 4px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 11, background: 'var(--bg-surface)' }}>
                        {['left','center','right'].map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                      <input type="checkbox" checked={!!e.grossbuchstaben} onChange={ev => updateEl(i, 'grossbuchstaben', ev.target.checked)} />
                    </td>
                    <td style={{ padding: '6px 4px' }}><input value={e.tab_folge_element ?? ''} onChange={ev => updateEl(i, 'tab_folge_element', ev.target.value)}
                      style={{ width: 90, padding: '2px 4px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 11 }} /></td>
                    <td style={{ padding: '6px 4px' }}><input value={e.enter_folge_element ?? ''} onChange={ev => updateEl(i, 'enter_folge_element', ev.target.value)}
                      style={{ width: 90, padding: '2px 4px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 11 }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={handleSaveElemente} style={{ marginTop: 16, padding: '8px 20px', borderRadius: 6, border: 'none', background: 'var(--text-primary)', color: '#fff', fontSize: 12, cursor: 'pointer' }}>
            Speichern
          </button>
        </>
      )}
    </div>
  )
}

// ── Admin: Benachrichtigungen ──────────────────────────────────────────────────

const EREIGNIS_LABELS: Record<string, string> = {
  neue_hauptrolle:         'Neue Hauptrolle angelegt',
  neue_episodenrolle:      'Neue Episodenrolle angelegt',
  neuer_komparse:          'Neuer Komparse angelegt',
  neue_location:           'Neuer Drehort angelegt',
  uebernahme_schauspieler: 'Schauspieler Cross-Staffel uebernommen',
  uebernahme_komparse:     'Komparse Cross-Staffel uebernommen',
}

function BenachrichtigungenTab() {
  const { selectedProduction } = useSelectedProduction()
  const staffelId = selectedProduction?.id ?? ''
  const [settings, setSettings] = useState<Record<string, { empfaenger: string; aktiv: boolean }>>({})
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!staffelId) return
    fetch(`/api/admin/benachrichtigungen/${staffelId}`, { credentials: 'include' })
      .then(r => r.json())
      .then((data: any[]) => {
        const map: Record<string, { empfaenger: string; aktiv: boolean }> = {}
        Object.keys(EREIGNIS_LABELS).forEach(k => {
          const found = data.find(d => d.ereignis === k)
          map[k] = { empfaenger: (found?.empfaenger_user_ids ?? []).join(', '), aktiv: found?.aktiv ?? true }
        })
        setSettings(map)
      }).catch(() => {})
  }, [staffelId])

  const handleSave = async () => {
    if (!staffelId) return
    try {
      const body = Object.entries(settings).map(([ereignis, v]) => ({
        ereignis,
        empfaenger_user_ids: v.empfaenger.split(',').map(s => s.trim()).filter(Boolean),
        aktiv: v.aktiv,
      }))
      await fetch(`/api/admin/benachrichtigungen/${staffelId}`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      setMsg('Gespeichert.')
    } catch (e: any) { setMsg(e.message) }
  }

  return (
    <div style={{ padding: '28px 32px' }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Benachrichtigungen</h2>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 20 }}>
        User-IDs (kommagetrennt) die bei diesen Ereignissen eine Benachrichtigung erhalten.
      </p>
      {!staffelId && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Bitte zuerst eine Produktion waehlen.</p>}
      {staffelId && (
        <>
          {msg && <p style={{ fontSize: 12, color: 'var(--sw-info)', marginBottom: 12 }}>{msg}</p>}
          {Object.entries(EREIGNIS_LABELS).map(([k, label]) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <input type="checkbox" checked={settings[k]?.aktiv ?? true}
                onChange={e => setSettings(prev => ({ ...prev, [k]: { ...prev[k], aktiv: e.target.checked } }))} />
              <span style={{ fontSize: 12, width: 280 }}>{label}</span>
              <input value={settings[k]?.empfaenger ?? ''} placeholder="user-id1, user-id2"
                onChange={e => setSettings(prev => ({ ...prev, [k]: { ...prev[k], empfaenger: e.target.value } }))}
                style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12 }} />
            </div>
          ))}
          <button onClick={handleSave} style={{ marginTop: 12, padding: '8px 20px', borderRadius: 6, border: 'none', background: 'var(--text-primary)', color: '#fff', fontSize: 12, cursor: 'pointer' }}>
            Speichern
          </button>
        </>
      )}
    </div>
  )
}

// ── Admin: Dokument-Einstellungen ──────────────────────────────────────────────

function DokumentEinstellungenTab() {
  const [overrideRollen, setOverrideRollen] = useState<string[]>([])
  const [numModus, setNumModus] = useState<'global' | 'per_typ'>('global')
  const [newRolle, setNewRolle] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    api.getOverrideRollen().then((d: any) => setOverrideRollen(d.rollen ?? [])).catch(() => {})
    api.getFassungsNummerierung().then((d: any) => setNumModus((d.modus ?? 'global') as 'global' | 'per_typ')).catch(() => {})
  }, [])

  const handleSave = async () => {
    try {
      await api.updateOverrideRollen(overrideRollen)
      await api.updateFassungsNummerierung(numModus)
      setMsg('Gespeichert.')
    } catch (e: any) { setMsg(e.message) }
  }

  const addRolle = () => {
    const r = newRolle.trim()
    if (!r || overrideRollen.includes(r)) return
    setOverrideRollen(prev => [...prev, r]); setNewRolle('')
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 600 }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 24 }}>Dokument-Einstellungen</h2>

      <section style={{ marginBottom: 32 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Fassungs-Nummerierung</h3>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
          Global: Alle Dokument-Typen teilen eine gemeinsame Nummerierung pro Folge.
          Pro Typ: Jeder Typ beginnt bei Fassung 1.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['global', 'per_typ'] as const).map(m => (
            <button key={m} onClick={() => setNumModus(m)}
              style={{ padding: '6px 16px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, cursor: 'pointer',
                background: numModus === m ? 'var(--text-primary)' : 'transparent',
                color: numModus === m ? '#fff' : 'var(--text-primary)' }}>
              {m === 'global' ? 'Global' : 'Pro Typ'}
            </button>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Status-Override-Rollen</h3>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
          Nutzer mit diesen Rollen koennen alle Dokumente lesen und bearbeiten,
          unabhaengig von der Sichtbarkeits-Einstellung.
        </p>
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          <input value={newRolle} onChange={e => setNewRolle(e.target.value)} placeholder="z.B. herstellungsleitung"
            onKeyDown={e => e.key === 'Enter' && addRolle()}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, width: 220 }} />
          <button onClick={addRolle}
            style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: 'var(--text-primary)', color: '#fff', fontSize: 12, cursor: 'pointer' }}>
            Hinzufuegen
          </button>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {overrideRollen.map(r => (
            <span key={r} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 99,
              background: 'var(--bg-subtle)', border: '1px solid var(--border)', fontSize: 12 }}>
              {r}
              <button onClick={() => setOverrideRollen(prev => prev.filter(x => x !== r))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14, lineHeight: 1, padding: 0 }}>x</button>
            </span>
          ))}
          {overrideRollen.length === 0 && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Keine Override-Rollen.</span>}
        </div>
      </section>

      {msg && <p style={{ fontSize: 12, color: 'var(--sw-info)', marginBottom: 8 }}>{msg}</p>}
      <button onClick={handleSave}
        style={{ padding: '8px 24px', borderRadius: 6, border: 'none', background: 'var(--text-primary)', color: '#fff', fontSize: 12, cursor: 'pointer' }}>
        Speichern
      </button>
    </div>
  )
}


function FigurenTab() {
  const { selectedProduction } = useSelectedProduction()
  const staffelId = selectedProduction?.id ?? null

  const [figurenLabel, setFigurenLabel] = useState<'Rollen' | 'Figuren' | 'Charaktere'>('Rollen')
  const [felder, setFelder] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [newFeld, setNewFeld] = useState<{ name: string; typ: string; gilt_fuer: string; optionen: string } | null>(null)
  const [feldSaving, setFeldSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)
  const [presetLoading, setPresetLoading] = useState(false)
  const [presetDone, setPresetDone] = useState(false)

  useEffect(() => {
    fetch('/api/admin/app-settings', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((d: any) => { if (d?.figuren_label) setFigurenLabel(d.figuren_label) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!staffelId) return
    api.getCharakterFelder(staffelId).then(setFelder).catch(() => {})
  }, [staffelId])

  const saveFigurenLabel = async (val: 'Rollen' | 'Figuren' | 'Charaktere') => {
    setFigurenLabel(val)
    setSaving(true)
    await fetch('/api/admin/app-settings/figuren_label', {
      method: 'PUT', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: val }),
    }).catch(() => {})
    setSaving(false)
    window.dispatchEvent(new CustomEvent('app-settings-changed'))
  }

  const handleCreateFeld = async () => {
    if (!newFeld || !staffelId || !newFeld.name.trim()) return
    setFeldSaving(true)
    try {
      const optionen = newFeld.typ === 'select'
        ? newFeld.optionen.split(',').map(s => s.trim()).filter(Boolean)
        : []
      const f = await api.createCharakterFeld(staffelId, { name: newFeld.name.trim(), typ: newFeld.typ, optionen, gilt_fuer: newFeld.gilt_fuer })
      setFelder(prev => [...prev, f])
      setNewFeld(null)
    } finally { setFeldSaving(false) }
  }

  const handleDeleteFeld = async (id: number) => {
    if (!staffelId) return
    await api.deleteCharakterFeld(staffelId, id)
    setFelder(prev => prev.filter(f => f.id !== id))
    setDeleteConfirm(null)
  }

  const handleRollenprofilPreset = async () => {
    if (!staffelId) return
    setPresetLoading(true)
    try {
      const rows = await api.rollenprofilFelderPreset(staffelId)
      setFelder(rows)
      setPresetDone(true)
      setTimeout(() => setPresetDone(false), 3000)
    } finally { setPresetLoading(false) }
  }

  const rollenFelder = felder.filter(f => f.gilt_fuer === 'alle' || f.gilt_fuer === 'rolle' || f.gilt_fuer === 'komparse')

  return (
    <div style={{ padding: '28px 32px', maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 32 }}>
      <section>
        <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 4px' }}>Bezeichnung (Figuren/Rollen)</h3>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 16px', lineHeight: 1.6 }}>
          Legt fest, wie Rollen in Navigation und UI bezeichnet werden.
        </p>
        <div className="seg" style={{ display: 'inline-flex' }}>
          {(['Rollen', 'Figuren', 'Charaktere'] as const).map(opt => (
            <button key={opt} className={figurenLabel === opt ? 'on' : ''} onClick={() => saveFigurenLabel(opt)} disabled={saving}>
              {opt}
            </button>
          ))}
        </div>
        {saving && <span style={{ marginLeft: 12, fontSize: 12, color: 'var(--text-secondary)' }}>Wird gespeichert…</span>}
      </section>

      {!staffelId && (
        <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Bitte eine Produktion auswählen, um Felder zu konfigurieren.</p>
      )}

      {staffelId && (
        <>
          <section>
            <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 4px' }}>Felder für {figurenLabel} & Komparsen</h3>
            <FeldListe felder={rollenFelder} onDelete={id => setDeleteConfirm(id)} deleteConfirm={deleteConfirm} onConfirmDelete={handleDeleteFeld} onCancelDelete={() => setDeleteConfirm(null)} />
          </section>

          {/* Rollenprofil preset */}
          <section>
            <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 4px' }}>Rollenprofil-Standardfelder</h3>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 12px', lineHeight: 1.6 }}>
              Fügt die Standard-Rollenprofil-Felder hinzu (Alter, Geburtsort, Charakter, Backstory usw.). Bereits vorhandene Felder werden nicht überschrieben.
            </p>
            <button
              onClick={handleRollenprofilPreset}
              disabled={presetLoading}
              style={{ fontSize: 12, padding: '7px 14px', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', background: presetDone ? '#00C853' : 'transparent', color: presetDone ? '#fff' : 'var(--text)', transition: 'background 0.2s, color 0.2s' }}
            >
              {presetLoading ? 'Wird hinzugefügt…' : presetDone ? '✓ Felder hinzugefügt' : 'Rollenprofil-Felder hinzufügen'}
            </button>
          </section>

          {/* Add field form */}
          {newFeld ? (
            <section style={{ padding: 16, background: 'var(--bg-subtle)', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <h4 style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>Neues Feld</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <input placeholder="Feldname" value={newFeld.name} onChange={e => setNewFeld({ ...newFeld, name: e.target.value })}
                  style={{ fontSize: 12, padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', color: 'var(--text)' }} />
                <select value={newFeld.typ} onChange={e => setNewFeld({ ...newFeld, typ: e.target.value })}
                  style={{ fontSize: 12, padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', color: 'var(--text)' }}>
                  {['text', 'richtext', 'select', 'link', 'date', 'number'].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <select value={newFeld.gilt_fuer} onChange={e => setNewFeld({ ...newFeld, gilt_fuer: e.target.value })}
                  style={{ fontSize: 12, padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', color: 'var(--text)' }}>
                  <option value="alle">Alle</option>
                  <option value="rolle">Nur {figurenLabel}</option>
                  <option value="komparse">Nur Komparsen</option>
                </select>
              </div>
              {newFeld.typ === 'select' && (
                <input placeholder="Optionen (kommagetrennt)" value={newFeld.optionen} onChange={e => setNewFeld({ ...newFeld, optionen: e.target.value })}
                  style={{ fontSize: 12, padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', color: 'var(--text)' }} />
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleCreateFeld} disabled={!newFeld.name.trim() || feldSaving}
                  style={{ fontSize: 12, padding: '6px 14px', background: 'var(--text)', color: 'var(--bg)', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                  {feldSaving ? 'Speichern…' : 'Speichern'}
                </button>
                <button onClick={() => setNewFeld(null)} style={{ fontSize: 12, padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', background: 'transparent', color: 'var(--text)' }}>
                  Abbrechen
                </button>
              </div>
            </section>
          ) : (
            <button onClick={() => setNewFeld({ name: '', typ: 'text', gilt_fuer: 'alle', optionen: '' })}
              style={{ alignSelf: 'flex-start', fontSize: 12, padding: '7px 14px', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', background: 'transparent', color: 'var(--text)' }}>
              + Feld hinzufügen
            </button>
          )}
        </>
      )}
    </div>
  )
}

function FeldListe({ felder, onDelete, deleteConfirm, onConfirmDelete, onCancelDelete }: {
  felder: any[]
  onDelete: (id: number) => void
  deleteConfirm: number | null
  onConfirmDelete: (id: number) => void
  onCancelDelete: () => void
}) {
  if (felder.length === 0) return <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '8px 0' }}>Keine Felder konfiguriert.</p>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
      {felder.map(f => (
        <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--bg-subtle)', borderRadius: 6 }}>
          <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{f.name}</span>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', padding: '2px 6px', background: 'var(--bg)', borderRadius: 4 }}>{f.typ}</span>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{f.gilt_fuer}</span>
          {deleteConfirm === f.id ? (
            <span style={{ fontSize: 11, display: 'flex', gap: 4, alignItems: 'center' }}>
              <span style={{ color: '#FF3B30' }}>Alle Werte werden gelöscht!</span>
              <button onClick={() => onConfirmDelete(f.id)} style={{ fontSize: 11, padding: '2px 8px', background: '#FF3B30', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Löschen</button>
              <button onClick={onCancelDelete} style={{ fontSize: 11, padding: '2px 8px', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', background: 'transparent' }}>Abbrechen</button>
            </span>
          ) : (
            <button onClick={() => onDelete(f.id)} style={{ fontSize: 11, padding: '2px 6px', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', background: 'transparent', color: 'var(--text-secondary)' }}>Löschen</button>
          )}
        </div>
      ))}
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
          {activeTab === 'ki'                     && <AdminKI />}
          {activeTab === 'produktion'               && <ProduktionTab />}
          {activeTab === 'wasserzeichen'            && <WasserzeichenTab />}
          {activeTab === 'allgemein'                && <AllgemeinTab />}
          {activeTab === 'figuren'                  && <FigurenTab />}
          {activeTab === 'dokument-typen'           && <DokumentTypenTab />}
          {activeTab === 'colab-gruppen'            && <ColabGruppenTab />}
          {activeTab === 'format-templates'         && <FormatTemplatesTab />}
          {activeTab === 'benachrichtigungen'       && <BenachrichtigungenTab />}
          {activeTab === 'dokument-einstellungen'   && <DokumentEinstellungenTab />}
          {!['ki','produktion','wasserzeichen','allgemein','figuren','dokument-typen','colab-gruppen','format-templates','benachrichtigungen','dokument-einstellungen','export','locks','users','audit'].includes(activeTab) && (
            <div style={{ padding: '28px 32px', color: 'var(--text-secondary)', fontSize: 13 }}>
              Dieser Bereich ist noch in Entwicklung.
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
