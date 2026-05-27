import { useState, useEffect, useCallback } from 'react'
import { Copy, Check, RefreshCw, ChevronDown, ChevronRight, Clock, Database } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import AppShell from '../components/AppShell'
import { useSelectedProduction } from '../contexts'
import { productionLabel } from '../hooks/useProduction'

// ── Typen ─────────────────────────────────────────────────────────────────────

interface Block {
  block_nummer: number
  folge_von: number
  folge_bis: number
  dreh_von?: string | null
  dreh_bis?: string | null
}

interface MethodResult {
  method: string
  method_version: string
  status: 'completed' | 'error' | 'running'
  markdown?: string
  error_detail?: string
  from_cache: boolean
  duration_ms?: number
}

interface PreviousRun {
  id: string
  block_nummer: number
  status: string
  created_at: string
  method_results: MethodResult[]
}

const METHOD_LABELS: Record<string, { label: string; desc: string; cost: string; disabled?: boolean }> = {
  story_consultant_pur: {
    label: 'Story-Consultant Pur',
    desc: 'Praktiker-Analyse ohne dramaturgische Theorie — unvoreingenommenes Urteil',
    cost: '~2 €',
  },
  story_consultant_framework: {
    label: 'Story-Consultant Framework',
    desc: 'Analyse mit drei Dramaturgie-Modellen (Reagan-Arcs, Toubia-Semantik, Rocchi-Isotopien)',
    cost: '~2 €',
  },
  strang_heatmap: {
    label: 'Strang-Heatmap',
    desc: 'Visualisierung der Strang-Verteilung über Folgen und Szenen',
    cost: '~0,50 €',
    disabled: true,
  },
  figuren_agency: {
    label: 'Figuren-Agency-Matrix',
    desc: 'Wer trifft Entscheidungen? Wer reagiert nur?',
    cost: '~0,50 €',
    disabled: true,
  },
  vonnegut_arcs: {
    label: 'Vonnegut-Arcs',
    desc: 'Emotionale Kurven der Stränge über den Block',
    cost: '~0,50 €',
    disabled: true,
  },
}

const ALL_METHODS = Object.keys(METHOD_LABELS)
const ACTIVE_METHODS = ALL_METHODS.filter(m => !METHOD_LABELS[m].disabled)

// ── Hilfsfunktionen ────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  return new Date(d).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })
}

