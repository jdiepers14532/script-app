// DokumentVorschau — reine, wiederverwendbare A4-Vorschau EINER Werkstufe.
// Holt das druckgleiche Komplett-HTML aus der Export-Pipeline (GET /api/export/preview) und
// rendert es isoliert per iframe srcdoc (eigenes @page-/Font-CSS, kein X-Frame-Problem, da srcdoc
// same-origin → contentDocument zugreifbar). KEINE Anmerkungs-Abhängigkeit — das ist das überall
// einbettbare Stück (Szenenkopf + Body, druckgleich). Der Anmerkungs-Layer (LeseAnsicht) dockt
// über onIframeReady am contentDocument an; das HTML trägt data-scene-identity-id / data-block-index.
import { useEffect, useRef, useState, useCallback } from 'react'
import { api } from '../../api/client'

export interface DokumentVorschauProps {
  werkstufId: string
  /** 'read' = Lese-Layout (A4-Blatt, KZ/FZ weg) — Default; undefined = klassische PDF-Vorschau. */
  mode?: 'read'
  /** Wird nach jedem iframe-Load mit dem isolierten Dokument aufgerufen (Annotations-Layer-Andockung). */
  onIframeReady?: (doc: Document, win: Window, iframe: HTMLIFrameElement) => void
  height?: string | number
}

export default function DokumentVorschau({ werkstufId, mode = 'read', onIframeReady, height = '100%' }: DokumentVorschauProps) {
  const [html, setHtml] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(null); setHtml(null)
    api.getExportPreviewHtml(werkstufId, mode)
      .then(h => { if (!cancelled) { setHtml(h); setLoading(false) } })
      .catch(e => { if (!cancelled) { setError(String(e?.message ?? e)); setLoading(false) } })
    return () => { cancelled = true }
  }, [werkstufId, mode])

  const handleLoad = useCallback(() => {
    const ifr = iframeRef.current
    if (ifr?.contentDocument && ifr.contentWindow) {
      onIframeReady?.(ifr.contentDocument, ifr.contentWindow, ifr)
    }
  }, [onIframeReady])

  return (
    <div style={{ height, width: '100%', overflow: 'hidden', background: 'var(--bg-subtle)', position: 'relative' }}>
      {loading && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>
          Lädt Vorschau…
        </div>
      )}
      {error && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'var(--danger, #FF3B30)', padding: 24, textAlign: 'center' }}>
          {error}
        </div>
      )}
      {html && (
        <iframe
          ref={iframeRef}
          srcDoc={html}
          onLoad={handleLoad}
          title="Dokument-Vorschau"
          style={{ width: '100%', height: '100%', border: 'none', background: '#fff', display: 'block' }}
        />
      )}
    </div>
  )
}
