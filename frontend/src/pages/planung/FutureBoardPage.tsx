import { Kanban } from 'lucide-react'

export default function FutureBoardPage() {
  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '32px 40px' }}>
      <div style={{
        maxWidth: 560, margin: '80px auto', textAlign: 'center',
        color: 'var(--text-muted)',
      }}>
        <Kanban size={40} style={{ opacity: 0.25, marginBottom: 16 }} />
        <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: 'var(--text-primary)' }}>
          Future-Board
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.6 }}>
          2D-Board: Spalten = Blöcke (live aus ProdDB), Zeilen = Stränge.
          Beats per Drag-and-drop verschiebbar.
          <br />Wird in PR 3 gebaut.
        </div>
      </div>
    </div>
  )
}
