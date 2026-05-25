import { useState, useEffect, useCallback } from 'react'
import { X, Plus, Trash2, Edit2, Check } from 'lucide-react'
import Tooltip from './Tooltip'

// ── Types ─────────────────────────────────────────────────────────────────────

interface GageKategorie {
  id: string
  label: string
  kat_nr?: number
  beschreibung?: string
  abrechnungstyp?: string
  betrag?: number
  waehrung?: string
  lst_rg?: string
}

const ABRECHNUNGSTYPEN = [
  { id: 'pauschal',    label: 'Pauschal' },
  { id: 'pro_tag',     label: 'Pro Tag' },
  { id: 'pro_woche',   label: 'Pro Woche' },
  { id: 'pro_monat',   label: 'Pro Monat' },
  { id: 'pro_buch',    label: 'Pro Buch' },
]

interface Pausenwoche {
  id: string
  woche_von: string
  notiz?: string
}

// ── Konstanten ────────────────────────────────────────────────────────────────

const MONATE = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez']

// ── Datums-Hilfsfunktionen ───────────────────────────────────────────────────

function mondayOf(d: Date): Date {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const m = new Date(d)
  m.setDate(d.getDate() + diff)
  m.setHours(0, 0, 0, 0)
  return m
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function getKW(d: Date): number {
  const jan4 = new Date(d.getFullYear(), 0, 4)
  const startW1 = mondayOf(jan4)
  const diff = Math.round((d.getTime() - startW1.getTime()) / 86400000)
  return Math.max(1, Math.floor(diff / 7) + 1)
}

interface WeekEntry {
  monday: Date
  kw: number
}

function getWeeksOfYear(year: number): WeekEntry[] {
  const weeks: WeekEntry[] = []
  const jan4 = new Date(year, 0, 4)
  let cur = mondayOf(jan4)
  for (let i = 0; i < 54; i++) {
    // ISO week year: KW gehört zum Jahr wo Donnerstag liegt
    const thu = new Date(cur)
    thu.setDate(cur.getDate() + 3)
    if (thu.getFullYear() === year) {
      weeks.push({ monday: new Date(cur), kw: getKW(cur) })
    }
    cur = new Date(cur)
    cur.setDate(cur.getDate() + 7)
  }
  return weeks
}

function formatDay(d: Date): string {
  return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.`
}

// ── GagenkategorienTab ────────────────────────────────────────────────────────

function GagenkategorienTab() {
  const [list, setList] = useState<GageKategorie[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<GageKategorie | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [form, setForm] = useState<Partial<GageKategorie>>({})
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    fetch('/api/autorenplan/gage-kategorien', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setList(d.gage_kategorien || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const startNew = () => {
    const nextKat = list.reduce((max, g) => Math.max(max, g.kat_nr ?? 0), 0) + 1
    setForm({ label: '', kat_nr: nextKat, abrechnungstyp: 'pauschal', waehrung: 'EUR', lst_rg: 'rg' })
    setIsNew(true)
    setEditing(null)
  }

  const startEdit = (gk: GageKategorie) => {
    setForm({ ...gk })
    setEditing(gk)
    setIsNew(false)
  }

  const cancel = () => { setEditing(null); setIsNew(false); setForm({}) }

  const save = async () => {
    if (!form.label?.trim()) return
    setSaving(true)
    try {
      if (isNew) {
        await fetch('/api/autorenplan/gage-kategorien', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
      } else if (editing) {
        await fetch(`/api/autorenplan/gage-kategorien/${editing.id}`, {
          method: 'PUT', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
      }
      load()
      cancel()
    } finally { setSaving(false) }
  }

  const del = async (id: string) => {
    await fetch(`/api/autorenplan/gage-kategorien/${id}`, { method: 'DELETE', credentials: 'include' })
    load()
  }

  const inp: React.CSSProperties = {
    padding: '6px 9px', borderRadius: 6, border: '1px solid var(--border)',
    background: 'var(--bg-subtle)', color: 'var(--text-primary)', fontSize: 12,
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Globale Gagenkategorien</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
            Produktionsübergreifend — über Kat.-Nr. mit Einsätzen verknüpfbar
          </div>
        </div>
        <button onClick={startNew} style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: '7px 13px',
          borderRadius: 7, border: 'none', background: '#000', color: '#fff',
          fontSize: 12, fontWeight: 600, cursor: 'pointer',
        }}>
          <Plus size={12} /> Neue Kategorie
        </button>
      </div>

      {/* Inline-Formular */}
      {(isNew || editing) && (
        <div style={{
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 10, padding: 16, marginBottom: 12,
        }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 10, alignItems: 'flex-end' }}>
            <div style={{ width: 80 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Kat.-Nr.</label>
              <input type="number" min={1} style={{ ...inp, width: '100%', boxSizing: 'border-box', textAlign: 'center' }}
                value={form.kat_nr ?? ''} onChange={e => setForm(f => ({ ...f, kat_nr: e.target.value ? Number(e.target.value) : undefined }))} placeholder="1" />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Bezeichnung *</label>
              <input style={{ ...inp, width: '100%', boxSizing: 'border-box' }}
                value={form.label ?? ''} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="z.B. Erstautor" autoFocus />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Abrechnung</label>
              <select style={{ ...inp }} value={form.abrechnungstyp ?? 'pauschal'}
                onChange={e => setForm(f => ({ ...f, abrechnungstyp: e.target.value }))}>
                {ABRECHNUNGSTYPEN.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
            </div>
            <div style={{ width: 110 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Betrag</label>
              <input type="number" min={0} step={0.01} style={{ ...inp, width: '100%', boxSizing: 'border-box' }}
                value={form.betrag ?? ''} onChange={e => setForm(f => ({ ...f, betrag: e.target.value ? Number(e.target.value) : undefined }))} placeholder="0,00" />
            </div>
            <div style={{ width: 65 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Währung</label>
              <input style={{ ...inp, width: '100%', boxSizing: 'border-box' }}
                value={form.waehrung ?? 'EUR'} onChange={e => setForm(f => ({ ...f, waehrung: e.target.value }))} placeholder="EUR" maxLength={3} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>LSt/RG</label>
              <select style={{ ...inp }} value={form.lst_rg ?? 'rg'}
                onChange={e => setForm(f => ({ ...f, lst_rg: e.target.value }))}>
                <option value="rg">RG</option>
                <option value="lst">LSt</option>
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Beschreibung</label>
            <input style={{ ...inp, width: '100%', boxSizing: 'border-box' }}
              value={form.beschreibung ?? ''} onChange={e => setForm(f => ({ ...f, beschreibung: e.target.value }))} placeholder="Optionale Beschreibung" />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={cancel} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid var(--border)', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12 }}>Abbrechen</button>
            <button onClick={save} disabled={saving || !form.label?.trim()} style={{ padding: '6px 18px', borderRadius: 6, border: 'none', background: '#000', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, opacity: !form.label?.trim() ? 0.4 : 1 }}>
              {saving ? '...' : 'Speichern'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ color: 'var(--text-secondary)', fontSize: 12, padding: '20px 0' }}>Lade...</div>
      ) : list.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-secondary)', fontSize: 12 }}>Noch keine Gagenkategorien definiert.</div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg-subtle)' }}>
                <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)', width: 55 }}>Kat.</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>Bezeichnung</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)', width: 110 }}>Abrechnung</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)', width: 100 }}>Betrag</th>
                <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)', width: 55 }}>LSt/RG</th>
                <th style={{ width: 72, borderBottom: '1px solid var(--border)' }} />
              </tr>
            </thead>
            <tbody>
              {list.map((gk, i) => (
                <tr key={gk.id} style={{ background: i % 2 === 0 ? 'var(--bg-page)' : 'var(--bg-subtle)' }}>
                  <td style={{ padding: '9px 12px', textAlign: 'center', color: 'var(--text-secondary)', fontWeight: 700, fontSize: 13 }}>
                    {gk.kat_nr ?? '—'}
                  </td>
                  <td style={{ padding: '9px 12px', color: 'var(--text-primary)', fontWeight: 500 }}>
                    {gk.label}
                    {gk.beschreibung && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 1 }}>{gk.beschreibung}</div>}
                  </td>
                  <td style={{ padding: '9px 12px', color: 'var(--text-secondary)', fontSize: 12 }}>
                    {ABRECHNUNGSTYPEN.find(a => a.id === gk.abrechnungstyp)?.label ?? gk.abrechnungstyp ?? '—'}
                  </td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', color: 'var(--text-primary)', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                    {gk.betrag != null ? `${Number(gk.betrag).toLocaleString('de-DE', { minimumFractionDigits: 2 })} ${gk.waehrung || 'EUR'}` : '—'}
                  </td>
                  <td style={{ padding: '9px 12px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: gk.lst_rg === 'lst' ? '#007AFF' : '#FF9500' }}>
                    {gk.lst_rg?.toUpperCase() ?? '—'}
                  </td>
                  <td style={{ padding: '9px 8px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                      <button onClick={() => startEdit(gk)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '3px 5px', borderRadius: 4 }}>
                        <Edit2 size={12} />
                      </button>
                      <button onClick={() => del(gk.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#FF3B30', padding: '3px 5px', borderRadius: 4 }}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── PausenkalenderTab ─────────────────────────────────────────────────────────

function PausenkalenderTab({ produktionDbId }: { produktionDbId: string }) {
  const [year, setYear] = useState(new Date().getFullYear())
  const [pausenwochen, setPausenwochen] = useState<Pausenwoche[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    fetch(`/api/autorenplan/pausenwochen?produktion_db_id=${produktionDbId}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setPausenwochen(d.pausenwochen || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [produktionDbId])

  useEffect(() => { load() }, [load])

  const pauseSet = new Set(pausenwochen.map(p => p.woche_von.slice(0, 10)))

  const toggleWoche = async (monday: Date) => {
    const key = isoDate(monday)
    if (pauseSet.has(key)) {
      const pw = pausenwochen.find(p => p.woche_von.slice(0, 10) === key)
      if (!pw) return
      await fetch(`/api/autorenplan/pausenwochen/${pw.id}`, { method: 'DELETE', credentials: 'include' })
    } else {
      await fetch('/api/autorenplan/pausenwochen', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ produktion_db_id: produktionDbId, woche_von: key }),
      })
    }
    load()
  }

  const weeks = getWeeksOfYear(year)

  // Wochen nach Monat gruppieren (Monat = der Monat des Montags)
  const byMonth: WeekEntry[][] = Array.from({ length: 12 }, () => [])
  for (const w of weeks) {
    byMonth[w.monday.getMonth()].push(w)
  }

  return (
    <div>
      {/* Jahr-Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Pausen & Unterbrechungen</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
            Wochen markieren, an denen nicht gearbeitet wird. Diese Wochen werden im Autorenplan grau hinterlegt.
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => setYear(y => y - 1)} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 13 }}>‹</button>
          <span style={{ fontSize: 14, fontWeight: 700, minWidth: 48, textAlign: 'center' }}>{year}</span>
          <button onClick={() => setYear(y => y + 1)} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 13 }}>›</button>
        </div>
      </div>

      {/* Legende */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 16, fontSize: 11, color: 'var(--text-secondary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 12, height: 12, borderRadius: 3, background: '#00C85322', border: '1px solid #00C85366' }} />
          <span>Pause / keine Arbeit</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--bg-surface)', border: '1px solid var(--border)' }} />
          <span>Arbeitswoche</span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 'auto' }}>
          {loading ? '...' : `${pausenwochen.length} Pause${pausenwochen.length !== 1 ? 'nwochen' : 'nwoche'} in ${year}`}
        </div>
      </div>

      {/* Kalender-Grid: 4 Spalten × 3 Reihen */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {Array.from({ length: 12 }, (_, monthIdx) => {
          const monthWeeks = byMonth[monthIdx]
          return (
            <div key={monthIdx} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              {/* Monatsheader */}
              <div style={{ padding: '7px 10px', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {MONATE[monthIdx]}
              </div>
              {/* Wochen */}
              <div>
                {monthWeeks.length === 0 ? (
                  <div style={{ padding: '8px 10px', fontSize: 11, color: 'var(--text-secondary)', fontStyle: 'italic' }}>–</div>
                ) : (
                  monthWeeks.map(w => {
                    const key = isoDate(w.monday)
                    const isPause = pauseSet.has(key)
                    const sunday = new Date(w.monday)
                    sunday.setDate(w.monday.getDate() + 6)
                    return (
                      <Tooltip key={key} text={isPause ? 'Klicken: Pause aufheben' : 'Klicken: als Pause markieren'}>
                        <button
                          onClick={() => toggleWoche(w.monday)}
                          style={{
                            width: '100%', display: 'flex', alignItems: 'center', gap: 6,
                            padding: '5px 10px', border: 'none', cursor: 'pointer', textAlign: 'left',
                            background: isPause ? '#00C85314' : 'transparent',
                            borderBottom: '1px solid var(--border-subtle, var(--border))',
                            transition: 'background 0.1s',
                          }}
                        >
                          <span style={{
                            fontSize: 10, fontWeight: 700, minWidth: 28,
                            color: isPause ? '#00C853' : 'var(--text-secondary)',
                          }}>
                            {String(w.kw).padStart(2, '0')}
                          </span>
                          <span style={{ fontSize: 11, color: isPause ? '#00C853' : 'var(--text-primary)', flex: 1 }}>
                            {formatDay(w.monday)}–{formatDay(sunday)}
                          </span>
                          {isPause && <Check size={10} color="#00C853" />}
                        </button>
                      </Tooltip>
                    )
                  })
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── AutorenplanSettingsModal (Haupt) ──────────────────────────────────────────

export default function AutorenplanSettingsModal({
  produktionDbId, onClose,
}: {
  produktionDbId: string
  onClose: () => void
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  const [tab, setTab] = useState<'gagen' | 'pausen'>('gagen')

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '8px 16px', border: 'none', background: 'none', cursor: 'pointer',
    fontSize: 13, fontWeight: active ? 600 : 400,
    color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
    borderBottom: active ? '2px solid var(--text-primary)' : '2px solid transparent',
    transition: 'color 0.1s',
  })

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        zIndex: 9998, animation: 'fadeIn 0.15s',
      }} />
      {/* Modal */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%,-50%)',
        width: 760, maxWidth: 'calc(100vw - 32px)',
        maxHeight: 'calc(100vh - 48px)',
        background: 'var(--bg-page)', border: '1px solid var(--border)',
        borderRadius: 14, boxShadow: '0 24px 64px rgba(0,0,0,0.22)',
        zIndex: 9999, display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0,
        }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Autorenplan-Einstellungen</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 4, display: 'flex' }}>
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0, padding: '0 4px' }}>
          <button style={tabStyle(tab === 'gagen')} onClick={() => setTab('gagen')}>Gagenkategorien</button>
          <button style={tabStyle(tab === 'pausen')} onClick={() => setTab('pausen')}>Pausen & Unterbrechungen</button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {tab === 'gagen'  && <GagenkategorienTab />}
          {tab === 'pausen' && <PausenkalenderTab produktionDbId={produktionDbId} />}
        </div>
      </div>
    </>
  )
}