function fmtDuration(ms?: number) {
  if (!ms) return ''
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(1)} s`
}

// ── Unterkomponenten ──────────────────────────────────────────────────────────

function MarkdownResult({ markdown }: { markdown: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(markdown).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={handleCopy}
        style={{
          position: 'absolute', top: 0, right: 0,
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '4px 10px', borderRadius: 6,
          border: '1px solid var(--border)',
          background: 'var(--bg-subtle)', cursor: 'pointer',
          fontSize: 11, color: 'var(--text-secondary)',
        }}
      >
        {copied ? <Check size={12} /> : <Copy size={12} />}
        {copied ? 'Kopiert' : 'Kopieren'}
      </button>
      <div style={{
        paddingTop: 32,
        fontSize: 13,
        lineHeight: 1.7,
        color: 'var(--text-primary)',
      }}>
        <ReactMarkdown
          components={{
            h1: ({ children }) => <h1 style={{ fontSize: 18, fontWeight: 700, margin: '20px 0 10px', borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>{children}</h1>,
            h2: ({ children }) => <h2 style={{ fontSize: 15, fontWeight: 700, margin: '18px 0 8px' }}>{children}</h2>,
            h3: ({ children }) => <h3 style={{ fontSize: 13, fontWeight: 600, margin: '14px 0 6px' }}>{children}</h3>,
            p:  ({ children }) => <p style={{ margin: '6px 0' }}>{children}</p>,
            ul: ({ children }) => <ul style={{ paddingLeft: 20, margin: '6px 0' }}>{children}</ul>,
            ol: ({ children }) => <ol style={{ paddingLeft: 20, margin: '6px 0' }}>{children}</ol>,
            li: ({ children }) => <li style={{ marginBottom: 3 }}>{children}</li>,
            strong: ({ children }) => <strong style={{ fontWeight: 600 }}>{children}</strong>,
            table: ({ children }) => (
              <div style={{ overflowX: 'auto', margin: '12px 0' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>{children}</table>
              </div>
            ),
            th: ({ children }) => (
              <th style={{ border: '1px solid var(--border)', padding: '6px 10px', background: 'var(--bg-subtle)', fontWeight: 600, textAlign: 'left' }}>{children}</th>
            ),
            td: ({ children }) => (
              <td style={{ border: '1px solid var(--border)', padding: '6px 10px' }}>{children}</td>
            ),
            blockquote: ({ children }) => (
              <blockquote style={{ borderLeft: '3px solid var(--border)', margin: '8px 0', paddingLeft: 12, color: 'var(--text-secondary)' }}>{children}</blockquote>
            ),
            code: ({ children, className }) => {
              const isBlock = className?.startsWith('language-')
              if (isBlock) return (
                <pre style={{ background: 'var(--bg-subtle)', padding: '10px 14px', borderRadius: 6, overflowX: 'auto', fontSize: 12, margin: '8px 0' }}>
                  <code>{children}</code>
                </pre>
              )
              return <code style={{ background: 'var(--bg-subtle)', padding: '1px 5px', borderRadius: 3, fontSize: 12 }}>{children}</code>
            },
          }}
        >
          {markdown}
        </ReactMarkdown>
      </div>
    </div>
  )
}

function MethodBadge({ method, fromCache }: { method: string; fromCache: boolean }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 10, padding: '2px 6px', borderRadius: 4,
      background: fromCache ? 'rgba(0,200,83,0.1)' : 'rgba(0,122,255,0.1)',
      color: fromCache ? '#00C853' : '#007AFF',
    }}>
      {fromCache ? <Database size={9} /> : <RefreshCw size={9} />}
      {fromCache ? 'Aus Cache' : 'Neu berechnet'}
    </span>
  )
}

// ── Hauptseite ────────────────────────────────────────────────────────────────

export default function AnalysisPage() {
  const { selectedProduction } = useSelectedProduction()

  const selectedProdId = selectedProduction?.id ?? ''
  const [blocks, setBlocks]     = useState<Block[]>([])
  const [blockNr, setBlockNr]   = useState<number | null>(null)
  const [ersterBlock, setErsterBlock] = useState<number>(1)
  const [methods, setMethods]   = useState<string[]>(['story_consultant_pur'])
  const [running, setRunning]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [results, setResults]   = useState<MethodResult[] | null>(null)
  const [activeTab, setActiveTab] = useState<string | null>(null)
  const [prevRuns, setPrevRuns] = useState<PreviousRun[]>([])
  const [expandedRun, setExpandedRun] = useState<string | null>(null)

  // Blöcke laden wenn Produktion gewechselt
  useEffect(() => {
    setResults(null)
    if (!selectedProdId) { setBlocks([]); setBlockNr(null); return }
    fetch(`/api/produktionen/${encodeURIComponent(selectedProdId)}/bloecke`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then((data: any) => {
        const blocksArr: Block[] = data.bloecke || data || []
        setBlocks(blocksArr)
        const firstBlockNr = blocksArr[0]?.block_nummer ?? 1
        setErsterBlock(firstBlockNr)
        setBlockNr(blocksArr.length > 0 ? firstBlockNr : null)
      })
      .catch(() => setBlocks([]))
  }, [selectedProdId])

  // Vorherige Runs laden
  const loadPrevRuns = useCallback(() => {
    if (!selectedProdId || blockNr == null) return
    fetch(`/api/analysis/block/${encodeURIComponent(selectedProdId)}/${blockNr}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(setPrevRuns)
      .catch(() => {})
  }, [selectedProdId, blockNr])

  useEffect(() => { loadPrevRuns() }, [loadPrevRuns])

  const toggleMethod = (m: string) => {
    setMethods(prev =>
      prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]
    )
  }

  const estimatedCost = methods.reduce((sum, m) => {
    const match = METHOD_LABELS[m]?.cost?.match(/[\d,.]+/)
    return sum + (match ? parseFloat(match[0].replace(',', '.')) : 0)
  }, 0)

  const handleRun = async () => {
    if (!selectedProdId || blockNr == null || methods.length === 0) return
    setRunning(true)
    setError(null)
    setResults(null)
    setActiveTab(methods[0])
    try {
      const resp = await fetch('/api/analysis/run', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ produktion_id: selectedProdId, block_nummer: blockNr, methods }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`)
      setResults(data.method_results)
      setActiveTab(data.method_results?.[0]?.method || null)
      loadPrevRuns()
    } catch (e: any) {
      setError(e.message || String(e))
    } finally {
      setRunning(false)
    }
  }

  const blockIndex = blockNr != null ? blockNr - ersterBlock : -1
  const blockInfo = blockIndex >= 0 && blockIndex < blocks.length ? blocks[blockIndex] : null

  return (
    <AppShell>
      <div style={{ padding: '24px 28px', maxWidth: 1100, margin: '0 auto' }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>Analyse-Editor</h2>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 24px' }}>
          KI-gestützte dramaturgische Analyse eines Blocks (Methoden 1–2 aktiv, 3–5 ab Phase 3)
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 24, alignItems: 'start' }}>

          {/* ── Linke Spalte: Konfiguration ────────────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Produktion */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', marginBottom: 10 }}>
                Produktion &amp; Block
              </div>

              {selectedProduction ? (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {productionLabel(selectedProduction)}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                    Produktion wechseln: oben in der AppShell
                  </div>
                </div>
              ) : (
                <div style={{
                  marginBottom: 12, padding: '8px 10px', borderRadius: 6,
                  border: '1px solid var(--border)', background: 'rgba(255,204,0,0.08)',
                  fontSize: 12, color: 'var(--text-secondary)',
                }}>
                  Keine Produktion gewählt — bitte oben in der AppShell auswählen.
                </div>
              )}

              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Block-Nummer</label>
              <select
                value={blockNr ?? ''}
                onChange={e => { setBlockNr(e.target.value ? Number(e.target.value) : null); setResults(null) }}
                disabled={blocks.length === 0}
                style={{
                  width: '100%', padding: '8px 10px', borderRadius: 6,
                  border: '1px solid var(--border)', background: 'var(--bg-subtle)',
                  fontSize: 13, color: 'var(--text-primary)',
                  opacity: blocks.length === 0 ? 0.5 : 1,
                }}
              >
                {blocks.length === 0 && <option value="">— Keine Blöcke —</option>}
                {blocks.map((b) => (
                  <option key={b.block_nummer} value={b.block_nummer}>
                    Block {b.block_nummer} (Folge {b.folge_von}–{b.folge_bis})
                  </option>
                ))}
              </select>

              {blockInfo && (
                <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  Folgen {blockInfo.folge_von}–{blockInfo.folge_bis}
                  {blockInfo.dreh_von && (
                    <span style={{ marginLeft: 8 }}>
                      · Dreh: {blockInfo.dreh_von}{blockInfo.dreh_bis ? ` – ${blockInfo.dreh_bis}` : ''}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Methoden */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', marginBottom: 10 }}>
                Methoden
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {ALL_METHODS.map(m => {
                  const meta = METHOD_LABELS[m]
                  const isDisabled = !!meta.disabled
                  const isSelected = methods.includes(m)
                  return (
                    <label
                      key={m}
                      style={{
                        display: 'flex', gap: 10, padding: '10px 12px',
                        borderRadius: 8, cursor: isDisabled ? 'not-allowed' : 'pointer',
                        border: `1px solid ${isSelected && !isDisabled ? 'var(--color-primary, #007AFF)' : 'var(--border)'}`,
                        background: isSelected && !isDisabled ? 'rgba(0,122,255,0.05)' : 'transparent',
                        opacity: isDisabled ? 0.45 : 1,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected && !isDisabled}
                        disabled={isDisabled}
                        onChange={() => !isDisabled && toggleMethod(m)}
                        style={{ marginTop: 2, accentColor: '#007AFF' }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                          <span>{meta.label}</span>
                          <span style={{ color: isDisabled ? 'var(--text-secondary)' : '#00C853', fontWeight: 500, whiteSpace: 'nowrap' }}>
                            {isDisabled ? 'ab Phase 3' : meta.cost}
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.4 }}>
                          {meta.desc}
                        </div>
                      </div>
                    </label>
                  )
                })}
              </div>

              {methods.filter(m => !METHOD_LABELS[m]?.disabled).length > 0 && (
                <div style={{
                  marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  fontSize: 12,
                }}>
                  <span style={{ color: 'var(--text-secondary)' }}>
                    Geschätzte Kosten
                  </span>
                  <span style={{ fontWeight: 600 }}>
                    ~{estimatedCost.toFixed(2).replace('.', ',')} €
                  </span>
                </div>
              )}
            </div>

            {/* Run-Button */}
            <button
              onClick={handleRun}
              disabled={running || !selectedProdId || blockNr == null || methods.length === 0}
              style={{
                padding: '12px 20px', borderRadius: 8, border: 'none',
                background: running || !selectedProdId || blockNr == null || methods.length === 0
                  ? 'var(--border)' : '#000',
                color: running || !selectedProdId || blockNr == null || methods.length === 0
                  ? 'var(--text-secondary)' : '#fff',
                fontWeight: 600, fontSize: 14, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'opacity 0.15s',
              }}
            >
              {running ? (
                <>
                  <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} />
                  Claude analysiert ... (~90 s/Methode)
                </>
              ) : (
                'Analyse starten'
              )}
            </button>

            {error && (
              <div style={{
                padding: '10px 14px', borderRadius: 8,
                background: 'rgba(255,59,48,0.1)', color: '#FF3B30',
                fontSize: 12, lineHeight: 1.5,
              }}>
                {error}
              </div>
            )}
          </div>

          {/* ── Rechte Spalte: Ergebnisse ─────────────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Aktueller Run */}
            {results && results.length > 0 && (
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                {/* Tabs */}
                <div style={{
                  display: 'flex', borderBottom: '1px solid var(--border)',
                  background: 'var(--bg-subtle)',
                }}>
                  {results.map(r => (
                    <button
                      key={r.method}
                      onClick={() => setActiveTab(r.method)}
                      style={{
                        padding: '10px 16px', border: 'none', background: 'none',
                        cursor: 'pointer', fontSize: 12, fontWeight: activeTab === r.method ? 600 : 400,
                        borderBottom: activeTab === r.method ? '2px solid #000' : '2px solid transparent',
                        color: activeTab === r.method ? 'var(--text-primary)' : 'var(--text-secondary)',
                        display: 'flex', alignItems: 'center', gap: 6,
                      }}
                    >
                      {METHOD_LABELS[r.method]?.label || r.method}
                      {r.status === 'error' && (
                        <span style={{ color: '#FF3B30', fontSize: 10 }}>Fehler</span>
                      )}
                    </button>
                  ))}
                </div>

                {/* Aktiver Tab Inhalt */}
                {results.filter(r => r.method === activeTab).map(r => (
                  <div key={r.method} style={{ padding: 20 }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
                      <MethodBadge method={r.method} fromCache={r.from_cache} />
                      {r.duration_ms && (
                        <span style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 3 }}>
                          <Clock size={10} /> {fmtDuration(r.duration_ms)}
                        </span>
                      )}
                    </div>
                    {r.status === 'error' ? (
                      <div style={{ color: '#FF3B30', fontSize: 13 }}>
                        Fehler: {r.error_detail}
                      </div>
                    ) : r.markdown ? (
                      <MarkdownResult markdown={r.markdown} />
                    ) : (
                      <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Kein Ergebnis</div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Leer-Zustand */}
            {!results && !running && (
              <div style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10,
                padding: 48, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13,
              }}>
                Produktion und Block wählen, Methoden auswählen, dann "Analyse starten".
              </div>
            )}

            {/* Loading */}
            {running && (
              <div style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10,
                padding: 48, textAlign: 'center', fontSize: 13,
              }}>
                <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite', marginBottom: 12, opacity: 0.4 }} />
                <div style={{ fontWeight: 600 }}>Claude analysiert den Block ...</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 6 }}>
                  Erwartet ca. 90 Sekunden pro Methode. Seite nicht schließen.
                </div>
              </div>
            )}

            {/* Vorherige Runs */}
            {prevRuns.length > 0 && (
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-subtle)' }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>Frühere Analysen</span>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 8 }}>
                    {prevRuns.length} Run{prevRuns.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div>
                  {prevRuns.map(run => {
                    const isExpanded = expandedRun === run.id
                    return (
                      <div key={run.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <button
                          onClick={() => setExpandedRun(isExpanded ? null : run.id)}
                          style={{
                            width: '100%', padding: '10px 16px', border: 'none', background: 'none',
                            cursor: 'pointer', textAlign: 'left',
                            display: 'flex', alignItems: 'center', gap: 10,
                          }}
                        >
                          {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                            {fmtDate(run.created_at)}
                          </span>
                          <span style={{ flex: 1, fontSize: 12 }}>
                            {run.method_results.map(mr => METHOD_LABELS[mr.method]?.label || mr.method).join(', ')}
                          </span>
                          <span style={{
                            fontSize: 10, padding: '2px 6px', borderRadius: 4,
                            background: run.status === 'completed' ? 'rgba(0,200,83,0.1)' : 'rgba(255,59,48,0.1)',
                            color: run.status === 'completed' ? '#00C853' : '#FF3B30',
                          }}>
                            {run.status === 'completed' ? 'OK' : run.status}
                          </span>
                        </button>
                        {isExpanded && (
                          <div style={{ padding: '0 16px 16px' }}>
                            {run.method_results.map(mr => (
                              <div key={mr.method} style={{ marginBottom: 16 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                                  {METHOD_LABELS[mr.method]?.label || mr.method}
                                  <MethodBadge method={mr.method} fromCache={mr.from_cache} />
                                  {mr.duration_ms && (
                                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                                      {fmtDuration(mr.duration_ms)}
                                    </span>
                                  )}
                                </div>
                                {mr.status === 'error' ? (
                                  <div style={{ color: '#FF3B30', fontSize: 12 }}>{mr.error_detail}</div>
                                ) : mr.markdown ? (
                                  <MarkdownResult markdown={mr.markdown} />
                                ) : null}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @media (max-width: 768px) {
          .analysis-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </AppShell>
  )
}
