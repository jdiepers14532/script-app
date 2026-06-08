import { useEffect, useState } from 'react'
import { api } from '../../api/client'

interface SceneReadViewProps {
  sceneIdentityId: string
  werkstufeId: string
  /** Höhe des iframes; default 100 % des Containers */
  height?: number | string
}

/**
 * Generische Lese-Ansicht EINER Szene: lädt das PDF-getreue Lese-HTML
 * (Szenenkopf + Content, identisch zum PDF-Export) und rendert es sandboxed
 * in einem iframe — so bleibt das Export-CSS vom App-CSS isoliert.
 *
 * Wiederverwendbar: Szenen-Lese-Modal (Rollen/Komparsen/Motive) und der
 * geplante Anmerkungs-Lesemodus nutzen dieselbe Komponente.
 */
export default function SceneReadView({ sceneIdentityId, werkstufeId, height = '100%' }: SceneReadViewProps) {
  const [html, setHtml] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(null); setHtml(null)
    api.getSzeneLeseHtml(sceneIdentityId, werkstufeId)
      .then(r => { if (!cancelled) setHtml(r.html) })
      .catch((e: any) => { if (!cancelled) setError(e?.data?.error || 'Szene konnte nicht geladen werden') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [sceneIdentityId, werkstufeId])

  if (loading) return <div style={{ padding: 24, color: 'var(--text-secondary)', fontSize: 13 }}>Lädt Szene…</div>
  if (error) return <div style={{ padding: 24, color: 'var(--danger, #FF3B30)', fontSize: 13 }}>{error}</div>
  if (!html) return null

  return (
    <iframe
      title="Szene"
      srcDoc={html}
      style={{ width: '100%', height, border: 'none', background: '#fff', display: 'block' }}
    />
  )
}
