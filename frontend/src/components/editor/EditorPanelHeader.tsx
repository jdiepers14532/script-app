import { useState } from 'react'
import { ChevronDown, Eye, Send, Plus, Lock, Users, Globe, Building } from 'lucide-react'
import { SICHTBARKEIT_COLORS } from './SichtbarkeitModal'
import SichtbarkeitModal from './SichtbarkeitModal'
import AbgabeModal from './AbgabeModal'
import type { DokumentMeta, FassungMeta } from '../../hooks/useDokument'
import Tooltip from '../Tooltip'

const SICHTBARKEIT_ICONS: Record<string, React.ReactNode> = {
  privat:     <Lock size={11} />,
  colab:      <Users size={11} />,
  review:     <Eye size={11} />,
  produktion: <Building size={11} />,
  alle:       <Globe size={11} />,
}

const BUILTIN_TYPEN = [
  { value: 'drehbuch', label: 'Drehbuch', editor_modus: 'screenplay' },
  { value: 'storyline', label: 'Storyline', editor_modus: 'richtext' },
  { value: 'notiz', label: 'Notiz', editor_modus: 'richtext' },
  { value: 'abstrakt', label: 'Abstrakt', editor_modus: 'richtext' },
]

interface Props {
  dokument: DokumentMeta | null
  allDokumente: DokumentMeta[]
  fassungen: FassungMeta[]
  selectedFassungId: string | null
  staffelId: string
  folgeNummer: number
  customTypen?: { name: string; editor_modus: string }[]
  onSelectDokument: (dokumentId: string) => void
  onSelectFassung: (fassungId: string) => void
  onCreateDokument: (typ: string) => void
  onCreateFassung: () => void
  onFassungUpdated: (fassung: any) => void
}

