import { ReactNode, useEffect, useRef, useState } from 'react'
import type { PageMargins } from '../../contexts'

const DEFAULT_MARGINS: PageMargins = { oben: 25, unten: 20, links: 25, rechts: 20 }

interface PageWrapperProps {
  children: ReactNode
  seitenformat?: 'a4' | 'letter'
  showShadow?: boolean
  className?: string
  pageMargins?: PageMargins
}

// Standard screenplay page dimensions (at 96 DPI):
// A4:     794px × 1123px (210mm × 297mm)
// Letter: 816px × 1056px (8.5in × 11in)
export const DIMENSIONS = {
  a4:     { width: 794, height: 1123 },
  letter: { width: 816, height: 1056 },
}

// Convert mm to CSS px (1mm = 96/25.4 px at CSS reference pixel)
const MM_TO_PX = 96 / 25.4

export default function PageWrapper({
  children,
  seitenformat = 'a4',
  showShadow = true,
  className,
  pageMargins = DEFAULT_MARGINS,
}: PageWrapperProps) {
  const dim    = DIMENSIONS[seitenformat]
  const ptTop    = Math.round(pageMargins.oben   * MM_TO_PX)
  const ptBottom = Math.round(pageMargins.unten  * MM_TO_PX)
  const ptLeft   = Math.round(pageMargins.links  * MM_TO_PX)
  const ptRight  = Math.round(pageMargins.rechts * MM_TO_PX)

  // ── Blatt-Modus: dynamische Seitenhöhe ───────────────────────────────────
  // minHeight wird auf das nächste ganzzahlige A4/Letter-Vielfache gerundet.
  // Wir beobachten ProseMirror direkt (nicht den Container), damit der Observer
  // auch bei schrumpfendem Inhalt feuert — der Container bleibt sonst durch
  // minHeight auf alter Größe und würde nie resizen.
  const [pageMinHeight, setPageMinHeight] = useState(dim.height)
  const pageRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showShadow) return
    const el = pageRef.current
    if (!el) return
    const contentMinH = dim.height - ptTop - ptBottom

    const applyHeight = (pmH: number) => {
      const pages = Math.max(1, Math.ceil(Math.max(pmH, 1) / dim.height))
      setPageMinHeight(pages * dim.height)
    }

    const ro = new ResizeObserver(() => {
      const pm = el.querySelector('.ProseMirror') as HTMLElement | null
      if (pm) applyHeight(ptTop + pm.getBoundingClientRect().height + ptBottom)
    })
    const roPm = new ResizeObserver(() => {
      const pm = el.querySelector('.ProseMirror') as HTMLElement | null
      if (pm) {
        pm.style.minHeight = `${contentMinH}px`
        applyHeight(ptTop + pm.getBoundingClientRect().height + ptBottom)
      }
    })

    ro.observe(el)
    const raf = requestAnimationFrame(() => {
      const pm = el.querySelector('.ProseMirror') as HTMLElement | null
      if (pm) {
        pm.style.minHeight = `${contentMinH}px`
        roPm.observe(pm)
        applyHeight(ptTop + pm.getBoundingClientRect().height + ptBottom)
      }
    })
    return () => { ro.disconnect(); roPm.disconnect(); cancelAnimationFrame(raf) }
  }, [showShadow, dim.height, ptTop, ptBottom])

  // dim/seitenformat wechselt → auf 1 Seite zurücksetzen, neu messen
  useEffect(() => {
    setPageMinHeight(dim.height)
  }, [dim.height])

  // ── Fließtext-Modus: letzte Seite bis zur nächsten A4-Grenze auffüllen ──
  // Ohne minHeight endet der Container exakt mit dem ProseMirror-Inhalt,
  // backgroundClip:content-box schneidet die letzte Trennlinie ab.
  const flowRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (showShadow) return
    const el = flowRef.current
    if (!el) return
    const contentH = dim.height - ptTop - ptBottom

    const update = () => {
      const pm = el.querySelector('.ProseMirror') as HTMLElement | null
      const pmH = pm ? pm.getBoundingClientRect().height : 0
      const pages = Math.max(1, Math.ceil((pmH || 1) / contentH))
      const h = `${pages * contentH + ptTop + ptBottom}px`
      if (el.style.minHeight !== h) el.style.minHeight = h
    }

    const ro  = new ResizeObserver(update)
    const roPm = new ResizeObserver(update)
    ro.observe(el)
    const raf = requestAnimationFrame(() => {
      update()
      const pm = el.querySelector('.ProseMirror') as HTMLElement | null
      if (pm) roPm.observe(pm)
    })
    return () => {
      ro.disconnect(); roPm.disconnect(); cancelAnimationFrame(raf)
      el.style.minHeight = ''
    }
  }, [showShadow, dim.height, ptTop, ptBottom])

  // ── Seitentrennlinie: nur im Randbereich, Text bleibt ungestört ──────────
  // Links:  ─── S.X     (Linie + Seitennummer im linken Rand)
  // Mitte:  (kein Dekor im Textbereich)
  // Rechts: A4 ───      (Format + Linie im rechten Rand)
  const pageSep = (i: number, top: number) => (
    <div
      key={i}
      style={{
        position: 'absolute',
        left: 0,
        top,
        width: '100%',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      {/* Linker Rand: Linie → S.X */}
      <div style={{ width: ptLeft, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, paddingRight: 7 }}>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        <span style={{ fontSize: 8, color: 'var(--text-muted)', fontWeight: 500, whiteSpace: 'nowrap', opacity: 0.8, fontVariantNumeric: 'tabular-nums' }}>S.{i + 2}</span>
      </div>
      {/* Textbereich: keine Linie */}
      <div style={{ flex: 1 }} />
      {/* Rechter Rand: A4/LETTER → Linie */}
      <div style={{ width: ptRight, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, paddingLeft: 7 }}>
        <span style={{ fontSize: 8, color: 'var(--text-muted)', fontWeight: 500, whiteSpace: 'nowrap', opacity: 0.8, letterSpacing: '0.3px' }}>{seitenformat.toUpperCase()}</span>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      </div>
    </div>
  )

  if (showShadow) {
    // ── Blatt-Modus: weißes Blatt mit Schatten ───────────────────────────────
    const contentMinHeight = dim.height - ptTop - ptBottom
    return (
      <div className="pw-outer" style={{ background: 'var(--bg-subtle)', padding: '32px 24px', minHeight: '100%', overflowX: 'auto' }}>
        <div
          ref={pageRef}
          className={`pw-blatt${className ? ` ${className}` : ''}`}
          style={{
            '--page-padding': `${ptLeft}px`,
            '--pw-content-min-height': `${contentMinHeight}px`,
            width: dim.width,
            minHeight: pageMinHeight,
            boxSizing: 'border-box',
            margin: '0 auto',
            background: 'var(--bg-surface)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
            borderRadius: 2,
            paddingTop: ptTop, paddingBottom: ptBottom,
            paddingLeft: ptLeft, paddingRight: ptRight,
            position: 'relative',
          } as React.CSSProperties}
        >
          <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 1 }}>
            {Array.from({ length: 30 }, (_, i) => pageSep(i, (i + 1) * dim.height))}
          </div>
          {children}
        </div>
      </div>
    )
  }

  // ── Fließtext-Modus: kein Blatt, Seitenmarkierung nur im Randbereich ──────
  // contentHeight = nutzbare Höhe pro Seite (ohne oberer + unterer Rand).
  // Kein CSS-Gradient mehr — die pageSep-Overlays übernehmen die Markierung.
  const contentHeight = dim.height - ptTop - ptBottom

  return (
    <div className="pw-outer" style={{ background: 'var(--bg-page)', padding: '0 32px', minHeight: '100%' }}>
      <div
        ref={flowRef}
        className={className}
        style={{
          '--page-padding': `${ptLeft}px`,
          width: dim.width,
          maxWidth: '100%',
          margin: '0 auto',
          background: 'transparent',
          paddingLeft: ptLeft, paddingRight: ptRight,
          paddingTop: ptTop, paddingBottom: ptBottom,
          position: 'relative',
        } as React.CSSProperties}
      >
        {/* Seitentrennlinien nur im Randbereich; overflow:hidden verhindert
            Überlauf über die tatsächliche Containerhöhe */}
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 1 }}>
          {Array.from({ length: 30 }, (_, i) => pageSep(i, ptTop + contentHeight * (i + 1)))}
        </div>
        {children}
      </div>
    </div>
  )
}
