import { useState, useEffect, useRef, useCallback, useContext, useMemo } from 'react'
import { FileDown, MessageSquare, Send, ExternalLink, X, Plus, Trash2 } from 'lucide-react'
import Tooltip from './Tooltip'
import { ENV_COLORS, ENV_COLORS_DARK } from '../data/scenes'
import { api } from '../api/client'
import { PanelModeContext, useAppSettings, useUserPrefs, useTweaks } from '../contexts'

interface SceneEditorProps {
  szeneId: number | string
  stageId: number | null
  produktionId?: string | null
  folgeNummer?: number | null
  panelMode?: 'both' | 'treatment' | 'script'
  useDokumentSzenen?: boolean
  compact?: boolean
  werkstufId?: string | null
  sceneIdentityId?: string | null
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

export default function SceneEditor({ szeneId, stageId, produktionId, folgeNummer, panelMode: panelModeProp, useDokumentSzenen, compact: compactProp, werkstufId, sceneIdentityId, onSzeneUpdated, onNavigatePrev, onNavigateNext, onMarkCommentsRead }: SceneEditorProps) {
  const { panelMode: panelModeCtx } = useContext(PanelModeContext)
  const panelMode = panelModeProp ?? panelModeCtx
  const { treatmentLabel } = useAppSettings()
  const { scrollNavDelay } = useUserPrefs()
  const { tweaks } = useTweaks()
  const compact = compactProp ?? tweaks.sceneHeaderCompact
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
  const [allMotive, setAllMotive] = useState<any[]>([])
  const [allCharacters, setAllCharacters] = useState<any[]>([])
  const [charKategorien, setCharKategorien] = useState<any[]>([])
  const [motivDropdownOpen, setMotivDropdownOpen] = useState(false)
  const [untermotivDropdownOpen, setUntermotivDropdownOpen] = useState(false)
  const [motivSearch, setMotivSearch] = useState('')
  const [untermotivSearch, setUntermotivSearch] = useState('')
  const [selectedMotivId, setSelectedMotivId] = useState<string | null>(null)
  const [charSearchRolle, setCharSearchRolle] = useState('')
  const [charSearchKomparse, setCharSearchKomparse] = useState('')
  const [charDropdownRolle, setCharDropdownRolle] = useState(false)
  const [charDropdownKomparse, setCharDropdownKomparse] = useState(false)
  const motivDropdownRef = useRef<HTMLDivElement | null>(null)
  const untermotivDropdownRef = useRef<HTMLDivElement | null>(null)
  const rolleDropdownRef = useRef<HTMLDivElement | null>(null)
  const komparseDropdownRef = useRef<HTMLDivElement | null>(null)

  // Compute fixed position for dropdown to escape overflow:hidden parents
  const getFixedDropdownStyle = useCallback((ref: React.RefObject<HTMLDivElement | null>): React.CSSProperties => {
    if (!ref.current) return {}
    const rect = ref.current.getBoundingClientRect()
    const maxH = 200
    const spaceBelow = window.innerHeight - rect.bottom - 8
    const openAbove = spaceBelow < maxH && rect.top > spaceBelow
    return {
      position: 'fixed',
      left: rect.left,
      width: Math.max(rect.width, 200),
      maxHeight: maxH,
      ...(openAbove ? { bottom: window.innerHeight - rect.top + 2 } : { top: rect.bottom + 2 }),
    }
  }, [])
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

  // Load motive + characters for autocomplete when produktionId changes
  useEffect(() => {
    if (!produktionId) return
    api.getMotive(produktionId).then(setAllMotive).catch(() => setAllMotive([]))
    api.getCharacters(produktionId).then(setAllCharacters).catch(() => setAllCharacters([]))
    api.getCharKategorien(produktionId).then(setCharKategorien).catch(() => setCharKategorien([]))
  }, [produktionId])

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (motivDropdownRef.current && !motivDropdownRef.current.contains(e.target as Node)) setMotivDropdownOpen(false)
      if (untermotivDropdownRef.current && !untermotivDropdownRef.current.contains(e.target as Node)) setUntermotivDropdownOpen(false)
      if (rolleDropdownRef.current && !rolleDropdownRef.current.contains(e.target as Node)) setCharDropdownRolle(false)
      if (komparseDropdownRef.current && !komparseDropdownRef.current.contains(e.target as Node)) setCharDropdownKomparse(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Derived: kategorie IDs for rolle/komparse
  const rolleKatId = useMemo(() => charKategorien.find((k: any) => k.typ === 'rolle')?.id ?? null, [charKategorien])
  const komparseKatId = useMemo(() => charKategorien.find((k: any) => k.typ === 'komparse')?.id ?? null, [charKategorien])

  // Derived: characters filtered by type
  const rolleCharacters = useMemo(() => allCharacters.filter(c => c.kategorie_typ === 'rolle'), [allCharacters])
  const komparseCharacters = useMemo(() => allCharacters.filter(c => c.kategorie_typ === 'komparse'), [allCharacters])

  // Derived: motive hierarchy — parent (no parent_id) and children (with parent_id)
  const parentMotive = useMemo(() => allMotive.filter(m => !m.parent_id), [allMotive])
  const childrenOf = useMemo(() => {
    const map: Record<string, any[]> = {}
    for (const m of allMotive) {
      if (m.parent_id) {
        if (!map[m.parent_id]) map[m.parent_id] = []
        map[m.parent_id].push(m)
      }
    }
    return map
  }, [allMotive])

  // Build motiv display label: "Drehort / Name"
  const motivDisplayLabel = useCallback((m: any) => {
    const parts: string[] = []
    if (m.drehort_label) parts.push(m.drehort_label)
    parts.push(m.name)
    return parts.join(' / ')
  }, [])

  // Build full ort_name from selected motiv + untermotiv
  const buildOrtName = useCallback((parentMotiv: any, childMotiv?: any) => {
    const parts: string[] = []
    if (parentMotiv.drehort_label) parts.push(parentMotiv.drehort_label)
    parts.push(parentMotiv.name)
    if (childMotiv) parts.push(childMotiv.name)
    return parts.join(' / ')
  }, [])

  // Sync selectedMotivId from scene.motiv_id when scene loads
  useEffect(() => {
    if (!scene) return
    if (scene.motiv_id) {
      // Find if this is a child motiv or parent
      const motiv = allMotive.find(m => m.id === scene.motiv_id)
      if (motiv?.parent_id) {
        setSelectedMotivId(motiv.parent_id)
      } else {
        setSelectedMotivId(scene.motiv_id)
      }
    } else {
      setSelectedMotivId(null)
    }
  }, [scene?.motiv_id, allMotive])

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
    // If werkstufId + sceneIdentityId provided, resolve the szene for this specific werkstufe
    if (werkstufId && sceneIdentityId) {
      return api.resolveDokumentSzene(werkstufId, sceneIdentityId)
        .catch(e => {
          // 404 = scene not yet in this werkstufe (normal for new/empty werkstufen)
          if (e.message?.includes('nicht') || e.message?.includes('404')) return null
          throw e
        })
    }
    if (useDokumentSzenen && typeof szeneId === 'string') {
      return api.getDokumentSzene(szeneId)
    }
    return api.getSzene(szeneId as number)
  }, [szeneId, useDokumentSzenen, werkstufId, sceneIdentityId])

