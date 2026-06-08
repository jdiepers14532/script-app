// SzenenQuellenModal — "Szenenweise Übernahme entscheiden" (Cherry-Pick beim Fassungs-Erstellen).
// Liste statt Matrix: je Szene ein Quell-Dropdown (Default = gewählte Vorfassung) + Varianten-
// Indikator (welche Fassungen identischen Inhalt haben → Buchstabe A/B/C). Diff-Filter blendet
// Szenen aus, die in allen Fassungen identisch sind. Liefert szenen_quellen an den Aufrufer.
import { useState, useEffect, useMemo } from 'react'
import { X, AlertTriangle } from 'lucide-react'
import type { WerkstufeMeta } from '../hooks/useDokument'

interface FassungInfo {
  werkstufe_id: string
  version_nummer: number
  label: string | null
  content_hash: string
}
interface DiffSzene {
  scene_identity_id: string
  scene_nummer: number | null
  scene_nummer_suffix: string | null
  ort_name: string | null
  fassungen: FassungInfo[]
}

const VARIANT_LETTERS = 'ABCDEFGHIJKLMNOP'

interface Props {
  folgeId: number
  typ: string
  werkstufen: WerkstufeMeta[]
  defaultVorgaengerId?: string   // gewählte Vorfassung aus dem Erstell-Dialog
  onConfirm: (szenen_quellen: Record<string, string>) => void
  onClose: () => void
}

export default function SzenenQuellenModal({
  folgeId, typ, defaultVorgaengerId, onConfirm, onClose,
}: Props) {
  const [szenen, setSzenen] = useState<DiffSzene[]>([])
  const [loading, setLoading] = useState(true)
  const [fehler, setFehler] = useState<string | null>(null)
  const [quellen, setQuellen] = useState<Record<string, string>>({})
  const [nurUnterschiede, setNurUnterschiede] = useState(true)

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  // Diff laden + Default-Quelle je Szene setzen (gewählte Vorfassung, sonst neueste vorhandene).
  useEffect(() => {
    let abbruch = false
    fetch(`/api/szenen-fassungs-diff?folge_id=${folgeId}&typ=${encodeURIComponent(typ)}`, { credentials: 'include', cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Diff konnte nicht geladen werden')))
      .then((d: { szenen: DiffSzene[] }) => {
        if (abbruch) return
        const liste = d.szenen ?? []
        const init: Record<string, string> = {}
        for (const sz of liste) {
          const imDefault = defaultVorgaengerId ? sz.fassungen.find(f => f.werkstufe_id === defaultVorgaengerId) : undefined
          init[sz.scene_identity_id] = imDefault?.werkstufe_id ?? sz.fassungen[0]?.werkstufe_id
        }
        setSzenen(liste)
        setQuellen(init)
        setLoading(false)
      })
      .catch(err => { if (!abbruch) { setFehler(String(err.message ?? err)); setLoading(false) } })
    return () => { abbruch = true }
  }, [folgeId, typ, defaultVorgaengerId])

  // Varianten je Szene: content_hash → Buchstabe (A=neueste Variante). Anzahl = unterschiedliche Inhalte.
  const variantenInfo = useMemo(() => {
    const map: Record<string, { count: number; letterOf: Record<string, string> }> = {}
    for (const sz of szenen) {
      const letterOf: Record<string, string> = {}
      let n = 0
      for (const f of sz.fassungen) {
        if (!(f.content_hash in letterOf)) letterOf[f.content_hash] = VARIANT_LETTERS[n++] ?? '?'
      }
      map[sz.scene_identity_id] = { count: n, letterOf }
    }
    return map
  }, [szenen])

  const sichtbar = useMemo(
    () => nurUnterschiede ? szenen.filter(sz => (variantenInfo[sz.scene_identity_id]?.count ?? 1) > 1) : szenen,
    [szenen, nurUnterschiede, variantenInfo]
  )
  const diffCount = useMemo(
    () => szenen.filter(sz => (variantenInfo[sz.scene_identity_id]?.count ?? 1) > 1).length,
    [szenen, variantenInfo]
  )

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: 'var(--bg-surface)', borderRadius: 12, width: '90%', maxWidth: 680, maxHeight: '86vh', display: 'flex', flexDirection: 'column', boxShadow: '0 12px 40px rgba(0,0,0,0.4)', border: '1px solid var(--border)' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 12px' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Szenenweise übernehmen</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              Pro Szene wählen, aus welcher Fassung sie kommt
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
            <X size={16} />
          </button>
        </div>

        {/* Filter */}
        <div style={{ padding: '0 24px 12px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid var(--border)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', paddingBottom: 12 }}>
            <input type="checkbox" checked={nurUnterschiede} onChange={e => setNurUnterschiede(e.target.checked)} />
            <span>Nur Szenen mit Unterschieden ({diffCount})</span>
          </label>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', paddingBottom: 12 }}>
            {szenen.length} Szenen gesamt
          </span>
        </div>

        {/* Liste */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 24px' }}>
          {loading && <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: 24 }}>Lädt…</div>}
          {fehler && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: '#FF3B30', fontSize: 13, padding: 16 }}>
              <AlertTriangle size={14} /> {fehler}
            </div>
          )}
          {!loading && !fehler && sichtbar.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: 24 }}>
              Keine Szenen mit Unterschieden zwischen den Fassungen.
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {sichtbar.map(sz => {
              const info = variantenInfo[sz.scene_identity_id]
              const gewaehlt = quellen[sz.scene_identity_id]
              return (
                <div key={sz.scene_identity_id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                  borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)',
                }}>
                  <div style={{ minWidth: 44, fontSize: 13, fontWeight: 600 }}>
                    {sz.scene_nummer != null ? `${sz.scene_nummer}${sz.scene_nummer_suffix ?? ''}` : '—'}
                  </div>
                  <div style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {sz.ort_name ?? '—'}
                  </div>
                  {info && info.count > 1 && (
                    <span title={`${info.count} unterschiedliche Inhalte über die Fassungen`}
                      style={{ fontSize: 10, fontWeight: 600, color: '#FF9500', background: '#FF950018', padding: '2px 7px', borderRadius: 999, whiteSpace: 'nowrap' }}>
                      {info.count} Varianten
                    </span>
                  )}
                  <select
                    value={gewaehlt ?? ''}
                    onChange={e => setQuellen(q => ({ ...q, [sz.scene_identity_id]: e.target.value }))}
                    style={{ fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontFamily: 'inherit', cursor: 'pointer', minWidth: 150 }}
                  >
                    {sz.fassungen.map(f => (
                      <option key={f.werkstufe_id} value={f.werkstufe_id}>
                        V{f.version_nummer}{f.label ? ` · ${f.label}` : ''}{info && info.count > 1 ? `  (${info.letterOf[f.content_hash]})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )
            })}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '14px 24px', borderTop: '1px solid var(--border)' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Gleiche Buchstaben = identischer Inhalt
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'inherit' }}>
              Abbrechen
            </button>
            <button
              onClick={() => onConfirm(quellen)}
              disabled={loading || !!fehler || szenen.length === 0}
              style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#000', color: '#fff', cursor: loading ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', opacity: loading || szenen.length === 0 ? 0.5 : 1 }}
            >
              Fassung erstellen
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
