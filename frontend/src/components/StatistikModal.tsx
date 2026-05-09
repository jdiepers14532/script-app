import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../api/client'
import { useSelectedProduction } from '../contexts'
import { RefreshCw, Maximize2, Minimize2, X, Eye, EyeOff } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StatModalSection {
  id: string
  label: string
  visible: boolean
}

export const DEFAULT_SECTIONS: StatModalSection[] = [
  { id: 'uebersicht',       label: 'Uebersicht',        visible: true },
  { id: 'rollen_pro_bild',  label: 'Figuren in Szenen',  visible: true },
  { id: 'rollen',           label: 'Rollen',             visible: true },
  { id: 'motive',           label: 'Motive',             visible: true },
  { id: 'drehorte',         label: 'Drehorte',           visible: true },
]

interface StatistikModalProps {
  onClose: () => void
  folgen: any[]
  bloecke: any[]
  sections: StatModalSection[]
}

type ViewMode = 'folge' | 'block'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(sek: number): string {
  const m = Math.floor(sek / 60)
  const s = sek % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatDrehdauer(sek: number): string {
  const h = Math.floor(sek / 3600)
  const m = Math.floor((sek % 3600) / 60)
  return `${h}:${String(m).padStart(2, '0')}`
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function StatistikModal({ onClose, folgen, bloecke, sections }: StatistikModalProps) {
  const { selectedProduction } = useSelectedProduction()
  const produktionId = selectedProduction?.id ?? null

  // Position / Size
  const [pos, setPos] = useState({ x: window.innerWidth - 520, y: 80 })
  const [size, setSize] = useState({ w: 480, h: 600 })
  const [expanded, setExpanded] = useState(false)
  const preExpand = useRef({ pos: { x: 0, y: 0 }, size: { w: 0, h: 0 } })

  // Data
  const [mode, setMode] = useState<ViewMode>('folge')
  const [selectedFolgeId, setSelectedFolgeId] = useState<number | null>(null)
  const [selectedBlockIdx, setSelectedBlockIdx] = useState(0)
  const [report, setReport] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [hideDetails, setHideDetails] = useState(false)
  const refreshCounter = useRef(0)

  // Auto-select first folge
  useEffect(() => {
    if (folgen.length > 0 && !selectedFolgeId) {
      setSelectedFolgeId(folgen[folgen.length - 1].id)
    }
  }, [folgen, selectedFolgeId])

  // Determine folge IDs
  const selectedFolgeIds = useMemo(() => {
    if (mode === 'block' && bloecke[selectedBlockIdx]) {
      const block = bloecke[selectedBlockIdx]
      return folgen
        .filter(f => f.folge_nummer >= block.folge_von && f.folge_nummer <= block.folge_bis)
        .map(f => f.id)
    }
    if (mode === 'folge' && selectedFolgeId) return [selectedFolgeId]
    return []
  }, [mode, selectedBlockIdx, bloecke, selectedFolgeId, folgen])

  // Title
  const title = useMemo(() => {
    if (mode === 'block' && bloecke[selectedBlockIdx]) {
      const b = bloecke[selectedBlockIdx]
      return `Block ${b.block_nummer} (${b.folge_von}-${b.folge_bis})`
    }
    if (mode === 'folge' && selectedFolgeId) {
      const f = folgen.find(f => f.id === selectedFolgeId)
      if (f) return `Episode ${f.folge_nummer}`
    }
    return 'Statistiken'
  }, [mode, selectedBlockIdx, bloecke, selectedFolgeId, folgen])

  // Load report
  const loadReport = useCallback(() => {
    if (!produktionId || selectedFolgeIds.length === 0) { setReport(null); return }
    const rc = ++refreshCounter.current
    setLoading(true)
    api.getStatReport(produktionId, selectedFolgeIds, 'drehbuch')
      .then(r => { if (rc === refreshCounter.current) setReport(r) })
      .catch(() => { if (rc === refreshCounter.current) setReport(null) })
      .finally(() => { if (rc === refreshCounter.current) setLoading(false) })
  }, [produktionId, selectedFolgeIds])

  useEffect(() => { loadReport() }, [loadReport])

  // Listen for data changes
  useEffect(() => {
    const handler = () => loadReport()
    window.addEventListener('app-settings-changed', handler)
    window.addEventListener('dokument-saved', handler)
    window.addEventListener('scene-characters-changed', handler)
    return () => {
      window.removeEventListener('app-settings-changed', handler)
      window.removeEventListener('dokument-saved', handler)
      window.removeEventListener('scene-characters-changed', handler)
    }
  }, [loadReport])

  // ── Drag ─────────────────────────────────────────────────────────────────

  const dragging = useRef(false)
  const dragOffset = useRef({ x: 0, y: 0 })

  const onDragStart = useCallback((e: React.MouseEvent) => {
    if (expanded) return
    dragging.current = true
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y }
    e.preventDefault()
  }, [pos, expanded])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - 100, e.clientX - dragOffset.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - 40, e.clientY - dragOffset.current.y)),
      })
    }
    const onUp = () => { dragging.current = false }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  // ── Resize ───────────────────────────────────────────────────────────────

  const resizing = useRef<string | null>(null)
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0, px: 0, py: 0 })

  const onResizeStart = useCallback((edge: string) => (e: React.MouseEvent) => {
    if (expanded) return
    resizing.current = edge
    resizeStart.current = { x: pos.x, y: pos.y, w: size.w, h: size.h, px: e.clientX, py: e.clientY }
    e.preventDefault()
    e.stopPropagation()
  }, [pos, size, expanded])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizing.current) return
      const edge = resizing.current
      const r = resizeStart.current
      const dx = e.clientX - r.px
      const dy = e.clientY - r.py

      let newW = r.w, newH = r.h, newX = r.x, newY = r.y

      if (edge.includes('e')) newW = Math.max(320, r.w + dx)
      if (edge.includes('w')) { newW = Math.max(320, r.w - dx); newX = r.x + (r.w - newW) }
      if (edge.includes('s')) newH = Math.max(200, r.h + dy)
      if (edge.includes('n')) { newH = Math.max(200, r.h - dy); newY = r.y + (r.h - newH) }

      setSize({ w: newW, h: newH })
      setPos({ x: newX, y: newY })
    }
    const onUp = () => { resizing.current = null }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  // ── Expand / collapse ────────────────────────────────────────────────────

  const toggleExpand = () => {
    if (!expanded) {
      preExpand.current = { pos: { ...pos }, size: { ...size } }
      setPos({ x: 20, y: 20 })
      setSize({ w: window.innerWidth - 40, h: window.innerHeight - 40 })
      setExpanded(true)
    } else {
      setPos(preExpand.current.pos)
      setSize(preExpand.current.size)
      setExpanded(false)
    }
  }

  // ── Visible sections ────────────────────────────────────────────────────

  const visibleSections = sections.filter(s => s.visible)

  // ── Render ──────────────────────────────────────────────────────────────

  const containerStyle: React.CSSProperties = expanded
    ? { position: 'fixed', left: 20, top: 20, width: 'calc(100vw - 40px)', height: 'calc(100vh - 40px)', zIndex: 10000 }
    : { position: 'fixed', left: pos.x, top: pos.y, width: size.w, height: size.h, zIndex: 10000 }

  return createPortal(
    <div style={{
      ...containerStyle,
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg, #fff)',
      borderRadius: 8,
      boxShadow: '0 8px 32px rgba(0,0,0,0.28), 0 2px 8px rgba(0,0,0,0.12)',
      overflow: 'hidden',
      border: '1px solid var(--border, #e0e0e0)',
    }}>
      {/* Resize handles */}
      {!expanded && <>
        <div onMouseDown={onResizeStart('n')}  style={{ position: 'absolute', top: -3, left: 8, right: 8, height: 6, cursor: 'n-resize', zIndex: 2 }} />
        <div onMouseDown={onResizeStart('s')}  style={{ position: 'absolute', bottom: -3, left: 8, right: 8, height: 6, cursor: 's-resize', zIndex: 2 }} />
        <div onMouseDown={onResizeStart('w')}  style={{ position: 'absolute', left: -3, top: 8, bottom: 8, width: 6, cursor: 'w-resize', zIndex: 2 }} />
        <div onMouseDown={onResizeStart('e')}  style={{ position: 'absolute', right: -3, top: 8, bottom: 8, width: 6, cursor: 'e-resize', zIndex: 2 }} />
        <div onMouseDown={onResizeStart('nw')} style={{ position: 'absolute', top: -3, left: -3, width: 12, height: 12, cursor: 'nw-resize', zIndex: 3 }} />
        <div onMouseDown={onResizeStart('ne')} style={{ position: 'absolute', top: -3, right: -3, width: 12, height: 12, cursor: 'ne-resize', zIndex: 3 }} />
        <div onMouseDown={onResizeStart('sw')} style={{ position: 'absolute', bottom: -3, left: -3, width: 12, height: 12, cursor: 'sw-resize', zIndex: 3 }} />
        <div onMouseDown={onResizeStart('se')} style={{ position: 'absolute', bottom: -3, right: -3, width: 12, height: 12, cursor: 'se-resize', zIndex: 3 }} />
      </>}

      {/* Header — tooltip-styled dark bar */}
      <div
        onMouseDown={onDragStart}
        style={{
          background: '#111',
          color: '#fff',
          padding: '8px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          cursor: expanded ? 'default' : 'grab',
          userSelect: 'none',
          flexShrink: 0,
          borderRadius: '8px 8px 0 0',
        }}
      >
        {/* Drag handle */}
        <span style={{ fontSize: 14, lineHeight: 1, opacity: 0.5 }}>&#x2807;</span>

        {/* Title */}
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          Statistiken {title}
        </span>

        {/* Refresh */}
        <button onClick={loadReport} title="Aktualisieren" style={headerBtn}>
          <RefreshCw size={13} style={loading ? { animation: 'spin 1s linear infinite' } : undefined} />
        </button>

        {/* Hide details toggle */}
        <button onClick={() => setHideDetails(v => !v)} title={hideDetails ? 'Details einblenden' : 'Details ausblenden'} style={headerBtn}>
          {hideDetails ? <Eye size={13} /> : <EyeOff size={13} />}
        </button>

        {/* Expand */}
        <button onClick={toggleExpand} title={expanded ? 'Verkleinern' : 'Maximieren'} style={headerBtn}>
          {expanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
        </button>

        {/* Close */}
        <button onClick={onClose} title="Schliessen" style={headerBtn}>
          <X size={13} />
        </button>
      </div>

      {/* Toolbar */}
      <div style={{
        padding: '8px 12px',
        borderBottom: '1px solid var(--border, #e0e0e0)',
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        flexShrink: 0,
        flexWrap: 'wrap',
        fontSize: 12,
      }}>
        {/* Mode toggle */}
        <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 5, overflow: 'hidden' }}>
          <button onClick={() => setMode('folge')} style={toggleBtnStyle(mode === 'folge')}>Pro Folge</button>
          <button onClick={() => setMode('block')} style={{ ...toggleBtnStyle(mode === 'block'), borderLeft: '1px solid var(--border)' }}>Pro Block</button>
        </div>

        {/* Selector */}
        {mode === 'folge' && (
          <select
            value={selectedFolgeId ?? ''}
            onChange={e => setSelectedFolgeId(Number(e.target.value) || null)}
            style={selectStyle}
          >
            {folgen.map(f => (
              <option key={f.id} value={f.id}>Folge {f.folge_nummer}</option>
            ))}
          </select>
        )}
        {mode === 'block' && bloecke.length > 0 && (
          <select
            value={selectedBlockIdx}
            onChange={e => setSelectedBlockIdx(Number(e.target.value))}
            style={selectStyle}
          >
            {bloecke.map((b, i) => (
              <option key={i} value={i}>Block {b.block_nummer} ({b.folge_von}-{b.folge_bis})</option>
            ))}
          </select>
        )}
        {mode === 'block' && bloecke.length === 0 && (
          <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>Keine Bloecke</span>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 32, fontSize: 13 }}>Laden...</div>
        ) : !report ? (
          <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 32, fontSize: 13 }}>Keine Daten</div>
        ) : (
          <ReportContent report={report} sections={visibleSections} hideDetails={hideDetails} />
        )}
      </div>

      {/* Spin animation */}
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>,
    document.body
  )
}

