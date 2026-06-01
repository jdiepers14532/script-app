import { useState, useEffect, useMemo, useRef } from 'react'
import { Plus, X, Loader2, AlertTriangle, CheckCircle, ChevronDown } from 'lucide-react'
import { api } from '../../api/client'
import { useSelectedProduction } from '../../contexts'
import {
  DndContext, type DragEndEvent, useDndSensors, closestCorners,
} from '../../hooks/useDnd'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'

// ── Types ─────────────────────────────────────────────────────────────────────

interface RollenEinsatz {
  id: string
  character_id: string
  character_name: string
  character_farbe: string | null
  block_von: number
  block_bis: number
  status: 'geplant' | 'fix'
  notiz: string | null
  erstellt_am: string
}

interface Character {
  id: string
  name: string
  farbe: string | null
  nummer: number | null
}

interface Block {
  block_nummer: number
  folge_von?: number
  folge_bis?: number
}

interface Befund {
  id: string
  typ: string
  block_nummer: number
  beschreibung: string
  character_name: string
}

// ── Farben für Gantt-Balken (nach character_id deterministisch) ────────────────

const BAR_COLORS = [
  '#007AFF', '#FF9500', '#AF52DE', '#00C853', '#FF3B30',
  '#32ADE6', '#FF2D55', '#5856D6', '#FF6B35', '#34C759',
]

function charColor(id: string, farbe: string | null) {
  if (farbe) return farbe
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return BAR_COLORS[h % BAR_COLORS.length]
}

// ── Draggable Bar ─────────────────────────────────────────────────────────────

function DraggableBar({
  eintrag, colWidth, blockColumns, isSelected, onClick,
}: {
  eintrag: RollenEinsatz
  colWidth: number
  blockColumns: number[]
  isSelected: boolean
  onClick: () => void
}) {
  const startIdx = blockColumns.indexOf(eintrag.block_von)
  const endIdx   = blockColumns.indexOf(eintrag.block_bis)
  if (startIdx === -1 || endIdx === -1) return null

  const left  = startIdx * colWidth
  const width = (endIdx - startIdx + 1) * colWidth - 4

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: eintrag.id,
    data: { eintrag },
  })

  const color = charColor(eintrag.character_id, eintrag.character_farbe)

  return (
    <div
      ref={setNodeRef}
      onClick={e => { e.stopPropagation(); onClick() }}
      style={{
        position: 'absolute',
        left, top: 6, height: 28,
        width: Math.max(width, colWidth - 4),
        background: isSelected ? color : color + 'CC',
        borderRadius: 6,
        border: isSelected ? `2px solid ${color}` : `1px solid ${color}88`,
        boxShadow: isSelected ? `0 0 0 2px ${color}44` : 'none',
        display: 'flex', alignItems: 'center',
        paddingLeft: 8, paddingRight: 4,
        cursor: isDragging ? 'grabbing' : 'pointer',
        transform: CSS.Translate.toString(transform),
        zIndex: isDragging ? 10 : isSelected ? 3 : 1,
        opacity: isDragging ? 0.75 : 1,
        transition: isDragging ? 'none' : 'opacity 0.15s',
        userSelect: 'none',
        overflow: 'hidden',
      }}
      {...listeners}
      {...attributes}
    >
      <span style={{ fontSize: 11, fontWeight: 500, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {eintrag.status === 'fix' && <span style={{ marginRight: 4 }}>🔒</span>}
        {eintrag.block_von === eintrag.block_bis
          ? `Bl. ${eintrag.block_von}`
          : `Bl. ${eintrag.block_von}–${eintrag.block_bis}`}
      </span>
    </div>
  )
}

// ── Droppable Cell ─────────────────────────────────────────────────────────────

function DroppableCell({ id, colWidth }: { id: string; colWidth: number }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div
      ref={setNodeRef}
      style={{
        position: 'absolute',
        left: 0, top: 0, bottom: 0,
        width: colWidth,
        background: isOver ? 'rgba(0,122,255,0.08)' : 'transparent',
        transition: 'background 0.1s',
        pointerEvents: 'all',
      }}
    />
  )
}

// ── Detail Panel (inline) ──────────────────────────────────────────────────────

