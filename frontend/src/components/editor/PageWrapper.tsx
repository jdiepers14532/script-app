import { ReactNode } from 'react'
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

  if (showShadow) {
    // ── Blatt-Modus: weißes Blatt mit Schatten, subtile Trennlinie ────────
    return (
      <div className="pw-outer" style={{ background: 'var(--bg-subtle)', padding: '32px 24px', minHeight: '100%' }}>
        <div
          className={className}
          style={{
            '--page-padding': `${ptLeft}px`,
            width: dim.width,
            minHeight: dim.height,
            maxWidth: '100%',
            margin: '0 auto',
            background: 'var(--bg-surface)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
            borderRadius: 2,
            paddingTop: ptTop, paddingBottom: ptBottom,
            paddingLeft: ptLeft, paddingRight: ptRight,
            position: 'relative',
            backgroundImage: `repeating-linear-gradient(
              to bottom,
              transparent 0,
              transparent ${dim.height - 1}px,
              rgba(0,122,255,0.12) ${dim.height - 1}px,
              rgba(0,122,255,0.12) ${dim.height}px
            )`,
            backgroundSize: `100% ${dim.height}px`,
          } as React.CSSProperties}
        >
          {children}
        </div>
      </div>
    )
  }

  // ── Fließtext-Modus: kein Blatt, druckgenaue Seitentrennlinie ────────
  // contentHeight = nutzbare Höhe pro Seite (ohne oberer + unterer Rand)
  const contentHeight = dim.height - ptTop - ptBottom

  return (
    <div className="pw-outer" style={{ background: 'var(--bg-page)', padding: '0 32px', minHeight: '100%' }}>
      <div
        className={className}
        style={{
          '--page-padding': `${ptLeft}px`,
          width: dim.width,
          maxWidth: '100%',
          margin: '0 auto',
          background: 'transparent',
          paddingLeft: ptLeft, paddingRight: ptRight,
          paddingTop: ptTop, paddingBottom: 0,
          position: 'relative',
          // Trennlinie exakt an Druckseiten-Ende — Gradient relativ zum Content-Box-Rand,
          // damit oberer Seitenrand (paddingTop) korrekt ausgespart bleibt
          backgroundImage: `repeating-linear-gradient(
            transparent 0,
            transparent ${contentHeight - 1}px,
            var(--border) ${contentHeight - 1}px,
            var(--border) ${contentHeight}px
          )`,
          backgroundSize: `100% ${contentHeight}px`,
          backgroundOrigin: 'content-box',
          backgroundClip: 'content-box',
        } as React.CSSProperties}
      >
        {/* Seitennummer-Labels — in overflow:hidden Container, damit sie nicht über den
            tatsächlichen Inhalt hinaus ragen und scrollHeight aufblähen */}
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 1 }}>
          {Array.from({ length: 30 }, (_, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: 0,
                top: ptTop + contentHeight * (i + 1),
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              <span style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.5px', whiteSpace: 'nowrap', padding: '2px 6px', background: 'var(--bg-page)', borderRadius: 4 }}>
                S.{i + 2} · {seitenformat.toUpperCase()}
              </span>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            </div>
          ))}
        </div>
        {children}
      </div>
    </div>
  )
}
