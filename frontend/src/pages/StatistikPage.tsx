import { useState, useEffect, useCallback, useMemo } from 'react'
import AppShell from '../components/AppShell'
import { api } from '../api/client'
import { useSelectedProduction } from '../contexts'
import { BarChart3, Users, GitCompare, MapPin, UserCheck, ChevronDown, ChevronUp, Table, BarChart2, Printer } from 'lucide-react'

type TabId = 'overview' | 'repliken' | 'pairs' | 'motiv' | 'komparsen' | 'compare'

const TABS: { id: TabId; label: string; icon: any }[] = [
  { id: 'overview', label: 'Übersicht', icon: BarChart3 },
  { id: 'repliken', label: 'Repliken', icon: Users },
  { id: 'pairs', label: 'Figurenpaare', icon: Users },
  { id: 'motiv', label: 'Motive', icon: MapPin },
  { id: 'komparsen', label: 'Komparsen', icon: UserCheck },
  { id: 'compare', label: 'Versionsvergleich', icon: GitCompare },
]

function formatTime(sek: number) {
  const m = Math.floor(sek / 60)
  const s = sek % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function StatistikPage() {
  const { selectedProduction } = useSelectedProduction()
  const produktionId = selectedProduction?.id ?? null

  const [folgen, setFolgen] = useState<any[]>([])
  const [selectedFolgeId, setSelectedFolgeId] = useState<number | null>(null)
  const [werkstufen, setWerkstufen] = useState<any[]>([])
  const [selectedWerkId, setSelectedWerkId] = useState<string | null>(null)
  const [tab, setTab] = useState<TabId>('overview')

  // Load Folgen
  useEffect(() => {
    if (!produktionId) return
    api.getFolgenV2(produktionId).then(setFolgen).catch(() => {})
  }, [produktionId])

  // Load Werkstufen for selected Folge
  useEffect(() => {
    if (!selectedFolgeId) { setWerkstufen([]); setSelectedWerkId(null); return }
    api.getWerkstufen(selectedFolgeId).then(ws => {
      setWerkstufen(ws)
      if (ws.length > 0) setSelectedWerkId(ws[0].id)
      else setSelectedWerkId(null)
    }).catch(() => {})
  }, [selectedFolgeId])

  // Auto-select first folge
  useEffect(() => {
    if (folgen.length > 0 && !selectedFolgeId) {
      setSelectedFolgeId(folgen[0].id)
    }
  }, [folgen, selectedFolgeId])

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
          <select
            value={selectedFolgeId ?? ''}
            onChange={e => setSelectedFolgeId(Number(e.target.value) || null)}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }}
          >
            <option value="">Folge wählen...</option>
            {folgen.map(f => (
              <option key={f.id} value={f.id}>Folge {f.folge_nummer}{f.folgen_titel ? ` — ${f.folgen_titel}` : ''}</option>
            ))}
          </select>

          {werkstufen.length > 0 && (
            <select
              value={selectedWerkId ?? ''}
              onChange={e => setSelectedWerkId(e.target.value || null)}
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }}
            >
              {werkstufen.map(w => (
                <option key={w.id} value={w.id}>{w.typ} v{w.version_nummer}{w.label ? ` (${w.label})` : ''}</option>
              ))}
            </select>
          )}

          <button
            onClick={() => window.print()}
            className="stat-no-print"
            style={{ marginLeft: 'auto', padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'none', color: 'var(--text)', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Printer size={14} /> Drucken / PDF
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 16px', gap: 0, overflowX: 'auto' }} className="stat-tabs">
          {TABS.map(t => {
            const Icon = t.icon
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer',
                  borderBottom: tab === t.id ? '2px solid var(--text)' : '2px solid transparent',
                  color: tab === t.id ? 'var(--text)' : 'var(--text-secondary)',
                  fontSize: 13, fontWeight: tab === t.id ? 600 : 400,
                  display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
                }}
              >
                <Icon size={14} />
                {t.label}
              </button>
            )
          })}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
          {!selectedWerkId ? (
            <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: 32 }}>
              Keine Werkstufe vorhanden
            </div>
          ) : (
            <>
              {tab === 'overview' && <OverviewTab werkId={selectedWerkId} />}
              {tab === 'repliken' && <ReplikenTab werkId={selectedWerkId} />}
              {tab === 'pairs' && <PairsTab werkId={selectedWerkId} />}
              {tab === 'motiv' && <MotivTab werkId={selectedWerkId} produktionId={produktionId} />}
              {tab === 'komparsen' && <KomparsenTab werkId={selectedWerkId} />}
              {tab === 'compare' && <CompareTab werkId={selectedWerkId} werkstufen={werkstufen} />}
            </>
          )}
        </div>
      </div>
    </AppShell>
  )
}

