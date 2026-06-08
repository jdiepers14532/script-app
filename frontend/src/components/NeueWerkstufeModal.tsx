import { useState, useEffect, useMemo } from 'react'
import { X, AlertTriangle } from 'lucide-react'
import type { WerkstufeMeta } from '../hooks/useDokument'
import { useTerminologie } from '../sw-ui'

export type WerkstufeCreateMode = 'full' | 'headers_only' | 'storyline_body_as_txt' | 'empty' | 'platzhalter'

export interface NeueWerkstufeParams {
  typ: string
  mode: WerkstufeCreateMode
  vorgaenger_id?: string
  kopiere_notizen: boolean
  dualview: boolean
}

interface Props {
  requestedTyp: 'drehbuch' | 'storyline' | 'notiz'
  werkstufen: WerkstufeMeta[]
  aktuelleWerkstufeId?: string | null   // aktuell ausgewählte Fassung → Default-Vorgänger
  folgeNummer: number | null
  produktionId: string
  onConfirm: (params: NeueWerkstufeParams) => void
  onClose: () => void
}

const TYP_LABEL_STATIC: Record<string, string> = {
  storyline: 'Storyline',
  notiz: 'Dokument',
}

export default function NeueWerkstufeModal({
  requestedTyp, werkstufen, aktuelleWerkstufeId, folgeNummer, produktionId, onConfirm, onClose,
}: Props) {
  const { t } = useTerminologie()
  const TYP_LABEL: Record<string, string> = { ...TYP_LABEL_STATIC, drehbuch: t('drehbuch') }
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  // --- Predecessor analysis ---
  const nonNotizWerkstufen = useMemo(() => werkstufen.filter(w => w.typ !== 'notiz'), [werkstufen])

  // Latest werkstufe of same type
  const predWerk = useMemo(() =>
    [...nonNotizWerkstufen]
      .filter(w => w.typ === requestedTyp)
      .sort((a, b) => b.version_nummer - a.version_nummer)[0] ?? null,
    [nonNotizWerkstufen, requestedTyp]
  )

  // Latest werkstufe of the OTHER non-notiz type
  const crossPred = useMemo(() => {
    const otherTyp = requestedTyp === 'drehbuch' ? 'storyline' : 'drehbuch'
    return [...nonNotizWerkstufen]
      .filter(w => w.typ === otherTyp)
      .sort((a, b) => b.version_nummer - a.version_nummer)[0] ?? null
  }, [nonNotizWerkstufen, requestedTyp])

  // Vorgänger-Kandidaten desselben Typs (für das Dropdown), neueste zuerst.
  const vorgaengerKandidaten = useMemo(() =>
    [...nonNotizWerkstufen].filter(w => w.typ === requestedTyp).sort((a, b) => b.version_nummer - a.version_nummer),
    [nonNotizWerkstufen, requestedTyp]
  )
  // Default-Vorgänger = aktuell ausgewählte Fassung (wenn vom passenden Typ), sonst die neueste.
  const [gewaehlterVorgaengerId, setGewaehlterVorgaengerId] = useState<string | undefined>(() => {
    const aktuell = aktuelleWerkstufeId ? vorgaengerKandidaten.find(w => w.id === aktuelleWerkstufeId) : null
    return aktuell?.id ?? predWerk?.id
  })
  const gewaehlterPred = vorgaengerKandidaten.find(w => w.id === gewaehlterVorgaengerId) ?? predWerk
  const istNichtNeueste = !!(gewaehlterPred && predWerk && gewaehlterPred.id !== predWerk.id)

  const effectivePred = gewaehlterPred ?? crossPred
  const hasNotizScenes = useMemo(() => werkstufen.some(w => w.typ === 'notiz' && w.szenen_count > 0), [werkstufen])

  // --- Option list ---
  type OptionId = 'full' | 'headers_only' | 'storyline_body_as_txt' | 'empty' | 'platzhalter'
  interface Option { id: OptionId; label: string; desc: string }

  const options = useMemo<Option[]>(() => {
    const list: Option[] = []
    if (predWerk) {
      list.push({
        id: 'full',
        label: 'Szenen vollständig duplizieren',
        desc: `Alle Szenenköpfe + Body-Inhalt aus ${TYP_LABEL[requestedTyp]} V${gewaehlterPred?.version_nummer} übernehmen`,
      })
    }
    if (effectivePred) {
      list.push({
        id: 'headers_only',
        label: 'Nur Szenenkopf übernehmen',
        desc: `Szenenköpfe (inkl. Zusammenfassung) aus ${TYP_LABEL[effectivePred.typ]} V${effectivePred.version_nummer} — Body leer`,
      })
    }
    if (!predWerk && crossPred && requestedTyp === 'drehbuch' && crossPred.typ === 'storyline') {
      list.push({
        id: 'storyline_body_as_txt',
        label: 'Storyline-Text als TXT-Format übernehmen',
        desc: `Szenenköpfe + Storyline-Body als TXT-Absatzformat im ${t('drehbuch')}-Editor`,
      })
    }
    list.push({ id: 'empty', label: 'Leere Werkstufe anlegen', desc: 'Keine Szenen kopieren — mit einer neuen Szene starten' })
    list.push({ id: 'platzhalter', label: 'Platzhalter-Szenen anlegen', desc: 'Leere Werkstufe mit mehreren Platzhalter-Szenen füllen' })
    return list
  }, [predWerk, crossPred, effectivePred, gewaehlterPred, requestedTyp])

  // --- State ---
  const defaultOption = options[0].id
  const [selectedOption, setSelectedOption] = useState<OptionId>(defaultOption)
  const [kopiereNotizen, setKopiereNotizen] = useState(true)
  const [dualview, setDualview] = useState(false)

  // Derive which vorgaenger_id to use based on selected option (gewählte Vorfassung statt höchste)
  const vorgaengerId = useMemo(() => {
    if (selectedOption === 'full' && gewaehlterPred) return gewaehlterPred.id
    if (selectedOption === 'headers_only') return effectivePred?.id
    if (selectedOption === 'storyline_body_as_txt') return crossPred?.id
    return undefined
  }, [selectedOption, gewaehlterPred, effectivePred, crossPred])

  const handleConfirm = () => {
    onConfirm({
      typ: requestedTyp,
      mode: selectedOption,
      vorgaenger_id: vorgaengerId,
      kopiere_notizen: effectivePred ? kopiereNotizen : false,
      dualview,
    })
  }

  const typLabel = TYP_LABEL[requestedTyp]
  const crossTypLabel = requestedTyp === 'drehbuch' ? 'Storyline' : t('drehbuch')

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        background: 'var(--bg-surface)', borderRadius: 12, padding: '24px 28px',
        maxWidth: 460, width: '90%', boxShadow: '0 12px 40px rgba(0,0,0,0.4)',
        border: '1px solid var(--border)',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>
            + Neue {typLabel}-Version — Folge {folgeNummer}
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Cross-type warning */}
        {crossPred && !predWerk && (
          <div style={{
            display: 'flex', gap: 8, alignItems: 'flex-start',
            background: '#FF950015', border: '1px solid #FF950040',
            borderRadius: 8, padding: '10px 12px', marginBottom: 16, fontSize: 12,
          }}>
            <AlertTriangle size={14} style={{ color: '#FF9500', flexShrink: 0, marginTop: 1 }} />
            <span style={{ color: 'var(--text-primary)' }}>
              Eine {crossTypLabel}-Fassung (V{crossPred.version_nummer}, {crossPred.szenen_count} Szenen) existiert bereits.
            </span>
          </div>
        )}
        {crossPred && predWerk && (
          <div style={{
            display: 'flex', gap: 8, alignItems: 'flex-start',
            background: 'var(--bg-subtle)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '10px 12px', marginBottom: 16, fontSize: 12,
          }}>
            <AlertTriangle size={14} style={{ color: 'var(--text-muted)', flexShrink: 0, marginTop: 1 }} />
            <span style={{ color: 'var(--text-muted)' }}>
              Hinweis: Eine {crossTypLabel}-Fassung (V{crossPred.version_nummer}) existiert ebenfalls.
            </span>
          </div>
        )}

        {/* Vorfassung wählen (Default = aktuell ausgewählte Fassung) */}
        {vorgaengerKandidaten.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
              Vorfassung
            </div>
            <select
              value={gewaehlterVorgaengerId ?? ''}
              onChange={e => setGewaehlterVorgaengerId(e.target.value || undefined)}
              disabled={vorgaengerKandidaten.length < 2}
              style={{
                width: '100%', fontSize: 13, padding: '7px 10px', borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)',
                fontFamily: 'inherit', cursor: vorgaengerKandidaten.length < 2 ? 'default' : 'pointer',
              }}
            >
              {vorgaengerKandidaten.map(w => (
                <option key={w.id} value={w.id}>
                  {TYP_LABEL[w.typ]} V{w.version_nummer} · {w.szenen_count} Szenen{predWerk && w.id === predWerk.id ? ' (aktuellste)' : ''}
                </option>
              ))}
            </select>
            {istNichtNeueste && predWerk && gewaehlterPred && (
              <div style={{
                display: 'flex', gap: 8, alignItems: 'flex-start',
                background: '#FF950015', border: '1px solid #FF950040',
                borderRadius: 8, padding: '10px 12px', marginTop: 10, fontSize: 12,
              }}>
                <AlertTriangle size={14} style={{ color: '#FF9500', flexShrink: 0, marginTop: 1 }} />
                <span style={{ color: 'var(--text-primary)' }}>
                  Achtung: Sie erstellen aus <b>V{gewaehlterPred.version_nummer}</b>, die aktuellste Fassung ist <b>V{predWerk.version_nummer}</b>. Es entsteht ein paralleler Versions-Strang. Weitermachen?
                </span>
              </div>
            )}
          </div>
        )}

        {/* Options */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
            Szenen-Übernahme
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {options.map(opt => (
              <label
                key={opt.id}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
                  padding: '8px 10px', borderRadius: 8,
                  background: selectedOption === opt.id ? 'var(--bg-active)' : 'transparent',
                  border: `1px solid ${selectedOption === opt.id ? 'var(--border-active, var(--border))' : 'transparent'}`,
                  transition: '0.1s',
                }}
                onClick={() => setSelectedOption(opt.id)}
              >
                <input
                  type="radio"
                  name="copy-mode"
                  value={opt.id}
                  checked={selectedOption === opt.id}
                  onChange={() => setSelectedOption(opt.id)}
                  style={{ marginTop: 2, flexShrink: 0 }}
                />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{opt.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{opt.desc}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Checkboxes */}
        {effectivePred && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            {(hasNotizScenes || werkstufen.some(w => w.szenen_count > 0)) && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={kopiereNotizen}
                  onChange={e => setKopiereNotizen(e.target.checked)}
                />
                <span>Notizen aus Vorfassung übernehmen</span>
              </label>
            )}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
              <input
                type="checkbox"
                checked={dualview}
                onChange={e => setDualview(e.target.checked)}
              />
              <span>Dualview öffnen (alte Fassung links, neue rechts)</span>
            </label>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)',
              background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)',
              fontFamily: 'inherit',
            }}
          >
            Abbrechen
          </button>
          <button
            onClick={handleConfirm}
            style={{
              padding: '8px 20px', borderRadius: 8, border: 'none',
              background: 'var(--text-primary)', color: 'var(--bg-surface)',
              cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
            }}
          >
            {selectedOption === 'platzhalter' ? 'Anlegen + Platzhalter wählen' : 'Erstellen'}
          </button>
        </div>
      </div>
    </div>
  )
}
