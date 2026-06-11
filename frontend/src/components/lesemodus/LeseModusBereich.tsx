// LeseModusBereich — Lese-Modus-Container: Fassungs-Auswahl (nur sichtbare via fn_werkstufe_sichtbar)
// + LeseAnsicht (druckgleiche A4-Vorschau + Annotations-Layer). Andockpunkt in ScriptPage, wenn
// viewMode='read'. Hält die gewählte Lese-Fassung lokal (entkoppelt von der Editor-Werkstufe).
import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import LeseAnsicht from './LeseAnsicht'

interface Props {
  folgeId: number
  initialWerkId?: string | null
  canEdit?: boolean
  activeSceneIdentityId?: string | null
  onSceneVisible?: (sceneIdentityId: string) => void
}

export default function LeseModusBereich({ folgeId, initialWerkId, canEdit = true, activeSceneIdentityId, onSceneVisible }: Props) {
  const [werkstufen, setWerkstufen] = useState<any[]>([])
  const [werkId, setWerkId] = useState<string | null>(initialWerkId ?? null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(null)
    api.getLesemodusWerkstufen(folgeId)
      .then(d => {
        if (cancelled) return
        const list = d.werkstufen ?? []
        setWerkstufen(list)
        // Editor-Fassung beibehalten, falls sichtbar — sonst Default-Auswahl.
        setWerkId(prev => {
          if (prev && list.some((w: any) => String(w.id) === String(prev))) return prev
          return d.default_werkstuf_id ?? (list[0]?.id ?? null)
        })
        setLoading(false)
      })
      .catch(e => { if (!cancelled) { setError(String(e?.message ?? e)); setLoading(false) } })
    return () => { cancelled = true }
  }, [folgeId])

  const TYP_LABEL: Record<string, string> = { drehbuch: 'Drehbuch', storyline: 'Storyline', notiz: 'Dokument' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Fassung lesen:</span>
        <select
          value={werkId ?? ''}
          onChange={e => setWerkId(e.target.value || null)}
          disabled={loading || werkstufen.length === 0}
          style={{ fontSize: 13, padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontFamily: 'inherit', cursor: 'pointer' }}
        >
          {werkstufen.map(w => (
            <option key={w.id} value={w.id}>
              {TYP_LABEL[w.typ] ?? w.typ} V{w.version_nummer}{w.label ? ` · ${w.label}` : ''}
            </option>
          ))}
        </select>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {loading && <div style={{ padding: 24, fontSize: 13, color: 'var(--text-secondary)' }}>Lädt Fassungen…</div>}
        {error && <div style={{ padding: 24, fontSize: 13, color: 'var(--danger,#FF3B30)' }}>{error}</div>}
        {!loading && !error && !werkId && <div style={{ padding: 24, fontSize: 13, color: 'var(--text-secondary)' }}>Keine lesbare Fassung in dieser Folge.</div>}
        {!loading && !error && werkId && (
          <LeseAnsicht
            key={werkId}
            werkstufId={werkId}
            canEdit={canEdit}
            activeSceneIdentityId={activeSceneIdentityId}
            onSceneVisible={onSceneVisible}
          />
        )}
      </div>
    </div>
  )
}
