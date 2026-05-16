import { useState, useEffect, useRef, useCallback, useMemo, useContext } from 'react'
import { useLocation } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { api, preloadScene, preloadAllScenes } from '../api/client'
import AppShell from '../components/AppShell'
import SceneList from '../components/SceneList'
import SceneEditor from '../components/SceneEditor'
import BreakdownPanel from '../components/BreakdownPanel'
import EditorPanel from '../components/editor/EditorPanel'
import StatistikModal, { DEFAULT_SECTIONS, type StatModalSection } from '../components/StatistikModal'
import { useFocus, useSelectedProduction, PanelModeContext, useTweaks } from '../contexts'
import { useTerminologie } from '../sw-ui'
import { useWerkstufe } from '../hooks/useDokument'
import SearchReplaceDialog from '../components/SearchReplaceDialog'
import { useSearchReplace } from '../hooks/useSearchReplace'
import StoryRadarPanel from '../components/StoryRadarPanel'
import StrangVerwaltungModal from '../components/StrangVerwaltungModal'
import StoppzeitenModal from '../components/StoppzeitenModal'

// ── Folgen-Dokument-Editor Panels (inline in main layout) ─────────────────────
// Per-scene editing: each editor shows only the currently selected scene's content
function DockedEditorPanels({ produktionId, folgeNummer, selectedSzeneId, useDokumentSzenen, stageId, sceneIdentityId, onNavigateNext, onNavigatePrev, onSzeneUpdated, onMarkCommentsRead }: {
  produktionId: string; folgeNummer: number | null; selectedSzeneId: number | string | null; useDokumentSzenen: boolean
  stageId: number | null; sceneIdentityId: string | null
  onNavigateNext?: () => void; onNavigatePrev?: () => void
  onSzeneUpdated?: (updated: any) => void; onMarkCommentsRead?: (szeneId: number) => void
}) {
  const { panelMode } = useContext(PanelModeContext)
  const { tweaks } = useTweaks()
  const sceneEditorMode = tweaks.sceneEditorMode ?? 'single'
  const [folgeId, setFolgeId] = useState<number | null>(null)
  const [formatElements, setFormatElements] = useState<any[]>([])

  // Resolve produktionId + folgeNummer → folge_id
  useEffect(() => {
    if (!produktionId || !folgeNummer) { setFolgeId(null); return }
    api.getFolgenV2(produktionId)
      .then(folgen => {
        const match = folgen.find((f: any) => f.folge_nummer === folgeNummer)
        setFolgeId(match?.id ?? null)
      })
      .catch(() => setFolgeId(null))
  }, [produktionId, folgeNummer])

  // Load werkstufen for this folge
  const { werkstufen, reload: reloadWerkstufen, createWerkstufe } = useWerkstufe(folgeId)

  // Load format elements
  useEffect(() => {
    api.getFormatTemplates().then((templates: any[]) => {
      const standard = templates.find((t: any) => t.ist_standard)
      if (standard?.elemente) setFormatElements(standard.elemente)
    }).catch(() => {})
  }, [])

  // Track selected werkstufe per panel (for SceneEditor per panel)
  const [leftWerkId, setLeftWerkId] = useState<string | null>(null)
  const [rightWerkId, setRightWerkId] = useState<string | null>(null)

  // Resizable split
  const [splitRatio, setSplitRatio] = useState(0.5)
  const [isSplitDragging, setIsSplitDragging] = useState(false)
  const splitContainerRef = useRef<HTMLDivElement>(null)

  const onSplitDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsSplitDragging(true)
    const onMove = (ev: MouseEvent) => {
      if (!splitContainerRef.current) return
      const rect = splitContainerRef.current.getBoundingClientRect()
      const ratio = (ev.clientX - rect.left) / rect.width
      setSplitRatio(Math.min(0.8, Math.max(0.2, ratio)))
    }
    const onUp = () => {
      setIsSplitDragging(false)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])

  if (!produktionId || !folgeNummer) return null

  const showLeft = panelMode !== 'script'
  const showRight = panelMode !== 'treatment'
  const showBoth = showLeft && showRight

  const handleCreate = async (typ: string) => {
    await createWerkstufe(typ)
  }

  // Single SceneEditor uses the left panel's werkstufId (or right if only right visible)
  const singleWerkId = showLeft ? leftWerkId : rightWerkId
  const singleWerkTyp = werkstufen.find((w: any) => w.id === singleWerkId)?.typ ?? null
  const leftWerkTyp   = werkstufen.find((w: any) => w.id === leftWerkId)?.typ ?? null
  const rightWerkTyp  = werkstufen.find((w: any) => w.id === rightWerkId)?.typ ?? null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      {/* Single SceneEditor above both panels */}
      {sceneEditorMode === 'single' && selectedSzeneId && sceneIdentityId && (
        <SceneEditor
          szeneId={selectedSzeneId}
          stageId={stageId}
          produktionId={produktionId}
          folgeNummer={folgeNummer}
          useDokumentSzenen={useDokumentSzenen}
          werkstufId={singleWerkId}
          werkstufTyp={singleWerkTyp}
          sceneIdentityId={sceneIdentityId}
          onSzeneUpdated={onSzeneUpdated}
          onNavigatePrev={onNavigatePrev}
          onNavigateNext={onNavigateNext}
          onMarkCommentsRead={onMarkCommentsRead}
        />
      )}
      <div ref={splitContainerRef} style={{ display: 'flex', borderTop: '2px solid var(--border)', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      {showLeft && (
        <div style={{
          width: showBoth ? `${splitRatio * 100}%` : undefined,
          flex: showBoth ? undefined : 1,
          overflow: 'hidden', flexShrink: 0,
          pointerEvents: isSplitDragging ? 'none' : 'auto',
          display: 'flex', flexDirection: 'column',
        }}>
          {sceneEditorMode === 'mirror' && selectedSzeneId && sceneIdentityId && (
            <SceneEditor
              szeneId={selectedSzeneId}
              stageId={stageId}
              produktionId={produktionId}
              folgeNummer={folgeNummer}
              useDokumentSzenen={useDokumentSzenen}
              werkstufId={leftWerkId}
              werkstufTyp={leftWerkTyp}
              sceneIdentityId={sceneIdentityId}
              onSzeneUpdated={onSzeneUpdated}
              onNavigatePrev={onNavigatePrev}
              onNavigateNext={onNavigateNext}
              onMarkCommentsRead={onMarkCommentsRead}
            />
          )}
          <EditorPanel
            key={`${produktionId}-${folgeNummer}-left`}
            produktionId={produktionId}
            folgeNummer={folgeNummer}
            folgeId={folgeId}
            werkstufen={werkstufen}
            formatElements={formatElements}
            defaultTyp="storyline"
            selectedSzeneId={selectedSzeneId}
            useDokumentSzenen={useDokumentSzenen}
            onCreateWerkstufe={handleCreate}
            onReloadWerkstufen={reloadWerkstufen}
            onNavigateNext={onNavigateNext}
            onNavigatePrev={onNavigatePrev}
            onWerkstufSelected={setLeftWerkId}
          />
        </div>
      )}
      {showBoth && (
        <div
          onMouseDown={onSplitDragStart}
          onDoubleClick={() => setSplitRatio(0.5)}
          style={{
            width: 1, flexShrink: 0, cursor: 'col-resize',
            background: 'var(--border)',
            position: 'relative',
          }}
          title="Ziehen zum Ändern der Breite · Doppelklick = 50/50"
        >
          <div style={{
            position: 'absolute', top: 0, bottom: 0, left: -4, width: 9,
            cursor: 'col-resize',
          }} />
        </div>
      )}
      {showRight && (
        <div style={{
          flex: 1, overflow: 'hidden',
          pointerEvents: isSplitDragging ? 'none' : 'auto',
          display: 'flex', flexDirection: 'column',
        }}>
          {sceneEditorMode === 'mirror' && selectedSzeneId && sceneIdentityId && (
            <SceneEditor
              szeneId={selectedSzeneId}
              stageId={stageId}
              produktionId={produktionId}
              folgeNummer={folgeNummer}
              useDokumentSzenen={useDokumentSzenen}
              werkstufId={rightWerkId}
              werkstufTyp={rightWerkTyp}
              sceneIdentityId={sceneIdentityId}
              onSzeneUpdated={onSzeneUpdated}
              onNavigatePrev={onNavigatePrev}
              onNavigateNext={onNavigateNext}
              onMarkCommentsRead={onMarkCommentsRead}
            />
          )}
          <EditorPanel
            key={`${produktionId}-${folgeNummer}-right`}
            produktionId={produktionId}
            folgeNummer={folgeNummer}
            folgeId={folgeId}
            werkstufen={werkstufen}
            formatElements={formatElements}
            defaultTyp="drehbuch"
            selectedSzeneId={selectedSzeneId}
            useDokumentSzenen={useDokumentSzenen}
            onCreateWerkstufe={handleCreate}
            onReloadWerkstufen={reloadWerkstufen}
            onNavigateNext={onNavigateNext}
            onNavigatePrev={onNavigatePrev}
            onWerkstufSelected={setRightWerkId}
          />
        </div>
      )}
      </div>
    </div>
  )
}

