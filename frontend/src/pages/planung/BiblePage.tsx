import { BookOpen } from 'lucide-react'

export default function BiblePage() {
  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '32px 40px' }}>
      <div style={{
        maxWidth: 560, margin: '80px auto', textAlign: 'center',
        color: 'var(--text-muted)',
      }}>
        <BookOpen size={40} style={{ opacity: 0.25, marginBottom: 16 }} />
        <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: 'var(--text-primary)' }}>
          Bible
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.6 }}>
          Staffelübergreifende Figurenwahrheit: Beziehungen, Chronologie,
          abgeleitet aus freigegebenen Future-Ständen.
          <br />Wird in PR 7 gebaut.
        </div>
      </div>
    </div>
  )
}
