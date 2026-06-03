import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import type { Beziehungstyp, BaumEdgeData } from './types'

interface KanteFormDrawerProps {
  mode: 'create' | 'edit'
  edge?: BaumEdgeData
  sourceId?: string
  targetId?: string
  sourceLabel?: string
  targetLabel?: string
  reihenId: string
  currentStaffel: number
  beziehungstypen: Beziehungstyp[]
  onSave: (kanteId: number | null, data: Partial<BaumEdgeData>) => Promise<void>
  onDelete?: (kanteId: number) => Promise<void>
  onClose: () => void
}

const STATUS_OPTIONS = [
  { value: 'aktiv', label: 'Aktiv' },
  { value: 'beendet', label: 'Beendet' },
  { value: 'historisch', label: 'Historisch' },
  { value: 'geheim', label: 'Geheim' },
  { value: 'vermutet', label: 'Vermutet' },
]

export default function KanteFormDrawer({
  mode, edge, sourceId, targetId, sourceLabel, targetLabel,
  reihenId, currentStaffel, beziehungstypen,
  onSave, onDelete, onClose,
}: KanteFormDrawerProps) {
  const [beziehungstyp, setBeziehungstyp] = useState(edge?.beziehungstyp ?? '')
  const [ab, setAb] = useState(String(edge?.gueltig_ab_staffel ?? currentStaffel))
  const [bis, setBis] = useState(edge?.gueltig_bis_staffel != null ? String(edge.gueltig_bis_staffel) : '')
  const [status, setStatus] = useState(edge?.status ?? 'aktiv')
  const [staerke, setStaerke] = useState(edge?.staerke != null ? String(edge.staerke) : '')
  const [label, setLabel] = useState(edge?.edgeLabel ?? '')
  const [notiz, setNotiz] = useState(edge?.notiz ?? '')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  // Wenn Edit-Modus: Typ-Gruppe für Auswahl vorauswählen
  useEffect(() => {
    if (mode === 'edit' && edge) {
      setBeziehungstyp(edge.beziehungstyp)
      setAb(String(edge.gueltig_ab_staffel))
      setBis(edge.gueltig_bis_staffel != null ? String(edge.gueltig_bis_staffel) : '')
      setStatus(edge.status)
      setStaerke(edge.staerke != null ? String(edge.staerke) : '')
      setLabel(edge.edgeLabel ?? '')
      setNotiz(edge.notiz ?? '')
    }
  }, [mode, edge])

  const handleSave = async () => {
    setError('')
    if (!beziehungstyp) { setError('Bitte einen Beziehungstyp wählen.'); return }
    const abN = parseInt(ab, 10)
    if (isNaN(abN)) { setError('Gültig ab muss eine Zahl sein.'); return }
    const bisN = bis.trim() ? parseInt(bis, 10) : null
    if (bisN !== null && isNaN(bisN)) { setError('Gültig bis muss eine Zahl sein.'); return }
    if (bisN !== null && bisN < abN) { setError('Gültig bis muss ≥ gültig ab sein.'); return }
    setSaving(true)
    try {
      const payload: Partial<BaumEdgeData> = {
        reihen_id: reihenId,
        character_id: edge?.character_id ?? sourceId ?? '',
        related_character_id: edge?.related_character_id ?? targetId ?? '',
        beziehungstyp,
        gueltig_ab_staffel: abN,
        gueltig_bis_staffel: bisN,
        status,
        staerke: staerke.trim() ? parseInt(staerke, 10) : null,
        edgeLabel: label.trim() || undefined,
        notiz: notiz.trim() || undefined,
      }
      await onSave(edge?.kanteId ?? null, payload)
    } catch (e: any) {
      setError(e.message ?? 'Fehler beim Speichern')
    } finally {
      setSaving(false)
    }
  }

  const handleBeenden = () => {
    setBis(String(currentStaffel))
  }

  const handleDelete = async () => {
    if (!edge?.kanteId || !onDelete) return
    if (!confirm('Kante wirklich löschen?')) return
    setDeleting(true)
    try {
      await onDelete(edge.kanteId)
    } catch (e: any) {
      setError(e.message ?? 'Fehler beim Löschen')
      setDeleting(false)
    }
  }

  // Typen nach Kategorie gruppieren
  const kategorien = Array.from(new Set(beziehungstypen.map(t => t.kategorie)))

  return (
    <div style={{
      position: 'absolute', top: 0, right: 0, bottom: 0, width: 320,
      background: '#fff', borderLeft: '1px solid #E0E0E0',
      boxShadow: '-4px 0 16px rgba(0,0,0,0.08)',
      display: 'flex', flexDirection: 'column',
      fontFamily: 'Inter, sans-serif', zIndex: 10,
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 16px 12px', borderBottom: '1px solid #E0E0E0',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>
            {mode === 'create' ? 'Neue Beziehung' : 'Beziehung bearbeiten'}
          </div>
          {(sourceLabel || targetLabel) && (
            <div style={{ fontSize: 11, color: '#757575', marginTop: 2 }}>
              {sourceLabel ?? '?'} → {targetLabel ?? '?'}
            </div>
          )}
        </div>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          padding: 4, borderRadius: 4, color: '#757575',
          display: 'flex', alignItems: 'center',
        }}>
          <X size={16} />
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Beziehungstyp */}
        <div>
          <label style={{ fontSize: 12, fontWeight: 500, color: '#757575', display: 'block', marginBottom: 4 }}>
            Beziehungstyp *
          </label>
          <select
            className="bb-select"
            value={beziehungstyp}
            onChange={e => setBeziehungstyp(e.target.value)}
            style={{
              width: '100%', padding: '8px 10px', border: '1px solid #E0E0E0',
              borderRadius: 6, fontSize: 13, fontFamily: 'Inter, sans-serif',
              background: '#fff', appearance: 'auto',
            }}
          >
            <option value="">— Typ wählen —</option>
            {kategorien.map(kat => (
              <optgroup key={kat} label={kat.charAt(0).toUpperCase() + kat.slice(1)}>
                {beziehungstypen.filter(t => t.kategorie === kat).map(t => (
                  <option key={t.key} value={t.key}>
                    {t.label}{t.gerichtet ? ' →' : ''}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* Staffel-Range */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: '#757575', display: 'block', marginBottom: 4 }}>
              Gültig ab Staffel *
            </label>
            <input
              className="bb-input"
              type="number" min={0} value={ab} onChange={e => setAb(e.target.value)}
              style={{
                width: '100%', padding: '8px 10px', border: '1px solid #E0E0E0',
                borderRadius: 6, fontSize: 13, fontFamily: 'Inter, sans-serif',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: '#757575', display: 'block', marginBottom: 4 }}>
              Gültig bis Staffel
            </label>
            <input
              className="bb-input"
              type="number" min={0} value={bis} onChange={e => setBis(e.target.value)}
              placeholder="offen"
              style={{
                width: '100%', padding: '8px 10px', border: '1px solid #E0E0E0',
                borderRadius: 6, fontSize: 13, fontFamily: 'Inter, sans-serif',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        {/* Beenden-Button */}
        {mode === 'edit' && (!edge?.gueltig_bis_staffel) && (
          <button onClick={handleBeenden} style={{
            background: '#F5F5F5', border: '1px solid #E0E0E0',
            borderRadius: 6, padding: '8px 12px', fontSize: 12,
            fontFamily: 'Inter, sans-serif', cursor: 'pointer',
            color: '#757575', textAlign: 'left',
          }}>
            Beziehung in Staffel {currentStaffel} beenden
          </button>
        )}

        {/* Status */}
        <div>
          <label style={{ fontSize: 12, fontWeight: 500, color: '#757575', display: 'block', marginBottom: 4 }}>
            Status
          </label>
          <select
            className="bb-select"
            value={status} onChange={e => setStatus(e.target.value)}
            style={{
              width: '100%', padding: '8px 10px', border: '1px solid #E0E0E0',
              borderRadius: 6, fontSize: 13, fontFamily: 'Inter, sans-serif',
              background: '#fff',
            }}
          >
            {STATUS_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Stärke */}
        <div>
          <label style={{ fontSize: 12, fontWeight: 500, color: '#757575', display: 'block', marginBottom: 4 }}>
            Stärke (1–5)
          </label>
          <div style={{ display: 'flex', gap: 6 }}>
            {[1, 2, 3, 4, 5].map(n => (
              <button
                key={n}
                className="bb-staerke-btn"
                onClick={() => setStaerke(staerke === String(n) ? '' : String(n))}
                style={{
                  width: 36, height: 36, border: '1px solid',
                  borderColor: staerke === String(n) ? '#000' : '#E0E0E0',
                  borderRadius: 6, background: staerke === String(n) ? '#000' : '#fff',
                  color: staerke === String(n) ? '#fff' : '#757575',
                  fontSize: 13, fontFamily: 'Inter, sans-serif', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Label */}
        <div>
          <label style={{ fontSize: 12, fontWeight: 500, color: '#757575', display: 'block', marginBottom: 4 }}>
            Beschriftung (optional)
          </label>
          <input
            className="bb-input"
            type="text" value={label} onChange={e => setLabel(e.target.value)}
            placeholder="z.B. seit 1985"
            maxLength={60}
            style={{
              width: '100%', padding: '8px 10px', border: '1px solid #E0E0E0',
              borderRadius: 6, fontSize: 13, fontFamily: 'Inter, sans-serif',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Notiz */}
        <div>
          <label style={{ fontSize: 12, fontWeight: 500, color: '#757575', display: 'block', marginBottom: 4 }}>
            Interne Notiz
          </label>
          <textarea
            value={notiz} onChange={e => setNotiz(e.target.value)}
            rows={3}
            style={{
              width: '100%', padding: '8px 10px', border: '1px solid #E0E0E0',
              borderRadius: 6, fontSize: 13, fontFamily: 'Inter, sans-serif',
              resize: 'vertical', boxSizing: 'border-box', lineHeight: '1.5',
            }}
          />
        </div>

        {error && (
          <div style={{
            background: '#FFF2F0', border: '1px solid #FF3B30',
            borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#FF3B30',
          }}>
            {error}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: 16, borderTop: '1px solid #E0E0E0',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="bb-btn"
            onClick={handleSave}
            disabled={saving}
            style={{
              flex: 1, padding: '10px 16px', background: '#000', color: '#fff',
              border: 'none', borderRadius: 6, fontSize: 13,
              fontFamily: 'Inter, sans-serif', fontWeight: 500, cursor: 'pointer',
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? 'Speichert…' : 'Speichern'}
          </button>
          <button
            className="bb-btn"
            onClick={onClose}
            style={{
              padding: '10px 16px', background: '#F5F5F5', color: '#000',
              border: '1px solid #E0E0E0', borderRadius: 6, fontSize: 13,
              fontFamily: 'Inter, sans-serif', cursor: 'pointer',
            }}
          >
            Abbrechen
          </button>
        </div>
        {mode === 'edit' && onDelete && (
          <button
            className="bb-btn"
            onClick={handleDelete}
            disabled={deleting}
            style={{
              padding: '8px 16px', background: '#FFF2F0', color: '#FF3B30',
              border: '1px solid #FF3B30', borderRadius: 6, fontSize: 12,
              fontFamily: 'Inter, sans-serif', cursor: 'pointer',
              opacity: deleting ? 0.6 : 1,
            }}
          >
            {deleting ? 'Löscht…' : 'Kante löschen'}
          </button>
        )}
      </div>
    </div>
  )
}