  const saveScene = useCallback((data: any) => {
    // Use resolved scene ID if available
    const resolvedId = scene?.id
    if (!resolvedId && useDokumentSzenen) {
      // Scene not loaded (e.g. deleted/re-imported) — skip save silently
      return Promise.resolve(null)
    }
    if (werkstufId && sceneIdentityId && resolvedId) {
      return api.updateDokumentSzene(resolvedId, data)
    }
    if (useDokumentSzenen && resolvedId) {
      return api.updateDokumentSzene(resolvedId, data)
    }
    return api.updateSzene(szeneId as number, data)
  }, [szeneId, useDokumentSzenen, werkstufId, sceneIdentityId, scene])

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

  const handleAddCharacter = useCallback(async (character: any, kategorieId: number | null) => {
    if (!scene?.scene_identity_id) return
    try {
      await api.addSceneIdentityCharacter(scene.scene_identity_id, {
        character_id: character.id,
        kategorie_id: kategorieId,
      })
      const chars = await api.getSceneIdentityCharacters(scene.scene_identity_id)
      setSceneChars(Array.isArray(chars) ? chars : [])
    } catch (e: any) {
      console.error('Fehler beim Hinzufügen', e)
    }
  }, [scene])

  const handleRemoveCharacter = useCallback(async (characterId: string) => {
    if (!scene?.scene_identity_id) return
    try {
      await api.removeSceneIdentityCharacter(scene.scene_identity_id, characterId)
      setSceneChars(prev => prev.filter(c => c.character_id !== characterId))
    } catch (e: any) {
      console.error('Fehler beim Entfernen', e)
    }
  }, [scene])

