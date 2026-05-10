import { useState, useRef, useEffect, useCallback } from 'react'
import { Search, X } from 'lucide-react'
import { productionLabel, Production } from '../hooks/useProduction'
import { useTerminologie } from '../sw-ui'

interface Props {
  onSelect: (id: string) => void
  selectedId: string | null
  productions: Production[]
}

export default function ProductionSelector({ onSelect, selectedId, productions }: Props) {
  const { t } = useTerminologie()
  const pl = (p: Production) => productionLabel(p, t('staffel'))
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [dropPos, setDropPos] = useState<{ top: number; left: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const selected = productions.find(p => p.id === selectedId)
  const byProjNrDesc = (a: Production, b: Production) =>
    (parseInt(b.projektnummer ?? '0') || 0) - (parseInt(a.projektnummer ?? '0') || 0)
  const active = productions.filter(p => p.is_active).sort(byProjNrDesc)
  const inactive = productions.filter(p => !p.is_active).sort(byProjNrDesc)

  const filter = (list: Production[]) =>
    query.trim()
      ? list.filter(p => pl(p).toLowerCase().includes(query.toLowerCase()) ||
          (p.projektnummer || '').includes(query))
      : list

  const filteredActive = filter(active)
  const filteredInactive = filter(inactive)
  const hasResults = filteredActive.length + filteredInactive.length > 0

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setDropPos({ top: rect.bottom + 4, left: rect.left })
  }, [])

  // Schliessen bei Klick ausserhalb
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

  // Position berechnen + Input fokussieren wenn geoeffnet
  useEffect(() => {
    if (open) {
      updatePosition()
      setQuery('')
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open, updatePosition])

  const handleSelect = (id: string) => {
    onSelect(id)
    setOpen(false)
    setQuery('')
  }

  if (productions.length === 0) return null

  return (
    <>
      {/* Trigger */}
      <button
        ref={triggerRef}
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
          {selected ? pl(selected) : '— Produktion waehlen —'}
        </span>
        <svg width="10" height="6" viewBox="0 0 10 6" style={{ flexShrink: 0, opacity: 0.5, transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }}>
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
        </svg>
      </button>

      {/* Dropdown — fixed position to escape overflow:hidden ancestors */}
      {open && dropPos && (
        <div
          ref={dropdownRef}
          style={{
            position: 'fixed',
            top: dropPos.top,
            left: dropPos.left,
            width: '40vw', maxWidth: 420, minWidth: 220,
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
            zIndex: 9999, overflow: 'hidden',
          }}
        >
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
                  <ProdOption key={p.id} label={p.projektnummer ? `${p.projektnummer} · ${pl(p)}` : pl(p)} selected={p.id === selectedId} onSelect={() => handleSelect(p.id)} />
                ))}
              </>
            )}
            {filteredInactive.length > 0 && (
              <>
                <div style={{ padding: '8px 12px 2px', fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Inaktive Produktionen
                </div>
                {filteredInactive.map(p => (
                  <ProdOption key={p.id} label={p.projektnummer ? `${p.projektnummer} · ${pl(p)}` : pl(p)} selected={p.id === selectedId} onSelect={() => handleSelect(p.id)} />
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}

function ProdOption({ label, selected, onSelect }: { label: string; selected: boolean; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        width: '100%', padding: '7px 16px', background: selected ? 'var(--bg-active)' : 'transparent',
        border: 'none', cursor: 'pointer', textAlign: 'left',
        color: 'var(--text-primary)', fontSize: 12, fontFamily: 'inherit',
        transition: 'background 0.1s',
      }}
      onMouseEnter={e => { if (!selected) (e.currentTarget as HTMLElement).style.background = 'var(--bg-subtle)' }}
      onMouseLeave={e => { if (!selected) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
    >
      <span style={{ fontWeight: selected ? 600 : 400 }}>{label}</span>
    </button>
  )
}
