import { C } from './_shared'

function SearchResultsView({
  query,
  results,
  onNavigate,
}: {
  query: string
  results: { id: string; label: string; icon: string }[]
  onNavigate: (id: string) => void
}) {
  return (
    <div>
      <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 6px', paddingBottom: 10, borderBottom: `2px solid ${C.border}` }}>
        Suchergebnisse
      </h2>
      <p style={{ fontSize: 12, color: C.muted, margin: '0 0 20px' }}>
        {results.length === 0
          ? `Keine Treffer für „${query}"`
          : `${results.length} ${results.length === 1 ? 'Treffer' : 'Treffer'} für „${query}"`}
      </p>
      {results.length === 0 && (
        <div style={{ color: C.muted, fontSize: 13, textAlign: 'center', marginTop: 40 }}>
          Kein Handbuch-Eintrag passt zu dieser Suche.
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {results.map(item => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '14px 18px',
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              background: C.surface,
              cursor: 'pointer',
              textAlign: 'left',
              width: '100%',
              transition: 'border-color 0.15s, background 0.15s',
            }}
            onMouseEnter={e => {
              ;(e.currentTarget as HTMLButtonElement).style.borderColor = C.blue + '66'
              ;(e.currentTarget as HTMLButtonElement).style.background = C.blue + '08'
            }}
            onMouseLeave={e => {
              ;(e.currentTarget as HTMLButtonElement).style.borderColor = C.border
              ;(e.currentTarget as HTMLButtonElement).style.background = C.surface
            }}
          >
            <span style={{ fontSize: 22, flexShrink: 0, width: 32, textAlign: 'center' }}>{item.icon}</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 2 }}>{item.label}</div>
              <div style={{ fontSize: 11, color: C.muted }}>Im Handbuch öffnen →</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Potenzielle Fehler Tab (Admin) ────────────────────────────────────────────

export default SearchResultsView
