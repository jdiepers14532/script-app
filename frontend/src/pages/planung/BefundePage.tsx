import { AlertTriangle } from 'lucide-react'

export default function BefundePage() {
  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '32px 40px' }}>
      <div style={{
        maxWidth: 560, margin: '80px auto', textAlign: 'center',
        color: 'var(--text-muted)',
      }}>
        <AlertTriangle size={40} style={{ opacity: 0.25, marginBottom: 16 }} />
        <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: 'var(--text-primary)' }}>
          Befund-Register
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.6 }}>
          Erkannte Inkonsistenzen — Cast-Lücken, Rollen-Überschuss,
          Beziehungswidersprüche. Offen bis gelöst.
          <br />Wird in PR 6 gebaut.
        </div>
      </div>
    </div>
  )
}
