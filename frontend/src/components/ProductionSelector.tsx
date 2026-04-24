import { productionLabel, Production } from '../hooks/useProduction'

interface Props {
  onSelect: (id: string) => void
  selectedId: string | null
  productions: Production[]
}

export default function ProductionSelector({ onSelect, selectedId, productions }: Props) {
  const active = productions.filter(p => p.is_active)
  const inactive = productions.filter(p => !p.is_active)

  if (productions.length === 0) return null

  return (
    <select
      value={selectedId || ''}
      onChange={e => onSelect(e.target.value)}
      style={{
        background: 'transparent',
        border: 'none',
        color: 'inherit',
        font: 'inherit',
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
        padding: '2px 20px 2px 4px',
        appearance: 'none',
        WebkitAppearance: 'none',
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23757575' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 2px center',
        minWidth: 160,
        maxWidth: 260,
        outline: 'none',
        fontFamily: 'inherit',
      }}
    >
      {active.length > 0 && (
        <optgroup label="Aktive Produktionen">
          {active.map(p => (
            <option key={p.id} value={p.id}>{productionLabel(p)}</option>
          ))}
        </optgroup>
      )}
      {inactive.length > 0 && (
        <optgroup label="Inaktive Produktionen">
          {inactive.map(p => (
            <option key={p.id} value={p.id}>{productionLabel(p)}</option>
          ))}
        </optgroup>
      )}
    </select>
  )
}