// ── Overview Tab ──────────────────────────────────────────────────────────
function OverviewTab({ werkId }: { werkId: string }) {
  const [data, setData] = useState<any>(null)
  useEffect(() => {
    api.getStatOverview(werkId).then(setData).catch(() => {})
  }, [werkId])

  if (!data) return <div style={{ color: 'var(--text-secondary)' }}>Laden...</div>

  const cards = [
    { label: 'Szenen', value: data.scenes.total, sub: data.scenes.wechselschnitt > 0 ? `davon ${data.scenes.wechselschnitt} Wechselschnitt` : undefined },
    { label: 'Figuren gesamt', value: data.characters.total },
    { label: 'Mit Text', value: data.characters.with_text, color: '#00C853' },
    { label: 'Mit Spiel', value: data.characters.with_spiel, color: '#007AFF' },
    { label: 'O.T.', value: data.characters.ot_only, color: '#757575' },
    { label: 'Repliken gesamt', value: data.repliken },
    { label: 'Stoppzeit', value: formatTime(data.stoppzeit_sek) },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
      {cards.map(c => (
        <div key={c.label} style={{ padding: '16px 14px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-surface)' }}>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{c.label}</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: c.color || 'var(--text)' }}>{c.value}</div>
          {c.sub && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{c.sub}</div>}
        </div>
      ))}
    </div>
  )
}

