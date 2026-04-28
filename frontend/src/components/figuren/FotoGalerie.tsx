import { useState, useRef, useCallback, useEffect } from 'react'
import { Star, ChevronLeft, ChevronRight, Trash2, Upload } from 'lucide-react'

interface Foto {
  id: number
  dateiname: string
  originalname: string
  label?: string | null
  sort_order: number
  ist_primaer: boolean
}

interface FotoGalerieProps {
  fotos: Foto[]
  aspect?: 'portrait' | 'landscape'
  onUpload: (file: File) => Promise<void>
  onDelete: (id: number) => Promise<void>
  onSetPrimaer: (id: number) => Promise<void>
  onLabelChange: (id: number, label: string) => Promise<void>
  onReorder: (order: { id: number; sort_order: number }[]) => Promise<void>
  uploading?: boolean
}

const FOTO_BASE = '/uploads/script-fotos/'

export default function FotoGalerie({
  fotos,
  aspect = 'portrait',
  onUpload,
  onDelete,
  onSetPrimaer,
  onLabelChange,
  onReorder,
  uploading = false,
}: FotoGalerieProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [editingLabel, setEditingLabel] = useState<number | null>(null)
  const [labelValue, setLabelValue] = useState('')
  const [dragging, setDragging] = useState(false)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const sorted = [...fotos].sort((a, b) => a.sort_order - b.sort_order)
  const active = sorted[activeIndex] ?? null

  useEffect(() => {
    if (activeIndex >= sorted.length && sorted.length > 0) setActiveIndex(sorted.length - 1)
  }, [sorted.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const prev = () => setActiveIndex(i => Math.max(0, i - 1))
  const next = () => setActiveIndex(i => Math.min(sorted.length - 1, i + 1))

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') prev()
    if (e.key === 'ArrowRight') next()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('image/')) await onUpload(file)
  }, [onUpload])

  const handleThumbDragStart = (idx: number) => (e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', String(idx))
  }

  const handleThumbDrop = async (toIdx: number) => {
    if (dragOverIdx === null) return
    const fromIdx = dragOverIdx
    if (fromIdx === toIdx) return
    const reordered = [...sorted]
    const [moved] = reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, moved)
    const order = reordered.map((f, i) => ({ id: f.id, sort_order: i + 1 }))
    await onReorder(order)
    setActiveIndex(toIdx)
    setDragOverIdx(null)
  }

  const startLabelEdit = (foto: Foto) => {
    setEditingLabel(foto.id)
    setLabelValue(foto.label ?? '')
  }

  const commitLabel = async () => {
    if (editingLabel === null) return
    await onLabelChange(editingLabel, labelValue)
    setEditingLabel(null)
  }

  const mainH = aspect === 'portrait' ? 280 : 180
  const mainW = aspect === 'portrait' ? 210 : 320

  return (
    <div
      tabIndex={0}
      onKeyDown={handleKeyDown}
      style={{ outline: 'none', display: 'flex', flexDirection: 'column', gap: 8, userSelect: 'none' }}
    >
      {/* Main view + drop zone */}
      <div
        style={{ position: 'relative', width: mainW, height: mainH }}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        {active ? (
          <>
            <img
              src={`${FOTO_BASE}${active.dateiname}`}
              alt={active.label ?? active.originalname}
              style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8, display: 'block', border: '1px solid var(--border)' }}
            />
            {/* Nav arrows */}
            {sorted.length > 1 && (
              <>
                <button onClick={prev} disabled={activeIndex === 0} style={arrowStyle('left')}>
                  <ChevronLeft size={14} />
                </button>
                <button onClick={next} disabled={activeIndex === sorted.length - 1} style={arrowStyle('right')}>
                  <ChevronRight size={14} />
                </button>
              </>
            )}
            {/* Actions */}
            <div style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 4 }}>
              <button
                onClick={() => onSetPrimaer(active.id)}
                title={active.ist_primaer ? 'Hauptbild' : 'Als Hauptbild setzen'}
                style={{ ...iconBtnStyle, background: active.ist_primaer ? '#FFD700' : 'rgba(0,0,0,0.5)', color: active.ist_primaer ? '#000' : '#fff' }}
              >
                <Star size={12} fill={active.ist_primaer ? '#000' : 'none'} />
              </button>
              <button
                onClick={() => onDelete(active.id)}
                title="Löschen"
                style={{ ...iconBtnStyle, background: 'rgba(0,0,0,0.5)', color: '#fff' }}
              >
                <Trash2 size={12} />
              </button>
            </div>
            {/* Label */}
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.45)', borderRadius: '0 0 8px 8px', padding: '4px 8px' }}>
              {editingLabel === active.id ? (
                <input
                  autoFocus
                  value={labelValue}
                  onChange={e => setLabelValue(e.target.value)}
                  onBlur={commitLabel}
                  onKeyDown={e => e.key === 'Enter' && commitLabel()}
                  style={{ width: '100%', fontSize: 11, background: 'transparent', border: 'none', outline: 'none', color: '#fff' }}
                />
              ) : (
                <span
                  onClick={() => startLabelEdit(active)}
                  style={{ fontSize: 11, color: '#fff', cursor: 'text', display: 'block', minHeight: 14 }}
                >
                  {active.label || <span style={{ opacity: 0.5 }}>Beschriftung…</span>}
                </span>
              )}
            </div>
          </>
        ) : (
          <div
            onClick={() => fileInput.current?.click()}
            style={{
              width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 8,
              border: `2px dashed ${dragging ? 'var(--text)' : 'var(--border)'}`,
              borderRadius: 8, cursor: 'pointer', background: dragging ? 'var(--bg-subtle)' : 'transparent',
            }}
          >
            <Upload size={20} style={{ opacity: 0.4 }} />
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Foto hochladen</span>
          </div>
        )}
        {dragging && active && (
          <div style={{ position: 'absolute', inset: 0, border: '2px dashed var(--text)', borderRadius: 8, background: 'rgba(0,0,0,0.1)', pointerEvents: 'none' }} />
        )}
      </div>

      {/* Upload button + counter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          onClick={() => fileInput.current?.click()}
          disabled={uploading}
          style={{ fontSize: 11, padding: '4px 10px', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', background: 'transparent', color: 'var(--text)' }}
        >
          {uploading ? 'Lädt…' : '+ Foto'}
        </button>
        {sorted.length > 0 && (
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{activeIndex + 1} / {sorted.length}</span>
        )}
        <input ref={fileInput} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = '' }} />
      </div>

      {/* Thumbnail strip */}
      {sorted.length > 1 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {sorted.map((foto, i) => (
            <div
              key={foto.id}
              draggable
              onDragStart={handleThumbDragStart(i)}
              onDragEnter={() => setDragOverIdx(i)}
              onDragOver={e => e.preventDefault()}
              onDrop={() => handleThumbDrop(i)}
              onClick={() => setActiveIndex(i)}
              style={{
                width: 40, height: 40, borderRadius: 4, overflow: 'hidden', cursor: 'pointer', flexShrink: 0,
                border: i === activeIndex ? '2px solid var(--text)' : '2px solid var(--border)',
                opacity: dragOverIdx === i ? 0.5 : 1,
              }}
            >
              <img src={`${FOTO_BASE}${foto.dateiname}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const arrowStyle = (side: 'left' | 'right'): React.CSSProperties => ({
  position: 'absolute',
  top: '50%',
  transform: 'translateY(-50%)',
  [side]: 6,
  background: 'rgba(0,0,0,0.5)',
  color: '#fff',
  border: 'none',
  borderRadius: '50%',
  width: 24,
  height: 24,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  padding: 0,
})

const iconBtnStyle: React.CSSProperties = {
  border: 'none',
  borderRadius: 4,
  width: 24,
  height: 24,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  padding: 0,
}
