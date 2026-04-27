import { useState, useEffect, useRef, useCallback, useContext } from 'react'
import { Lock, FileDown, MessageSquare, Info } from 'lucide-react'
import Tooltip from './Tooltip'
import { ENV_COLORS } from '../data/scenes'
import { api } from '../api/client'
import { PanelModeContext, useAppSettings, useUserPrefs } from '../App'

interface SceneEditorProps {
  szeneId: number
  stageId: number | null
  staffelId?: string | null
  folgeNummer?: number | null
  panelMode?: 'both' | 'treatment' | 'script'
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

export default function SceneEditor({ szeneId, stageId, staffelId, folgeNummer, panelMode: panelModeProp, onSzeneUpdated, onNavigatePrev, onNavigateNext, onMarkCommentsRead }: SceneEditorProps) {
  const { panelMode: panelModeCtx } = useContext(PanelModeContext)
  const panelMode = panelModeProp ?? panelModeCtx
  const { treatmentLabel } = useAppSettings()
  const { scrollNavDelay } = useUserPrefs()
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
  const overscrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cycleIntExt = useCallback(async () => {
    const next = scene?.int_ext === 'int' ? 'ext' : 'int'
    try {
      const updated = await api.updateSzene(szeneId, { int_ext: next })
      setScene(updated); onSzeneUpdated?.(updated)
    } catch {}
  }, [scene, szeneId, onSzeneUpdated])

  const cycleTageszeit = useCallback(async () => {
    const order = ['TAG', 'NACHT', 'ABEND']
    const idx = order.indexOf(scene?.tageszeit ?? 'TAG')
    const next = order[(idx + 1) % order.length]
    try {
      const updated = await api.updateSzene(szeneId, { tageszeit: next })
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

  // Cancel pending overscroll navigation when scene changes
  useEffect(() => {
    if (overscrollTimer.current) {
      clearTimeout(overscrollTimer.current)
      overscrollTimer.current = null
    }
  }, [szeneId])

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
      {/* Lean header — alles inline, kein Kasten */}
      <div className="detail-head" style={{ borderLeft: `3px solid ${stripeColor}` }}>

        {/* Zeile 1: SZ·stopp | Motiv (grows) | spielzeit·ⓘ | I/T | buttons */}
        <div className="scene-r1">
          {/* SZ + Stoppzeit ohne Space */}
          <span className="sz-group">
            <span className="scene-big">SZ{scene.scene_nummer}</span>
            {vorstoppDrehbuch && (
              <span className="sz-stopp">·{Math.floor(vorstoppDrehbuch.dauer_sekunden / 60)}'</span>
            )}
          </span>

          {/* Motiv — wächst und füllt */}
          <span className="sf-motiv">{scene.ort_name}</span>

          {/* Save status */}
          {saving && <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>Speichert…</span>}
          {saveMsg && !saving && <span style={{ fontSize: 11, color: saveMsg === 'Gespeichert' ? 'var(--sw-green)' : 'var(--sw-danger)', flexShrink: 0 }}>{saveMsg}</span>}

          {/* Spielzeit + Info-Icon als Tooltip-Trigger */}
          <Tooltip text="Spielzeit: wahrscheinliche Uhrzeit der Handlung dieser Szene">
            <span className="spielzeit-wrap">
              <input
                key={`sz-${szeneId}`}
                className="spielzeit-inp"
                defaultValue={scene.spielzeit ?? ''}
                placeholder="00:00"
                onBlur={e => {
                  const val = e.target.value.trim() || null
                  if (val !== (scene.spielzeit ?? null))
                    api.updateSzene(szeneId, { spielzeit: val }).then(s => { setScene(s); onSzeneUpdated?.(s) }).catch(() => {})
                }}
              />
              <Info size={10} className="sz-info-icon" />
            </span>
          </Tooltip>

          {/* I/T als enge Gruppe — rechtsbündig vor Lock */}
          <span className="ie-group">
            <span className="ie-toggle" onClick={cycleIntExt}
              title={scene.int_ext === 'int' ? 'Innen — klicken für Außen' : 'Außen — klicken für Innen'}>
              {ieAbbr(scene.int_ext ?? 'int')}
            </span>
            <span className="ie-sep">/</span>
            <span className="ie-toggle" onClick={cycleTageszeit}
              title={`Tageszeit: ${scene.tageszeit ?? 'TAG'} — klicken zum Wechseln`}>
              {tzAbbr(scene.tageszeit ?? 'TAG')}
            </span>
          </span>

          {kommentareCount > 0 && (
            <button className="btn ghost" title="Kommentare (als gelesen markieren)" onClick={() => onMarkCommentsRead?.(szeneId)}>
              <MessageSquare size={12} />{kommentareCount}
            </button>
          )}
          {sceneIsLocked ? (
            <button className="btn lock held"><Lock size={12} />Gelockt</button>
          ) : (
            <button className="btn ghost" onClick={handleRequestLock} title="Lock anfordern"><Lock size={12} />Locken</button>
          )}
          <button className="btn ghost" onClick={() => stageId && api.exportPdf(stageId).then(r => r.blob()).then(b => {
            const url = URL.createObjectURL(b); window.open(url, '_blank')
          })}>
            <FileDown size={12} />PDF
          </button>
        </div>

        {/* Zeilen 2–5: Felder eingerückt unter Motiv-Position */}
        <div className="scene-fields" key={szeneId}>
          <div className="sf-row">
            <input
              className="sf-input"
              defaultValue={scene.zusammenfassung ?? ''}
              placeholder="Oneliner…"
              onBlur={e => {
                const val = e.target.value.trim() || null
                if (val !== (scene.zusammenfassung ?? null))
                  api.updateSzene(szeneId, { zusammenfassung: val }).then(s => { setScene(s); onSzeneUpdated?.(s) }).catch(() => {})
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
          <div className="sf-row">
            <input
              className="sf-input sf-notiz"
              defaultValue={scene.stimmung ?? ''}
              placeholder="Notiz…"
              onBlur={e => {
                const val = e.target.value.trim() || null
                if (val !== (scene.stimmung ?? null))
                  api.updateSzene(szeneId, { stimmung: val }).then(s => { setScene(s); onSzeneUpdated?.(s) }).catch(() => {})
              }}
            />
          </div>
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

    </div>
  )
}