// ── Repliken Tab ──────────────────────────────────────────────────────────
function ReplikenTab({ werkId }: { werkId: string }) {
  const [data, setData] = useState<any[]>([])
  const [sortCol, setSortCol] = useState<string>('total_repliken')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [view, setView] = useState<'table' | 'chart'>('table')

  useEffect(() => {
    api.getStatCharacterRepliken(werkId).then(setData).catch(() => {})
  }, [werkId])

  const sorted = useMemo(() => {
    return [...data].sort((a, b) => {
      const av = Number(a[sortCol]) || 0, bv = Number(b[sortCol]) || 0
      return sortDir === 'desc' ? bv - av : av - bv
    })
  }, [data, sortCol, sortDir])

  const toggleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('desc') }
  }

  const SortIcon = ({ col }: { col: string }) =>
    sortCol === col ? (sortDir === 'desc' ? <ChevronDown size={12} /> : <ChevronUp size={12} />) : null

  const maxRepliken = Math.max(1, ...data.map(d => Number(d.total_repliken) || 0))

  return (
    <div>
      <div style={{ marginBottom: 12, display: 'flex', gap: 4 }}>
        <button onClick={() => setView('table')} style={{ ...iconBtn, background: view === 'table' ? 'var(--bg-subtle)' : 'none' }}><Table size={14} /></button>
        <button onClick={() => setView('chart')} style={{ ...iconBtn, background: view === 'chart' ? 'var(--bg-subtle)' : 'none' }}><BarChart2 size={14} /></button>
      </div>

      {view === 'chart' ? (
        <HBarChart
          items={sorted.slice(0, 30).map(r => ({
            label: r.character_name,
            value: Number(r.total_repliken),
            segments: [
              { value: Number(r.scenes_with_text), color: '#00C853', label: 'Text' },
              { value: Number(r.scenes_with_spiel), color: '#007AFF', label: 'Spiel' },
              { value: Number(r.scenes_ot), color: '#BDBDBD', label: 'O.T.' },
            ],
          }))}
          valueLabel="Repliken"
          segmentLabel="Szenen nach Typ"
        />
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border)' }}>
              <th style={thStyle}>Figur</th>
              <th style={{ ...thStyle, cursor: 'pointer' }} onClick={() => toggleSort('total_repliken')}>Repliken <SortIcon col="total_repliken" /></th>
              <th style={{ ...thStyle, cursor: 'pointer' }} onClick={() => toggleSort('scene_count')}>Szenen <SortIcon col="scene_count" /></th>
              <th style={{ ...thStyle, cursor: 'pointer' }} onClick={() => toggleSort('scenes_with_text')}>Text <SortIcon col="scenes_with_text" /></th>
              <th style={{ ...thStyle, cursor: 'pointer' }} onClick={() => toggleSort('scenes_with_spiel')}>Spiel <SortIcon col="scenes_with_spiel" /></th>
              <th style={{ ...thStyle, cursor: 'pointer' }} onClick={() => toggleSort('scenes_ot')}>O.T. <SortIcon col="scenes_ot" /></th>
              <th style={{ ...thStyle, width: 200 }}>Verteilung</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(r => (
              <tr key={r.character_id} style={{ borderBottom: '1px solid var(--border-subtle, var(--border))' }}>
                <td style={tdStyle}>{r.character_name}</td>
                <td style={{ ...tdStyle, fontWeight: 600 }}>{r.total_repliken}</td>
                <td style={tdStyle}>{r.scene_count}</td>
                <td style={tdStyle}><SpielBadge typ="text" count={r.scenes_with_text} /></td>
                <td style={tdStyle}><SpielBadge typ="spiel" count={r.scenes_with_spiel} /></td>
                <td style={tdStyle}><SpielBadge typ="o.t." count={r.scenes_ot} /></td>
                <td style={tdStyle}>
                  <div style={{ width: '100%', height: 12, background: 'var(--bg-subtle)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${(Number(r.total_repliken) / maxRepliken) * 100}%`, height: '100%', background: '#00C853', borderRadius: 4, transition: 'width 0.3s' }} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {data.length === 0 && <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-secondary)' }}>Keine Daten</div>}
    </div>
  )
}

// ── Pairs Tab ──────────────────────────────────────────────────────────
function PairsTab({ werkId }: { werkId: string }) {
  const [data, setData] = useState<any[]>([])

  useEffect(() => {
    api.getStatCharacterPairs(werkId).then(setData).catch(() => {})
  }, [werkId])

  const maxShared = Math.max(1, ...data.map(d => Number(d.shared_scenes) || 0))

  return (
    <div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)' }}>
            <th style={thStyle}>Figur A</th>
            <th style={thStyle}>Figur B</th>
            <th style={thStyle}>Gemeinsame Szenen</th>
            <th style={{ ...thStyle, width: 200 }}>Häufigkeit</th>
          </tr>
        </thead>
        <tbody>
          {data.map((r, i) => (
            <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle, var(--border))' }}>
              <td style={tdStyle}>{r.character_a}</td>
              <td style={tdStyle}>{r.character_b}</td>
              <td style={{ ...tdStyle, fontWeight: 600 }}>{r.shared_scenes}</td>
              <td style={tdStyle}>
                <div style={{ width: '100%', height: 12, background: 'var(--bg-subtle)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${(Number(r.shared_scenes) / maxShared) * 100}%`, height: '100%', background: '#007AFF', borderRadius: 4 }} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.length === 0 && <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-secondary)' }}>Keine Daten</div>}
    </div>
  )
}

// ── Motiv Tab ──────────────────────────────────────────────────────────
function MotivTab({ werkId, produktionId }: { werkId: string; produktionId: string }) {
  const [data, setData] = useState<any[]>([])
  const [mode, setMode] = useState<'werkstufe' | 'staffel'>('werkstufe')

  useEffect(() => {
    const params: Record<string, string> = mode === 'werkstufe'
      ? { werkstufe_id: werkId }
      : { produktion_id: produktionId }
    api.getStatMotivAuslastung(params).then(setData).catch(() => {})
  }, [werkId, produktionId, mode])

  return (
    <div>
      <div style={{ marginBottom: 12, display: 'flex', gap: 8 }}>
        <button onClick={() => setMode('werkstufe')} style={mode === 'werkstufe' ? pillActive : pill}>Diese Werkstufe</button>
        <button onClick={() => setMode('staffel')} style={mode === 'staffel' ? pillActive : pill}>Ganze Staffel</button>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)' }}>
            <th style={thStyle}>Motiv</th>
            <th style={thStyle}>I/E</th>
            <th style={thStyle}>Szenen</th>
            <th style={thStyle}>Stoppzeit</th>
            <th style={thStyle}>Figuren</th>
            {mode === 'staffel' && <th style={thStyle}>Folgen</th>}
          </tr>
        </thead>
        <tbody>
          {data.map((r, i) => (
            <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle, var(--border))' }}>
              <td style={tdStyle}>{r.ort_name}</td>
              <td style={tdStyle}>{r.int_ext}</td>
              <td style={{ ...tdStyle, fontWeight: 600 }}>{r.scene_count}</td>
              <td style={tdStyle}>{r.total_stoppzeit_sek ? formatTime(Number(r.total_stoppzeit_sek)) : '—'}</td>
              <td style={tdStyle}>{r.unique_characters}</td>
              {mode === 'staffel' && <td style={tdStyle}>{r.folgen_nummern?.join(', ')}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {data.length === 0 && <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-secondary)' }}>Keine Daten</div>}
    </div>
  )
}

// ── Komparsen Tab ──────────────────────────────────────────────────────────
function KomparsenTab({ werkId }: { werkId: string }) {
  const [data, setData] = useState<any>(null)

  useEffect(() => {
    api.getStatKomparsenBedarf({ werkstufe_id: werkId }).then(setData).catch(() => {})
  }, [werkId])

  if (!data) return <div style={{ color: 'var(--text-secondary)' }}>Laden...</div>

  return (
    <div>
      {data.summary?.length > 0 && (
        <div style={{ marginBottom: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
          {data.summary.map((s: any) => (
            <div key={s.folge_nummer} style={{ padding: '12px 14px', border: '1px solid var(--border)', borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Folge {s.folge_nummer}</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{s.total_headcount} Köpfe</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{s.unique_komparsen} Typen · {s.scenes_with_komparsen} Szenen</div>
            </div>
          ))}
        </div>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)' }}>
            <th style={thStyle}>Komparse</th>
            <th style={thStyle}>Anzahl</th>
            <th style={thStyle}>Szene</th>
            <th style={thStyle}>Motiv</th>
            <th style={thStyle}>Spiel</th>
            <th style={thStyle}>Repliken</th>
          </tr>
        </thead>
        <tbody>
          {data.details?.map((r: any, i: number) => (
            <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle, var(--border))' }}>
              <td style={tdStyle}>{r.komparse_name}</td>
              <td style={tdStyle}>{r.anzahl}</td>
              <td style={tdStyle}>{r.scene_nummer}</td>
              <td style={tdStyle}>{r.ort_name || '—'}</td>
              <td style={tdStyle}><SpielBadge typ={r.spiel_typ} /></td>
              <td style={tdStyle}>{r.repliken_anzahl || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {(!data.details || data.details.length === 0) && (
        <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-secondary)' }}>Keine Komparsen</div>
      )}
    </div>
  )
}

// ── Compare Tab ──────────────────────────────────────────────────────────
function CompareTab({ werkId, werkstufen }: { werkId: string; werkstufen: any[] }) {
  const [rightId, setRightId] = useState<string>('')
  const [data, setData] = useState<any>(null)

  const others = werkstufen.filter(w => w.id !== werkId)

  useEffect(() => {
    if (!werkId || !rightId) { setData(null); return }
    api.getStatVersionCompare(werkId, rightId).then(setData).catch(() => {})
  }, [werkId, rightId])

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Vergleich mit:</span>
        <select
          value={rightId}
          onChange={e => setRightId(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }}
        >
          <option value="">Werkstufe wählen...</option>
          {others.map(w => (
            <option key={w.id} value={w.id}>{w.typ} v{w.version_nummer}{w.label ? ` (${w.label})` : ''}</option>
          ))}
        </select>
      </div>

      {data?.comparison && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border)' }}>
              <th style={thStyle}>Figur</th>
              <th style={thStyle}>Szenen (links)</th>
              <th style={thStyle}>Szenen (rechts)</th>
              <th style={thStyle}>Δ Szenen</th>
              <th style={thStyle}>Repliken (links)</th>
              <th style={thStyle}>Repliken (rechts)</th>
              <th style={thStyle}>Δ Repliken</th>
            </tr>
          </thead>
          <tbody>
            {data.comparison.map((r: any) => (
              <tr key={r.character_id} style={{ borderBottom: '1px solid var(--border-subtle, var(--border))' }}>
                <td style={tdStyle}>{r.character_name}</td>
                <td style={tdStyle}>{r.left.scenes}</td>
                <td style={tdStyle}>{r.right.scenes}</td>
                <td style={{ ...tdStyle, fontWeight: 600, color: r.diff_scenes > 0 ? '#00C853' : r.diff_scenes < 0 ? '#FF3B30' : 'var(--text-secondary)' }}>
                  {r.diff_scenes > 0 ? `+${r.diff_scenes}` : r.diff_scenes}
                </td>
                <td style={tdStyle}>{r.left.repliken}</td>
                <td style={tdStyle}>{r.right.repliken}</td>
                <td style={{ ...tdStyle, fontWeight: 600, color: r.diff_repliken > 0 ? '#00C853' : r.diff_repliken < 0 ? '#FF3B30' : 'var(--text-secondary)' }}>
                  {r.diff_repliken > 0 ? `+${r.diff_repliken}` : r.diff_repliken}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!data && rightId && <div style={{ color: 'var(--text-secondary)' }}>Laden...</div>}
      {!rightId && <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-secondary)' }}>Zweite Werkstufe zum Vergleich wählen</div>}
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────

function SpielBadge({ typ, count }: { typ: string; count?: number | string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    'text': { bg: '#E8F5E9', text: '#2E7D32' },
    'spiel': { bg: '#E3F2FD', text: '#1565C0' },
    'o.t.': { bg: '#F5F5F5', text: '#757575' },
  }
  const c = colors[typ] || colors['o.t.']
  const label = count != null ? `${count}` : typ
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 4,
      fontSize: 11, fontWeight: 600, background: c.bg, color: c.text,
    }}>
      {label}
    </span>
  )
}

// ── HBarChart — SVG horizontal bar chart ──────────────────────────────
function HBarChart({ items, valueLabel, segmentLabel }: {
  items: { label: string; value: number; segments?: { value: number; color: string; label: string }[] }[]
  valueLabel?: string
  segmentLabel?: string
}) {
  const barH = 24
  const gap = 6
  const labelW = 140
  const valueW = 50
  const segW = 120
  const chartW = 400
  const totalW = labelW + valueW + chartW + segW + 40
  const totalH = items.length * (barH + gap) + 30
  const maxVal = Math.max(1, ...items.map(i => i.value))

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={totalW} height={totalH} style={{ display: 'block' }}>
        {/* Header */}
        <text x={labelW + valueW + chartW / 2} y={14} textAnchor="middle" fontSize={11} fill="var(--text-secondary)">{valueLabel || 'Wert'}</text>
        {segmentLabel && <text x={labelW + valueW + chartW + 20 + segW / 2} y={14} textAnchor="middle" fontSize={11} fill="var(--text-secondary)">{segmentLabel}</text>}

        {items.map((item, idx) => {
          const y = 24 + idx * (barH + gap)
          const w = (item.value / maxVal) * chartW

          // Stacked segments
          const segs = item.segments || []
          const segTotal = segs.reduce((s, seg) => s + seg.value, 0) || 1
          let segX = labelW + valueW + chartW + 20

          return (
            <g key={idx}>
              {/* Label */}
              <text x={labelW - 8} y={y + barH / 2 + 4} textAnchor="end" fontSize={12} fill="var(--text)" style={{ overflow: 'hidden' }}>
                {item.label.length > 18 ? item.label.slice(0, 16) + '...' : item.label}
              </text>
              {/* Value bar */}
              <rect x={labelW + valueW} y={y} width={w} height={barH} rx={4} fill="#00C853" opacity={0.85} />
              {/* Value label */}
              <text x={labelW + valueW - 6} y={y + barH / 2 + 4} textAnchor="end" fontSize={12} fontWeight={700} fill="var(--text)">{item.value}</text>
              {/* Segment stacked bar */}
              {segs.map((seg, si) => {
                const segWidth = (seg.value / segTotal) * segW
                const sx = segX
                segX += segWidth
                return (
                  <g key={si}>
                    <rect x={sx} y={y + 2} width={Math.max(0, segWidth - 1)} height={barH - 4} rx={3} fill={seg.color} opacity={0.85} />
                    {segWidth > 18 && (
                      <text x={sx + segWidth / 2} y={y + barH / 2 + 3} textAnchor="middle" fontSize={9} fontWeight={600} fill="#fff">{seg.value}</text>
                    )}
                  </g>
                )
              })}
            </g>
          )
        })}
      </svg>
      {/* Legend */}
      {items[0]?.segments && (
        <div style={{ display: 'flex', gap: 12, marginTop: 8, paddingLeft: labelW + valueW }}>
          {items[0].segments.map((s, i) => (
            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-secondary)' }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: s.color, display: 'inline-block' }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

const iconBtn: React.CSSProperties = {
  padding: 6, border: '1px solid var(--border)', borderRadius: 6,
  cursor: 'pointer', color: 'var(--text)', display: 'flex', alignItems: 'center',
}

const thStyle: React.CSSProperties = {
  textAlign: 'left', padding: '8px 10px', fontSize: 11, fontWeight: 600,
  color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px',
  whiteSpace: 'nowrap',
}
const tdStyle: React.CSSProperties = { padding: '8px 10px', verticalAlign: 'middle' }

const pill: React.CSSProperties = {
  padding: '5px 12px', borderRadius: 16, border: '1px solid var(--border)',
  background: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12,
}
const pillActive: React.CSSProperties = {
  ...pill, background: 'var(--text)', color: 'var(--bg)', borderColor: 'var(--text)',
}
