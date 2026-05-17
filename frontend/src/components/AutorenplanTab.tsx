import { useState, useEffect, useCallback, useRef } from 'react'
import { X, Plus, ChevronLeft, ChevronRight, Settings, Users, Edit2, Trash2, Search, AlertCircle, GripVertical, Info } from 'lucide-react'
import Tooltip from './Tooltip'
import { useTerminologie } from '../sw-ui'

// ── Types ─────────────────────────────────────────────────────────────────────

interface JobKategorie {
  id: string
  produktion_db_id: string
  label: string
  beschreibung?: string
  vertragsdb_taetigkeit_id?: number
  vertragsdb_taetigkeit_label?: string  // nur lokal gecacht für Anzeige
  gage_betrag?: number
  gage_waehrung: string
  abrechnungstyp: string
  lst_rg: string
  max_slots: number
  slots_gleich_folgen: boolean
  dauer_wochen: number
  bezugseinheit: string
  praesenz_wochen: number[]
  erster_block_start?: string
  farbe: string
  sortierung: number
}

interface Block {
  proddb_id: string
  block_nummer: number
  folge_von?: number
  folge_bis?: number
  folgen_anzahl: number
  dreh_von?: string
  dreh_bis?: string
  team_index?: number
}

interface BlockInfo {
  block_label: string
  erster_block: number
  erste_folge: number
  bloecke: Block[]
}

interface Einsatz {
  id: string
  produktion_db_id: string
  job_kategorie_id?: string
  prozess_id?: string  // legacy
  woche_von: string
  vertragsdb_person_id?: number
  platzhalter_name?: string
  person_cache_name?: string
  vertragsdb_taetigkeit_id?: number
  vertragsdb_vertrag_id?: number
  block_nummer?: number
  folge_nummer?: number
  status: string
  kostenstelle?: string
  ist_homeoffice_override?: boolean
  notiz?: string
  erstellt_am?: string
}

interface WochenNotiz {
  id: string
  produktion_db_id: string
  woche_von: string
  typ: string
  text: string
}

interface Future {
  id: string
  produktion_db_id: string
  titel: string
  schreib_von: string
  schreib_bis: string
  edit_von?: string
  edit_bis?: string
  notiz?: string
  autoren: FutureAutor[]
}

interface FutureAutor {
  id: string
  future_id: string
  vertragsdb_person_id?: number
  platzhalter_name?: string
  person_cache_name?: string
  phase: string
  ist_homeoffice: boolean
  status: string
  notiz?: string
}

interface Person {
  id: number
  name: string
  rufname?: string
  email?: string
}

interface Taetigkeit {
  id: number
  bezeichnung: string
  gewerk?: string
  kategorie?: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_LIST = [
  { id: 'geplant',             label: 'Geplant',              farbe: '#9E9E9E' },
  { id: 'angefragt',           label: 'Angefragt',            farbe: '#007AFF' },
  { id: 'zugesagt',            label: 'Zugesagt',             farbe: '#FF9500' },
  { id: 'vertrag_geschrieben', label: 'Vertrag geschrieben',  farbe: '#AF52DE' },
  { id: 'vertrag_zurueck',     label: 'Vertrag zurück',       farbe: '#00C853' },
  { id: 'rechnung_erhalten',   label: 'Rechnung erhalten',    farbe: '#34C759' },
]

const ABRECHNUNGSTYPEN = [
  { id: 'pauschal',   label: 'Pauschal' },
  { id: 'pro_woche',  label: 'Pro Woche' },
  { id: 'pro_tag',    label: 'Pro Tag' },
  { id: 'pro_buch',   label: 'Pro Buch' },
]

function statusColor(s: string): string {
  return STATUS_LIST.find(x => x.id === s)?.farbe ?? '#9E9E9E'
}
function statusLabel(s: string): string {
  return STATUS_LIST.find(x => x.id === s)?.label ?? s
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function mondayOf(d: Date): Date {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const m = new Date(d)
  m.setDate(d.getDate() + diff)
  m.setHours(0, 0, 0, 0)
  return m
}

function addWeeks(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n * 7)
  return r
}

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function formatWoche(d: Date): string {
  const dd = (n: number) => String(n).padStart(2, '0')
  return `${dd(d.getDate())}.${dd(d.getMonth() + 1)}.`
}

function weeksBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (7 * 24 * 3600 * 1000))
}

function kw(d: Date): string {
  const jan4 = new Date(d.getFullYear(), 0, 4)
  const dayOfYear = Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86400000)
  const weekNum = Math.ceil((dayOfYear + jan4.getDay() - 1) / 7)
  return `KW ${weekNum}`
}

// Berechnet für eine Job-Kategorie, welcher Block in einer gegebenen Woche aktiv ist
function blockFuerWoche(jk: JobKategorie, weekDate: Date, blockInfo: BlockInfo | null): Block | null {
  if (!jk.erster_block_start || !blockInfo?.bloecke.length) return null
  const start = mondayOf(new Date(jk.erster_block_start))
  const offsetWeeks = weeksBetween(start, mondayOf(weekDate))
  if (offsetWeeks < 0) return null
  const blockIdx = Math.floor(offsetWeeks / jk.dauer_wochen)
  if (blockIdx >= blockInfo.bloecke.length) return null
  return blockInfo.bloecke[blockIdx] || null
}

// ── PersonPicker ──────────────────────────────────────────────────────────────

