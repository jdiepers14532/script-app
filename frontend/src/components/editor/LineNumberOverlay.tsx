import { useEffect, useRef, useState, useCallback } from 'react'

interface Entry { top: number; num: number }

interface Props {
  show: boolean
  marginCm: number
  fontFamily: string
  fontSizePt: number
  color: string
}

const CM_TO_PX = 96 / 2.54

/**
 * Renders line numbers in the left page margin via DOM measurement.
 *
 * Must be a direct child of PageWrapper's inner div (position: relative),
 * rendered as a sibling to EditorContent. Uses ResizeObserver on the
 * ProseMirror element and MutationObserver on its children to update
 * whenever layout changes.
 *
 * Numbers appear vertically centered on every 5th visual line.
 * The overlay is pointer-events:none — text cursor and selection unaffected.
 */
export function LineNumberOverlay({ show, marginCm, fontFamily, fontSizePt, color }: Props) {
  const selfRef = useRef<HTMLDivElement>(null)
  const [entries, setEntries] = useState<Entry[]>([])
  const [pmLeft, setPmLeft] = useState(96)
  const rafRef = useRef<number | null>(null)

  const measure = useCallback(() => {
    if (!show) { setEntries([]); return }

    const self = selfRef.current
    if (!self) return
    const pageDiv = self.parentElement
    if (!pageDiv) return

    const pm = pageDiv.querySelector('.ProseMirror') as HTMLElement | null
    if (!pm) { setEntries([]); return }

    // Use getBoundingClientRect so we're scroll-invariant:
    // elRect.top - pageDivRect.top stays constant regardless of outer scroll.
    const pageDivRect = pageDiv.getBoundingClientRect()
    const pmRect = pm.getBoundingClientRect()
    setPmLeft(pmRect.left - pageDivRect.left)

    const result: Entry[] = []
    let lineCount = 0

    for (const child of Array.from(pm.children)) {
      const el = child as HTMLElement
      const style = getComputedStyle(el)
      const lh = parseFloat(style.lineHeight)
      if (!lh || lh < 4) continue

      const paddingTop    = parseFloat(style.paddingTop)    || 0
      const paddingBottom = parseFloat(style.paddingBottom) || 0
      const elRect        = el.getBoundingClientRect()
      const contentHeight = elRect.height - paddingTop - paddingBottom
      const numLines      = Math.max(1, Math.round(contentHeight / lh))
      const elTop         = elRect.top - pageDivRect.top   // relative to pageDiv

      for (let i = 0; i < numLines; i++) {
        lineCount++
        if (lineCount % 5 === 0) {
          // Center the label vertically on the line
          const top = elTop + paddingTop + i * lh + lh * 0.5
          result.push({ top, num: lineCount })
        }
      }
    }

    setEntries(result)
  }, [show])

  const scheduleMeasure = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(measure)
  }, [measure])

  useEffect(() => {
    if (!show) { setEntries([]); return }

    // Initial measurement
    scheduleMeasure()

    const self = selfRef.current
    if (!self) return
    const pageDiv = self.parentElement
    if (!pageDiv) return
    const pm = pageDiv.querySelector('.ProseMirror') as HTMLElement | null
    if (!pm) return

    // ResizeObserver: catches height changes from typing / line wrapping / window resize
    const ro = new ResizeObserver(scheduleMeasure)
    ro.observe(pm)

    // MutationObserver: catches block add / remove (Enter, Backspace)
    const mo = new MutationObserver(scheduleMeasure)
    mo.observe(pm, { childList: true })

    return () => {
      ro.disconnect()
      mo.disconnect()
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [show, scheduleMeasure])

  // Re-measure when settings change (margin, font) — positions don't change,
  // but pmLeft might differ if the page margin changed
  useEffect(() => {
    if (show) scheduleMeasure()
  }, [marginCm, show, scheduleMeasure])

  const marginPx = marginCm * CM_TO_PX
  const colWidth  = Math.max(0, pmLeft - marginPx - 4)

  return (
    <div
      ref={selfRef}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}
    >
      {show && entries.map(e => (
        <div
          key={e.num}
          style={{
            position: 'absolute',
            top: e.top,
            left: marginPx,
            width: colWidth,
            textAlign: 'right',
            fontFamily,
            fontSize: `${fontSizePt}pt`,
            lineHeight: 1,
            color,
            userSelect: 'none',
            transform: 'translateY(-50%)',
          }}
        >
          {e.num}
        </div>
      ))}
    </div>
  )
}
