import { useState, useRef, useEffect, useCallback } from 'react'

interface Option {
  value: string
  label: string        // full label shown in dropdown
  compactLabel: string // short label shown when collapsed
  bold?: boolean
  dot?: boolean        // show dot indicator
  subtitle?: string    // secondary info shown only in dropdown, not in header
}

interface Props {
  options: Option[]
  value: string
  onChange: (value: string) => void
  scrollToValue?: string  // beim Öffnen zu diesem Wert scrollen (fallback: value)
  searchable?: boolean    // Filterfeld oben im Dropdown anzeigen
}

export default function HeaderSelect({ options, value, onChange, scrollToValue, searchable }: Props) {
  const [open, setOpen] = useState(false)
  const [dropPos, setDropPos] = useState<{ top: number; left: number } | null>(null)
  const [filter, setFilter] = useState('')
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const filterRef = useRef<HTMLInputElement>(null)

  const selected = options.find(o => o.value === value)

  const filteredOptions = searchable && filter
    ? options.filter(o =>
        o.value.includes(filter) ||
        o.label.toLowerCase().includes(filter.toLowerCase()) ||
        (o.subtitle?.toLowerCase().includes(filter.toLowerCase()) ?? false)
      )
    : options

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setDropPos({ top: rect.bottom + 4, left: rect.left })
  }, [])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (triggerRef.current?.contains(target)) return
      if (dropdownRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (open) {
      updatePosition()
    } else {
      setFilter('')
    }
  }, [open, updatePosition])

  // Auto-focus Filterfeld nach Öffnen
  useEffect(() => {
    if (!open || !dropPos || !searchable) return
    setTimeout(() => filterRef.current?.focus(), 0)
  }, [open, dropPos, searchable])

  // Zur aktuellen Auswahl scrollen (nach Render des Dropdowns)
  useEffect(() => {
    if (!open || !dropPos || !listRef.current) return
    const target = scrollToValue ?? value
    const idx = options.findIndex(o => o.value === target)
    if (idx < 0) return
    const items = listRef.current.querySelectorAll<HTMLButtonElement>('button')
    items[idx]?.scrollIntoView({ block: 'center' })
  }, [open, dropPos])

  const handleSelect = (val: string) => {
    onChange(val)
    setOpen(false)
  }

  const handleFilterKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && filteredOptions.length > 0) {
      handleSelect(filteredOptions[0].value)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  if (options.length === 0) return null

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          background: open ? 'var(--bg-subtle)' : 'transparent',
          border: '1px solid ' + (open ? 'var(--border)' : 'transparent'),
          borderRadius: 4, padding: '2px 6px',
          color: 'var(--text-primary)', font: 'inherit',
          fontSize: 12, cursor: 'pointer',
          transition: 'background 0.15s, border-color 0.15s',
          whiteSpace: 'nowrap',
        }}
      >
        {selected?.dot && <span style={{ color: 'var(--text-primary)' }}>●</span>}
        <span>{selected?.compactLabel ?? '—'}</span>
        <svg width="8" height="5" viewBox="0 0 10 6" style={{ flexShrink: 0, opacity: 0.4, transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }}>
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
        </svg>
      </button>

      {open && dropPos && (
        <div
          ref={dropdownRef}
          style={{
            position: 'fixed',
            top: dropPos.top,
            left: dropPos.left,
            minWidth: 200, maxWidth: 360,
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
            zIndex: 9999, overflow: 'hidden',
          }}
        >
          {searchable && (
            <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
              <input
                ref={filterRef}
                value={filter}
                onChange={e => setFilter(e.target.value)}
                onKeyDown={handleFilterKeyDown}
                placeholder="Suchen…"
                style={{
                  width: '100%', padding: '5px 8px',
                  border: '1px solid var(--border)', borderRadius: 4,
                  background: 'var(--bg-subtle)', color: 'var(--text-primary)',
                  fontSize: 12, fontFamily: 'inherit', outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          )}
          <div ref={listRef} style={{ maxHeight: 320, overflowY: 'auto' }}>
            {filteredOptions.map(o => (
              <button
                key={o.value}
                onClick={() => handleSelect(o.value)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                  width: '100%', padding: '7px 14px',
                  background: o.value === value ? 'var(--bg-active)' : 'transparent',
                  border: 'none', cursor: 'pointer', textAlign: 'left',
                  color: 'var(--text-primary)', fontFamily: 'inherit',
                  transition: 'background 0.1s',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={e => { if (o.value !== value) (e.currentTarget as HTMLElement).style.background = 'var(--bg-subtle)' }}
                onMouseLeave={e => { if (o.value !== value) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: o.bold ? 700 : o.value === value ? 600 : 400 }}>
                  {o.dot && <span style={{ fontSize: 8 }}>●</span>}
                  {o.label}
                  {o.subtitle && (
                    <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontWeight: 400 }}>
                      {o.subtitle}
                    </span>
                  )}
                </div>
              </button>
            ))}
            {filteredOptions.length === 0 && (
              <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text-secondary)' }}>
                Keine Treffer
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
