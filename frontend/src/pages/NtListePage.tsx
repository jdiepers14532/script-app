import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Mic, MicOff, PhoneCall, ExternalLink, RefreshCw } from 'lucide-react'
import AppShell from '../components/AppShell'
import { api } from '../api/client'
import { useSelectedProduction, useTweaks } from '../contexts'

const NT_TYP_LABELS: Record<string, string> = {
  stimme: 'Nur Ton',
  telefon: 'Telefonat',
  vo: 'Voice Over',
}

const NT_TYP_ICONS: Record<string, React.ReactNode> = {
  stimme: <MicOff size={13} />,
  telefon: <PhoneCall size={13} />,
  vo: <Mic size={13} />,
}

const NT_TYP_COLORS: Record<string, string> = {
  stimme: '#007AFF',
  telefon: '#FF9500',
  vo: '#AF52DE',
}

export default function NtListePage() {
  const { selectedProduction } = useSelectedProduction()
  const { tweaks } = useTweaks()
  const produktionId = selectedProduction?.id ?? null
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const szeneIdFilter = searchParams.get('szene_id')

  const [eintraege, setEintraege] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [filterTyp, setFilterTyp] = useState<string>('alle')
  const [filterChar, setFilterChar] = useState<string>('')
  const [gruppierung, setGruppierung] = useState<'figur' | 'folge'>('folge')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [editNotiz, setEditNotiz] = useState<Record<string, string>>({})

  const loadEintraege = async () => {
    if (!produktionId) return
    setLoading(true)
    try {
      // Einträge ohne Dialog zuerst bereinigen
      await fetch('/api/nt-eintraege/cleanup', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ produktion_id: produktionId }),
      }).catch(() => {})

      const params = new URLSearchParams({ produktion_id: produktionId })
      if (szeneIdFilter) params.set('szene_id', szeneIdFilter)
      const r = await fetch(`/api/nt-eintraege?${params}`, { credentials: 'include' })
      const data = r.ok ? await r.json() : []
      setEintraege(data)
      const notizMap: Record<string, string> = {}
      for (const e of data) notizMap[e.id] = e.notiz ?? ''
      setEditNotiz(notizMap)
    } catch {
      setEintraege([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadEintraege() }, [produktionId, szeneIdFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  const saveNotiz = async (id: string) => {
    setSavingId(id)
    try {
      await fetch(`/api/nt-eintraege/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notiz: editNotiz[id] ?? '' }),
      })
      setEintraege(prev => prev.map(e => e.id === id ? { ...e, notiz: editNotiz[id] } : e))
    } catch {} finally { setSavingId(null) }
  }

  const saveTyp = async (id: string, nt_typ: string) => {
    try {
      await fetch(`/api/nt-eintraege/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nt_typ }),
      })
      setEintraege(prev => prev.map(e => e.id === id ? { ...e, nt_typ } : e))
    } catch {}
  }

  const filtered = useMemo(() => {
    return eintraege.filter(e => {
      if (filterTyp !== 'alle' && e.nt_typ !== filterTyp) return false
      if (filterChar && !(e.character_name ?? '').toLowerCase().includes(filterChar.toLowerCase())) return false
      return true
    })
  }, [eintraege, filterTyp, filterChar])

  // Gruppierung
  const grouped = useMemo(() => {
    if (gruppierung === 'figur') {
      const map = new Map<string, any[]>()
      for (const e of filtered) {
        const key = e.character_name ?? '?'
        if (!map.has(key)) map.set(key, [])
        map.get(key)!.push(e)
      }
      return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b, 'de'))
    } else {
      const map = new Map<string, any[]>()
      for (const e of filtered) {
        const key = e.folge_nummer != null ? `Folge ${e.folge_nummer}` : 'Ohne Folge'
        if (!map.has(key)) map.set(key, [])
        map.get(key)!.push(e)
      }
      return Array.from(map.entries()).sort(([a], [b]) => {
        const na = parseInt(a.replace(/\D/g, ''), 10) || 9999
        const nb = parseInt(b.replace(/\D/g, ''), 10) || 9999
        return na - nb
      })
    }
  }, [filtered, gruppierung])

  const selStyle: React.CSSProperties = {
    fontSize: 13, padding: '6px 10px', borderRadius: 6,
    border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)',
  }

  if (!produktionId) {
    return (
      <AppShell>
        <div style={{ padding: 32, color: 'var(--text-secondary)', textAlign: 'center' }}>
          Bitte eine Staffel auswählen
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

        {/* Toolbar */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>NT-Liste</span>

          {szeneIdFilter && (
            <span style={{ fontSize: 12, background: '#FF9500', color: '#fff', padding: '2px 8px', borderRadius: 10 }}>
              Gefiltert: Szene
            </span>
          )}

          {/* Gruppierung */}
          <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
            {(['folge', 'figur'] as const).map(g => (
              <button key={g} onClick={() => setGruppierung(g)}
                style={{ padding: '5px 12px', border: 'none', cursor: 'pointer', fontSize: 12,
                  background: gruppierung === g ? 'var(--text)' : 'var(--bg)',
                  color: gruppierung === g ? 'var(--bg)' : 'var(--text)',
                  borderLeft: g === 'figur' ? '1px solid var(--border)' : 'none' }}>
                {g === 'folge' ? 'nach Folge' : 'nach Figur'}
              </button>
            ))}
          </div>

          {/* Filter NT-Typ */}
          <select value={filterTyp} onChange={e => setFilterTyp(e.target.value)} style={selStyle}>
            <option value="alle">Alle Typen</option>
            <option value="stimme">Nur Ton</option>
            <option value="telefon">Telefonat</option>
            <option value="vo">Voice Over</option>
          </select>

          {/* Filter Figur */}
          <input
            type="text"
            placeholder="Figur suchen..."
            value={filterChar}
            onChange={e => setFilterChar(e.target.value)}
            style={{ ...selStyle, minWidth: 140 }}
          />

          {szeneIdFilter && (
            <button onClick={() => navigate('/nt-liste')} style={{ ...selStyle, cursor: 'pointer' }}>
              Filter aufheben
            </button>
          )}

          <button onClick={loadEintraege} style={{ marginLeft: 'auto', padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, background: 'none', cursor: 'pointer', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <RefreshCw size={13} /> Aktualisieren
          </button>
        </div>

        {/* Liste */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 48 }}>Laden…</div>
          ) : grouped.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 48 }}>
              Keine NT-Einträge gefunden
            </div>
          ) : (
            grouped.map(([groupKey, entries]) => (
              <div key={groupKey} style={{ marginBottom: 32 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, paddingBottom: 6, borderBottom: '2px solid var(--border)' }}>
                  {groupKey}
                  <span style={{ fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 8 }}>({entries.length} Eintrag{entries.length !== 1 ? 'e' : ''})</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {entries.map(e => {
                    const replicaLines: string[] = e.repliken_text
                      ? e.repliken_text.split('\n').filter((l: string) => l.trim())
                      : []
                    const folgeLabel = e.folge_nummer != null ? `Folge ${e.folge_nummer}` : null
                    const szeneLabel = `Sz. ${e.scene_nummer ?? '?'}${e.ort_name ? ` — ${e.ort_name}` : ''}${e.int_ext ? ` (${(e.int_ext as string).toUpperCase()})` : ''}`

                    return (
                    <div key={e.id} style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: 'var(--surface)' }}>

                      {/* Header */}
                      <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', borderBottom: replicaLines.length > 0 || e.notiz !== undefined ? '1px solid var(--border)' : 'none' }}>
                        <select
                          value={e.nt_typ}
                          onChange={ev => saveTyp(e.id, ev.target.value)}
                          style={{ fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 6, border: 'none', background: NT_TYP_COLORS[e.nt_typ] + '22', color: NT_TYP_COLORS[e.nt_typ], cursor: 'pointer' }}
                        >
                          <option value="stimme">Nur Ton</option>
                          <option value="telefon">Telefonat</option>
                          <option value="vo">Voice Over</option>
                        </select>

                        <span style={{ fontSize: 13, fontWeight: 700 }}>
                          {gruppierung === 'folge' ? e.character_name : (folgeLabel ?? '—')}
                        </span>

                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                          {gruppierung === 'folge'
                            ? szeneLabel
                            : (folgeLabel ? `${folgeLabel} · ${szeneLabel}` : szeneLabel)}
                        </span>

                        <button
                          onClick={() => navigate(`/?szene=${e.szene_id}`)}
                          style={{ marginLeft: 'auto', padding: '3px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'transparent', cursor: 'pointer', color: 'var(--text)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}
                        >
                          <ExternalLink size={11} /> Szene öffnen
                        </button>
                      </div>

                      {/* Repliken nummeriert */}
                      {replicaLines.length > 0 && (
                        <div style={{ padding: '8px 14px 10px', display: 'flex', flexDirection: 'column', gap: 4, borderBottom: '1px solid var(--border)' }}>
                          {replicaLines.map((line: string, i: number) => {
                            const hasPos = Array.isArray(e.repliken_positionen) && e.repliken_positionen[i] != null
                            const pos = hasPos ? e.repliken_positionen[i] : null
                            return (
                            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', lineHeight: 1.5 }}>
                              {tweaks.showReplikNumbers && pos != null && (
                                <span style={{
                                  fontSize: 10, fontWeight: 700, color: NT_TYP_COLORS[e.nt_typ],
                                  minWidth: 42, paddingTop: 2, flexShrink: 0,
                                  letterSpacing: '0.02em',
                                }}>
                                  R{pos}
                                </span>
                              )}
                              <span style={{ fontSize: 12, fontStyle: 'italic', color: 'var(--text)' }}>{line}</span>
                            </div>
                            )
                          })}
                        </div>
                      )}

                      {/* Notiz (editierbar) */}
                      <div style={{ padding: '8px 14px 10px', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        <textarea
                          value={editNotiz[e.id] ?? ''}
                          onChange={ev => setEditNotiz(prev => ({ ...prev, [e.id]: ev.target.value }))}
                          onBlur={() => {
                            if ((editNotiz[e.id] ?? '') !== (e.notiz ?? '')) saveNotiz(e.id)
                          }}
                          placeholder="Regiehinweise für NT-Studio…"
                          rows={2}
                          style={{ flex: 1, fontSize: 12, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', resize: 'vertical', fontFamily: 'inherit' }}
                        />
                        {savingId === e.id && (
                          <span style={{ fontSize: 11, color: 'var(--text-secondary)', paddingTop: 6 }}>Speichert…</span>
                        )}
                      </div>
                    </div>
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </AppShell>
  )
}