// ── Report Content ────────────────────────────────────────────────────────────

function ReportContent({ report, sections, hideDetails }: { report: any; sections: StatModalSection[]; hideDetails: boolean }) {
  return (
    <div style={{ fontSize: 13 }}>
      {sections.map(sec => {
        switch (sec.id) {
          case 'uebersicht':
            return <UebersichtSection key={sec.id} report={report} />
          case 'rollen_pro_bild':
            return <RollenProBildSection key={sec.id} report={report} />
          case 'rollen':
            return <RollenSection key={sec.id} report={report} hideDetails={hideDetails} />
          case 'motive':
            return <MotiveSection key={sec.id} report={report} hideDetails={hideDetails} />
          case 'drehorte':
            return <DrehorteSection key={sec.id} report={report} />
          default:
            return null
        }
      })}
    </div>
  )
}

// ── Sections ──────────────────────────────────────────────────────────────────

function UebersichtSection({ report }: { report: any }) {
  return (
    <Section>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 24px' }}>
        <SummaryItem label="Bilder insgesamt" value={report.bilder_insgesamt} />
        <SummaryItem label="Anzahl an Drehbuchseiten" value={report.drehbuchseiten_display || '0'} />
        <SummaryItem label="Vorstopp (mm:ss)" value={formatTime(report.vorstopp_sek || 0)} />
        <SummaryItem label="Geplante Drehdauer (hh:mm)" value={report.vorstopp_sek ? formatDrehdauer(report.vorstopp_sek) : '-'} />
      </div>
    </Section>
  )
}

