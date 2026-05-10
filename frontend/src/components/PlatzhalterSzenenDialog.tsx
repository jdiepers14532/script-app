import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { api } from '../api/client'

interface Props {
  werkstufId: string
  produktionId: string
  open: boolean
  onClose: () => void
  onCreated: () => void
}

export default function PlatzhalterSzenenDialog({ werkstufId, produktionId, open, onClose, onCreated }: Props) {
  const [anzahl, setAnzahl] = useState(5)
  const [strangId, setStrangId] = useState<string>('')
  const [straenge, setStraenge] = useState<any[]>([])
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (!open) return
    api.getStraenge(produktionId).then(setStraenge).catch(() => {})
  }, [open, produktionId])

  const handleCreate = async () => {
    if (anzahl < 1) return
    setCreating(true)
    try {
      await api.createPlatzhalterSzenen({
        werkstufe_id: werkstufId,
        anzahl,
        strang_id: strangId || undefined,
      })
      onCreated()
      onClose()
    } catch (e: any) {
      alert('Fehler: ' + e.message)
    } finally {
      setCreating(false)
    }
  }

  if (!open) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 340 }}>
        <div className="modal-head">
          <span>Platzhalter-Szenen anlegen</span>
          <button className="iconbtn" onClick={onClose}><X size={14} /></button>
        </div>
        <div className="modal-body" style={{ padding: '16px' }}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Anzahl</label>
            <input
              type="number"
              min={1}
              max={50}
              value={anzahl}
              onChange={e => setAnzahl(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
              style={{ width: 80, padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 14, textAlign: 'center' }}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Strang (optional)</label>
            <select
              value={strangId}
              onChange={e => setStrangId(e.target.value)}
              style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, background: 'var(--bg)' }}
            >
              <option value="">Kein Strang</option>
              {straenge.filter(s => s.status === 'aktiv').map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn-sm" onClick={onClose}>Abbrechen</button>
            <button className="btn-sm btn-primary" onClick={handleCreate} disabled={creating}>
              {creating ? 'Erstelle...' : 'Anlegen'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
