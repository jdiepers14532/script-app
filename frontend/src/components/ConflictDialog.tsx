import { AlertTriangle, RefreshCw, Trash2, X } from 'lucide-react'
import { useOfflineQueueContext } from '../sw-ui'
import type { SyncConflict } from '../sw-ui'

// ── Helper ────────────────────────────────────────────────────────────────────

function formatTs(iso: string | undefined): string {
  if (!iso) return '–'
  try {
    return new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })
  } catch { return iso }
}

function sceneLabel(conflict: SyncConflict): string {
  const meta = conflict.clientBody?._meta
  if (meta?.szene || meta?.ort) {
    return [meta.szene ? `Sz ${meta.szene}` : null, meta.ort || null]
      .filter(Boolean).join(' — ')
  }
  // Fallback: Kurz-UUID aus URL
  const match = conflict.url.match(/([0-9a-f-]{8,})$/i)
  return match ? match[1].slice(0, 8) + '…' : conflict.url
}

// ── Komponente ────────────────────────────────────────────────────────────────

export default function ConflictDialog() {
  const { conflicts, resolveConflict } = useOfflineQueueContext()

  if (conflicts.length === 0) return null

  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24,
      zIndex: 9999,
      display: 'flex', flexDirection: 'column', gap: 10,
      maxWidth: 400,
      pointerEvents: 'none',
    }}>
      {conflicts.map(conflict => (
        <ConflictCard
          key={conflict.queueId}
          conflict={conflict}
          onForcePush={() => resolveConflict(conflict.queueId, 'force-push')}
          onDiscard={() => resolveConflict(conflict.queueId, 'discard')}
        />
      ))}
    </div>
  )
}

// ── Einzelne Karte ────────────────────────────────────────────────────────────

function ConflictCard({
  conflict, onForcePush, onDiscard,
}: {
  conflict: SyncConflict
  onForcePush: () => void
  onDiscard: () => void
}) {
  const label = sceneLabel(conflict)

  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid #FF9500',
      borderLeft: '4px solid #FF9500',
      borderRadius: 10,
      padding: '14px 16px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
      pointerEvents: 'auto',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
        <AlertTriangle size={16} style={{ color: '#FF9500', flexShrink: 0, marginTop: 1 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.3 }}>
            Speicherkonflikt
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
            {label}
          </div>
        </div>
      </div>

      {/* Zeitstempel-Vergleich */}
      <div style={{
        background: 'var(--bg-subtle)',
        borderRadius: 6,
        padding: '8px 10px',
        marginBottom: 12,
        fontSize: 11,
        color: 'var(--text-secondary)',
        lineHeight: 1.8,
      }}>
        <div>
          <span style={{ color: 'var(--text-muted)', display: 'inline-block', width: 120 }}>
            Deine Version:
          </span>
          {formatTs(conflict.clientVersion)}
        </div>
        <div>
          <span style={{ color: 'var(--text-muted)', display: 'inline-block', width: 120 }}>
            Server-Version:
          </span>
          <span style={{ color: '#FF9500', fontWeight: 600 }}>
            {formatTs(conflict.serverVersion)}
          </span>
        </div>
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>
        Jemand anderes hat diese Szene nach deiner letzten Speicherung geändert.
        Was soll passieren?
      </div>

      {/* Aktionen */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={onForcePush}
          style={{
            flex: 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            padding: '8px 12px', borderRadius: 7,
            border: '1px solid #FF9500',
            background: 'rgba(255,149,0,0.08)',
            color: '#FF9500',
            fontSize: 12, fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <RefreshCw size={12} />
          Meine Version speichern
        </button>
        <button
          onClick={onDiscard}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            padding: '8px 12px', borderRadius: 7,
            border: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--text-secondary)',
            fontSize: 12, fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          <Trash2 size={12} />
          Verwerfen
        </button>
      </div>
    </div>
  )
}
