import { useState, useEffect, useMemo } from 'react'
import AppShell from '../components/AppShell'
import { api } from '../api/client'
import { useSelectedProduction } from '../contexts'
import { Printer } from 'lucide-react'

type ViewMode = 'block' | 'folge'

function formatTime(sek: number): string {
  const m = Math.floor(sek / 60)
  const s = sek % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function StatistikPage() {
  const { selectedProduction } = useSelectedProduction()
  const produktionId = selectedProduction?.id ?? null

  const [folgen, setFolgen] = useState<any[]>([])
  const [bloecke, setBloecke] = useState<any[]>([])
  const [mode, setMode] = useState<ViewMode>('block')
  const [selectedBlockIdx, setSelectedBlockIdx] = useState<number>(-1)
  const [selectedFolgeId, setSelectedFolgeId] = useState<number | null>(null)
  const [werkstufTyp, setWerkstufTyp] = useState('drehbuch')
  const [report, setReport] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  // Load folgen + bloecke
  useEffect(() => {
    if (!produktionId) return
    api.getFolgenV2(produktionId).then(setFolgen).catch(() => {})
    api.getBloecke(produktionId).then(b => {
      setBloecke(b || [])
      if (b?.length > 0) setSelectedBlockIdx(0)
    }).catch(() => setBloecke([]))
  }, [produktionId])

  // Auto-select first folge when in folge mode
  useEffect(() => {
    if (mode === 'folge' && folgen.length > 0 && !selectedFolgeId) {
      setSelectedFolgeId(folgen[0].id)
    }
  }, [mode, folgen, selectedFolgeId])

  // Determine which folge_ids to query
  const selectedFolgeIds = useMemo(() => {
    if (mode === 'block' && selectedBlockIdx >= 0 && bloecke[selectedBlockIdx]) {
      const block = bloecke[selectedBlockIdx]
      return folgen
        .filter(f => f.folge_nummer >= block.folge_von && f.folge_nummer <= block.folge_bis)
        .map(f => f.id)
    }
    if (mode === 'folge' && selectedFolgeId) {
      return [selectedFolgeId]
    }
    return []
  }, [mode, selectedBlockIdx, bloecke, selectedFolgeId, folgen])

  // Load report
  useEffect(() => {
    if (!produktionId || selectedFolgeIds.length === 0) { setReport(null); return }
    setLoading(true)
    api.getStatReport(produktionId, selectedFolgeIds, werkstufTyp)
      .then(setReport)
      .catch(() => setReport(null))
      .finally(() => setLoading(false))
  }, [produktionId, selectedFolgeIds, werkstufTyp])

  // Title for the report header
  const reportTitle = useMemo(() => {
    if (mode === 'block' && selectedBlockIdx >= 0 && bloecke[selectedBlockIdx]) {
      const b = bloecke[selectedBlockIdx]
      return `Block ${b.block_nummer} (Folgen ${b.folge_von}–${b.folge_bis})`
    }
    if (mode === 'folge' && selectedFolgeId) {
      const f = folgen.find(f => f.id === selectedFolgeId)
      if (f) return `Folge ${f.folge_nummer}${f.folgen_titel ? ` — ${f.folgen_titel}` : ''}`
    }
    return ''
  }, [mode, selectedBlockIdx, bloecke, selectedFolgeId, folgen])

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
        <div className="stat-no-print" style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Mode toggle */}
          <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
            <button
              onClick={() => setMode('block')}
              style={{
                padding: '6px 14px', border: 'none', cursor: 'pointer', fontSize: 13,
                background: mode === 'block' ? 'var(--text)' : 'var(--bg)',
                color: mode === 'block' ? 'var(--bg)' : 'var(--text)',
              }}
            >Block</button>
            <button
              onClick={() => setMode('folge')}
              style={{
                padding: '6px 14px', border: 'none', cursor: 'pointer', fontSize: 13,
                borderLeft: '1px solid var(--border)',
                background: mode === 'folge' ? 'var(--text)' : 'var(--bg)',
                color: mode === 'folge' ? 'var(--bg)' : 'var(--text)',
              }}
            >Folge</button>
          </div>

          {/* Block selector */}
          {mode === 'block' && bloecke.length > 0 && (
            <select
              value={selectedBlockIdx}
              onChange={e => setSelectedBlockIdx(Number(e.target.value))}
              style={selStyle}
            >
              {bloecke.map((b, i) => (
                <option key={i} value={i}>Block {b.block_nummer} ({b.folge_von}–{b.folge_bis})</option>
              ))}
            </select>
          )}
          {mode === 'block' && bloecke.length === 0 && (
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Keine Blöcke in ProdDB</span>
          )}

          {/* Folge selector */}
          {mode === 'folge' && (
            <select
              value={selectedFolgeId ?? ''}
              onChange={e => setSelectedFolgeId(Number(e.target.value) || null)}
              style={selStyle}
            >
              <option value="">Folge wählen...</option>
              {folgen.map(f => (
                <option key={f.id} value={f.id}>Folge {f.folge_nummer}{f.folgen_titel ? ` — ${f.folgen_titel}` : ''}</option>
              ))}
            </select>
          )}

          {/* Werkstufe type */}
          <select value={werkstufTyp} onChange={e => setWerkstufTyp(e.target.value)} style={selStyle}>
            <option value="drehbuch">Drehbuch</option>
            <option value="treatment">Treatment</option>
            <option value="storyline">Storyline</option>
          </select>

          <button
            onClick={() => window.print()}
            style={{ marginLeft: 'auto', padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'none', color: 'var(--text)', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Printer size={14} /> Drucken / PDF
          </button>
        </div>

        {/* Report */}
        <div style={{ flex: 1, overflow: 'auto', padding: '24px 32px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 48 }}>Laden...</div>
          ) : !report ? (
            <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 48 }}>
              {selectedFolgeIds.length === 0 ? 'Bitte Block oder Folge wählen' : 'Keine Daten'}
            </div>
          ) : (
            <ReportView report={report} title={reportTitle} />
          )}
        </div>
      </div>
    </AppShell>
  )
}

