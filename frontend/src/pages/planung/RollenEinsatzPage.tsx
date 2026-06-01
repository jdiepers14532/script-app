import { GanttChart } from 'lucide-react'

export default function RollenEinsatzPage() {
  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '32px 40px' }}>
      <div style={{
        maxWidth: 560, margin: '80px auto', textAlign: 'center',
        color: 'var(--text-muted)',
      }}>
        <GanttChart size={40} style={{ opacity: 0.25, marginBottom: 16 }} />
        <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: 'var(--text-primary)' }}>
          Rollen-Einsatzplanung
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.6 }}>
          Gantt-Ansicht: Welche Rollen werden in welchen Blöcken geschrieben?
          Zeilen = Rollen, X-Achse = Blöcke.
          <br />Wird in PR 5 gebaut.
        </div>
      </div>
    </div>
  )
}