export default function EditorPanelHeader({
  dokument, allDokumente, fassungen, selectedFassungId,
  staffelId, folgeNummer,
  customTypen = [],
  onSelectDokument, onSelectFassung, onCreateDokument, onCreateFassung, onFassungUpdated,
}: Props) {
  const [showTypMenu, setShowTypMenu] = useState(false)
  const [showFassungMenu, setShowFassungMenu] = useState(false)
  const [showSichtbarkeit, setShowSichtbarkeit] = useState(false)
  const [showAbgabe, setShowAbgabe] = useState(false)

  const selectedFassung = fassungen.find(f => f.id === selectedFassungId) ?? null
  const alleTypen = [...BUILTIN_TYPEN, ...customTypen.map(t => ({ value: t.name, label: t.name, editor_modus: t.editor_modus }))]
  const existingTypen = allDokumente.map(d => d.typ)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', flexShrink: 0, flexWrap: 'wrap' }}>

      {/* Typ-Selector */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setShowTypMenu(v => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}
        >
          {dokument?.typ ?? 'Typ wählen'}
          <ChevronDown size={11} style={{ color: 'var(--text-muted)' }} />
        </button>
        {showTypMenu && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 98 }} onClick={() => setShowTypMenu(false)} />
            <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 99, marginTop: 4, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: 'var(--shadow-xl)', minWidth: 160, padding: '4px 0' }}>
              {alleTypen.map(t => {
                const exists = existingTypen.includes(t.value)
                const isActive = dokument?.typ === t.value
                return (
                  <button
                    key={t.value}
                    onClick={() => {
                      if (exists) {
                        const dok = allDokumente.find(d => d.typ === t.value)
                        if (dok) onSelectDokument(dok.id)
                      } else {
                        onCreateDokument(t.value)
                      }
                      setShowTypMenu(false)
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                      padding: '7px 12px', fontSize: 12, background: isActive ? 'var(--bg-active)' : 'transparent',
                      border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                      color: 'var(--text-primary)', fontWeight: isActive ? 600 : 400,
                    }}
                  >
                    {t.label}
                    {!exists && (
                      <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)' }}>Neu</span>
                    )}
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* Fassungs-Selector */}
      {dokument && (
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowFassungMenu(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, color: 'var(--text-secondary)' }}
          >
            {selectedFassung
              ? `F${selectedFassung.fassung_nummer}${selectedFassung.fassung_label ? ` · ${selectedFassung.fassung_label}` : ''}`
              : 'Fassung'
            }
            <ChevronDown size={11} style={{ color: 'var(--text-muted)' }} />
          </button>

          {showFassungMenu && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 98 }} onClick={() => setShowFassungMenu(false)} />
              <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 99, marginTop: 4, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: 'var(--shadow-xl)', minWidth: 220, padding: '4px 0' }}>
                {fassungen.map(f => (
                  <button
                    key={f.id}
                    onClick={() => { onSelectFassung(f.id); setShowFassungMenu(false) }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                      padding: '7px 12px', fontSize: 12,
                      background: f.id === selectedFassungId ? 'var(--bg-active)' : 'transparent',
                      border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>F{f.fassung_nummer}</span>
                    {f.fassung_label && <span style={{ color: 'var(--text-secondary)' }}>{f.fassung_label}</span>}
                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
                      {f.abgegeben && <span style={{ fontSize: 9, background: 'var(--bg-subtle)', padding: '1px 4px', borderRadius: 3, color: 'var(--text-muted)' }}>Abgegeben</span>}
                      <span style={{ color: SICHTBARKEIT_COLORS[f.sichtbarkeit] ?? '#ccc' }}>
                        {SICHTBARKEIT_ICONS[f.sichtbarkeit]}
                      </span>
                    </div>
                  </button>
                ))}
                <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                <button
                  onClick={() => { onCreateFassung(); setShowFassungMenu(false) }}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '7px 12px', fontSize: 12, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--sw-info)', fontFamily: 'inherit' }}
                >
                  <Plus size={11} /> Neue Fassung
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Sichtbarkeits-Badge */}
      {selectedFassung && (
        <Tooltip text={`Sichtbarkeit: ${selectedFassung.sichtbarkeit}${selectedFassung.abgegeben ? ' · Abgegeben' : ''}`}>
          <button
            onClick={() => setShowSichtbarkeit(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 4, padding: '3px 7px',
              border: `1px solid ${SICHTBARKEIT_COLORS[selectedFassung.sichtbarkeit] ?? '#ccc'}`,
              borderRadius: 999, background: 'transparent', cursor: 'pointer',
              color: SICHTBARKEIT_COLORS[selectedFassung.sichtbarkeit] ?? '#ccc',
              fontSize: 11, fontFamily: 'inherit', fontWeight: 500,
            }}
          >
            {SICHTBARKEIT_ICONS[selectedFassung.sichtbarkeit]}
            {selectedFassung.sichtbarkeit}
          </button>
        </Tooltip>
      )}

      <div style={{ flex: 1 }} />

      {/* Abgabe-Button — nur wenn aktiv & nicht abgegeben & rw-Zugriff */}
      {selectedFassung && !selectedFassung.abgegeben && selectedFassung._access === 'rw' && (
        <button
          onClick={() => setShowAbgabe(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', border: '1px solid var(--border)', borderRadius: 6, background: 'transparent', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit', color: 'var(--text-secondary)' }}
        >
          <Send size={11} /> Abgeben
        </button>
      )}

      {/* Modals */}
      {showSichtbarkeit && selectedFassung && dokument && (
        <SichtbarkeitModal
          dokumentId={dokument.id}
          fassungId={selectedFassung.id}
          staffelId={staffelId}
          currentSichtbarkeit={selectedFassung.sichtbarkeit}
          currentColabGruppeId={selectedFassung.colab_gruppe_id}
          abgegeben={selectedFassung.abgegeben}
          onDone={(updated) => { onFassungUpdated(updated); setShowSichtbarkeit(false) }}
          onClose={() => setShowSichtbarkeit(false)}
        />
      )}

      {showAbgabe && selectedFassung && dokument && (
        <AbgabeModal
          dokumentId={dokument.id}
          fassungId={selectedFassung.id}
          fassungNummer={selectedFassung.fassung_nummer}
          onDone={(result) => { onFassungUpdated(result.frozen); setShowAbgabe(false) }}
          onClose={() => setShowAbgabe(false)}
        />
      )}
    </div>
  )
}
