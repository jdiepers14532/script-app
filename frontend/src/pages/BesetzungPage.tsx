import { useState, useEffect, useMemo } from 'react'
import AppShell from '../components/AppShell'
import { api } from '../api/client'
import { useSelectedProduction } from '../contexts'

const SPIEL_COLORS: Record<string, string> = {
  'text': '#00C853',
  'spiel': '#007AFF',
  'o.t.': '#BDBDBD',
}

export default function BesetzungPage() {
  const { selectedProduction } = useSelectedProduction()
  const produktionId = selectedProduction?.id ?? null

  const [data, setData] = useState<any>(null)
  const [werkstufTyp, setWerkstufTyp] = useState('drehbuch')
  const [filter, setFilter] = useState('')
  const [kategorieFilter, setKategorieFilter] = useState<string>('')

  useEffect(() => {
    if (!produktionId) return
    api.getStatBesetzungsmatrix(produktionId, werkstufTyp).then(setData).catch(() => {})
  }, [produktionId, werkstufTyp])

  const matrix = useMemo(() => {
    if (!data) return null

    const folgen: any[] = data.folgen || []
    const kategorien: any[] = data.kategorien || []
    const cells: any[] = data.cells || []

    // Build character map: { charId → { name, kategorie_id, folgen: { folgeId → { scene_count, total_repliken, spiel_typen } } } }
    const charMap = new Map<string, { name: string; kategorie_id: string; folgen: Map<number, any> }>()
    for (const c of cells) {
      if (!charMap.has(c.character_id)) {
        charMap.set(c.character_id, { name: c.character_name, kategorie_id: c.kategorie_id, folgen: new Map() })
      }
      charMap.get(c.character_id)!.folgen.set(c.folge_id, {
        scene_count: Number(c.scene_count),
        total_repliken: Number(c.total_repliken),
        spiel_typen: c.spiel_typen,
      })
    }

    // Sort characters by total scenes descending
    let characters = [...charMap.entries()]
      .map(([id, d]) => {
        let total = 0
        d.folgen.forEach(v => total += v.scene_count)
        return { id, ...d, totalScenes: total }
      })
      .sort((a, b) => b.totalScenes - a.totalScenes)

    // Apply filters
    if (filter) {
      const f = filter.toUpperCase()
      characters = characters.filter(c => c.name.toUpperCase().includes(f))
    }
    if (kategorieFilter) {
      characters = characters.filter(c => String(c.kategorie_id) === kategorieFilter)
    }

    return { folgen, kategorien, characters }
  }, [data, filter, kategorieFilter])

  if (!produktionId) {
    return (
      <AppShell hideProductionSelector={false}>
        <div style={{ padding: 32, color: 'var(--text-secondary)', textAlign: 'center' }}>
          Bitte Staffel auswählen
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell hideProductionSelector={false}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        {/* Toolbar */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 15, fontWeight: 600 }}>Besetzungsmatrix</span>
          <select
            value={werkstufTyp}
            onChange={e => setWerkstufTyp(e.target.value)}
            style={selStyle}
          >
            <option value="drehbuch">Drehbuch</option>
            <option value="treatment">Treatment</option>
            <option value="storyline">Storyline</option>
          </select>
          <input
            type="text"
            placeholder="Figur suchen..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13, width: 180 }}
          />
          {matrix?.kategorien && matrix.kategorien.length > 0 && (
            <select value={kategorieFilter} onChange={e => setKategorieFilter(e.target.value)} style={selStyle}>
              <option value="">Alle Kategorien</option>
              {matrix.kategorien.map((k: any) => (
                <option key={k.id} value={k.id}>{k.name}</option>
              ))}
            </select>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', fontSize: 11, color: 'var(--text-secondary)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: '#00C853', display: 'inline-block' }} /> Text
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: '#007AFF', display: 'inline-block' }} /> Spiel
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: '#BDBDBD', display: 'inline-block' }} /> O.T.
            </span>
          </div>
        </div>

        {/* Matrix */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {!matrix ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)' }}>Laden...</div>
          ) : matrix.characters.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)' }}>Keine Besetzungsdaten</div>
          ) : (
            <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: '100%' }}>
              <thead>
                <tr>
                  <th style={{ ...cellHeaderStyle, position: 'sticky', left: 0, zIndex: 2, background: 'var(--bg)' }}>Figur</th>
                  <th style={{ ...cellHeaderStyle, textAlign: 'right' }}>Σ</th>
                  {matrix.folgen.map((f: any) => (
                    <th key={f.id} style={cellHeaderStyle}>{f.folge_nummer}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.characters.map(ch => (
                  <tr key={ch.id}>
                    <td style={{ ...cellStyle, position: 'sticky', left: 0, zIndex: 1, background: 'var(--bg)', fontWeight: 500, whiteSpace: 'nowrap', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {ch.name}
                    </td>
                    <td style={{ ...cellStyle, fontWeight: 700, textAlign: 'right', color: 'var(--text-secondary)' }}>{ch.totalScenes}</td>
                    {matrix.folgen.map((f: any) => {
                      const entry = ch.folgen.get(f.id)
                      if (!entry) return <td key={f.id} style={cellStyle} />

                      // Determine dominant spiel_typ
                      const typen = (entry.spiel_typen || '').split(',')
                      const dominant = typen.includes('text') ? 'text' : typen.includes('spiel') ? 'spiel' : 'o.t.'
                      const bg = SPIEL_COLORS[dominant] || '#BDBDBD'

                      return (
                        <td key={f.id} style={cellStyle} title={`${ch.name} · Folge ${f.folge_nummer}: ${entry.scene_count} Szenen, ${entry.total_repliken} Repliken`}>
                          <div style={{
                            width: 28, height: 22, borderRadius: 4,
                            background: bg, opacity: 0.85,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: dominant === 'o.t.' ? '#555' : '#fff',
                            fontSize: 10, fontWeight: 700, margin: '0 auto',
                          }}>
                            {entry.scene_count}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AppShell>
  )
}

const selStyle: React.CSSProperties = {
  padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)',
  background: 'var(--bg)', color: 'var(--text)', fontSize: 13,
}

const cellHeaderStyle: React.CSSProperties = {
  padding: '8px 6px', fontSize: 11, fontWeight: 600, textAlign: 'center',
  borderBottom: '2px solid var(--border)', whiteSpace: 'nowrap',
  color: 'var(--text-secondary)',
}

const cellStyle: React.CSSProperties = {
  padding: '4px 6px', textAlign: 'center',
  borderBottom: '1px solid var(--border-subtle, var(--border))',
}