function PersonPicker({
  value, displayName, onSelect, onNew,
}: {
  value?: number
  displayName?: string
  onSelect: (p: Person) => void
  onNew: (name: string) => void
}) {
  const [q, setQ] = useState(displayName || '')
  const [results, setResults] = useState<Person[]>([])
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<any>(null)

  useEffect(() => { setQ(displayName || '') }, [displayName])

  const search = useCallback((query: string) => {
    if (query.trim().length < 2) { setResults([]); return }
    setLoading(true)
    fetch(`/api/autorenplan/personen-suche?name=${encodeURIComponent(query)}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setResults(d.personen || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const handleInput = (val: string) => {
    setQ(val)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(val), 300)
  }

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', pointerEvents: 'none' }} />
        <input
          value={q}
          onChange={e => handleInput(e.target.value)}
          placeholder="Name suchen..."
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '7px 8px 7px 28px', borderRadius: 6, border: '1px solid var(--border)',
            background: 'var(--bg-subtle)', fontSize: 12, color: 'var(--text-primary)',
          }}
        />
      </div>
      {results.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
          background: 'var(--bg-page)', border: '1px solid var(--border)', borderRadius: 6,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)', maxHeight: 200, overflowY: 'auto',
        }}>
          {results.map(p => (
            <div key={p.id} onClick={() => { onSelect(p); setQ(p.name); setResults([]) }}
              style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 12, borderBottom: '1px solid var(--border)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-subtle)')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}>
              <div style={{ fontWeight: 500 }}>{p.name}</div>
              {p.email && <div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{p.email}</div>}
            </div>
          ))}
          {q.trim().length >= 2 && (
            <div onClick={() => { onNew(q); setResults([]) }}
              style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 12, color: '#007AFF', display: 'flex', alignItems: 'center', gap: 6 }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-subtle)')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}>
              <Plus size={12} /> „{q}" neu in Vertragsdb anlegen
            </div>
          )}
        </div>
      )}
      {loading && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>Suche...</div>}
    </div>
  )
}

// ── TaetigkeitPicker ──────────────────────────────────────────────────────────

function TaetigkeitPicker({
  value, displayLabel, onSelect, onNew,
}: {
  value?: number
  displayLabel?: string
  onSelect: (t: Taetigkeit) => void
  onNew: (bezeichnung: string) => void
}) {
  const [q, setQ] = useState(displayLabel || '')
  const [results, setResults] = useState<Taetigkeit[]>([])
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<any>(null)

  useEffect(() => { setQ(displayLabel || '') }, [displayLabel])

  const search = useCallback((query: string) => {
    if (query.trim().length < 2) { setResults([]); return }
    setLoading(true)
    fetch(`/api/autorenplan/taetigkeiten?q=${encodeURIComponent(query)}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setResults(d.taetigkeiten || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const handleInput = (val: string) => {
    setQ(val)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(val), 300)
  }

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', pointerEvents: 'none' }} />
        <input
          value={q}
          onChange={e => handleInput(e.target.value)}
          placeholder="Tätigkeit suchen (z. B. Storyedit)..."
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '7px 8px 7px 28px', borderRadius: 6, border: '1px solid var(--border)',
            background: 'var(--bg-subtle)', fontSize: 12, color: 'var(--text-primary)',
          }}
        />
      </div>
      {results.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
          background: 'var(--bg-page)', border: '1px solid var(--border)', borderRadius: 6,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)', maxHeight: 200, overflowY: 'auto',
        }}>
          {results.map(t => (
            <div key={t.id} onClick={() => { onSelect(t); setQ(t.bezeichnung); setResults([]) }}
              style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 12, borderBottom: '1px solid var(--border)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-subtle)')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}>
              <div style={{ fontWeight: 500 }}>{t.bezeichnung}</div>
              {t.gewerk && <div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{t.gewerk}</div>}
            </div>
          ))}
          {q.trim().length >= 2 && (
            <div onClick={() => { onNew(q); setResults([]) }}
              style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 12, color: '#007AFF', display: 'flex', alignItems: 'center', gap: 6 }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-subtle)')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}>
              <Plus size={12} /> „{q}" neu in Vertragsdb anlegen
            </div>
          )}
        </div>
      )}
      {loading && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>Suche...</div>}
    </div>
  )
}

// ── JobKategorieModal ─────────────────────────────────────────────────────────

