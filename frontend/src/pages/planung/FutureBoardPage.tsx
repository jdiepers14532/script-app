import { useState, useEffect, useMemo } from 'react'
import { Plus, X, Check, Loader2, Trash2 } from 'lucide-react'
import { api } from '../../api/client'
import { useSelectedProduction } from '../../contexts'
import {
  DndContext, type DragEndEvent, useDndSensors, closestCorners,
} from '../../hooks/useDnd'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'

// ── Types ────────────────────────────────────────────────────────────────────

interface Beat {
  id: string
  strang_id: string
  ebene: string
  block_nummer: number | null
  beat_text: string | null
  prosa_text: string | null
  ist_abgearbeitet: boolean
  sort_order: number
  erstellt_am: string
  charaktere: Array<{ character_id: string; name: string; rolle: string }>
}

interface Strang {
  id: string
  name: string
  farbe: string
  sort_order: number
  status: string
  typ: string
  label: string | null
}

interface Block {
  block_nummer: number
  folge_von?: number
  folge_bis?: number
}

// ── BeatCard (draggable) ─────────────────────────────────────────────────────

function BeatCard({
  beat, isSelected, onSelect, farbe,
}: {
  beat: Beat; isSelected: boolean; onSelect: (b: Beat) => void; farbe: string
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: beat.id,
    data: { beat },
  })

  return (
    <div
      ref={setNodeRef}
      onClick={() => onSelect(beat)}
      style={{
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.45 : 1,
        marginBottom: 6,
        padding: '7px 9px',
        borderRadius: 6,
        border: isSelected ? `2px solid ${farbe}` : '1px solid var(--border)',
        background: beat.ist_abgearbeitet ? 'var(--bg-surface)' : 'var(--bg)',
        cursor: isDragging ? 'grabbing' : 'pointer',
        userSelect: 'none',
        touchAction: 'none',
        position: 'relative',
        zIndex: isDragging ? 999 : 'auto' as any,
        transition: 'border-color 0.1s',
      }}
      {...attributes}
      {...listeners}
    >
      <div style={{
        fontSize: 12, lineHeight: 1.4,
        color: beat.ist_abgearbeitet ? 'var(--text-muted)' : 'var(--text-primary)',
        textDecoration: beat.ist_abgearbeitet ? 'line-through' : 'none',
        marginBottom: beat.charaktere.length > 0 ? 4 : 0,
        wordBreak: 'break-word',
      }}>
        {beat.beat_text || (
          <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Kein Text</span>
        )}
      </div>
      {beat.charaktere.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
          {beat.charaktere.map(c => (
            <span
              key={c.character_id}
              title={c.rolle === 'haupt' ? 'Hauptfigur' : c.rolle === 'neben' ? 'Nebenfigur' : 'Erwähnt'}
              style={{
                fontSize: 10, padding: '1px 5px', borderRadius: 10, whiteSpace: 'nowrap',
                background: c.rolle === 'haupt' ? farbe + '22' : 'var(--bg-surface)',
                color: c.rolle === 'haupt' ? farbe : 'var(--text-muted)',
                border: `1px solid ${c.rolle === 'haupt' ? farbe + '55' : 'var(--border)'}`,
                fontWeight: c.rolle === 'haupt' ? 600 : 400,
              }}
            >
              {c.name}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ── BoardCell (droppable) ────────────────────────────────────────────────────

function BoardCell({
  strangId, blockNummer, beats, selectedBeatId, onSelect, farbe, onAdd,
}: {
  strangId: string
  blockNummer: number | null
  beats: Beat[]
  selectedBeatId: string | null
  onSelect: (b: Beat) => void
  farbe: string
  onAdd: (strangId: string, blockNummer: number | null) => void
}) {
  const cellId = `${strangId}__${blockNummer ?? 'none'}`
  const { setNodeRef, isOver } = useDroppable({ id: cellId })

  return (
    <div
      ref={setNodeRef}
      style={{
        minHeight: 80, padding: '6px 8px',
        background: isOver ? 'rgba(0, 123, 255, 0.05)' : 'transparent',
        borderRadius: 4, transition: 'background 0.1s',
        display: 'flex', flexDirection: 'column',
      }}
    >
      {beats.map(b => (
        <BeatCard
          key={b.id}
          beat={b}
          isSelected={b.id === selectedBeatId}
          onSelect={onSelect}
          farbe={farbe}
        />
      ))}
      <button
        onClick={() => onAdd(strangId, blockNummer)}
        style={{
          alignSelf: 'flex-start', display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 22, height: 22, borderRadius: 4, border: '1px dashed var(--border)',
          background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)',
          marginTop: beats.length > 0 ? 2 : 0, flexShrink: 0,
          transition: 'border-color 0.15s, color 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = farbe; e.currentTarget.style.color = farbe }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = ''; e.currentTarget.style.color = '' }}
        title="Beat hinzufügen"
      >
        <Plus size={11} />
      </button>
    </div>
  )
}

// ── BeatDetailPanel ──────────────────────────────────────────────────────────

const ROLLE_LABELS: Record<string, string> = { haupt: 'H', neben: 'N', erwaehnt: 'E' }
const ROLLE_TITLES: Record<string, string> = { haupt: 'Hauptfigur', neben: 'Nebenfigur', erwaehnt: 'Erwähnt' }

function BeatDetailPanel({
  beat, straenge, produktionId, onClose, onUpdate, onDelete,
}: {
  beat: Beat
  straenge: Strang[]
  produktionId: string
  onClose: () => void
  onUpdate: (updated: Beat) => void
  onDelete: (id: string) => void
}) {
  const [beatText, setBeatText] = useState(beat.beat_text ?? '')
  const [prosaText, setProsa] = useState(beat.prosa_text ?? '')
  const [isAbgearbeitet, setAbgearbeitet] = useState(beat.ist_abgearbeitet)
  const [charaktere, setCharaktere] = useState(beat.charaktere)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showCharPicker, setShowCharPicker] = useState(false)
  const [allChars, setAllChars] = useState<any[]>([])
  const [charQ, setCharQ] = useState('')

  const strang = straenge.find(s => s.id === beat.strang_id)

  // Sync when beat changes
  useEffect(() => {
    setBeatText(beat.beat_text ?? '')
    setProsa(beat.prosa_text ?? '')
    setAbgearbeitet(beat.ist_abgearbeitet)
    setCharaktere(beat.charaktere)
    setShowCharPicker(false)
    setCharQ('')
  }, [beat.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (showCharPicker && allChars.length === 0) {
      api.getCharacters(produktionId).then(setAllChars).catch(() => {})
    }
  }, [showCharPicker]) // eslint-disable-line react-hooks/exhaustive-deps

  const isDirty = beatText !== (beat.beat_text ?? '')
    || prosaText !== (beat.prosa_text ?? '')
    || isAbgearbeitet !== beat.ist_abgearbeitet

  async function save() {
    setSaving(true)
    try {
      const updated = await api.updateStrangBeat(beat.id, {
        beat_text: beatText || null,
        prosa_text: prosaText || null,
        ist_abgearbeitet: isAbgearbeitet,
      })
      onUpdate({ ...beat, ...updated, charaktere })
    } finally {
      setSaving(false)
    }
  }

  async function removeCharakter(charId: string) {
    await api.removeBeatCharakter(beat.id, charId)
    const next = charaktere.filter(c => c.character_id !== charId)
    setCharaktere(next)
    onUpdate({ ...beat, beat_text: beatText || null, prosa_text: prosaText || null, charaktere: next })
  }

  async function addCharakter(char: any, rolle: string) {
    await api.addBeatCharakter(beat.id, { character_id: char.id, rolle })
    const next = [
      ...charaktere.filter(c => c.character_id !== char.id),
      { character_id: char.id, name: char.name, rolle },
    ]
    setCharaktere(next)
    onUpdate({ ...beat, beat_text: beatText || null, prosa_text: prosaText || null, charaktere: next })
    setShowCharPicker(false)
    setCharQ('')
  }

  async function handleDelete() {
    if (!window.confirm('Beat wirklich löschen?')) return
    setDeleting(true)
    try {
      await api.deleteStrangBeat(beat.id)
      onDelete(beat.id)
    } finally {
      setDeleting(false)
    }
  }

  const tagged = new Set(charaktere.map(c => c.character_id))
  const filteredChars = (charQ
    ? allChars.filter(c => c.name.toLowerCase().includes(charQ.toLowerCase()))
    : allChars
  ).filter(c => !tagged.has(c.id)).slice(0, 20)

  return (
    <div style={{
      width: 340, flexShrink: 0, borderLeft: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', background: 'var(--bg-surface)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '11px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          {strang && (
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: strang.farbe, flexShrink: 0, display: 'inline-block' }} />
          )}
          <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>
            {strang?.name ?? 'Beat'}
          </span>
          {beat.block_nummer != null && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
              Bl.&nbsp;{beat.block_nummer}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, borderRadius: 4, display: 'flex' }}
        >
          <X size={16} />
        </button>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {/* Abgearbeitet */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, cursor: 'pointer', userSelect: 'none' }}>
          <input
            type="checkbox"
            checked={isAbgearbeitet}
            onChange={e => setAbgearbeitet(e.target.checked)}
            style={{ width: 15, height: 15, cursor: 'pointer' }}
          />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Abgearbeitet</span>
        </label>

        {/* Kurztext */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.6px' }}>
            Kurztext (Raster)
          </div>
          <textarea
            value={beatText}
            onChange={e => setBeatText(e.target.value)}
            placeholder="Kurztext für das Future-Raster…"
            style={{
              width: '100%', boxSizing: 'border-box', resize: 'vertical', minHeight: 60,
              padding: '7px 9px', borderRadius: 6, border: '1px solid var(--border)',
              background: 'var(--bg)', fontSize: 13, lineHeight: 1.5,
              color: 'var(--text-primary)', fontFamily: 'inherit',
            }}
          />
        </div>

        {/* Prosa */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.6px' }}>
            Prosa (ausformuliert)
          </div>
          <textarea
            value={prosaText}
            onChange={e => setProsa(e.target.value)}
            placeholder="Ausformulierter Beat-Text…"
            style={{
              width: '100%', boxSizing: 'border-box', resize: 'vertical', minHeight: 100,
              padding: '7px 9px', borderRadius: 6, border: '1px solid var(--border)',
              background: 'var(--bg)', fontSize: 13, lineHeight: 1.5,
              color: 'var(--text-primary)', fontFamily: 'inherit',
            }}
          />
        </div>

        {/* Save */}
        {isDirty && (
          <button
            onClick={save}
            disabled={saving}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, width: '100%',
              justifyContent: 'center', padding: '8px 16px', borderRadius: 6,
              background: '#000', color: '#fff', border: 'none',
              cursor: saving ? 'default' : 'pointer',
              fontSize: 13, fontWeight: 500, marginBottom: 16, opacity: saving ? 0.6 : 1,
            }}
          >
            {saving
              ? <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} />
              : <Check size={14} />}
            Speichern
          </button>
        )}

        {/* Figuren */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
              Figuren
            </div>
            <button
              onClick={() => setShowCharPicker(p => !p)}
              style={{
                display: 'flex', alignItems: 'center', gap: 3, padding: '2px 8px',
                borderRadius: 4, border: '1px solid var(--border)', background: 'transparent',
                cursor: 'pointer', fontSize: 11, color: 'var(--text-muted)',
              }}
            >
              <Plus size={10} /> Figur
            </button>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: showCharPicker ? 8 : 0 }}>
            {charaktere.length === 0 && !showCharPicker && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                Keine Figuren getaggt
              </span>
            )}
            {charaktere.map(c => (
              <div key={c.character_id} style={{
                display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px',
                borderRadius: 12, background: 'var(--bg)', border: '1px solid var(--border)', fontSize: 12,
              }}>
                <span style={{ color: 'var(--text-primary)' }}>{c.name}</span>
                <span title={ROLLE_TITLES[c.rolle]} style={{ color: 'var(--text-muted)', fontSize: 10, fontWeight: 600 }}>
                  {ROLLE_LABELS[c.rolle] ?? c.rolle}
                </span>
                <button
                  onClick={() => removeCharakter(c.character_id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'flex' }}
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>

          {showCharPicker && (
            <div>
              <input
                autoFocus
                value={charQ}
                onChange={e => setCharQ(e.target.value)}
                placeholder="Figur suchen…"
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '6px 9px',
                  borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)',
                  fontSize: 12, marginBottom: 4,
                }}
              />
              <div style={{ maxHeight: 180, overflow: 'auto', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)' }}>
                {filteredChars.length === 0 ? (
                  <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    {allChars.length === 0 ? 'Lädt…' : 'Keine Treffer'}
                  </div>
                ) : filteredChars.map(c => (
                  <div key={c.id} style={{ padding: '5px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>{c.name}</span>
                    <div style={{ display: 'flex', gap: 3 }}>
                      {(['haupt', 'neben', 'erwaehnt'] as const).map(rolle => (
                        <button
                          key={rolle}
                          onClick={() => addCharakter(c, rolle)}
                          title={ROLLE_TITLES[rolle]}
                          style={{
                            padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border)',
                            background: 'transparent', cursor: 'pointer', fontSize: 10, color: 'var(--text-muted)',
                          }}
                        >
                          {ROLLE_LABELS[rolle]}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer: Delete */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
        <button
          onClick={handleDelete}
          disabled={deleting}
          style={{
            width: '100%', padding: '7px 16px', borderRadius: 6,
            border: '1px solid #FF3B30', background: 'transparent',
            cursor: deleting ? 'default' : 'pointer', color: '#FF3B30',
            fontSize: 13, fontWeight: 500,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            opacity: deleting ? 0.6 : 1,
          }}
        >
          {deleting
            ? <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} />
            : <Trash2 size={13} />}
          Beat löschen
        </button>
      </div>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────

const ROW_HEADER_W = 180
const COL_W = 200

export default function FutureBoardPage() {
  const { selectedProduction } = useSelectedProduction()
  const [straenge, setStraenge] = useState<Strang[]>([])
  const [beats, setBeats] = useState<Beat[]>([])
  const [blocks, setBlocks] = useState<Block[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedBeatId, setSelectedBeatId] = useState<string | null>(null)
  const sensors = useDndSensors()

  const prodId = selectedProduction?.id ?? null

  useEffect(() => {
    if (!prodId) { setStraenge([]); setBeats([]); setBlocks([]); return }
    setLoading(true)
    setSelectedBeatId(null)
    Promise.all([
      api.getBoardData(prodId),
      api.getBloecke(prodId).catch(() => []),
    ]).then(([board, blks]) => {
      setStraenge(board.straenge ?? [])
      setBeats(board.beats ?? [])
      setBlocks(Array.isArray(blks) ? blks : [])
    }).catch(() => {}).finally(() => setLoading(false))
  }, [prodId])

  // Block columns: merge ProdDB blocks + beat-derived
  const blockColumns = useMemo<number[]>(() => {
    const fromBlocks = blocks.map(b => b.block_nummer)
    const fromBeats = beats
      .filter(b => b.block_nummer != null)
      .map(b => b.block_nummer as number)
    return Array.from(new Set([...fromBlocks, ...fromBeats])).sort((a, b) => a - b)
  }, [blocks, beats])

  // Beat map: strangId → blockKey → Beat[] (sorted by sort_order)
  const beatMap = useMemo(() => {
    const map: Record<string, Record<string, Beat[]>> = {}
    for (const b of beats) {
      const key = b.block_nummer != null ? String(b.block_nummer) : 'none'
      if (!map[b.strang_id]) map[b.strang_id] = {}
      if (!map[b.strang_id][key]) map[b.strang_id][key] = []
      map[b.strang_id][key].push(b)
    }
    for (const cells of Object.values(map)) {
      for (const arr of Object.values(cells)) {
        arr.sort((a, b) => a.sort_order - b.sort_order)
      }
    }
    return map
  }, [beats])

  // Always show "Ohne Block" column when no block columns exist, or when beats with no block exist
  const showNoneCol = beats.some(b => b.block_nummer == null) || blockColumns.length === 0

  function getBlockLabel(bn: number) {
    const b = blocks.find(x => x.block_nummer === bn)
    if (b?.folge_von != null && b.folge_bis != null) {
      return `Block ${bn}\nF${b.folge_von}–${b.folge_bis}`
    }
    return `Block ${bn}`
  }

  const selectedBeat = beats.find(b => b.id === selectedBeatId) ?? null

  async function handleAddBeat(strangId: string, blockNummer: number | null) {
    try {
      const created = await api.createStrangBeat(strangId, { ebene: 'future', block_nummer: blockNummer })
      const beat: Beat = { ...created, charaktere: [] }
      setBeats(prev => [...prev, beat])
      setSelectedBeatId(beat.id)
    } catch {}
  }

  function handleBeatUpdate(updated: Beat) {
    setBeats(prev => prev.map(b => b.id === updated.id ? updated : b))
  }

  function handleBeatDelete(beatId: string) {
    setBeats(prev => prev.filter(b => b.id !== beatId))
    if (selectedBeatId === beatId) setSelectedBeatId(null)
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return
    const beatId = active.id as string
    const cellId = over.id as string
    const sep = cellId.lastIndexOf('__')
    if (sep === -1) return

    const targetStrangId = cellId.slice(0, sep)
    const blockPart = cellId.slice(sep + 2)
    const targetBlock = blockPart === 'none' ? null : Number(blockPart)

    const beat = beats.find(b => b.id === beatId)
    if (!beat) return
    if (beat.strang_id === targetStrangId && beat.block_nummer === targetBlock) return

    // Optimistic update
    setBeats(prev => prev.map(b =>
      b.id === beatId ? { ...b, strang_id: targetStrangId, block_nummer: targetBlock } : b
    ))
    api.updateStrangBeat(beatId, { strang_id: targetStrangId, block_nummer: targetBlock })
      .catch(() => {
        setBeats(prev => prev.map(b =>
          b.id === beatId
            ? { ...b, strang_id: beat.strang_id, block_nummer: beat.block_nummer }
            : b
        ))
      })
  }

  const totalCols = blockColumns.length + (showNoneCol ? 1 : 0)
  const minWidth = ROW_HEADER_W + COL_W * totalCols

  if (!prodId) return null

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Loader2 size={22} style={{ animation: 'spin 0.8s linear infinite', color: 'var(--text-muted)' }} />
        </div>
      ) : straenge.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          Keine Stränge vorhanden. Stränge über die Strang-Verwaltung anlegen.
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

            {/* Board scroll area */}
            <div style={{ flex: 1, overflow: 'auto' }}>
              <div style={{ display: 'inline-block', minWidth }}>

                {/* Header row — sticky top */}
                <div style={{
                  display: 'flex', position: 'sticky', top: 0, zIndex: 4,
                  background: 'var(--bg-surface)', borderBottom: '2px solid var(--border)',
                }}>
                  {/* Corner */}
                  <div style={{
                    width: ROW_HEADER_W, flexShrink: 0,
                    position: 'sticky', left: 0, zIndex: 5, background: 'var(--bg-surface)',
                    borderRight: '1px solid var(--border)',
                    padding: '9px 14px', fontSize: 10, fontWeight: 600,
                    color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px',
                    display: 'flex', alignItems: 'center',
                  }}>
                    Strang
                  </div>
                  {blockColumns.map(bn => (
                    <div key={bn} style={{
                      width: COL_W, flexShrink: 0, borderRight: '1px solid var(--border)',
                      padding: '7px 12px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
                      textAlign: 'center', whiteSpace: 'pre-line', lineHeight: 1.4,
                    }}>
                      {getBlockLabel(bn)}
                    </div>
                  ))}
                  {showNoneCol && (
                    <div style={{
                      width: COL_W, flexShrink: 0, borderRight: '1px solid var(--border)',
                      padding: '7px 12px', fontSize: 11, fontWeight: 600,
                      color: 'var(--text-muted)', textAlign: 'center',
                    }}>
                      Ohne Block
                    </div>
                  )}
                </div>

                {/* Strand rows */}
                {straenge.map(s => (
                  <div key={s.id} style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
                    {/* Row header — sticky left */}
                    <div style={{
                      width: ROW_HEADER_W, flexShrink: 0,
                      position: 'sticky', left: 0, zIndex: 2, background: 'var(--bg-surface)',
                      borderRight: '1px solid var(--border)',
                      padding: '12px 14px', minHeight: 90,
                      display: 'flex', flexDirection: 'column', justifyContent: 'flex-start',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
                        <span style={{
                          width: 9, height: 9, borderRadius: '50%', background: s.farbe,
                          flexShrink: 0, display: 'inline-block', marginTop: 3,
                        }} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.3, wordBreak: 'break-word' }}>
                            {s.name}
                          </div>
                          {s.label && (
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{s.label}</div>
                          )}
                          {s.status !== 'aktiv' && (
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic', marginTop: 2 }}>{s.status}</div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Block cells */}
                    {blockColumns.map(bn => (
                      <div key={bn} style={{ width: COL_W, flexShrink: 0, borderRight: '1px solid var(--border)' }}>
                        <BoardCell
                          strangId={s.id}
                          blockNummer={bn}
                          beats={beatMap[s.id]?.[String(bn)] ?? []}
                          selectedBeatId={selectedBeatId}
                          onSelect={b => setSelectedBeatId(prev => prev === b.id ? null : b.id)}
                          farbe={s.farbe}
                          onAdd={handleAddBeat}
                        />
                      </div>
                    ))}

                    {/* "Ohne Block" cell */}
                    {showNoneCol && (
                      <div style={{ width: COL_W, flexShrink: 0, borderRight: '1px solid var(--border)' }}>
                        <BoardCell
                          strangId={s.id}
                          blockNummer={null}
                          beats={beatMap[s.id]?.['none'] ?? []}
                          selectedBeatId={selectedBeatId}
                          onSelect={b => setSelectedBeatId(prev => prev === b.id ? null : b.id)}
                          farbe={s.farbe}
                          onAdd={handleAddBeat}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Detail panel */}
            {selectedBeat && (
              <BeatDetailPanel
                key={selectedBeat.id}
                beat={selectedBeat}
                straenge={straenge}
                produktionId={prodId}
                onClose={() => setSelectedBeatId(null)}
                onUpdate={handleBeatUpdate}
                onDelete={handleBeatDelete}
              />
            )}
          </div>
        </DndContext>
      )}
    </>
  )
}
