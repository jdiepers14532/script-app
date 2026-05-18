import { useState, useEffect, useCallback, useRef } from 'react'
import { X, Plus, ChevronLeft, ChevronRight, Settings, Users, Edit2, Trash2, Search, AlertCircle, GripVertical, Info, Clock } from 'lucide-react'
import Tooltip from './Tooltip'
import { useTerminologie } from '../sw-ui'
import AutorenplanSettingsModal from './AutorenplanSettingsModal'

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
  gagen?: GageEntry[]
  kostenstelle?: string
}

interface Zusatz {
  id: string
  job_kategorie_id?: string
  produktion_db_id?: string
  einsatz_id?: string
  woche_von?: string
  vertragsdb_person_id?: number
  platzhalter_name?: string
  person_cache_name?: string
  notiz?: string
  status?: string
  erstellt_am?: string
}

interface GageEntry {
  kat: string
  abrechnungstyp: string
  betrag: string
  lst_rg: string
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
  von_datum?: string
  bis_datum?: string
  gage_kat?: number
  gage_kategorie_id?: string
  erstellt_am?: string
  angefragt_am?: string
  angefragt_von?: string
  zugesagt_am?: string
  zugesagt_von?: string
  vertrag_zurueck_am?: string
  vertrag_zurueck_von?: string
  abgesagt_am?: string
  abgesagt_von?: string
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

const NOTIZ_FARBEN: Record<string, string> = {
  allgemein:    '#007AFF',
  zusatzkosten: '#AF52DE',
  sperrer:      '#8B0000',
}

const STATUS_LIST = [
  { id: 'geplant',             label: 'Geplant',              farbe: '#9E9E9E' },
  { id: 'angefragt',           label: 'Angefragt',            farbe: '#007AFF' },
  { id: 'zugesagt',            label: 'Zugesagt',             farbe: '#34C759' },
  { id: 'vertrag_geschrieben', label: 'Vertrag geschrieben',  farbe: '#00C853' },
  { id: 'vertrag_zurueck',     label: 'Vertrag zurück',       farbe: '#1B7A4E' },
  { id: 'abgesagt',            label: 'Abgesagt',             farbe: '#FF3B30' },
  { id: 'rechnung_erhalten',   label: 'Rechnung erhalten',    farbe: '#FF9500' },
]

const ABRECHNUNGSTYPEN = [
  { id: 'pauschal',   label: 'Pauschal' },
  { id: 'pro_woche',  label: 'Pro Woche' },
  { id: 'pro_tag',    label: 'Pro Tag' },
  { id: 'pro_buch',   label: 'Pro Buch' },
  { id: 'pro_monat',  label: 'Pro Monat' },
  { id: 'pro_block',  label: 'Pro Block' },
]

function statusColor(s: string): string {
  return STATUS_LIST.find(x => x.id === s)?.farbe ?? '#9E9E9E'
}
function statusLabel(s: string): string {
  return STATUS_LIST.find(x => x.id === s)?.label ?? s
}
function statusAbbr(s: string): string {
  const abbrs: Record<string, string> = {
    geplant: 'Gep', angefragt: 'Ang', zugesagt: 'Zug',
    vertrag_geschrieben: 'VG', vertrag_zurueck: 'VZ', abgesagt: 'Abs', rechnung_erhalten: 'RE',
  }
  return abbrs[s] ?? s.slice(0, 3)
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
  value, displayName, onSelect, onPlatzhalter, onTextChange,
}: {
  value?: number
  displayName?: string
  onSelect: (p: Person) => void
  onPlatzhalter?: (name: string) => void
  onTextChange?: (text: string) => void
}) {
  const [q, setQ] = useState(displayName || '')
  const [results, setResults] = useState<Person[]>([])
  const [loading, setLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [hadResults, setHadResults] = useState(false)
  const debounceRef = useRef<any>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setQ(displayName || '') }, [displayName])

  const search = useCallback((query: string) => {
    if (query.trim().length < 2) { setResults([]); setHasSearched(false); return }
    setLoading(true)
    fetch(`/api/autorenplan/personen-suche?name=${encodeURIComponent(query)}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        const found = d.personen || []
        setResults(found)
        setHasSearched(true)
        setHadResults(found.length > 0)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const handleInput = (val: string) => {
    setQ(val)
    onTextChange?.(val)
    setHasSearched(false)
    setHadResults(false)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(val), 300)
  }

  const selectResult = (p: Person) => {
    onSelect(p); setQ(p.name); setResults([]); setHasSearched(false); setHadResults(false)
  }

  const closeDropdown = () => {
    setResults([]); setHasSearched(false)
    // hadResults bleibt — damit "+ In Firmenadressbuch anlegen" sichtbar bleibt
  }

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Tab' && results.length > 0) {
      e.preventDefault()
      const first = dropdownRef.current?.querySelector<HTMLElement>('[data-item]')
      first?.focus()
    } else if (e.key === 'Escape') {
      closeDropdown()
    } else if (e.key === 'ArrowDown' && results.length > 0) {
      e.preventDefault()
      const first = dropdownRef.current?.querySelector<HTMLElement>('[data-item]')
      first?.focus()
    }
  }

  const handleItemKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, p: Person, idx: number) => {
    if (e.key === 'Enter') {
      e.preventDefault(); selectResult(p)
    } else if (e.key === 'Tab') {
      // Tab schließt Dropdown; natürlicher Focus-Fluss weiter
      closeDropdown()
    } else if (e.key === 'Escape') {
      closeDropdown(); inputRef.current?.focus()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      const items = dropdownRef.current?.querySelectorAll<HTMLElement>('[data-item]')
      items?.[idx + 1]?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (idx === 0) {
        inputRef.current?.focus()
      } else {
        const items = dropdownRef.current?.querySelectorAll<HTMLElement>('[data-item]')
        items?.[idx - 1]?.focus()
      }
    }
  }

  const showNeuAnlegen = q.trim().length >= 2 && (
    (hasSearched && results.length === 0) || hadResults
  )

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', pointerEvents: 'none' }} />
        <input
          ref={inputRef}
          value={q}
          onChange={e => handleInput(e.target.value)}
          onKeyDown={handleInputKeyDown}
          placeholder="Name suchen..."
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '7px 8px 7px 28px', borderRadius: 6, border: '1px solid var(--border)',
            background: 'var(--bg-subtle)', fontSize: 12, color: 'var(--text-primary)',
          }}
        />
      </div>
      {results.length > 0 && (
        <div ref={dropdownRef} style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
          background: 'var(--bg-page)', border: '1px solid var(--border)', borderRadius: 6,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)', maxHeight: 200, overflowY: 'auto',
        }}>
          {results.map((p, idx) => (
            <div
              key={p.id}
              data-item
              tabIndex={0}
              onClick={() => selectResult(p)}
              onKeyDown={e => handleItemKeyDown(e, p, idx)}
              style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 12, borderBottom: '1px solid var(--border)', outline: 'none' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-subtle)')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}
              onFocus={e => (e.currentTarget.style.background = 'var(--bg-subtle)')}
              onBlur={e => (e.currentTarget.style.background = '')}
            >
              <div style={{ fontWeight: 500 }}>{p.name}</div>
              {p.email && <div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{p.email}</div>}
            </div>
          ))}
        </div>
      )}
      {loading && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>Suche...</div>}
      {q.trim().length >= 1 && (
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <button
            onMouseDown={e => { e.preventDefault(); onPlatzhalter?.(q); setHasSearched(false) }}
            style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text-secondary)', textAlign: 'left' }}>
            Als Platzhalter eintragen
          </button>
          {showNeuAnlegen && (
            <button
              onMouseDown={e => {
                e.preventDefault()
                window.open(
                  `https://vertraege.serienwerft.studio/adressbuch?neu=1&name=${encodeURIComponent(q)}`,
                  'vertraege-neuer-kontakt',
                  'width=860,height=720,left=180,top=80'
                )
              }}
              style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: 'none', background: '#007AFF', color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 600, textAlign: 'right' }}>
              + In Firmenadressbuch anlegen
            </button>
          )}
        </div>
      )}
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

  // Tätigkeit-Name aus Vertragsdb nachladen, falls nur ID vorhanden
  useEffect(() => {
    if (taetigkeitId && !taetigkeitLabel) {
      fetch(`/api/autorenplan/taetigkeiten?ids=${taetigkeitId}`, { credentials: 'include' })
        .then(r => r.json())
        .then(d => { const t = d.taetigkeiten?.[0]; if (t?.bezeichnung) setTaetigkeitLabel(t.bezeichnung) })
        .catch(() => {})
    }
  }, [])
  const [maxSlots, setMaxSlots] = useState(jk?.max_slots ?? 1)
  const [slotsGleichFollen, setSlotsGleichFolgen] = useState(jk?.slots_gleich_folgen ?? false)
  const [dauerWochen, setDauerWochen] = useState(jk?.dauer_wochen ?? 1)
  const [praesenzWochen, setPraesenzWochen] = useState<number[]>(jk?.praesenz_wochen ?? [1])
  const [farbe, setFarbe] = useState(jk?.farbe || '#007AFF')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [kostenstelle, setKostenstelle] = useState(jk?.kostenstelle || '')
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
        kostenstelle: kostenstelle || undefined,
        vertragsdb_taetigkeit_id: taetigkeitId,
        max_slots: maxSlots,
        slots_gleich_folgen: slotsGleichFollen,
        dauer_wochen: dauerWochen,
        praesenz_wochen: praesenzWochen,
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

          {/* Tätigkeit aus Vertragsdb + Anzeige-Label — 2 Spalten */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                Job aus Vertragsdatenbank
              </div>
              {taetigkeitId ? (
                <div style={{ fontSize: 12, color: '#007AFF', display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', borderRadius: 6, background: '#007AFF10', border: '1px solid #007AFF30' }}>
                  <span style={{ flex: 1, fontWeight: 500 }}>{taetigkeitLabel}</span>
                  <span style={{ fontSize: 10, color: '#007AFF99' }}>ID {taetigkeitId}</span>
                  <button onClick={() => { setTaetigkeitId(undefined); setTaetigkeitLabel('') }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#007AFF', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '7px 10px', borderRadius: 6, background: 'var(--bg-subtle)', border: '1px solid var(--border)', fontStyle: 'italic' }}>
                  Keine Verknüpfung
                </div>
              )}
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                Tätigkeit suchen
              </div>
              <TaetigkeitPicker
                value={taetigkeitId}
                displayLabel={taetigkeitLabel}
                onSelect={t => { setTaetigkeitId(t.id); setTaetigkeitLabel(t.bezeichnung); if (!label) setLabel(t.bezeichnung) }}
                onNew={handleTaetigkeitNew}
              />
            </div>
          </div>

          {/* Anzeige-Label — inline */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}>
              Anzeige-Label
              <Tooltip text="Der Name der Job-Kategorie wie er im Autorenplan-Raster angezeigt wird. Pflichtfeld.">
                <Info size={11} style={{ color: 'var(--text-secondary)' }} />
              </Tooltip>
            </label>
            <input value={label} onChange={e => setLabel(e.target.value)} placeholder="z. B. Storyedit"
              style={{ flex: 1, padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-subtle)', fontSize: 13, color: 'var(--text-primary)' }} />
          </div>

          {/* Beschreibung */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>
              Kurzbeschreibung
            </label>
            <textarea value={beschreibung} onChange={e => setBeschreibung(e.target.value)} rows={2} placeholder="Optionale Beschreibung des Jobs..." style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-subtle)', fontSize: 12, color: 'var(--text-primary)', resize: 'none' }} />
          </div>

          {/* Kostenstelle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap' }}>KST</label>
            <input value={kostenstelle} onChange={e => setKostenstelle(e.target.value)} placeholder="z. B. 4100"
              style={{ width: 140, padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-subtle)', fontSize: 13, color: 'var(--text-primary)' }} />
          </div>

          {/* Slots */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 8 }}>
              Slots (Y-Achse)
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="number" min={1} max={20} value={maxSlots} onChange={e => setMaxSlots(parseInt(e.target.value) || 1)}
                  disabled={slotsGleichFollen}
                  style={{ width: 55, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: slotsGleichFollen ? 'var(--bg-subtle)' : 'var(--bg-subtle)', fontSize: 12, textAlign: 'center', opacity: slotsGleichFollen ? 0.4 : 1 }} />
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>feste Anzahl Slots</span>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12 }}>
                <input type="checkbox" checked={slotsGleichFollen} onChange={e => setSlotsGleichFolgen(e.target.checked)} />
                <span>= Folgenanzahl des Blocks</span>
                <Tooltip text="Das Raster zeigt so viele Slots wie Folgen im Block vorhanden sind (aus Prod-DB). Überschreitung wird als Warnung angezeigt.">
                  <Info size={11} style={{ color: 'var(--text-secondary)' }} />
                </Tooltip>
              </label>
            </div>
          </div>

          {/* Zeitkonfiguration */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 8 }}>
              Zeitkonfiguration
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Einsatz pro Block:</div>
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

function mondayPlusDays(d: Date, n: number): string {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return dateKey(r)
}

function fmtShortDate(s?: string): string {
  if (!s) return ''
  const parts = s.slice(0, 10).split('-')
  return `${parts[2]}.${parts[1]}.`
}

function fmtDate(s?: string): string {
  if (!s) return ''
  const d = new Date(s)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${String(d.getFullYear()).slice(2)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function EinsatzModal({
  einsatz, jk, wocheDatum, produktionDbId, blockInfo, blockLabel, folgeLabel,
  einsaetze, onSave, onDelete, onClose,
}: {
  einsatz?: Einsatz
  jk: JobKategorie
  wocheDatum: Date
  produktionDbId: string
  blockInfo: BlockInfo | null
  blockLabel: string
  folgeLabel: string
  einsaetze?: Einsatz[]
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
  const [vonDatum, setVonDatum] = useState(einsatz?.von_datum || mondayPlusDays(mondayOf(wocheDatum), 0))
  const [bisDatum, setBisDatum] = useState(einsatz?.bis_datum || mondayPlusDays(mondayOf(wocheDatum), 4))
  const [gageKat, setGageKat] = useState<number | undefined>(einsatz?.gage_kat)
  const [gageKategorieId, setGageKategorieId] = useState<string | undefined>(einsatz?.gage_kategorie_id)
  const [globalKategorien, setGlobalKategorien] = useState<Array<{id: string; label: string; kat_nr?: number}>>( [])
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [cacheResults, setCacheResults] = useState<string[]>([])

  useEffect(() => {
    fetch('/api/autorenplan/gage-kategorien', { credentials: 'include' })
      .then(r => r.json())
      .then(d => setGlobalKategorien(d.gage_kategorien || []))
      .catch(() => {})
  }, [])
  const cacheDebounceRef = useRef<any>(null)

  const weekBase = mondayOf(wocheDatum)
  const weekMonday = mondayPlusDays(weekBase, 0)
  const weekSunday = mondayPlusDays(weekBase, 6)

  // Gesamt-Vertragszeit aus benachbarten Einsätzen derselben Person (auch Platzhalter)
  const hasPersonMatch = personId !== undefined || (isPlatzhalter && !!personName)
  const matchesPerson = (e: Einsatz) =>
    personId !== undefined
      ? e.vertragsdb_person_id === personId
      : (e.platzhalter_name || '') === (personName || '')

  let gesamtVertragszeit: { von: string; bis: string; wochen: number } | null = null
  if (hasPersonMatch && einsaetze && einsaetze.length > 0) {
    const others = einsaetze.filter(e =>
      matchesPerson(e) &&
      e.job_kategorie_id === jk.id &&
      e.id !== einsatz?.id
    )
    if (others.length > 0) {
      const currentKey = dateKey(mondayOf(wocheDatum))
      const allKeys = new Set([...others.map(e => (e.woche_von || '').slice(0, 10)), currentKey])
      const adj = (k: string, dir: number) => dateKey(addWeeks(new Date(k + 'T12:00:00'), dir))
      let gStart = currentKey
      let gEnd = currentKey
      while (allKeys.has(adj(gStart, -1))) gStart = adj(gStart, -1)
      while (allKeys.has(adj(gEnd, 1))) gEnd = adj(gEnd, 1)
      if (gStart !== gEnd) {
        const groupOthers = others.filter(e => {
          const k = (e.woche_von || '').slice(0, 10)
          return k >= gStart && k <= gEnd
        })
        // Eigene Woche mit festen Standardwerten (kein State-Dependency → kein Cycle)
        const ownVon = einsatz?.von_datum || mondayPlusDays(wocheDatum, 0)
        const ownBis = einsatz?.bis_datum || mondayPlusDays(wocheDatum, 4)
        const vonAll = [ownVon, ...groupOthers.map(e => e.von_datum).filter(Boolean)].sort() as string[]
        const bisAll = [ownBis, ...groupOthers.map(e => e.bis_datum).filter(Boolean)].sort().reverse() as string[]
        const totalWeeks = [...allKeys].filter(k => k >= gStart && k <= gEnd).length
        gesamtVertragszeit = { von: vonAll[0], bis: bisAll[0], wochen: totalWeeks }
      }
    }
  }

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

  const handlePlatzhalterInput = (val: string) => {
    setPersonName(val)
    clearTimeout(cacheDebounceRef.current)
    if (val.trim().length >= 1) {
      cacheDebounceRef.current = setTimeout(() => {
        fetch(`/api/autorenplan/platzhalter-cache?q=${encodeURIComponent(val)}`, { credentials: 'include' })
          .then(r => r.json())
          .then(d => setCacheResults(d.names || []))
          .catch(() => {})
      }, 250)
    } else {
      setCacheResults([])
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave({
        job_kategorie_id: jk.id,
        woche_von: dateKey(mondayOf(wocheDatum)),
        produktion_db_id: produktionDbId,
        vertragsdb_person_id: personId,
        person_cache_name: personId ? personName : undefined,
        platzhalter_name: !personId && personName ? personName : undefined,
        block_nummer: blockNr,
        folge_nummer: folgeNr,
        status,
        notiz: notiz || undefined,
        von_datum: vonDatum || undefined,
        bis_datum: bisDatum || undefined,
        gage_kat: gageKat,
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
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: jk.farbe, flexShrink: 0 }} />
              <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{jk.label}</span>
              <span style={{ color: 'var(--text-secondary)' }}>·</span>
              <input
                type="date"
                value={vonDatum}
                min={weekMonday}
                max={weekSunday}
                onChange={e => setVonDatum(e.target.value)}
                style={{ fontSize: 11, border: '1px solid var(--border)', borderRadius: 4, padding: '1px 4px', background: 'var(--bg-page)', color: 'var(--text-primary)' }}
              />
              <span style={{ color: 'var(--text-secondary)' }}>–</span>
              <input
                type="date"
                value={bisDatum}
                min={vonDatum}
                max={weekSunday}
                onChange={e => setBisDatum(e.target.value)}
                style={{ fontSize: 11, border: '1px solid var(--border)', borderRadius: 4, padding: '1px 4px', background: 'var(--bg-page)', color: 'var(--text-primary)' }}
              />
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={16} /></button>
        </div>
        {/* Gesamt-Vertragszeit (nur wenn benachbarte Einsätze vorhanden) */}
        {gesamtVertragszeit && (
          <div style={{ padding: '7px 20px', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Gesamt-Vertragszeit:</div>
            <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-primary)' }}>
              {fmtShortDate(gesamtVertragszeit.von)} – {fmtShortDate(gesamtVertragszeit.bis)}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>({gesamtVertragszeit.wochen} Wochen)</div>
          </div>
        )}

        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Person */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>Person</label>
            {isPlatzhalter ? (
              <div>
                <div style={{ display: 'flex', gap: 6, position: 'relative' }}>
                  <div style={{ flex: 1, position: 'relative' }}>
                    <input
                      value={personName}
                      onChange={e => handlePlatzhalterInput(e.target.value)}
                      onFocus={() => { if (personName.trim().length >= 1) handlePlatzhalterInput(personName) }}
                      onBlur={() => setTimeout(() => setCacheResults([]), 150)}
                      placeholder="Platzhalter-Bezeichnung"
                      style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-subtle)', fontSize: 12, color: 'var(--text-primary)' }}
                    />
                    {cacheResults.length > 0 && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, background: 'var(--bg-page)', border: '1px solid var(--border)', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', overflow: 'hidden' }}>
                        {cacheResults.map(name => (
                          <div key={name} onMouseDown={() => { setPersonName(name); setCacheResults([]) }}
                            style={{ padding: '7px 10px', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-subtle)')}
                            onMouseLeave={e => (e.currentTarget.style.background = '')}>
                            <Clock size={11} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                            {name}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <button onClick={() => { setIsPlatzhalter(false); setCacheResults([]) }} style={{ padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                    <Search size={12} style={{ display: 'inline', marginRight: 4 }} />Suchen
                  </button>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 5, lineHeight: 1.5 }}>
                  Firmendatenbank verknüpfen oder neuen Kontakt anlegen? Nach dem Speichern kannst du den Kontakt direkt im Adressbuch erstellen.
                </div>
              </div>
            ) : (
              <div>
                <PersonPicker
                  value={personId}
                  displayName={personName}
                  onSelect={handlePersonSelect}
                  onPlatzhalter={name => { setPersonName(name); setPersonId(undefined); setIsPlatzhalter(true) }}
                  onTextChange={name => { setPersonName(name); setPersonId(undefined) }}
                />
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
              {STATUS_LIST.map(s => {
                const amKey = `${s.id}_am` as keyof Einsatz
                const vonKey = `${s.id}_von` as keyof Einsatz
                const trackedAm = ['angefragt','zugesagt','vertrag_zurueck','abgesagt'].includes(s.id)
                  ? (einsatz?.[amKey] as string | undefined) : undefined
                const trackedVon = trackedAm ? (einsatz?.[vonKey] as string | undefined) : undefined
                const tooltipText = trackedAm ? `${fmtDate(trackedAm)}${trackedVon ? ` · ${trackedVon}` : ''}` : ''
                const isAbgesagt = s.id === 'abgesagt'
                const isActive = status === s.id
                const btn = (
                  <button key={s.id} onClick={() => setStatus(s.id)} style={{
                    padding: '4px 10px', borderRadius: 20, fontSize: 11, cursor: 'pointer',
                    border: isActive ? `1.5px solid ${s.farbe}` : isAbgesagt ? `1px solid #FF3B3040` : '1px solid var(--border)',
                    background: isActive ? s.farbe + '20' : isAbgesagt ? '#FF3B3015' : 'none',
                    color: isActive ? s.farbe : isAbgesagt ? '#FF3B30aa' : 'var(--text-secondary)',
                    fontWeight: isActive ? 600 : 400,
                  }}>{s.label}</button>
                )
                return tooltipText
                  ? <Tooltip key={s.id} text={tooltipText}>{btn}</Tooltip>
                  : <span key={s.id}>{btn}</span>
              })}
            </div>
          </div>

          {/* Notiz */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>Notiz</label>
            <textarea value={notiz} onChange={e => setNotiz(e.target.value)} rows={2} placeholder="Optionale Anmerkung..." style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-subtle)', fontSize: 12, color: 'var(--text-primary)', resize: 'none' }} />
          </div>

          {/* Gagenkategorie */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>Kat.</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="number" min={1}
                value={gageKat ?? ''}
                onChange={e => setGageKat(e.target.value ? Number(e.target.value) : undefined)}
                placeholder="—"
                style={{ width: 60, padding: '7px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-subtle)', fontSize: 13, textAlign: 'center', color: 'var(--text-primary)' }}
              />
              {gageKat !== undefined && (() => {
                const match = globalKategorien.find(g => g.kat_nr === gageKat)
                return match ? <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{match.label}</span> : null
              })()}
            </div>
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
  woche, notizen, onAdd, onDeleteNotiz, onClose,
}: {
  woche: Date
  notizen: WochenNotiz[]
  onAdd: (text: string, typ: string) => Promise<void>
  onDeleteNotiz: (id: string) => Promise<void>
  onClose: () => void
}) {
  const [newText, setNewText] = useState('')
  const [newTyp, setNewTyp] = useState('allgemein')
  const [adding, setAdding] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleAdd = async () => {
    if (!newText.trim()) return
    setAdding(true)
    try { await onAdd(newText.trim(), newTyp); setNewText('') }
    finally { setAdding(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: 'var(--bg-page)', borderRadius: 12, width: 440, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Wochennotizen · {formatWoche(woche)}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={16} /></button>
        </div>

        {/* Bestehende Notizen */}
        {notizen.length > 0 && (
          <div style={{ overflowY: 'auto', padding: '12px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            {notizen.map(n => {
              const c = NOTIZ_FARBEN[n.typ] || '#007AFF'
              return (
                <div key={n.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8, padding: '8px 10px', borderRadius: 8, background: `${c}10`, border: `1px solid ${c}30` }}>
                  <div style={{ width: 4, height: 16, borderRadius: 2, background: c, marginTop: 2, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: c, textTransform: 'uppercase', marginBottom: 2 }}>
                      {n.typ === 'allgemein' ? 'Allgemein' : n.typ === 'zusatzkosten' ? 'Zusatzkosten' : 'Sperrer'}
                    </div>
                    <div style={{ fontSize: 12, lineHeight: 1.4, color: 'var(--text-primary)' }}>{n.text}</div>
                  </div>
                  <button
                    onClick={() => { setDeletingId(n.id); onDeleteNotiz(n.id).finally(() => setDeletingId(null)) }}
                    disabled={deletingId === n.id}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 16, lineHeight: 1, padding: '0 2px', flexShrink: 0, opacity: deletingId === n.id ? 0.4 : 1 }}>
                    ×
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* Neue Notiz */}
        <div style={{ padding: '16px 20px', flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
            {notizen.length > 0 ? '+ Weitere Notiz' : 'Notiz hinzufügen'}
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            {['allgemein', 'zusatzkosten', 'sperrer'].map(t => {
              const c = NOTIZ_FARBEN[t]
              return (
                <button key={t} onClick={() => setNewTyp(t)} style={{
                  padding: '4px 10px', borderRadius: 5, fontSize: 11, cursor: 'pointer',
                  border: newTyp === t ? `1.5px solid ${c}` : '1px solid var(--border)',
                  background: newTyp === t ? `${c}20` : 'none',
                  color: newTyp === t ? c : 'var(--text-secondary)',
                }}>
                  {t === 'allgemein' ? 'Allgemein' : t === 'zusatzkosten' ? 'Zusatzkosten' : 'Sperrer'}
                </button>
              )
            })}
          </div>
          <textarea value={newText} onChange={e => setNewText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAdd() }}
            rows={3} placeholder="Notiztext eingeben... (Strg+Enter zum Speichern)"
            style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 6, border: `1px solid ${NOTIZ_FARBEN[newTyp]}40`, background: 'var(--bg-subtle)', fontSize: 12, color: 'var(--text-primary)', resize: 'vertical' }} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
            <button onClick={onClose} style={{ padding: '6px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer', border: '1px solid var(--border)', background: 'none', color: 'var(--text-secondary)' }}>Schließen</button>
            <button onClick={handleAdd} disabled={adding || !newText.trim()}
              style={{ padding: '6px 16px', borderRadius: 6, fontSize: 12, cursor: 'pointer', border: 'none', background: '#000', color: '#fff', fontWeight: 600 }}>
              {adding ? '...' : '+ Hinzufügen'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── ZusatzpersonalModal ────────────────────────────────────────────────────────

function ZusatzpersonalModal({
  jk, woche, produktionDbId, onSave, onClose,
}: {
  jk: JobKategorie
  woche: Date
  produktionDbId: string
  onSave: () => Promise<void>
  onClose: () => void
}) {
  const [personId, setPersonId] = useState<number | undefined>()
  const [personName, setPersonName] = useState('')
  const [isPlatzhalter, setIsPlatzhalter] = useState(false)
  const [notiz, setNotiz] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!personName.trim()) return
    setSaving(true)
    try {
      await fetch('/api/autorenplan/zusatz', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_kategorie_id: jk.id,
          produktion_db_id: produktionDbId,
          woche_von: dateKey(mondayOf(woche)),
          vertragsdb_person_id: isPlatzhalter ? undefined : personId,
          platzhalter_name: isPlatzhalter ? personName : undefined,
          person_cache_name: personName,
          notiz: notiz || undefined,
        }),
      })
      await onSave()
      onClose()
    } finally { setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: 'var(--bg-page)', borderRadius: 12, width: 400, boxShadow: '0 8px 32px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Zusatzpersonal buchen</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: jk.farbe, marginRight: 4 }} />
              {jk.label} · {formatWoche(woche)}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={18} /></button>
        </div>
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Person */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Person</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, cursor: 'pointer', marginLeft: 'auto' }}>
                <input type="checkbox" checked={isPlatzhalter} onChange={e => { setIsPlatzhalter(e.target.checked); setPersonId(undefined) }} />
                Platzhalter
              </label>
            </div>
            {isPlatzhalter ? (
              <input
                value={personName}
                onChange={e => setPersonName(e.target.value)}
                placeholder="Platzhalter-Name..."
                style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-subtle)', fontSize: 13, color: 'var(--text-primary)' }}
              />
            ) : (
              <PersonPicker
                value={personId}
                displayName={personName}
                onSelect={p => { setPersonId(p.id); setPersonName(p.name) }}
                onTextChange={v => { if (!personId) setPersonName(v) }}
              />
            )}
          </div>
          {/* Notiz */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>Notiz</label>
            <textarea value={notiz} onChange={e => setNotiz(e.target.value)} rows={2} placeholder="Optionale Anmerkung..."
              style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-subtle)', fontSize: 12, color: 'var(--text-primary)', resize: 'none' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={onClose} style={{ padding: '7px 16px', borderRadius: 7, border: '1px solid var(--border)', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12 }}>Abbrechen</button>
            <button onClick={handleSave} disabled={saving || !personName.trim()} style={{ padding: '7px 20px', borderRadius: 7, border: 'none', background: '#000', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
              {saving ? '...' : 'Buchen'}
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
  const folgeLabel = t('episode')

  const [einsaetze, setEinsaetze] = useState<Einsatz[]>([])
  const [zusatz, setZusatz] = useState<Zusatz[]>([])
  const [notizen, setNotizen] = useState<WochenNotiz[]>([])
  const [blockInfo, setBlockInfo] = useState<BlockInfo | null>(null)
  const [windowStart, setWindowStart] = useState<Date>(() => addWeeks(mondayOf(new Date()), -4))
  const WEEKS_VISIBLE = 20
  const [modal, setModal] = useState<{ einsatz?: Einsatz; jk: JobKategorie; woche: Date } | null>(null)
  const [zusatzModal, setZusatzModal] = useState<{ jk: JobKategorie; woche: Date } | null>(null)
  const [noteModal, setNoteModal] = useState<Date | null>(null)
  const [showKostenstellen, setShowKostenstellen] = useState(false)
  const [zusatzMode, setZusatzMode] = useState<'inline' | 'separate'>('inline')

  // Z / Y Taste (QWERTZ / QWERTY) gedrückt halten → Zusatzpersonal-Modus
  const zPressedRef = useRef(false)
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.code === 'KeyZ' || e.code === 'KeyY') zPressedRef.current = true }
    const up   = (e: KeyboardEvent) => { if (e.code === 'KeyZ' || e.code === 'KeyY') zPressedRef.current = false }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [])

  const weeks = Array.from({ length: WEEKS_VISIBLE }, (_, i) => addWeeks(windowStart, i))
  const vonDate = dateKey(windowStart)
  const bisDate = dateKey(addWeeks(windowStart, WEEKS_VISIBLE))

  const CELL_W = 80
  const ROW_H = 36
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
    return Promise.all([
      fetch(`/api/autorenplan/einsaetze?produktion_db_id=${produktionDbId}&von=${vonDate}&bis=${bisDate}`, { credentials: 'include' })
        .then(r => r.json()).then(d => setEinsaetze(d.einsaetze || [])),
      fetch(`/api/autorenplan/wochen-notizen?produktion_db_id=${produktionDbId}&von=${vonDate}&bis=${bisDate}`, { credentials: 'include' })
        .then(r => r.json()).then(d => setNotizen(d.notizen || [])),
      fetch(`/api/autorenplan/zusatz?produktion_db_id=${produktionDbId}&von=${vonDate}&bis=${bisDate}`, { credentials: 'include' })
        .then(r => r.json()).then(d => setZusatz(d.zusatz || [])),
    ]).catch(() => {})
  }, [produktionDbId, vonDate, bisDate])

  useEffect(() => { loadData() }, [loadData])

  // Abgesagte Einträge für Zelle (Overlay-Badges)
  function getAbgesagtForCell(jk: JobKategorie, weekDate: Date): Einsatz[] {
    const wKey = dateKey(weekDate)
    return einsaetze.filter(e => {
      if (e.job_kategorie_id !== jk.id) return false
      if (e.status !== 'abgesagt') return false
      const start = new Date(e.woche_von)
      const end = addWeeks(start, Math.max(jk.dauer_wochen, 1))
      if (jk.dauer_wochen === 1) return (e.woche_von || '').slice(0, 10) === wKey
      return weekDate >= start && weekDate < end
    })
  }

  // Slots für Zelle berechnen (abgesagt ausgeschlossen)
  function getSlotsForCell(jk: JobKategorie, weekDate: Date): (Einsatz | null)[] {
    const wKey = dateKey(weekDate)
    const active = einsaetze.filter(e => {
      const key = e.job_kategorie_id ?? e.prozess_id
      if (key !== jk.id && key !== jk.id) return false
      if (e.job_kategorie_id !== jk.id) return false
      if (e.status === 'abgesagt') return false
      const start = new Date(e.woche_von)
      const end = addWeeks(start, jk.dauer_wochen)
      return weekDate >= start && weekDate < end
    })

    if (jk.dauer_wochen === 1) {
      return active
        .filter(e => (e.woche_von || '').slice(0, 10) === wKey)
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
    if (zPressedRef.current) {
      setZusatzModal({ jk, woche: week })
    } else {
      setModal({ einsatz, jk, woche: week })
    }
  }

  function getZusatzForCell(jk: JobKategorie, weekDate: Date): Zusatz[] {
    const wKey = dateKey(weekDate)
    return zusatz.filter(z => z.job_kategorie_id === jk.id && (z.woche_von || '').slice(0, 10) === wKey)
  }

  function maxZusatzForCategory(jk: JobKategorie): number {
    return Math.max(0, ...weeks.map(w => getZusatzForCell(jk, w).length))
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
    await loadData()
  }

  const handleDeleteEinsatz = async (id: string) => {
    await fetch(`/api/autorenplan/einsaetze/${id}`, { method: 'DELETE', credentials: 'include' })
    loadData()
  }

  const today = mondayOf(new Date())
  const showBlockHeader = !!(blockInfo?.bloecke.length && jobKategorien.some(j => j.erster_block_start))

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
        <Tooltip text={zusatzMode === 'inline' ? 'Zusatzpersonal inline (in Kategorie)' : 'Zusatzpersonal separat (unter Notizen)'}>
          <button onClick={() => setZusatzMode(v => v === 'inline' ? 'separate' : 'inline')}
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: zusatz.length > 0 ? '#007AFF' : 'var(--text-secondary)' }}>
            <Users size={11} />
            {zusatzMode === 'inline' ? '↕' : '↔'}
          </button>
        </Tooltip>
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
                position: 'sticky', left: 0, top: showBlockHeader ? 20 : 0, zIndex: 12,
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
                    height: 32, position: 'sticky', top: showBlockHeader ? 20 : 0, zIndex: 8,
                    background: isToday ? '#007AFF08' : 'var(--bg-page)',
                    borderLeft: '1px solid var(--border)', borderBottom: isToday ? '2px solid transparent' : '2px solid var(--border)',
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
              const globalMaxSlots = Math.max(1, ...weeks.map(w => maxSlotsForCell(jk, w)))
              const maxZusatz = zusatzMode === 'inline' ? maxZusatzForCategory(jk) : 0
              const totalRows = globalMaxSlots + maxZusatz
              return [
                ...Array.from({ length: globalMaxSlots }, (_, slotIdx) => (
                <tr key={`${jk.id}-${slotIdx}`}>
                  {slotIdx === 0 && (
                    <td rowSpan={totalRows} style={{
                      position: 'sticky', left: 0, zIndex: 5,
                      background: 'var(--bg-page)', borderRight: '1px solid var(--border)',
                      borderBottom: '2px solid var(--border)',
                      padding: '0 8px', height: ROW_H * totalRows || ROW_H,
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
                              {jk.kostenstelle ? `KST ${jk.kostenstelle}` : jk.gage_betrag ? `${jk.gage_betrag.toLocaleString('de-DE')} €` : '—'}
                            </div>
                          )}
                          {maxZusatz > 0 && (
                            <div style={{ fontSize: 8, color: 'var(--text-secondary)', marginTop: 2, fontStyle: 'italic' }}>+ Zusatzpersonal</div>
                          )}
                        </div>
                      </div>
                    </td>
                  )}
                  {weeks.map((week, wi) => {
                    const slots = getSlotsForCell(jk, week)
                    const maxSlots = maxSlotsForCell(jk, week)
                    const einsatz = slots[slotIdx] || null
                    const abgesagtList = slotIdx === 0 ? getAbgesagtForCell(jk, week) : []
                    const isToday = dateKey(week) === dateKey(today)
                    const isOverbooked = jk.slots_gleich_folgen && slots.filter(Boolean).length > maxSlots
                    const isLastSlot = slotIdx === globalMaxSlots - 1
                    const color = jk.farbe
                    const name = einsatz?.person_cache_name || einsatz?.platzhalter_name || ''
                    const isCellPlatzhalter = !!einsatz && !einsatz.vertragsdb_person_id && !!einsatz.platzhalter_name
                    const isHO = einsatz ? isHOWeek(jk, week, einsatz) : false
                    const blockNr = einsatz?.block_nummer
                    const folgeNr = einsatz?.folge_nummer
                    return (
                      <td key={wi}
                        onClick={() => handleCellClick(jk, week, einsatz || undefined)}
                        style={{
                          width: CELL_W, minWidth: CELL_W, height: ROW_H, padding: '2px 4px',
                          borderLeft: isCellPlatzhalter ? '1px dashed var(--border)' : '1px solid var(--border)',
                          borderBottom: isLastSlot ? '2px solid var(--border)' : '1px solid var(--border)',
                          background: isToday ? '#007AFF08' : einsatz ? `${color}15` : 'transparent',
                          cursor: 'pointer', verticalAlign: 'middle', position: 'relative',
                        }}
                        onMouseEnter={e => { if (!einsatz) e.currentTarget.style.background = 'var(--bg-subtle)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = isToday ? '#007AFF08' : einsatz ? `${color}15` : 'transparent' }}
                      >
                        {einsatz ? (
                          <Tooltip text={[
                            statusLabel(einsatz.status),
                            name,
                            isCellPlatzhalter ? 'Platzhalter (nicht in Firmendatenbank)' : '',
                            isHO ? 'HomeOffice' : 'Präsenz (Writers Room)',
                            blockNr ? `${blockLabel} ${blockNr}` : '',
                            folgeNr ? `${folgeLabel} ${folgeNr}` : '',
                            einsatz.notiz || '',
                          ].filter(Boolean).join('\n')}>
                            <div style={{ display: 'flex', alignItems: 'stretch', gap: 3, height: ROW_H - 4 }}>
                              <div style={{ width: 3, borderRadius: 2, background: statusColor(einsatz.status), flexShrink: 0 }} />
                              <div style={{ overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 1 }}>
                                <div style={{ fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-primary)', fontStyle: isCellPlatzhalter ? 'italic' : 'normal' }}>
                                  {name || '—'}
                                </div>
                                <div style={{ fontSize: 9, display: 'flex', gap: 3, alignItems: 'center' }}>
                                  {blockNr && <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>Bl {blockNr}</span>}
                                  {blockNr && <span style={{ color: 'var(--border)' }}>·</span>}
                                  <span style={{ color: statusColor(einsatz.status), fontWeight: 600 }}>{statusAbbr(einsatz.status)}</span>
                                </div>
                              </div>
                              {isOverbooked && slotIdx === 0 && !isCellPlatzhalter && (
                                <AlertCircle size={8} style={{ color: '#FF3B30', flexShrink: 0 }} />
                              )}
                            </div>
                          </Tooltip>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', opacity: 0.25 }}>
                            <Plus size={10} />
                          </div>
                        )}
                        {/* Abgesagt-Overlay-Badges */}
                        {abgesagtList.map((abs, ai) => (
                          <Tooltip key={abs.id} text={[
                            `Abgesagt: ${abs.person_cache_name || abs.platzhalter_name || '—'}`,
                            abs.abgesagt_am ? `${fmtDate(abs.abgesagt_am)}${abs.abgesagt_von ? ` · ${abs.abgesagt_von}` : ''}` : '',
                            abs.notiz || '',
                          ].filter(Boolean).join('\n')}>
                            <div
                              onClick={e => { e.stopPropagation(); handleCellClick(jk, week, abs) }}
                              style={{
                                position: 'absolute', top: 2 + ai * 14, right: 2,
                                width: 12, height: 12, borderRadius: '50%',
                                background: '#FF3B30', color: '#fff',
                                fontSize: 9, fontWeight: 700, lineHeight: '12px', textAlign: 'center',
                                cursor: 'pointer', zIndex: 2, userSelect: 'none',
                              }}
                            >!</div>
                          </Tooltip>
                        ))}
                      </td>
                    )
                  })}
                </tr>
              )),
                // Zusatzpersonal-Zeilen (inline-Modus)
                ...Array.from({ length: maxZusatz }, (_, zi) => (
                  <tr key={`${jk.id}-zusatz-${zi}`}>
                    {weeks.map((week, wi) => {
                      const zList = getZusatzForCell(jk, week)
                      const z = zList[zi] || null
                      const isToday = dateKey(week) === dateKey(today)
                      return (
                        <td key={wi}
                          onClick={() => setZusatzModal({ jk, woche: week })}
                          style={{
                            width: CELL_W, minWidth: CELL_W, height: ROW_H, padding: '2px 4px',
                            borderLeft: '1px dashed var(--border)',
                            borderBottom: zi === maxZusatz - 1 ? '2px solid var(--border)' : '1px solid var(--border)',
                            background: isToday ? '#007AFF08' : z ? `${jk.farbe}0A` : 'transparent',
                            cursor: 'pointer', verticalAlign: 'middle', position: 'relative',
                          }}
                          onMouseEnter={e => { if (!z) e.currentTarget.style.background = 'var(--bg-subtle)' }}
                          onMouseLeave={e => { e.currentTarget.style.background = isToday ? '#007AFF08' : z ? `${jk.farbe}0A` : 'transparent' }}
                        >
                          {z ? (
                            <Tooltip text={[
                              z.person_cache_name || z.platzhalter_name || '—',
                              !z.vertragsdb_person_id ? 'Platzhalter' : '',
                              z.notiz || '',
                            ].filter(Boolean).join('\n')}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 3, height: ROW_H - 4 }}>
                                <div style={{ width: 3, borderRadius: 2, background: `${jk.farbe}80`, flexShrink: 0, alignSelf: 'stretch' }} />
                                <div style={{ fontSize: 9, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)', fontStyle: !z.vertragsdb_person_id ? 'italic' : 'normal' }}>
                                  {z.person_cache_name || z.platzhalter_name || '—'}
                                </div>
                                <button
                                  onClick={async e => { e.stopPropagation(); await fetch(`/api/autorenplan/zusatz/${z.id}`, { method: 'DELETE', credentials: 'include' }); loadData() }}
                                  style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 11, lineHeight: 1, padding: '0 2px', flexShrink: 0 }}>×</button>
                              </div>
                            </Tooltip>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', opacity: 0.2 }}>
                              <Users size={9} />
                            </div>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )),
              ]
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
                const nots = notizen.filter(n => (n.woche_von || '').slice(0, 10) === dateKey(w))
                const typColor = NOTIZ_FARBEN[nots[0]?.typ] ?? NOTIZ_FARBEN.allgemein
                const isToday = dateKey(w) === dateKey(today)
                const baseBg = isToday ? '#007AFF08' : nots.length ? typColor + '15' : 'transparent'
                return (
                  <td key={wi} onClick={() => setNoteModal(w)}
                    style={{
                      height: ROW_H, borderLeft: '1px solid var(--border)', borderTop: '1px solid var(--border)',
                      cursor: 'pointer', padding: '2px 4px', verticalAlign: 'middle',
                      background: baseBg,
                    }}
                    onMouseEnter={e => { if (!nots.length) e.currentTarget.style.background = 'var(--bg-subtle)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = baseBg }}>
                    <div style={{ display: 'flex', alignItems: 'center', height: ROW_H - 6, padding: '0 2px' }}>
                      {nots.length > 0 ? (
                        <Tooltip text={nots.map(n => {
                            const dot = n.typ === 'allgemein' ? '🔵' : n.typ === 'zusatzkosten' ? '🟡' : '🔴'
                            return `${dot} ${n.text}`
                          }).join('\n\n')}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 3, width: '100%', overflow: 'hidden', height: '100%' }}>
                            <div style={{ width: 3, minHeight: 20, borderRadius: 2, background: typColor, flexShrink: 0, alignSelf: 'stretch' }} />
                            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 1 }}>
                              {nots.slice(0, 3).map((n) => {
                                const c = NOTIZ_FARBEN[n.typ] || '#007AFF'
                                return (
                                  <div key={n.id} style={{ display: 'flex', alignItems: 'center', gap: 3, overflow: 'hidden' }}>
                                    <div style={{ width: 4, height: 4, borderRadius: '50%', background: c, flexShrink: 0 }} />
                                    <div style={{ fontSize: 9, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3 }}>
                                      {n.text}
                                    </div>
                                  </div>
                                )
                              })}
                              {nots.length > 3 && (
                                <div style={{ fontSize: 9, color: typColor, fontWeight: 600, lineHeight: 1.3 }}>+{nots.length - 3}</div>
                              )}
                            </div>
                          </div>
                        </Tooltip>
                      ) : (
                        <Tooltip text="Wochennotiz hinzufügen">
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
                            <Plus size={9} style={{ opacity: 0.4, display: 'block' }} />
                          </div>
                        </Tooltip>
                      )}
                    </div>
                  </td>
                )
              })}
            </tr>

            {/* Zusatzpersonal — separate Sektion (unter Notizen) */}
            {zusatzMode === 'separate' && jobKategorien.map(jk => {
              const maxZ = maxZusatzForCategory(jk)
              if (maxZ === 0) return null
              return Array.from({ length: maxZ }, (_, zi) => (
                <tr key={`${jk.id}-sep-${zi}`}>
                  {zi === 0 && (
                    <td rowSpan={maxZ} style={{
                      position: 'sticky', left: 0, zIndex: 5,
                      background: 'var(--bg-page)', borderRight: '1px solid var(--border)',
                      borderTop: '1px solid var(--border)', borderBottom: '2px solid var(--border)',
                      padding: '0 8px', verticalAlign: 'middle',
                    }}>
                      <div style={{ fontSize: 9, color: 'var(--text-secondary)', fontStyle: 'italic', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 120 }}>
                        <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: jk.farbe, marginRight: 4 }} />
                        {jk.label}
                      </div>
                    </td>
                  )}
                  {weeks.map((week, wi) => {
                    const zList = getZusatzForCell(jk, week)
                    const z = zList[zi] || null
                    const isToday = dateKey(week) === dateKey(today)
                    return (
                      <td key={wi}
                        onClick={() => setZusatzModal({ jk, woche: week })}
                        style={{
                          width: CELL_W, minWidth: CELL_W, height: ROW_H, padding: '2px 4px',
                          borderLeft: '1px dashed var(--border)',
                          borderTop: zi === 0 ? '1px solid var(--border)' : undefined,
                          borderBottom: zi === maxZ - 1 ? '2px solid var(--border)' : '1px solid var(--border)',
                          background: isToday ? '#007AFF08' : z ? `${jk.farbe}0A` : 'transparent',
                          cursor: 'pointer', verticalAlign: 'middle',
                        }}>
                        {z ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 3, height: ROW_H - 4 }}>
                            <div style={{ width: 3, borderRadius: 2, background: `${jk.farbe}80`, flexShrink: 0, alignSelf: 'stretch' }} />
                            <div style={{ fontSize: 9, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)', fontStyle: !z.vertragsdb_person_id ? 'italic' : 'normal', flex: 1 }}>
                              {z.person_cache_name || z.platzhalter_name || '—'}
                            </div>
                            <button
                              onClick={async e => { e.stopPropagation(); await fetch(`/api/autorenplan/zusatz/${z.id}`, { method: 'DELETE', credentials: 'include' }); loadData() }}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 11, lineHeight: 1, padding: '0 2px', flexShrink: 0 }}>×</button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', opacity: 0.2 }}>
                            <Users size={9} />
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))
            })}
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
          einsaetze={einsaetze}
          onSave={handleSaveEinsatz}
          onDelete={modal.einsatz ? () => handleDeleteEinsatz(modal.einsatz!.id) : undefined}
          onClose={() => setModal(null)}
        />
      )}
      {noteModal && (
        <WochenNotizModal
          woche={noteModal}
          notizen={notizen.filter(n => (n.woche_von || '').slice(0, 10) === dateKey(noteModal))}
          onAdd={async (text, typ) => {
            await fetch('/api/autorenplan/wochen-notizen', {
              method: 'POST', credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ produktion_db_id: produktionDbId, woche_von: dateKey(noteModal), text, typ }),
            })
            await loadData()
          }}
          onDeleteNotiz={async (id) => {
            await fetch(`/api/autorenplan/wochen-notizen/${id}`, { method: 'DELETE', credentials: 'include' })
            await loadData()
          }}
          onClose={() => setNoteModal(null)}
        />
      )}
      {zusatzModal && (
        <ZusatzpersonalModal
          jk={zusatzModal.jk}
          woche={zusatzModal.woche}
          produktionDbId={produktionDbId}
          onSave={async () => { await loadData() }}
          onClose={() => setZusatzModal(null)}
        />
      )}
    </div>
  )

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
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [canSettings, setCanSettings] = useState(false)

  useEffect(() => {
    // Prüfen ob dieser User Zugriff auf Autorenplan-Einstellungen hat
    Promise.all([
      fetch('/api/admin/app-settings', { credentials: 'include' }).then(r => r.json()),
      fetch('/api/me/whoami', { credentials: 'include' }).then(r => r.json()),
    ]).then(([settings, me]) => {
      let allowed: string[] = []
      try { allowed = JSON.parse(settings.autorenplan_settings_rollen || '[]') } catch { allowed = [] }
      const userRoles: string[] = me.roles || (me.role ? [me.role] : [])
      setCanSettings(userRoles.some((r: string) => allowed.includes(r)))
    }).catch(() => {})
  }, [])

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
      <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border)', background: 'var(--bg-page)', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 2, flex: 1 }}>
          {[
            { id: 'plan', label: 'Plan', icon: '📅' },
            { id: 'futures', label: 'Futures', icon: '📋' },
            { id: 'jobedit', label: 'Job-Kategorien', icon: <Settings size={12} /> },
          ].map(tab => (
            <button key={tab.id} onClick={() => { setView(tab.id as any); if (tab.id === 'plan') loadJobKategorien() }} style={{
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
        {canSettings && (
          <Tooltip text="Autorenplan-Einstellungen">
            <button onClick={() => setSettingsOpen(true)} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '6px 10px', marginRight: 8,
              border: '1px solid var(--border)', borderRadius: 6,
              background: 'none', cursor: 'pointer',
              color: 'var(--text-secondary)',
            }}>
              <Settings size={14} />
            </button>
          </Tooltip>
        )}
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

      {settingsOpen && (
        <AutorenplanSettingsModal
          produktionDbId={produktionDbId}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  )
}
