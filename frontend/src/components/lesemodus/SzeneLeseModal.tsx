import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import DokumentVorschau from './DokumentVorschau'

export interface SzeneRef {
  scene_identity_id: string
  werkstufe_id: string
  scene_nummer: number | null
  scene_nummer_suffix: string | null
  folge_nummer: number | null
  ort_name: string | null
}

interface SzeneLeseModalProps {
  /** Trefferliste (Vorkommen der Entität) in Anzeige-Reihenfolge */
  szenen: SzeneRef[]
  startIndex: number
  /** Name der Rolle/Komparse/Motiv — für die Pfeil-Beschriftung */
  entitaetName: string
  onClose: () => void
}

const navBtn = (enabled: boolean): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 10px',
  border: '1px solid var(--border)', borderRadius: 7, background: 'transparent',
  color: enabled ? 'var(--text)' : 'var(--text-secondary)', fontSize: 12, fontWeight: 500,
  cursor: enabled ? 'pointer' : 'default', opacity: enabled ? 1 : 0.4, whiteSpace: 'nowrap',
})

/**
 * Liest-Modal für EINE Trefferliste: zeigt die Folge der aktuellen Szene als
 * druckgleiches A4-iframe (DokumentVorschau, mode='read') und scrollt zur
 * angeklickten Szene. Die Pfeile (oben) + ←/→ springen zum nächsten/vorherigen
 * Vorkommen der Entität — bei gleicher Fassung nur Scrollen (kein Reload).
 */
export default function SzeneLeseModal({ szenen, startIndex, entitaetName, onClose }: SzeneLeseModalProps) {
  const [index, setIndex] = useState(startIndex)
  const docRef = useRef<Document | null>(null)
  const loadedWerkRef = useRef<string | null>(null)

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

  const scrollToScene = useCallback((doc: Document, sid: string, smooth: boolean) => {
    const el = doc.querySelector(`[data-scene-identity-id="${sid}"]`)
    if (el) (el as HTMLElement).scrollIntoView({ block: 'start', behavior: smooth ? 'smooth' : 'auto' })
  }, [])

  // iframe geladen (neue Fassung) → doc merken + zur aktuellen Szene scrollen
  const onIframeReady = useCallback((doc: Document) => {
    docRef.current = doc
    loadedWerkRef.current = aktuell?.werkstufe_id ?? null
    if (aktuell) scrollToScene(doc, aktuell.scene_identity_id, false)
  }, [aktuell, scrollToScene])

  // Navigation innerhalb derselben Fassung (kein iframe-Reload) → selbst scrollen.
  // Bei Fassungswechsel ändert sich werkstufId → DokumentVorschau lädt neu → onIframeReady scrollt.
  useEffect(() => {
    if (!aktuell) return
    if (docRef.current && loadedWerkRef.current === aktuell.werkstufe_id) {
      scrollToScene(docRef.current, aktuell.scene_identity_id, true)
    }
  }, [index, aktuell, scrollToScene])

  if (!aktuell) return null
  const szLabel = `SZ ${aktuell.scene_nummer ?? '?'}${aktuell.scene_nummer_suffix ?? ''}`

  return createPortal(
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2vh 16px' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--bg-surface)', borderRadius: 12, width: 'min(900px, 96vw)', height: '96vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}
      >
        {/* Toolbar: Pfeile zum nächsten Vorkommen der Entität + X */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <button onClick={prev} disabled={!hasPrev} title="Vorheriges Vorkommen (←)" style={navBtn(hasPrev)}>
            <ChevronLeft size={14} /> Vorherige Szene von {entitaetName}
          </button>
          <button onClick={next} disabled={!hasNext} title="Nächstes Vorkommen (→)" style={navBtn(hasNext)}>
            Nächste Szene von {entitaetName} <ChevronRight size={14} />
          </button>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
            {szLabel} · Folge {aktuell.folge_nummer ?? '?'} · {index + 1}/{szenen.length}
          </span>
          <button onClick={onClose} title="Schließen (Esc)" style={{ ...navBtn(true), padding: 6, marginLeft: 4 }}>
            <X size={16} />
          </button>
        </div>

        {/* A4-Vorschau der Folge, gescrollt zur aktuellen Szene */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <DokumentVorschau werkstufId={aktuell.werkstufe_id} mode="read" onIframeReady={onIframeReady} />
        </div>
      </div>
    </div>,
    document.body,
  )
}
