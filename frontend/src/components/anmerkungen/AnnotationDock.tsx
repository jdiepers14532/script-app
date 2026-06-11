// AnnotationDock — rechte Andockzone für das AnnotationPanel: dünne Trennlinie (per Drag in der
// Breite veränderbar, Maus + Touch) mit Chevron-Button zum Aus-/Einblenden — gleiches Muster/Look
// wie die Szenenübersicht (.scene-list-handle / .scene-list-collapse-btn). Breite/Sichtbarkeit
// liegen in den Tweaks (persistent, geteilt zwischen Lese- und Bearbeitungsmodus). Alt+I togglet.
import { type MouseEvent as RMouseEvent, type TouchEvent as RTouchEvent } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTweaks } from '../../contexts'
import { AnnotationPanel } from './AnnotationPanel'

export function AnnotationDock() {
  const { tweaks, set } = useTweaks()
  const width = tweaks.annotationPanelWidth ?? 320
  const visible = tweaks.showAnnotationPanel !== false

  const startResize = (e: RMouseEvent | RTouchEvent) => {
    if (!visible) return
    e.preventDefault()
    const startX = 'touches' in e ? e.touches[0].clientX : (e as RMouseEvent).clientX
    const startW = width
    const onMove = (ev: MouseEvent | TouchEvent) => {
      const x = 'touches' in ev ? (ev as TouchEvent).touches[0].clientX : (ev as MouseEvent).clientX
      // Handle links am Panel → nach links ziehen = breiter
      set('annotationPanelWidth', Math.max(240, Math.min(680, Math.round(startW - (x - startX)))))
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onUp)
  }

  return (
    <div style={{ display: 'flex', flexShrink: 0, minWidth: 0 }}>
      {/* Trennlinie (2px via ::before) mit Chevron-Button — wie Szenenübersicht */}
      <div
        className="scene-list-handle"
        style={{ cursor: visible ? 'col-resize' : 'default' }}
        onMouseDown={visible ? startResize : undefined}
        onTouchStart={visible ? startResize : undefined}
      >
        <button
          className="scene-list-collapse-btn"
          onMouseDown={e => e.stopPropagation()}
          onClick={() => set('showAnnotationPanel', !visible)}
          title={visible ? 'Anmerkungen ausblenden (Alt+I)' : 'Anmerkungen einblenden (Alt+I)'}
        >
          {visible ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>
      {visible && (
        <div style={{ width, flexShrink: 0, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <AnnotationPanel />
        </div>
      )}
    </div>
  )
}