function EinsatzDetailPanel({
  eintrag, blockColumns, onClose, onUpdate, onDelete,
}: {
  eintrag: RollenEinsatz
  blockColumns: number[]
  onClose: () => void
  onUpdate: (updated: RollenEinsatz) => void
  onDelete: (id: string) => void
}) {
  const [blockVon, setBlockVon] = useState(eintrag.block_von)
  const [blockBis, setBlockBis] = useState(eintrag.block_bis)
  const [status, setStatus] = useState<'geplant' | 'fix'>(eintrag.status)
  const [notiz, setNotiz] = useState(eintrag.notiz ?? '')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const changed = blockVon !== eintrag.block_von || blockBis !== eintrag.block_bis
    || status !== eintrag.status || notiz !== (eintrag.notiz ?? '')

  async function handleSave() {
    if (blockBis < blockVon) return
    setSaving(true)
    try {
      const updated = await api.updateEinsatz(eintrag.id, {
        block_von: blockVon, block_bis: blockBis, status, notiz: notiz || null,
      })
      onUpdate(updated)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Einsatz-Eintrag für „${eintrag.character_name}" wirklich löschen?`)) return
    setDeleting(true)
    try {
      await api.deleteEinsatz(eintrag.id)
      onDelete(eintrag.id)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div style={{
      position: 'absolute', right: 0, top: 0, bottom: 0,
      width: 280, background: 'var(--bg-surface)',
      borderLeft: '1px solid var(--border)',
      boxShadow: '-4px 0 16px rgba(0,0,0,0.08)',
      display: 'flex', flexDirection: 'column', zIndex: 20,
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
            {eintrag.character_name}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>Einsatz bearbeiten</div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, display: 'flex' }}>
          <X size={16} />
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
        {/* Block-Von */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Von Block</label>
          <select
            value={blockVon}
            onChange={e => {
              const v = Number(e.target.value)
              setBlockVon(v)
              if (blockBis < v) setBlockBis(v)
            }}
            style={{
              width: '100%', padding: '6px 9px', borderRadius: 6,
              border: '1px solid var(--border)', background: 'var(--bg)',
              fontSize: 13, color: 'var(--text-primary)',
            }}
          >
            {blockColumns.map(bn => (
              <option key={bn} value={bn}>Block {bn}</option>
            ))}
          </select>
        </div>

        {/* Block-Bis */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Bis Block</label>
          <select
            value={blockBis}
            onChange={e => setBlockBis(Number(e.target.value))}
            style={{
              width: '100%', padding: '6px 9px', borderRadius: 6,
              border: '1px solid var(--border)', background: 'var(--bg)',
              fontSize: 13, color: 'var(--text-primary)',
            }}
          >
            {blockColumns.filter(bn => bn >= blockVon).map(bn => (
              <option key={bn} value={bn}>Block {bn}</option>
            ))}
          </select>
        </div>

        {/* Status */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Status</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['geplant', 'fix'] as const).map(s => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                style={{
                  flex: 1, padding: '6px 8px', borderRadius: 6, fontSize: 12,
                  border: `1px solid ${status === s ? '#000' : 'var(--border)'}`,
                  background: status === s ? '#000' : 'var(--bg)',
                  color: status === s ? '#fff' : 'var(--text-primary)',
                  cursor: 'pointer',
                }}
              >
                {s === 'geplant' ? 'Geplant' : '🔒 Fix'}
              </button>
            ))}
          </div>
        </div>

        {/* Notiz */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Notiz</label>
          <textarea
            value={notiz}
            onChange={e => setNotiz(e.target.value)}
            rows={3}
            placeholder="Optionale Notiz…"
            style={{
              width: '100%', boxSizing: 'border-box', padding: '6px 9px', borderRadius: 6,
              border: '1px solid var(--border)', background: 'var(--bg)',
              fontSize: 12, color: 'var(--text-primary)', resize: 'vertical',
            }}
          />
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <button
          onClick={handleSave}
          disabled={saving || !changed || blockBis < blockVon}
          style={{
            padding: '7px 16px', borderRadius: 6, border: 'none',
            background: changed && blockBis >= blockVon ? '#000' : 'var(--border)',
            color: changed && blockBis >= blockVon ? '#fff' : 'var(--text-muted)',
            cursor: saving || !changed || blockBis < blockVon ? 'default' : 'pointer',
            fontSize: 13, fontWeight: 500,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          {saving && <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} />}
          Speichern
        </button>
        <button
          onClick={handleDelete}
          disabled={deleting}
          style={{
            padding: '7px 16px', borderRadius: 6,
            border: '1px solid #FF3B30', background: 'transparent',
            color: '#FF3B30', cursor: deleting ? 'default' : 'pointer',
            fontSize: 13, fontWeight: 500,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          {deleting && <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} />}
          Eintrag löschen
        </button>
      </div>
    </div>
  )
}

// ── Add Dialog ─────────────────────────────────────────────────────────────────

function AddEinsatzDialog({
  characters, blockColumns, defaultCharId, prodId,
  onClose, onCreated,
}: {
  characters: Character[]
  blockColumns: number[]
  defaultCharId?: string
  prodId: string
  onClose: () => void
  onCreated: (e: RollenEinsatz) => void
}) {
  const [charId, setCharId] = useState(defaultCharId ?? (characters[0]?.id ?? ''))
  const [blockVon, setBlockVon] = useState(blockColumns[0] ?? 0)
  const [blockBis, setBlockBis] = useState(blockColumns[0] ?? 0)
  const [status, setStatus] = useState<'geplant' | 'fix'>('geplant')
  const [saving, setSaving] = useState(false)

  async function handleCreate() {
    if (!charId || blockBis < blockVon) return
    setSaving(true)
    try {
      const created = await api.createEinsatz({ produktion_id: prodId, character_id: charId, block_von: blockVon, block_bis: blockBis, status })
      onCreated(created)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9000 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        width: 360, background: 'var(--bg-surface)', borderRadius: 12,
        boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Neuer Einsatz-Eintrag</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, display: 'flex' }}>
            <X size={16} />
          </button>
        </div>
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Rolle</label>
            <select
              value={charId}
              onChange={e => setCharId(e.target.value)}
              style={{ width: '100%', padding: '6px 9px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13, color: 'var(--text-primary)' }}
            >
              {characters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Von Block</label>
              <select value={blockVon} onChange={e => { const v = Number(e.target.value); setBlockVon(v); if (blockBis < v) setBlockBis(v) }}
                style={{ width: '100%', padding: '6px 9px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13, color: 'var(--text-primary)' }}>
                {blockColumns.map(bn => <option key={bn} value={bn}>Block {bn}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Bis Block</label>
              <select value={blockBis} onChange={e => setBlockBis(Number(e.target.value))}
                style={{ width: '100%', padding: '6px 9px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13, color: 'var(--text-primary)' }}>
                {blockColumns.filter(bn => bn >= blockVon).map(bn => <option key={bn} value={bn}>Block {bn}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['geplant', 'fix'] as const).map(s => (
              <button key={s} onClick={() => setStatus(s)}
                style={{ flex: 1, padding: '6px 8px', borderRadius: 6, fontSize: 12, border: `1px solid ${status === s ? '#000' : 'var(--border)'}`, background: status === s ? '#000' : 'var(--bg)', color: status === s ? '#fff' : 'var(--text-primary)', cursor: 'pointer' }}>
                {s === 'geplant' ? 'Geplant' : '🔒 Fix'}
              </button>
            ))}
          </div>
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)' }}>
          <button
            onClick={handleCreate}
            disabled={saving || !charId || blockBis < blockVon}
            style={{
              width: '100%', padding: '8px 16px', borderRadius: 6, border: 'none',
              background: charId && blockBis >= blockVon ? '#000' : 'var(--border)',
              color: charId && blockBis >= blockVon ? '#fff' : 'var(--text-muted)',
              cursor: saving || !charId || blockBis < blockVon ? 'default' : 'pointer',
              fontSize: 13, fontWeight: 500,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            {saving && <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} />}
            Anlegen
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

const ROW_H    = 40
const COL_W    = 120
const ROW_HEADER_W = 200

export default function RollenEinsatzPage() {
  const { selectedProduction } = useSelectedProduction()
  const [eintraege, setEintraege] = useState<RollenEinsatz[]>([])
  const [characters, setCharacters] = useState<Character[]>([])
  const [blocks, setBlocks] = useState<Block[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [addForCharId, setAddForCharId] = useState<string | undefined>()
  const [abgleichLoading, setAbgleichLoading] = useState(false)
  const [abgleichResult, setAbgleichResult] = useState<{ befunde: Befund[]; summary: { luecken: number; ueberschuesse: number; gesamt: number } } | null>(null)
  const [showBefunde, setShowBefunde] = useState(false)
  const sensors = useDndSensors()

  const prodId = selectedProduction?.id ?? null

  useEffect(() => {
    if (!prodId) { setEintraege([]); setCharacters([]); setBlocks([]); return }
    setLoading(true)
    setSelectedId(null)
    setAbgleichResult(null)
    Promise.all([
      api.getEinsatz(prodId),
      api.getBloecke(prodId).catch(() => []),
    ]).then(([data, blks]) => {
      setEintraege(data.eintraege ?? [])
      setCharacters(data.characters ?? [])
      setBlocks(Array.isArray(blks) ? blks : [])
    }).catch(() => {}).finally(() => setLoading(false))
  }, [prodId])

  // Block columns: merge ProdDB + einsatz-derived
  const blockColumns = useMemo<number[]>(() => {
    const fromBlocks = blocks.map(b => b.block_nummer)
    const fromEinsatz = eintraege.flatMap(e => {
      const result: number[] = []
      for (let b = e.block_von; b <= e.block_bis; b++) result.push(b)
      return result
    })
    return Array.from(new Set([...fromBlocks, ...fromEinsatz])).sort((a, b) => a - b)
  }, [blocks, eintraege])

  // Rows: characters that have at least one einsatz OR are in the character list
  const rowCharacters = useMemo(() => {
    const withEinsatz = new Set(eintraege.map(e => e.character_id))
    return characters.filter(c => withEinsatz.has(c.id))
  }, [characters, eintraege])

  // Alle Characters für "Neu anlegen" (alle aktiven)
  const allCharacters = characters

  function getBlockLabel(bn: number) {
    const b = blocks.find(x => x.block_nummer === bn)
    if (b?.folge_von != null && b.folge_bis != null) return `Bl.${bn}\nF${b.folge_von}–${b.folge_bis}`
    return `Block ${bn}`
  }

  const selectedEintrag = eintraege.find(e => e.id === selectedId) ?? null

  function handleEintragUpdate(updated: RollenEinsatz) {
    setEintraege(prev => prev.map(e => e.id === updated.id ? updated : e))
  }

  function handleEintragDelete(id: string) {
    setEintraege(prev => prev.filter(e => e.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  function handleCreated(e: RollenEinsatz) {
    setEintraege(prev => [...prev, e])
    setShowAddDialog(false)
    setSelectedId(e.id)
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return

    // over.id format: `${character_id}__${block_nummer}`
    const overId = over.id as string
    const sep = overId.lastIndexOf('__')
    if (sep === -1) return
    const targetBlock = Number(overId.slice(sep + 2))
    if (isNaN(targetBlock)) return

    const eintrag = eintraege.find(e => e.id === active.id)
    if (!eintrag) return

    const span = eintrag.block_bis - eintrag.block_von
    const newVon = targetBlock
    const newBis = targetBlock + span

    if (newVon === eintrag.block_von && newBis === eintrag.block_bis) return

    // Check new range fits in known columns
    if (!blockColumns.includes(newVon)) return

    // Optimistic update
    setEintraege(prev => prev.map(e =>
      e.id === eintrag.id ? { ...e, block_von: newVon, block_bis: newBis } : e
    ))
    api.updateEinsatz(eintrag.id, { block_von: newVon, block_bis: newBis }).catch(() => {
      setEintraege(prev => prev.map(e =>
        e.id === eintrag.id ? { ...e, block_von: eintrag.block_von, block_bis: eintrag.block_bis } : e
      ))
    })
  }

  async function handleAbgleich() {
    if (!prodId) return
    setAbgleichLoading(true)
    try {
      const result = await api.runCastAbgleich(prodId)
      setAbgleichResult(result)
      setShowBefunde(true)
    } catch (err: any) {
      alert(err?.message || 'Abgleich-Fehler')
    } finally {
      setAbgleichLoading(false)
    }
  }

  const totalW = ROW_HEADER_W + blockColumns.length * COL_W

  if (!prodId) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
        Keine Produktion ausgewählt.
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 size={24} style={{ animation: 'spin 0.8s linear infinite', color: 'var(--text-muted)' }} />
      </div>
    )
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>

        {/* Toolbar */}
        <div style={{
          padding: '10px 20px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
          background: 'var(--bg-surface)',
        }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>
            Rollen-Einsatzplanung
          </div>

          {/* Befund-Badge */}
          {abgleichResult && abgleichResult.summary.gesamt > 0 && (
            <button
              onClick={() => setShowBefunde(v => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '5px 10px', borderRadius: 6,
                border: '1px solid #FF9500', background: 'rgba(255,149,0,0.08)',
                cursor: 'pointer', fontSize: 12, color: '#FF9500',
              }}
            >
              <AlertTriangle size={13} />
              {abgleichResult.summary.gesamt} Befund{abgleichResult.summary.gesamt !== 1 ? 'e' : ''}
              <ChevronDown size={12} style={{ transform: showBefunde ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
            </button>
          )}
          {abgleichResult && abgleichResult.summary.gesamt === 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#00C853' }}>
              <CheckCircle size={13} />Keine Befunde
            </div>
          )}

          <button
            onClick={handleAbgleich}
            disabled={abgleichLoading}
            style={{
              padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)',
              background: 'var(--bg)', cursor: abgleichLoading ? 'default' : 'pointer',
              fontSize: 12, color: 'var(--text-primary)',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            {abgleichLoading && <Loader2 size={12} style={{ animation: 'spin 0.8s linear infinite' }} />}
            Abgleich mit Future
          </button>

          <button
            onClick={() => { setAddForCharId(undefined); setShowAddDialog(true) }}
            style={{
              padding: '6px 12px', borderRadius: 6, border: 'none',
              background: '#000', color: '#fff', cursor: 'pointer',
              fontSize: 12, fontWeight: 500,
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <Plus size={13} /> Neu
          </button>
        </div>

        {/* Befunde Panel */}
        {showBefunde && abgleichResult && abgleichResult.befunde.length > 0 && (
          <div style={{
            borderBottom: '1px solid var(--border)', background: 'var(--bg)',
            maxHeight: 200, overflow: 'auto', flexShrink: 0,
          }}>
            {abgleichResult.befunde.map(bf => (
              <div key={bf.id} style={{
                padding: '8px 20px', borderBottom: '1px solid var(--border)',
                display: 'flex', alignItems: 'flex-start', gap: 10,
              }}>
                <AlertTriangle size={13} style={{ color: bf.typ === 'cast_luecke' ? '#FF9500' : '#FF3B30', flexShrink: 0, marginTop: 1 }} />
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>{bf.beschreibung}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                    {bf.typ === 'cast_luecke' ? 'Lücke (Plan ohne Future)' : 'Überschuss (Future ohne Plan)'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Gantt */}
        <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
          <div style={{ display: 'inline-block', minWidth: totalW, position: 'relative' }}>

            {/* Header row */}
            <div style={{
              display: 'flex', position: 'sticky', top: 0, zIndex: 4,
              background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)',
            }}>
              {/* Corner */}
              <div style={{
                width: ROW_HEADER_W, flexShrink: 0, padding: '8px 16px',
                borderRight: '1px solid var(--border)',
                fontSize: 11, color: 'var(--text-muted)', fontWeight: 600,
                position: 'sticky', left: 0, background: 'var(--bg-surface)', zIndex: 5,
              }}>
                ROLLE
              </div>
              {blockColumns.map(bn => (
                <div key={bn} style={{
                  width: COL_W, flexShrink: 0, padding: '8px 10px',
                  borderRight: '1px solid var(--border)',
                  fontSize: 11, color: 'var(--text-muted)', fontWeight: 500,
                  whiteSpace: 'pre-line', lineHeight: 1.3,
                }}>
                  {getBlockLabel(bn)}
                </div>
              ))}
            </div>

            {/* Rows */}
            {rowCharacters.length === 0 ? (
              <div style={{
                padding: '48px 24px', textAlign: 'center',
                color: 'var(--text-muted)', fontSize: 13,
              }}>
                Noch keine Einträge. Klicke auf „Neu" um einen Einsatz anzulegen.
              </div>
            ) : rowCharacters.map(char => {
              const charEintraege = eintraege.filter(e => e.character_id === char.id)
              const color = charColor(char.id, char.farbe)

              return (
                <div key={char.id} style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
                  {/* Row header */}
                  <div style={{
                    width: ROW_HEADER_W, flexShrink: 0, height: ROW_H,
                    display: 'flex', alignItems: 'center', padding: '0 16px',
                    borderRight: '1px solid var(--border)',
                    position: 'sticky', left: 0, background: 'var(--bg-surface)', zIndex: 2,
                    gap: 6,
                  }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {char.name}
                    </span>
                    <button
                      onClick={() => { setAddForCharId(char.id); setShowAddDialog(true) }}
                      title="Einsatz anlegen"
                      style={{
                        marginLeft: 'auto', width: 22, height: 22, borderRadius: 4,
                        border: '1px solid var(--border)', background: 'transparent',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'var(--text-muted)', flexShrink: 0,
                      }}
                    >
                      <Plus size={11} />
                    </button>
                  </div>

                  {/* Cells + Bars */}
                  <div style={{
                    position: 'relative',
                    width: blockColumns.length * COL_W,
                    height: ROW_H,
                    flexShrink: 0,
                  }}>
                    {/* Drop targets per cell */}
                    {blockColumns.map((bn, colIdx) => (
                      <div key={bn} style={{ position: 'absolute', left: colIdx * COL_W, top: 0, width: COL_W, height: ROW_H }}>
                        <DroppableCell id={`${char.id}__${bn}`} colWidth={COL_W} />
                        {colIdx < blockColumns.length - 1 && (
                          <div style={{ position: 'absolute', right: 0, top: 4, bottom: 4, width: 1, background: 'var(--border)' }} />
                        )}
                      </div>
                    ))}
                    {/* Draggable bars */}
                    {charEintraege.map(e => (
                      <DraggableBar
                        key={e.id}
                        eintrag={e}
                        colWidth={COL_W}
                        blockColumns={blockColumns}
                        isSelected={selectedId === e.id}
                        onClick={() => setSelectedId(prev => prev === e.id ? null : e.id)}
                      />
                    ))}
                  </div>
                </div>
              )
            })}

            {/* Characters without einsatz (collapsed list) */}
            {allCharacters.length > 0 && (
              <div style={{
                padding: '12px 16px', borderTop: rowCharacters.length === 0 ? 'none' : '2px dashed var(--border)',
              }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
                  Weitere Rollen ohne Eintrag ({allCharacters.filter(c => !rowCharacters.some(r => r.id === c.id)).length}):
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {allCharacters
                    .filter(c => !rowCharacters.some(r => r.id === c.id))
                    .map(c => (
                      <button
                        key={c.id}
                        onClick={() => { setAddForCharId(c.id); setShowAddDialog(true) }}
                        style={{
                          padding: '3px 8px', borderRadius: 12, fontSize: 11,
                          border: '1px solid var(--border)', background: 'var(--bg)',
                          color: 'var(--text-muted)', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 4,
                        }}
                      >
                        <Plus size={9} />{c.name}
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Detail Panel */}
        {selectedEintrag && (
          <EinsatzDetailPanel
            eintrag={selectedEintrag}
            blockColumns={blockColumns}
            onClose={() => setSelectedId(null)}
            onUpdate={handleEintragUpdate}
            onDelete={handleEintragDelete}
          />
        )}

        {/* Add Dialog */}
        {showAddDialog && (
          <AddEinsatzDialog
            characters={allCharacters}
            blockColumns={blockColumns}
            defaultCharId={addForCharId}
            prodId={prodId}
            onClose={() => setShowAddDialog(false)}
            onCreated={handleCreated}
          />
        )}
      </div>
    </DndContext>
  )
}
