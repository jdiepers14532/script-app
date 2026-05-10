import { useState, useRef, useEffect, useCallback, ReactNode } from 'react'

interface Option {
  value: string
  label: string        // full label shown in dropdown
  compactLabel: string // short label shown when collapsed
  bold?: boolean
  dot?: boolean        // show dot indicator
}

interface Props {
  options: Option[]
  value: string
  onChange: (value: string) => void
}

export default function HeaderSelect({ options, value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [dropPos, setDropPos] = useState<{ top: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const selected = options.find(o => o.value === value)

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
    if (open) updatePosition()
  }, [open, updatePosition])

  const handleSelect = (val: string) => {
    onChange(val)
    setOpen(false)
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
            minWidth: 180, maxWidth: 360,
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
            zIndex: 9999, overflow: 'hidden',
          }}
        >
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {options.map(o => (
              <button
                key={o.value}
                onClick={() => handleSelect(o.value)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  width: '100%', padding: '7px 14px',
                  background: o.value === value ? 'var(--bg-active)' : 'transparent',
                  border: 'none', cursor: 'pointer', textAlign: 'left',
                  color: 'var(--text-primary)', fontSize: 12, fontFamily: 'inherit',
                  fontWeight: o.bold ? 700 : o.value === value ? 600 : 400,
                  transition: 'background 0.1s',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={e => { if (o.value !== value) (e.currentTarget as HTMLElement).style.background = 'var(--bg-subtle)' }}
                onMouseLeave={e => { if (o.value !== value) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
              >
                {o.dot && <span style={{ fontSize: 8 }}>●</span>}
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
