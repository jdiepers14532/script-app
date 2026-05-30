import { useState, useEffect, useRef, useCallback, useContext, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { MessageSquare, Send, ExternalLink, X, Plus, Trash2, Pin, PinOff, Zap, AlertTriangle } from 'lucide-react'
import CheckHinweisModal from './CheckHinweisModal'
import Tooltip from './Tooltip'
import { ENV_COLORS, ENV_COLORS_DARK } from '../data/scenes'
import { api, peekCache } from '../api/client'
import { PanelModeContext, useAppSettings, useUserPrefs, useTweaks, useFocus, useToast } from '../contexts'
import { useTerminologie } from '../sw-ui'
import { getShortcutLabel } from '../shortcuts'

interface SceneEditorProps {
  szeneId: number | string
  stageId: number | null // naming legacy: enthält tatsächlich die werkstufe_id (UUID) aus dem neuen Modell
  produktionId?: string | null
  folgeNummer?: number | null
  panelMode?: 'both' | 'treatment' | 'script'
  useDokumentSzenen?: boolean
  compact?: boolean
  werkstufId?: string | null
  werkstufTyp?: string | null
  sceneIdentityId?: string | null
  onSzeneUpdated?: (updated: any) => void
  onNavigatePrev?: () => void
  onNavigateNext?: () => void
  onMarkCommentsRead?: (szeneId: number) => void
  onCharsChange?: (chars: { name: string }[]) => void
  /** Wenn Editor einen Charakter via AC einfügt → automatisch in Szenenkopf aufnehmen */
  addCharTrigger?: { name: string; characterId: string | null; suffix: string | null; key: number } | null
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


export default function SceneEditor({ szeneId, stageId, produktionId, folgeNummer, panelMode: panelModeProp, useDokumentSzenen, compact: compactProp, werkstufId, werkstufTyp, sceneIdentityId, onSzeneUpdated, onNavigatePrev, onNavigateNext, onMarkCommentsRead, onCharsChange, addCharTrigger }: SceneEditorProps) {
  const { panelMode: panelModeCtx } = useContext(PanelModeContext)
  const panelMode = panelModeProp ?? panelModeCtx
  const { treatmentLabel } = useAppSettings()
  const { scrollNavDelay } = useUserPrefs()
  const { tweaks } = useTweaks()
  const { focus, setHoverOpen } = useFocus()
  const { showToast } = useToast()
  const { t } = useTerminologie()
  const spieltagAbbr = t('spieltag') === 'Spieltag' ? 'SP' : 'DT'
  const compact = compactProp ?? tweaks.sceneHeaderCompact
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform)
  const layout = tweaks.keyboardLayout ?? 'qwertz'

  // Focus-mode: pin, drag, resize
  const [focusPinned, setFocusPinned] = useState(false)
  const [focusDragPos, setFocusDragPos] = useState<{ x: number; y: number } | null>(null)
  const [focusWidth, setFocusWidth] = useState<number | null>(null)
  const focusDragRef = useRef<{ dragging: boolean; offsetX: number; offsetY: number }>({ dragging: false, offsetX: 0, offsetY: 0 })
  const detailRef = useRef<HTMLDivElement | null>(null)

  // Reset drag/resize/pin state when leaving focus mode
  useEffect(() => {
    if (!focus) { setFocusPinned(false); setFocusDragPos(null); setFocusWidth(null) }
  }, [focus])

  const handleFocusDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const el = detailRef.current
    const startPos = focusDragPos ?? (el ? { x: el.getBoundingClientRect().left, y: el.getBoundingClientRect().top } : { x: window.innerWidth / 2 - 300, y: 8 })
    focusDragRef.current = { dragging: true, offsetX: e.clientX - startPos.x, offsetY: e.clientY - startPos.y }
    const onMove = (ev: MouseEvent) => {
      if (!focusDragRef.current.dragging) return
      setFocusDragPos({ x: ev.clientX - focusDragRef.current.offsetX, y: ev.clientY - focusDragRef.current.offsetY })
    }
    const onUp = () => {
      focusDragRef.current.dragging = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [focusDragPos])

  const handleFocusResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    const startX = e.clientX
    const startW = detailRef.current?.offsetWidth ?? 500
    const onMove = (ev: MouseEvent) => setFocusWidth(Math.max(320, startW + (ev.clientX - startX)))
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [])

  const toggleFocusPin = useCallback(() => {
    setFocusPinned(p => {
      if (p) setHoverOpen(false) // unpinning → close panel
      return !p
    })
  }, [setHoverOpen])
  const [scene, setScene] = useState<any | null>(null)
  const [kommentareCount, setKommentareCount] = useState<number>(0)
  const [saving, setSaving] = useState(false)
  const [stoppzeitAutoModal, setStoppzeitAutoModal] = useState(false)
  const [stoppzeitAutoLoading, setStoppzeitAutoLoading] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [changedBlocks, setChangedBlocks] = useState<Set<number>>(new Set())
  const [revisionColor, setRevisionColor] = useState<string | null>(null)
  const [splitRatio, setSplitRatio] = useState(0.5)
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
  const [sceneStraenge, setSceneStraenge] = useState<any[]>([])
  const [allStraenge, setAllStraenge] = useState<any[]>([])
  const [strangDropdownOpen, setStrangDropdownOpen] = useState(false)
  const [wsPartner, setWsPartner] = useState<any[]>([])
  const [wsBeteiligt, setWsBeteiligt] = useState<any[]>([])
  const [allSceneIdentities, setAllSceneIdentities] = useState<any[]>([])
  const [wsDropdownOpen, setWsDropdownOpen] = useState(false)
  const [wsSearch, setWsSearch] = useState('')
  const [fbDropdownOpen, setFbDropdownOpen] = useState(false)
  const [fbSearch, setFbSearch] = useState('')
  const [allFbSzenen, setAllFbSzenen] = useState<any[]>([])
  const [stockshotTemplates, setStockshotTemplates] = useState<any[]>([])
  const [compactHover, setCompactHover] = useState(false)
  const [compactHoverPos, setCompactHoverPos] = useState<React.CSSProperties>({})
  const [compactCharDropdown, setCompactCharDropdown] = useState(false)
  const [compactCharSearch, setCompactCharSearch] = useState('')
  const [checkResults, setCheckResults] = useState<any[]>([])
  const [checkModalAnchor, setCheckModalAnchor] = useState<DOMRect | null>(null)
  const [checksRunning, setChecksRunning] = useState(false)
  const [stimmungenList, setStimmungenList] = useState<{ id: number | null; name: string; kuerzel: string; position: number }[]>([])
  const compactCharRef = useRef<HTMLDivElement | null>(null)
  const compactHoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const detailHeadRef = useRef<HTMLDivElement | null>(null)
  const wsDropdownRef = useRef<HTMLDivElement | null>(null)
  const fbDropdownRef = useRef<HTMLDivElement | null>(null)
  const strangDropdownRef = useRef<HTMLDivElement | null>(null)
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

  // Right-anchored dropdown — öffnet nach links, vermeidet Abschneiden am rechten Rand
  const getFixedDropdownStyleLeft = useCallback((ref: React.RefObject<HTMLDivElement | null>): React.CSSProperties => {
    if (!ref.current) return {}
    const rect = ref.current.getBoundingClientRect()
    const maxH = 200
    const width = 220
    const spaceBelow = window.innerHeight - rect.bottom - 8
    const openAbove = spaceBelow < maxH && rect.top > spaceBelow
    return {
      position: 'fixed',
      right: window.innerWidth - rect.right,
      width,
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

  const ieAbbr = (ie: string) => ie === 'int' ? 'I' : 'A'
  const tzAbbr = (tz: string) => {
    if (stimmungenList.length > 0) {
      const found = stimmungenList.find(s => s.name === tz)
      if (found) return found.kuerzel
    }
    return ({ TAG: 'T', NACHT: 'N', ABEND: 'A' }[tz] ?? tz.charAt(0))
  }

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
    api.getStraenge(produktionId).then(setAllStraenge).catch(() => setAllStraenge([]))
    api.getStimmungen(produktionId).then(setStimmungenList).catch(() => {})
  }, [produktionId])

  // Stimmungen bei externen Änderungen (DK-Settings) neu laden
  useEffect(() => {
    if (!produktionId) return
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.productionId === produktionId) {
        api.getStimmungen(produktionId).then(setStimmungenList).catch(() => {})
      }
    }
    window.addEventListener('stimmungen-changed', handler)
    return () => window.removeEventListener('stimmungen-changed', handler)
  }, [produktionId])

  // Load stockshot templates when sondertyp is 'stockshot'
  useEffect(() => {
    if (!produktionId || scene?.sondertyp !== 'stockshot') { setStockshotTemplates([]); return }
    api.getStockshotTemplates(produktionId).then(setStockshotTemplates).catch(() => setStockshotTemplates([]))
  }, [scene?.sondertyp, produktionId])

  // Load scene strands
  useEffect(() => {
    if (!szeneId) { setSceneStraenge([]); return }
    api.getSzeneStaenge(String(szeneId)).then(setSceneStraenge).catch(() => setSceneStraenge([]))
  }, [szeneId])

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (motivDropdownRef.current && !motivDropdownRef.current.contains(e.target as Node)) setMotivDropdownOpen(false)
      if (untermotivDropdownRef.current && !untermotivDropdownRef.current.contains(e.target as Node)) setUntermotivDropdownOpen(false)
      if (rolleDropdownRef.current && !rolleDropdownRef.current.contains(e.target as Node)) setCharDropdownRolle(false)
      if (komparseDropdownRef.current && !komparseDropdownRef.current.contains(e.target as Node)) setCharDropdownKomparse(false)
      if (strangDropdownRef.current && !strangDropdownRef.current.contains(e.target as Node)) setStrangDropdownOpen(false)
      if (wsDropdownRef.current && !wsDropdownRef.current.contains(e.target as Node)) setWsDropdownOpen(false)
      if (fbDropdownRef.current && !fbDropdownRef.current.contains(e.target as Node)) setFbDropdownOpen(false)
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
    // If szeneId is already a UUID, load it directly — no cross-werkstufe resolution needed.
    // scene_identity_ids are NOT shared between werkstufen from separate imports, so
    // resolveDokumentSzene(werkstufId, sceneIdentityId) would 404 when werkstufId differs.
    if (useDokumentSzenen && typeof szeneId === 'string') {
      return api.getDokumentSzene(szeneId)
    }
    // Fallback: resolve by werkstuf+scene_identity (legacy / cross-werkstufe mirror view)
    if (werkstufId && sceneIdentityId) {
      return api.resolveDokumentSzene(werkstufId, sceneIdentityId)
        .catch(e => {
          if (e.message?.includes('nicht') || e.message?.includes('404')) return null
          throw e
        })
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

  const cycleTageszeit = useCallback(async () => {
    const defaultOrder = ['TAG', 'NACHT', 'ABEND']
    const order = stimmungenList.length > 0
      ? stimmungenList.slice().sort((a, b) => a.position - b.position).map(s => s.name)
      : defaultOrder
    const lastInOrder = order[order.length - 1]
    const prev = scene?.tageszeit ?? order[0]
    const idx = order.indexOf(prev)
    const next = order[(idx + 1) % order.length]
    try {
      const updated = await saveScene({ tageszeit: next })
      setScene(updated); onSzeneUpdated?.(updated)
      if (tweaks.autoStimmungPropagation && scene?.id) {
        const isNewDay = prev === lastInOrder && next !== lastInOrder
        const result = await api.bulkTageszeitPropagate(scene.id, { tageszeit: next, increment_spieltag: isNewDay })
        if (result.updated_count > 0) {
          showToast(`Stimmung: ${result.updated_count} folgende Szene${result.updated_count > 1 ? 'n' : ''} auf ${next} gesetzt`, 'info')
        }
      }
    } catch {}
  }, [scene, tweaks.autoStimmungPropagation, saveScene, onSzeneUpdated, showToast])

  // Autoren-Stoppzeit: Auto-Berechnung (einzelne Szene oder ganze Folge)
  const handleStoppzeitAuto = useCallback(async (scope: 'scene' | 'folge') => {
    setStoppzeitAutoLoading(true)
    setStoppzeitAutoModal(false)
    try {
      if (scope === 'folge' && werkstufId) {
        await api.stoppzeitAutoFolge(werkstufId)
        // Reload current scene to reflect new value
        const updated = await loadScene()
        if (updated) { setScene(updated); onSzeneUpdated?.(updated) }
      } else {
        const resolvedId = scene?.id
        if (!resolvedId) return
        const updated = await api.stoppzeitAuto(resolvedId)
        if (updated) { setScene(updated); onSzeneUpdated?.(updated) }
      }
    } catch (err: any) {
      showToast(err?.message || 'Stoppzeit-Berechnung fehlgeschlagen', 'error')
    } finally { setStoppzeitAutoLoading(false) }
  }, [scene, werkstufId, loadScene, onSzeneUpdated])

  // Load scene when szeneId changes
  useEffect(() => {
    // If the scene was preloaded, show it immediately without a loading spinner.
    const cacheKey = typeof szeneId === 'string' ? `/dokument-szenen/${szeneId}` : null
    const cached = cacheKey ? peekCache<any>(cacheKey) : null
    if (cached) {
      setScene(cached)
      setError(null)
      setLoading(false)
    } else {
      setLoading(true)
      setError(null)
    }
    loadScene()
      .then(data => {
        setScene(data)
        // For new system: load characters, vorstopp, revisions via scene_identity_id / dokument_szene_id
        if (useDokumentSzenen && typeof szeneId === 'string') {
          if (data?.scene_identity_id) {
            api.getSceneIdentityCharacters(data.scene_identity_id)
              .then(chars => setSceneChars(Array.isArray(chars) ? chars : []))
              .catch(() => setSceneChars([]))
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
          // Sondertyp: load wechselschnitt partner + beteiligt
          if (data?.id) {
            api.getWechselschnittPartner(data.id).then(setWsPartner).catch(() => setWsPartner([]))
          }
          if (data?.id) {
            api.getWechselschnittBeteiligt(data.id).then(setWsBeteiligt).catch(() => setWsBeteiligt([]))
          }
          // Drehbuch-Checks: load persisted results
          if (data?.id) {
            api.getCheckResults(data.id).then(setCheckResults).catch(() => setCheckResults([]))
          }
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

      // Load scene characters
      setSceneChars([])
      api.getSceneCharacters(szeneId)
        .then(data => setSceneChars(Array.isArray(data) ? data : []))
        .catch(() => setSceneChars([]))
    } else {
      setKommentareCount(0)
    }
  }, [szeneId, stageId])

  // Measure Spielzeit column position to align Sondertyp selector beneath it
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
        // Drehbuch-Checks: after autosave, run auto-checks in background
        if (saved?.id) {
          api.runChecksAuto(saved.id).then(res => {
            setCheckResults(res.results ?? [])
            window.dispatchEvent(new CustomEvent('sz-checks-updated', {
              detail: { szeneId: saved.id, count: res.issues ?? 0 }
            }))
          }).catch(() => {})
        }
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

  // Notify parent when scene characters change (for editor autocomplete)
  useEffect(() => {
    onCharsChange?.(sceneChars)
  }, [sceneChars]) // eslint-disable-line react-hooks/exhaustive-deps

  // Charakter aus Editor → automatisch in Szenenkopf aufnehmen
  useEffect(() => {
    if (!addCharTrigger || !scene?.scene_identity_id) return
    const { name, characterId, suffix } = addCharTrigger

    // Figur in allCharacters suchen (nach ID oder Name)
    const char = characterId
      ? (allCharacters.find((c: any) => String(c.id) === String(characterId)) ?? { id: characterId, name, kategorie_typ: 'rolle' })
      : allCharacters.find((c: any) => c.name.toUpperCase() === name.toUpperCase())
    if (!char) return

    // Bereits im Szenenkopf? Überspringen
    if (sceneChars.some((c: any) => String(c.character_id) === String(char.id))) return

    // Suffix-Logik:
    // OFF → nicht in Rollen, Notiz "Name im Off"
    // NT → nicht in Rollen, Notiz "NT Name"
    // VO → IN Rollen (Figur ist sichtbar), ZUSÄTZLICH Notiz "NT Name (VO)"
    // ONE-WAY → in Rollen (sichtbare Figur); Notiz-Text für den Partner wird separat im ONE-WAY-Dialog gesetzt
    const goesInNotiz = suffix === '(OFF)' || suffix === '(NT)' || suffix === '(VO)'
    const goesInRollen = suffix !== '(OFF)' && suffix !== '(NT)'

    if (goesInNotiz) {
      const notizEntry = suffix === '(NT)'
        ? `NT ${name}`
        : suffix === '(VO)'
          ? `NT ${name} (VO)`
          : `${name} im Off`
      const currentNotiz = scene.notiz ? scene.notiz.trim() : ''
      if (!currentNotiz.includes(notizEntry)) {
        const newNotiz = currentNotiz ? `${currentNotiz}\n${notizEntry}` : notizEntry
        saveScene({ notiz: newNotiz }).then((s: any) => { if (s) setScene(s) }).catch(() => {})
      }
    }

    if (goesInRollen) {
      // Normal oder VO: Figur in Rollen aufnehmen
      if (!sceneChars.some((c: any) => String(c.character_id) === String(char.id))) {
        const katId = char.kategorie_typ === 'komparse' ? komparseKatId : rolleKatId
        handleAddCharacter(char, katId)
      }
    }
  }, [addCharTrigger?.key]) // eslint-disable-line react-hooks/exhaustive-deps

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
        {error ?? `${t('szene')} nicht gefunden`}
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
  const isNotiz = scene.format === 'notiz'

  // Inline style overrides for focus-mode drag/resize
  const focusStyle = focus && (focusDragPos || focusWidth) ? {
    ...(focusDragPos ? { left: focusDragPos.x, top: focusDragPos.y } : {}),
    ...(focusWidth ? { width: focusWidth } : {}),
  } : undefined

  // Fokus-Modus Zeile 1b: Spielzeit + I/A+SP als wiederverwendbare JSX-Variablen
  // (werden in Zeile 1 normal ODER in Zeile 1b Fokus-Modus gerendert — nie beides gleichzeitig)
  const spielzeitCell = (
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
  )
  const iaSpCell = (
    <span className="ie-group">
      <Tooltip text={scene.int_ext === 'int' ? 'Innen — klicken für Außen' : 'Außen — klicken für Innen'} placement="bottom">
        <span className="ie-toggle" onClick={cycleIntExt}>{ieAbbr(scene.int_ext ?? 'int')}</span>
      </Tooltip>
      <span className="ie-sep">/</span>
      <Tooltip text={`Tageszeit: ${scene.tageszeit ?? 'TAG'} — klicken zum Wechseln`} placement="bottom">
        <span className="ie-toggle" onClick={cycleTageszeit}>{tzAbbr(scene.tageszeit ?? 'TAG')}</span>
      </Tooltip>
      <span className="ie-sep">·</span>
      <Tooltip text={`${t('spieltag')} (${spieltagAbbr}): Erzähltag der Geschichte\n1 = erster Tag der Handlung${tweaks.autoStimmungPropagation ? '\nBei NACHT→TAG: alle folgenden Szenen werden automatisch aktualisiert' : ''}\nManuell überschreibbar`} placement="bottom">
        <span className="ie-field-wrap">
          <span className="ie-lbl">{spieltagAbbr}</span>
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
  )

  return (
    <div
      ref={detailRef}
      className="detail"
      style={focusStyle}
      onMouseEnter={() => { if (focus) setHoverOpen(true) }}
      onMouseLeave={() => { if (focus && !focusPinned) setHoverOpen(false) }}
      onTouchStart={() => { if (focus) setHoverOpen(v => !v) }}
    >
      {/* Focus mode drag header */}
      {focus && (
        <div
          onMouseDown={handleFocusDragStart}
          style={{
            display: 'flex', alignItems: 'center', padding: '4px 8px 4px 10px',
            borderBottom: '1px solid var(--border)', cursor: 'grab', userSelect: 'none',
            flexShrink: 0, background: 'var(--bg-surface)',
          }}
        >
          <span style={{ flex: 1, fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Szenenkopf</span>
          <Tooltip text={focusPinned ? 'Lösen — schließt bei Mausverlassen' : 'Anheften — bleibt geöffnet'}>
            <button
              onClick={(e) => { e.stopPropagation(); toggleFocusPin() }}
              onMouseDown={(e) => e.stopPropagation()}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', display: 'flex', alignItems: 'center', color: focusPinned ? 'var(--sw-green)' : 'var(--text-muted)', lineHeight: 1 }}
            >
              {focusPinned ? <Pin size={12} /> : <PinOff size={12} />}
            </button>
          </Tooltip>
        </div>
      )}
      {/* Focus mode right-edge resize handle — z-index über allem Inhalt damit volle Höhe anklickbar */}
      {focus && (
        <div
          onMouseDown={handleFocusResizeStart}
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 6, cursor: 'ew-resize', zIndex: 20 }}
        />
      )}
      {/* Lean header — alles inline, kein Kasten */}
      {!isNotiz && <div
        className="detail-head"
        ref={detailHeadRef}
        style={{ borderLeft: 'none', borderBottom: 'none' }}
        onMouseEnter={() => {
          if (!compact) return
          if (compactHoverTimer.current) clearTimeout(compactHoverTimer.current)
          compactHoverTimer.current = setTimeout(() => {
            if (detailHeadRef.current) {
              const rect = detailHeadRef.current.getBoundingClientRect()
              setCompactHoverPos({ position: 'fixed', left: rect.left, top: rect.bottom + 2, width: rect.width, zIndex: 99999 })
            }
            setCompactHover(true)
          }, 400)
        }}
        onMouseLeave={() => {
          if (compactHoverTimer.current) clearTimeout(compactHoverTimer.current)
          setCompactHover(false)
        }}
      >

        {/* Non-compact: HTML table for guaranteed column alignment */}
        {!compact && (
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <tbody>
              <tr style={{ verticalAlign: 'baseline' }}>
                {/* Col 1: SZ-Nummer + Check-Warnung */}
                <td style={{ width: 88, paddingRight: 8, whiteSpace: 'nowrap', paddingBottom: 4, overflow: 'hidden', verticalAlign: 'top' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                    <span className="sz-group"><span className="scene-big">SZ{scene.scene_nummer != null ? String(scene.scene_nummer).padStart(2, '0') : ''}</span></span>
                    {checkResults.length > 0 && (
                      <button
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '1px 0', color: '#FF9500', display: 'flex', alignItems: 'center', gap: 4, lineHeight: 1 }}
                        onClick={e => setCheckModalAnchor((e.currentTarget as HTMLElement).getBoundingClientRect())}
                        onMouseEnter={e => { if (!checkModalAnchor) setCheckModalAnchor((e.currentTarget as HTMLElement).getBoundingClientRect()) }}
                      >
                        <AlertTriangle size={24} fill="rgba(255,204,0,0.22)" strokeWidth={1.6} />
                        <span style={{ fontSize: 11, fontWeight: 700 }}>{checkResults.length}</span>
                      </button>
                    )}
                  </div>
                </td>
                {/* Col 2: Stoppzeit */}
                <td style={{ width: 82, paddingRight: 8, whiteSpace: 'nowrap', paddingBottom: 4, overflow: 'hidden' }}>
                  <div className="stopp-col">
                    <Tooltip
                      text={scene.page_length != null && scene.page_length > 0
                        ? `Stoppzeit (mm:ss)\n${Math.floor(scene.page_length / 8)}${scene.page_length % 8 ? ' ' + (scene.page_length % 8) + '/8' : ''} Seite(n)`
                        : 'Stoppzeit (mm:ss)'}
                      placement="bottom"
                    >
                      <input
                        key={`stopp-${scene?.id}`}
                        className="spielzeit-inp stopp-inp"
                        defaultValue={scene.stoppzeit_sek != null ? `${Math.floor(scene.stoppzeit_sek / 60)}:${String(scene.stoppzeit_sek % 60).padStart(2, '0')}` : ''}
                        placeholder="0:00"
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
                    </Tooltip>
                    {werkstufTyp === 'drehbuch' && useDokumentSzenen && (
                      <Tooltip
                        text={`Stoppzeit automatisch berechnen\n${getShortcutLabel('vorstoppAuto', layout, isMac)}: Ganze Folge\nKlick: Nur diese Szene`}
                        placement="bottom"
                      >
                        <button
                          className="stopp-auto-btn"
                          disabled={stoppzeitAutoLoading}
                          onClick={e => {
                            if (e.altKey) { e.preventDefault(); setStoppzeitAutoModal(true) }
                            else handleStoppzeitAuto('scene')
                          }}
                          style={{ cursor: stoppzeitAutoLoading ? 'wait' : 'pointer', opacity: stoppzeitAutoLoading ? 0.5 : 1 }}
                        >
                          <Zap size={10} />
                        </button>
                      </Tooltip>
                    )}
                  </div>
                </td>
                {/* Col 3: Motiv — im Fokus-Modus colSpan=3 (cols 3-5), sonst nur col 3 */}
                <td colSpan={focus ? 3 : 1} style={{ paddingRight: 8, paddingBottom: 4, overflow: 'hidden', minWidth: 0 }}>
                  <div className="sf-motiv-group" style={{ display: 'flex', gap: 4, minWidth: 0, alignItems: 'center' }}>
                    <div className="sf-motiv-wrap" ref={motivDropdownRef}>
                      <input
                        className="sf-motiv sf-motiv-input"
                        value={motivDropdownOpen ? motivSearch : ((() => {
                          const curMotiv = allMotive.find(m => m.id === scene.motiv_id)
                          const parent = curMotiv?.parent_id ? allMotive.find(m => m.id === curMotiv.parent_id) : curMotiv
                          return parent ? motivDisplayLabel(parent) : (scene.ort_name ?? '')
                        })())}
                        placeholder={`${t('motiv')}…`}
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
                            <div className="sf-dropdown-empty">Kein {t('motiv')} gefunden</div>
                          )}
                        </div>
                      )}
                    </div>
                    {scene.sondertyp === 'flashback' && scene.flashback_ganze_szene && (
                      <span style={{ fontSize: 10, color: '#AF52DE', fontWeight: 600, flexShrink: 0, paddingLeft: 2 }}>(Flashback)</span>
                    )}
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
                </td>
                {/* Col 4: Spielzeit — nur im Normalmodus; im Fokus-Modus → Zeile 1b */}
                {!focus && (
                  <td style={{ width: 198, paddingRight: 8, whiteSpace: 'nowrap', paddingBottom: 4 }}>
                    {spielzeitCell}
                  </td>
                )}
                {/* Col 5: I/A + SP — nur im Normalmodus; im Fokus-Modus → Zeile 1b */}
                {!focus && (
                  <td style={{ width: 100, paddingRight: 8, whiteSpace: 'nowrap', paddingBottom: 4, overflow: 'hidden' }}>
                    {iaSpCell}
                  </td>
                )}
                {/* Col 6: Save indicator + Annotations */}
                <td style={{ width: 50, whiteSpace: 'nowrap', paddingBottom: 4, overflow: 'hidden' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                    {saving && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>…</span>}
                    {saveMsg && !saving && <span style={{ fontSize: 10, color: saveMsg === 'Gespeichert' ? 'var(--sw-green)' : 'var(--sw-danger)' }}>{saveMsg === 'Gespeichert' ? '✓' : '!'}</span>}
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
                  </span>
                </td>
              </tr>
              {/* Zeile 1b — nur im Fokus-Modus: Spielzeit + I/A+SP unter dem Motiv */}
              {focus && (
                <tr style={{ verticalAlign: 'baseline' }}>
                  <td colSpan={2} style={{ padding: 0 }} />
                  {/* Spielzeit — unter Col 3 (Motiv) */}
                  <td style={{ paddingRight: 8, paddingBottom: 4 }}>
                    {spielzeitCell}
                  </td>
                  {/* I/A + SP — unter Cols 4-5 */}
                  <td colSpan={2} style={{ paddingRight: 8, paddingBottom: 4 }}>
                    {iaSpCell}
                  </td>
                  <td style={{ padding: 0 }} />
                </tr>
              )}
            </tbody>
            {/* Field rows — key resets uncontrolled inputs on scene change */}
            <tbody key={szeneId}>
              {/* Zeile A: Oneliner | Sondertyp cycle-click */}
              <tr style={{ verticalAlign: 'baseline' }}>
                <td colSpan={2} style={{ padding: 0 }} />
                <td style={{ paddingRight: 8, paddingBottom: 2 }}>
                  <input
                    key={`zf-${scene?.id}`}
                    className="sf-input"
                    style={{ width: '100%' }}
                    defaultValue={scene.zusammenfassung ?? ''}
                    placeholder="Oneliner…"
                    onBlur={e => {
                      const val = e.target.value.trim() || null
                      if (val !== (scene.zusammenfassung ?? null))
                        saveScene({ zusammenfassung: val }).then(s => { setScene(s); onSzeneUpdated?.(s) }).catch(() => {})
                    }}
                  />
                </td>
                <td colSpan={3} style={{ paddingRight: 8, paddingBottom: 2, textAlign: 'left' }}>
                  {(() => {
                    const cycleNext = scene.sondertyp === 'wechselschnitt' ? 'flashback' : scene.sondertyp === 'flashback' ? 'stockshot' : scene.sondertyp === 'stockshot' ? null : 'wechselschnitt'
                    const activeColor = scene.sondertyp === 'wechselschnitt' ? '#007AFF' : scene.sondertyp === 'flashback' ? '#AF52DE' : scene.sondertyp === 'stockshot' ? '#FF9500' : undefined
                    const activeLabel = scene.sondertyp === 'wechselschnitt' ? 'Wechselschnitt' : scene.sondertyp === 'flashback' ? t('flashback') : scene.sondertyp === 'stockshot' ? t('stockshot') : null
                    const nextLabel = cycleNext === 'wechselschnitt' ? 'Wechselschnitt' : cycleNext === 'flashback' ? t('flashback') : cycleNext === 'stockshot' ? t('stockshot') : null
                    const tip = scene.sondertyp ? (nextLabel ? `→ ${nextLabel}` : 'Sondertyp entfernen') : 'Wechselschnitt · Flashback · Stockshot'
                    return (
                      <Tooltip text={tip} placement="bottom">
                        <span
                          style={{ fontSize: 11, fontWeight: scene.sondertyp ? 600 : 400, color: activeColor ?? 'var(--text-muted)', cursor: 'pointer', userSelect: 'none' }}
                          onClick={() => saveScene({ sondertyp: cycleNext ?? '__null__' }).then(s => { setScene(s); onSzeneUpdated?.(s) }).catch(() => {})}
                        >
                          {activeLabel ?? 'Sondertyp'}
                        </span>
                      </Tooltip>
                    )
                  })()}
                </td>
              </tr>
              {/* Zeile B: R· Rollen | Sondertyp-Details */}
              <tr style={{ verticalAlign: 'top' }}>
                <td colSpan={2} style={{ padding: 0 }} />
                <td style={{ paddingRight: 8, paddingBottom: 2 }}>
                  <div className="sf-row sf-chars">
                    <span className="sf-tag">R·</span>
                    <span className="sf-charlist">
                      {sceneChars.filter((c: any) => c.kategorie_typ === 'rolle').map((c: any) => (
                        <span key={c.character_id} className="sf-char-chip">{c.name}<button className="sf-char-remove" title="Entfernen" onClick={() => handleRemoveCharacter(c.character_id)}><X size={9} /></button></span>
                      ))}
                      <span className="sf-char-add-wrap" ref={rolleDropdownRef}>
                        <input className="sf-char-search" value={charSearchRolle} placeholder="+" onChange={e => { setCharSearchRolle(e.target.value); setCharDropdownRolle(true) }} onFocus={() => setCharDropdownRolle(true)} style={{ width: charSearchRolle ? 100 : 20 }} />
                        {charDropdownRolle && (
                          <div className="sf-dropdown sf-dropdown-fixed" style={getFixedDropdownStyle(rolleDropdownRef)}>
                            {rolleCharacters.filter(ch => !sceneChars.some(sc => sc.character_id === ch.id)).filter(ch => !charSearchRolle || ch.name.toLowerCase().includes(charSearchRolle.toLowerCase())).slice(0, 15).map(ch => (
                              <div key={ch.id} className="sf-dropdown-item" onMouseDown={e => { e.preventDefault(); handleAddCharacter(ch, rolleKatId); setCharSearchRolle(''); setCharDropdownRolle(false) }}>{ch.name}</div>
                            ))}
                            {rolleCharacters.filter(ch => !sceneChars.some(sc => sc.character_id === ch.id)).filter(ch => !charSearchRolle || ch.name.toLowerCase().includes(charSearchRolle.toLowerCase())).length === 0 && (
                              <div className="sf-dropdown-empty">Keine Rollen verfügbar</div>
                            )}
                          </div>
                        )}
                      </span>
                    </span>
                  </div>
                </td>
                <td colSpan={3} style={{ paddingRight: 8, paddingBottom: 2, textAlign: 'left' }}>
                  {/* WS: Spezifikation + Partner-Chips + Picker */}
                  {scene.sondertyp === 'wechselschnitt' && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                      <select className="sf-input" value={scene.ws_spezifikation ?? ''} style={{ width: 'auto', maxWidth: 120, fontSize: 11, margin: 0 }} onChange={e => { const val = e.target.value || null; saveScene({ ws_spezifikation: val ?? '__null__' }).then(s => { setScene(s); onSzeneUpdated?.(s) }).catch(() => {}) }}>
                        <option value="">Spez…</option>
                        <option value="standard">Standard</option>
                        <option value="splitscreen">Splitscreen</option>
                        <option value="telefonat">2W Telefonat</option>
                      </select>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>Partner:</span>
                      {wsPartner.map((p: any) => (
                        <span key={p.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: '#007AFF18', border: '1px solid #007AFF44', borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 700, color: '#007AFF' }}>
                          ⇄ Sz.{p.partner_scene_nummer ?? '?'}
                          <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, color: '#007AFF', fontSize: 10 }} onClick={() => { const next = wsPartner.filter((pp: any) => pp.id !== p.id); api.setWechselschnittPartner(scene.id, next.map((pp: any, i: number) => ({ partner_identity_id: pp.partner_identity_id, position: i }))).then(setWsPartner).catch(() => {}) }}>×</button>
                        </span>
                      ))}
                      <span className="sf-char-add-wrap" ref={wsDropdownRef}>
                        <Tooltip text="Partner-Szene verknüpfen (Wechselschnitt)" placement="bottom">
                          <button className="sf-char-search" style={{ width: 20, border: 'none', background: 'none', cursor: 'pointer', padding: 0, fontSize: 12, color: 'var(--text-muted)' }}
                            onClick={() => { if (allSceneIdentities.length === 0 && werkstufId) { api.getWerkstufenSzenen(werkstufId).then(scenes => { setAllSceneIdentities(scenes); setWsDropdownOpen(true) }).catch(() => setWsDropdownOpen(true)) } else { setWsDropdownOpen(v => !v) } }}>+</button>
                        </Tooltip>
                        {wsDropdownOpen && (
                          <div className="sf-dropdown sf-dropdown-fixed" style={getFixedDropdownStyleLeft(wsDropdownRef)}>
                            <input className="sf-dropdown-search" autoFocus placeholder="Sz-Nr. oder Motiv…" value={wsSearch} onChange={e => setWsSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') setWsDropdownOpen(false) }} style={{ margin: '4px 8px', width: 'calc(100% - 16px)', fontSize: 11 }} />
                            {allSceneIdentities.filter(s => s.scene_identity_id !== scene.scene_identity_id).filter(s => !wsPartner.some((pp: any) => pp.partner_identity_id === s.scene_identity_id)).filter(s => { if (!wsSearch.trim()) return true; const q = wsSearch.toLowerCase(); return String(s.scene_nummer ?? '').includes(q) || (s.ort_name ?? '').toLowerCase().includes(q) }).map(s => (
                              <div key={s.id} className="sf-dropdown-item" onMouseDown={e => { e.preventDefault(); const next = [...wsPartner.map((pp: any, i: number) => ({ partner_identity_id: pp.partner_identity_id, position: i })), { partner_identity_id: s.scene_identity_id, position: wsPartner.length }]; api.setWechselschnittPartner(scene.id, next).then(updated => { setWsPartner(updated); setWsDropdownOpen(false); setWsSearch('') }).catch(() => {}) }}>
                                <span style={{ fontWeight: 700, marginRight: 6, color: '#007AFF', fontSize: 12 }}>Sz.{s.scene_nummer ?? '?'}</span>
                                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{[s.int_ext?.toUpperCase(), s.ort_name, s.tageszeit].filter(Boolean).join(' · ')}</span>
                              </div>
                            ))}
                            {allSceneIdentities.filter(s => s.scene_identity_id !== scene.scene_identity_id).filter(s => !wsPartner.some((pp: any) => pp.partner_identity_id === s.scene_identity_id)).filter(s => { if (!wsSearch.trim()) return true; const q = wsSearch.toLowerCase(); return String(s.scene_nummer ?? '').includes(q) || (s.ort_name ?? '').toLowerCase().includes(q) }).length === 0 && (
                              <div className="sf-dropdown-empty">Keine Szenen verfügbar</div>
                            )}
                          </div>
                        )}
                      </span>
                    </span>
                  )}
                  {/* FB: Referenz-Picker + Ganze-Szene */}
                  {scene.sondertyp === 'flashback' && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        {scene.flashback_referenz_werkstufe_id ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: '#AF52DE18', border: '1px solid #AF52DE44', borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 600, color: '#AF52DE' }}>
                            <span>F{scene.flashback_referenz_folge_nummer ?? '?'} · Sz.{scene.flashback_referenz_scene_nummer ?? '?'}</span>
                            {scene.flashback_referenz_ort_name && <span style={{ fontWeight: 400, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>({scene.flashback_referenz_ort_name})</span>}
                            <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, color: '#AF52DE', fontSize: 10 }}
                              onClick={() => { saveScene({ flashback_referenz_id: null, flashback_referenz_werkstufe_id: null }).then(s => { setScene(s); onSzeneUpdated?.(s) }).catch(() => {}) }}>×</button>
                          </span>
                        ) : scene.flashback_referenz_freitext ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: '#AF52DE0D', border: '1px solid #AF52DE33', borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 500, color: '#AF52DE', fontStyle: 'italic' }}>
                            {scene.flashback_referenz_freitext}
                            <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, color: '#AF52DE', fontSize: 10 }}
                              onClick={() => { saveScene({ flashback_referenz_freitext: null }).then(s => { setScene(s); onSzeneUpdated?.(s) }).catch(() => {}) }}>×</button>
                          </span>
                        ) : null}
                        <span className="sf-char-add-wrap" ref={fbDropdownRef}>
                          <Tooltip text={"Referenzszene verknüpfen.\nNoch nicht erfasste Szenen: als Freitext eingeben (Enter)."} placement="bottom">
                            <button className="sf-char-search" style={{ width: 20, border: 'none', background: 'none', cursor: 'pointer', padding: 0, fontSize: 12, color: 'var(--text-muted)' }}
                              onClick={() => { if (werkstufId) { api.getFlashbackReferenzSzenen(werkstufId, fbSearch || undefined).then(r => { setAllFbSzenen(r); setFbDropdownOpen(true) }).catch(() => setFbDropdownOpen(true)) } else { setFbDropdownOpen(v => !v) } }}>+</button>
                          </Tooltip>
                          {fbDropdownOpen && (
                            <div className="sf-dropdown sf-dropdown-fixed" style={getFixedDropdownStyleLeft(fbDropdownRef)}>
                              <input className="sf-dropdown-search" autoFocus placeholder="Folge oder Motiv…" value={fbSearch}
                                onChange={e => { setFbSearch(e.target.value); if (werkstufId) api.getFlashbackReferenzSzenen(werkstufId, e.target.value || undefined).then(setAllFbSzenen).catch(() => {}) }}
                                onKeyDown={e => { if (e.key === 'Escape') { setFbDropdownOpen(false) } else if (e.key === 'Enter' && fbSearch.trim()) { e.preventDefault(); saveScene({ flashback_referenz_id: null, flashback_referenz_werkstufe_id: null, flashback_referenz_freitext: fbSearch.trim() }).then(u => { setScene(u); onSzeneUpdated?.(u); setFbDropdownOpen(false); setFbSearch('') }).catch(() => {}) } }}
                                style={{ margin: '4px 8px', width: 'calc(100% - 16px)', fontSize: 11 }} />
                              {allFbSzenen.map(s => (
                                <div key={s.id} className="sf-dropdown-item" onMouseDown={e => { e.preventDefault(); saveScene({ flashback_referenz_id: s.scene_identity_id, flashback_referenz_werkstufe_id: s.werkstufe_id, flashback_referenz_freitext: null }).then(u => { setScene(u); onSzeneUpdated?.(u); setFbDropdownOpen(false); setFbSearch('') }).catch(() => {}) }}>
                                  <span style={{ fontWeight: 600, marginRight: 4, color: '#AF52DE', flexShrink: 0 }}>F{s.folge_nummer}</span>
                                  <span style={{ fontWeight: 600, marginRight: 6 }}>Sz.{s.scene_nummer ?? '?'}</span>
                                  <span style={{ fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[s.int_ext, s.ort_name, s.tageszeit].filter(Boolean).join(' · ')}</span>
                                </div>
                              ))}
                              {fbSearch.trim() && (
                                <div className="sf-dropdown-item" style={{ borderTop: allFbSzenen.length > 0 ? '1px solid var(--border)' : undefined, fontStyle: 'italic', color: '#AF52DE', gap: 6 }}
                                  onMouseDown={e => { e.preventDefault(); saveScene({ flashback_referenz_id: null, flashback_referenz_werkstufe_id: null, flashback_referenz_freitext: fbSearch.trim() }).then(u => { setScene(u); onSzeneUpdated?.(u); setFbDropdownOpen(false); setFbSearch('') }).catch(() => {}) }}>
                                  <span style={{ flexShrink: 0 }}>↩</span><span>„{fbSearch.trim()}" als Freitext</span>
                                </div>
                              )}
                              {allFbSzenen.length === 0 && !fbSearch.trim() && <div className="sf-dropdown-empty">Keine Szenen in anderen Folgen</div>}
                            </div>
                          )}
                        </span>
                      </span>
                      <Tooltip text={"Gesamte Szene ist Flashback.\nIn der Motivzeile erscheint '(Flashback)'."} placement="bottom">
                        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, cursor: 'pointer', color: scene.flashback_ganze_szene ? '#AF52DE' : 'var(--text-muted)' }}>
                          <input type="checkbox" checked={scene.flashback_ganze_szene ?? false} onChange={e => { saveScene({ flashback_ganze_szene: e.target.checked }).then(s => { setScene(s); onSzeneUpdated?.(s) }).catch(() => {}) }} style={{ accentColor: '#AF52DE' }} />
                          Ganze Szene
                        </label>
                      </Tooltip>
                    </span>
                  )}
                  {/* Stockshot: Kategorie + Neu drehen + Template */}
                  {scene.sondertyp === 'stockshot' && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <select className="sf-input" value={scene.stockshot_kategorie ?? ''} style={{ width: 'auto', maxWidth: 150, fontSize: 11, margin: 0 }} onChange={e => { const val = e.target.value || null; saveScene({ stockshot_kategorie: val || '__null__' }).then(s => { setScene(s); onSzeneUpdated?.(s) }).catch(() => {}) }}>
                        <option value="">Kategorie…</option>
                        <option value="ortswechsel">Ortswechsel</option>
                        <option value="zeit_vergeht">Zeit vergeht</option>
                        <option value="stimmungswechsel">Stimmungswechsel</option>
                      </select>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: scene.stockshot_neu_drehen ? '#FF3B30' : 'var(--text-muted)', cursor: 'pointer' }}>
                        <input type="checkbox" checked={scene.stockshot_neu_drehen ?? false} onChange={e => { saveScene({ stockshot_neu_drehen: e.target.checked }).then(s => { setScene(s); onSzeneUpdated?.(s) }).catch(() => {}) }} style={{ accentColor: '#FF3B30' }} />
                        Neu zu drehen
                      </label>
                      {stockshotTemplates.length > 0 && (
                        <select
                          className="sf-input"
                          value=""
                          style={{ width: 'auto', maxWidth: 160, fontSize: 11, margin: 0 }}
                          onChange={async (e) => {
                            const tmpl = stockshotTemplates.find(t => String(t.id) === e.target.value)
                            if (!tmpl) return
                            try {
                              const updates: Record<string, any> = {}
                              if (tmpl.innen_aussen) updates.int_ext = tmpl.innen_aussen
                              if (tmpl.stimmung) updates.tageszeit = tmpl.stimmung
                              if (tmpl.stoppzeit_sek != null) updates.stoppzeit_sek = tmpl.stoppzeit_sek
                              if (tmpl.motiv_id) {
                                const motiv = allMotive.find((m: any) => m.id === tmpl.motiv_id)
                                if (motiv) {
                                  const parent = motiv.parent_id ? allMotive.find((m: any) => m.id === motiv.parent_id) : motiv
                                  updates.motiv_id = tmpl.motiv_id
                                  updates.ort_name = parent ? buildOrtName(parent, motiv.parent_id ? motiv : undefined) : motiv.name
                                } else {
                                  updates.motiv_id = tmpl.motiv_id
                                }
                              }
                              if (Object.keys(updates).length > 0) {
                                const updated = await saveScene(updates)
                                setScene(updated)
                                onSzeneUpdated?.(updated)
                                if (updated?.motiv_id) setSelectedMotivId(updated.motiv_id)
                              }
                              if (scene.id && useDokumentSzenen) {
                                const nodes = tmpl.bodytext
                                  ? [{ type: 'paragraph', content: [{ type: 'text', text: tmpl.bodytext }] }]
                                  : [{ type: 'paragraph' }]
                                await api.updateDokumentSzene(String(scene.id), { content: nodes })
                                window.dispatchEvent(new CustomEvent('template-content-applied', { detail: { szeneId: String(scene.id) } }))
                              }
                            } catch {}
                          }}
                        >
                          <option value="">Template…</option>
                          {stockshotTemplates.map((t: any) => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </select>
                      )}
                    </span>
                  )}
                  {/* wsBeteiligt — kein eigener Sondertyp, aber in WS involviert */}
                  {!scene.sondertyp && wsBeteiligt.length > 0 && (
                    <span style={{ fontSize: 11, color: '#007AFF', fontStyle: 'italic' }}>
                      ⇄ Wechselschnitt (Sz.{wsBeteiligt.map((b: any) => b.scene_nummer ?? '?').join(', ')})
                    </span>
                  )}
                </td>
              </tr>
              {/* Zeile C: K· Komparsen | S· Strang */}
              <tr style={{ verticalAlign: 'top' }}>
                <td colSpan={2} style={{ padding: 0 }} />
                <td style={{ paddingRight: 8, paddingBottom: 2 }}>
                  <div className="sf-row sf-chars">
                    <span className="sf-tag">K·</span>
                    <span className="sf-charlist">
                      {sceneChars.filter((c: any) => c.kategorie_typ === 'komparse').map((c: any) => (
                        <span key={c.character_id} className="sf-char-chip">{c.name}<button className="sf-char-remove" title="Entfernen" onClick={() => handleRemoveCharacter(c.character_id)}><X size={9} /></button></span>
                      ))}
                      <span className="sf-char-add-wrap" ref={komparseDropdownRef}>
                        <input className="sf-char-search" value={charSearchKomparse} placeholder="+" onChange={e => { setCharSearchKomparse(e.target.value); setCharDropdownKomparse(true) }} onFocus={() => setCharDropdownKomparse(true)} style={{ width: charSearchKomparse ? 100 : 20 }} />
                        {charDropdownKomparse && (
                          <div className="sf-dropdown sf-dropdown-fixed" style={getFixedDropdownStyle(komparseDropdownRef)}>
                            {komparseCharacters.filter(ch => !sceneChars.some(sc => sc.character_id === ch.id)).filter(ch => !charSearchKomparse || ch.name.toLowerCase().includes(charSearchKomparse.toLowerCase())).slice(0, 15).map(ch => (
                              <div key={ch.id} className="sf-dropdown-item" onMouseDown={e => { e.preventDefault(); handleAddCharacter(ch, komparseKatId); setCharSearchKomparse(''); setCharDropdownKomparse(false) }}>{ch.name}</div>
                            ))}
                            {komparseCharacters.filter(ch => !sceneChars.some(sc => sc.character_id === ch.id)).filter(ch => !charSearchKomparse || ch.name.toLowerCase().includes(charSearchKomparse.toLowerCase())).length === 0 && (
                              <div className="sf-dropdown-empty">Keine {t('komparse', 'p')} verfügbar</div>
                            )}
                          </div>
                        )}
                      </span>
                    </span>
                  </div>
                </td>
                <td colSpan={3} style={{ paddingRight: 8, paddingBottom: 2, textAlign: 'left' }}>
                  <div className="sf-row sf-chars">
                    <span className="sf-tag">S·</span>
                    <span className="sf-charlist">
                      {sceneStraenge.map((s: any) => (
                        <span key={s.strang_id} className="sf-char-chip" style={{ background: `${s.farbe || '#888'}28`, border: `1px solid ${s.farbe || '#888'}70`, color: s.farbe || '#888' }}>
                          {s.strang_name}<button className="sf-char-remove" title="Entfernen" style={{ color: s.farbe || '#888' }} onClick={() => { api.removeSzeneStrang(String(szeneId), s.strang_id).then(() => { setSceneStraenge(prev => prev.filter(x => x.strang_id !== s.strang_id)) }).catch(() => {}) }}><X size={9} /></button>
                        </span>
                      ))}
                      <span className="sf-char-add-wrap" ref={strangDropdownRef}>
                        <button className="sf-char-search" style={{ width: 20, border: 'none', background: 'none', cursor: 'pointer', padding: 0, fontSize: 12, color: 'var(--text-muted)' }} onClick={() => setStrangDropdownOpen(v => !v)}>+</button>
                        {strangDropdownOpen && (
                          <div className="sf-dropdown sf-dropdown-fixed" style={getFixedDropdownStyleLeft(strangDropdownRef)}>
                            {allStraenge.filter(st => st.status === 'aktiv').filter(st => !sceneStraenge.some(ss => ss.strang_id === st.id)).map(st => (
                              <div key={st.id} className="sf-dropdown-item" onMouseDown={e => { e.preventDefault(); api.addSzeneStrang(String(szeneId), st.id).then(() => { setSceneStraenge(prev => [...prev, { strang_id: st.id, strang_name: st.name, farbe: st.farbe }]); setStrangDropdownOpen(false) }).catch(() => {}) }}>
                                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: st.farbe, marginRight: 6 }} />{st.name}
                              </div>
                            ))}
                            {allStraenge.filter(st => st.status === 'aktiv').filter(st => !sceneStraenge.some(ss => ss.strang_id === st.id)).length === 0 && (
                              <div className="sf-dropdown-empty">Keine Stränge verfügbar</div>
                            )}
                          </div>
                        )}
                      </span>
                    </span>
                  </div>
                </td>
              </tr>
              {/* Row: Szeneninfo */}
              <tr style={{ verticalAlign: 'baseline' }}>
                <td colSpan={2} style={{ padding: 0 }} />
                <td colSpan={4} style={{ paddingRight: 8, paddingBottom: 2 }}>
                  <input key={`sinfo-${scene?.id}`} className="sf-input sf-input-info" defaultValue={scene.szeneninfo ?? ''} placeholder={`${t('szene','c')}info…`} style={{ fontSize: 11, color: '#90CAF9', fontStyle: 'italic', width: '100%' }} onBlur={e => { const val = e.target.value.trim() || null; if (val !== (scene.szeneninfo ?? null)) saveScene({ szeneninfo: val }).then(s => { setScene(s); onSzeneUpdated?.(s) }).catch(() => {}) }} />
                </td>
              </tr>
              {/* Row: Notiz */}
              <tr style={{ verticalAlign: 'baseline' }}>
                <td colSpan={2} style={{ padding: 0 }} />
                <td colSpan={4} style={{ paddingRight: 8, paddingBottom: 2 }}>
                  <textarea key={`notiz-${scene?.id}`} className="sf-input sf-notiz" defaultValue={scene.notiz ?? ''} placeholder="Notiz…" rows={2} style={{ width: '100%' }} onBlur={e => { const val = e.target.value.trim() || null; if (val !== (scene.notiz ?? null)) saveScene({ notiz: val }).then(s => { setScene(s); onSzeneUpdated?.(s) }).catch(() => {}) }} />
                </td>
              </tr>
              {/* Row: Revision badge */}
              {changedBlocks.size > 0 && revisionColor && (
                <tr>
                  <td colSpan={2} style={{ padding: 0 }} />
                  <td colSpan={4} style={{ paddingRight: 8, paddingBottom: 2 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: `${revisionColor}22`, border: `1px solid ${revisionColor}66`, color: revisionColor }}>
                        <span style={{ fontWeight: 900 }}>*</span>
                        Revision · {changedBlocks.size} geänd. {changedBlocks.size === 1 ? 'Block' : 'Blöcke'}
                      </span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {/* Compact: original grid layout */}
        {compact && (
          <div className="scene-r1 scene-r1-compact">
            <span className="sz-group"><span className="scene-big">SZ{scene.scene_nummer != null ? String(scene.scene_nummer).padStart(2, '0') : ''}</span></span>
            <div className="stopp-col">
              <Tooltip text="Stoppzeit (mm:ss)" placement="bottom">
                <input
                  key={`stopp-${scene?.id}`}
                  className="spielzeit-inp stopp-inp"
                  defaultValue={scene.stoppzeit_sek != null ? `${Math.floor(scene.stoppzeit_sek / 60)}:${String(scene.stoppzeit_sek % 60).padStart(2, '0')}` : ''}
                  placeholder="0:00"
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
              </Tooltip>
              {werkstufTyp === 'drehbuch' && useDokumentSzenen && (
                <Tooltip text={`Stoppzeit automatisch berechnen\n${getShortcutLabel('vorstoppAuto', layout, isMac)}: Ganze Folge\nKlick: Nur diese Szene`} placement="bottom">
                  <button className="stopp-auto-btn" disabled={stoppzeitAutoLoading} onClick={e => { if (e.altKey) { e.preventDefault(); setStoppzeitAutoModal(true) } else handleStoppzeitAuto('scene') }} style={{ cursor: stoppzeitAutoLoading ? 'wait' : 'pointer', opacity: stoppzeitAutoLoading ? 0.5 : 1 }}>
                    <Zap size={10} />
                  </button>
                </Tooltip>
              )}
            </div>
            <div className="sf-motiv-group sf-motiv-compact" style={{ display: 'flex', gap: 4, minWidth: 0, alignItems: 'center' }}>
              <div className="sf-motiv-wrap" ref={motivDropdownRef}>
                <input
                  className="sf-motiv sf-motiv-input"
                  value={motivDropdownOpen ? motivSearch : ((() => {
                    const curMotiv = allMotive.find(m => m.id === scene.motiv_id)
                    const parent = curMotiv?.parent_id ? allMotive.find(m => m.id === curMotiv.parent_id) : curMotiv
                    return parent ? motivDisplayLabel(parent) : (scene.ort_name ?? '')
                  })())}
                  placeholder={`${t('motiv')}…`}
                  onChange={e => { setMotivSearch(e.target.value); if (!motivDropdownOpen) setMotivDropdownOpen(true) }}
                  onFocus={() => { setMotivDropdownOpen(true); setMotivSearch('') }}
                  onBlur={() => { setTimeout(() => { if (!motivDropdownRef.current?.contains(document.activeElement)) setMotivDropdownOpen(false) }, 150) }}
                />
                {motivDropdownOpen && (
                  <div className="sf-dropdown sf-dropdown-fixed" style={getFixedDropdownStyle(motivDropdownRef)}>
                    {parentMotive.filter(m => !motivSearch || motivDisplayLabel(m).toLowerCase().includes(motivSearch.toLowerCase())).map(m => (
                      <div key={m.id} className="sf-dropdown-item" onMouseDown={e => { e.preventDefault(); handleMotivSelect(m) }}>
                        <span>{motivDisplayLabel(m)}</span>
                        {childrenOf[m.id] && <span style={{ color: 'var(--text-muted)', marginLeft: 4, fontSize: 10 }}>▸</span>}
                      </div>
                    ))}
                    {parentMotive.filter(m => !motivSearch || motivDisplayLabel(m).toLowerCase().includes(motivSearch.toLowerCase())).length === 0 && (
                      <div className="sf-dropdown-empty">Kein {t('motiv')} gefunden</div>
                    )}
                  </div>
                )}
              </div>
              {selectedMotivId && childrenOf[selectedMotivId] && childrenOf[selectedMotivId].length > 0 && (
                <>
                  <span style={{ color: 'var(--text-muted)', fontSize: 11, flexShrink: 0 }}>/</span>
                  <div className="sf-motiv-wrap" ref={untermotivDropdownRef}>
                    <input
                      className="sf-motiv sf-motiv-input sf-motiv-sub"
                      value={untermotivDropdownOpen ? untermotivSearch : ((() => { const curMotiv = allMotive.find(m => m.id === scene.motiv_id); return curMotiv?.parent_id ? curMotiv.name : '' })())}
                      placeholder="Untermotiv…"
                      onChange={e => { setUntermotivSearch(e.target.value); if (!untermotivDropdownOpen) setUntermotivDropdownOpen(true) }}
                      onFocus={() => { setUntermotivDropdownOpen(true); setUntermotivSearch('') }}
                      onBlur={() => { setTimeout(() => { if (!untermotivDropdownRef.current?.contains(document.activeElement)) setUntermotivDropdownOpen(false) }, 150) }}
                    />
                    {untermotivDropdownOpen && (
                      <div className="sf-dropdown sf-dropdown-fixed" style={getFixedDropdownStyle(untermotivDropdownRef)}>
                        <div className="sf-dropdown-item" style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}
                          onMouseDown={e => { e.preventDefault(); setUntermotivDropdownOpen(false); setUntermotivSearch(''); const parentMotiv = allMotive.find(m => m.id === selectedMotivId); if (parentMotiv) { const ortName = buildOrtName(parentMotiv); saveScene({ ort_name: ortName, motiv_id: parentMotiv.id }).then(s => { setScene(s); onSzeneUpdated?.(s) }).catch(() => {}) } }}>
                          — kein Untermotiv —
                        </div>
                        {childrenOf[selectedMotivId].filter(m => !untermotivSearch || m.name.toLowerCase().includes(untermotivSearch.toLowerCase())).map(m => (
                          <div key={m.id} className="sf-dropdown-item" onMouseDown={e => { e.preventDefault(); handleUntermotivSelect(m) }}>{m.name}</div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
              {scene.sondertyp === 'flashback' && scene.flashback_ganze_szene && (
                <span style={{ fontSize: 10, color: '#AF52DE', fontWeight: 600, flexShrink: 0, paddingLeft: 2 }}>(Flashback)</span>
              )}
            </div>
            <span className="compact-chars-inline">
              {sceneChars.filter((c: any) => c.kategorie_typ === 'rolle').map((c: any, i: number, arr: any[]) => (
                <span key={c.character_id} className="compact-char-name">{c.name}{i < arr.length - 1 ? ', ' : ''}</span>
              ))}
              {sceneChars.filter((c: any) => c.kategorie_typ === 'komparse').length > 0 && (
                <>
                  {sceneChars.filter((c: any) => c.kategorie_typ === 'rolle').length > 0 && <span style={{ color: 'var(--border)', margin: '0 2px' }}>·</span>}
                  {sceneChars.filter((c: any) => c.kategorie_typ === 'komparse').map((c: any, i: number, arr: any[]) => (
                    <span key={c.character_id} className="compact-char-name" style={{ fontStyle: 'italic' }}>{c.name}{i < arr.length - 1 ? ', ' : ''}</span>
                  ))}
                </>
              )}
              <span className="compact-char-add-wrap" ref={compactCharRef}>
                <button className="compact-char-add-btn" onClick={e => { e.stopPropagation(); setCompactCharDropdown(v => !v); setCompactCharSearch('') }}>+</button>
                {compactCharDropdown && (
                  <div className="sf-dropdown sf-dropdown-fixed" style={getFixedDropdownStyle(compactCharRef)}>
                    <input className="compact-char-filter" value={compactCharSearch} onChange={e => setCompactCharSearch(e.target.value)} placeholder="Suchen…" autoFocus onBlur={() => setTimeout(() => { if (!compactCharRef.current?.contains(document.activeElement)) setCompactCharDropdown(false) }, 150)} />
                    {[...rolleCharacters, ...komparseCharacters].filter(ch => !sceneChars.some(sc => sc.character_id === ch.id)).filter(ch => !compactCharSearch || ch.name.toLowerCase().includes(compactCharSearch.toLowerCase())).slice(0, 15).map(ch => {
                      const isRolle = ch.kategorie_typ === 'rolle'
                      return (
                        <div key={ch.id} className="sf-dropdown-item" onMouseDown={e => { e.preventDefault(); handleAddCharacter(ch, isRolle ? rolleKatId : komparseKatId); setCompactCharSearch(''); setCompactCharDropdown(false) }}>
                          <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', marginRight: 4 }}>{isRolle ? 'R' : 'K'}</span>
                          {ch.name}
                        </div>
                      )
                    })}
                  </div>
                )}
              </span>
            </span>
            <span className="spielzeit-wrap" onMouseEnter={() => setShowSpielzeitInfo(true)} onMouseLeave={() => setShowSpielzeitInfo(false)} style={{ position: 'relative' }}>
              <span className="spiel-field-lbl">Sp</span>
              <input key={`sz-${scene?.id}`} className="spielzeit-inp" defaultValue={scene.spielzeit ?? ''} placeholder="00:00" onBlur={e => { const val = e.target.value.trim() || null; if (val !== (scene.spielzeit ?? null)) saveScene({ spielzeit: val }).then(s => { setScene(s); onSzeneUpdated?.(s) }).catch(() => {}) }} />
              {showSpielzeitInfo && (<div className="spielzeit-info-pop"><strong>Spielzeit</strong><p>Wahrscheinliche Uhrzeit der Handlung — z.B. „08:30" für frühen Morgen.</p></div>)}
            </span>
            <span className="ie-group">
              <Tooltip text={scene.int_ext === 'int' ? 'Innen — klicken für Außen' : 'Außen — klicken für Innen'} placement="bottom">
                <span className="ie-toggle" onClick={cycleIntExt}>{ieAbbr(scene.int_ext ?? 'int')}</span>
              </Tooltip>
              <span className="ie-sep">/</span>
              <Tooltip text={`Tageszeit: ${scene.tageszeit ?? 'TAG'} — klicken zum Wechseln`} placement="bottom">
                <span className="ie-toggle" onClick={cycleTageszeit}>{tzAbbr(scene.tageszeit ?? 'TAG')}</span>
              </Tooltip>
              <span className="ie-sep">·</span>
              <Tooltip text={`${t('spieltag')} (${spieltagAbbr}): Erzähltag der Geschichte\n1 = erster Tag der Handlung\nAutomatisch hochgezählt bei NACHT→TAG-Übergang\nManuell überschreibbar`} placement="bottom">
                <span className="ie-field-wrap">
                  <span className="ie-lbl">{spieltagAbbr}</span>
                  <input key={`dt-${scene?.id}`} className="ie-num-inp" defaultValue={scene.spieltag != null ? String(scene.spieltag) : ''} placeholder="—" type="number" min={1} onBlur={e => { const raw = e.target.value.trim(); const val = raw ? parseInt(raw, 10) : null; if (val !== (scene.spieltag ?? null)) saveScene({ spieltag: val }).then(s => { setScene(s); onSzeneUpdated?.(s) }).catch(() => {}) }} />
                </span>
              </Tooltip>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              {saving && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>…</span>}
              {saveMsg && !saving && <span style={{ fontSize: 10, color: saveMsg === 'Gespeichert' ? 'var(--sw-green)' : 'var(--sw-danger)' }}>{saveMsg === 'Gespeichert' ? '✓' : '!'}</span>}
              <Tooltip text={showAnnotations ? 'Annotationen schließen' : 'Annotationen (Messenger.app)'} placement="bottom">
                <button className={`btn ghost${showAnnotations ? ' active' : ''}`} style={showAnnotations ? { color: 'var(--sw-green)' } : undefined} onClick={() => { const next = !showAnnotations; setShowAnnotations(next); if (!next && kommentareCount > 0 && typeof szeneId === 'number') onMarkCommentsRead?.(szeneId) }}>
                  <MessageSquare size={12} />
                  {kommentareCount > 0 && !showAnnotations && (<span style={{ fontSize: 10, fontWeight: 600, color: 'var(--sw-green)', marginLeft: 1 }}>{kommentareCount}</span>)}
                </button>
              </Tooltip>
            </span>
          </div>
        )}

        {/* Compact hover popover — rendered as portal to avoid clipping */}
        {compact && compactHover && scene && createPortal(
          <div
            className="compact-hover-pop"
            style={compactHoverPos}
            onMouseEnter={() => { if (compactHoverTimer.current) clearTimeout(compactHoverTimer.current) }}
            onMouseLeave={() => setCompactHover(false)}
          >
            {scene.zusammenfassung && (
              <div className="compact-hover-row">
                <span className="compact-hover-label">Oneliner</span>
                <span>{scene.zusammenfassung}</span>
              </div>
            )}
            {sceneChars.length > 0 && (
              <div className="compact-hover-row">
                <span className="compact-hover-label">Rollen</span>
                <span>{sceneChars.map(c => c.name).join(', ')}</span>
              </div>
            )}
            {sceneStraenge.length > 0 && (
              <div className="compact-hover-row">
                <span className="compact-hover-label">Stränge</span>
                <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {sceneStraenge.map((s: any) => (
                    <span key={s.strang_id} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.farbe || '#888', flexShrink: 0 }} />
                      {s.strang_name}
                    </span>
                  ))}
                </span>
              </div>
            )}
            {scene.szeneninfo && (
              <div className="compact-hover-row">
                <span className="compact-hover-label">{t('szene','c')}info</span>
                <span style={{ color: '#90CAF9', fontStyle: 'italic' }}>{scene.szeneninfo}</span>
              </div>
            )}
            {scene.notiz && (
              <div className="compact-hover-row">
                <span className="compact-hover-label">Notiz</span>
                <span>{scene.notiz}</span>
              </div>
            )}
            {scene.sondertyp && (
              <div className="compact-hover-row">
                <span className="compact-hover-label">Sondertyp</span>
                <span style={{ fontWeight: 600, color: scene.sondertyp === 'wechselschnitt' ? '#007AFF' : scene.sondertyp === 'stockshot' ? '#FF9500' : '#AF52DE' }}>
                  {scene.sondertyp === 'wechselschnitt'
                    ? ('Wechselschnitt' + (scene.ws_spezifikation === 'splitscreen' ? ' · Splitscreen' : scene.ws_spezifikation === 'telefonat' ? ' · 2W Telefonat' : ''))
                    : scene.sondertyp === 'stockshot' ? t('stockshot') : t('flashback')}
                </span>
              </div>
            )}
            {scene.spielzeit && (
              <div className="compact-hover-row">
                <span className="compact-hover-label">Spielzeit</span>
                <span>{scene.spielzeit}</span>
              </div>
            )}
            {!scene.zusammenfassung && sceneChars.length === 0 && sceneStraenge.length === 0 && !scene.szeneninfo && !scene.notiz && !scene.sondertyp && !scene.spielzeit && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>Keine weiteren Details</div>
            )}
          </div>,
          document.body
        )}
      </div>}

      {/* Drehbuch-Check schwebendes Modal */}
      {checkModalAnchor && checkResults.length > 0 && (
        <CheckHinweisModal
          checks={checkResults}
          anchorRect={checkModalAnchor}
          produktionId={produktionId ?? null}
          szeneId={scene?.id ?? null}
          sceneNummer={scene?.scene_nummer ?? null}
          onClose={() => setCheckModalAnchor(null)}
          onChecksChanged={next => {
            setCheckResults(next)
            window.dispatchEvent(new CustomEvent('sz-checks-updated', {
              detail: { szeneId: scene?.id, count: next.length }
            }))
          }}
          onRerun={async () => {
            if (!scene?.id) return
            setChecksRunning(true)
            try {
              const res = await api.runChecksManual(scene.id)
              setCheckResults(res.results ?? [])
              window.dispatchEvent(new CustomEvent('sz-checks-updated', {
                detail: { szeneId: scene.id, count: res.issues ?? 0 }
              }))
            } catch {} finally {
              setChecksRunning(false)
            }
          }}
        />
      )}

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

      {/* Stoppzeit Auto-Berechnung Modal */}
      {stoppzeitAutoModal && createPortal(
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,0.35)' }}
            onClick={() => setStoppzeitAutoModal(false)}
          />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            zIndex: 9001, background: 'var(--bg-surface)', border: '1px solid var(--border)',
            borderRadius: 12, boxShadow: 'var(--shadow-xl)', padding: '20px 24px', minWidth: 280,
          }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Stoppzeit berechnen</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>
              Aus Seitenlänge / Zeichenanzahl (DK-Einstellungen → Stoppzeit)
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => handleStoppzeitAuto('scene')}
                style={{
                  flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)',
                  background: 'var(--bg-subtle)', cursor: 'pointer', fontSize: 13, fontWeight: 500,
                }}
              >
                Nur diese Szene
              </button>
              <button
                onClick={() => handleStoppzeitAuto('folge')}
                style={{
                  flex: 1, padding: '8px 12px', borderRadius: 8, border: 'none',
                  background: 'var(--text-primary)', color: 'var(--bg-primary)',
                  cursor: 'pointer', fontSize: 13, fontWeight: 600,
                }}
              >
                Ganze Folge
              </button>
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  )
}