const MIN_WIDTH = 180
const DEFAULT_WIDTH = 276

export default function ScriptPage() {
  const { t } = useTerminologie()
  const { focus } = useFocus()
  const location = useLocation()
  const { selectedProduction, productions, loading } = useSelectedProduction()
  const [bloecke, setBloecke] = useState<any[]>([])
  const [stages, setStages] = useState<any[]>([])
  const [szenen, setSzenen] = useState<any[]>([])
  const [useDokumentSzenen, setUseDokumentSzenen] = useState(false)
  const [folgenMitDaten, setFolgenMitDaten] = useState<number[]>([])
  // refreshKey: increment to force all data re-fetches
  // Initialize from Date.now() so every mount gets a unique key (forces fresh load)
  const [refreshKey, setRefreshKey] = useState(() => Date.now())

  // Auto-refresh after import event
  useEffect(() => {
    const handler = () => setRefreshKey(Date.now())
    window.addEventListener('script-import-complete', handler)
    // If navigated from import with ?imported= param, clean URL
    const params = new URLSearchParams(window.location.search)
    if (params.has('imported')) {
      window.history.replaceState({}, '', window.location.pathname)
    }
    return () => window.removeEventListener('script-import-complete', handler)
  }, [])

  // Parse deep-link URL params once on init (?scene=<id> from Messenger-App links)
  const [deepLink] = useState<{ produktionId?: string; folgeNummer?: number; stageId?: number; szeneId?: number } | null>(() => {
    const params = new URLSearchParams(window.location.search)
    const scene = params.get('scene')
    if (!scene) return null
    const produktion = params.get('produktion') || params.get('staffel')
    const folge = params.get('folge')
    const stage = params.get('stage')
    // Clean URL immediately
    window.history.replaceState({}, '', window.location.pathname)
    if (produktion && folge && stage) {
      return { produktionId: produktion, folgeNummer: parseInt(folge), stageId: parseInt(stage), szeneId: parseInt(scene) }
    }
    return { szeneId: parseInt(scene) }
  })

  const [selectedProduktionId, setSelectedProduktionId] = useState<string>('')
  const [selectedBlock, setSelectedBlock] = useState<any | null>(null)
  const [selectedFolgeNummer, setSelectedFolgeNummer] = useState<number | null>(null)
  const [showStatModal, setShowStatModal] = useState(false)
  const [showRadar, setShowRadar] = useState(false)
  const [showStrangPanel, setShowStrangPanel] = useState(false)
  const [showStoppzeiten, setShowStoppzeiten] = useState(false)
  const [statSections, setStatSections] = useState<StatModalSection[]>([...DEFAULT_SECTIONS])
  const [allFolgen, setAllFolgen] = useState<any[]>([])
  const [selectedStageId, setSelectedStageId] = useState<number | null>(null)
  const [selectedSzeneId, setSelectedSzeneId] = useState<number | string | null>(null)

  const [commentCounts, setCommentCounts] = useState<Record<number, number>>({})

  // Kommentar-Badges: lade ungelesene Counts wenn Stage wechselt
  useEffect(() => {
    if (!selectedStageId) { setCommentCounts({}); return }
    api.getSceneCommentCounts(selectedStageId).then(setCommentCounts).catch(() => {})
  }, [selectedStageId])

  const [showSearchReplace, setShowSearchReplace] = useState(false)
  const searchReplace = useSearchReplace()

  // Ctrl+H / Cmd+H → open Search & Replace
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'h') {
        e.preventDefault()
        setShowSearchReplace(prev => !prev)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_WIDTH)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isDragging = useRef(false)
  // Track sidebar state before entering focus mode so it can be restored on exit
  const sidebarCollapsedRef = useRef(sidebarCollapsed)
  sidebarCollapsedRef.current = sidebarCollapsed
  const prevSidebarCollapseRef = useRef(false)
  const dragStartX = useRef(0)
  const dragStartWidth = useRef(0)
  // Holds saved nav values during initial cascading restore; cleared after use
  const pendingNav = useRef<{ produktionId?: string; folgeNummer?: number; stageId?: number; szeneId?: number }>({})
  const navRestored = useRef(false)

  // Throttle timestamp for keyboard navigation (max 1 navigation per interval)
  const kbSzeneLastFire = useRef(0)

  // Live refs for keyboard handler (avoid stale closures without re-registering listener)
  const bloeckeRef = useRef(bloecke)
  bloeckeRef.current = bloecke
  const selectedBlockRef = useRef(selectedBlock)
  selectedBlockRef.current = selectedBlock
  const selectedFolgeNummerRef = useRef(selectedFolgeNummer)
  selectedFolgeNummerRef.current = selectedFolgeNummer
  const selectedStageIdRef = useRef(selectedStageId)
  selectedStageIdRef.current = selectedStageId
  const szenenRef = useRef(szenen)
  szenenRef.current = szenen
  const selectedSzeneIdRef = useRef(selectedSzeneId)
  selectedSzeneIdRef.current = selectedSzeneId
  const selectedProduktionIdRef = useRef(selectedProduktionId)
  selectedProduktionIdRef.current = selectedProduktionId

  // Load user settings (sidebar + last navigation position)
  // Deep-link (?scene=...) takes priority over saved settings
  // Re-reads settings when refreshKey changes (e.g. after import)
  useEffect(() => {
    if (deepLink && !deepLink.produktionId) {
      // Minimal deep-link — only scene ID, need to resolve staffel/folge/stage via API
      api.getSzene(deepLink.szeneId!).then(scene =>
        api.getStage(scene.stage_id).then(stage => {
          pendingNav.current = {
            produktionId: stage.produktion_id,
            folgeNummer: stage.folge_nummer,
            stageId: stage.id,
            szeneId: deepLink.szeneId,
          }
          setSettingsLoaded(true)
        })
      ).catch(() => setSettingsLoaded(true))
      return
    }

    api.getSettings().then(s => {
      const ui = s?.ui_settings || {}
      if (typeof ui.scene_list_collapsed === 'boolean') setSidebarCollapsed(ui.scene_list_collapsed)
      if (deepLink) {
        // Full deep-link (staffel + folge + stage + scene) — override saved nav
        if (deepLink.produktionId)   pendingNav.current.produktionId   = deepLink.produktionId
        if (deepLink.folgeNummer) pendingNav.current.folgeNummer = deepLink.folgeNummer
        if (deepLink.stageId)     pendingNav.current.stageId     = deepLink.stageId
        if (deepLink.szeneId)     pendingNav.current.szeneId     = deepLink.szeneId
      } else {
        if (ui.last_produktion_id)    pendingNav.current.produktionId   = ui.last_produktion_id
        if (ui.last_folge_nummer)  pendingNav.current.folgeNummer = ui.last_folge_nummer
        if (ui.last_stage_id)      pendingNav.current.stageId     = ui.last_stage_id
        if (ui.last_szene_id)      pendingNav.current.szeneId     = ui.last_szene_id
      }
      setSettingsLoaded(true)
    }).catch(() => setSettingsLoaded(true))
  }, [deepLink, refreshKey])

  // Collapse sidebar on focus-mode enter; restore on exit
  useEffect(() => {
    if (!settingsLoaded) return
    if (focus) {
      prevSidebarCollapseRef.current = sidebarCollapsedRef.current
      setSidebarCollapsed(true)
    } else {
      setSidebarCollapsed(prevSidebarCollapseRef.current)
    }
  }, [focus, settingsLoaded])

  // Debounced save layout to backend
  const saveSettings = useCallback((collapsed: boolean) => {
    if (!settingsLoaded) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      api.updateSettings({ ui_settings: { scene_list_collapsed: collapsed } })
        .catch(() => {})
    }, 800)
  }, [settingsLoaded])

  // Immediate save navigation position to backend
  const saveNavPosition = useCallback((
    produktionId: string, folgeNummer: number | null, stageId: number | null, szeneId: number | string | null
  ) => {
    if (!navRestored.current) return
    api.updateSettings({ ui_settings: {
      last_produktion_id:   produktionId,
      last_folge_nummer: folgeNummer,
      last_stage_id:     stageId,
      last_szene_id:     szeneId,
    }}).catch(() => {})
  }, [])

  // Szene navigation (shared by keyboard + scroll overscroll)
  const navigateSzene = useCallback((dir: 1 | -1) => {
    const currentSzenen = szenenRef.current
    const currentSzeneId = selectedSzeneIdRef.current
    const currentFolge = selectedFolgeNummerRef.current
    const currentStageId = selectedStageIdRef.current
    const produktionId = selectedProduktionIdRef.current
    if (!currentSzenen.length || currentSzeneId == null) return
    const idx = currentSzenen.findIndex(s => s.id === currentSzeneId)
    if (idx === -1) return
    const nextIdx = idx + dir
    if (nextIdx < 0 || nextIdx >= currentSzenen.length) return
    const nextSzene = currentSzenen[nextIdx]
    setSelectedSzeneId(nextSzene.id)
    if (navRestored.current && produktionId)
      api.updateSettings({ ui_settings: {
        last_produktion_id: produktionId,
        last_folge_nummer: currentFolge,
        last_stage_id: currentStageId,
        last_szene_id: nextSzene.id,
      }}).catch(() => {})
  }, [])

  // Keyboard navigation: ←→ = Szene wechseln, ↑↓ = Editor scrollen (Browser-Default)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return
      const tag = (document.activeElement?.tagName || '').toLowerCase()
      if (['input', 'textarea', 'select'].includes(tag)) return
      if (document.activeElement?.getAttribute('contenteditable')) return

      // ←→ — Szene wechseln, throttled auf 200ms
      e.preventDefault()
      const now = Date.now()
      if (now - kbSzeneLastFire.current < 200) return
      kbSzeneLastFire.current = now
      navigateSzene(e.key === 'ArrowRight' ? 1 : -1)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, []) // empty deps — all state accessed via live refs

  // Drag-to-resize
  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true
    dragStartX.current = e.clientX
    dragStartWidth.current = sidebarWidth

    const onMove = (ev: MouseEvent) => {
      if (!isDragging.current) return
      const delta = ev.clientX - dragStartX.current
      const newWidth = Math.min(window.innerWidth, Math.max(MIN_WIDTH, dragStartWidth.current + delta))
      setSidebarWidth(newWidth)
    }
    const onUp = (ev: MouseEvent) => {
      isDragging.current = false
      const delta = ev.clientX - dragStartX.current
      const newWidth = Math.min(window.innerWidth, Math.max(MIN_WIDTH, dragStartWidth.current + delta))
      saveSettings(sidebarCollapsed)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [sidebarWidth, sidebarCollapsed, saveSettings])

  const toggleCollapse = useCallback(() => {
    setSidebarCollapsed(v => {
      const next = !v
      saveSettings(next)
      return next
    })
  }, [saveSettings])

  // Sync selected production as staffel — wait for settings first to avoid race condition
  useEffect(() => {
    if (!selectedProduction || !settingsLoaded) return
    fetch('/api/produktionen/sync', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        production_id: selectedProduction.id,
        title: selectedProduction.title,
        staffelnummer: selectedProduction.staffelnummer,
        projektnummer: selectedProduction.projektnummer,
      }),
    })
      .then(r => r.json())
      .then(data => { if (data.produktion_id) setSelectedProduktionId(data.produktion_id) })
      .catch(console.error)
  }, [selectedProduction?.id, settingsLoaded])


  // Load all folgen + stat modal settings for Statistik-Panel
  useEffect(() => {
    if (!selectedProduktionId) return
    api.getFolgenV2(selectedProduktionId).then(setAllFolgen).catch(() => {})
    fetch(`/api/dk-settings/${selectedProduktionId}/app-settings`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((data: any) => {
        if (data?.statistik_modal_config) {
          try {
            const parsed = JSON.parse(data.statistik_modal_config)
            if (Array.isArray(parsed)) setStatSections(parsed)
          } catch {}
        }
      })
      .catch(() => {})
  }, [selectedProduktionId, refreshKey])

  // Load Blöcke — restore saved folgeNummer by finding the right block
  useEffect(() => {
    if (!selectedProduktionId) return
    setBloecke([])
    setSelectedBlock(null)
    api.getBloecke(selectedProduktionId).then(data => {
      setBloecke(data)
      if (!data.length) return
      const savedFolge = pendingNav.current.folgeNummer
      const match = savedFolge && data.find((b: any) =>
        b.folge_von != null && savedFolge >= b.folge_von && (b.folge_bis == null || savedFolge <= b.folge_bis)
      )
      setSelectedBlock(match || data[0])
    }).catch(() => {})
  }, [selectedProduktionId, refreshKey])

  // Set default Folge when Block changes — restore saved folgeNummer if in range
  useEffect(() => {
    if (!selectedBlock) { setSelectedFolgeNummer(null); return }
    const savedFolge = pendingNav.current.folgeNummer
    const inRange = savedFolge != null
      && selectedBlock.folge_von != null
      && savedFolge >= selectedBlock.folge_von
      && (selectedBlock.folge_bis == null || savedFolge <= selectedBlock.folge_bis)
    setSelectedFolgeNummer(inRange ? savedFolge : (selectedBlock.folge_von ?? null))
  }, [selectedBlock?.proddb_id])

  // Load Szenen via werkstufen (only model since v51)
  useEffect(() => {
    if (!selectedProduktionId || selectedFolgeNummer == null) return
    setSzenen([])
    setSelectedSzeneId(null)
    setUseDokumentSzenen(false)

    async function loadWerkstufen() {
      try {
        const folgen = await api.getFolgenV2(selectedProduktionId)
        // Track which folgen have imported data (for UI indicators)
        setFolgenMitDaten(folgen.filter((f: any) => f.werkstufen_count > 0).map((f: any) => f.folge_nummer))
        let folge = folgen.find((f: any) => f.folge_nummer === selectedFolgeNummer)
        if (!folge) {
          // Folge existiert noch nicht in der DB (keine Szenen bisher) → auto-anlegen
          folge = await api.createFolgeV2({ produktion_id: selectedProduktionId, folge_nummer: selectedFolgeNummer! })
          const newWerkstufe = await api.createWerkstufe(folge.id, { typ: 'drehbuch' })
          setSelectedStageId(newWerkstufe.id)
          setSzenen([])
          setUseDokumentSzenen(true)
          return
        }
        const werkstufen = await api.getWerkstufen(folge.id)
        if (werkstufen.length === 0) { console.warn('[ScriptPage] No werkstufen for folge', folge.id); return }
        // Prefer drehbuch > storyline > notiz, then latest version
        const prio = ['drehbuch', 'storyline', 'notiz']
        let matching: any[] = []
        for (const typ of prio) {
          matching = werkstufen.filter((w: any) => w.typ === typ)
          if (matching.length > 0) break
        }
        if (matching.length === 0) matching = werkstufen
        matching.sort((a: any, b: any) => b.version_nummer - a.version_nummer)
        const werk = matching[0]
        if (!werk) { console.warn('[ScriptPage] No matching werkstufe'); return }
        setSelectedStageId(werk.id)
        const werkSzenen = await api.getWerkstufenSzenen(werk.id)
        if (werkSzenen.length > 0) {
          setSzenen(werkSzenen)
          setUseDokumentSzenen(true)
          const savedSzene = pendingNav.current.szeneId
          const match = savedSzene && werkSzenen.find((s: any) => s.id === savedSzene)
          setSelectedSzeneId(match ? match.id : werkSzenen[0].id)
          delete pendingNav.current.szeneId
          navRestored.current = true
          // Preload all scenes in background so switching is instant throughout the Folge
          preloadAllScenes(werkSzenen)
        } else {
          // Werkstufe vorhanden, aber noch keine Szenen — stageId trotzdem setzen
          // damit der "+ Neue Szene"-Button aktiv ist
          setUseDokumentSzenen(true)
        }
      } catch (err) {
        console.error('[ScriptPage] loadWerkstufen error:', err)
      }
    }
    loadWerkstufen()
  }, [selectedProduktionId, selectedFolgeNummer, refreshKey])

  // Poll unread comment counts from Messenger-App every 60s
  // TODO: Comment counts not yet implemented for new werkstufe model (UUID IDs)
  // Disabled to avoid 404 errors — re-enable when scene-comment integration is complete

  // Save navigation position when selections change
  useEffect(() => {
    if (selectedProduktionId) saveNavPosition(selectedProduktionId, selectedFolgeNummer, selectedStageId, selectedSzeneId)
  }, [selectedProduktionId, selectedFolgeNummer, selectedStageId, selectedSzeneId, saveNavPosition])

  // Preload adjacent scenes (prev + next) for instant switching
  useEffect(() => {
    if (!selectedSzeneId || !useDokumentSzenen || szenen.length < 2) return
    const idx = szenen.findIndex(s => s.id === selectedSzeneId)
    if (idx < 0) return
    const neighbors = [szenen[idx - 1], szenen[idx + 1]].filter(Boolean)
    // Small delay so the current scene loads first
    const timer = setTimeout(() => {
      for (const s of neighbors) {
        preloadScene(s.id, s.scene_identity_id, selectedStageId ? String(selectedStageId) : null)
      }
    }, 150)
    return () => clearTimeout(timer)
  }, [selectedSzeneId, szenen, useDokumentSzenen, selectedStageId])

  if (loading) return <div style={{ padding: 32, color: 'var(--text-secondary)' }}>Lädt…</div>

  return (
    <AppShell
      selectedProduktionId={selectedProduktionId}
      bloecke={bloecke}
      selectedBlock={selectedBlock}
      onSelectBlock={b => { pendingNav.current = {}; navRestored.current = true; setSelectedBlock(b) }}
      selectedFolgeNummer={selectedFolgeNummer}
      onSelectFolge={nr => {
        pendingNav.current = {}; navRestored.current = true; setSelectedFolgeNummer(nr)
        if (selectedProduktionId)
          api.updateSettings({ ui_settings: { last_produktion_id: selectedProduktionId, last_folge_nummer: nr, last_stage_id: null, last_szene_id: null } }).catch(() => {})
      }}
      stages={stages}
      selectedStageId={selectedStageId}
      onSelectStage={id => { navRestored.current = true; setSelectedStageId(id) }}
      folgenMitDaten={folgenMitDaten}
    >
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', position: 'relative' }}>

        {/* Collapsible + resizable scene list */}
        {!sidebarCollapsed && (
          <div className="scene-list-sidebar" style={{ width: sidebarWidth, flexShrink: 0, overflow: 'hidden', display: 'flex' }}>
            <SceneList
              szenen={szenen}
              selectedSzeneId={selectedSzeneId}
              onSelectSzene={(id) => {
                setSelectedSzeneId(id)
                if (navRestored.current && selectedProduktionId)
                  api.updateSettings({ ui_settings: {
                    last_produktion_id: selectedProduktionId,
                    last_folge_nummer: selectedFolgeNummer,
                    last_stage_id: selectedStageId,
                    last_szene_id: id,
                  } }).catch(() => {})
              }}
              produktionId={selectedProduktionId}
              folgeNummer={selectedFolgeNummer}
              stageId={selectedStageId}
              onSzeneCreated={(newSzene) => {
                setSzenen(prev => [...prev, newSzene])
                setSelectedSzeneId(newSzene.id)
                if (navRestored.current && selectedProduktionId)
                  api.updateSettings({ ui_settings: {
                    last_produktion_id: selectedProduktionId,
                    last_folge_nummer: selectedFolgeNummer,
                    last_stage_id: selectedStageId,
                    last_szene_id: newSzene.id,
                  } }).catch(() => {})
              }}
              onSzeneDeleted={(id) => {
                setSzenen(prev => prev.filter(s => s.id !== id))
                if (selectedSzeneId === id) setSelectedSzeneId(null)
              }}
              onSzenesReordered={setSzenen}
              commentCounts={commentCounts}
              onOpenStatistik={() => setShowStatModal(true)}
              onOpenRadar={() => setShowRadar(v => !v)}
              onOpenSearch={() => setShowSearchReplace(true)}
              onOpenStrangPanel={() => setShowStrangPanel(v => !v)}
              onOpenStoppzeiten={() => setShowStoppzeiten(true)}
              werkstufId={selectedStageId ? String(selectedStageId) : null}
            />
          </div>
        )}

        {/* Drag handle + collapse arrow */}
        <div className="scene-list-handle" onMouseDown={!sidebarCollapsed ? onDragStart : undefined}>
          <button
            className="scene-list-collapse-btn"
            onClick={toggleCollapse}
            title={sidebarCollapsed ? `${t('szene','c')}übersicht öffnen` : `${t('szene','c')}übersicht schließen`}
          >
            {sidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>

        {/* Editor area — per-panel SceneEditor + DockedEditorPanels OR Strang panel */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {showStrangPanel && selectedProduktionId ? (
            <StrangVerwaltungModal
              produktionId={selectedProduktionId}
              open={true}
              onClose={() => setShowStrangPanel(false)}
            />
          ) : (
            <>
              {!selectedSzeneId && (
                <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, color: 'var(--text-secondary)', fontSize: 13 }}>
                  Keine {t('szene')} ausgewählt
                </div>
              )}
              <DockedEditorPanels
                produktionId={selectedProduktionId}
                folgeNummer={selectedFolgeNummer}
                selectedSzeneId={selectedSzeneId}
                useDokumentSzenen={useDokumentSzenen}
                stageId={selectedStageId}
                sceneIdentityId={useDokumentSzenen ? szenen.find(s => s.id === selectedSzeneId)?.scene_identity_id ?? null : null}
                onNavigateNext={() => navigateSzene(1)}
                onNavigatePrev={() => navigateSzene(-1)}
                onSzeneUpdated={(updated) => {
                  setSzenen(prev => prev.map(s => s.id === updated.id ? updated : s))
                }}
                onMarkCommentsRead={(szeneId) => {
                  setCommentCounts(prev => ({ ...prev, [szeneId]: 0 }))
                  api.markSceneCommentsRead(szeneId).catch(() => {})
                }}
              />
            </>
          )}
        </div>

        {!focus && <BreakdownPanel
          szeneId={selectedSzeneId}
          produktionId={selectedProduktionId}
          sceneIdentityId={useDokumentSzenen ? szenen.find(s => s.id === selectedSzeneId)?.scene_identity_id ?? null : null}
        />}
      </div>

      {/* Search & Replace */}
      <SearchReplaceDialog
        open={showSearchReplace}
        onClose={() => {
          setShowSearchReplace(false)
          searchReplace.clearSearch()
        }}
        currentSzeneId={typeof selectedSzeneId === 'string' ? selectedSzeneId : undefined}
        currentWerkstufenId={undefined}
        currentFolgeId={selectedFolgeNummer ?? undefined}
        currentProduktionId={selectedProduktionId || undefined}
        currentBlockNummer={selectedBlock?.block_nummer}
        productions={productions}
        editorActiveIndex={searchReplace.state.editorActiveIndex}
        editorTotal={searchReplace.state.editorTotal}
        onEditorSearch={searchReplace.searchInEditor}
        onFindNext={searchReplace.findNext}
        onFindPrev={searchReplace.findPrev}
        onReplaceCurrent={searchReplace.replaceCurrent}
        onReplaceAllEditor={searchReplace.replaceAllInEditor}
        onBackendSearch={searchReplace.searchBackend}
        onBackendReplace={async (params) => {
          const result = await searchReplace.replaceBackend(params)
          return result
        }}
        backendResults={searchReplace.state.results}
        backendTotal={searchReplace.state.total}
        backendTotalScenes={searchReplace.state.totalScenes}
        backendLockedCount={searchReplace.state.lockedCount}
        backendFallbackCount={searchReplace.state.fallbackCount}
        backendLoading={searchReplace.state.loading}
        backendError={searchReplace.state.error}
        onNavigateToScene={(szeneId, _folgeId) => {
          setSelectedSzeneId(szeneId)
        }}
        bloecke={bloecke?.map((b: any) => ({
          block_nummer: b.block_nummer,
          folge_von: b.folge_von,
          folge_bis: b.folge_bis,
        }))}
      />

      {/* Story-Radar Panel */}
      {selectedProduktionId && (
        <StoryRadarPanel
          produktionId={selectedProduktionId}
          open={showRadar}
          onClose={() => setShowRadar(false)}
        />
      )}

      {/* Stoppzeiten-Übersicht Modal */}
      {selectedStageId && (
        <StoppzeitenModal
          open={showStoppzeiten}
          onClose={() => setShowStoppzeiten(false)}
          werkstufId={String(selectedStageId)}
        />
      )}

      {/* Statistik Modal */}
      {showStatModal && selectedProduktionId && (
        <StatistikModal
          onClose={() => setShowStatModal(false)}
          folgen={allFolgen}
          bloecke={bloecke}
          sections={statSections}
          initialFolgeNummer={selectedFolgeNummer}
          szenen={szenen}
          onNavigateToScene={(sceneNum) => {
            const match = szenen.find((s: any) => s.scene_nummer === sceneNum)
            if (match) setSelectedSzeneId(match.id)
          }}
        />
      )}
    </AppShell>
  )
}