function RollenProBildSection({ report }: { report: any }) {
  if (!report.rollen_pro_bild?.length) return null

  const grouped = useMemo(() => {
    const result: { label: string; count: number }[] = []
    let over3 = 0
    for (const r of report.rollen_pro_bild) {
      if (r.rollen_count <= 3) {
        result.push({
          label: `Bilder mit ${r.rollen_count} ${r.rollen_count === 1 ? 'Rolle' : 'Rollen'}`,
          count: r.bilder_count,
        })
      } else {
        over3 += r.bilder_count
      }
    }
    if (over3 > 0) result.push({ label: 'Bilder mit mehr als 3 Rollen', count: over3 })
    return result
  }, [report.rollen_pro_bild])

  return (
    <Section title="Rollen pro Bild">
      {grouped.map((g, i) => (
        <div key={i} style={listRow}>
          <span style={countBadge}>{g.count}x</span>
          <span>{g.label}</span>
        </div>
      ))}
    </Section>
  )
}

function RollenSection({ report, hideDetails }: { report: any; hideDetails: boolean }) {
  if (!report.rollen?.length) return null
  return (
    <Section title="Rollen">
      {report.rollen.map((r: any, i: number) => (
        <div key={i} style={{ ...listRow, alignItems: 'flex-start' }}>
          <span style={countBadge}>{r.scene_count}x</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontWeight: 500 }}>{r.character_name}</span>
            {!hideDetails && r.darsteller_name && (
              <span style={{ color: 'var(--text-secondary)', marginLeft: 12 }}>{r.darsteller_name}</span>
            )}
            {!hideDetails && r.scenes?.length > 0 && (
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, wordBreak: 'break-all' }}>
                {r.scenes.length > 12 ? r.scenes.slice(0, 12).join(', ') + ', ...' : r.scenes.join(', ')}
              </div>
            )}
          </div>
        </div>
      ))}
    </Section>
  )
}

