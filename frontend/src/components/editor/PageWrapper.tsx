import { ReactNode } from 'react'

interface PageWrapperProps {
  children: ReactNode
  seitenformat?: 'a4' | 'letter'
  showShadow?: boolean
  className?: string
}

// Standard screenplay page dimensions (at 96 DPI):
// A4:     794px × 1123px (210mm × 297mm)
// Letter: 816px × 1056px (8.5in × 11in)
export const DIMENSIONS = {
  a4:     { width: 794, height: 1123 },
  letter: { width: 816, height: 1056 },
}

export default function PageWrapper({
  children,
  seitenformat = 'a4',
  showShadow = true,
  className,
}: PageWrapperProps) {
  const dim = DIMENSIONS[seitenformat]

  if (showShadow) {
    // ── Blatt-Modus: weißes Blatt mit Schatten, subtile Trennlinie ────────
    return (
      <div style={{ background: 'var(--bg-subtle)', padding: '32px 24px', minHeight: '100%', overflowY: 'auto' }}>
        <div
          className={className}
          style={{
            width: dim.width,
            minHeight: dim.height,
            maxWidth: '100%',
            margin: '0 auto',
            background: 'var(--bg-surface)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
            borderRadius: 2,
            padding: '96px 96px 96px 96px',
            position: 'relative',
            backgroundImage: `repeating-linear-gradient(
              to bottom,
              transparent 0,
              transparent ${dim.height - 1}px,
              rgba(0,122,255,0.12) ${dim.height - 1}px,
              rgba(0,122,255,0.12) ${dim.height}px
            )`,
            backgroundSize: `100% ${dim.height}px`,
          }}
        >
          {children}
        </div>
      </div>
    )
  }

  // ── Fließtext-Modus: kein Blatt, druckgenaue Seitentrennlinie ────────
  // contentHeight = nutzbare Höhe pro Seite (ohne Ränder: 2 × 96px = 192px)
  const contentHeight = dim.height - 192  // A4: 931px, Letter: 864px

  return (
    <div style={{ background: 'var(--bg-page)', padding: '0 32px', minHeight: '100%', overflowY: 'auto' }}>
      <div
        className={className}
        style={{
          width: dim.width,
          maxWidth: '100%',
          margin: '0 auto',
          background: 'transparent',
          padding: '0 96px',
          position: 'relative',
          // Trennlinie exakt an Druckseiten-Ende — jede contentHeight-px
          backgroundImage: `repeating-linear-gradient(
            transparent 0,
            transparent ${contentHeight - 1}px,
            var(--border) ${contentHeight - 1}px,
            var(--border) ${contentHeight}px
          )`,
          backgroundSize: `100% ${contentHeight}px`,
        }}
      >
        {/* Seitennummer-Labels an jeder Trennlinie (max. 30 Seiten) */}
        {Array.from({ length: 30 }, (_, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: 0,
              top: contentHeight * (i + 1),
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              pointerEvents: 'none',
              zIndex: 1,
            }}
          >
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <span style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.5px', whiteSpace: 'nowrap', padding: '2px 6px', background: 'var(--bg-page)', borderRadius: 4 }}>
              S.{i + 2} · {seitenformat.toUpperCase()}
            </span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>
        ))}
        {children}
      </div>
    </div>
  )
}
