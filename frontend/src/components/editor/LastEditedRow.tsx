import { useState } from 'react'
import { Clock } from 'lucide-react'
import BearbeitungsHistorieModal from './BearbeitungsHistorieModal'
import type { SaveStatus } from '../../hooks/useDokument'

interface Props {
  dokumentId: string
  fassungId: string
  zuletzt_geaendert_von?: string | null
  zuletzt_geaendert_am?: string | null
  saveStatus?: SaveStatus
}

const SAVE_LABELS: Record<SaveStatus, { text: string; color: string }> = {
  idle:   { text: '', color: 'transparent' },
  saving: { text: 'Speichert…', color: 'var(--text-muted)' },
  saved:  { text: '● Gespeichert', color: 'var(--sw-green)' },
  queued: { text: '⏸ Lokal gespeichert', color: '#FF9500' },
  error:  { text: '● Fehler', color: 'var(--sw-danger)' },
}

export default function LastEditedRow({ dokumentId, fassungId, zuletzt_geaendert_von, zuletzt_geaendert_am, saveStatus = 'idle' }: Props) {
  const [showHistorie, setShowHistorie] = useState(false)
  const saveInfo = SAVE_LABELS[saveStatus]

  const formattedTime = zuletzt_geaendert_am
    ? new Date(zuletzt_geaendert_am).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })
    : null

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px', fontSize: 11, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', background: 'var(--bg-subtle)' }}>
        {formattedTime && (
          <button
            onClick={() => setShowHistorie(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 11, fontFamily: 'inherit', padding: 0 }}
            title="Bearbeitungshistorie anzeigen"
          >
            <Clock size={10} />
            <span>{zuletzt_geaendert_von ? `${zuletzt_geaendert_von}, ` : ''}{formattedTime}</span>
          </button>
        )}
        <div style={{ flex: 1 }} />
        {saveInfo.text && (
          <span style={{ color: saveInfo.color, fontWeight: saveStatus === 'saved' ? 500 : 400 }}>
            {saveInfo.text}
          </span>
        )}
      </div>

      {showHistorie && (
        <BearbeitungsHistorieModal
          dokumentId={dokumentId}
          fassungId={fassungId}
          onClose={() => setShowHistorie(false)}
        />
      )}
    </>
  )
}
