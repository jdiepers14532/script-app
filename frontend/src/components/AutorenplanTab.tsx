import { useState, useEffect, useCallback, useRef } from 'react'
import { X, Plus, ChevronLeft, ChevronRight, Settings, Calendar, Users, Edit2, Trash2, Search, AlertCircle } from 'lucide-react'
import Tooltip from './Tooltip'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProzessConfig {
  id: string
  label: string
  kostenstelle?: string
  dauer_wochen: number
  max_slots: number
  praesenz_wochen: number[]
  vertragsdb_taetigkeit_ids: number[]
  werkstufen_typ: string
  farbe: string
  sortierung: number
}

interface BuchprozessConfig {
  wochen_typ: string
  prozesse: ProzessConfig[]
}

interface Einsatz {
  id: string
  produktion_db_id: string
  prozess_id: string
  woche_von: string
  vertragsdb_person_id?: number
  platzhalter_name?: string
  person_cache_name?: string
  vertragsdb_taetigkeit_id?: number
  vertragsdb_vertrag_id?: number
  block_nummer?: number
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

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_LIST = [
  { id: 'geplant',             label: 'Geplant',              farbe: '#9E9E9E' },
  { id: 'angefragt',           label: 'Angefragt',            farbe: '#007AFF' },
  { id: 'zugesagt',            label: 'Zugesagt',             farbe: '#FF9500' },
  { id: 'vertrag_geschrieben', label: 'Vertrag geschrieben',  farbe: '#AF52DE' },
  { id: 'vertrag_zurueck',     label: 'Vertrag zurück',       farbe: '#00C853' },
  { id: 'rechnung_erhalten',   label: 'Rechnung erhalten',    farbe: '#34C759' },
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
  const diff = (day === 0 ? -6 : 1 - day)
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

// ── PersonPicker ──────────────────────────────────────────────────────────────

function PersonPicker({
  value, displayName, onSelect, onNew, produktionDbId,
}: {
  value?: number
  displayName?: string
  onSelect: (p: Person) => void
  onNew: (name: string) => void
  produktionDbId: string
}) {
  const [q, setQ] = useState(displayName || '')
  const [results, setResults] = useState<Person[]>([])
  const [loading, setLoading] = useState(false)
  const [newMode, setNewMode] = useState(false)
  const debounceRef = useRef<any>(null)

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
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1 }}>
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
      </div>
      {results.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
          background: 'var(--bg-page)', border: '1px solid var(--border)', borderRadius: 6,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)', maxHeight: 200, overflowY: 'auto',
        }}>
          {results.map(p => (
            <div
              key={p.id}
              onClick={() => { onSelect(p); setQ(p.name); setResults([]) }}
              style={{
                padding: '8px 12px', cursor: 'pointer', fontSize: 12,
                borderBottom: '1px solid var(--border)',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-subtle)')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}
            >
              <div style={{ fontWeight: 500 }}>{p.name}</div>
              {p.email && <div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{p.email}</div>}
            </div>
          ))}
          {q.trim().length >= 2 && (
            <div
              onClick={() => { onNew(q); setResults([]) }}
              style={{
                padding: '8px 12px', cursor: 'pointer', fontSize: 12, color: '#007AFF',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-subtle)')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}
            >
              <Plus size={12} /> „{q}" neu in Vertragsdb anlegen
            </div>
          )}
        </div>
      )}
      {loading && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>Suche...</div>}
    </div>
  )
}

// ── EinsatzModal ──────────────────────────────────────────────────────────────