function MotiveSection({ report, hideDetails }: { report: any; hideDetails: boolean }) {
  if (!report.motive?.length) return null
  return (
    <Section title="Motive">
      {report.motive.map((m: any, i: number) => (
        <div key={i} style={{ ...listRow, alignItems: 'flex-start' }}>
          <span style={countBadge}>{m.scene_count}x</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontWeight: 500 }}>{m.name}</span>
            <span style={{ color: 'var(--text-secondary)', marginLeft: 12 }}>{m.drehort}</span>
            {!hideDetails && m.scenes?.length > 0 && (
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, wordBreak: 'break-all' }}>
                {m.scenes.length > 12 ? m.scenes.slice(0, 12).join(', ') + ', ...' : m.scenes.join(', ')}
              </div>
            )}
          </div>
        </div>
      ))}
    </Section>
  )
}

function DrehorteSection({ report }: { report: any }) {
  if (!report.drehorte?.length) return null
  return (
    <Section title="Drehorte">
      {report.drehorte.map((d: any, i: number) => (
        <div key={i} style={listRow}>
          <span style={countBadge}>{d.scene_count}x</span>
          <span>{d.name}</span>
        </div>
      ))}
    </Section>
  )
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      {title && (
        <h3 style={{
          fontSize: 12, fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.5px', color: 'var(--text-secondary)',
          marginBottom: 8, paddingBottom: 4,
          borderBottom: '1px solid var(--border)',
        }}>
          {title}
        </h3>
      )}
      {children}
    </div>
  )
}

function SummaryItem({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border-subtle, var(--border))' }}>
      <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{label}</span>
      <span style={{ fontWeight: 600, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const headerBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: '#fff', cursor: 'pointer',
  padding: 4, borderRadius: 4, display: 'flex', alignItems: 'center',
  opacity: 0.7, transition: 'opacity 0.12s',
}

const toggleBtnStyle = (active: boolean): React.CSSProperties => ({
  padding: '4px 10px', border: 'none', cursor: 'pointer', fontSize: 12,
  background: active ? 'var(--text)' : 'var(--bg)',
  color: active ? 'var(--bg)' : 'var(--text)',
})

const selectStyle: React.CSSProperties = {
  padding: '4px 8px', borderRadius: 5, border: '1px solid var(--border)',
  background: 'var(--bg)', color: 'var(--text)', fontSize: 12,
}

const listRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13,
}

const countBadge: React.CSSProperties = {
  display: 'inline-block', minWidth: 32, textAlign: 'right', fontWeight: 600,
  fontVariantNumeric: 'tabular-nums', marginRight: 4, flexShrink: 0,
}
