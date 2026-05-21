/**
 * RulerBar — Lineal-Komponente für WYSIWYG-Editoren
 *
 * Features:
 * - Tab-Stops (L/C/R) per Klick setzen/entfernen
 * - Seitenrand-Overlays (grau/blau), klickbar zum Umschalten des Maß-Ursprungs
 * - Maß ab Seitenrand ↔ ab Textrand (Klick auf Randzone)
 * - Rand per Drag verschieben (Mouse + Touch)
 * - "0"-Marker an Textrand-Grenze im content-Modus
 */
import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { TabStop, TabAlign } from './TabStopExtension'
import { TAB_ALIGN_SYMBOL, TAB_ALIGN_COLORS } from './TabStopExtension'

export interface RulerBarProps {
  tabStops: TabStop[]
  onToggle: (pos: number) => void
  containerRef: React.RefObject<HTMLDivElement | null>
  rulerCm: number
  marginLeftCm: number
  marginRightCm: number
  onMarginChange?: (side: 'left' | 'right', mm: number) => void
}

export function RulerBar({ tabStops, onToggle, containerRef, rulerCm, marginLeftCm, marginRightCm, onMarginChange }: RulerBarProps) {
  const [width, setWidth] = useState(600)
  const rulerRef = useRef<HTMLDivElement>(null)
  const [rulerTooltip, setRulerTooltip] = useState<{ x: number; top: number; cm: number; nearHandle: 'left' | 'right' | null } | null>(null)
  const [rulerOrigin, setRulerOrigin] = useState<'physical' | 'content'>('physical')
  const [dragging, setDragging] = useState<{ side: 'left' | 'right'; startX: number; startMm: number } | null>(null)

  // Stabile Refs für Drag-Handler (kein Effect-Neustart bei Prop-Änderung)
  const widthRef  = useRef(width)
  const mLRef     = useRef(marginLeftCm)
  const mRRef     = useRef(marginRightCm)
  const onMargRef = useRef(onMarginChange)
  useEffect(() => { widthRef.current  = width },          [width])
  useEffect(() => { mLRef.current     = marginLeftCm },   [marginLeftCm])
  useEffect(() => { mRRef.current     = marginRightCm },  [marginRightCm])
  useEffect(() => { onMargRef.current = onMarginChange }, [onMarginChange])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    obs.observe(el)
    setWidth(el.getBoundingClientRect().width)
    return () => obs.disconnect()
  }, [containerRef])

  useEffect(() => {
    if (!dragging) return
    document.body.style.cursor = 'col-resize'
    const onMove = (e: MouseEvent | TouchEvent) => {
      if ('touches' in e) e.preventDefault()
      const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX
      const dx = clientX - dragging.startX
      const dMm = (dx / widthRef.current) * rulerCm * 10
      const mL = mLRef.current
      const mR = mRRef.current
      if (dragging.side === 'left') {
        const newMm = Math.round(Math.max(0, Math.min((rulerCm - mR - 2) * 10, dragging.startMm + dMm)))
        onMargRef.current?.('left', newMm)
      } else {
        const newMm = Math.round(Math.max(0, Math.min((rulerCm - mL - 2) * 10, dragging.startMm - dMm)))
        onMargRef.current?.('right', newMm)
      }
    }
    const onUp = () => { setDragging(null); document.body.style.cursor = '' }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    document.addEventListener('touchmove', onMove as EventListener, { passive: false })
    document.addEventListener('touchend', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.removeEventListener('touchmove', onMove as EventListener)
      document.removeEventListener('touchend', onUp)
      document.body.style.cursor = ''
    }
  }, [dragging, rulerCm])

  const cmToPx    = (cm: number) => (cm / rulerCm) * width
  const displayCm = (physCm: number) => rulerOrigin === 'content' ? physCm - marginLeftCm : physCm
  const inMargin  = (cm: number) =>
    (marginLeftCm > 0 && cm <= marginLeftCm) || (marginRightCm > 0 && cm >= rulerCm - marginRightCm)

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!rulerRef.current) return
    const rect = rulerRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const pos = Math.round((x / width) * rulerCm * 4) / 4
    if (pos < 0.1 || pos > rulerCm - 0.1) return
    if (pos <= marginLeftCm || pos >= rulerCm - marginRightCm) return
    onToggle(pos)
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = rulerRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = e.clientX - rect.left
    const cm = Math.max(0, Math.min(rulerCm, (x / width) * rulerCm))
    let nearHandle: TabAlign | null = null
    if (onMarginChange) {
      if (marginLeftCm > 0  && Math.abs(x - cmToPx(marginLeftCm)) <= 5)            nearHandle = 'left'
      else if (marginRightCm > 0 && Math.abs(x - cmToPx(rulerCm - marginRightCm)) <= 5) nearHandle = 'right'
    }
    setRulerTooltip({ x: e.clientX, top: rect.top, cm, nearHandle })
  }

  const startDrag = (side: 'left' | 'right') => (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault(); e.stopPropagation()
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX
    setDragging({ side, startX: clientX, startMm: side === 'left' ? marginLeftCm * 10 : marginRightCm * 10 })
  }

  const toggleOrigin = (e: React.MouseEvent) => {
    e.stopPropagation()
    setRulerOrigin(prev => prev === 'physical' ? 'content' : 'physical')
  }

  const H = 29
  const TICK_5CM  = Math.round(H * 0.50)
  const TICK_1CM  = Math.round(H * 0.38)
  const TICK_05CM = Math.round(H * 0.21)

  const contentMode = rulerOrigin === 'content'
  const hasMargins  = marginLeftCm > 0 || marginRightCm > 0

  const tickLabel = (i: number) => {
    if (!contentMode) return `${i} cm`
    const v = parseFloat((i - marginLeftCm).toFixed(2))
    return Number.isInteger(v) ? `${v} cm` : `${v.toFixed(1)} cm`
  }

  return (
    <>
      <div
        ref={rulerRef}
        onMouseDown={e => e.preventDefault()}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setRulerTooltip(null)}
        style={{
          position: 'relative', height: H,
          background: 'var(--bg-subtle, #f5f5f5)', borderBottom: '2px solid var(--border, #e0e0e0)',
          cursor: 'crosshair', userSelect: 'none', overflow: 'hidden', flexShrink: 0,
        }}
      >
        {/* 1 cm-Striche */}
        {Array.from({ length: rulerCm + 1 }, (_, i) => {
          const is5 = i % 5 === 0
          const tickH = is5 ? TICK_5CM : TICK_1CM
          return (
            <div key={i} style={{
              position: 'absolute', left: cmToPx(i), bottom: 0,
              width: is5 ? 2 : 1, height: tickH,
              background: is5 ? 'var(--text-secondary, #555)' : 'var(--text-muted, #999)',
              opacity: is5 ? 1 : 0.6, pointerEvents: 'none',
            }}>
              {is5 && i > 0 && (
                <span style={{
                  position: 'absolute', bottom: tickH + 2,
                  left: i === rulerCm ? undefined : -4, right: i === rulerCm ? 0 : undefined,
                  fontSize: 9, fontWeight: 600, color: 'var(--text-secondary, #555)',
                  pointerEvents: 'none', whiteSpace: 'nowrap', lineHeight: 1,
                }}>{tickLabel(i)}</span>
              )}
            </div>
          )
        })}

        {/* 0,5 cm-Striche */}
        {Array.from({ length: Math.round(rulerCm * 2) }, (_, i) => {
          if (i % 2 === 0) return null
          return (
            <div key={`h${i}`} style={{
              position: 'absolute', left: cmToPx(i * 0.5), bottom: 0,
              width: 1, height: TICK_05CM,
              background: 'var(--text-muted, #999)', opacity: 0.4, pointerEvents: 'none',
            }} />
          )
        })}

        {/* "0"-Markierung am Textrand im content-Modus */}
        {contentMode && marginLeftCm > 0 && (
          <div style={{
            position: 'absolute', left: cmToPx(marginLeftCm), bottom: 0,
            width: 2, height: TICK_5CM, background: '#007AFF', opacity: 0.9, pointerEvents: 'none', zIndex: 4,
          }}>
            <span style={{
              position: 'absolute', bottom: TICK_5CM + 2, left: 2,
              fontSize: 9, fontWeight: 700, color: '#007AFF',
              pointerEvents: 'none', whiteSpace: 'nowrap', lineHeight: 1,
            }}>0</span>
          </div>
        )}

        {/* Seitenrand-Overlays */}
        {marginLeftCm > 0 && (
          <div onClick={toggleOrigin} style={{
            position: 'absolute', left: 0, top: 0, bottom: 0, width: cmToPx(marginLeftCm),
            background: contentMode ? 'rgba(0,122,255,0.10)' : 'rgba(0,0,0,0.08)',
            borderRight: `${dragging?.side === 'left' ? 2 : 1}px solid ${dragging?.side === 'left' ? '#007AFF' : contentMode ? 'rgba(0,122,255,0.35)' : 'rgba(0,0,0,0.18)'}`,
            cursor: 'pointer', zIndex: 3,
          }} />
        )}
        {marginRightCm > 0 && (
          <div onClick={toggleOrigin} style={{
            position: 'absolute', left: cmToPx(rulerCm - marginRightCm), top: 0, bottom: 0, width: cmToPx(marginRightCm),
            background: contentMode ? 'rgba(0,122,255,0.10)' : 'rgba(0,0,0,0.08)',
            borderLeft: `${dragging?.side === 'right' ? 2 : 1}px solid ${dragging?.side === 'right' ? '#007AFF' : contentMode ? 'rgba(0,122,255,0.35)' : 'rgba(0,0,0,0.18)'}`,
            cursor: 'pointer', zIndex: 3,
          }} />
        )}

        {/* Drag-Handles */}
        {onMarginChange && marginLeftCm > 0 && (
          <div onMouseDown={startDrag('left')} onTouchStart={startDrag('left')}
            style={{ position: 'absolute', left: cmToPx(marginLeftCm) - 4, top: 0, bottom: 0, width: 8, cursor: 'col-resize', zIndex: 5 }} />
        )}
        {onMarginChange && marginRightCm > 0 && (
          <div onMouseDown={startDrag('right')} onTouchStart={startDrag('right')}
            style={{ position: 'absolute', left: cmToPx(rulerCm - marginRightCm) - 4, top: 0, bottom: 0, width: 8, cursor: 'col-resize', zIndex: 5 }} />
        )}

        {/* Tab-Stops */}
        {tabStops.map(ts => (
          <div
            key={`${ts.pos}-${ts.align}`}
            onMouseDown={e => { e.stopPropagation(); e.preventDefault() }}
            onClick={e => { e.stopPropagation(); onToggle(ts.pos) }}
            style={{ position: 'absolute', left: cmToPx(ts.pos) - 7, bottom: 1, width: 14, height: H - 2, cursor: 'pointer', zIndex: 2 }}
          >
            {/* Vertikale Linie an exakter Tab-Stop-Position (Mitte des 14px-Klickbereichs = 7px) */}
            <div style={{ position: 'absolute', left: 6, top: 0, bottom: 0, width: 2, background: TAB_ALIGN_COLORS[ts.align] }} />
            {/* Buchstabe zentriert unterhalb der Linie */}
            <span style={{
              position: 'absolute', bottom: 1, left: 0, right: 0,
              textAlign: 'center', fontSize: 8, fontWeight: 700,
              color: TAB_ALIGN_COLORS[ts.align], lineHeight: 1,
            }}>{TAB_ALIGN_SYMBOL[ts.align]}</span>
          </div>
        ))}
      </div>

      {rulerTooltip && createPortal(
        <div style={{
          position: 'fixed', left: rulerTooltip.x, top: rulerTooltip.top - 26,
          transform: 'translateX(-50%)', background: '#111', color: '#fff',
          fontSize: 10, fontWeight: 500, padding: '3px 8px', borderRadius: 4,
          pointerEvents: 'none', zIndex: 99999, whiteSpace: 'nowrap',
          lineHeight: 1.5, boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        }}>
          {rulerTooltip.nearHandle
            ? `Rand ${rulerTooltip.nearHandle === 'left' ? 'links' : 'rechts'} verschieben`
            : inMargin(rulerTooltip.cm)
              ? (hasMargins ? (contentMode ? 'Klick: Maß ab Seitenrand anzeigen' : 'Klick: Maß ab Textrand anzeigen') : 'Seitenrand')
              : `${displayCm(rulerTooltip.cm).toFixed(2)} cm · Klick = Tab`
          }
        </div>,
        document.body
      )}
    </>
  )
}
