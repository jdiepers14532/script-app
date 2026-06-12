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
  // Redline-Vergleich: gewählte Original-Fassung (null = kein Vergleich)
  const [compareId, setCompareId] = useState<string | null>(null)
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
  const wsLabel = (w: any) => w.ist_revisionsstufe
    ? `Rev. ${w.revisionsstufen_nr}${w.label ? ` · ${w.label}` : ''}`
    : `${TYP_LABEL[w.typ] ?? w.typ} V${w.version_nummer}${w.label ? ` · ${w.label}` : ''}`
  // Vergleichskandidaten: alle anderen sichtbaren Fassungen der Folge
  const vergleichKandidaten = werkstufen.filter(w => String(w.id) !== String(werkId ?? ''))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Fassung lesen:</span>
        <select
          value={werkId ?? ''}
          onChange={e => {
            const v = e.target.value || null
            setWerkId(v)
            // Vergleich zurücksetzen, wenn die neue Lese-Fassung die Vergleichsfassung ist
            if (v && compareId && String(v) === String(compareId)) setCompareId(null)
          }}
          disabled={loading || werkstufen.length === 0}
          style={{ fontSize: 13, padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontFamily: 'inherit', cursor: 'pointer' }}
        >
          {werkstufen.map(w => (
            <option key={w.id} value={w.id}>{wsLabel(w)}</option>
          ))}
        </select>

        {vergleichKandidaten.length > 0 && (
          <>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Vergleichen mit:</span>
            <select
              value={compareId ?? ''}
              onChange={e => setCompareId(e.target.value || null)}
              disabled={loading}
              style={{ fontSize: 13, padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: compareId ? 'var(--text-primary)' : 'var(--text-muted)', fontFamily: 'inherit', cursor: 'pointer' }}
            >
              <option value="">— kein Vergleich —</option>
              {vergleichKandidaten.map(w => (
                <option key={w.id} value={w.id}>{wsLabel(w)}</option>
              ))}
            </select>
          </>
        )}

        {compareId && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
            <mark style={{ background: 'rgba(0,200,83,0.32)', borderRadius: 2, padding: '0 4px', color: '#005c00' }}>eingefügt</mark>
            <del style={{ background: 'rgba(255,59,48,0.18)', borderRadius: 2, padding: '0 4px', color: '#bb2200' }}>gestrichen</del>
            <button
              onClick={() => setCompareId(null)}
              style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Vergleich beenden
            </button>
          </div>
        )}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {loading && <div style={{ padding: 24, fontSize: 13, color: 'var(--text-secondary)' }}>Lädt Fassungen…</div>}
        {error && <div style={{ padding: 24, fontSize: 13, color: 'var(--danger,#FF3B30)' }}>{error}</div>}
        {!loading && !error && !werkId && <div style={{ padding: 24, fontSize: 13, color: 'var(--text-secondary)' }}>Keine lesbare Fassung in dieser Folge.</div>}
        {!loading && !error && werkId && (
          <LeseAnsicht
            key={werkId}
            werkstufId={werkId}
            compareWerkstufId={compareId}
            canEdit={canEdit}
            activeSceneIdentityId={activeSceneIdentityId}
            onSceneVisible={onSceneVisible}
          />
        )}
      </div>
    </div>
  )
}