  const handleMotivSelect = useCallback(async (parentMotiv: any) => {
    setMotivDropdownOpen(false)
    setMotivSearch('')
    setSelectedMotivId(parentMotiv.id)
    // Check if this motiv has children — if yes, don't save yet (user picks Untermotiv)
    const children = childrenOf[parentMotiv.id]
    if (children && children.length > 0) {
      // Save parent only, user will pick untermotiv
      const ortName = buildOrtName(parentMotiv)
      try {
        const updated = await saveScene({ ort_name: ortName, motiv_id: parentMotiv.id })
        setScene(updated)
        onSzeneUpdated?.(updated)
      } catch {}
    } else {
      // No children — save directly
      const ortName = buildOrtName(parentMotiv)
      try {
        const updated = await saveScene({ ort_name: ortName, motiv_id: parentMotiv.id })
        setScene(updated)
        onSzeneUpdated?.(updated)
      } catch {}
    }
  }, [saveScene, onSzeneUpdated, childrenOf, buildOrtName])

  const handleUntermotivSelect = useCallback(async (childMotiv: any) => {
    setUntermotivDropdownOpen(false)
    setUntermotivSearch('')
    const parentMotiv = allMotive.find(m => m.id === childMotiv.parent_id)
    if (!parentMotiv) return
    const ortName = buildOrtName(parentMotiv, childMotiv)
    try {
      const updated = await saveScene({ ort_name: ortName, motiv_id: childMotiv.id })
      setScene(updated)
      onSzeneUpdated?.(updated)
    } catch {}
  }, [saveScene, onSzeneUpdated, allMotive, buildOrtName])

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
  const envColor = (tweaks.theme === 'dark' ? ENV_COLORS_DARK : ENV_COLORS)[envKey]
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

          {/* Motiv + Untermotiv dropdowns */}
          <div className="sf-motiv-group" style={{ display: 'flex', flex: 1, gap: 4, minWidth: 0, alignItems: 'center' }}>
            {/* Motiv (parent) dropdown */}
            <div className="sf-motiv-wrap" ref={motivDropdownRef}>
              <input
                className="sf-motiv sf-motiv-input"
                value={motivDropdownOpen ? motivSearch : ((() => {
                  // Show parent motiv name (with drehort label)
                  const curMotiv = allMotive.find(m => m.id === scene.motiv_id)
                  const parent = curMotiv?.parent_id ? allMotive.find(m => m.id === curMotiv.parent_id) : curMotiv
                  return parent ? motivDisplayLabel(parent) : (scene.ort_name ?? '')
                })())}
                placeholder="Motiv…"
                onChange={e => { setMotivSearch(e.target.value); if (!motivDropdownOpen) setMotivDropdownOpen(true) }}
                onFocus={() => { setMotivDropdownOpen(true); setMotivSearch('') }}
                onBlur={() => {
                  setTimeout(() => {
                    if (!motivDropdownRef.current?.contains(document.activeElement)) setMotivDropdownOpen(false)
                  }, 150)
                }}
              />
              {motivDropdownOpen && (
                <div className="sf-dropdown sf-dropdown-fixed" style={getFixedDropdownStyle(motivDropdownRef)}>
                  {parentMotive
                    .filter(m => !motivSearch || motivDisplayLabel(m).toLowerCase().includes(motivSearch.toLowerCase()))
                    .map(m => (
                      <div key={m.id} className="sf-dropdown-item"
                        onMouseDown={e => { e.preventDefault(); handleMotivSelect(m) }}>
                        <span>{motivDisplayLabel(m)}</span>
                        {childrenOf[m.id] && <span style={{ color: 'var(--text-muted)', marginLeft: 4, fontSize: 10 }}>▸</span>}
                      </div>
                    ))}
                  {parentMotive.filter(m => !motivSearch || motivDisplayLabel(m).toLowerCase().includes(motivSearch.toLowerCase())).length === 0 && (
                    <div className="sf-dropdown-empty">Kein Motiv gefunden</div>
                  )}
                </div>
              )}
            </div>

