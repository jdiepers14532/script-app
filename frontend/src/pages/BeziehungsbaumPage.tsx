import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  ReactFlow, ReactFlowProvider,
  useNodesState, useEdgesState, useReactFlow,
  Background, BackgroundVariant, Controls, MiniMap,
  type Node, type Edge, type OnConnect, type OnNodeDrag,
  type EdgeMouseHandler,
  MarkerType,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { GitFork, Diff, BookUser, ArrowLeft, SlidersHorizontal, HelpCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import FigurNode, { type FigurNodeType } from '../components/beziehungsbaum/FigurNode'
import BeziehungEdge, { type BeziehungEdgeType } from '../components/beziehungsbaum/BeziehungEdge'
import KanteFormDrawer from '../components/beziehungsbaum/KanteFormDrawer'
import SeedReviewPanel from '../components/beziehungsbaum/SeedReviewPanel'
import FilterPanel, {
  type FilterState, DEFAULT_FILTER, isFilterActive, applyFilter,
} from '../components/beziehungsbaum/FilterPanel'
import BeziehungsbaumHilfePanel from '../components/beziehungsbaum/BeziehungsbaumHilfePanel'
import type {
  BaumNodeData, BaumEdgeData, Beziehungstyp, Reihe, Staffel,
} from '../components/beziehungsbaum/types'
import AppShell from '../components/AppShell'

const nodeTypes = { figur: FigurNode } as const
const edgeTypes = { beziehung: BeziehungEdge } as const

const LAYOUT_COLS = 5
const LAYOUT_DX = 220
const LAYOUT_DY = 130

function gridPosition(i: number): { x: number; y: number } {
  return { x: (i % LAYOUT_COLS) * LAYOUT_DX + 40, y: Math.floor(i / LAYOUT_COLS) * LAYOUT_DY + 40 }
}

function apiEdgeToRFEdge(e: any): Edge<BaumEdgeData> {
  return {
    id: `e-${e.id}`,
    type: 'beziehung',
    source: e.character_id,
    target: e.related_character_id,
    data: {
      kanteId: e.id,
      character_id: e.character_id,
      related_character_id: e.related_character_id,
      beziehungstyp: e.beziehungstyp,
      edgeLabel: e.label ?? undefined,
      status: e.status,
      gueltig_ab_staffel: e.gueltig_ab_staffel,
      gueltig_bis_staffel: e.gueltig_bis_staffel,
      staerke: e.staerke,
      notiz: e.notiz,
      seit_block: e.seit_block,
      bis_block: e.bis_block,
      herkunft: e.herkunft,
      reihen_id: e.reihen_id,
      typ_label: e.typ_label,
      typ_kategorie: e.typ_kategorie,
      gerichtet: e.gerichtet,
      farbe: e.farbe,
      linienstil: e.linienstil,
    } satisfies BaumEdgeData,
    markerEnd: e.gerichtet ? { type: MarkerType.ArrowClosed, color: e.farbe ?? '#757575' } : undefined,
  }
}

function apiNodeToRFNode(
  c: any,
  pos: { x: number; y: number }
): Node<BaumNodeData> {
  return {
    id: c.id,
    type: 'figur',
    position: pos,
    data: {
      charId: c.id,
      name: c.name,
      darsteller_name: c.darsteller_name ?? undefined,
      kategorie_name: c.kategorie_name ?? undefined,
      kategorie_typ: c.kategorie_typ ?? undefined,
      foto_dateiname: c.foto_dateiname ?? undefined,
    } satisfies BaumNodeData,
  }
}

type BaumNode = Node<BaumNodeData>
type BaumEdge = Edge<BaumEdgeData>

// ─────────────────────────────────────────────────────────────────────────────
function BeziehungsbaumInner() {
  const { fitView } = useReactFlow()
  const [zugriff, setZugriff] = useState<{ lesen: boolean; schreiben: boolean } | null>(null)
  const [reihen, setReihen] = useState<Reihe[]>([])
  const [selectedReihe, setSelectedReihe] = useState<string>('')
  const [staffeln, setStaffeln] = useState<Staffel[]>([])
  // null = "Alle Staffeln", number = Index in staffeln[]
  const [selectedStaffelIdx, setSelectedStaffelIdx] = useState<number | null>(null)
  const [beziehungstypen, setBeziehungstypen] = useState<Beziehungstyp[]>([])

  const [nodes, setNodes, onNodesChange] = useNodesState<BaumNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<BaumEdge>([])

  const [loading, setLoading] = useState(false)
  const [diffMode, setDiffMode] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [filterState, setFilterState] = useState<FilterState>(DEFAULT_FILTER)
  const [hilfeOpen, setHilfeOpen] = useState(false)
  const [drawerState, setDrawerState] = useState<
    | { mode: 'none' }
    | { mode: 'create'; sourceId: string; targetId: string }
    | { mode: 'edit'; edge: BaumEdgeData }
  >({ mode: 'none' })
  const [seedPanelOpen, setSeedPanelOpen] = useState(false)
  const layoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // null = Alle Staffeln
  const currentStaffel = selectedStaffelIdx !== null ? staffeln[selectedStaffelIdx] : null

  // ── Auth-Check ────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/beziehungen/mein-zugriff', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { lesen: false, schreiben: false })
      .then(setZugriff)
      .catch(() => setZugriff({ lesen: false, schreiben: false }))
  }, [])

  // ── Typen + Reihen laden ─────────────────────────────────────────────────
  useEffect(() => {
    if (!zugriff?.lesen) return
    Promise.all([
      fetch('/api/beziehungstypen', { credentials: 'include' }).then(r => r.json()),
      fetch('/api/beziehungen/reihen', { credentials: 'include' }).then(r => r.json()),
    ]).then(([typen, rRows]) => {
      setBeziehungstypen(Array.isArray(typen) ? typen : [])
      const reihenList: Reihe[] = Array.isArray(rRows) ? rRows : []
      setReihen(reihenList)
      if (reihenList.length > 0) setSelectedReihe(reihenList[0].id)
    }).catch(console.error)
  }, [zugriff])

  // ── Staffeln laden wenn Reihe wechselt ──────────────────────────────────
  useEffect(() => {
    if (!selectedReihe) return
    fetch(`/api/beziehungen/staffeln?reihen_id=${encodeURIComponent(selectedReihe)}`, { credentials: 'include' })
      .then(r => r.json())
      .then((rows: Staffel[]) => {
        const list = Array.isArray(rows) ? rows : []
        setStaffeln(list)
        setSelectedStaffelIdx(list.length > 0 ? list.length - 1 : null)
      })
      .catch(() => setStaffeln([]))
  }, [selectedReihe])

  // ── Graph laden wenn Staffel wechselt ───────────────────────────────────
  useEffect(() => {
    if (!selectedReihe) return
    // Wenn Index gesetzt aber Staffel noch nicht geladen: warten
    if (selectedStaffelIdx !== null && !currentStaffel) return
    setLoading(true)
    const url = currentStaffel
      ? `/api/beziehungen?reihe=${encodeURIComponent(selectedReihe)}&staffel=${currentStaffel.staffelnummer}&produktion_id=${encodeURIComponent(currentStaffel.id)}`
      : `/api/beziehungen?reihe=${encodeURIComponent(selectedReihe)}&staffel=alle`
    Promise.all([
      fetch(url, { credentials: 'include' }).then(r => r.json()),
      fetch(`/api/beziehungen/layout?reihe=${encodeURIComponent(selectedReihe)}`, { credentials: 'include' }).then(r => r.json()),
    ]).then(([graph, layout]) => {
      const layoutMap = new Map<string, { x: number; y: number }>()
      if (Array.isArray(layout)) {
        layout.forEach((p: any) => layoutMap.set(p.character_id, { x: Number(p.x), y: Number(p.y) }))
      }

      const newNodes: Node<BaumNodeData>[] = (graph.nodes ?? []).map((c: any, i: number) => {
        const pos = layoutMap.get(c.id) ?? gridPosition(i)
        return apiNodeToRFNode(c, pos)
      })
      const newEdges: Edge<BaumEdgeData>[] = (graph.edges ?? []).map(apiEdgeToRFEdge)

      setNodes(newNodes)
      setEdges(newEdges)

      setTimeout(() => fitView({ padding: 0.15, duration: 300 }), 50)
    }).catch(console.error).finally(() => setLoading(false))
  }, [selectedReihe, selectedStaffelIdx, currentStaffel?.id])

  // ── Diff-Modus (nur für Einzelstaffel, nicht für Alle) ───────────────────
  useEffect(() => {
    if (!diffMode || !selectedReihe || !currentStaffel || selectedStaffelIdx === null || selectedStaffelIdx === 0) return

    const prevStaffel = staffeln[selectedStaffelIdx - 1]
    if (!prevStaffel) return

    fetch(
      `/api/beziehungen/diff?reihe=${encodeURIComponent(selectedReihe)}&von=${prevStaffel.staffelnummer}&bis=${currentStaffel.staffelnummer}`,
      { credentials: 'include' }
    ).then(r => r.json()).then(diff => {
      const neuIds = new Set<string>((diff.neu ?? []).map((e: any) => `e-${e.id}`))
      const geaendertIds = new Set<string>((diff.geaendert ?? []).map((e: any) => `e-${e.id}`))
      const entfallenEdges: Edge<BaumEdgeData>[] = (diff.entfallen ?? []).map((e: any) => ({
        ...apiEdgeToRFEdge(e),
        id: `entf-${e.id}`,
        data: { ...apiEdgeToRFEdge(e).data!, diffStatus: 'entfallen' as const },
      }))

      setEdges(prev => [
        ...prev.map(e => ({
          ...e,
          data: {
            ...e.data!,
            diffStatus: neuIds.has(e.id) ? 'neu' as const
              : geaendertIds.has(e.id) ? 'geaendert' as const
              : undefined,
          },
        })),
        ...entfallenEdges,
      ])
    }).catch(console.error)
  }, [diffMode, selectedReihe, currentStaffel?.staffelnummer, selectedStaffelIdx])

  // ── Gefilterte Nodes + Edges (client-seitig) ─────────────────────────────
  const { edges: visibleEdges, nodes: visibleNodes } = useMemo(
    () => applyFilter(edges, nodes, filterState),
    [edges, nodes, filterState],
  )

  // Diff-Farben zurücksetzen wenn Modus aus
  useEffect(() => {
    if (!diffMode) {
      setEdges(prev => prev
        .filter(e => !e.id.startsWith('entf-'))
        .map(e => ({ ...e, data: { ...e.data!, diffStatus: undefined } }))
      )
    }
  }, [diffMode])

  // ── Layout speichern (debounced) ─────────────────────────────────────────
  const saveLayout = useCallback((updatedNodes: BaumNode[]) => {
    if (!selectedReihe || !zugriff?.schreiben) return
    if (layoutTimerRef.current) clearTimeout(layoutTimerRef.current)
    layoutTimerRef.current = setTimeout(() => {
      const payload = updatedNodes.map(n => ({
        character_id: n.id,
        x: n.position.x,
        y: n.position.y,
      }))
      fetch(`/api/beziehungen/layout?reihe=${encodeURIComponent(selectedReihe)}`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(console.error)
    }, 800)
  }, [selectedReihe, zugriff])

  const onNodeDragStop: OnNodeDrag<BaumNode> = useCallback((_evt, _node, allNodes) => {
    saveLayout(allNodes)
  }, [saveLayout])

  // ── Neue Kante (connect) ─────────────────────────────────────────────────
  const onConnect: OnConnect = useCallback((params) => {
    if (!zugriff?.schreiben) return
    setDrawerState({ mode: 'create', sourceId: params.source, targetId: params.target })
  }, [zugriff])

  // ── Kante klicken → Edit ─────────────────────────────────────────────────
  const onEdgeClick: EdgeMouseHandler<BaumEdge> = useCallback((_evt, edge) => {
    if (!zugriff?.schreiben) return
    setDrawerState({ mode: 'edit', edge: edge.data! })
  }, [zugriff])

  // ── Kante speichern ──────────────────────────────────────────────────────
  const handleSave = async (kanteId: number | null, data: Partial<BaumEdgeData>) => {
    if (kanteId === null) {
      // Neue Kante
      const res = await fetch('/api/beziehungen', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'Fehler')
      }
      const newEdge = await res.json()
      setEdges(prev => [...prev, apiEdgeToRFEdge({ ...newEdge, ...beziehungstypen.find(t => t.key === newEdge.beziehungstyp) ? {
        typ_label: beziehungstypen.find(t => t.key === newEdge.beziehungstyp)?.label,
        gerichtet: beziehungstypen.find(t => t.key === newEdge.beziehungstyp)?.gerichtet,
        farbe: beziehungstypen.find(t => t.key === newEdge.beziehungstyp)?.farbe,
        linienstil: beziehungstypen.find(t => t.key === newEdge.beziehungstyp)?.linienstil,
      } : {} })])
    } else {
      // Bestehende Kante patchen
      const res = await fetch(`/api/beziehungen/${kanteId}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'Fehler')
      }
      const updated = await res.json()
      const typ = beziehungstypen.find(t => t.key === updated.beziehungstyp)
      setEdges(prev => prev.map(e =>
        e.id === `e-${kanteId}` ? apiEdgeToRFEdge({ ...updated, typ_label: typ?.label, gerichtet: typ?.gerichtet, farbe: typ?.farbe, linienstil: typ?.linienstil }) : e
      ))
    }
    setDrawerState({ mode: 'none' })
  }

  // ── Kante löschen ────────────────────────────────────────────────────────
  const handleDelete = async (kanteId: number) => {
    const res = await fetch(`/api/beziehungen/${kanteId}`, {
      method: 'DELETE', credentials: 'include',
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error ?? 'Fehler')
    }
    setEdges(prev => prev.filter(e => e.id !== `e-${kanteId}`))
    setDrawerState({ mode: 'none' })
  }

  // ── Toolbar ───────────────────────────────────────────────────────────────
  const btnStyle = (active?: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '7px 12px', border: '1px solid', borderRadius: 6,
    borderColor: active ? '#000' : '#E0E0E0',
    background: active ? '#000' : '#fff',
    color: active ? '#fff' : '#000',
    fontSize: 12, fontFamily: 'Inter, sans-serif', cursor: 'pointer',
    fontWeight: 500, whiteSpace: 'nowrap',
  })

  // ── Drawer-Hilfsdaten ────────────────────────────────────────────────────
  const nodeNameMap = useMemo(() => {
    const m = new Map<string, string>()
    nodes.forEach(n => m.set(n.id, n.data.name))
    return m
  }, [nodes])

  if (!zugriff) {
    return (
      <div style={{ padding: 40, fontFamily: 'Inter, sans-serif', color: '#757575', textAlign: 'center' }}>
        Zugriff wird geprüft…
      </div>
    )
  }

  if (!zugriff.lesen) {
    return (
      <div style={{ padding: 40, fontFamily: 'Inter, sans-serif', textAlign: 'center' }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Kein Zugriff</div>
        <div style={{ color: '#757575', fontSize: 13 }}>
          Du hast keine Leseberechtigung für den Beziehungsbaum.
        </div>
        <Link to="/" style={{ color: '#007AFF', fontSize: 13, marginTop: 16, display: 'inline-block' }}>
          ← Zurück
        </Link>
      </div>
    )
  }

  const drawerOpen = drawerState.mode !== 'none'

  return (
    <div style={{
      height: '100vh', display: 'flex', flexDirection: 'column',
      fontFamily: 'Inter, sans-serif', background: '#fff',
    }}>
      {/* ── Topbar ── */}
      <div style={{
        padding: '8px 16px', borderBottom: '1px solid #E0E0E0',
        display: 'flex', alignItems: 'center', gap: 12,
        background: '#fff', flexShrink: 0, flexWrap: 'wrap',
      }}>
        <Link to="/" style={{
          display: 'flex', alignItems: 'center', color: '#757575',
          textDecoration: 'none', fontSize: 13,
        }}>
          <ArrowLeft size={14} />
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <GitFork size={16} />
          <span style={{ fontWeight: 600, fontSize: 14 }}>Beziehungsbaum</span>
        </div>

        {/* Reihen-Selector */}
        <select
          value={selectedReihe}
          onChange={e => setSelectedReihe(e.target.value)}
          style={{
            padding: '6px 10px', border: '1px solid #E0E0E0',
            borderRadius: 6, fontSize: 13, fontFamily: 'Inter, sans-serif',
            background: '#fff', cursor: 'pointer',
          }}
        >
          {reihen.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>

        {/* Staffel-Selector: "Alle" + einzelne Staffeln */}
        {staffeln.length > 0 && (
          <div style={{
            display: 'flex', border: '1px solid #E0E0E0',
            borderRadius: 6, overflow: 'hidden', flexShrink: 0,
          }}>
            <button
              className="bb-seg-btn"
              onClick={() => { setSelectedStaffelIdx(null); setDiffMode(false) }}
              style={{
                padding: '6px 10px', border: 'none',
                borderRight: '1px solid #E0E0E0',
                background: selectedStaffelIdx === null ? '#000' : '#fff',
                color: selectedStaffelIdx === null ? '#fff' : '#000',
                fontSize: 12, fontFamily: 'Inter, sans-serif', cursor: 'pointer',
                fontWeight: selectedStaffelIdx === null ? 600 : 400,
                minHeight: 32,
              }}
            >
              Alle
            </button>
            {staffeln.map((s, i) => (
              <button
                key={s.id}
                className="bb-seg-btn"
                onClick={() => setSelectedStaffelIdx(i)}
                style={{
                  padding: '6px 12px', border: 'none',
                  borderRight: i < staffeln.length - 1 ? '1px solid #E0E0E0' : 'none',
                  background: selectedStaffelIdx === i ? '#000' : '#fff',
                  color: selectedStaffelIdx === i ? '#fff' : '#000',
                  fontSize: 12, fontFamily: 'Inter, sans-serif', cursor: 'pointer',
                  fontWeight: selectedStaffelIdx === i ? 600 : 400,
                  minHeight: 32,
                }}
              >
                S{s.staffelnummer}
              </button>
            ))}
          </div>
        )}

        <div style={{ flex: 1 }} />

        {/* Diff-Toggle (nur Einzelstaffel, nicht Alle) */}
        {staffeln.length > 1 && selectedStaffelIdx !== null && selectedStaffelIdx > 0 && (
          <button
            className="bb-btn"
            style={btnStyle(diffMode)}
            onClick={() => setDiffMode(d => !d)}
          >
            <Diff size={14} />
            {diffMode ? 'Diff an' : 'Diff'}
          </button>
        )}

        {/* Filter-Button */}
        <button
          className="bb-btn"
          style={btnStyle(filterOpen || isFilterActive(filterState))}
          onClick={() => {
            setFilterOpen(p => !p)
            setSeedPanelOpen(false)
            setHilfeOpen(false)
            setDrawerState({ mode: 'none' })
          }}
        >
          <SlidersHorizontal size={14} />
          Filter{isFilterActive(filterState) ? ' ●' : ''}
        </button>

        {/* Seed-Review-Button (nur für schreiben) */}
        {zugriff.schreiben && (
          <button
            className="bb-btn"
            style={btnStyle(seedPanelOpen)}
            onClick={() => {
              setSeedPanelOpen(p => !p)
              setFilterOpen(false)
              setHilfeOpen(false)
              setDrawerState({ mode: 'none' })
            }}
          >
            <BookUser size={14} />
            Wiki-Seeds
          </button>
        )}

        {/* Hilfe-Button */}
        <button
          className="bb-btn"
          style={btnStyle(hilfeOpen)}
          onClick={() => {
            setHilfeOpen(p => !p)
            setFilterOpen(false)
            setSeedPanelOpen(false)
            setDrawerState({ mode: 'none' })
          }}
          title="Hilfe"
        >
          <HelpCircle size={14} />
        </button>
      </div>

      {/* ── Canvas-Bereich ── */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {loading && (
          <div style={{
            position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.7)', color: '#fff',
            padding: '4px 12px', borderRadius: 20, fontSize: 12, zIndex: 20,
          }}>
            Lädt…
          </div>
        )}

        <ReactFlow
          nodes={visibleNodes}
          edges={visibleEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={zugriff.schreiben ? onConnect : undefined}
          onNodeDragStop={zugriff.schreiben ? onNodeDragStop : undefined}
          onEdgeClick={zugriff.schreiben ? onEdgeClick : undefined}
          fitView
          proOptions={{ hideAttribution: false }}
          style={{ background: '#FAFAFA' }}
          nodesDraggable={!!zugriff.schreiben}
          nodesConnectable={!!zugriff.schreiben}
          elementsSelectable
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#E0E0E0" />
          <Controls />
          <MiniMap nodeStrokeWidth={2} zoomable pannable />
        </ReactFlow>

        {/* Drawer + Panel rechts — schließen Stück für Stück */}
        {filterOpen && (
          <FilterPanel
            filter={filterState}
            onChange={setFilterState}
            onReset={() => setFilterState(DEFAULT_FILTER)}
          />
        )}

        {hilfeOpen && (
          <BeziehungsbaumHilfePanel onClose={() => setHilfeOpen(false)} />
        )}

        {drawerOpen && (
          <KanteFormDrawer
            mode={drawerState.mode as 'create' | 'edit'}
            edge={drawerState.mode === 'edit' ? drawerState.edge : undefined}
            sourceId={drawerState.mode === 'create' ? drawerState.sourceId : undefined}
            targetId={drawerState.mode === 'create' ? drawerState.targetId : undefined}
            sourceLabel={drawerState.mode === 'create' ? nodeNameMap.get(drawerState.sourceId) : undefined}
            targetLabel={drawerState.mode === 'create' ? nodeNameMap.get(drawerState.targetId) : undefined}
            reihenId={selectedReihe}
            currentStaffel={currentStaffel?.staffelnummer ?? 1}
            beziehungstypen={beziehungstypen}
            onSave={handleSave}
            onDelete={drawerState.mode === 'edit' ? handleDelete : undefined}
            onClose={() => setDrawerState({ mode: 'none' })}
          />
        )}

        {seedPanelOpen && !drawerOpen && (
          <SeedReviewPanel
            reihen={reihen}
            staffeln={staffeln}
            beziehungstypen={beziehungstypen}
            onClose={() => setSeedPanelOpen(false)}
            onKanteFreigegeben={() => {
              if (!selectedReihe) return
              const url = currentStaffel
                ? `/api/beziehungen?reihe=${encodeURIComponent(selectedReihe)}&staffel=${currentStaffel.staffelnummer}&produktion_id=${encodeURIComponent(currentStaffel.id)}`
                : `/api/beziehungen?reihe=${encodeURIComponent(selectedReihe)}&staffel=alle`
              fetch(url, { credentials: 'include' })
                .then(r => r.json())
                .then(graph => {
                  setNodes(prev => {
                    const posMap = new Map(prev.map(n => [n.id, n.position]))
                    return (graph.nodes ?? []).map((c: any, i: number) =>
                      apiNodeToRFNode(c, posMap.get(c.id) ?? gridPosition(i))
                    )
                  })
                  setEdges((graph.edges ?? []).map(apiEdgeToRFEdge))
                })
                .catch(console.error)
            }}
          />
        )}
      </div>

      {/* ── Diff-Legende ── */}
      {diffMode && (
        <div style={{
          position: 'absolute', bottom: 40, left: 16,
          background: '#fff', border: '1px solid #E0E0E0',
          borderRadius: 8, padding: '8px 12px', fontSize: 11,
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)', zIndex: 5,
          display: 'flex', gap: 16, alignItems: 'center',
        }}>
          {[
            { color: '#00C853', label: 'Neu' },
            { color: '#FFCC00', label: 'Geändert' },
            { color: '#FF3B30', label: 'Entfallen' },
          ].map(({ color, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 16, height: 3, background: color, borderRadius: 2 }} />
              <span style={{ color: '#555' }}>{label}</span>
            </div>
          ))}
          <span style={{ color: '#757575', marginLeft: 4 }}>
            vs. S{selectedStaffelIdx !== null ? staffeln[selectedStaffelIdx - 1]?.staffelnummer : ''}
          </span>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
export default function BeziehungsbaumPage() {
  return (
    <ReactFlowProvider>
      <BeziehungsbaumInner />
    </ReactFlowProvider>
  )
}
