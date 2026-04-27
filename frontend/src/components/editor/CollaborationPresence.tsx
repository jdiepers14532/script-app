import type { CollabStatus, CollabUser } from '../../hooks/useCollaboration'
import Tooltip from '../Tooltip'

interface Props {
  status: CollabStatus
  users: CollabUser[]
}

const STATUS_COLORS: Record<CollabStatus, string> = {
  connected: '#00C853',
  connecting: '#FFCC00',
  disconnected: '#757575',
  offline: '#FF3B30',
}

const STATUS_LABELS: Record<CollabStatus, string> = {
  connected: 'Verbunden',
  connecting: 'Verbinde…',
  disconnected: 'Getrennt',
  offline: 'Offline',
}

export default function CollaborationPresence({ status, users }: Props) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {/* Status dot */}
      <Tooltip text={STATUS_LABELS[status]}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: STATUS_COLORS[status],
          display: 'inline-block',
          flexShrink: 0,
        }} />
      </Tooltip>

      {/* User avatars */}
      {users.slice(0, 5).map((u) => (
        <Tooltip key={u.clientId} text={u.user_name}>
          <span style={{
            width: 22, height: 22, borderRadius: '50%',
            background: u.color,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 9, fontWeight: 700, color: '#fff',
            cursor: 'default', flexShrink: 0,
            border: '1.5px solid var(--bg-surface)',
          }}>
            {u.user_name.slice(0, 2).toUpperCase()}
          </span>
        </Tooltip>
      ))}

      {users.length > 5 && (
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>+{users.length - 5}</span>
      )}

      {/* Offline warning */}
      {status === 'offline' && (
        <span style={{
          fontSize: 10, color: '#FF3B30',
          background: 'rgba(255,59,48,0.1)',
          padding: '2px 6px', borderRadius: 4,
        }}>
          Offline — Änderungen werden nicht synchronisiert
        </span>
      )}
    </div>
  )
}
