import { useState, useEffect } from 'react'
import { X, Clock } from 'lucide-react'
import { api } from '../../api/client'

interface Props {
  dokumentId: string
  fassungId: string
  onClose: () => void
}

const EREIGNIS_LABELS: Record<string, string> = {
  erstellt: 'Erstellt',
  gespeichert: 'Gespeichert',
  abgegeben: 'Abgegeben',
  status_geaendert: 'Status geändert',
  autor_hinzugefuegt: 'Autor hinzugefügt',
  reviewer_hinzugefuegt: 'Reviewer hinzugefügt',
  annotation_erstellt: 'Annotation erstellt',
}

export default function BearbeitungsHistorieModal({ dokumentId, fassungId, onClose }: Props) {
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getAudit(dokumentId, fassungId)
      .then(setLogs)
      .catch(() => setLogs([]))
      .finally(() => setLoading(false))
  }, [dokumentId, fassungId])

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 998, background: 'rgba(0,0,0,0.4)' }} onClick={onClose} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        zIndex: 999, width: 480, maxHeight: '70vh',
        background: 'var(--bg-surface)', border: '1px solid var(--border)',
        borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <Clock size={14} style={{ color: 'var(--text-secondary)' }} />
          <span style={{ fontWeight: 600, fontSize: 14 }}>Bearbeitungshistorie</span>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{ width: 24, height: 24, border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: 4, display: 'grid', placeItems: 'center', color: 'var(--text-secondary)' }}>
            <X size={13} />
          </button>
        </div>

        <div style={{ overflow: 'auto', flex: 1 }}>
          {loading ? (
            <p style={{ padding: 16, color: 'var(--text-muted)', fontSize: 12 }}>Lädt…</p>
          ) : logs.length === 0 ? (
            <p style={{ padding: 16, color: 'var(--text-muted)', fontSize: 12 }}>Keine Einträge</p>
          ) : (
            <div>
              {logs.map((log) => (
                <div key={log.id} style={{ display: 'flex', gap: 10, padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                    background: 'var(--bg-subtle)', display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)',
                  }}>
                    {(log.user_name || '?').substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>
                      {log.user_name || 'Unbekannt'}
                      <span style={{ fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 6 }}>
                        {EREIGNIS_LABELS[log.ereignis] || log.ereignis}
                      </span>
                    </div>
                    {log.details && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        {log.details.von && log.details.nach ? `${log.details.von} → ${log.details.nach}` : JSON.stringify(log.details)}
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      {new Date(log.ereignis_am).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