function EinsatzModal({
  einsatz, prozessConfig, wocheDatum, produktionDbId,
  onSave, onDelete, onClose,
}: {
  einsatz?: Einsatz
  prozessConfig: ProzessConfig
  wocheDatum: Date
  produktionDbId: string
  onSave: (data: Partial<Einsatz>) => Promise<void>
  onDelete?: () => Promise<void>
  onClose: () => void
}) {
  const isNew = !einsatz
  const [personId, setPersonId] = useState<number | undefined>(einsatz?.vertragsdb_person_id)
  const [personName, setPersonName] = useState(einsatz?.person_cache_name || einsatz?.platzhalter_name || '')
  const [isPlatzhalter, setIsPlatzhalter] = useState(!einsatz?.vertragsdb_person_id && !!einsatz?.platzhalter_name)
  const [status, setStatus] = useState(einsatz?.status || 'geplant')
  const [blockNr, setBlockNr] = useState(einsatz?.block_nummer ? String(einsatz.block_nummer) : '')
  const [notiz, setNotiz] = useState(einsatz?.notiz || '')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handlePersonSelect = (p: Person) => {
    setPersonId(p.id)
    setPersonName(p.name)
    setIsPlatzhalter(false)
  }

  const handleNewPerson = async (name: string) => {
    const res = await fetch('/api/autorenplan/personen-anlegen', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    const d = await res.json()
    if (d.personen_id) {
      setPersonId(d.personen_id)
      setPersonName(name)
      setIsPlatzhalter(false)
    }
  }

  const handlePlatzhalter = () => {
    setPersonId(undefined)
    setIsPlatzhalter(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave({
        prozess_id: prozessConfig.id,
        woche_von: dateKey(wocheDatum),
        produktion_db_id: produktionDbId,
        vertragsdb_person_id: personId,
        person_cache_name: personId ? personName : undefined,
        platzhalter_name: !personId && personName ? personName : undefined,
        block_nummer: blockNr ? parseInt(blockNr) : undefined,
        status,
        notiz: notiz || undefined,
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!onDelete) return
    setDeleting(true)
    try { await onDelete(); onClose() }
    finally { setDeleting(false) }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        background: 'var(--bg-page)', borderRadius: 12, width: 480, maxWidth: '95vw',
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)', padding: 24,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>
              {isNew ? 'Einsatz planen' : 'Einsatz bearbeiten'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
              <span style={{
                display: 'inline-block', width: 10, height: 10, borderRadius: 2,
                background: prozessConfig.farbe, marginRight: 6,
              }} />
              {prozessConfig.label} · {formatWoche(wocheDatum)}
              {prozessConfig.dauer_wochen > 1 && ` bis ${formatWoche(addWeeks(wocheDatum, prozessConfig.dauer_wochen - 1))}`}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 4 }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Person */}
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
              Autor/in
            </label>
            <PersonPicker
              value={personId}
              displayName={personName}
              onSelect={handlePersonSelect}
              onNew={handleNewPerson}
              produktionDbId={produktionDbId}
            />
            <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                onClick={handlePlatzhalter}
                style={{
                  fontSize: 11, padding: '3px 8px', borderRadius: 4,
                  border: '1px solid var(--border)', background: 'none', cursor: 'pointer',
                  color: 'var(--text-secondary)',
                }}
              >
                Als Platzhalter speichern
              </button>
              {isPlatzhalter && (
                <input
                  value={personName}
                  onChange={e => setPersonName(e.target.value)}
                  placeholder="Platzhalter-Name (optional)"
                  style={{
                    flex: 1, padding: '3px 8px', borderRadius: 4,
                    border: '1px solid var(--border)', background: 'var(--bg-subtle)',
                    fontSize: 11, color: 'var(--text-primary)',
                  }}
                />
              )}
            </div>
          </div>

          {/* Status */}
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
              Status
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {STATUS_LIST.map(s => (
                <button
                  key={s.id}
                  onClick={() => setStatus(s.id)}
                  style={{
                    padding: '5px 10px', borderRadius: 5, fontSize: 11, cursor: 'pointer',
                    border: status === s.id ? `2px solid ${s.farbe}` : '1px solid var(--border)',
                    background: status === s.id ? `${s.farbe}20` : 'none',
                    color: status === s.id ? s.farbe : 'var(--text-secondary)',
                    fontWeight: status === s.id ? 600 : 400,
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Block-Nummer */}
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
              Block-Nummer <span style={{ fontWeight: 400 }}>(informativ)</span>
            </label>
            <input
              type="number"
              value={blockNr}
              onChange={e => setBlockNr(e.target.value)}
              placeholder="z.B. 885"
              style={{
                width: 120, padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border)',
                background: 'var(--bg-subtle)', fontSize: 12, color: 'var(--text-primary)',
              }}
            />
          </div>

          {/* Notiz */}
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
              Notiz
            </label>
            <textarea
              value={notiz}
              onChange={e => setNotiz(e.target.value)}
              rows={2}
              placeholder="Optionale Anmerkung..."
              style={{
                width: '100%', boxSizing: 'border-box', padding: '7px 10px', borderRadius: 6,
                border: '1px solid var(--border)', background: 'var(--bg-subtle)',
                fontSize: 12, color: 'var(--text-primary)', resize: 'vertical',
              }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
          <div>
            {!isNew && onDelete && (
              <button
                onClick={handleDelete} disabled={deleting}
                style={{
                  padding: '8px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                  border: '1px solid #FF3B30', background: 'none', color: '#FF3B30',
                }}
              >
                {deleting ? 'Löschen...' : 'Einsatz löschen'}
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 6, fontSize: 12, cursor: 'pointer', border: '1px solid var(--border)', background: 'none', color: 'var(--text-secondary)' }}>
              Abbrechen
            </button>
            <button
              onClick={handleSave} disabled={saving}
              style={{ padding: '8px 18px', borderRadius: 6, fontSize: 12, cursor: 'pointer', border: 'none', background: '#000', color: '#fff', fontWeight: 600 }}
            >
              {saving ? 'Speichern...' : 'Speichern'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── BuchprozessKonfigTab ──────────────────────────────────────────────────────

function BuchprozessKonfigTab({
  config, onSave,
}: {
  config: BuchprozessConfig
  onSave: (c: BuchprozessConfig) => Promise<void>
}) {
  const [local, setLocal] = useState<BuchprozessConfig>(JSON.parse(JSON.stringify(config)))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const updateProzess = (idx: number, key: keyof ProzessConfig, val: any) => {
    const p = [...local.prozesse]
    p[idx] = { ...p[idx], [key]: val }
    setLocal({ ...local, prozesse: p })
  }

  const addProzess = () => {
    const newP: ProzessConfig = {
      id: `prozess_${Date.now()}`, label: 'Neuer Prozess', kostenstelle: '',
      dauer_wochen: 1, max_slots: 5, praesenz_wochen: [], vertragsdb_taetigkeit_ids: [],
      werkstufen_typ: 'storyline', farbe: '#9E9E9E', sortierung: local.prozesse.length + 1,
    }
    setLocal({ ...local, prozesse: [...local.prozesse, newP] })
  }

  const removeProzess = (idx: number) => {
    const p = [...local.prozesse]
    p.splice(idx, 1)
    setLocal({ ...local, prozesse: p })
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(local)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    padding: '5px 8px', borderRadius: 5, border: '1px solid var(--border)',
    background: 'var(--bg-subtle)', fontSize: 12, color: 'var(--text-primary)',
  }

  return (
    <div style={{ padding: '20px 24px', maxWidth: 900 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Buchprozess-Konfiguration</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
            Definiert die Prozesstypen, deren Dauer, Slot-Anzahl und Präsenz-/HomeOffice-Regeln pro Woche.
          </div>
        </div>
        <button
          onClick={handleSave} disabled={saving}
          style={{
            padding: '8px 18px', borderRadius: 7, fontSize: 13, cursor: 'pointer',
            border: 'none', background: saved ? '#00C853' : '#000', color: '#fff', fontWeight: 600,
          }}
        >
          {saving ? 'Speichern...' : saved ? 'Gespeichert ✓' : 'Speichern'}
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {local.prozesse.map((p, i) => (
          <div key={i} style={{
            border: '1px solid var(--border)', borderRadius: 10, padding: 16,
            borderLeft: `4px solid ${p.farbe}`,
          }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              {/* Label */}
              <div style={{ flex: '1 1 140px' }}>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Bezeichnung</div>
                <input value={p.label} onChange={e => updateProzess(i, 'label', e.target.value)} style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} />
              </div>
              {/* ID */}
              <div style={{ flex: '1 1 110px' }}>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>ID (intern)</div>
                <input value={p.id} onChange={e => updateProzess(i, 'id', e.target.value)} style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', fontFamily: 'monospace' }} />
              </div>
              {/* Kostenstelle */}
              <div style={{ flex: '0 0 90px' }}>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Kostenstelle</div>
                <input value={p.kostenstelle || ''} onChange={e => updateProzess(i, 'kostenstelle', e.target.value)} style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} />
              </div>
              {/* Dauer */}
              <div style={{ flex: '0 0 70px' }}>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Dauer (W)</div>
                <input type="number" min={1} max={12} value={p.dauer_wochen} onChange={e => updateProzess(i, 'dauer_wochen', parseInt(e.target.value) || 1)} style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} />
              </div>
              {/* Slots */}
              <div style={{ flex: '0 0 70px' }}>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Max Slots</div>
                <input type="number" min={1} max={20} value={p.max_slots} onChange={e => updateProzess(i, 'max_slots', parseInt(e.target.value) || 1)} style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} />
              </div>
              {/* Farbe */}
              <div style={{ flex: '0 0 60px' }}>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Farbe</div>
                <input type="color" value={p.farbe} onChange={e => updateProzess(i, 'farbe', e.target.value)} style={{ width: 40, height: 30, borderRadius: 4, border: '1px solid var(--border)', cursor: 'pointer', padding: 2 }} />
              </div>
              {/* Löschen */}
              <div style={{ paddingTop: 20 }}>
                <button onClick={() => removeProzess(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#FF3B30', padding: 4 }}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            {/* Präsenz-Wochen */}
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>
                Präsenz-Wochen (Wochennummern innerhalb des Einsatzes — 1 = erste Woche)
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {Array.from({ length: p.dauer_wochen }, (_, wi) => wi + 1).map(week => {
                  const active = p.praesenz_wochen.includes(week)
                  return (
                    <button
                      key={week}
                      onClick={() => {
                        const next = active
                          ? p.praesenz_wochen.filter(w => w !== week)
                          : [...p.praesenz_wochen, week].sort((a, b) => a - b)
                        updateProzess(i, 'praesenz_wochen', next)
                      }}
                      style={{
                        padding: '3px 10px', borderRadius: 5, fontSize: 11, cursor: 'pointer',
                        border: active ? '1.5px solid #007AFF' : '1px solid var(--border)',
                        background: active ? '#007AFF20' : 'none',
                        color: active ? '#007AFF' : 'var(--text-secondary)',
                        fontWeight: active ? 600 : 400,
                      }}
                    >
                      {week === 1 ? `W${week} (Präsenz)` : `W${week}`}
                    </button>
                  )
                })}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                Nicht markierte Wochen = HomeOffice (Standard für alle Autoren/Editoren)
              </div>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={addProzess}
        style={{
          marginTop: 16, padding: '8px 16px', borderRadius: 7, fontSize: 12, cursor: 'pointer',
          border: '1.5px dashed var(--border)', background: 'none', color: 'var(--text-secondary)',
          display: 'flex', alignItems: 'center', gap: 6,
        }}
      >
        <Plus size={14} /> Prozesstyp hinzufügen
      </button>
    </div>
  )
}

// ── AutorenplanGrid ───────────────────────────────────────────────────────────

function AutorenplanGrid({
  config, produktionDbId,
}: {
  config: BuchprozessConfig
  produktionDbId: string
}) {
  const [einsaetze, setEinsaetze] = useState<Einsatz[]>([])
  const [notizen, setNotizen] = useState<WochenNotiz[]>([])
  const [windowStart, setWindowStart] = useState<Date>(() => {
    const m = mondayOf(new Date())
    return addWeeks(m, -4)
  })
  const WEEKS_VISIBLE = 20
  const [modal, setModal] = useState<{ einsatz?: Einsatz; prozess: ProzessConfig; woche: Date } | null>(null)
  const [noteModal, setNoteModal] = useState<{ woche: Date; notiz?: WochenNotiz } | null>(null)
  const [showKostenstellen, setShowKostenstellen] = useState(false)

  const weeks = Array.from({ length: WEEKS_VISIBLE }, (_, i) => addWeeks(windowStart, i))

  const vonDate = dateKey(windowStart)
  const bisDate = dateKey(addWeeks(windowStart, WEEKS_VISIBLE))

  const loadData = useCallback(() => {
    Promise.all([
      fetch(`/api/autorenplan/einsaetze?produktion_db_id=${produktionDbId}&von=${vonDate}&bis=${bisDate}`, { credentials: 'include' })
        .then(r => r.json()).then(d => setEinsaetze(d.einsaetze || [])),
      fetch(`/api/autorenplan/wochen-notizen?produktion_db_id=${produktionDbId}&von=${vonDate}&bis=${bisDate}`, { credentials: 'include' })
        .then(r => r.json()).then(d => setNotizen(d.notizen || [])),
    ]).catch(() => {})
  }, [produktionDbId, vonDate, bisDate])

  useEffect(() => { loadData() }, [loadData])

  // For a given prozess + week, collect all einsaetze that are "active" in that week
  function getEinsaetzeForCell(prozessId: string, weekDate: Date, dauer: number): (Einsatz | null)[] {
    const slots: (Einsatz | null)[] = []
    const wKey = dateKey(weekDate)
    const active = einsaetze.filter(e => {
      if (e.prozess_id !== prozessId) return false
      const start = new Date(e.woche_von)
      const end = addWeeks(start, dauer)
      return weekDate >= start && weekDate < end
    })

    if (dauer === 1) {
      // Slot = position in sorted list for this exact week
      const thisWeek = active.filter(e => e.woche_von === wKey)
      return thisWeek.sort((a, b) => a.erstellt_am > b.erstellt_am ? 1 : -1)
    } else {
      // Multi-week: each einsatz occupies slot = weekOffset+1
      const slotMap: (Einsatz | null)[] = Array(dauer).fill(null)
      for (const e of active) {
        const offset = weeksBetween(new Date(e.woche_von), weekDate)
        if (offset >= 0 && offset < dauer) slotMap[offset] = e
      }
      return slotMap
    }
  }

  function isHO(prozess: ProzessConfig, weekDate: Date, einsatz: Einsatz): boolean {
    if (einsatz.ist_homeoffice_override !== null && einsatz.ist_homeoffice_override !== undefined) {
      return einsatz.ist_homeoffice_override
    }
    if (prozess.dauer_wochen <= 1) {
      return !prozess.praesenz_wochen.includes(1)
    }
    const offset = weeksBetween(new Date(einsatz.woche_von), weekDate) + 1
    return !prozess.praesenz_wochen.includes(offset)
  }

  const handleCellClick = (prozess: ProzessConfig, week: Date, einsatz?: Einsatz) => {
    setModal({ einsatz, prozess, woche: week })
  }

  const handleSave = async (data: Partial<Einsatz>) => {
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
        body: JSON.stringify(data),
      })
    }
    loadData()
  }

  const handleDelete = async () => {
    if (!modal?.einsatz) return
    await fetch(`/api/autorenplan/einsaetze/${modal.einsatz.id}`, { method: 'DELETE', credentials: 'include' })
    loadData()
  }

  const CELL_W = 80
  const LABEL_W = 140
  const ROW_H = 36

  const sortedProzesse = [...config.prozesse].sort((a, b) => a.sortierung - b.sortierung)

  const today = mondayOf(new Date())

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
        borderBottom: '1px solid var(--border)', flexShrink: 0,
      }}>
        <button onClick={() => setWindowStart(s => addWeeks(s, -4))} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 5, cursor: 'pointer', padding: '4px 8px', color: 'var(--text-secondary)' }}>
          <ChevronLeft size={14} />
        </button>
        <button
          onClick={() => setWindowStart(addWeeks(mondayOf(new Date()), -4))}
          style={{ padding: '4px 10px', borderRadius: 5, fontSize: 11, cursor: 'pointer', border: '1px solid var(--border)', background: 'none', color: 'var(--text-secondary)' }}
        >
          Heute
        </button>
        <button onClick={() => setWindowStart(s => addWeeks(s, 4))} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 5, cursor: 'pointer', padding: '4px 8px', color: 'var(--text-secondary)' }}>
          <ChevronRight size={14} />
        </button>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 8 }}>
          {formatWoche(windowStart)} – {formatWoche(addWeeks(windowStart, WEEKS_VISIBLE - 1))}
        </div>
        <div style={{ flex: 1 }} />
        {/* Status Legende */}
        <div style={{ display: 'flex', gap: 8 }}>
          {STATUS_LIST.map(s => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-secondary)' }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: s.farbe }} />
              {s.label}
            </div>
          ))}
        </div>
        <button
          onClick={() => setShowKostenstellen(v => !v)}
          style={{
            padding: '4px 8px', borderRadius: 5, fontSize: 11, cursor: 'pointer',
            border: '1px solid var(--border)', background: showKostenstellen ? 'var(--bg-subtle)' : 'none',
            color: 'var(--text-secondary)',
          }}
        >
          Kostenstellen
        </button>
      </div>

      {/* Grid */}
      <div style={{ overflowX: 'auto', overflowY: 'auto', flex: 1 }}>
        <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: LABEL_W + WEEKS_VISIBLE * CELL_W }}>
          {/* Week headers */}
          <thead>
            <tr>
              <th style={{ width: LABEL_W, minWidth: LABEL_W, padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, background: 'var(--bg-page)', position: 'sticky', left: 0, zIndex: 10, borderBottom: '2px solid var(--border)', borderRight: '1px solid var(--border)' }}>
                Prozess / Slot
              </th>
              {weeks.map((w, wi) => {
                const isToday = dateKey(w) === dateKey(today)
                const notizForWeek = notizen.filter(n => n.woche_von === dateKey(w))
                return (
                  <th key={wi} style={{
                    width: CELL_W, minWidth: CELL_W, padding: '6px 4px', textAlign: 'center',
                    fontSize: 10, fontWeight: isToday ? 700 : 500,
                    background: isToday ? '#007AFF10' : 'var(--bg-page)',
                    borderBottom: '2px solid var(--border)',
                    borderLeft: '1px solid var(--border)',
                    color: isToday ? '#007AFF' : 'var(--text-secondary)',
                    position: 'relative',
                  }}>
                    <div>{formatWoche(w)}</div>
                    <div style={{ fontSize: 9, marginTop: 1 }}>{w.getFullYear()}</div>
                    {notizForWeek.length > 0 && (
                      <Tooltip text={notizForWeek.map(n => n.text).join('\n---\n')}>
                        <div style={{
                          position: 'absolute', top: 3, right: 3, width: 6, height: 6,
                          borderRadius: '50%', background: '#FF9500',
                        }} />
                      </Tooltip>
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>

          {/* Prozess rows */}
          <tbody>
            {sortedProzesse.map(prozess => {
              const maxSlots = prozess.max_slots

              return Array.from({ length: maxSlots }, (_, slotIdx) => (
                <tr key={`${prozess.id}-${slotIdx}`}>
                  {/* Row label */}
                  <td style={{
                    width: LABEL_W, minWidth: LABEL_W, height: ROW_H, padding: '0 12px',
                    background: 'var(--bg-page)', position: 'sticky', left: 0, zIndex: 5,
                    borderRight: '1px solid var(--border)',
                    borderBottom: slotIdx === maxSlots - 1 ? '2px solid var(--border)' : '1px solid var(--border)',
                    verticalAlign: 'middle',
                  }}>
                    {slotIdx === 0 ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 8, height: 8, borderRadius: 2, background: prozess.farbe, flexShrink: 0 }} />
                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>{prozess.label}</div>
                        {showKostenstellen && prozess.kostenstelle && (
                          <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>({prozess.kostenstelle})</div>
                        )}
                      </div>
                    ) : (
                      <div style={{ fontSize: 10, color: 'var(--text-secondary)', paddingLeft: 14 }}>
                        {prozess.dauer_wochen > 1 ? `↳ Woche ${slotIdx + 1}${prozess.praesenz_wochen.includes(slotIdx + 1) ? '' : ' HO'}` : `Slot ${slotIdx + 1}`}
                      </div>
                    )}
                  </td>

                  {/* Week cells */}
                  {weeks.map((week, wi) => {
                    const allSlots = getEinsaetzeForCell(prozess.id, week, prozess.dauer_wochen)
                    const einsatz = allSlots[slotIdx] ?? undefined
                    const isToday = dateKey(week) === dateKey(today)

                    const name = einsatz?.person_cache_name || einsatz?.platzhalter_name || ''
                    const isHOWeek = einsatz ? isHO(prozess, week, einsatz) : false
                    const color = einsatz ? statusColor(einsatz.status) : undefined

                    return (
                      <td
                        key={wi}
                        onClick={() => handleCellClick(prozess, week, einsatz)}
                        style={{
                          width: CELL_W, minWidth: CELL_W, height: ROW_H, padding: '2px 4px',
                          borderLeft: '1px solid var(--border)',
                          borderBottom: slotIdx === maxSlots - 1 ? '2px solid var(--border)' : '1px solid var(--border)',
                          background: isToday ? '#007AFF08' : einsatz ? `${color}15` : 'transparent',
                          cursor: 'pointer',
                          verticalAlign: 'middle',
                          position: 'relative',
                        }}
                        onMouseEnter={e => {
                          if (!einsatz) e.currentTarget.style.background = 'var(--bg-subtle)'
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.background = isToday ? '#007AFF08' : einsatz ? `${color}15` : 'transparent'
                        }}
                      >
                        {einsatz ? (
                          <Tooltip text={[
                            `${prozess.label} · ${statusLabel(einsatz.status)}`,
                            name,
                            isHOWeek ? 'HomeOffice' : 'Präsenz (Writers Room)',
                            einsatz.block_nummer ? `Block ${einsatz.block_nummer}` : '',
                            einsatz.notiz || '',
                          ].filter(Boolean).join('\n')}>
                            <div style={{
                              display: 'flex', alignItems: 'center', gap: 3, height: '100%',
                            }}>
                              <div style={{
                                width: 3, height: 26, borderRadius: 2,
                                background: color, flexShrink: 0,
                              }} />
                              <div style={{ overflow: 'hidden', flex: 1 }}>
                                <div style={{
                                  fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap',
                                  overflow: 'hidden', textOverflow: 'ellipsis',
                                  color: 'var(--text-primary)',
                                }}>
                                  {name || '—'}
                                </div>
                                <div style={{ fontSize: 9, color: 'var(--text-secondary)' }}>
                                  {isHOWeek ? 'HO' : 'Präsenz'}
                                  {einsatz.block_nummer ? ` · B${einsatz.block_nummer}` : ''}
                                </div>
                              </div>
                            </div>
                          </Tooltip>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', opacity: 0.3 }}>
                            <Plus size={10} />
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))
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
                return (
                  <td
                    key={wi}
                    onClick={() => setNoteModal({ woche: w, notiz: nots[0] })}
                    style={{
                      height: ROW_H, borderLeft: '1px solid var(--border)',
                      borderTop: '1px solid var(--border)',
                      cursor: 'pointer', padding: '2px 4px', verticalAlign: 'middle',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-subtle)')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}
                  >
                    {nots.length > 0 ? (
                      <div style={{ fontSize: 9, color: '#FF9500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {nots.map(n => n.text).join(' | ')}
                      </div>
                    ) : (
                      <div style={{ opacity: 0.2, display: 'flex', justifyContent: 'center' }}><Plus size={9} /></div>
                    )}
                  </td>
                )
              })}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Einsatz-Modal */}
      {modal && (
        <EinsatzModal
          einsatz={modal.einsatz}
          prozessConfig={modal.prozess}
          wocheDatum={modal.woche}
          produktionDbId={produktionDbId}
          onSave={handleSave}
          onDelete={modal.einsatz ? handleDelete : undefined}
          onClose={() => setModal(null)}
        />
      )}

      {/* Wochennotiz-Modal */}
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
}

// ── WochenNotizModal ───────────────────────────────────────────────────────────

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
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
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

// ── FuturesPanel ──────────────────────────────────────────────────────────────

function FuturesPanel({ produktionDbId }: { produktionDbId: string }) {
  const [futures, setFutures] = useState<Future[]>([])
  const [newModal, setNewModal] = useState(false)
  const [editFuture, setEditFuture] = useState<Future | null>(null)

  const load = () => {
    fetch(`/api/autorenplan/futures?produktion_db_id=${produktionDbId}`, { credentials: 'include' })
      .then(r => r.json()).then(d => setFutures(d.futures || []))
      .catch(() => {})
  }

  useEffect(() => { load() }, [produktionDbId])

  return (
    <div style={{ padding: '20px 24px', maxWidth: 800 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Futures</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
            Getrennt vom Hauptplan — jeder Future hat eigene Zeiträume und Autoren-Zuweisung.
          </div>
        </div>
        <button
          onClick={() => setNewModal(true)}
          style={{ padding: '7px 14px', borderRadius: 7, fontSize: 12, cursor: 'pointer', border: 'none', background: '#000', color: '#fff', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <Plus size={13} /> Future anlegen
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {futures.length === 0 && (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '20px 0' }}>Noch keine Futures angelegt.</div>
        )}
        {futures.map(f => (
          <div key={f.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{f.titel}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 3 }}>
                  Schreiben: {f.schreib_von} – {f.schreib_bis}
                  {f.edit_von && ` · Edit: ${f.edit_von} – ${f.edit_bis}`}
                </div>
              </div>
              <button onClick={() => setEditFuture(f)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 4 }}>
                <Edit2 size={14} />
              </button>
            </div>

            {/* Autoren */}
            {['schreiben', 'edit'].map(phase => {
              const phaseAutoren = f.autoren.filter(a => a.phase === phase)
              if (phase === 'edit' && !f.edit_von && phaseAutoren.length === 0) return null
              return (
                <div key={phase} style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500, marginBottom: 6 }}>
                    {phase === 'schreiben' ? 'Schreib-Phase' : 'Edit-Phase'}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {phaseAutoren.map(a => (
                      <div key={a.id} style={{
                        padding: '4px 10px', borderRadius: 5, fontSize: 11,
                        background: `${statusColor(a.status)}20`,
                        border: `1px solid ${statusColor(a.status)}`,
                        color: 'var(--text-primary)',
                        display: 'flex', alignItems: 'center', gap: 5,
                      }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor(a.status) }} />
                        {a.person_cache_name || a.platzhalter_name || '—'}
                        {a.ist_homeoffice && <span style={{ fontSize: 9, color: 'var(--text-secondary)' }}>HO</span>}
                      </div>
                    ))}
                    <FutureAutorAdder futureId={f.id} phase={phase} produktionDbId={produktionDbId} onAdded={load} />
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {(newModal || editFuture) && (
        <FutureModal
          future={editFuture || undefined}
          produktionDbId={produktionDbId}
          onSave={async (data) => {
            if (editFuture) {
              await fetch(`/api/autorenplan/futures/${editFuture.id}`, {
                method: 'PUT', credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
              })
            } else {
              await fetch('/api/autorenplan/futures', {
                method: 'POST', credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...data, produktion_db_id: produktionDbId }),
              })
            }
            load()
            setNewModal(false)
            setEditFuture(null)
          }}
          onDelete={editFuture ? async () => {
            await fetch(`/api/autorenplan/futures/${editFuture.id}`, { method: 'DELETE', credentials: 'include' })
            load(); setEditFuture(null)
          } : undefined}
          onClose={() => { setNewModal(false); setEditFuture(null) }}
        />
      )}
    </div>
  )
}

function FutureAutorAdder({ futureId, phase, produktionDbId, onAdded }: { futureId: string; phase: string; produktionDbId: string; onAdded: () => void }) {
  const [open, setOpen] = useState(false)
  if (!open) return (
    <button onClick={() => setOpen(true)} style={{ padding: '4px 10px', borderRadius: 5, fontSize: 11, cursor: 'pointer', border: '1.5px dashed var(--border)', background: 'none', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
      <Plus size={10} /> Autor
    </button>
  )
  return (
    <div style={{ width: 200 }}>
      <PersonPicker
        onSelect={async (p) => {
          await fetch(`/api/autorenplan/futures/${futureId}/autoren`, {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ vertragsdb_person_id: p.id, person_cache_name: p.name, phase }),
          })
          onAdded()
          setOpen(false)
        }}
        onNew={async (name) => {
          await fetch(`/api/autorenplan/futures/${futureId}/autoren`, {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ platzhalter_name: name, phase }),
          })
          onAdded()
          setOpen(false)
        }}
        produktionDbId={produktionDbId}
      />
      <button onClick={() => setOpen(false)} style={{ marginTop: 4, fontSize: 10, color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer' }}>Abbrechen</button>
    </div>
  )
}

function FutureModal({ future, produktionDbId, onSave, onDelete, onClose }: {
  future?: Future; produktionDbId: string
  onSave: (d: any) => Promise<void>; onDelete?: () => Promise<void>; onClose: () => void
}) {
  const [titel, setTitel] = useState(future?.titel || '')
  const [schreibVon, setSchreibVon] = useState(future?.schreib_von || '')
  const [schreibBis, setSchreibBis] = useState(future?.schreib_bis || '')
  const [editVon, setEditVon] = useState(future?.edit_von || '')
  const [editBis, setEditBis] = useState(future?.edit_bis || '')
  const [notiz, setNotiz] = useState(future?.notiz || '')
  const [saving, setSaving] = useState(false)

  const inputStyle: React.CSSProperties = { padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-subtle)', fontSize: 12, color: 'var(--text-primary)', width: '100%', boxSizing: 'border-box' }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: 'var(--bg-page)', borderRadius: 12, width: 480, padding: 24, boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{future ? 'Future bearbeiten' : 'Future anlegen'}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={16} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div><label style={{ display: 'block', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Titel</label><input value={titel} onChange={e => setTitel(e.target.value)} placeholder="z.B. Future III" style={inputStyle} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label style={{ display: 'block', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Schreiben von</label><input type="date" value={schreibVon} onChange={e => setSchreibVon(e.target.value)} style={inputStyle} /></div>
            <div><label style={{ display: 'block', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Schreiben bis</label><input type="date" value={schreibBis} onChange={e => setSchreibBis(e.target.value)} style={inputStyle} /></div>
            <div><label style={{ display: 'block', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Edit von (optional)</label><input type="date" value={editVon} onChange={e => setEditVon(e.target.value)} style={inputStyle} /></div>
            <div><label style={{ display: 'block', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Edit bis (optional)</label><input type="date" value={editBis} onChange={e => setEditBis(e.target.value)} style={inputStyle} /></div>
          </div>
          <div><label style={{ display: 'block', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Notiz</label><textarea value={notiz} onChange={e => setNotiz(e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical' }} /></div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
          <div>{onDelete && <button onClick={onDelete} style={{ padding: '7px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer', border: '1px solid #FF3B30', background: 'none', color: '#FF3B30' }}>Löschen</button>}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={{ padding: '7px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer', border: '1px solid var(--border)', background: 'none', color: 'var(--text-secondary)' }}>Abbrechen</button>
            <button
              onClick={async () => { setSaving(true); await onSave({ titel, schreib_von: schreibVon, schreib_bis: schreibBis, edit_von: editVon || null, edit_bis: editBis || null, notiz: notiz || null }); setSaving(false) }}
              disabled={saving || !titel || !schreibVon || !schreibBis}
              style={{ padding: '7px 18px', borderRadius: 6, fontSize: 12, cursor: 'pointer', border: 'none', background: '#000', color: '#fff', fontWeight: 600 }}
            >
              {saving ? '...' : 'Speichern'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main AutorenplanTab ───────────────────────────────────────────────────────

export default function AutorenplanTab({ produktionDbId }: { produktionDbId: string }) {
  const [view, setView] = useState<'plan' | 'futures' | 'config'>('plan')
  const [config, setConfig] = useState<BuchprozessConfig | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/autorenplan/config?produktion_db_id=${produktionDbId}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setConfig(d.config); setLoading(false) })
      .catch(() => setLoading(false))
  }, [produktionDbId])

  const handleSaveConfig = async (c: BuchprozessConfig) => {
    await fetch(`/api/autorenplan/config?produktion_db_id=${produktionDbId}`, {
      method: 'PUT', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(c),
    })
    setConfig(c)
  }

  if (loading || !config) {
    return <div style={{ padding: 24, fontSize: 13, color: 'var(--text-secondary)' }}>Lade Autorenplan...</div>
  }

  const tabBtn = (id: typeof view, label: string, icon: React.ReactNode) => (
    <button
      onClick={() => setView(id)}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 14px', borderRadius: 7, fontSize: 12, cursor: 'pointer',
        border: view === id ? '1.5px solid #000' : '1px solid var(--border)',
        background: view === id ? '#000' : 'none',
        color: view === id ? '#fff' : 'var(--text-secondary)',
        fontWeight: view === id ? 600 : 400,
      }}
    >
      {icon} {label}
    </button>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Sub-Navigation */}
      <div style={{ display: 'flex', gap: 8, padding: '12px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {tabBtn('plan', 'Autorenplan', <Calendar size={13} />)}
        {tabBtn('futures', 'Futures', <Users size={13} />)}
        {tabBtn('config', 'Konfiguration', <Settings size={13} />)}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {view === 'plan' && <AutorenplanGrid config={config} produktionDbId={produktionDbId} />}
        {view === 'futures' && <FuturesPanel produktionDbId={produktionDbId} />}
        {view === 'config' && <BuchprozessKonfigTab config={config} onSave={handleSaveConfig} />}
      </div>
    </div>
  )
}
