/**
 * GlossarTooltip — Inline-Erklärung für Fachbegriffe aus dem Produktions-Glossar.
 *
 * Zeigt einen Tooltip mit der Erklärung, wenn der User über den Begriff fährt.
 * Nutzt einen module-level Cache pro produktionId um N+1-Fetches zu vermeiden.
 *
 * Verwendung:
 *   <GlossarTooltip term="Fall A" produktionId={prodId}>Fall A</GlossarTooltip>
 *   <GlossarTooltip term="DK" produktionId={prodId} /> → zeigt "DK" als Linktext
 */
import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

interface GlossarEntry {
  id: number
  kuerzel: string
  name: string
  erklaerung: string
  term_en?: string
  kategorie?: string
}

// Module-level cache: produktionId → entries (Promise to avoid parallel fetches)
const glossarCache = new Map<string, GlossarEntry[]>()
const glossarPending = new Map<string, Promise<GlossarEntry[]>>()

function fetchGlossar(produktionId: string): Promise<GlossarEntry[]> {
  if (glossarCache.has(produktionId)) return Promise.resolve(glossarCache.get(produktionId)!)
  if (glossarPending.has(produktionId)) return glossarPending.get(produktionId)!
  const p = fetch(`/api/dk-settings/${produktionId}/glossar`, { credentials: 'include' })
    .then(r => r.ok ? r.json() : [])
    .then((entries: GlossarEntry[]) => {
      glossarCache.set(produktionId, entries)
      glossarPending.delete(produktionId)
      return entries
    })
    .catch(() => {
      glossarPending.delete(produktionId)
      return [] as GlossarEntry[]
    })
  glossarPending.set(produktionId, p)
  return p
}

/** Clears the glossar cache for a production (e.g. after editing) */
export function invalidateGlossarCache(produktionId: string) {
  glossarCache.delete(produktionId)
  glossarPending.delete(produktionId)
}

interface Props {
  /** The term to look up — matched against kuerzel (exact, case-insensitive) or name (contains) */
  term: string
  produktionId: string
  children?: React.ReactNode
}

export default function GlossarTooltip({ term, produktionId, children }: Props) {
  const [entry, setEntry] = useState<GlossarEntry | null | 'loading'>('loading')
  const [visible, setVisible] = useState(false)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const triggerRef = useRef<HTMLSpanElement>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetchGlossar(produktionId).then(entries => {
      const q = term.toLowerCase()
      const found = entries.find(e =>
        e.kuerzel.toLowerCase() === q || e.name.toLowerCase() === q
      ) ?? entries.find(e =>
        e.kuerzel.toLowerCase().includes(q) || e.name.toLowerCase().includes(q)
      )
      setEntry(found ?? null)
    })
  }, [produktionId, term])

  // Don't render if no entry found or still loading
  if (entry === 'loading' || entry === null) {
    return <>{children ?? term}</>
  }

  const handleMouseEnter = (e: React.MouseEvent) => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setPos({ x: rect.left + rect.width / 2, y: rect.top - 8 })
    setVisible(true)
  }

  const handleMouseLeave = () => {
    hideTimer.current = setTimeout(() => setVisible(false), 120)
  }

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{
          borderBottom: '1px dotted currentColor',
          cursor: 'help',
          textDecoration: 'none',
        }}
      >
        {children ?? term}
      </span>
      {visible && createPortal(
        <div
          onMouseEnter={() => { if (hideTimer.current) clearTimeout(hideTimer.current) }}
          onMouseLeave={() => setVisible(false)}
          style={{
            position: 'fixed',
            left: pos.x,
            top: pos.y,
            transform: 'translate(-50%, -100%)',
            zIndex: 99999,
            background: '#111',
            color: '#fff',
            fontSize: 12,
            lineHeight: 1.5,
            padding: '8px 12px',
            borderRadius: 8,
            maxWidth: 300,
            boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
            pointerEvents: 'auto',
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 12 }}>
            {entry.kuerzel ? `${entry.kuerzel} — ` : ''}{entry.name}
          </div>
          <div style={{ fontSize: 11, color: '#ccc', lineHeight: 1.5 }}>
            {entry.erklaerung}
          </div>
          {entry.term_en && (
            <div style={{ marginTop: 6, fontSize: 10, color: '#888', fontStyle: 'italic' }}>
              EN: {entry.term_en}
            </div>
          )}
        </div>,
        document.body
      )}
    </>
  )
}
