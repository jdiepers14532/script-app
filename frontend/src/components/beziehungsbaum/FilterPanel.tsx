import type { BaumEdgeData, BaumNodeData } from './types'
import type { Edge, Node } from '@xyflow/react'

// ── Filter-Typen ──────────────────────────────────────────────────────────────
export interface FilterState {
  kategorien: string[]
  statusWerte: string[]
  nurMitRolle: boolean
  nurBesetzt: boolean
  isolierteAusblenden: boolean
}

export const DEFAULT_FILTER: FilterState = {
  kategorien: [],
  statusWerte: [],
  nurMitRolle: false,
  nurBesetzt: false,
  isolierteAusblenden: false,
}

export function isFilterActive(f: FilterState): boolean {
  return f.kategorien.length > 0 || f.statusWerte.length > 0
    || f.nurMitRolle || f.nurBesetzt || f.isolierteAusblenden
}

// ── Filter-Logik (client-seitig) ──────────────────────────────────────────────
export function applyFilter(
  edges: Edge<BaumEdgeData>[],
  nodes: Node<BaumNodeData>[],
  filter: FilterState,
): { edges: Edge<BaumEdgeData>[]; nodes: Node<BaumNodeData>[] } {
  let visEdges = edges.filter(e => {
    const d = e.data!
    if (filter.kategorien.length > 0 && !filter.kategorien.includes(d.typ_kategorie ?? '')) return false
    if (filter.statusWerte.length > 0 && !filter.statusWerte.includes(d.status)) return false
    if (filter.nurMitRolle && !d.edgeLabel) return false
    return true
  })

  // Nur besetzte Figuren: Knoten ohne darsteller_name ausblenden
  let nodeFilter: ((n: Node<BaumNodeData>) => boolean) | null = null
  if (filter.nurBesetzt) {
    nodeFilter = (n) => !!n.data?.darsteller_name
    // Auch Kanten entfernen die auf ausgeblendeten Knoten zeigen
    const visNodeIds = new Set(nodes.filter(nodeFilter).map(n => n.id))
    visEdges = visEdges.filter(e => visNodeIds.has(e.source) && visNodeIds.has(e.target))
  }

  // Isolierte Knoten ausblenden
  let visNodes = nodeFilter ? nodes.filter(nodeFilter) : nodes
  if (filter.isolierteAusblenden) {
    const connectedIds = new Set<string>()
    visEdges.forEach(e => { connectedIds.add(e.source); connectedIds.add(e.target) })
    visNodes = visNodes.filter(n => connectedIds.has(n.id))
  }

  return { edges: visEdges, nodes: visNodes }
}

// ── Hilfskomponenten ──────────────────────────────────────────────────────────
const KATEGORIEN = ['familie', 'romantik', 'sozial', 'konflikt', 'beruflich'] as const
const KAT_LABELS: Record<string, string> = {
  familie: 'Familie', romantik: 'Romantik', sozial: 'Sozial',
  konflikt: 'Konflikt', beruflich: 'Beruflich',
}
const STATUS_WERTE = ['aktiv', 'beendet', 'geheim', 'vermutet'] as const
const STATUS_LABELS: Record<string, string> = {
  aktiv: 'Aktiv', beendet: 'Beendet', geheim: 'Geheim', vermutet: 'Vermutet',
}

function Chip({
  label, active, onClick,
}: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      className="bb-btn"
      onClick={onClick}
      style={{
        padding: '4px 10px', borderRadius: 20, fontSize: 11,
        border: '1px solid',
        borderColor: active ? '#000' : '#E0E0E0',
        background: active ? '#000' : '#fff',
        color: active ? '#fff' : '#333',
        cursor: 'pointer', fontFamily: 'Inter, sans-serif',
        minHeight: 28, whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  )
}

function Toggle({ label, value, onChange }: {
  label: string; value: boolean; onChange: (v: boolean) => void
}) {
  return (
    <label style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 8, cursor: 'pointer', userSelect: 'none',
    }}>
      <span style={{ fontSize: 12, color: '#333', lineHeight: 1.4 }}>{label}</span>
      <div
        onClick={() => onChange(!value)}
        style={{
          width: 36, height: 20, borderRadius: 10,
          background: value ? '#000' : '#E0E0E0',
          position: 'relative', transition: 'background 0.15s',
          flexShrink: 0, cursor: 'pointer',
        }}
      >
        <div style={{
          position: 'absolute', top: 2,
          left: value ? 18 : 2,
          width: 16, height: 16, borderRadius: '50%',
          background: '#fff', transition: 'left 0.15s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }} />
      </div>
    </label>
  )
}

// ── FilterPanel ───────────────────────────────────────────────────────────────
interface FilterPanelProps {
  filter: FilterState
  onChange: (f: FilterState) => void
  onReset: () => void
}

export default function FilterPanel({ filter, onChange, onReset }: FilterPanelProps) {
  function toggleKat(k: string) {
    const next = filter.kategorien.includes(k)
      ? filter.kategorien.filter(x => x !== k)
      : [...filter.kategorien, k]
    onChange({ ...filter, kategorien: next })
  }
  function toggleStatus(s: string) {
    const next = filter.statusWerte.includes(s)
      ? filter.statusWerte.filter(x => x !== s)
      : [...filter.statusWerte, s]
    onChange({ ...filter, statusWerte: next })
  }

  const sectionHead: React.CSSProperties = {
    fontSize: 10, fontWeight: 600, color: '#757575',
    marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.6px',
  }

  return (
    <div style={{
      position: 'absolute', top: 8, left: 8, zIndex: 10,
      background: '#fff', border: '1px solid #E0E0E0',
      borderRadius: 10, width: 248,
      boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
      fontFamily: 'Inter, sans-serif',
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 14px 8px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid #F5F5F5',
      }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>Filter</span>
        <button
          className="bb-btn"
          onClick={onReset}
          style={{
            fontSize: 11, color: '#757575', background: 'none',
            border: 'none', cursor: 'pointer', padding: '2px 4px',
            fontFamily: 'Inter, sans-serif',
          }}
        >
          Zurücksetzen
        </button>
      </div>

      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Kategorie */}
        <div>
          <div style={sectionHead}>Kategorie</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {KATEGORIEN.map(k => (
              <Chip
                key={k}
                label={KAT_LABELS[k]}
                active={filter.kategorien.includes(k)}
                onClick={() => toggleKat(k)}
              />
            ))}
          </div>
        </div>

        {/* Status */}
        <div>
          <div style={sectionHead}>Status</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {STATUS_WERTE.map(s => (
              <Chip
                key={s}
                label={STATUS_LABELS[s]}
                active={filter.statusWerte.includes(s)}
                onClick={() => toggleStatus(s)}
              />
            ))}
          </div>
        </div>

        {/* Toggles */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 2 }}>
          <Toggle
            label="Nur Beziehungen mit Rolle"
            value={filter.nurMitRolle}
            onChange={v => onChange({ ...filter, nurMitRolle: v })}
          />
          <Toggle
            label="Nur besetzte Figuren"
            value={filter.nurBesetzt}
            onChange={v => onChange({ ...filter, nurBesetzt: v })}
          />
          <Toggle
            label="Isolierte Knoten ausblenden"
            value={filter.isolierteAusblenden}
            onChange={v => onChange({ ...filter, isolierteAusblenden: v })}
          />
        </div>
      </div>
    </div>
  )
}
