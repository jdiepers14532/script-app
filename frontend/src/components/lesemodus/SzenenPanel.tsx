import { useState, useEffect, useMemo } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { api } from '../../api/client'
import SzeneLeseModal, { type SzeneRef } from './SzeneLeseModal'

interface SzeneRow extends SzeneRef {
  werkstufe_typ: string
  int_ext: string | null
  tageszeit: string | null
}

interface SzenenPanelProps {
  produktionId: string
  typ: 'rolle' | 'komparse' | 'motiv'
  /** character_id (Rolle/Komparse) oder motiv_id (Motiv) */
  entityId?: string
  /** Name der Entität — für ort_name-Fallback (Motiv) und Modal-Navigation */
  entitaetName?: string
  /** Motiv-Name als ort_name-Fallback (nur Motiv) — falls abweichend von entitaetName */
  motivName?: string
  /** Motiv-Badges (I/A + T/N) anzeigen */
  showBadges?: boolean
}

// ── Kürzel ────────────────────────────────────────────────────────────────────
const ieKuerzel = (ie: string | null): string =>
  ie === 'EXT' ? 'A' : ie === 'INT/EXT' ? 'I/A' : ie === 'INT' ? 'I' : ''

const tzKuerzel = (tz: string | null): string => {
  if (!tz) return ''
  const t = tz.toUpperCase()
  if (t.startsWith('TAG')) return 'T'
  if (t.startsWith('NACHT')) return 'N'
  if (t.startsWith('ABEND')) return 'A'
  if (t.startsWith('DÄMM') || t.startsWith('DAEMM')) return 'D'
  if (t.startsWith('MORGEN')) return 'M'
  return t[0] ?? ''
}

export default function SzenenPanel({ produktionId, typ, entityId, entitaetName, motivName, showBadges }: SzenenPanelProps) {
  const [open, setOpen] = useState(true)
  const [szenen, setSzenen] = useState<SzeneRow[]>([])
  const [bloecke, setBloecke] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [modalIndex, setModalIndex] = useState<number | null>(null)

  useEffect(() => {
    if (!produktionId || (!entityId && !motivName)) { setSzenen([]); return }
    let cancelled = false
    setLoading(true)
    Promise.all([
      api.getEntitaetSzenen(produktionId, typ, { entityId, motivName }),
      api.getBloecke(produktionId).catch(() => []),
    ]).then(([res, bl]) => {
      if (cancelled) return
      setSzenen((res?.szenen as SzeneRow[]) || [])
      setBloecke(Array.isArray(bl) ? bl : [])
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [produktionId, typ, entityId, motivName])

  // Block → Folge gruppieren
  const gruppen = useMemo(() => {
    const findBlock = (fn: number | null) =>
      fn == null ? null : bloecke.find(b => fn >= b.folge_von && fn <= b.folge_bis) || null
    const blockMap = new Map<string, { label: string; sort: number; folgen: Map<number, SzeneRow[]> }>()
    for (const s of szenen) {
      const b = findBlock(s.folge_nummer)
      const key = b ? `b${b.block_nummer}` : 'none'
      if (!blockMap.has(key)) {
        blockMap.set(key, { label: b ? `Block ${b.block_nummer}` : 'Ohne Block', sort: b ? b.block_nummer : 99999, folgen: new Map() })
      }
      const grp = blockMap.get(key)!
      const fn = s.folge_nummer ?? 0
      if (!grp.folgen.has(fn)) grp.folgen.set(fn, [])
      grp.folgen.get(fn)!.push(s)
    }
    return [...blockMap.entries()]
      .sort((a, b) => a[1].sort - b[1].sort)
      .map(([key, v]) => ({
        key, label: v.label,
        folgen: [...v.folgen.entries()].sort((a, b) => a[0] - b[0]).map(([fn, rows]) => ({ folgeNummer: fn, szenen: rows })),
      }))
  }, [szenen, bloecke])

  // Flache Trefferliste in Anzeige-Reihenfolge — für die Modal-Navigation
  const flat = useMemo(() => gruppen.flatMap(g => g.folgen.flatMap(f => f.szenen)), [gruppen])

  const isCollapsed = (k: string) => collapsed.has(k)
  const toggle = (k: string) => setCollapsed(prev => {
    const n = new Set(prev)
    n.has(k) ? n.delete(k) : n.add(k)
    return n
  })

  const openSzene = (s: SzeneRow) => {
    const idx = flat.findIndex(x => x.scene_identity_id === s.scene_identity_id && x.werkstufe_id === s.werkstufe_id)
    if (idx >= 0) setModalIndex(idx)
  }

  const anzahl = szenen.length

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: '100%', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-subtle)', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}
      >
        <span>Szenen{anzahl > 0 ? ` (${anzahl})` : ''}</span>
        <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)' }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {loading && <div style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '4px 4px' }}>Lädt…</div>}
          {!loading && szenen.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '4px 4px' }}>Kommt in keiner Szene vor.</div>
          )}

          {!loading && gruppen.map(block => {
            const blockKey = `B:${block.key}`
            const blockCollapsed = isCollapsed(blockKey)
            return (
              <div key={block.key}>
                {/* Block-Kopf */}
                <button
                  onClick={() => toggle(blockKey)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 4, padding: '5px 4px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--text)' }}
                >
                  {blockCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                  {block.label}
                  <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>
                    ({block.folgen.reduce((n, f) => n + f.szenen.length, 0)})
                  </span>
                </button>

                {!blockCollapsed && block.folgen.map(folge => {
                  const folgeKey = `F:${block.key}:${folge.folgeNummer}`
                  const folgeCollapsed = isCollapsed(folgeKey)
                  return (
                    <div key={folgeKey} style={{ marginLeft: 14 }}>
                      {/* Folge-Kopf */}
                      <button
                        onClick={() => toggle(folgeKey)}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 4, padding: '4px 4px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)' }}
                      >
                        {folgeCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                        Folge {folge.folgeNummer}
                        <span style={{ opacity: 0.7 }}>({folge.szenen.length})</span>
                      </button>

                      {!folgeCollapsed && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '2px 0 6px 18px' }}>
                          {folge.szenen.map(s => {
                            const badge = showBadges
                              ? [ieKuerzel(s.int_ext), tzKuerzel(s.tageszeit)].filter(Boolean).join('/')
                              : ''
                            return (
                              <button
                                key={`${s.scene_identity_id}:${s.werkstufe_id}`}
                                onClick={() => openSzene(s)}
                                title={s.ort_name || undefined}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--info, #007AFF)', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}
                              >
                                SZ {s.scene_nummer ?? '?'}{s.scene_nummer_suffix ?? ''}
                                {badge && (
                                  <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontWeight: 400 }}>{badge}</span>
                                )}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}

      {modalIndex !== null && (
        <SzeneLeseModal
          szenen={flat}
          startIndex={modalIndex}
          entitaetName={entitaetName ?? motivName ?? ''}
          onClose={() => setModalIndex(null)}
        />
      )}
    </div>
  )
}
