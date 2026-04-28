import { useState } from 'react'
import { Plus, Trash2, Search } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

interface Beziehung {
  id: number
  related_id: string
  related_name: string
  beziehungstyp: string
  label?: string | null
}

interface BeziehungsPanelProps {
  beziehungen: Beziehung[]
  characterId: string
  targetRoute: string // '/rollen' or '/komparsen'
  onAdd: (relatedId: string, beziehungstyp: string, label?: string) => Promise<void>
  onDelete: (relId: number) => Promise<void>
  onSearchCharacters: (q: string) => Promise<{ id: string; name: string }[]>
}

const TYPEN = ['eltern_von', 'kind_von', 'geschwister', 'partner', 'custom']

export default function BeziehungsPanel({
  beziehungen,
  onAdd,
  onDelete,
  onSearchCharacters,
  targetRoute,
}: BeziehungsPanelProps) {
  const navigate = useNavigate()
  const [adding, setAdding] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ id: string; name: string }[]>([])
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null)
  const [typ, setTyp] = useState(TYPEN[0])
  const [customLabel, setCustomLabel] = useState('')
  const [saving, setSaving] = useState(false)

  const doSearch = async (q: string) => {
    if (!q.trim()) { setResults([]); return }
    const r = await onSearchCharacters(q)
    setResults(r)
  }

  const handleAdd = async () => {
    if (!selected) return
    setSaving(true)
    try {
      await onAdd(selected.id, typ, typ === 'custom' ? customLabel : undefined)
      setAdding(false)
      setSelected(null)
      setQuery('')
      setResults([])
      setCustomLabel('')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Beziehungen</span>
        <button
          onClick={() => setAdding(!adding)}
          style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}
        >
          <Plus size={12} /> Beziehung
        </button>
      </div>

      {adding && (
        <div style={{ padding: 10, background: 'var(--bg-subtle)', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Character search */}
          <div style={{ position: 'relative' }}>
            <div style={{ position: 'relative' }}>
              <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', pointerEvents: 'none' }} />
              <input
                value={selected ? selected.name : query}
                onChange={e => { setQuery(e.target.value); setSelected(null); doSearch(e.target.value) }}
                placeholder="Figur suchen…"
                style={{ width: '100%', fontSize: 12, padding: '5px 8px 5px 24px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box' }}
              />
            </div>
            {!selected && results.length > 0 && (
              <div style={{ position: 'absolute', zIndex: 100, top: '100%', left: 0, right: 0, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
                {results.map(r => (
                  <div key={r.id} onClick={() => { setSelected(r); setQuery(''); setResults([]) }}
                    style={{ padding: '6px 10px', fontSize: 12, cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-subtle)')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}
                  >
                    {r.name}
                  </div>
                ))}
              </div>
            )}
          </div>

          <select value={typ} onChange={e => setTyp(e.target.value)} style={{ fontSize: 12, padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', color: 'var(--text)' }}>
            {TYPEN.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          {typ === 'custom' && (
            <input value={customLabel} onChange={e => setCustomLabel(e.target.value)} placeholder="Bezeichnung…"
              style={{ fontSize: 12, padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', color: 'var(--text)' }}
            />
          )}

          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={handleAdd}
              disabled={!selected || saving}
              style={{ flex: 1, fontSize: 12, padding: '5px', background: 'var(--text)', color: 'var(--bg)', border: 'none', borderRadius: 6, cursor: 'pointer' }}
            >
              {saving ? 'Speichern…' : 'Hinzufügen'}
            </button>
            <button onClick={() => setAdding(false)} style={{ fontSize: 12, padding: '5px 10px', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', background: 'transparent', color: 'var(--text)' }}>
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {beziehungen.length === 0 && !adding && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Keine Beziehungen</div>
      )}

      {beziehungen.map(b => (
        <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border-subtle)' }}>
          <span style={{ fontSize: 11, padding: '2px 6px', background: 'var(--bg-subtle)', borderRadius: 4, color: 'var(--text-secondary)', flexShrink: 0 }}>
            {b.label ?? b.beziehungstyp}
          </span>
          <button
            onClick={() => navigate(`${targetRoute}?id=${b.related_id}`)}
            style={{ flex: 1, textAlign: 'left', fontSize: 13, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text)', padding: 0 }}
          >
            {b.related_name}
          </button>
          <button
            onClick={() => onDelete(b.id)}
            style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', padding: '2px' }}
          >
            <Trash2 size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}
