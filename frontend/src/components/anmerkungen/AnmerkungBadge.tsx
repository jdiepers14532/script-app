// AnmerkungBadge — leichte count/status-Marker-Komponente fürs Anker-System (Schritt 2).
// Bewusst NICHT die sw-ui-AnnotationBadge (die ist an die Messenger-API gekoppelt — Alt-System,
// das der Hub ablöst, Konzept §7). TR-Style, Touch-Target ≥44px via Padding.
import { MessageSquare } from 'lucide-react'

export type AnmerkungStatus = 'offen' | 'in_arbeit' | 'uebernommen' | 'abgelehnt'

const STATUS_COLOR: Record<AnmerkungStatus, string> = {
  offen: '#EF9F27',
  in_arbeit: '#FFCC00',
  uebernommen: '#00C853',
  abgelehnt: '#FF3B30',
}

// "Schlimmster"/dringendster Status bestimmt die Badge-Farbe (offen > in_arbeit > rest).
export function worstStatus(statuses: AnmerkungStatus[]): AnmerkungStatus | null {
  if (statuses.includes('offen')) return 'offen'
  if (statuses.includes('in_arbeit')) return 'in_arbeit'
  if (statuses.length) return statuses[0]
  return null
}

export function AnmerkungBadge({
  count, status, onClick, title,
}: {
  count: number
  status?: AnmerkungStatus | null
  onClick: () => void
  title?: string
}) {
  const color = status ? STATUS_COLOR[status] : 'var(--text-muted, #757575)'
  const active = count > 0
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick() }}
      title={title ?? (active ? `${count} Anmerkung(en)` : 'Anmerken')}
      aria-label={title ?? `${count} Anmerkungen`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 3,
        minWidth: 24, minHeight: 24, padding: '4px 7px',
        borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
        fontSize: 11, fontWeight: 600, lineHeight: 1,
        border: `1px solid ${active ? color : 'var(--border, #E0E0E0)'}`,
        background: active ? `${color}1A` : 'transparent',
        color: active ? color : 'var(--text-muted, #757575)',
      }}
    >
      <MessageSquare size={11} />
      {active && <span>{count}</span>}
    </button>
  )
}

export default AnmerkungBadge
