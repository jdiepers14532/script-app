import { useState, useEffect, useRef, useCallback, useContext } from 'react'
import { FileDown, MessageSquare, Send, ExternalLink, X } from 'lucide-react'
import Tooltip from './Tooltip'
import { ENV_COLORS } from '../data/scenes'
import { api } from '../api/client'
import { PanelModeContext, useAppSettings, useUserPrefs } from '../contexts'

interface SceneEditorProps {
  szeneId: number | string
  stageId: number | null
  produktionId?: string | null
  folgeNummer?: number | null
  panelMode?: 'both' | 'treatment' | 'script'
  useDokumentSzenen?: boolean
  onSzeneUpdated?: (updated: any) => void
  onNavigatePrev?: () => void
  onNavigateNext?: () => void
  onMarkCommentsRead?: (szeneId: number) => void
}

function formatUpdatedAt(iso: string): string {
  const d = new Date(iso)
  const date = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const time = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  return `${date} ${time} CET`
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

export default function SceneEditor({ szeneId, stageId, produktionId, folgeNummer, panelMode: panelModeProp, useDokumentSzenen, onSzeneUpdated, onNavigatePrev, onNavigateNext, onMarkCommentsRead }: SceneEditorProps) {
  const { panelMode: panelModeCtx } = useContext(PanelModeContext)
  const panelMode = panelModeProp ?? panelModeCtx
  const { treatmentLabel } = useAppSettings()
  const { scrollNavDelay } = useUserPrefs()
  const [scene, setScene] = useState<any | null>(null)
  const [kommentareCount, setKommentareCount] = useState<number>(0)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [changedBlocks, setChangedBlocks] = useState<Set<number>>(new Set())
  const [revisionColor, setRevisionColor] = useState<string | null>(null)
  const [splitRatio, setSplitRatio] = useState(0.5)
  const [vorstoppDrehbuch, setVorstoppDrehbuch] = useState<{ dauer_sekunden: number } | null>(null)
  const [showSpielzeitInfo, setShowSpielzeitInfo] = useState(false)
  const [sceneChars, setSceneChars] = useState<any[]>([])
  const [showAnnotations, setShowAnnotations] = useState(false)
  const [annotations, setAnnotations] = useState<any[]>([])
  const [annotationText, setAnnotationText] = useState('')
  const [annotationSending, setAnnotationSending] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const panelsRef = useRef<HTMLDivElement | null>(null)
  const draggingRef = useRef(false)
  const overscrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cycleIntExt = useCallback(async () => {
    const next = scene?.int_ext === 'int' ? 'ext' : 'int'
    try {
      const updated = await saveScene({ int_ext: next })
      setScene(updated); onSzeneUpdated?.(updated)
    } catch {}
  }, [scene, szeneId, onSzeneUpdated])

  const cycleTageszeit = useCallback(async () => {
    const order = ['TAG', 'NACHT', 'ABEND']
    const idx = order.indexOf(scene?.tageszeit ?? 'TAG')
    const next = order[(idx + 1) % order.length]
    try {
      const updated = await saveScene({ tageszeit: next })
      setScene(updated); onSzeneUpdated?.(updated)
    } catch {}
  }, [scene, szeneId, onSzeneUpdated])

  const ieAbbr = (ie: string) => ie === 'int' ? 'I' : 'A'
  const tzAbbr = (tz: string) => ({ TAG: 'T', NACHT: 'N', ABEND: 'A' }[tz] ?? 'T')

  const handlePbodyWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 2
    const atTop = el.scrollTop <= 0
    const goingDown = e.deltaY > 0
    const goingUp = e.deltaY < 0

    if (goingDown && atBottom && onNavigateNext) {
      if (!overscrollTimer.current) {
        overscrollTimer.current = setTimeout(() => {
          overscrollTimer.current = null
          onNavigateNext()
        }, scrollNavDelay)
      }
    } else if (goingUp && atTop && onNavigatePrev) {
      if (!overscrollTimer.current) {
        overscrollTimer.current = setTimeout(() => {
          overscrollTimer.current = null
          onNavigatePrev()
        }, scrollNavDelay)
      }
    } else {
      if (overscrollTimer.current) {
        clearTimeout(overscrollTimer.current)
        overscrollTimer.current = null
      }
    }
  }, [onNavigatePrev, onNavigateNext, scrollNavDelay])

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

  // Load annotations when panel opens or scene changes
  useEffect(() => {
    if (!showAnnotations || typeof szeneId !== 'number') return
    api.getSceneAnnotations(szeneId)
      .then(data => setAnnotations(data))
      .catch(() => setAnnotations([]))
  }, [showAnnotations, szeneId])

  // Reset annotation panel when scene changes
  useEffect(() => {
    setShowAnnotations(false)
    setAnnotations([])
    setAnnotationText('')
  }, [szeneId])

  // Cancel pending overscroll navigation when scene changes
  useEffect(() => {
    if (overscrollTimer.current) {
      clearTimeout(overscrollTimer.current)
      overscrollTimer.current = null
    }
  }, [szeneId])

  // Abstraction: use new dokument_szenen API or old szenen API
  const loadScene = useCallback(() => {
    if (useDokumentSzenen && typeof szeneId === 'string') {
      return api.getDokumentSzene(szeneId)
    }
    return api.getSzene(szeneId as number)
  }, [szeneId, useDokumentSzenen])

  const saveScene = useCallback((data: any) => {
    if (useDokumentSzenen && typeof szeneId === 'string') {
      return api.updateDokumentSzene(szeneId, data)
    }
    return api.updateSzene(szeneId as number, data)
  }, [szeneId, useDokumentSzenen])

  // Load scene when szeneId changes
  useEffect(() => {
    setLoading(true)
    setError(null)
    loadScene()
      .then(data => {
        setScene(data)
        // For new system: load characters, vorstopp, revisions via scene_identity_id / dokument_szene_id
        if (useDokumentSzenen && typeof szeneId === 'string') {
          if (data?.scene_identity_id) {
            api.getSceneIdentityCharacters(data.scene_identity_id)
              .then(chars => setSceneChars(Array.isArray(chars) ? chars : []))
              .catch(() => setSceneChars([]))
            api.getSceneIdentityVorstopp(data.scene_identity_id)
              .then(v => setVorstoppDrehbuch(v?.latest_per_stage?.drehbuch ?? null))
              .catch(() => setVorstoppDrehbuch(null))
          }
          api.getDokumentSzeneRevisionen(szeneId)
            .then(deltas => {
              const changed = new Set<number>()
              deltas.forEach((d: any) => {
                if (d.field_type === 'content_block' && d.block_index != null) changed.add(d.block_index)
              })
              setChangedBlocks(changed)
              const colorDelta = deltas.find((d: any) => d.revision_color)
              setRevisionColor(colorDelta?.revision_color ?? null)
            })
            .catch(() => { setChangedBlocks(new Set()); setRevisionColor(null) })
        }
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))

    // Old-system features (only for numeric szene IDs)
    if (typeof szeneId === 'number') {
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
    } else {
      setKommentareCount(0)
    }
  }, [szeneId, stageId])

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
        const saved = await saveScene({ content })
        setScene(saved)
        onSzeneUpdated?.(saved)
        // Create auto-save version (old system only)
        if (typeof szeneId === 'number') {
          await api.createVersion(szeneId, {
            content_snapshot: content,
            change_summary: 'Auto-save',
          }).catch(() => {})
        }
        setSaveMsg('Gespeichert')
      } catch {
        setSaveMsg('Fehler beim Speichern')
      } finally {
        setSaving(false)
        setTimeout(() => setSaveMsg(null), 2000)
      }
    }, 3000)
  }, [scene, szeneId, onSzeneUpdated])

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

  return (
    <div className="detail">
      {/* Lean header — alles inline, kein Kasten */}
      <div className="detail-head" style={{ borderLeft: 'none', borderBottom: 'none' }}>

        {/* Zeile 1: SZ | Stoppzeit-Input | Motiv (grows) | Spielzeit | DT · I/T | buttons */}
        <div className="scene-r1">
          {/* SZ-Nummer */}
          <span className="sz-group">
            <span className="scene-big">SZ{scene.scene_nummer}</span>
          </span>

          {/* Stoppzeit — mm:ss for werkstufen (stoppzeit_sek), minutes for legacy */}
          {scene.stoppzeit_sek != null || (useDokumentSzenen && typeof szeneId === 'string') ? (
            <input
              key={`stopp-${szeneId}`}
              className="spielzeit-inp stopp-inp"
              defaultValue={scene.stoppzeit_sek != null ? `${Math.floor(scene.stoppzeit_sek / 60)}:${String(scene.stoppzeit_sek % 60).padStart(2, '0')}` : ''}
              placeholder="0:00"
              title="Stoppzeit (mm:ss)"
              onBlur={e => {
                const raw = e.target.value.trim()
                if (!raw) {
                  if (scene.stoppzeit_sek != null)
                    saveScene({ stoppzeit_sek: null }).then(s => { setScene(s); onSzeneUpdated?.(s) }).catch(() => {})
                  return
                }
                const parts = raw.split(':')
                const mins = parseInt(parts[0] || '0', 10) || 0
                const secs = parseInt(parts[1] || '0', 10) || 0
                const total = mins * 60 + secs
                if (total !== (scene.stoppzeit_sek ?? null))
                  saveScene({ stoppzeit_sek: total }).then(s => { setScene(s); onSzeneUpdated?.(s) }).catch(() => {})
              }}
            />
          ) : (
            <input
              key={`stopp-${szeneId}`}
              className="spielzeit-inp stopp-inp"
              defaultValue={scene.dauer_min != null ? String(scene.dauer_min) : ''}
              placeholder="0'"
              title="Geplante Dauer (Minuten)"
              type="number"
              min={0}
              onBlur={e => {
                const raw = e.target.value.trim()
                const val = raw ? parseFloat(raw) : null
                if (val !== (scene.dauer_min ?? null))
                  saveScene({ dauer_min: val }).then(s => { setScene(s); onSzeneUpdated?.(s) }).catch(() => {})
              }}
            />
          )}

          {/* Motiv — wächst und füllt */}
          <span className="sf-motiv">{scene.ort_name}</span>

          {/* Save status */}
          {saving && <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>Speichert…</span>}
          {saveMsg && !saving && <span style={{ fontSize: 11, color: saveMsg === 'Gespeichert' ? 'var(--sw-green)' : 'var(--sw-danger)', flexShrink: 0 }}>{saveMsg}</span>}

          {/* Spielzeit mit Hover-Info */}
          <span
            className="spielzeit-wrap"
            onMouseEnter={() => setShowSpielzeitInfo(true)}
            onMouseLeave={() => setShowSpielzeitInfo(false)}
            style={{ position: 'relative' }}
          >
            <span className="spiel-field-lbl">Sp</span>
            <input
              key={`sz-${szeneId}`}
              className="spielzeit-inp"
              defaultValue={scene.spielzeit ?? ''}
              placeholder="00:00"
              onBlur={e => {
                const val = e.target.value.trim() || null
                if (val !== (scene.spielzeit ?? null))
                  saveScene({ spielzeit: val }).then(s => { setScene(s); onSzeneUpdated?.(s) }).catch(() => {})
              }}
            />
            {showSpielzeitInfo && (
              <div className="spielzeit-info-pop">
                <strong>Spielzeit</strong>
                <p>Wahrscheinliche Uhrzeit der Handlung — z.B. „08:30" für frühen Morgen.</p>
              </div>
            )}
          </span>

          {/* A/T + DT — A/T zuerst, dann Dramaturgischer Tag */}
          <span className="ie-group">
            <Tooltip text={scene.int_ext === 'int' ? 'Innen — klicken für Außen' : 'Außen — klicken für Innen'} placement="bottom">
              <span className="ie-toggle" onClick={cycleIntExt}>{ieAbbr(scene.int_ext ?? 'int')}</span>
            </Tooltip>
            <span className="ie-sep">/</span>
            <Tooltip text={`Tageszeit: ${scene.tageszeit ?? 'TAG'} — klicken zum Wechseln`} placement="bottom">
              <span className="ie-toggle" onClick={cycleTageszeit}>{tzAbbr(scene.tageszeit ?? 'TAG')}</span>
            </Tooltip>
            <span className="ie-sep">·</span>
            <Tooltip text={"Dramaturgischer Tag: Erzähltag der Geschichte\n1 = erster Tag der Handlung\nAutomatisch hochgezählt bei NACHT→TAG-Übergang\nManuell überschreibbar"} placement="bottom">
              <span className="ie-field-wrap">
                <span className="ie-lbl">DT</span>
                <input
                  key={`dt-${szeneId}`}
                  className="ie-num-inp"
                  defaultValue={scene.spieltag != null ? String(scene.spieltag) : ''}
                  placeholder="—"
                  type="number"
                  min={1}
                  onBlur={e => {
                    const raw = e.target.value.trim()
                    const val = raw ? parseInt(raw, 10) : null
                    if (val !== (scene.spieltag ?? null))
                      saveScene({ spieltag: val }).then(s => { setScene(s); onSzeneUpdated?.(s) }).catch(() => {})
                  }}
                />
              </span>
            </Tooltip>
          </span>

          <Tooltip text={showAnnotations ? 'Annotationen schließen' : 'Annotationen (Messenger.app)'} placement="bottom">
            <button
              className={`btn ghost${showAnnotations ? ' active' : ''}`}
              style={showAnnotations ? { color: 'var(--sw-green)' } : undefined}
              onClick={() => {
                const next = !showAnnotations
                setShowAnnotations(next)
                if (!next && kommentareCount > 0 && typeof szeneId === 'number') onMarkCommentsRead?.(szeneId)
              }}
            >
              <MessageSquare size={12} />
              {kommentareCount > 0 && !showAnnotations && (
                <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--sw-green)', marginLeft: 1 }}>{kommentareCount}</span>
              )}
            </button>
          </Tooltip>
          <button className="btn ghost" onClick={() => stageId && api.exportPdf(stageId).then(r => r.blob()).then(b => {
            const url = URL.createObjectURL(b); window.open(url, '_blank')
          })}>
            <FileDown size={12} />PDF
          </button>
        </div>

        {/* Zeilen 2–5: Felder eingerückt unter Motiv-Position */}
        <div className="scene-fields" key={szeneId}>
          {/* Unsichtbarer Spacer — spiegelt sz-group + stopp-inp aus scene-r1 für exakte Ausrichtung */}
          <span className="sf-align-spacer" aria-hidden="true">
            <span className="sz-group"><span className="scene-big">SZ0</span></span>
            <input className="stopp-inp" type="number" tabIndex={-1} readOnly style={{ pointerEvents: 'none' }} />
          </span>
          <div className="scene-fields-rows">
          <div className="sf-row">
            <input
              className="sf-input"
              defaultValue={scene.zusammenfassung ?? ''}
              placeholder="Oneliner…"
              onBlur={e => {
                const val = e.target.value.trim() || null
                if (val !== (scene.zusammenfassung ?? null))
                  saveScene({ zusammenfassung: val }).then(s => { setScene(s); onSzeneUpdated?.(s) }).catch(() => {})
              }}
            />
          </div>
          <div className="sf-row sf-chars">
            <span className="sf-tag">R·</span>
            <span className="sf-charlist">
              {sceneChars.filter((c: any) => c.kategorie_typ === 'rolle').map((c: any) => c.name).join(', ') || <em className="sf-empty">—</em>}
            </span>
          </div>
          <div className="sf-row sf-chars">
            <span className="sf-tag">K·</span>
            <span className="sf-charlist">
              {sceneChars.filter((c: any) => c.kategorie_typ === 'komparse').map((c: any) => c.name).join(', ') || <em className="sf-empty">—</em>}
            </span>
          </div>
          {scene.szeneninfo && (
            <div className="sf-row" style={{ fontSize: 11, color: '#90CAF9', fontStyle: 'italic' }}>
              {scene.szeneninfo}
            </div>
          )}
          </div>{/* end scene-fields-rows */}
        </div>
      </div>

      {/* Imported content (read-only display of textelemente from import) */}
      {contentTextelemente.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '8px 16px', maxHeight: 300, overflowY: 'auto', fontSize: 12, lineHeight: 1.6 }}>
          {contentTextelemente.map((el: any, i: number) => {
            if (el.type === 'character') return (
              <div key={i} style={{ fontWeight: 600, textTransform: 'uppercase', fontSize: 11, marginTop: 8, color: 'var(--text-primary)', textAlign: 'center' }}>{el.text}</div>
            )
            if (el.type === 'dialogue') return (
              <div key={i} style={{ marginLeft: 80, marginRight: 80, color: 'var(--text-primary)' }}>{el.text}</div>
            )
            if (el.type === 'parenthetical') return (
              <div key={i} style={{ marginLeft: 60, marginRight: 80, fontStyle: 'italic', color: 'var(--text-secondary)' }}>{el.text}</div>
            )
            if (el.type === 'direction') return (
              <div key={i} style={{ fontStyle: 'italic', color: 'var(--text-secondary)', marginTop: 4 }}>{el.text}</div>
            )
            if (el.type === 'shot') return (
              <div key={i} style={{ fontWeight: 600, fontSize: 11, marginTop: 8, color: '#90CAF9' }}>{el.text}</div>
            )
            return <div key={i} style={{ marginTop: 4, color: 'var(--text-primary)' }}>{el.text}</div>
          })}
        </div>
      )}

      {/* Annotation panel */}
      {showAnnotations && (
        <div style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 320, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Annotationen · Szene {scene.scene_nummer}{scene.scene_nummer_suffix || ''}
            </span>
            <a
              href={`https://messenger.serienwerft.studio`}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 3, textDecoration: 'none' }}
            >
              Messenger <ExternalLink size={10} />
            </a>
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {annotations.length === 0 && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>Noch keine Annotationen zu dieser Szene.</span>
            )}
            {annotations.map((ann: any) => (
              <div key={ann.id} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ fontSize: 12, color: 'var(--text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{ann.text}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  {ann.user_name || ann.author_name || 'Unbekannt'} · {new Date(ann.created_at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            ))}
          </div>

          {/* New annotation input */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
            <textarea
              value={annotationText}
              onChange={e => setAnnotationText(e.target.value)}
              placeholder="Annotation hinzufügen…"
              rows={2}
              style={{ flex: 1, resize: 'none', fontSize: 12, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-primary)', fontFamily: 'inherit' }}
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault()
                  if (annotationText.trim() && !annotationSending && typeof szeneId === 'number') {
                    setAnnotationSending(true)
                    api.createSceneAnnotation(szeneId, annotationText)
                      .then(ann => { setAnnotations(prev => [...prev, ann]); setAnnotationText('') })
                      .catch(() => {})
                      .finally(() => setAnnotationSending(false))
                  }
                }
              }}
            />
            <button
              className="btn primary"
              style={{ padding: '6px 10px', flexShrink: 0 }}
              disabled={!annotationText.trim() || annotationSending}
              onClick={() => {
                if (!annotationText.trim() || annotationSending || typeof szeneId !== 'number') return
                setAnnotationSending(true)
                api.createSceneAnnotation(szeneId, annotationText)
                  .then(ann => { setAnnotations(prev => [...prev, ann]); setAnnotationText('') })
                  .catch(() => {})
                  .finally(() => setAnnotationSending(false))
              }}
            >
              <Send size={11} />
            </button>
          </div>
        </div>
      )}

    </div>
  )
}
