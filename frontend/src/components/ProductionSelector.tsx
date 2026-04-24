import { useState, useRef, useEffect } from 'react'
import { Search, X } from 'lucide-react'
import { productionLabel, Production } from '../hooks/useProduction'

interface Props {
  onSelect: (id: string) => void
  selectedId: string | null
  productions: Production[]
}

export default function ProductionSelector({ onSelect, selectedId, productions }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const selected = productions.find(p => p.id === selectedId)
  const active = productions.filter(p => p.is_active)
  const inactive = productions.filter(p => !p.is_active)

  const filter = (list: Production[]) =>
    query.trim()
      ? list.filter(p => productionLabel(p).toLowerCase().includes(query.toLowerCase()) ||
          (p.projektnummer || '').includes(query))
      : list

  const filteredActive = filter(active)
  const filteredInactive = filter(inactive)
  const hasResults = filteredActive.length + filteredInactive.length > 0

  // Schließen bei Klick außerhalb
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Input fokussieren wenn geöffnet
  useEffect(() => {
    if (open) { setQuery(''); setTimeout(() => inputRef.current?.focus(), 50) }
  }, [open])

  const handleSelect = (id: string) => {
    onSelect(id)
    setOpen(false)
    setQuery('')
  }

  if (productions.length === 0) return null

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {/* Trigger */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: open ? 'var(--bg-subtle)' : 'transparent',
          border: '1px solid ' + (open ? 'var(--border)' : 'transparent'),
          borderRadius: 6, padding: '4px 10px',
          color: 'var(--text-primary)', font: 'inherit',
          fontSize: 12, fontWeight: 600, cursor: 'pointer',
          maxWidth: '40vw', minWidth: 140,
          transition: 'background 0.15s, border-color 0.15s',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, textAlign: 'left' }}>
          {selected ? productionLabel(selected) : '— Produktion wählen —'}
        </span>
        <svg width="10" height="6" viewBox="0 0 10 6" style={{ flexShrink: 0, opacity: 0.5, transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }}>
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0,
          width: '40vw', maxWidth: 420, minWidth: 220,
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
          zIndex: 9999, overflow: 'hidden',
        }}>
          {/* Suchfeld */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--border-subtle)' }}>
            <Search size={13} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Produktion suchen…"
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                fontSize: 12, color: 'var(--text-primary)', fontFamily: 'inherit',
              }}
            />
            {query && (
              <button onClick={() => setQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-secondary)' }}>
                <X size={12} />
              </button>
            )}
          </div>

          {/* Liste */}
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {!hasResults && (
              <div style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-secondary)' }}>Keine Treffer</div>
            )}
            {filteredActive.length > 0 && (
              <>
                <div style={{ padding: '6px 12px 2px', fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Aktive Produktionen
                </div>
                {filteredActive.map(p => (
                  <ProdOption key={p.id} p={p} selected={p.id === selectedId} onSelect={handleSelect} />
                ))}
              </>
            )}
            {filteredInactive.length > 0 && (
              <>
                <div style={{ padding: '8px 12px 2px', fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Inaktive Produktionen
                </div>
                {filteredInactive.map(p => (
                  <ProdOption key={p.id} p={p} selected={p.id === selectedId} onSelect={handleSelect} />
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ProdOption({ p, selected, onSelect }: { p: Production; selected: boolean; onSelect: (id: string) => void }) {
  return (
    <button
      onClick={() => onSelect(p.id)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        width: '100%', padding: '8px 16px', background: selected ? 'var(--bg-active)' : 'transparent',
        border: 'none', cursor: 'pointer', textAlign: 'left',
        color: 'var(--text-primary)', fontSize: 12, fontFamily: 'inherit',
        transition: 'background 0.1s',
      }}
      onMouseEnter={e => { if (!selected) (e.currentTarget as HTMLElement).style.background = 'var(--bg-subtle)' }}
      onMouseLeave={e => { if (!selected) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
    >
      <span style={{ fontWeight: selected ? 600 : 400 }}>{productionLabel(p)}</span>
    </button>
  )
}