function JobKategorieModal({
  jk, produktionDbId, onSave, onDelete, onClose,
}: {
  jk?: JobKategorie
  produktionDbId: string
  onSave: (data: Partial<JobKategorie>) => Promise<void>
  onDelete?: () => Promise<void>
  onClose: () => void
}) {
  const isNew = !jk
  const [label, setLabel] = useState(jk?.label || '')
  const [beschreibung, setBeschreibung] = useState(jk?.beschreibung || '')
  const [taetigkeitId, setTaetigkeitId] = useState<number | undefined>(jk?.vertragsdb_taetigkeit_id)
  const [taetigkeitLabel, setTaetigkeitLabel] = useState(jk?.vertragsdb_taetigkeit_label || '')
  const [gageBetrag, setGageBetrag] = useState(jk?.gage_betrag ? String(jk.gage_betrag) : '')
  const [abrechnungstyp, setAbrechnungstyp] = useState(jk?.abrechnungstyp || 'pauschal')
  const [lstRg, setLstRg] = useState(jk?.lst_rg || 'RG')
  const [maxSlots, setMaxSlots] = useState(jk?.max_slots ?? 1)
  const [slotsGleichFollen, setSlotsGleichFolgen] = useState(jk?.slots_gleich_folgen ?? false)
  const [dauerWochen, setDauerWochen] = useState(jk?.dauer_wochen ?? 1)
  const [praesenzWochen, setPraesenzWochen] = useState<number[]>(jk?.praesenz_wochen ?? [1])
  const [ersterBlockStart, setErsterBlockStart] = useState(jk?.erster_block_start || '')
  const [farbe, setFarbe] = useState(jk?.farbe || '#007AFF')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [newTaetigkeitConfirm, setNewTaetigkeitConfirm] = useState<string | null>(null)

  const togglePraesenzWoche = (w: number) => {
    setPraesenzWochen(prev =>
      prev.includes(w) ? prev.filter(x => x !== w) : [...prev, w].sort((a, b) => a - b)
    )
  }

  const handleTaetigkeitNew = (bezeichnung: string) => {
    setNewTaetigkeitConfirm(bezeichnung)
  }

  const confirmNeueTaetigkeit = async () => {
    if (!newTaetigkeitConfirm) return
    const res = await fetch('/api/autorenplan/taetigkeiten-anlegen', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bezeichnung: newTaetigkeitConfirm }),
    })
    const d = await res.json()
    if (d.taetigkeit_id) {
      setTaetigkeitId(d.taetigkeit_id)
      setTaetigkeitLabel(d.bezeichnung)
      if (!label) setLabel(d.bezeichnung)
    }
    setNewTaetigkeitConfirm(null)
  }

  const handleSave = async () => {
    if (!label.trim()) return
    setSaving(true)
    try {
      await onSave({
        label: label.trim(),
        beschreibung: beschreibung || undefined,
        vertragsdb_taetigkeit_id: taetigkeitId,
        gage_betrag: gageBetrag ? parseFloat(gageBetrag) : undefined,
        abrechnungstyp,
        lst_rg: lstRg,
        max_slots: maxSlots,
        slots_gleich_folgen: slotsGleichFollen,
        dauer_wochen: dauerWochen,
        praesenz_wochen: praesenzWochen,
        erster_block_start: ersterBlockStart || undefined,
        farbe,
      })
      onClose()
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!onDelete) return
    setDeleting(true)
    try { await onDelete(); onClose() }
    finally { setDeleting(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: 'var(--bg-page)', borderRadius: 12, width: 560, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,0.35)' }}>

        {/* Confirm neue Tätigkeit */}
        {newTaetigkeitConfirm && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 10, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: 'var(--bg-page)', borderRadius: 10, padding: 24, maxWidth: 360, textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Neue Tätigkeit anlegen?</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 20 }}>
                „<strong>{newTaetigkeitConfirm}</strong>" wird neu in der Vertragsdatenbank angelegt.
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <button onClick={() => setNewTaetigkeitConfirm(null)} style={{ padding: '7px 18px', borderRadius: 7, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', fontSize: 12 }}>Abbrechen</button>
                <button onClick={confirmNeueTaetigkeit} style={{ padding: '7px 18px', borderRadius: 7, border: 'none', background: '#000', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Anlegen</button>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px 0' }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{isNew ? 'Neue Job-Kategorie' : 'Job-Kategorie bearbeiten'}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={18} /></button>
        </div>

        <div style={{ padding: '20px 24px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Tätigkeit aus Vertragsdb */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>
              Job aus Vertragsdatenbank
            </label>
            {taetigkeitId && (
              <div style={{ fontSize: 12, color: '#007AFF', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#007AFF', display: 'inline-block' }} />
                {taetigkeitLabel} (ID: {taetigkeitId})
                <button onClick={() => { setTaetigkeitId(undefined); setTaetigkeitLabel('') }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 11 }}>× löschen</button>
              </div>
            )}
            <TaetigkeitPicker
              value={taetigkeitId}
              displayLabel={taetigkeitLabel}
              onSelect={t => { setTaetigkeitId(t.id); setTaetigkeitLabel(t.bezeichnung); if (!label) setLabel(t.bezeichnung) }}
              onNew={handleTaetigkeitNew}
            />
          </div>

          {/* Label */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>
              Anzeige-Label *
            </label>
            <input value={label} onChange={e => setLabel(e.target.value)} placeholder="z. B. Storyedit" style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-subtle)', fontSize: 13, color: 'var(--text-primary)' }} />
          </div>

          {/* Beschreibung */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>
              Kurzbeschreibung
            </label>
            <textarea value={beschreibung} onChange={e => setBeschreibung(e.target.value)} rows={2} placeholder="Optionale Beschreibung des Jobs..." style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-subtle)', fontSize: 12, color: 'var(--text-primary)', resize: 'none' }} />
          </div>

          {/* Gage */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 8 }}>
              Gagenkategorie
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', gap: 8, marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Abrechnungstyp</div>
                <select value={abrechnungstyp} onChange={e => setAbrechnungstyp(e.target.value)}
                  style={{ width: '100%', padding: '7px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-subtle)', fontSize: 12, color: 'var(--text-primary)' }}>
                  {ABRECHNUNGSTYPEN.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Betrag (€)</div>
                <input type="number" value={gageBetrag} onChange={e => setGageBetrag(e.target.value)}
                  placeholder="0,00" style={{ width: '100%', boxSizing: 'border-box', padding: '7px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-subtle)', fontSize: 12, color: 'var(--text-primary)' }} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Art</div>
                <select value={lstRg} onChange={e => setLstRg(e.target.value)}
                  style={{ width: '100%', padding: '7px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-subtle)', fontSize: 12, color: 'var(--text-primary)' }}>
                  <option value="RG">RG</option>
                  <option value="LSt">LSt</option>
                </select>
              </div>
            </div>
          </div>

          {/* Slots */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 8 }}>
              Slots (Y-Achse)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: 'pointer', fontSize: 12 }}>
              <input type="checkbox" checked={slotsGleichFollen} onChange={e => setSlotsGleichFolgen(e.target.checked)} />
              Anzahl Slots = Folgenanzahl des Blocks
              <Tooltip text="Das Raster zeigt so viele Slots wie Folgen im Block vorhanden sind (aus Prod-DB). Überschreitung wird als Warnung angezeigt.">
                <Info size={12} style={{ color: 'var(--text-secondary)' }} />
              </Tooltip>
            </label>
            {!slotsGleichFollen && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Feste Anzahl Slots:</div>
                <input type="number" min={1} max={20} value={maxSlots} onChange={e => setMaxSlots(parseInt(e.target.value) || 1)}
                  style={{ width: 60, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-subtle)', fontSize: 12, textAlign: 'center' }} />
              </div>
            )}
          </div>

          {/* Dauer & HO/Präsenz */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 8 }}>
              Zeitkonfiguration
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Dauer pro Block:</div>
              <input type="number" min={1} max={12} value={dauerWochen} onChange={e => setDauerWochen(parseInt(e.target.value) || 1)}
                style={{ width: 60, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-subtle)', fontSize: 12, textAlign: 'center' }} />
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Wochen</div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
              Präsenz-Wochen (Writers Room) — Rest = HomeOffice:
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {Array.from({ length: dauerWochen }, (_, i) => i + 1).map(w => (
                <button key={w} onClick={() => togglePraesenzWoche(w)} style={{
                  padding: '4px 12px', borderRadius: 20, fontSize: 11, cursor: 'pointer',
                  border: praesenzWochen.includes(w) ? '1.5px solid #007AFF' : '1px solid var(--border)',
                  background: praesenzWochen.includes(w) ? '#007AFF20' : 'none',
                  color: praesenzWochen.includes(w) ? '#007AFF' : 'var(--text-secondary)',
                  fontWeight: praesenzWochen.includes(w) ? 600 : 400,
                }}>
                  Woche {w} {praesenzWochen.includes(w) ? '(Präsenz)' : '(HO)'}
                </button>
              ))}
            </div>
          </div>

          {/* Blockkalender */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>
              Blockkalender — Startdatum
            </label>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
              Wann beginnt die Arbeit am ersten Block? (Montag der Startwoche)
            </div>
            <input type="date" value={ersterBlockStart} onChange={e => setErsterBlockStart(e.target.value)}
              style={{ padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-subtle)', fontSize: 12, color: 'var(--text-primary)' }} />
          </div>

          {/* Farbe */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Farbe</label>
            <input type="color" value={farbe} onChange={e => setFarbe(e.target.value)}
              style={{ width: 32, height: 28, borderRadius: 4, border: '1px solid var(--border)', cursor: 'pointer', padding: 2 }} />
            <div style={{ width: 40, height: 14, borderRadius: 3, background: farbe }} />
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 4 }}>
            <div>
              {onDelete && !confirmDelete && (
                <button onClick={() => setConfirmDelete(true)} style={{ padding: '7px 14px', borderRadius: 7, border: '1px solid #FF3B30', background: 'none', color: '#FF3B30', cursor: 'pointer', fontSize: 12 }}>
                  Löschen
                </button>
              )}
              {confirmDelete && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => setConfirmDelete(false)} style={{ padding: '7px 12px', borderRadius: 7, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', fontSize: 12 }}>Abbrechen</button>
                  <button onClick={handleDelete} disabled={deleting} style={{ padding: '7px 14px', borderRadius: 7, border: 'none', background: '#FF3B30', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                    {deleting ? '...' : 'Wirklich löschen'}
                  </button>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={onClose} style={{ padding: '7px 16px', borderRadius: 7, border: '1px solid var(--border)', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12 }}>Abbrechen</button>
              <button onClick={handleSave} disabled={saving || !label.trim()} style={{ padding: '7px 20px', borderRadius: 7, border: 'none', background: '#000', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                {saving ? '...' : (isNew ? 'Anlegen' : 'Speichern')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── EinsatzModal ──────────────────────────────────────────────────────────────

function EinsatzModal({
  einsatz, jk, wocheDatum, produktionDbId, blockInfo, blockLabel, folgeLabel,
  onSave, onDelete, onClose,
}: {
  einsatz?: Einsatz
  jk: JobKategorie
  wocheDatum: Date
  produktionDbId: string
  blockInfo: BlockInfo | null
  blockLabel: string
  folgeLabel: string
  onSave: (data: Partial<Einsatz>) => Promise<void>
  onDelete?: () => Promise<void>
  onClose: () => void
}) {
  const isNew = !einsatz
  const [personId, setPersonId] = useState<number | undefined>(einsatz?.vertragsdb_person_id)
  const [personName, setPersonName] = useState(einsatz?.person_cache_name || einsatz?.platzhalter_name || '')
  const [isPlatzhalter, setIsPlatzhalter] = useState(!einsatz?.vertragsdb_person_id && !!einsatz?.platzhalter_name)
  const [status, setStatus] = useState(einsatz?.status || 'geplant')
  const [blockNr, setBlockNr] = useState<number | undefined>(einsatz?.block_nummer)
  const [folgeNr, setFolgeNr] = useState<number | undefined>(einsatz?.folge_nummer)
  const [notiz, setNotiz] = useState(einsatz?.notiz || '')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Auto-Block aus Blockkalender
  useEffect(() => {
    if (!blockNr && jk.erster_block_start && blockInfo) {
      const b = blockFuerWoche(jk, wocheDatum, blockInfo)
      if (b) setBlockNr(b.block_nummer)
    }
  }, [])

  // Folgen des ausgewählten Blocks
  const blockObj = blockInfo?.bloecke.find(b => b.block_nummer === blockNr)
  const folgenImBlock: number[] = blockObj && blockObj.folge_von && blockObj.folge_bis
    ? Array.from({ length: blockObj.folge_bis - blockObj.folge_von + 1 }, (_, i) => blockObj.folge_von! + i)
    : []

  const handlePersonSelect = (p: Person) => {
    setPersonId(p.id); setPersonName(p.name); setIsPlatzhalter(false)
  }

  const handleNewPerson = async (name: string) => {
    const res = await fetch('/api/autorenplan/personen-anlegen', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    const d = await res.json()
    if (d.personen_id) { setPersonId(d.personen_id); setPersonName(name); setIsPlatzhalter(false) }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave({
        job_kategorie_id: jk.id,
        woche_von: dateKey(wocheDatum),
        produktion_db_id: produktionDbId,
        vertragsdb_person_id: personId,
        person_cache_name: personId ? personName : undefined,
        platzhalter_name: !personId && personName ? personName : undefined,
        block_nummer: blockNr,
        folge_nummer: folgeNr,
        status,
        notiz: notiz || undefined,
      })
      onClose()
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!onDelete) return
    setDeleting(true)
    try { await onDelete(); onClose() } finally { setDeleting(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: 'var(--bg-page)', borderRadius: 12, width: 440, boxShadow: '0 8px 32px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{isNew ? 'Einsatz anlegen' : 'Einsatz bearbeiten'}</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: jk.farbe, marginRight: 4 }} />
              {jk.label} · {formatWoche(wocheDatum)}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={16} /></button>
        </div>

        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Person */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>Person</label>
            {isPlatzhalter ? (
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={personName} onChange={e => setPersonName(e.target.value)} placeholder="Platzhalter-Bezeichnung" style={{ flex: 1, padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-subtle)', fontSize: 12, color: 'var(--text-primary)' }} />
                <button onClick={() => setIsPlatzhalter(false)} style={{ padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Suchen</button>
              </div>
            ) : (
              <div>
                <PersonPicker value={personId} displayName={personName} onSelect={handlePersonSelect} onNew={handleNewPerson} />
                <button onClick={() => { setIsPlatzhalter(true); setPersonId(undefined) }} style={{ marginTop: 4, background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text-secondary)', padding: 0 }}>Als Platzhalter eintragen</button>
              </div>
            )}
          </div>

          {/* Block + Folge */}
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>{blockLabel}</label>
              {blockInfo?.bloecke.length ? (
                <select value={blockNr ?? ''} onChange={e => { setBlockNr(e.target.value ? parseInt(e.target.value) : undefined); setFolgeNr(undefined) }}
                  style={{ width: '100%', padding: '7px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-subtle)', fontSize: 12, color: 'var(--text-primary)' }}>
                  <option value="">— kein {blockLabel} —</option>
                  {blockInfo.bloecke.map(b => (
                    <option key={b.block_nummer} value={b.block_nummer}>
                      {blockLabel} {b.block_nummer}{b.folge_von ? ` (${folgeLabel} ${b.folge_von}–${b.folge_bis ?? '?'})` : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <input type="number" value={blockNr ?? ''} onChange={e => setBlockNr(e.target.value ? parseInt(e.target.value) : undefined)}
                  placeholder={`${blockLabel}-Nr.`} style={{ width: '100%', boxSizing: 'border-box', padding: '7px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-subtle)', fontSize: 12 }} />
              )}
            </div>
            {folgenImBlock.length > 0 && (
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>{folgeLabel}</label>
                <select value={folgeNr ?? ''} onChange={e => setFolgeNr(e.target.value ? parseInt(e.target.value) : undefined)}
                  style={{ width: '100%', padding: '7px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-subtle)', fontSize: 12, color: 'var(--text-primary)' }}>
                  <option value="">— optional —</option>
                  {folgenImBlock.map(f => <option key={f} value={f}>{folgeLabel} {f}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Status */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>Status</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {STATUS_LIST.map(s => (
                <button key={s.id} onClick={() => setStatus(s.id)} style={{
                  padding: '4px 10px', borderRadius: 20, fontSize: 11, cursor: 'pointer',
                  border: status === s.id ? `1.5px solid ${s.farbe}` : '1px solid var(--border)',
                  background: status === s.id ? s.farbe + '20' : 'none',
                  color: status === s.id ? s.farbe : 'var(--text-secondary)',
                  fontWeight: status === s.id ? 600 : 400,
                }}>{s.label}</button>
              ))}
            </div>
          </div>

          {/* Notiz */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>Notiz</label>
            <textarea value={notiz} onChange={e => setNotiz(e.target.value)} rows={2} placeholder="Optionale Anmerkung..." style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-subtle)', fontSize: 12, color: 'var(--text-primary)', resize: 'none' }} />
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div>{onDelete && <button onClick={handleDelete} disabled={deleting} style={{ padding: '7px 14px', borderRadius: 7, border: '1px solid #FF3B30', background: 'none', color: '#FF3B30', cursor: 'pointer', fontSize: 12 }}>{deleting ? '...' : 'Löschen'}</button>}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={onClose} style={{ padding: '7px 16px', borderRadius: 7, border: '1px solid var(--border)', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12 }}>Abbrechen</button>
              <button onClick={handleSave} disabled={saving} style={{ padding: '7px 20px', borderRadius: 7, border: 'none', background: '#000', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                {saving ? '...' : 'Speichern'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── WochenNotizModal ──────────────────────────────────────────────────────────

function WochenNotizModal({
  woche, notiz, produktionDbId, onSave, onDelete, onClose,
}: {
  woche: Date; notiz?: WochenNotiz; produktionDbId: string
  onSave: (text: string, typ: string) => Promise<void>
  onDelete?: () => Promise<void>
  onClose: () => void
}) {
  const [text, setText] = useState(notiz?.text || '')
  const [typ, setTyp] = useState(notiz?.typ || 'allgemein')
  const [saving, setSaving] = useState(false)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: 'var(--bg-page)', borderRadius: 12, width: 420, padding: 24, boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Wochennotiz · {formatWoche(woche)}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={16} /></button>
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          {['allgemein', 'zusatzkosten', 'sperrer'].map(t => (
            <button key={t} onClick={() => setTyp(t)} style={{
              padding: '4px 10px', borderRadius: 5, fontSize: 11, cursor: 'pointer',
              border: typ === t ? '1.5px solid #007AFF' : '1px solid var(--border)',
              background: typ === t ? '#007AFF20' : 'none',
              color: typ === t ? '#007AFF' : 'var(--text-secondary)',
            }}>
              {t === 'allgemein' ? 'Allgemein' : t === 'zusatzkosten' ? 'Zusatzkosten' : 'Sperrer'}
            </button>
          ))}
        </div>
        <textarea value={text} onChange={e => setText(e.target.value)} rows={4} placeholder="Notiz eingeben..." style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-subtle)', fontSize: 12, color: 'var(--text-primary)', resize: 'vertical' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14 }}>
          <div>{onDelete && <button onClick={onDelete} style={{ padding: '6px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer', border: '1px solid #FF3B30', background: 'none', color: '#FF3B30' }}>Löschen</button>}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={{ padding: '6px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer', border: '1px solid var(--border)', background: 'none', color: 'var(--text-secondary)' }}>Abbrechen</button>
            <button onClick={async () => { setSaving(true); await onSave(text, typ); setSaving(false) }} disabled={saving || !text.trim()} style={{ padding: '6px 16px', borderRadius: 6, fontSize: 12, cursor: 'pointer', border: 'none', background: '#000', color: '#fff', fontWeight: 600 }}>
              {saving ? '...' : 'Speichern'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── AutorenplanGrid ───────────────────────────────────────────────────────────

function AutorenplanGrid({
  jobKategorien, produktionDbId,
}: {
  jobKategorien: JobKategorie[]
  produktionDbId: string
}) {
  const { t } = useTerminologie()
  const folgeLabel = t('folge') || 'Folge'

  const [einsaetze, setEinsaetze] = useState<Einsatz[]>([])
  const [notizen, setNotizen] = useState<WochenNotiz[]>([])
  const [blockInfo, setBlockInfo] = useState<BlockInfo | null>(null)
  const [windowStart, setWindowStart] = useState<Date>(() => addWeeks(mondayOf(new Date()), -4))
  const WEEKS_VISIBLE = 20
  const [modal, setModal] = useState<{ einsatz?: Einsatz; jk: JobKategorie; woche: Date } | null>(null)
  const [noteModal, setNoteModal] = useState<{ woche: Date; notiz?: WochenNotiz } | null>(null)
  const [showKostenstellen, setShowKostenstellen] = useState(false)

  const weeks = Array.from({ length: WEEKS_VISIBLE }, (_, i) => addWeeks(windowStart, i))
  const vonDate = dateKey(windowStart)
  const bisDate = dateKey(addWeeks(windowStart, WEEKS_VISIBLE))

  const CELL_W = 80
  const ROW_H = 34
  const LABEL_W = 140

  // Block-Info einmalig laden
  useEffect(() => {
    fetch(`/api/autorenplan/bloecke?produktion_db_id=${produktionDbId}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => setBlockInfo(d))
      .catch(() => {})
  }, [produktionDbId])

  const blockLabel = blockInfo?.block_label || 'Block'

  const loadData = useCallback(() => {
    Promise.all([
      fetch(`/api/autorenplan/einsaetze?produktion_db_id=${produktionDbId}&von=${vonDate}&bis=${bisDate}`, { credentials: 'include' })
        .then(r => r.json()).then(d => setEinsaetze(d.einsaetze || [])),
      fetch(`/api/autorenplan/wochen-notizen?produktion_db_id=${produktionDbId}&von=${vonDate}&bis=${bisDate}`, { credentials: 'include' })
        .then(r => r.json()).then(d => setNotizen(d.notizen || [])),
    ]).catch(() => {})
  }, [produktionDbId, vonDate, bisDate])

  useEffect(() => { loadData() }, [loadData])

  // Slots für Zelle berechnen
  function getSlotsForCell(jk: JobKategorie, weekDate: Date): (Einsatz | null)[] {
    const wKey = dateKey(weekDate)
    const active = einsaetze.filter(e => {
      const key = e.job_kategorie_id ?? e.prozess_id
      if (key !== jk.id && key !== jk.id) return false
      if (e.job_kategorie_id !== jk.id) return false
      const start = new Date(e.woche_von)
      const end = addWeeks(start, jk.dauer_wochen)
      return weekDate >= start && weekDate < end
    })

    if (jk.dauer_wochen === 1) {
      return active
        .filter(e => e.woche_von === wKey)
        .sort((a, b) => (a.erstellt_am || '') > (b.erstellt_am || '') ? 1 : -1)
    } else {
      const slotMap: (Einsatz | null)[] = Array(jk.dauer_wochen).fill(null)
      for (const e of active) {
        const offset = weeksBetween(new Date(e.woche_von), weekDate)
        if (offset >= 0 && offset < jk.dauer_wochen) slotMap[offset] = e
      }
      return slotMap
    }
  }

  function maxSlotsForCell(jk: JobKategorie, weekDate: Date): number {
    if (!jk.slots_gleich_folgen) return jk.max_slots
    const block = blockFuerWoche(jk, weekDate, blockInfo)
    return block?.folgen_anzahl ?? jk.max_slots
  }

  function isHOWeek(jk: JobKategorie, weekDate: Date, einsatz: Einsatz): boolean {
    if (einsatz.ist_homeoffice_override !== null && einsatz.ist_homeoffice_override !== undefined) {
      return einsatz.ist_homeoffice_override
    }
    const offset = weeksBetween(new Date(einsatz.woche_von), weekDate) + 1
    return !jk.praesenz_wochen.includes(offset)
  }

  // Block-Header über Wochenspalten
  function blockHeaderForWeek(weekDate: Date): { label: string; isFirst: boolean } {
    if (!blockInfo?.bloecke.length || !jobKategorien.length) return { label: '', isFirst: false }
    // Nimm die erste Job-Kategorie mit Blockkalender als Referenz
    const refJk = jobKategorien.find(j => j.erster_block_start)
    if (!refJk) return { label: '', isFirst: false }
    const block = blockFuerWoche(refJk, weekDate, blockInfo)
    if (!block) return { label: '', isFirst: false }
    const start = mondayOf(new Date(refJk.erster_block_start!))
    const offsetWeeks = weeksBetween(start, mondayOf(weekDate))
    const isFirst = offsetWeeks >= 0 && offsetWeeks % refJk.dauer_wochen === 0
    return {
      label: `${blockLabel} ${block.block_nummer}${block.folgen_anzahl > 0 ? ` · ${block.folgen_anzahl} ${folgeLabel}n` : ''}`,
      isFirst,
    }
  }

  const handleCellClick = (jk: JobKategorie, week: Date, einsatz?: Einsatz) => {
    setModal({ einsatz, jk, woche: week })
  }

  const handleSaveEinsatz = async (data: Partial<Einsatz>) => {
    if (modal?.einsatz) {
      await fetch(`/api/autorenplan/einsaetze/${modal.einsatz.id}`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
    } else {
      await fetch('/api/autorenplan/einsaetze', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, produktion_db_id: produktionDbId }),
      })
    }
    loadData()
  }

  const handleDeleteEinsatz = async (id: string) => {
    await fetch(`/api/autorenplan/einsaetze/${id}`, { method: 'DELETE', credentials: 'include' })
    loadData()
  }

  const today = mondayOf(new Date())

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-page)' }}>
        <button onClick={() => setWindowStart(w => addWeeks(w, -4))}
          style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
          <ChevronLeft size={14} />
        </button>
        <button onClick={() => setWindowStart(mondayOf(new Date()))}
          style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer', color: 'var(--text-secondary)' }}>
          Heute
        </button>
        <button onClick={() => setWindowStart(w => addWeeks(w, 4))}
          style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
          <ChevronRight size={14} />
        </button>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          {formatWoche(windowStart)} — {formatWoche(addWeeks(windowStart, WEEKS_VISIBLE - 1))}
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={() => setShowKostenstellen(v => !v)}
          style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer', color: showKostenstellen ? '#007AFF' : 'var(--text-secondary)' }}>
          KST
        </button>
      </div>

      {/* Grid */}
      <div style={{ overflowX: 'auto', overflowY: 'auto', flex: 1 }}>
        <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: LABEL_W + CELL_W * WEEKS_VISIBLE }}>
          <colgroup>
            <col style={{ width: LABEL_W }} />
            {weeks.map((_, i) => <col key={i} style={{ width: CELL_W }} />)}
          </colgroup>
          <thead>
            {/* Block-Header */}
            {blockInfo?.bloecke.length && jobKategorien.some(j => j.erster_block_start) && (
              <tr>
                <th style={{ height: 20, background: 'var(--bg-page)', position: 'sticky', left: 0, top: 0, zIndex: 12, borderRight: '1px solid var(--border)' }} />
                {weeks.map((w, wi) => {
                  const { label, isFirst } = blockHeaderForWeek(w)
                  return (
                    <th key={wi} style={{
                      height: 20, fontSize: 9, fontWeight: isFirst ? 700 : 400,
                      color: isFirst ? 'var(--text-primary)' : 'transparent',
                      background: isFirst ? 'var(--bg-subtle)' : 'var(--bg-page)',
                      borderLeft: isFirst ? '2px solid var(--border)' : '1px solid var(--border)',
                      borderBottom: '1px solid var(--border)',
                      whiteSpace: 'nowrap', overflow: 'hidden', padding: '0 4px',
                      position: 'sticky', top: 0, zIndex: 8,
                    }}>
                      {isFirst ? label : ''}
                    </th>
                  )
                })}
              </tr>
            )}
            {/* Wochen-Header */}
            <tr>
              <th style={{
                position: 'sticky', left: 0, top: blockInfo ? 20 : 0, zIndex: 12,
                background: 'var(--bg-page)', borderRight: '1px solid var(--border)',
                borderBottom: '2px solid var(--border)', fontSize: 10, fontWeight: 600,
                padding: '4px 12px', textAlign: 'left', color: 'var(--text-secondary)',
              }}>
                Job-Kategorie
              </th>
              {weeks.map((w, wi) => {
                const isToday = dateKey(w) === dateKey(today)
                return (
                  <th key={wi} style={{
                    height: 32, position: 'sticky', top: blockInfo?.bloecke.length ? 20 : 0, zIndex: 8,
                    background: isToday ? '#007AFF08' : 'var(--bg-page)',
                    borderLeft: '1px solid var(--border)', borderBottom: '2px solid var(--border)',
                    fontSize: 9, fontWeight: isToday ? 700 : 400,
                    color: isToday ? '#007AFF' : 'var(--text-secondary)',
                    padding: '2px 4px', textAlign: 'center',
                  }}>
                    <div>{kw(w)}</div>
                    <div style={{ fontSize: 8 }}>{formatWoche(w)}</div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {jobKategorien.map(jk => {
              return weeks.map((week, wi) => {
                const maxSlots = maxSlotsForCell(jk, week)
                const slots = getSlotsForCell(jk, week)
                // Warn wenn Slots > maxSlots (nur bei slots_gleich_folgen)
                const isOverbooked = jk.slots_gleich_folgen && slots.filter(Boolean).length > maxSlots
                const isToday = dateKey(week) === dateKey(today)

                if (wi === 0) {
                  // Erste Woche: render Label-Spalte + erste Zelle zusammen
                  return (
                    <tr key={`${jk.id}-${wi}`}>
                      <td style={{
                        position: 'sticky', left: 0, zIndex: 5,
                        background: 'var(--bg-page)', borderRight: '1px solid var(--border)',
                        borderBottom: '1px solid var(--border)',
                        padding: '0 8px', height: ROW_H * maxSlots || ROW_H,
                        verticalAlign: 'middle',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <div style={{ width: 3, height: 20, borderRadius: 2, background: jk.farbe, flexShrink: 0 }} />
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 110 }}>
                              {jk.label}
                            </div>
                            {showKostenstellen && (
                              <div style={{ fontSize: 9, color: 'var(--text-secondary)' }}>
                                {jk.gage_betrag ? `${jk.gage_betrag.toLocaleString('de-DE')} € ${ABRECHNUNGSTYPEN.find(a => a.id === jk.abrechnungstyp)?.label ?? ''}` : '—'}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      {renderWeekCells(jk, week, slots, maxSlots, isToday, isOverbooked)}
                    </tr>
                  )
                }
                return (
                  <tr key={`${jk.id}-${wi}`}>
                    {renderWeekCells(jk, week, slots, maxSlots, isToday, isOverbooked)}
                  </tr>
                )
              })
            })}

            {/* Wochennotizen-Zeile */}
            <tr>
              <td style={{
                padding: '0 12px', height: ROW_H, fontSize: 10, color: 'var(--text-secondary)',
                fontStyle: 'italic', position: 'sticky', left: 0, zIndex: 5,
                background: 'var(--bg-page)', borderRight: '1px solid var(--border)',
                borderTop: '1px solid var(--border)',
              }}>
                Notizen
              </td>
              {weeks.map((w, wi) => {
                const nots = notizen.filter(n => n.woche_von === dateKey(w))
                const typColor = nots[0]?.typ === 'zusatzkosten' ? '#FF9500' : nots[0]?.typ === 'sperrer' ? '#FF3B30' : '#9E9E9E'
                return (
                  <td key={wi} onClick={() => setNoteModal({ woche: w, notiz: nots[0] })}
                    style={{
                      height: ROW_H, borderLeft: '1px solid var(--border)', borderTop: '1px solid var(--border)',
                      cursor: 'pointer', padding: '2px 4px', verticalAlign: 'middle',
                      background: nots.length ? typColor + '15' : 'transparent',
                    }}
                    onMouseEnter={e => { if (!nots.length) e.currentTarget.style.background = 'var(--bg-subtle)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = nots.length ? typColor + '15' : 'transparent' }}>
                    {nots.length > 0 ? (
                      <Tooltip text={nots.map(n => n.text).join('\n')}>
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <div style={{ width: 6, height: 6, borderRadius: '50%', background: typColor }} />
                        </div>
                      </Tooltip>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', opacity: 0.2 }}>
                        <Plus size={9} />
                      </div>
                    )}
                  </td>
                )
              })}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Modals */}
      {modal && (
        <EinsatzModal
          einsatz={modal.einsatz}
          jk={modal.jk}
          wocheDatum={modal.woche}
          produktionDbId={produktionDbId}
          blockInfo={blockInfo}
          blockLabel={blockLabel}
          folgeLabel={folgeLabel}
          onSave={handleSaveEinsatz}
          onDelete={modal.einsatz ? () => handleDeleteEinsatz(modal.einsatz!.id) : undefined}
          onClose={() => setModal(null)}
        />
      )}
      {noteModal && (
        <WochenNotizModal
          woche={noteModal.woche}
          notiz={noteModal.notiz}
          produktionDbId={produktionDbId}
          onSave={async (text, typ) => {
            if (noteModal.notiz) {
              await fetch(`/api/autorenplan/wochen-notizen/${noteModal.notiz.id}`, {
                method: 'PUT', credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, typ }),
              })
            } else {
              await fetch('/api/autorenplan/wochen-notizen', {
                method: 'POST', credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ produktion_db_id: produktionDbId, woche_von: dateKey(noteModal.woche), text, typ }),
              })
            }
            loadData()
            setNoteModal(null)
          }}
          onDelete={noteModal.notiz ? async () => {
            await fetch(`/api/autorenplan/wochen-notizen/${noteModal.notiz!.id}`, { method: 'DELETE', credentials: 'include' })
            loadData()
            setNoteModal(null)
          } : undefined}
          onClose={() => setNoteModal(null)}
        />
      )}
    </div>
  )

  function renderWeekCells(
    jk: JobKategorie, week: Date,
    slots: (Einsatz | null)[], maxSlots: number,
    isToday: boolean, isOverbooked: boolean
  ) {
    return (
      <>
        {Array.from({ length: maxSlots }, (_, slotIdx) => {
          const einsatz = slots[slotIdx] || null
          const color = jk.farbe
          const name = einsatz?.person_cache_name || einsatz?.platzhalter_name || ''
          const isHO = einsatz ? isHOWeek(jk, week, einsatz) : false
          const blockNr = einsatz?.block_nummer
          const folgeNr = einsatz?.folge_nummer
          const isLastSlot = slotIdx === maxSlots - 1

          return (
            <td key={slotIdx}
              onClick={() => handleCellClick(jk, week, einsatz || undefined)}
              style={{
                width: CELL_W, minWidth: CELL_W, height: ROW_H, padding: '2px 4px',
                borderLeft: '1px solid var(--border)',
                borderBottom: isLastSlot ? '2px solid var(--border)' : '1px solid var(--border)',
                background: isToday ? '#007AFF08' : einsatz ? `${color}15` : 'transparent',
                cursor: 'pointer', verticalAlign: 'middle', position: 'relative',
              }}
              onMouseEnter={e => { if (!einsatz) e.currentTarget.style.background = 'var(--bg-subtle)' }}
              onMouseLeave={e => { e.currentTarget.style.background = isToday ? '#007AFF08' : einsatz ? `${color}15` : 'transparent' }}
            >
              {einsatz ? (
                <Tooltip text={[
                  `${jk.label} · ${statusLabel(einsatz.status)}`,
                  name,
                  isHO ? 'HomeOffice' : 'Präsenz (Writers Room)',
                  blockNr ? `${blockLabel} ${blockNr}` : '',
                  folgeNr ? `${folgeLabel} ${folgeNr}` : '',
                  einsatz.notiz || '',
                ].filter(Boolean).join('\n')}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3, height: '100%' }}>
                    <div style={{ width: 3, height: 26, borderRadius: 2, background: statusColor(einsatz.status), flexShrink: 0 }} />
                    <div style={{ overflow: 'hidden', flex: 1 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-primary)' }}>
                        {name || '—'}
                      </div>
                      <div style={{ fontSize: 9, color: 'var(--text-secondary)', display: 'flex', gap: 3 }}>
                        <span style={{ color: isHO ? 'var(--text-secondary)' : '#FF9500' }}>{isHO ? 'HO' : 'Präs'}</span>
                        {blockNr && <span>· {blockLabel.slice(0, 2)}{blockNr}</span>}
                      </div>
                    </div>
                    {isOverbooked && slotIdx === 0 && (
                      <AlertCircle size={8} style={{ color: '#FF3B30', flexShrink: 0 }} />
                    )}
                  </div>
                </Tooltip>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', opacity: 0.25 }}>
                  <Plus size={10} />
                </div>
              )}
            </td>
          )
        })}
      </>
    )
  }
}

// ── JobKategorienPanel (Y-Achse konfigurieren) ────────────────────────────────

function JobKategorienPanel({
  jobKategorien, produktionDbId, onReload,
}: {
  jobKategorien: JobKategorie[]
  produktionDbId: string
  onReload: () => void
}) {
  const [editModal, setEditModal] = useState<JobKategorie | null | 'new'>( null)

  const handleSave = async (data: Partial<JobKategorie>) => {
    if (editModal === 'new') {
      await fetch('/api/autorenplan/job-kategorien', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, produktion_db_id: produktionDbId }),
      })
    } else if (editModal) {
      await fetch(`/api/autorenplan/job-kategorien/${editModal.id}`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
    }
    onReload()
  }

  const handleDelete = async (jk: JobKategorie) => {
    await fetch(`/api/autorenplan/job-kategorien/${jk.id}`, { method: 'DELETE', credentials: 'include' })
    onReload()
  }

  return (
    <div style={{ padding: '24px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Job-Kategorien (Y-Achse)</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>Definieren welche Zeilen im Raster angezeigt werden</div>
        </div>
        <button onClick={() => setEditModal('new')} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
          borderRadius: 8, border: 'none', background: '#000', color: '#fff',
          fontSize: 12, fontWeight: 600, cursor: 'pointer',
        }}>
          <Plus size={13} /> Neue Job-Kategorie
        </button>
      </div>

      {jobKategorien.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)', fontSize: 13 }}>
          Noch keine Job-Kategorien. Lege die erste an.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {jobKategorien.map(jk => (
            <div key={jk.id} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              background: 'var(--bg-surface)', borderRadius: 10, padding: '12px 16px',
              border: '1px solid var(--border)',
            }}>
              <GripVertical size={14} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: jk.farbe, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{jk.label}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, display: 'flex', gap: 12 }}>
                  <span>{jk.dauer_wochen} {jk.dauer_wochen === 1 ? 'Woche' : 'Wochen'}</span>
                  <span>{jk.slots_gleich_folgen ? 'Slots = Folgen' : `${jk.max_slots} Slots`}</span>
                  <span>Präsenz W{jk.praesenz_wochen.join(',') || '—'}</span>
                  {jk.gage_betrag && <span>{jk.gage_betrag.toLocaleString('de-DE')} € {ABRECHNUNGSTYPEN.find(a => a.id === jk.abrechnungstyp)?.label} · {jk.lst_rg}</span>}
                  {jk.erster_block_start && <span>Start: {new Date(jk.erster_block_start).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })}</span>}
                </div>
                {jk.beschreibung && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 3, fontStyle: 'italic' }}>{jk.beschreibung}</div>}
              </div>
              <button onClick={() => setEditModal(jk)}
                style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Edit2 size={11} /> Bearbeiten
              </button>
            </div>
          ))}
        </div>
      )}

      {editModal && (
        <JobKategorieModal
          jk={editModal === 'new' ? undefined : editModal}
          produktionDbId={produktionDbId}
          onSave={handleSave}
          onDelete={editModal !== 'new' ? () => handleDelete(editModal as JobKategorie) : undefined}
          onClose={() => setEditModal(null)}
        />
      )}
    </div>
  )
}

// ── FuturesPanel ──────────────────────────────────────────────────────────────

function FuturesPanel({ produktionDbId }: { produktionDbId: string }) {
  const [futures, setFutures] = useState<Future[]>([])
  const [newModal, setNewModal] = useState(false)

  const load = () => {
    fetch(`/api/autorenplan/futures?produktion_db_id=${produktionDbId}`, { credentials: 'include' })
      .then(r => r.json()).then(d => setFutures(d.futures || []))
      .catch(() => {})
  }

  useEffect(() => { load() }, [produktionDbId])

  return (
    <div style={{ padding: '24px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Futures</div>
        <button onClick={() => setNewModal(true)} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
          borderRadius: 8, border: 'none', background: '#000', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
        }}>
          <Plus size={13} /> Neue Future
        </button>
      </div>
      {futures.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)', fontSize: 13 }}>Noch keine Futures angelegt.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {futures.map(f => (
            <div key={f.id} style={{ background: 'var(--bg-surface)', borderRadius: 10, border: '1px solid var(--border)', padding: '14px 16px' }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{f.titel}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Schreiben: {new Date(f.schreib_von).toLocaleDateString('de-DE')} – {new Date(f.schreib_bis).toLocaleDateString('de-DE')}
                {f.edit_von && ` · Edit: ${new Date(f.edit_von).toLocaleDateString('de-DE')} – ${new Date(f.edit_bis!).toLocaleDateString('de-DE')}`}
              </div>
              <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {f.autoren.map(a => (
                  <span key={a.id} style={{
                    padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 500,
                    background: a.phase === 'schreiben' ? '#007AFF18' : '#FF950018',
                    color: a.phase === 'schreiben' ? '#007AFF' : '#FF9500',
                    border: `1px solid ${a.phase === 'schreiben' ? '#007AFF44' : '#FF950044'}`,
                  }}>
                    {a.person_cache_name || a.platzhalter_name || '—'} {a.ist_homeoffice ? '(HO)' : ''}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── AutorenplanTab (Main) ─────────────────────────────────────────────────────

export default function AutorenplanTab({ produktionDbId }: { produktionDbId: string }) {
  const [view, setView] = useState<'plan' | 'futures' | 'jobedit'>('plan')
  const [jobKategorien, setJobKategorien] = useState<JobKategorie[]>([])
  const [loading, setLoading] = useState(true)

  const loadJobKategorien = useCallback(() => {
    fetch(`/api/autorenplan/job-kategorien?produktion_db_id=${produktionDbId}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setJobKategorien(d.job_kategorien || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [produktionDbId])

  useEffect(() => { loadJobKategorien() }, [loadJobKategorien])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Tab Navigation */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border)', padding: '0 0 0 0', background: 'var(--bg-page)', flexShrink: 0 }}>
        {[
          { id: 'plan', label: 'Plan', icon: '📅' },
          { id: 'futures', label: 'Futures', icon: '📋' },
          { id: 'jobedit', label: 'Job-Kategorien', icon: <Settings size={12} /> },
        ].map(tab => (
          <button key={tab.id} onClick={() => setView(tab.id as any)} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer',
            fontSize: 12, fontWeight: view === tab.id ? 700 : 400,
            color: view === tab.id ? 'var(--text-primary)' : 'var(--text-secondary)',
            borderBottom: view === tab.id ? '2px solid #000' : '2px solid transparent',
          }}>
            {typeof tab.icon === 'string' ? tab.icon : tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {loading ? (
          <div style={{ padding: 32, fontSize: 13, color: 'var(--text-secondary)' }}>Lade...</div>
        ) : (
          <>
            {view === 'plan' && (
              jobKategorien.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 12 }}>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Noch keine Job-Kategorien definiert.</div>
                  <button onClick={() => setView('jobedit')} style={{
                    padding: '8px 18px', borderRadius: 8, border: 'none', background: '#000', color: '#fff',
                    fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <Settings size={12} /> Job-Kategorien anlegen
                  </button>
                </div>
              ) : (
                <AutorenplanGrid jobKategorien={jobKategorien} produktionDbId={produktionDbId} />
              )
            )}
            {view === 'futures' && <div style={{ padding: '0 24px', overflowY: 'auto', flex: 1 }}><FuturesPanel produktionDbId={produktionDbId} /></div>}
            {view === 'jobedit' && <div style={{ padding: '0 24px', overflowY: 'auto', flex: 1 }}><JobKategorienPanel jobKategorien={jobKategorien} produktionDbId={produktionDbId} onReload={loadJobKategorien} /></div>}
          </>
        )}
      </div>
    </div>
  )
}
