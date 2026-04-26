import { useState, useEffect, useRef, useCallback, useContext } from 'react'
import { Lock, ChevronLeft, ChevronRight, FileDown, MessageSquare, GitCompare, Info } from 'lucide-react'
import Tooltip from './Tooltip'
import { ENV_COLORS } from '../data/scenes'
import { api } from '../api/client'
import { PanelModeContext, useAppSettings } from '../App'

interface SceneEditorProps {
  szeneId: number
  stageId: number | null
  staffelId?: string | null
  folgeNummer?: number | null
  panelMode?: 'both' | 'treatment' | 'script'
  onSzeneUpdated?: (updated: any) => void
}

// Map tageszeit/int_ext to env key for colors
function getEnvKey(scene: any): keyof typeof ENV_COLORS {
  const ie = (scene.int_ext ?? '').toLowerCase()
  const tz = (scene.tageszeit ?? 'TAG').toUpperCase()
  if (tz === 'NACHT') {
    if (ie === 'int') return 'n_i'
    if (ie === 'ext') return 'n_e'
    return 'n_ie'
  }
  if (tz === 'ABEND') return 'evening_i'
  if (ie === 'int') return 'd_i'
  if (ie === 'ext') return 'd_e'
  return 'd_ie'
}

export default function SceneEditor({ szeneId, stageId, staffelId, folgeNummer, panelMode: panelModeProp, onSzeneUpdated }: SceneEditorProps) {
  const { panelMode: panelModeCtx } = useContext(PanelModeContext)
  const panelMode = panelModeProp ?? panelModeCtx
  const { treatmentLabel } = useAppSettings()
  const [scene, setScene] = useState<any | null>(null)
  const [lock, setLock] = useState<any | null>(null)
  const [kommentareCount, setKommentareCount] = useState<number>(0)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showRevisions, setShowRevisions] = useState(false)
  const [changedBlocks, setChangedBlocks] = useState<Set<number>>(new Set())
  const [revisionColor, setRevisionColor] = useState<string | null>(null)
  const [splitRatio, setSplitRatio] = useState(0.5)
  const [vorstoppDrehbuch, setVorstoppDrehbuch] = useState<{ dauer_sekunden: number } | null>(null)
  const [sceneChars, setSceneChars] = useState<any[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const panelsRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)

  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    draggingRef.current = true
    const onMouseMove = (ev: MouseEvent) => {
      if (!draggingRef.current || !panelsRef.current) return
      const rect = panelsRef.current.getBoundingClientRect()
      const ratio = (ev.clientX - rect.left) / rect.width
      setSplitRatio(Math.max(0.2, Math.min(0.8, ratio)))
    }
    const onMouseUp = () => {
      draggingRef.current = false
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [])

  // Load scene when szeneId changes
  useEffect(() => {
    setLoading(true)
    setError(null)
    api.getSzene(szeneId)
      .then(data => {
        setScene(data)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))

    // Load kommentare count
    api.getKommentare(szeneId)
      .then(list => setKommentareCount(Array.isArray(list) ? list.length : 0))
      .catch(() => setKommentareCount(0))

    // Load revision deltas for this scene
    api.getSzeneRevisionen(szeneId, stageId ?? undefined)
      .then(deltas => {
        const changed = new Set<number>()
        deltas.forEach((d: any) => {
          if (d.field_type === 'content_block' && d.block_index != null) {
            changed.add(d.block_index)
          }
        })
        setChangedBlocks(changed)
        // Get revision color from first delta that has one
        const colorDelta = deltas.find((d: any) => d.revision_color)
        setRevisionColor(colorDelta?.revision_color ?? null)
      })
      .catch(() => { setChangedBlocks(new Set()); setRevisionColor(null) })

    // Load vorstopp (drehbuch stage)
    setVorstoppDrehbuch(null)
    api.getVorstopp(szeneId)
      .then(data => setVorstoppDrehbuch(data?.latest_per_stage?.drehbuch ?? null))
      .catch(() => setVorstoppDrehbuch(null))

    // Load scene characters
    setSceneChars([])
    api.getSceneCharacters(szeneId)
      .then(data => setSceneChars(Array.isArray(data) ? data : []))
      .catch(() => setSceneChars([]))
  }, [szeneId, stageId])

  // Load lock when folge changes
  useEffect(() => {
    if (!staffelId || folgeNummer == null) { setLock(null); return }
    api.getLock(staffelId, folgeNummer)
      .then(setLock)
      .catch(() => setLock(null))
  }, [staffelId, folgeNummer])

  const handleContentChange = useCallback((content: any[]) => {
    if (!scene) return
    const updated = { ...scene, content }
    setScene(updated)
    onSzeneUpdated?.(updated)

    // Debounced auto-save
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setSaving(true)
      setSaveMsg(null)
      try {
        const saved = await api.updateSzene(szeneId, { content })
        setScene(saved)
        onSzeneUpdated?.(saved)
        // Create auto-save version
        await api.createVersion(szeneId, {
          content_snapshot: content,
          change_summary: 'Auto-save',
        }).catch(() => {})
        setSaveMsg('Gespeichert')
      } catch {
        setSaveMsg('Fehler beim Speichern')
      } finally {
        setSaving(false)
        setTimeout(() => setSaveMsg(null), 2000)
      }
    }, 3000)
  }, [scene, szeneId, onSzeneUpdated])

  const handleRequestLock = async () => {
    if (!staffelId || folgeNummer == null) return
    try {
      const newLock = await api.createLock(staffelId, folgeNummer)
      setLock(newLock)
    } catch (e: any) {
      alert('Lock konnte nicht angefordert werden: ' + e.message)
    }
  }

  if (loading) {
    return (
      <div className="detail" style={{ padding: 32, color: 'var(--text-secondary)', fontSize: 13, textAlign: 'center' }}>
        Lädt Szene…
      </div>
    )
  }

  if (error || !scene) {
    return (
      <div className="detail" style={{ padding: 32, color: 'var(--sw-danger)', fontSize: 13 }}>
        {error ?? 'Szene nicht gefunden'}
      </div>
    )
  }

  const envKey = getEnvKey(scene)
  const envColor = ENV_COLORS[envKey]
  const stripeColor = envColor.stripe
  const panelsClass = panelMode === 'script' ? 'panels mode-script'
    : panelMode === 'treatment' ? 'panels mode-treatment'
    : 'panels'
  const isBothMode = panelMode !== 'script' && panelMode !== 'treatment'

  const contentTextelemente: any[] = Array.isArray(scene.content) ? scene.content : []
  const sceneIsLocked = !!lock
  const lockIsOwn = lock && (lock.user_id === 'test-user' || lock.user_name === 'Ich')

  return (
    <div className="detail">
      {/* Sticky head */}
      <div className="detail-head">
        <div className="scene-title-bar">
          <button className="nav-arrow" title="Vorherige Szene" disabled>
            <ChevronLeft size={13} />
          </button>
          <button className="nav-arrow" title="Nächste Szene" disabled>
            <ChevronRight size={13} />
          </button>
          <span className="scene-big">SZ {scene.scene_nummer}</span>
          <span className="scene-title">{scene.ort_name}</span>
          <span className="spacer" />
          {saving && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Speichert…</span>}
          {saveMsg && !saving && <span style={{ fontSize: 11, color: saveMsg === 'Gespeichert' ? 'var(--sw-green)' : 'var(--sw-danger)' }}>{saveMsg}</span>}
          {kommentareCount > 0 && (
            <button className="btn ghost" title="Kommentare">
              <MessageSquare size={12} />
              {kommentareCount}
            </button>
          )}
          {sceneIsLocked ? (
            <button className="btn lock held">
              <Lock size={12} />
              Gelockt
            </button>
          ) : (
            <button className="btn ghost" onClick={handleRequestLock} title="Lock anfordern">
              <Lock size={12} />
              Locken
            </button>
          )}
          <button className="btn ghost" onClick={() => stageId && api.exportPdf(stageId).then(r => r.blob()).then(b => {
            const url = URL.createObjectURL(b)
            window.open(url, '_blank')
          })}>
            <FileDown size={12} />
            PDF
          </button>
        </div>
      </div>

      {/* Meta card — 4 Zeilen */}
      <div className="meta-card" key={szeneId} style={{ '--stripe': stripeColor } as React.CSSProperties}>

        {/* Z1: Sz-Nr | Int/Ext | Motiv | Vorstoppzeit | Stimmung */}
        <div className="metarow">
          <div className="cell">
            <span className="lbl">Sz.-Nr.</span>
            <span className="val">{scene.scene_nummer}</span>
          </div>
          <div className="cell">
            <span className="lbl">Int/Ext</span>
            <span className="val">{scene.int_ext}</span>
          </div>
          <div className="cell" style={{ flex: 2 }}>
            <span className="lbl">Motiv</span>
            <span className="val">{scene.ort_name}</span>
          </div>
          {vorstoppDrehbuch && (
            <div className="cell">
              <span className="lbl">Vorstoppzeit</span>
              <span className="val">{Math.floor(vorstoppDrehbuch.dauer_sekunden / 60)} min</span>
            </div>
          )}
          <div className="cell">
            <span className="lbl">Stimmung</span>
            <input
              className="meta-input"
              defaultValue={scene.stimmung ?? ''}
              placeholder="—"
              onBlur={e => {
                const val = e.target.value.trim() || null
                if (val !== (scene.stimmung ?? null)) {
                  api.updateSzene(szeneId, { stimmung: val }).then(s => { setScene(s); onSzeneUpdated?.(s) }).catch(() => {})
                }
              }}
            />
          </div>
        </div>

        {/* Z2: Spieltag | Spielzeit | Oneliner | Seiten */}
        <div className="metarow">
          <div className="cell">
            <span className="lbl">Spieltag</span>
            <input
              className="meta-input"
              type="number"
              defaultValue={scene.spieltag ?? ''}
              placeholder="—"
              onBlur={e => {
                const val = e.target.value !== '' ? parseInt(e.target.value, 10) : null
                if (val !== (scene.spieltag ?? null)) {
                  api.updateSzene(szeneId, { spieltag: val }).then(s => { setScene(s); onSzeneUpdated?.(s) }).catch(() => {})
                }
              }}
            />
          </div>
          <div className="cell">
            <span className="lbl" style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              Spielzeit
              <Tooltip text="Spielzeit ist die wahrscheinliche Uhrzeit zu der die Handlung dieser Szene spielt.">
                <Info size={10} style={{ color: 'var(--text-muted)' }} />
              </Tooltip>
            </span>
            <input
              className="meta-input"
              defaultValue={scene.spielzeit ?? ''}
              placeholder="z.B. 08:30"
              onBlur={e => {
                const val = e.target.value.trim() || null
                if (val !== (scene.spielzeit ?? null)) {
                  api.updateSzene(szeneId, { spielzeit: val }).then(s => { setScene(s); onSzeneUpdated?.(s) }).catch(() => {})
                }
              }}
            />
          </div>
          <div className="cell" style={{ flex: 3 }}>
            <span className="lbl">Oneliner</span>
            <input
              className="meta-input"
              defaultValue={scene.zusammenfassung ?? ''}
              placeholder="—"
              onBlur={e => {
                const val = e.target.value.trim() || null
                if (val !== (scene.zusammenfassung ?? null)) {
                  api.updateSzene(szeneId, { zusammenfassung: val }).then(s => { setScene(s); onSzeneUpdated?.(s) }).catch(() => {})
                }
              }}
            />
          </div>
          <div className="cell">
            <span className="lbl">Seiten</span>
            <input
              className="meta-input"
              defaultValue={scene.seiten ?? ''}
              placeholder="z.B. 2 5/8"
              onBlur={e => {
                const val = e.target.value.trim() || null
                if (val !== (scene.seiten ?? null)) {
                  api.updateSzene(szeneId, { seiten: val }).then(s => { setScene(s); onSzeneUpdated?.(s) }).catch(() => {})
                }
              }}
            />
          </div>
        </div>

        {/* Z3: Rollen | Komparsen */}
        <div className="metarow">
          <div className="cell" style={{ flex: 1 }}>
            <span className="lbl">Rollen</span>
            <span className="val" style={{ fontWeight: 400, fontSize: 12 }}>
              {sceneChars.filter((c: any) => c.kategorie_typ === 'rolle').map((c: any) => c.name).join(', ') || '—'}
            </span>
          </div>
          <div className="cell" style={{ flex: 1 }}>
            <span className="lbl">Komparsen</span>
            <span className="val" style={{ fontWeight: 400, fontSize: 12 }}>
              {sceneChars.filter((c: any) => c.kategorie_typ === 'komparse').map((c: any) => c.name).join(', ') || '—'}
            </span>
          </div>
        </div>

        {/* Z4: Storyline */}
        <div className="desc-row">
          <div className="lbl">Storyline</div>
          <textarea
            className="meta-input"
            defaultValue={scene.storyline ?? ''}
            placeholder="—"
            rows={2}
            style={{ resize: 'vertical', width: '100%', fontFamily: 'inherit' }}
            onBlur={e => {
              const val = e.target.value.trim() || null
              if (val !== (scene.storyline ?? null)) {
                api.updateSzene(szeneId, { storyline: val }).then(s => { setScene(s); onSzeneUpdated?.(s) }).catch(() => {})
              }
            }}
          />
        </div>
      </div>

      {/* Lock banner */}
      {sceneIsLocked && (
        <div className={`lock-banner${lockIsOwn ? ' mine' : ''}`}>
          <div className="lb-avatar">{lock.user_id?.slice(0, 2).toUpperCase() ?? 'LK'}</div>
          <div>
            <div className="lb-title">Gelockt von {lock.user_name || lock.user_id}</div>
            <div className="lb-sub">{lock.lock_type === 'contract' ? 'Contract-Lock' : 'Exklusiv-Lock'}</div>
          </div>
          <span className="lb-spacer" />
          {lockIsOwn ? (
            <span className="chip-ok">Mein Lock</span>
          ) : (
            <button className="btn ghost" onClick={handleRequestLock} title="Lock übernehmen">Übernehmen</button>
          )}
        </div>
      )}

      {/* Panels */}
      <div
        className={panelsClass}
        ref={panelsRef}
        style={isBothMode ? { gridTemplateColumns: `${splitRatio}fr 12px ${1 - splitRatio}fr`, gap: 0 } : undefined}
      >
        {panelMode !== 'script' && (
          <div className="panel">
            <div className="phead">
              <span className="title">{treatmentLabel}</span>
              <span className="vchip draft">Entwurf</span>
              <span className="spacer" />
            </div>
            <div className="pbody">
              <div className="treatment-body">
                {scene.zusammenfassung ? (
                  <p>{scene.zusammenfassung}</p>
                ) : (
                  <p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Noch kein {treatmentLabel} vorhanden.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {isBothMode && (
          <div
            className="panel-divider"
            onMouseDown={handleDividerMouseDown}
            onDoubleClick={() => setSplitRatio(0.5)}
            title="Ziehen zum Verschieben · Doppelklick zum Zurücksetzen"
          />
        )}

        {panelMode !== 'treatment' && (
          <div className="panel">
            <div className="phead">
              <span className="title">Drehbuch</span>
              {revisionColor && showRevisions ? (
                <span className="vchip" style={{ background: revisionColor + '33', color: revisionColor, borderColor: revisionColor + '66' }}>
                  Revision
                </span>
              ) : (
                <span className="vchip wip">In Arbeit</span>
              )}
              <span className="spacer" />
              {changedBlocks.size > 0 && (
                <button
                  className={`btn-sm${showRevisions ? ' active' : ''}`}
                  onClick={() => setShowRevisions(v => !v)}
                  title={showRevisions ? 'Revisions-Markierungen ausblenden' : 'Revisions-Markierungen anzeigen'}
                  style={showRevisions ? { background: 'var(--text-primary)', color: 'var(--text-inverse)' } : {}}
                >
                  <GitCompare size={11} />
                  {changedBlocks.size} Änderung{changedBlocks.size !== 1 ? 'en' : ''}
                </button>
              )}
            </div>
            <div className="pbody">
              <div className={`script-body${showRevisions ? ' show-revisions' : ''}`}>
                {contentTextelemente.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: 12 }}>
                    Noch kein Inhalt vorhanden.
                  </div>
                ) : (
                  contentTextelemente.map((te: any, i: number) => (
                    <div
                      key={te.id ?? i}
                      className={[
                        te.type ?? 'action',
                        showRevisions && changedBlocks.has(i) ? 'revised' : '',
                      ].filter(Boolean).join(' ')}
                      contentEditable
                      suppressContentEditableWarning
                      onBlur={e => {
                        const newText = e.currentTarget.textContent ?? ''
                        if (newText !== te.text) {
                          const newTextelemente = contentTextelemente.map((t: any, bi: number) =>
                            bi === i ? { ...t, text: newText } : t
                          )
                          handleContentChange(newTextelemente)
                        }
                      }}
                    >
                      {te.text}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
