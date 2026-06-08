import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import SceneReadView from './SceneReadView'

export interface SzeneRef {
  scene_identity_id: string
  werkstufe_id: string
  scene_nummer: number | null
  scene_nummer_suffix: string | null
  folge_nummer: number | null
  ort_name: string | null
}

interface SzeneLeseModalProps {
  /** Trefferliste in Anzeige-Reihenfolge — Vor/Zurück blättert hier durch */
  szenen: SzeneRef[]
  startIndex: number
  produktionId: string
  /** Name der Rolle/Komparse/Motiv — für die Navigations-Beschriftung */
  entitaetName: string
  onClose: () => void
}

const navLink = (enabled: boolean): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 10px',
  border: '1px solid var(--border)', borderRadius: 7, background: 'transparent',
  color: enabled ? 'var(--text)' : 'var(--text-secondary)', fontSize: 12, fontWeight: 500,
  cursor: enabled ? 'pointer' : 'default', opacity: enabled ? 1 : 0.4, whiteSpace: 'nowrap',
})

export default function SzeneLeseModal({ szenen, startIndex, produktionId, entitaetName, onClose }: SzeneLeseModalProps) {
  const [index, setIndex] = useState(startIndex)
  const aktuell = szenen[index]
  const hasPrev = index > 0
  const hasNext = index < szenen.length - 1

  const prev = useCallback(() => setIndex(i => (i > 0 ? i - 1 : i)), [])
  const next = useCallback(() => setIndex(i => (i < szenen.length - 1 ? i + 1 : i)), [szenen.length])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') prev()
      else if (e.key === 'ArrowRight') next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, prev, next])

  if (!aktuell) return null
  const szLabel = `SZ ${aktuell.scene_nummer ?? '?'}${aktuell.scene_nummer_suffix ?? ''}`

  const PrevLink = ({ label }: { label: string }) => (
    <button onClick={prev} disabled={!hasPrev} title="Vorherige Szene (←)" style={navLink(hasPrev)}>
      <ChevronLeft size={14} /> {label}
    </button>
  )
  const NextLink = ({ label }: { label: string }) => (
    <button onClick={next} disabled={!hasNext} title="Nächste Szene (→)" style={navLink(hasNext)}>
      {label} <ChevronRight size={14} />
    </button>
  )

  return createPortal(
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2vh 16px' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--bg)', borderRadius: 12, width: 'min(900px, 96vw)', height: '96vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}
      >
        {/* Toolbar oben: Pfeile mit Entitätsname + Zähler + X */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <PrevLink label={`Vorherige Szene von ${entitaetName}`} />
          <NextLink label={`Nächste Szene von ${entitaetName}`} />
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
            {szLabel} · Folge {aktuell.folge_nummer ?? '?'} · {index + 1}/{szenen.length}
          </span>
          <button onClick={onClose} title="Schließen (Esc)" style={{ ...navLink(true), padding: 6, marginLeft: 4 }}>
            <X size={16} />
          </button>
        </div>

        {/* Blatt + Navigation am Blattende */}
        <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-subtle)' }}>
          <SceneReadView
            sceneIdentityId={aktuell.scene_identity_id}
            werkstufeId={aktuell.werkstufe_id}
            produktionId={produktionId}
            folgeNummer={aktuell.folge_nummer}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '12px 24px 28px', maxWidth: 794 + 48, margin: '0 auto' }}>
            <PrevLink label="Vorherige Szene" />
            <NextLink label="Nächste Szene" />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