// ── Report View ────────────────────────────────────────────────────────────
function ReportView({ report, title }: { report: any; title: string }) {
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Statistiken</h1>
      {title && <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 24 }}>{title}</div>}

      {/* Summary */}
      <Section>
        <SummaryRow label="Bilder insgesamt" value={report.bilder_insgesamt} />
        <SummaryRow label="Anzahl Drehbuchseiten" value={report.drehbuchseiten_display || '0'} />
        <SummaryRow label="Vorstopp (mm:ss)" value={formatTime(report.vorstopp_sek || 0)} />
      </Section>

      {/* Per-Folge breakdown (only for blocks with multiple folgen) */}
      {report.folgen?.length > 1 && (
        <Section title="Pro Folge">
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Folge</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Bilder</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Seiten</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Vorstopp</th>
              </tr>
            </thead>
            <tbody>
              {report.folgen.map((f: any) => (
                <tr key={f.folge_nummer}>
                  <td style={tdStyle}>{f.folge_nummer}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{f.bilder}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{f.seiten_display}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{formatTime(f.vorstopp_sek)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {/* Rollen pro Bild */}
      {report.rollen_pro_bild?.length > 0 && (
        <Section title="Rollen pro Bild">
          {report.rollen_pro_bild.map((r: any) => (
            <div key={r.rollen_count} style={listRow}>
              <span style={countBadge}>{r.bilder_count}x</span>
              <span>Bilder mit {r.rollen_count} {r.rollen_count === 1 ? 'Rolle' : 'Rollen'}</span>
            </div>
          ))}
        </Section>
      )}

      {/* Rollen */}
      {report.rollen?.length > 0 && (
        <Section title="Rollen">
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: 50 }}>#</th>
                <th style={thStyle}>Rolle</th>
                <th style={thStyle}>Darsteller:in</th>
                <th style={thStyle}>Bilder</th>
              </tr>
            </thead>
            <tbody>
              {report.rollen.map((r: any, i: number) => (
                <tr key={i}>
                  <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>{r.scene_count}x</td>
                  <td style={{ ...tdStyle, fontWeight: 500 }}>{r.character_name}</td>
                  <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>{r.darsteller_name || '—'}</td>
                  <td style={{ ...tdStyle, fontSize: 11, color: 'var(--text-secondary)', maxWidth: 300 }}>
                    <SceneRefs scenes={r.scenes} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {/* Motive */}
      {report.motive?.length > 0 && (
        <Section title="Motive">
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: 50 }}>#</th>
                <th style={thStyle}>Motiv</th>
                <th style={thStyle}>Drehort</th>
                <th style={thStyle}>Bilder</th>
              </tr>
            </thead>
            <tbody>
              {report.motive.map((m: any, i: number) => (
                <tr key={i}>
                  <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>{m.scene_count}x</td>
                  <td style={{ ...tdStyle, fontWeight: 500 }}>{m.name}</td>
                  <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>{m.drehort}</td>
                  <td style={{ ...tdStyle, fontSize: 11, color: 'var(--text-secondary)', maxWidth: 300 }}>
                    <SceneRefs scenes={m.scenes} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {/* Drehorte */}
      {report.drehorte?.length > 0 && (
        <Section title="Drehorte">
          {report.drehorte.map((d: any, i: number) => (
            <div key={i} style={{ ...listRow, justifyContent: 'space-between' }}>
              <span><span style={countBadge}>{d.scene_count}x</span> {d.name}</span>
            </div>
          ))}
        </Section>
      )}
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────

function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      {title && <h2 style={{ fontSize: 14, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>{title}</h2>}
      {children}
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-subtle, var(--border))' }}>
      <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>{label}</span>
      <span style={{ fontWeight: 600, fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  )
}

function SceneRefs({ scenes }: { scenes: string[] }) {
  if (!scenes || scenes.length === 0) return <span>—</span>
  const display = scenes.length > 12 ? scenes.slice(0, 12).join(', ') + ', ...' : scenes.join(', ')
  return <span title={scenes.join(', ')} style={{ wordBreak: 'break-all' }}>{display}</span>
}

// ── Styles ──────────────────────────────────────────────────────────────────

const selStyle: React.CSSProperties = {
  padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)',
  background: 'var(--bg)', color: 'var(--text)', fontSize: 13,
}

const tableStyle: React.CSSProperties = {
  width: '100%', borderCollapse: 'collapse', fontSize: 13,
}

const thStyle: React.CSSProperties = {
  textAlign: 'left', padding: '6px 10px', fontSize: 11, fontWeight: 600,
  color: 'var(--text-secondary)', borderBottom: '2px solid var(--border)', whiteSpace: 'nowrap',
}

const tdStyle: React.CSSProperties = {
  padding: '6px 10px', verticalAlign: 'top',
  borderBottom: '1px solid var(--border-subtle, var(--border))',
}

const listRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: 14,
}

const countBadge: React.CSSProperties = {
  display: 'inline-block', minWidth: 36, textAlign: 'right', fontWeight: 600,
  fontVariantNumeric: 'tabular-nums', marginRight: 4,
}
