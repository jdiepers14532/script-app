import { useState, useEffect } from 'react'
import { X, Check, XCircle, HelpCircle, ExternalLink } from 'lucide-react'
import type { Beziehungstyp, SeedKandidat, Reihe, Staffel } from './types'

interface SeedReviewPanelProps {
  reihen: Reihe[]
  staffeln: Staffel[]
  beziehungstypen: Beziehungstyp[]
  onClose: () => void
  onKanteFreigegeben?: () => void
}

type Tab = 'neu' | 'braucht_klaerung'

interface FreigabeFormState {
  kandidatId: string
  reihenId: string
  ab: string
  bis: string
  quelleId: string
  zielId: string
  typKey: string
}

export default function SeedReviewPanel({
  reihen, staffeln, beziehungstypen, onClose, onKanteFreigegeben,
}: SeedReviewPanelProps) {
  const [tab, setTab] = useState<Tab>('neu')
  const [kandidaten, setKandidaten] = useState<SeedKandidat[]>([])
  const [loading, setLoading] = useState(false)
  const [freigabeForm, setFreigabeForm] = useState<FreigabeFormState | null>(null)
  const [actionError, setActionError] = useState('')

  const loadKandidaten = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/beziehungen/seed?status=${tab}`, { credentials: 'include' })
      const data = await res.json()
      setKandidaten(Array.isArray(data) ? data : [])
    } catch {
      setKandidaten([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadKandidaten() }, [tab])

  const handleAblehnen = async (id: string) => {
    setActionError('')
    try {
      const res = await fetch(`/api/beziehungen/seed/${id}/ablehnen`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' }, body: '{}',
      })
      if (!res.ok) throw new Error((await res.json()).error)
      await loadKandidaten()
    } catch (e: any) {
      setActionError(e.message ?? 'Fehler')
    }
  }

  const handleFreigabeStart = (k: SeedKandidat) => {
    setFreigabeForm({
      kandidatId: k.id,
      reihenId: reihen[0]?.id ?? '',
      ab: String(k.gueltig_ab_staffel ?? staffeln[0]?.staffelnummer ?? 1),
      bis: k.gueltig_bis_staffel != null ? String(k.gueltig_bis_staffel) : '',
      quelleId: k.match_quelle_id ?? '',
      zielId: k.match_ziel_id ?? '',
      typKey: k.typ_key ?? '',
    })
    setActionError('')
  }

  const handleFreigabeSubmit = async () => {
    if (!freigabeForm) return
    setActionError('')
    const abN = parseInt(freigabeForm.ab, 10)
    if (isNaN(abN)) { setActionError('Gültig ab muss eine Zahl sein'); return }
    const bisN = freigabeForm.bis.trim() ? parseInt(freigabeForm.bis, 10) : null
    if (bisN !== null && isNaN(bisN)) { setActionError('Gültig bis muss eine Zahl sein'); return }
    if (!freigabeForm.reihenId) { setActionError('Reihe wählen'); return }

    const anlegen_quelle = !freigabeForm.quelleId
    const anlegen_ziel = !freigabeForm.zielId

    try {
      const res = await fetch(`/api/beziehungen/seed/${freigabeForm.kandidatId}/freigeben`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reihen_id: freigabeForm.reihenId,
          gueltig_ab_staffel: abN,
          gueltig_bis_staffel: bisN,
          anlegen_quelle,
          anlegen_ziel,
          quelle_id: freigabeForm.quelleId || undefined,
          ziel_id: freigabeForm.zielId || undefined,
          // Typ-Key-Update wenn abweichend
          ...(freigabeForm.typKey ? { typ_key: freigabeForm.typKey } : {}),
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setFreigabeForm(null)
      await loadKandidaten()
      onKanteFreigegeben?.()
    } catch (e: any) {
      setActionError(e.message ?? 'Fehler')
    }
  }

  const TAB_STYLE = (active: boolean): React.CSSProperties => ({
    padding: '8px 16px', cursor: 'pointer', fontSize: 12, fontWeight: active ? 600 : 400,
    color: active ? '#000' : '#757575', background: 'none', border: 'none',
    borderBottom: active ? '2px solid #000' : '2px solid transparent',
    fontFamily: 'Inter, sans-serif',
  })

  return (
    <div style={{
      position: 'absolute', top: 0, right: 0, bottom: 0, width: 400,
      background: '#fff', borderLeft: '1px solid #E0E0E0',
      boxShadow: '-4px 0 16px rgba(0,0,0,0.08)',
      display: 'flex', flexDirection: 'column',
      fontFamily: 'Inter, sans-serif', zIndex: 10,
    }}>
      {/* Header */}
      <div style={{ padding: '16px 16px 0', borderBottom: '1px solid #E0E0E0' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12,
        }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>Wiki-Seed Review</div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: 4, borderRadius: 4, color: '#757575', display: 'flex',
          }}>
            <X size={16} />
          </button>
        </div>
        <div style={{ display: 'flex', gap: 0 }}>
          <button style={TAB_STYLE(tab === 'neu')} onClick={() => setTab('neu')}>Neu</button>
          <button style={TAB_STYLE(tab === 'braucht_klaerung')} onClick={() => setTab('braucht_klaerung')}>
            Klärung nötig
          </button>
        </div>
      </div>

      {/* CC-BY-SA Attribution */}
      <div style={{
        padding: '6px 16px', background: '#F5F5F5', fontSize: 10, color: '#757575',
        borderBottom: '1px solid #E0E0E0',
      }}>
        Quelldaten: Fandom Wiki · Lizenz:{' '}
        <a
          href="https://creativecommons.org/licenses/by-sa/3.0/"
          target="_blank" rel="noopener noreferrer"
          style={{ color: '#007AFF' }}
        >
          CC-BY-SA 3.0
        </a>
        {' '}· Inhalt nicht automatisch in die App übernommen
      </div>

      {/* Liste */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#757575', fontSize: 13 }}>
            Lädt…
          </div>
        ) : kandidaten.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#757575', fontSize: 13 }}>
            Keine Kandidaten in dieser Kategorie.
          </div>
        ) : (
          kandidaten.map(k => (
            <div key={k.id} style={{
              padding: '12px 16px', borderBottom: '1px solid #F5F5F5',
              background: freigabeForm?.kandidatId === k.id ? '#FFFBF0' : '#fff',
            }}>
              {/* Figuren-Paar */}
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                {k.roh_quelle_name}{' '}
                <span style={{ color: '#757575', fontWeight: 400 }}>↔</span>{' '}
                {k.roh_ziel_name}
              </div>

              {/* Typ + Staffel-Hinweis */}
              <div style={{ fontSize: 11, color: '#757575', marginBottom: 6 }}>
                {k.typ_key
                  ? beziehungstypen.find(t => t.key === k.typ_key)?.label ?? k.typ_key
                  : '— kein Typ —'}
                {k.staffel_hinweis != null && ` · Staffel ${k.staffel_hinweis}`}
                {k.ki_konfidenz != null && ` · KI: ${Math.round(k.ki_konfidenz * 100)}%`}
              </div>

              {/* Zitat */}
              {k.evidenz_zitat && (
                <div style={{
                  fontSize: 11, color: '#555', fontStyle: 'italic',
                  background: '#F5F5F5', borderRadius: 4, padding: '4px 8px', marginBottom: 6,
                  borderLeft: '2px solid #E0E0E0', lineHeight: 1.4,
                }}>
                  „{k.evidenz_zitat}"
                </div>
              )}

              {/* Quelle */}
              <div style={{ fontSize: 10, color: '#757575', marginBottom: 8 }}>
                Quelle:{' '}
                <a href={k.quell_url} target="_blank" rel="noopener noreferrer"
                  style={{ color: '#007AFF' }}>
                  {k.quell_url.replace(/^https?:\/\//, '').slice(0, 50)}
                  <ExternalLink size={10} style={{ marginLeft: 2, verticalAlign: 'middle' }} />
                </a>
              </div>

              {/* Aktion-Buttons */}
              {freigabeForm?.kandidatId !== k.id ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="bb-btn" onClick={() => handleFreigabeStart(k)} style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: '6px 10px', background: '#000', color: '#fff',
                    border: 'none', borderRadius: 5, fontSize: 11, cursor: 'pointer',
                    fontFamily: 'Inter, sans-serif', minHeight: 32,
                  }}>
                    <Check size={12} /> Freigeben
                  </button>
                  <button className="bb-btn" onClick={() => handleAblehnen(k.id)} style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: '6px 10px', background: '#FFF2F0', color: '#FF3B30',
                    border: '1px solid #FF3B30', borderRadius: 5, fontSize: 11,
                    cursor: 'pointer', fontFamily: 'Inter, sans-serif', minHeight: 32,
                  }}>
                    <XCircle size={12} /> Ablehnen
                  </button>
                </div>
              ) : (
                /* Mini-Formular für Freigabe */
                <FreigabeForm
                  form={freigabeForm}
                  reihen={reihen}
                  staffeln={staffeln}
                  beziehungstypen={beziehungstypen}
                  error={actionError}
                  onChange={setFreigabeForm}
                  onSubmit={handleFreigabeSubmit}
                  onCancel={() => setFreigabeForm(null)}
                />
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ── Inline Freigabe-Formular ────────────────────────────────────────────────
function FreigabeForm({
  form, reihen, staffeln, beziehungstypen, error,
  onChange, onSubmit, onCancel,
}: {
  form: FreigabeFormState
  reihen: Reihe[]
  staffeln: Staffel[]
  beziehungstypen: Beziehungstyp[]
  error: string
  onChange: (f: FreigabeFormState) => void
  onSubmit: () => void
  onCancel: () => void
}) {
  const set = (key: keyof FreigabeFormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      onChange({ ...form, [key]: e.target.value })

  const fieldStyle: React.CSSProperties = {
    width: '100%', padding: '6px 8px', border: '1px solid #E0E0E0',
    borderRadius: 4, fontSize: 12, fontFamily: 'Inter, sans-serif',
    background: '#fff', boxSizing: 'border-box',
  }

  return (
    <div style={{
      background: '#F5F5F5', borderRadius: 6, padding: 10,
      display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8,
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <label style={{ fontSize: 11, color: '#757575', display: 'block', marginBottom: 3 }}>Reihe</label>
          <select value={form.reihenId} onChange={set('reihenId')} style={fieldStyle}>
            {reihen.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, color: '#757575', display: 'block', marginBottom: 3 }}>Typ</label>
          <select value={form.typKey} onChange={set('typKey')} style={fieldStyle}>
            <option value="">— Typ —</option>
            {beziehungstypen.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, color: '#757575', display: 'block', marginBottom: 3 }}>Ab Staffel</label>
          <input type="number" value={form.ab} onChange={set('ab')} style={fieldStyle} min={0} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: '#757575', display: 'block', marginBottom: 3 }}>
            Bis Staffel
          </label>
          <input type="number" value={form.bis} onChange={set('bis')} style={fieldStyle} min={0} placeholder="offen" />
        </div>
      </div>
      <div style={{ fontSize: 10, color: '#757575' }}>
        Quell-ID: {form.quelleId || '— neu anlegen —'}<br />
        Ziel-ID: {form.zielId || '— neu anlegen —'}
      </div>
      {error && (
        <div style={{ fontSize: 11, color: '#FF3B30', background: '#FFF2F0',
          borderRadius: 4, padding: '4px 8px' }}>
          {error}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6 }}>
        <button className="bb-btn" onClick={onSubmit} style={{
          flex: 1, padding: '7px 12px', background: '#000', color: '#fff',
          border: 'none', borderRadius: 5, fontSize: 12,
          fontFamily: 'Inter, sans-serif', cursor: 'pointer', minHeight: 32,
        }}>
          Bestätigen
        </button>
        <button className="bb-btn" onClick={onCancel} style={{
          padding: '7px 12px', background: '#fff', color: '#757575',
          border: '1px solid #E0E0E0', borderRadius: 5, fontSize: 12,
          fontFamily: 'Inter, sans-serif', cursor: 'pointer', minHeight: 32,
        }}>
          Abbrechen
        </button>
      </div>
    </div>
  )
}