            {/* Untermotiv (child) dropdown — only if selectedMotivId has children */}
            {selectedMotivId && childrenOf[selectedMotivId] && childrenOf[selectedMotivId].length > 0 && (
              <>
                <span style={{ color: 'var(--text-muted)', fontSize: 11, flexShrink: 0 }}>/</span>
                <div className="sf-motiv-wrap" ref={untermotivDropdownRef}>
                  <input
                    className="sf-motiv sf-motiv-input sf-motiv-sub"
                    value={untermotivDropdownOpen ? untermotivSearch : ((() => {
                      const curMotiv = allMotive.find(m => m.id === scene.motiv_id)
                      return curMotiv?.parent_id ? curMotiv.name : ''
                    })())}
                    placeholder="Untermotiv…"
                    onChange={e => { setUntermotivSearch(e.target.value); if (!untermotivDropdownOpen) setUntermotivDropdownOpen(true) }}
                    onFocus={() => { setUntermotivDropdownOpen(true); setUntermotivSearch('') }}
                    onBlur={() => {
                      setTimeout(() => {
                        if (!untermotivDropdownRef.current?.contains(document.activeElement)) setUntermotivDropdownOpen(false)
                      }, 150)
                    }}
                  />
                  {untermotivDropdownOpen && (
                    <div className="sf-dropdown sf-dropdown-fixed" style={getFixedDropdownStyle(untermotivDropdownRef)}>
                      {/* Option: no untermotiv (clear) */}
                      <div className="sf-dropdown-item" style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}
                        onMouseDown={e => {
                          e.preventDefault()
                          setUntermotivDropdownOpen(false)
                          setUntermotivSearch('')
                          const parentMotiv = allMotive.find(m => m.id === selectedMotivId)
                          if (parentMotiv) {
                            const ortName = buildOrtName(parentMotiv)
                            saveScene({ ort_name: ortName, motiv_id: parentMotiv.id }).then(s => { setScene(s); onSzeneUpdated?.(s) }).catch(() => {})
                          }
                        }}>
                        — kein Untermotiv —
                      </div>
                      {childrenOf[selectedMotivId]
                        .filter(m => !untermotivSearch || m.name.toLowerCase().includes(untermotivSearch.toLowerCase()))
                        .map(m => (
                          <div key={m.id} className="sf-dropdown-item"
                            onMouseDown={e => { e.preventDefault(); handleUntermotivSelect(m) }}>
                            {m.name}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

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

        {/* Zeilen 2–5: Felder eingerückt unter Motiv-Position (hidden in compact mode) */}
        {!compact && <div className="scene-fields" key={szeneId}>
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
          {/* Rollen — editable with autocomplete, only rolle characters */}
          <div className="sf-row sf-chars">
            <span className="sf-tag">R·</span>
            <span className="sf-charlist">
              {sceneChars.filter((c: any) => c.kategorie_typ === 'rolle').map((c: any) => (
                <span key={c.character_id} className="sf-char-chip">
                  {c.name}
                  <button className="sf-char-remove" title="Entfernen" onClick={() => handleRemoveCharacter(c.character_id)}><X size={9} /></button>
                </span>
              ))}
              <span className="sf-char-add-wrap" ref={rolleDropdownRef}>
                <input
                  className="sf-char-search"
                  value={charSearchRolle}
                  placeholder="+"
                  onChange={e => { setCharSearchRolle(e.target.value); setCharDropdownRolle(true) }}
                  onFocus={() => setCharDropdownRolle(true)}
                  style={{ width: charSearchRolle ? 100 : 20 }}
                />
                {charDropdownRolle && (
                  <div className="sf-dropdown sf-dropdown-fixed" style={getFixedDropdownStyle(rolleDropdownRef)}>
                    {rolleCharacters
                      .filter(ch => !sceneChars.some(sc => sc.character_id === ch.id))
                      .filter(ch => !charSearchRolle || ch.name.toLowerCase().includes(charSearchRolle.toLowerCase()))
                      .slice(0, 15)
                      .map(ch => (
                        <div key={ch.id} className="sf-dropdown-item"
                          onMouseDown={e => { e.preventDefault(); handleAddCharacter(ch, rolleKatId); setCharSearchRolle(''); setCharDropdownRolle(false) }}>
                          {ch.name}
                        </div>
                      ))}
                    {rolleCharacters.filter(ch => !sceneChars.some(sc => sc.character_id === ch.id)).filter(ch => !charSearchRolle || ch.name.toLowerCase().includes(charSearchRolle.toLowerCase())).length === 0 && (
                      <div className="sf-dropdown-empty">Keine Rollen verfügbar</div>
                    )}
                  </div>
                )}
              </span>
            </span>
          </div>
          {/* Komparsen — editable with autocomplete, only komparse characters */}
          <div className="sf-row sf-chars">
            <span className="sf-tag">K·</span>
            <span className="sf-charlist">
              {sceneChars.filter((c: any) => c.kategorie_typ === 'komparse').map((c: any) => (
                <span key={c.character_id} className="sf-char-chip">
                  {c.name}
                  <button className="sf-char-remove" title="Entfernen" onClick={() => handleRemoveCharacter(c.character_id)}><X size={9} /></button>
                </span>
              ))}
              <span className="sf-char-add-wrap" ref={komparseDropdownRef}>
                <input
                  className="sf-char-search"
                  value={charSearchKomparse}
                  placeholder="+"
                  onChange={e => { setCharSearchKomparse(e.target.value); setCharDropdownKomparse(true) }}
                  onFocus={() => setCharDropdownKomparse(true)}
                  style={{ width: charSearchKomparse ? 100 : 20 }}
                />
                {charDropdownKomparse && (
                  <div className="sf-dropdown sf-dropdown-fixed" style={getFixedDropdownStyle(komparseDropdownRef)}>
                    {komparseCharacters
                      .filter(ch => !sceneChars.some(sc => sc.character_id === ch.id))
                      .filter(ch => !charSearchKomparse || ch.name.toLowerCase().includes(charSearchKomparse.toLowerCase()))
                      .slice(0, 15)
                      .map(ch => (
                        <div key={ch.id} className="sf-dropdown-item"
                          onMouseDown={e => { e.preventDefault(); handleAddCharacter(ch, komparseKatId); setCharSearchKomparse(''); setCharDropdownKomparse(false) }}>
                          {ch.name}
                        </div>
                      ))}
                    {komparseCharacters.filter(ch => !sceneChars.some(sc => sc.character_id === ch.id)).filter(ch => !charSearchKomparse || ch.name.toLowerCase().includes(charSearchKomparse.toLowerCase())).length === 0 && (
                      <div className="sf-dropdown-empty">Keine Komparsen verfügbar</div>
                    )}
                  </div>
                )}
              </span>
            </span>
          </div>
          {/* Szeneninfo — editable */}
          <div className="sf-row">
            <input
              key={`sinfo-${szeneId}`}
              className="sf-input sf-input-info"
              defaultValue={scene.szeneninfo ?? ''}
              placeholder="Szeneninfo…"
              style={{ fontSize: 11, color: '#90CAF9', fontStyle: 'italic' }}
              onBlur={e => {
                const val = e.target.value.trim() || null
                if (val !== (scene.szeneninfo ?? null))
                  saveScene({ szeneninfo: val }).then(s => { setScene(s); onSzeneUpdated?.(s) }).catch(() => {})
              }}
            />
          </div>
          {/* Notiz — editable */}
          <div className="sf-row">
            <textarea
              key={`notiz-${szeneId}`}
              className="sf-input sf-notiz"
              defaultValue={scene.notiz ?? ''}
              placeholder="Notiz…"
              rows={2}
              onBlur={e => {
                const val = e.target.value.trim() || null
                if (val !== (scene.notiz ?? null))
                  saveScene({ notiz: val }).then(s => { setScene(s); onSzeneUpdated?.(s) }).catch(() => {})
              }}
            />
          </div>
          </div>{/* end scene-fields-rows */}
        </div>}
      </div>

      {/* Imported content (read-only display of textelemente from import, hidden in compact) */}
      {!compact && contentTextelemente.length > 0 && (
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
