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
const DIMENSIONS = {
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
          boxShadow: showShadow ? '0 4px 24px rgba(0,0,0,0.15)' : 'none',
          borderRadius: 2,
          padding: '96px 96px 96px 96px',  // 1in margins = 96px at 96dpi
          position: 'relative',
          // Page break indicator lines
          backgroundImage: `repeating-linear-gradient(
            to bottom,
            transparent 0,
            transparent ${dim.height - 1}px,
            rgba(0,122,255,0.15) ${dim.height - 1}px,
            rgba(0,122,255,0.15) ${dim.height}px
          )`,
          backgroundSize: `100% ${dim.height}px`,
        }}
      >
        {children}
      </div>
    </div>
  )
}
