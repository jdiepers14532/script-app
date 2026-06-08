import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import SceneReadView from './SceneReadView'

export interface SzeneRef {
  scene_identity_id: string
  werkstufe_id: string
  scene_nummer: number | null
  scene_nummer_suffix: string | null
  folge_nummer: number | null
  ort_name: string | null
}

interface SzeneLeseModalProps {
  /** Trefferliste in Anzeige-Reihenfolge — Vor/Zurück blättert hier durch */
  szenen: SzeneRef[]
  startIndex: number
  onClose: () => void
}

const navBtn = (enabled: boolean): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30,
  border: '1px solid var(--border)', borderRadius: 6, background: 'transparent',
  color: enabled ? 'var(--text)' : 'var(--text-secondary)',
  cursor: enabled ? 'pointer' : 'default', opacity: enabled ? 1 : 0.4, flexShrink: 0,
})

export default function SzeneLeseModal({ szenen, startIndex, onClose }: SzeneLeseModalProps) {
  const [index, setIndex] = useState(startIndex)
  const aktuell = szenen[index]
  const hasPrev = index > 0
  const hasNext = index < szenen.length - 1

  const prev = useCallback(() => setIndex(i => (i > 0 ? i - 1 : i)), [])
  const next = useCallback(() => setIndex(i => (i < szenen.length - 1 ? i + 1 : i)), [szenen.length])

  // Tastatur: ← / → navigieren, Esc schließt
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') prev()
      else if (e.key === 'ArrowRight') next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, prev, next])

  if (!aktuell) return null
  const label = `Folge ${aktuell.folge_nummer ?? '?'} · SZ ${aktuell.scene_nummer ?? '?'}${aktuell.scene_nummer_suffix ?? ''}`

  return createPortal(
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--bg)', borderRadius: 12, width: 'min(820px, 95vw)', height: 'min(90vh, 1100px)', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
          <button onClick={prev} disabled={!hasPrev} title="Vorherige Szene (←)" style={navBtn(hasPrev)}><ChevronLeft size={16} /></button>
          <button onClick={next} disabled={!hasNext} title="Nächste Szene (→)" style={navBtn(hasNext)}><ChevronRight size={16} /></button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
            {aktuell.ort_name && (
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{aktuell.ort_name}</div>
            )}
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', flexShrink: 0 }}>{index + 1} / {szenen.length}</span>
          <button onClick={onClose} title="Schließen (Esc)" style={navBtn(true)}><X size={16} /></button>
        </div>
        {/* Szene */}
        <div style={{ flex: 1, overflow: 'hidden', background: '#fff' }}>
          <SceneReadView sceneIdentityId={aktuell.scene_identity_id} werkstufeId={aktuell.werkstufe_id} />
        </div>
      </div>
    </div>,
    document.body,
  )
}
