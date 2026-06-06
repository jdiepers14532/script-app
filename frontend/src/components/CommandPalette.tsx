// ── Befehlspalette (Strg/Cmd + K) ───────────────────────────────────────────
// Generische Palette: erhält eine Command-Liste, bietet Suche + Tastatur-Navigation.
// Jede Zeile zeigt rechts ihr Kürzel → passives Lernen der Shortcuts.
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export interface Command {
  id: string
  label: string
  /** Gruppen-/Kategoriename, links als dezenter Präfix */
  group?: string
  /** Tastenkürzel-Label, rechtsbündig angezeigt */
  hint?: string
  /** Suchbegriffe zusätzlich zum Label */
  keywords?: string
  run: () => void
}

export default function CommandPalette({ commands, onClose }: { commands: Command[]; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [sel, setSel] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const q = query.trim().toLowerCase()
  const results = useMemo(() => {
    if (!q) return commands
    return commands.filter(c =>
      (c.label + ' ' + (c.group ?? '') + ' ' + (c.keywords ?? '')).toLowerCase().includes(q)
    )
  }, [commands, q])

  // Auswahl in gültigem Bereich halten, wenn die Trefferliste schrumpft
  useEffect(() => { setSel(0) }, [q])

  const run = (c?: Command) => { if (c) { onClose(); c.run() } }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(s - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); run(results[sel]) }
  }

  // Ausgewählte Zeile in den sichtbaren Bereich scrollen
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${sel}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [sel])

  return createPortal(
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 3000 }} />
      <div style={{
        position: 'fixed', top: '14%', left: '50%', transform: 'translateX(-50%)',
        width: 'min(620px, 94vw)', background: 'var(--bg-page)', borderRadius: 14,
        boxShadow: '0 12px 48px rgba(0,0,0,0.35)', zIndex: 3001, overflow: 'hidden',
        display: 'flex', flexDirection: 'column', maxHeight: '70vh',
      }}>
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Befehl oder Seite suchen…"
          autoComplete="off"
          style={{
            border: 'none', borderBottom: '1px solid var(--border)', outline: 'none',
            padding: '16px 18px', fontSize: 15, background: 'transparent', color: 'var(--text-primary)',
            fontFamily: 'inherit',
          }}
        />
        <div ref={listRef} style={{ overflowY: 'auto', padding: 6 }}>
          {results.length === 0 && (
            <div style={{ padding: '18px', fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center' }}>
              Kein Treffer.
            </div>
          )}
          {results.map((c, i) => (
            <div
              key={c.id}
              data-idx={i}
              onMouseEnter={() => setSel(i)}
              onClick={() => run(c)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8,
                cursor: 'pointer', background: i === sel ? 'var(--bg-subtle)' : 'transparent',
              }}
            >
              {c.group && (
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', flex: '0 0 auto' }}>{c.group} ·</span>
              )}
              <span style={{ flex: 1, fontSize: 13.5, color: 'var(--text-primary)' }}>{c.label}</span>
              {c.hint && (
                <span style={{
                  fontFamily: 'monospace', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)',
                  background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: 5,
                  padding: '2px 7px', whiteSpace: 'nowrap',
                }}>{c.hint}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </>,
    document.body,
  )
}
