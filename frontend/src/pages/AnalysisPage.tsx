import { useState, useEffect, useRef, useCallback } from 'react'
import { Copy, Check, RefreshCw, ChevronRight, ChevronLeft, Clock, Database, Plus, X, Trash2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import AppShell from '../components/AppShell'
import { useSelectedProduction } from '../contexts'
import { api } from '../api/client'

// ── Typen ─────────────────────────────────────────────────────────────────────

interface Block {
  proddb_id: string
  block_nummer: number
  folge_von: number
  folge_bis: number
  dreh_von?: string | null
  dreh_bis?: string | null
}

interface WerkstufInfo {
  typ: string
  version_nummer: number
  label: string | null
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

interface RunData {
  id: string
  block_nummer: number
  folge_nummer: number | null
  status: 'queued' | 'running' | 'completed' | 'error'
  created_at: string
  method_results: MethodResult[]
  werkstufen_info: WerkstufInfo[]
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

const WERKSTUFE_ABBR: Record<string, string> = {
  drehbuch: 'DB', storyline: 'SL', notiz: 'NO', treatment: 'TR', expose: 'EX',
}

const ALL_METHODS = Object.keys(METHOD_LABELS)
const POLL_INTERVAL_MS = 4000
const POLL_STORAGE_KEY = 'analysis_polling_run_id'
const DEFAULT_SIDEBAR_WIDTH = 274

// ── Hilfsfunktionen ────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  return new Date(d).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })
}

function fmtDuration(ms?: number) {
  if (!ms) return ''
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(1)} s`
}

function statusLabel(status: string) {
  if (status === 'queued') return 'In Warteschlange …'
  if (status === 'running') return 'Claude analysiert …'
  return status
}

/** Kompakte Werkstufen-Zusammenfassung: "DB v3 · Lüneburg" oder "DB v2–v4" */
function fmtWerkstufen(ws: WerkstufInfo[]): string {
  if (!ws || ws.length === 0) return ''
  // Alle gleicher Typ?
  const typen = [...new Set(ws.map(w => w.typ))]
  const abbr = typen.map(t => WERKSTUFE_ABBR[t] ?? t).join('/')
  const versions = ws.map(w => w.version_nummer).sort((a, b) => a - b)
  const vMin = versions[0], vMax = versions[versions.length - 1]
  const vStr = vMin === vMax ? `v${vMin}` : `v${vMin}–${vMax}`
  // Label: nur wenn alle gleich
  const labels = [...new Set(ws.map(w => w.label).filter(Boolean))]
  const labelStr = labels.length === 1 ? ` · ${labels[0]}` : ''
  return `${abbr} ${vStr}${labelStr}`
}

function getChildText(node: React.ReactNode): string {
  if (!node) return ''
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(getChildText).join('')
  if (typeof node === 'object' && 'props' in (node as object)) {
    return getChildText((node as React.ReactElement).props.children)
  }
  return ''
}

// ── Beat-Bewertungs-Chip ───────────────────────────────────────────────────────

function BewertungsChip({ text }: { text: string }) {
  let bg = '', color = '', label = text
  const t = text.trim()
  if (/^Behalten/i.test(t)) { bg = 'rgba(0,200,83,0.12)'; color = '#00a844' }
  else if (/^Kürzen/i.test(t)) { bg = 'rgba(255,149,0,0.13)'; color = '#b86e00' }
  else if (/^Streichen/i.test(t)) { bg = 'rgba(255,59,48,0.12)'; color = '#cc2a1e' }

  if (!bg) return <>{text}</>

  // Hauptwort und Rest trennen (z.B. "Behalten — präziser Auftakt")
  const dash = t.indexOf('—')
  const main = dash > 0 ? t.slice(0, dash).trim() : t
  const rest = dash > 0 ? t.slice(dash + 1).trim() : ''

  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 3 }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        background: bg, color,
        padding: '2px 7px', borderRadius: 4,
        fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
      }}>
        {main}
      </span>
      {rest && <span style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{rest}</span>}
    </span>
  )
}

// ── MarkdownResult ─────────────────────────────────────────────────────────────

function MarkdownResult({ markdown }: { markdown: string }) {
  const [copied, setCopied] = useState(false)

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => navigator.clipboard.writeText(markdown).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })}
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

      <div style={{ paddingTop: 32, fontSize: 13, lineHeight: 1.7, color: 'var(--text-primary)' }}>
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
              <div style={{ overflowX: 'auto', margin: '16px 0' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>{children}</table>
              </div>
            ),
            thead: ({ children }) => <thead>{children}</thead>,
            tbody: ({ children }) => <tbody>{children}</tbody>,
            tr: ({ children }) => (
              <tr
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-subtle)')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}
              >{children}</tr>
            ),
            th: ({ children }) => (
              <th style={{
                border: '1px solid var(--border)', padding: '7px 12px',
                background: 'var(--bg-subtle)', fontWeight: 600, textAlign: 'left',
                whiteSpace: 'nowrap', fontSize: 11, letterSpacing: '0.03em',
                color: 'var(--text-secondary)',
              }}>{children}</th>
            ),
            td: ({ children, node }: any) => {
              const getRaw = (n: any): string => {
                if (!n) return ''
                if (n.type === 'text') return n.value ?? ''
                if (Array.isArray(n)) return n.map(getRaw).join('')
                if (n.children) return n.children.map(getRaw).join('')
                return ''
              }
              const rawText = getRaw(node).trim()
              const isBewertung = /^(Behalten|Kürzen|Streichen)/i.test(rawText)
              return (
                <td style={{ border: '1px solid var(--border)', padding: '6px 12px', verticalAlign: 'top' }}>
                  {isBewertung ? <BewertungsChip text={rawText} /> : children}
                </td>
              )
            },
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

// ── MethodBadge ────────────────────────────────────────────────────────────────

function MethodBadge({ fromCache }: { fromCache: boolean }) {
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

// ── ReportView ─────────────────────────────────────────────────────────────────

function ReportView({ run, activeTab, onTabChange }: {
  run: RunData
  activeTab: string | null
  onTabChange: (tab: string) => void
}) {
  const currentTab = activeTab ?? run.method_results[0]?.method ?? null
  const result = run.method_results.find(r => r.method === currentTab)

  const scopeLabel = run.folge_nummer != null
    ? `Folge ${run.folge_nummer}`
    : `Block ${run.block_nummer}`
  const wsLabel = fmtWerkstufen(run.werkstufen_info ?? [])

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>

      {/* Report-Header */}
      <div style={{
        padding: '10px 20px', borderBottom: '1px solid var(--border)',
        background: 'var(--bg-subtle)', flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      }}>
        <span style={{ fontWeight: 700, fontSize: 13 }}>{scopeLabel}</span>
        {wsLabel && (
          <span style={{
            fontSize: 11, padding: '2px 7px', borderRadius: 4,
            background: 'rgba(0,122,255,0.08)', color: '#007AFF',
          }}>{wsLabel}</span>
        )}
        <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 'auto' }}>
          {fmtDate(run.created_at)}
        </span>
      </div>

      {/* Tab-Leiste */}
      {run.method_results.length > 1 && (
        <div style={{
          display: 'flex', borderBottom: '1px solid var(--border)',
          background: 'var(--bg-surface, var(--bg-card))', flexShrink: 0,
        }}>
          {run.method_results.map(r => (
            <button
              key={r.method}
              onClick={() => onTabChange(r.method)}
              style={{
                padding: '9px 16px', border: 'none', background: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: currentTab === r.method ? 600 : 400,
                borderBottom: currentTab === r.method ? '2px solid var(--text-primary)' : '2px solid transparent',
                color: currentTab === r.method ? 'var(--text-primary)' : 'var(--text-secondary)',
                display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
              }}
            >
              {METHOD_LABELS[r.method]?.label || r.method}
              {r.status === 'error' && <span style={{ color: '#FF3B30', fontSize: 10 }}>Fehler</span>}
            </button>
          ))}
        </div>
      )}

      {/* Inhalt */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>
        {result ? (
          <>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
              <MethodBadge fromCache={result.from_cache} />
              {result.duration_ms && (
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 3 }}>
                  <Clock size={10} /> {fmtDuration(result.duration_ms)}
                </span>
              )}
            </div>
            {result.status === 'error' ? (
              <div style={{ padding: '12px 16px', borderRadius: 8, background: 'rgba(255,59,48,0.08)', color: '#FF3B30', fontSize: 13, lineHeight: 1.5 }}>
                Fehler: {result.error_detail}
              </div>
            ) : result.markdown ? (
              <MarkdownResult markdown={result.markdown} />
            ) : (
              <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Kein Ergebnis vorhanden.</div>
            )}
          </>
        ) : (
          <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Kein Ergebnis ausgewählt.</div>
        )}
      </div>
    </div>
  )
}

// ── MethodenModal ──────────────────────────────────────────────────────────────

function MethodenModal({
  methods, onChange, onStart, onClose, submitting, error, blockInfo, scope, selectedFolgeNummer,
}: {
  methods: string[]
  onChange: (m: string[]) => void
  onStart: () => void
  onClose: () => void
  submitting: boolean
  error: string | null
  blockInfo: Block | null
  scope: 'block' | 'folge'
  selectedFolgeNummer: number | null
}) {
  const toggle = (m: string) =>
    onChange(methods.includes(m) ? methods.filter(x => x !== m) : [...methods, m])

  const activeMethods = methods.filter(m => !METHOD_LABELS[m]?.disabled)
  const estimatedCost = activeMethods.reduce((sum, m) => {
    const match = METHOD_LABELS[m]?.cost?.match(/[\d,.]+/)
    return sum + (match ? parseFloat(match[0].replace(',', '.')) : 0)
  }, 0)

  const scopeLabel = scope === 'folge' && selectedFolgeNummer != null
    ? `Folge ${selectedFolgeNummer}`
    : blockInfo ? `Block ${blockInfo.block_nummer} (Folge ${blockInfo.folge_von}–${blockInfo.folge_bis})` : ''

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000 }} onClick={!submitting ? onClose : undefined} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: 460, maxWidth: '92vw',
        background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12,
        boxShadow: '0 24px 64px rgba(0,0,0,0.25)',
        zIndex: 1001, display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>

        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Neue Analyse</div>
            {scopeLabel && (
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{scopeLabel}</div>
            )}
          </div>
          <button onClick={onClose} disabled={submitting} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 2, flexShrink: 0 }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', marginBottom: 10 }}>
            Analyse-Methode
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {ALL_METHODS.map(m => {
              const meta = METHOD_LABELS[m]
              const isDisabled = !!meta.disabled
              const isSelected = methods.includes(m)
              return (
                <label key={m} style={{
                  display: 'flex', gap: 10, padding: '10px 12px', borderRadius: 8,
                  cursor: isDisabled ? 'not-allowed' : 'pointer',
                  border: `1px solid ${isSelected && !isDisabled ? 'var(--color-primary, #007AFF)' : 'var(--border)'}`,
                  background: isSelected && !isDisabled ? 'rgba(0,122,255,0.05)' : 'transparent',
                  opacity: isDisabled ? 0.45 : 1,
                }}>
                  <input type="checkbox" checked={isSelected && !isDisabled} disabled={isDisabled}
                    onChange={() => !isDisabled && toggle(m)} style={{ marginTop: 2, accentColor: '#007AFF' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span>{meta.label}</span>
                      <span style={{ color: isDisabled ? 'var(--text-secondary)' : '#00C853', fontWeight: 500, whiteSpace: 'nowrap' }}>
                        {isDisabled ? 'ab Phase 3' : meta.cost}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.4 }}>{meta.desc}</div>
                  </div>
                </label>
              )
            })}
          </div>
          {activeMethods.length > 0 && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: 'var(--text-secondary)' }}>Geschätzte Kosten</span>
              <span style={{ fontWeight: 600 }}>~{estimatedCost.toFixed(2).replace('.', ',')} €</span>
            </div>
          )}
        </div>

        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center' }}>
          {error && <div style={{ flex: 1, fontSize: 12, color: '#FF3B30', lineHeight: 1.4 }}>{error}</div>}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button onClick={onClose} disabled={submitting} style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-primary)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
              Abbrechen
            </button>
            <button onClick={onStart} disabled={submitting || activeMethods.length === 0} style={{
              padding: '8px 16px', borderRadius: 6, border: 'none',
              background: (submitting || activeMethods.length === 0) ? 'var(--border)' : '#000',
              color: (submitting || activeMethods.length === 0) ? 'var(--text-secondary)' : '#fff',
              fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              {submitting ? <><RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> Wird gestartet…</> : 'Analyse starten'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// ── Hauptseite ────────────────────────────────────────────────────────────────

export default function AnalysisPage() {
  const { selectedProduction } = useSelectedProduction()
  const selectedProdId = selectedProduction?.id ?? ''

  // Block & Folge (via AppShell)
  const [blocks, setBlocks] = useState<Block[]>([])
  const [selectedBlock, setSelectedBlock] = useState<Block | null>(null)
  const [selectedFolgeNummer, setSelectedFolgeNummer] = useState<number | null>(null)

  // Sidebar
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH)
  const dragStartX = useRef(0)
  const dragStartWidth = useRef(DEFAULT_SIDEBAR_WIDTH)
  const isDragging = useRef(false)

  // Analyse-Scope: Block oder Folge
  const [scope, setScope] = useState<'block' | 'folge'>('block')

  // Modal
  const [methodenModalOpen, setMethodenModalOpen] = useState(false)
  const [methods, setMethods] = useState<string[]>(['story_consultant_pur'])

  // Runs
  const [prevRuns, setPrevRuns] = useState<RunData[]>([])
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [selectedRunData, setSelectedRunData] = useState<RunData | null>(null)
  const [selectedTab, setSelectedTab] = useState<string | null>(null)
  const [loadingRun, setLoadingRun] = useState(false)

  // Polling
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const [activeRunStatus, setActiveRunStatus] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const isPolling = activeRunId != null && (activeRunStatus === 'queued' || activeRunStatus === 'running')

  // ── Drag Handle ─────────────────────────────────────────────────────────────

  const onDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    dragStartX.current = clientX
    dragStartWidth.current = sidebarWidth
    isDragging.current = true

    const onMove = (ev: MouseEvent | TouchEvent) => {
      if (!isDragging.current) return
      const x = 'touches' in ev ? (ev as TouchEvent).touches[0].clientX : (ev as MouseEvent).clientX
      setSidebarWidth(Math.min(480, Math.max(200, dragStartWidth.current + (x - dragStartX.current))))
    }
    const onUp = () => {
      isDragging.current = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onUp)
  }, [sidebarWidth])

  // ── Settings laden / speichern ──────────────────────────────────────────────

  const settingsLoaded = useRef(false)
  const [savedBlockNr, setSavedBlockNr] = useState<number | null>(null)
  const [savedFolgeNr, setSavedFolgeNr] = useState<number | null>(null)

  useEffect(() => {
    api.getSettings().then((s: any) => {
      const ui = s?.ui_settings || {}
      if (ui.analysis_last_block_nr) setSavedBlockNr(Number(ui.analysis_last_block_nr))
      if (ui.analysis_last_folge_nr) setSavedFolgeNr(Number(ui.analysis_last_folge_nr))
      settingsLoaded.current = true
    }).catch(() => { settingsLoaded.current = true })
  }, [])

  const saveAnalysisNav = useCallback((blockNr: number | null, folgeNr: number | null) => {
    api.updateSettings({ ui_settings: {
      analysis_last_block_nr: blockNr ?? null,
      analysis_last_folge_nr: folgeNr ?? null,
    }}).catch(() => {})
  }, [])

  // ── Blöcke laden ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!selectedProdId) { setBlocks([]); setSelectedBlock(null); return }
    fetch(`/api/produktionen/${encodeURIComponent(selectedProdId)}/bloecke`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then((data: Block[]) => {
        setBlocks(data)
        if (data.length === 0) return
        // Gespeicherten Block wiederherstellen, sonst ersten Block
        const restored = savedBlockNr != null ? data.find(b => b.block_nummer === savedBlockNr) : null
        setSelectedBlock(prev => prev ?? restored ?? data[0])
      })
      .catch(() => setBlocks([]))
  }, [selectedProdId, savedBlockNr])

  // Wenn Block wechselt: gespeicherte Folge wiederherstellen oder erste Folge des Blocks
  useEffect(() => {
    if (!selectedBlock) return
    setSelectedFolgeNummer(prev => {
      // Wenn aktuelle Folge schon im Block liegt: beibehalten
      if (prev != null && prev >= selectedBlock.folge_von && prev <= selectedBlock.folge_bis) return prev
      // Gespeicherte Folge aus Settings verwenden, wenn im Block
      if (savedFolgeNr != null && savedFolgeNr >= selectedBlock.folge_von && savedFolgeNr <= selectedBlock.folge_bis) return savedFolgeNr
      return selectedBlock.folge_von
    })
    // Navigation persistieren
    saveAnalysisNav(selectedBlock.block_nummer, selectedFolgeNummer)
  }, [selectedBlock?.proddb_id])   // eslint-disable-line react-hooks/exhaustive-deps

  // ── Vorherige Runs laden ─────────────────────────────────────────────────────

  const loadPrevRuns = useCallback(() => {
    if (!selectedProdId || !selectedBlock) return
    fetch(`/api/analysis/block/${encodeURIComponent(selectedProdId)}/${selectedBlock.block_nummer}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then((runs: RunData[]) => {
        setPrevRuns(runs)
        setSelectedRunId(prev => {
          if (prev) return prev
          const latest = runs.find(r => r.status === 'completed')
          if (latest) {
            setSelectedRunData(latest)
            setSelectedTab(latest.method_results?.[0]?.method ?? null)
            return latest.id
          }
          return null
        })
      })
      .catch(() => {})
  }, [selectedProdId, selectedBlock?.block_nummer])   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setSelectedRunId(null)
    setSelectedRunData(null)
    setPrevRuns([])
    loadPrevRuns()
  }, [loadPrevRuns])

  // ── Polling ──────────────────────────────────────────────────────────────────

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }, [])

  const pollRun = useCallback(async (runId: string) => {
    try {
      const resp = await fetch(`/api/analysis/run/${runId}`, { credentials: 'include' })
      if (!resp.ok) return
      const run: RunData = await resp.json()
      setActiveRunStatus(run.status)
      setPrevRuns(prev => { const w = prev.filter(r => r.id !== run.id); return [run, ...w] })
      if (run.status === 'completed' || run.status === 'error') {
        stopPolling()
        localStorage.removeItem(POLL_STORAGE_KEY)
        setActiveRunId(null)
        setSelectedRunId(run.id)
        setSelectedRunData(run)
        setSelectedTab(run.method_results?.[0]?.method ?? null)
      }
    } catch {}
  }, [stopPolling])

  const startPolling = useCallback((runId: string) => {
    stopPolling()
    setActiveRunId(runId)
    localStorage.setItem(POLL_STORAGE_KEY, runId)
    pollRef.current = setInterval(() => pollRun(runId), POLL_INTERVAL_MS)
    pollRun(runId)
  }, [stopPolling, pollRun])

  useEffect(() => {
    const stored = localStorage.getItem(POLL_STORAGE_KEY)
    if (stored) { setActiveRunId(stored); setActiveRunStatus('queued'); startPolling(stored) }
    return () => stopPolling()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Analyse starten ──────────────────────────────────────────────────────────

  const handleRun = async () => {
    if (!selectedProdId || !selectedBlock || methods.length === 0) return
    if (scope === 'folge' && selectedFolgeNummer == null) return
    setSubmitting(true)
    setError(null)
    try {
      const body: Record<string, unknown> = {
        produktion_id: selectedProdId,
        block_nummer: selectedBlock.block_nummer,
        methods,
      }
      if (scope === 'folge' && selectedFolgeNummer != null) {
        body.folge_nummer = selectedFolgeNummer
      }
      const resp = await fetch('/api/analysis/run', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`)
      setMethodenModalOpen(false)
      setActiveRunStatus('queued')
      startPolling(data.run_id)
      loadPrevRuns()
    } catch (e: any) {
      setError(e.message || String(e))
    } finally {
      setSubmitting(false)
    }
  }

  // ── Run laden ────────────────────────────────────────────────────────────────

  const loadRun = useCallback(async (runId: string) => {
    if (runId === selectedRunId) return
    setSelectedRunId(runId)
    const existing = prevRuns.find(r => r.id === runId)
    if (existing) { setSelectedRunData(existing); setSelectedTab(existing.method_results?.[0]?.method ?? null); return }
    setLoadingRun(true)
    try {
      const resp = await fetch(`/api/analysis/run/${runId}`, { credentials: 'include' })
      if (!resp.ok) return
      const run: RunData = await resp.json()
      setSelectedRunData(run)
      setSelectedTab(run.method_results?.[0]?.method ?? null)
    } finally { setLoadingRun(false) }
  }, [selectedRunId, prevRuns])

  // ── Run löschen ─────────────────────────────────────────────────────────────

  const deleteRun = useCallback(async (runId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!window.confirm('Analyse löschen?')) return
    try {
      await fetch(`/api/analysis/run/${runId}`, { method: 'DELETE', credentials: 'include' })
      setPrevRuns(prev => prev.filter(r => r.id !== runId))
      if (selectedRunId === runId) { setSelectedRunId(null); setSelectedRunData(null) }
    } catch {}
  }, [selectedRunId])

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <AppShell
      bloecke={blocks}
      selectedBlock={selectedBlock}
      onSelectBlock={(b: Block) => {
        setSelectedBlock(b); setSelectedRunId(null); setSelectedRunData(null); setPrevRuns([])
        saveAnalysisNav(b.block_nummer, selectedFolgeNummer)
      }}
      selectedFolgeNummer={selectedFolgeNummer}
      onSelectFolge={nr => { setSelectedFolgeNummer(nr); saveAnalysisNav(selectedBlock?.block_nummer ?? null, nr) }}
    >
      <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

        {/* ── Sidebar ─────────────────────────────────────────────────────── */}
        {!sidebarCollapsed && (
          <div className="scene-list-sidebar" style={{ width: sidebarWidth, flexShrink: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

            {/* Block/Folge-Toggle + Neue-Analyse-Button */}
            <div style={{ padding: '10px 10px 8px', borderBottom: '1px solid var(--border)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>

              {/* Toggle */}
              <div style={{ display: 'flex', background: 'var(--bg-subtle)', borderRadius: 6, padding: 2, gap: 2 }}>
                {(['block', 'folge'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setScope(s)}
                    style={{
                      flex: 1, padding: '5px 0', border: 'none', borderRadius: 5,
                      background: scope === s ? 'var(--bg-surface, #fff)' : 'transparent',
                      boxShadow: scope === s ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
                      fontSize: 12, fontWeight: scope === s ? 600 : 400,
                      color: scope === s ? 'var(--text-primary)' : 'var(--text-secondary)',
                      cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.12s',
                    }}
                  >
                    {s === 'block' ? 'Block' : 'Folge'}
                  </button>
                ))}
              </div>

              {/* Kontext-Anzeige */}
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', textAlign: 'center' }}>
                {scope === 'block' && selectedBlock
                  ? `Block ${selectedBlock.block_nummer} · Folge ${selectedBlock.folge_von}–${selectedBlock.folge_bis}`
                  : scope === 'folge' && selectedFolgeNummer != null
                    ? `Folge ${selectedFolgeNummer}`
                    : '—'
                }
              </div>

              {/* Neue-Analyse-Button */}
              <button
                onClick={() => { setError(null); setMethodenModalOpen(true) }}
                disabled={!selectedBlock || !selectedProdId || (scope === 'folge' && selectedFolgeNummer == null)}
                style={{
                  width: '100%', padding: '7px 12px', borderRadius: 6,
                  border: 'none', background: '#000', color: '#fff',
                  fontWeight: 600, fontSize: 12, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                  opacity: (!selectedBlock || !selectedProdId) ? 0.4 : 1,
                  fontFamily: 'inherit',
                }}
              >
                <Plus size={11} />
                Neue Analyse
              </button>

              {isPolling && (
                <div style={{ fontSize: 11, color: '#007AFF', display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'center' }}>
                  <RefreshCw size={10} style={{ animation: 'spin 1s linear infinite' }} />
                  {statusLabel(activeRunStatus || 'queued')}
                </div>
              )}
            </div>

            {/* Runs-Liste */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {prevRuns.length === 0 && !isPolling && (
                <div style={{ padding: '20px 10px', fontSize: 12, color: 'var(--text-secondary)', textAlign: 'center', lineHeight: 1.5 }}>
                  Noch keine Analysen für diesen Block.
                </div>
              )}
              {prevRuns.map(run => {
                const isSelected = run.id === selectedRunId
                const isRunning = run.id === activeRunId && (run.status === 'queued' || run.status === 'running')
                const borderColor = run.status === 'completed' ? '#00C853' : run.status === 'error' ? '#FF3B30' : '#007AFF'
                const runScope = run.folge_nummer != null ? `Folge ${run.folge_nummer}` : `Block ${run.block_nummer}`
                const wsLabel = fmtWerkstufen(run.werkstufen_info ?? [])

                return (
                  <div
                    key={run.id}
                    className="analysis-run-item"
                    style={{
                      borderBottom: '1px solid var(--border)',
                      borderLeft: `3px solid ${borderColor}`,
                      background: isSelected ? 'var(--bg-active, rgba(0,0,0,0.05))' : 'transparent',
                      cursor: 'pointer', position: 'relative',
                    }}
                    onClick={() => loadRun(run.id)}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-subtle)' }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
                  >
                    <div style={{ padding: '9px 10px', paddingRight: 36 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>{runScope}</span>
                        {wsLabel && (
                          <span style={{ fontSize: 10, color: '#007AFF', background: 'rgba(0,122,255,0.08)', padding: '1px 5px', borderRadius: 3 }}>
                            {wsLabel}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 2 }}>
                        {run.method_results.length > 0
                          ? run.method_results.map(mr => METHOD_LABELS[mr.method]?.label || mr.method).join(', ')
                          : methods.map(m => METHOD_LABELS[m]?.label || m).join(', ')
                        }
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{fmtDate(run.created_at)}</div>
                      {isRunning && (
                        <div style={{ marginTop: 3, fontSize: 10, color: '#007AFF', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <RefreshCw size={9} style={{ animation: 'spin 1s linear infinite' }} />
                          {statusLabel(activeRunStatus || '')}
                        </div>
                      )}
                      {run.status === 'error' && !isRunning && (
                        <div style={{ marginTop: 2, fontSize: 10, color: '#FF3B30' }}>Fehler</div>
                      )}
                    </div>
                    {/* Löschen-Button */}
                    <button
                      className="run-delete-btn"
                      onClick={(e) => deleteRun(run.id, e)}
                      title="Analyse löschen"
                      style={{
                        position: 'absolute', top: 8, right: 8,
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--text-secondary)', padding: 3, borderRadius: 4,
                        display: 'flex',
                      }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Drag Handle + Collapse ─────────────────────────────────────── */}
        <div className="scene-list-handle" onMouseDown={!sidebarCollapsed ? onDragStart : undefined} onTouchStart={!sidebarCollapsed ? onDragStart : undefined}>
          <button className="scene-list-collapse-btn" onClick={() => setSidebarCollapsed(c => !c)}
            title={sidebarCollapsed ? 'Analysen öffnen' : 'Analysen schließen'}>
            {sidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>

        {/* ── Hauptbereich ──────────────────────────────────────────────── */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {loadingRun ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite', opacity: 0.35 }} />
            </div>
          ) : isPolling && !selectedRunData ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', textAlign: 'center' }}>
              <RefreshCw size={22} style={{ animation: 'spin 1s linear infinite', opacity: 0.35, marginBottom: 14 }} />
              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>{statusLabel(activeRunStatus || 'queued')}</div>
              <div style={{ fontSize: 12, marginTop: 6, lineHeight: 1.6 }}>
                Erwartet ca. 90 Sekunden pro Methode.<br />
                Du kannst die Seite verlassen — die Analyse läuft weiter.
              </div>
            </div>
          ) : selectedRunData ? (
            <ReportView run={selectedRunData} activeTab={selectedTab} onTabChange={setSelectedTab} />
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: 13, textAlign: 'center', padding: 24, gap: 12 }}>
              {!selectedProduction ? (
                <span>Produktion in der AppShell oben auswählen.</span>
              ) : !selectedBlock ? (
                <span>Block auswählen, dann „Neue Analyse" klicken.</span>
              ) : (
                <>
                  <span>Noch keine Analyse für Block {selectedBlock.block_nummer}.</span>
                  <button onClick={() => { setError(null); setMethodenModalOpen(true) }} style={{
                    padding: '8px 16px', borderRadius: 7, border: 'none', background: '#000', color: '#fff',
                    fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                  }}>
                    <Plus size={12} /> Neue Analyse starten
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {methodenModalOpen && (
        <MethodenModal
          methods={methods} onChange={setMethods}
          onStart={handleRun} onClose={() => { setMethodenModalOpen(false); setError(null) }}
          submitting={submitting} error={error}
          blockInfo={selectedBlock} scope={scope} selectedFolgeNummer={selectedFolgeNummer}
        />
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @media (pointer: coarse) { .scene-list-handle { width: 20px !important; } }
        .analysis-run-item .run-delete-btn { opacity: 0; transition: opacity 0.15s, color 0.15s; }
        .analysis-run-item:hover .run-delete-btn { opacity: 1; }
        .run-delete-btn:hover { color: #FF3B30 !important; }
        @media (pointer: coarse) { .analysis-run-item .run-delete-btn { opacity: 0.45; } }
      `}</style>
    </AppShell>
  )
}
