import { History } from 'lucide-react'

export default function VersionenPage() {
  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '32px 40px' }}>
      <div style={{
        maxWidth: 560, margin: '80px auto', textAlign: 'center',
        color: 'var(--text-muted)',
      }}>
        <History size={40} style={{ opacity: 0.25, marginBottom: 16 }} />
        <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: 'var(--text-primary)' }}>
          Versionen &amp; Freigabe
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.6 }}>
          Eingefrorene Snapshots von Konzept und Future.
          Freigabe-Workflow für das Story-Team.
          <br />Wird in PR 4 gebaut.
        </div>
      </div>
    </div>
  )
}
