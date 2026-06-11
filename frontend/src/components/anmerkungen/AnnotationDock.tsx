// AnnotationDock — rechte Andockzone für das AnnotationPanel: per Drag an der Trennlinie in der
// Breite veränderbar (Maus + Touch) und komplett ausblendbar (Button + Alt+I). Breite/Sichtbarkeit
// liegen in den Tweaks (persistent, geteilt zwischen Lese- und Bearbeitungsmodus).
import { type MouseEvent as RMouseEvent, type TouchEvent as RTouchEvent } from 'react'
import { useTweaks } from '../../contexts'
import { AnnotationPanel } from './AnnotationPanel'
import { PanelRightOpen, PanelRightClose } from 'lucide-react'

export function AnnotationDock() {
  const { tweaks, set } = useTweaks()
  const width = tweaks.annotationPanelWidth ?? 320
  const visible = tweaks.showAnnotationPanel !== false

  const startResize = (e: RMouseEvent | RTouchEvent) => {
    e.preventDefault()
    const startX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX
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

  // Ausgeblendet → schmaler Streifen zum Einblenden.
  if (!visible) {
    return (
      <button
        onClick={() => set('showAnnotationPanel', true)}
        title="Anmerkungen einblenden (Alt+I)"
        style={{
          width: 30, flexShrink: 0, border: 'none', borderLeft: '1px solid var(--border)',
          background: 'var(--bg-surface)', cursor: 'pointer', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--text-muted)', padding: 0,
        }}
      >
        <PanelRightOpen size={16} />
        <span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontSize: 11, fontWeight: 600 }}>Anmerkungen</span>
      </button>
    )
  }

  return (
    <div style={{ width, flexShrink: 0, display: 'flex', minWidth: 0 }}>
      {/* Drag-Trennlinie */}
      <div
        onMouseDown={startResize}
        onTouchStart={startResize}
        title="Breite ziehen"
        style={{ width: 6, flexShrink: 0, cursor: 'col-resize', background: 'var(--border)', touchAction: 'none' }}
      />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <AnnotationPanel onHide={() => set('showAnnotationPanel', false)} hideIcon={<PanelRightClose size={14} />} />
      </div>
    </div>
  )
}
