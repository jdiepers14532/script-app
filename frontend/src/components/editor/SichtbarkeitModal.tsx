import { useState, useEffect } from 'react'
import { X, Eye, Lock, Users, Globe, Building, Info } from 'lucide-react'
import { api } from '../../api/client'
import Tooltip from '../Tooltip'

type SichtbarkeitState = 'privat' | 'colab' | 'review' | 'produktion' | 'alle'

interface Props {
  dokumentId: string
  fassungId: string
  staffelId: string
  currentSichtbarkeit: string
  currentColabGruppeId?: number | null
  abgegeben?: boolean
  onDone: (updated: any) => void
  onClose: () => void
}

const STATES: { value: SichtbarkeitState; icon: React.ReactNode; label: string; desc: string }[] = [
  { value: 'privat',     icon: <Lock size={13} />,     label: 'Privat',      desc: 'Nur du kannst lesen und schreiben' },
  { value: 'colab',      icon: <Users size={13} />,    label: 'Colab',       desc: 'Ausgewählte Gruppe kann schreiben (Echtzeit)' },
  { value: 'review',     icon: <Eye size={13} />,      label: 'Review',      desc: 'Reviewer können lesen und annotieren' },
  { value: 'produktion', icon: <Building size={13} />, label: 'Produktion',  desc: 'Produktionsteam kann lesen und annotieren' },
  { value: 'alle',       icon: <Globe size={13} />,    label: 'Alle',        desc: 'Jeder mit Zugriff kann lesen' },
]

export const SICHTBARKEIT_COLORS: Record<string, string> = {
  privat:     '#757575',
  colab:      '#007AFF',
  review:     '#FF9500',
  produktion: '#AF52DE',
  alle:       '#00C853',
}

export default function SichtbarkeitModal({ dokumentId, fassungId, staffelId, currentSichtbarkeit, currentColabGruppeId, abgegeben, onDone, onClose }: Props) {
  const [selected, setSelected] = useState<SichtbarkeitState>(currentSichtbarkeit as SichtbarkeitState)
  const [colabGruppeId, setColabGruppeId] = useState<number | null>(currentColabGruppeId ?? null)
  const [gruppen, setGruppen] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.getColabGruppen(staffelId).then(setGruppen).catch(() => {})
  }, [staffelId])

  const handleSave = async () => {
    setLoading(true)
    setError(null)
    try {
      const updated = await api.updateSichtbarkeit(dokumentId, fassungId, {
        sichtbarkeit: selected,
        colab_gruppe_id: selected === 'colab' ? (colabGruppeId ?? undefined) : undefined,
      })
      onDone(updated)
    } catch (e: any) {
      setError(e.message)
      setLoading(false)
    }
  }

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 998, background: 'rgba(0,0,0,0.4)' }} onClick={onClose} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        zIndex: 999, width: 440,
        background: 'var(--bg-surface)', border: '1px solid var(--border)',
        borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <Eye size={14} style={{ color: 'var(--text-secondary)' }} />
          <span style={{ fontWeight: 600, fontSize: 14 }}>Sichtbarkeit</span>
          <div style={{ flex: 1 }} />
          <Tooltip text={'Bestimmte Rollen (z.B. Herstellungsleitung) können diese\nEinstellung überschreiben, um Produktionssperren zu vermeiden.'}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--text-muted)', cursor: 'help' }}>
              <Info size={11} />
              Override-Info
            </span>
          </Tooltip>
          <button onClick={onClose} style={{ width: 24, height: 24, border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: 4, display: 'grid', placeItems: 'center', color: 'var(--text-secondary)', marginLeft: 8 }}>
            <X size={13} />
          </button>
        </div>

        <div style={{ padding: '12px 16px' }}>
          {abgegeben && (
            <div style={{ marginBottom: 12, padding: '8px 12px', background: 'rgba(255,153,0,0.08)', border: '1px solid rgba(255,153,0,0.3)', borderRadius: 6, fontSize: 12, color: 'var(--sw-warning-alt)' }}>
              Diese Fassung ist abgegeben — Sichtbarkeit kann trotzdem geändert werden.
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {STATES.map(s => (
              <button
                key={s.value}
                onClick={() => setSelected(s.value)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                  border: `1px solid ${selected === s.value ? SICHTBARKEIT_COLORS[s.value] : s.value === 'privat' ? 'rgba(255,59,48,0.2)' : 'var(--border)'}`,
                  borderRadius: 8,
                  background: selected === s.value ? `${SICHTBARKEIT_COLORS[s.value]}11` : s.value === 'privat' ? 'rgba(255,59,48,0.04)' : 'transparent',
                  cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', width: '100%',
                }}
              >
                <span style={{ color: SICHTBARKEIT_COLORS[s.value], flexShrink: 0 }}>{s.icon}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{s.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 1 }}>{s.desc}</div>
                </div>
              </button>
            ))}
          </div>

          {selected === 'colab' && (
            <div style={{ marginTop: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                Colab-Gruppe
              </label>
              <select
                value={colabGruppeId ?? ''}
                onChange={e => setColabGruppeId(e.target.value ? Number(e.target.value) : null)}
                style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit' }}
              >
                <option value="">Keine Gruppe gewählt</option>
                {gruppen.filter(g => g.typ === 'colab').map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
          )}

          {error && (
            <div style={{ marginTop: 12, padding: '8px 12px', background: 'rgba(255,59,48,0.08)', border: '1px solid rgba(255,59,48,0.3)', borderRadius: 6, fontSize: 12, color: 'var(--sw-danger)' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
            <button onClick={onClose} disabled={loading} style={{ padding: '7px 16px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 6, background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'inherit' }}>
              Abbrechen
            </button>
            <button onClick={handleSave} disabled={loading} style={{
              padding: '7px 16px', fontSize: 13, border: 'none', borderRadius: 6,
              background: 'var(--text-primary)', color: 'var(--text-inverse)',
              cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontWeight: 500, opacity: loading ? 0.7 : 1,
            }}>
              {loading ? 'Speichert…' : 'Speichern'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
