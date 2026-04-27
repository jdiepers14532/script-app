import { useState, useEffect, useRef, useCallback, useMemo, useContext } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { api } from '../api/client'
import AppShell from '../components/AppShell'
import SceneList from '../components/SceneList'
import SceneEditor from '../components/SceneEditor'
import BreakdownPanel from '../components/BreakdownPanel'
import EditorPanel from '../components/editor/EditorPanel'
import { useFocus, useSelectedProduction, PanelModeContext } from '../App'
import { useDokument } from '../hooks/useDokument'

// ── Folgen-Dokument-Editor Panels (inline in main layout) ─────────────────────
// Rendered inside AppShell children → has access to PanelModeContext
function DockedEditorPanels({ staffelId, folgeNummer }: { staffelId: string; folgeNummer: number | null }) {
  const { panelMode } = useContext(PanelModeContext)
  const { dokumente, createDokument, reload } = useDokument(staffelId || null, folgeNummer)
  const [customTypen, setCustomTypen] = useState<{ name: string; editor_modus: string }[]>([])
  const [formatElements, setFormatElements] = useState<any[]>([])

  useEffect(() => {
    api.getFormatTemplates().then((templates: any[]) => {
      const standard = templates.find((t: any) => t.ist_standard)
      if (standard?.elemente) setFormatElements(standard.elemente)
    }).catch(() => {})
    if (staffelId) {
      api.getDokumentTypen(staffelId).then((typen: any[]) => {
        setCustomTypen(typen.map((t: any) => ({ name: t.name, editor_modus: t.editor_modus })))
      }).catch(() => {})
    }
  }, [staffelId])

  if (!staffelId || !folgeNummer) return null

  const showLeft = panelMode !== 'script'
  const showRight = panelMode !== 'treatment'

  return (
    <div style={{ display: 'flex', borderTop: '2px solid var(--border)', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      {showLeft && (
        <div style={{ flex: 1, overflow: 'hidden', borderRight: showRight ? '1px solid var(--border)' : undefined }}>
          <EditorPanel
            key={`${staffelId}-${folgeNummer}-left`}
            staffelId={staffelId}
            folgeNummer={folgeNummer}
            allDokumente={dokumente}
            customTypen={customTypen}
            formatElements={formatElements}
            defaultTyp="storyline"
            onCreateDokument={createDokument}
            onReloadDokumente={reload}
          />
        </div>
      )}
      {showRight && (
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <EditorPanel
            key={`${staffelId}-${folgeNummer}-right`}
            staffelId={staffelId}
            folgeNummer={folgeNummer}
            allDokumente={dokumente}
            customTypen={customTypen}
            formatElements={formatElements}
            defaultTyp="drehbuch"
            onCreateDokument={createDokument}
            onReloadDokumente={reload}
          />
        </div>
      )}
    </div>
  )
}

const MIN_WIDTH = 180
const MAX_WIDTH = 520
const DEFAULT_WIDTH = 276

export default function ScriptPage() {
  const { focus } = useFocus()
  const { selectedProduction, loading } = useSelectedProduction()
  const [bloecke, setBloecke] = useState<any[]>([])
  const [stages, setStages] = useState<any[]>([])
  const [szenen, setSzenen] = useState<any[]>([])

  // Parse deep-link URL params once on init (?scene=<id> from Messenger-App links)
  const [deepLink] = useState<{ staffelId?: string; folgeNummer?: number; stageId?: number; szeneId?: number } | null>(() => {
    const params = new URLSearchParams(window.location.search)
    const scene = params.get('scene')
    if (!scene) return null
    const staffel = params.get('staffel')
    const folge = params.get('folge')
    const stage = params.get('stage')
    // Clean URL immediately
    window.history.replaceState({}, '', window.location.pathname)
    if (staffel && folge && stage) {
      return { staffelId: staffel, folgeNummer: parseInt(folge), stageId: parseInt(stage), szeneId: parseInt(scene) }
    }
    return { szeneId: parseInt(scene) }
  })

  const [selectedStaffelId, setSelectedStaffelId] = useState<string>('')
  const [selectedBlock, setSelectedBlock] = useState<any | null>(null)
  const [selectedFolgeNummer, setSelectedFolgeNummer] = useState<number | null>(null)
  const [selectedStageId, setSelectedStageId] = useState<number | null>(null)
  const [selectedSzeneId, setSelectedSzeneId] = useState<number | null>(null)

  const [commentCounts, setCommentCounts] = useState<Record<number, number>>({})

  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_WIDTH)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isDragging = useRef(false)
  const dragStartX = useRef(0)
  const dragStartWidth = useRef(0)
  // Holds saved nav values during initial cascading restore; cleared after use
  const pendingNav = useRef<{ staffelId?: string; folgeNummer?: number; stageId?: number; szeneId?: number }>({})
  const navRestored = useRef(false)

  // Throttle timestamps for keyboard navigation (max 1 navigation per interval)
  const kbFolgeLastFire = useRef(0)
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
  const selectedStaffelIdRef = useRef(selectedStaffelId)
  selectedStaffelIdRef.current = selectedStaffelId

  // Load user settings (sidebar + last navigation position)
  // Deep-link (?scene=...) takes priority over saved settings
  useEffect(() => {
    if (deepLink && !deepLink.staffelId) {
      // Minimal deep-link — only scene ID, need to resolve staffel/folge/stage via API
      api.getSzene(deepLink.szeneId!).then(scene =>
        api.getStage(scene.stage_id).then(stage => {
          pendingNav.current = {
            staffelId: stage.staffel_id,
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
        if (deepLink.staffelId)   pendingNav.current.staffelId   = deepLink.staffelId
        if (deepLink.folgeNummer) pendingNav.current.folgeNummer = deepLink.folgeNummer
        if (deepLink.stageId)     pendingNav.current.stageId     = deepLink.stageId
        if (deepLink.szeneId)     pendingNav.current.szeneId     = deepLink.szeneId
      } else {
        if (ui.last_staffel_id)    pendingNav.current.staffelId   = ui.last_staffel_id
        if (ui.last_folge_nummer)  pendingNav.current.folgeNummer = ui.last_folge_nummer
        if (ui.last_stage_id)      pendingNav.current.stageId     = ui.last_stage_id
        if (ui.last_szene_id)      pendingNav.current.szeneId     = ui.last_szene_id
      }
      setSettingsLoaded(true)
    }).catch(() => setSettingsLoaded(true))
  }, [deepLink])

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
    staffelId: string, folgeNummer: number | null, stageId: number | null, szeneId: number | null
  ) => {
    if (!navRestored.current) return
    api.updateSettings({ ui_settings: {
      last_staffel_id:   staffelId,
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
    const staffelId = selectedStaffelIdRef.current
    if (!currentSzenen.length || currentSzeneId == null) return
    const idx = currentSzenen.findIndex(s => s.id === currentSzeneId)
    if (idx === -1) return
    const nextIdx = idx + dir
    if (nextIdx < 0 || nextIdx >= currentSzenen.length) return
    const nextSzene = currentSzenen[nextIdx]
    setSelectedSzeneId(nextSzene.id)
    if (navRestored.current && staffelId)
      api.updateSettings({ ui_settings: {
        last_staffel_id: staffelId,
        last_folge_nummer: currentFolge,
        last_stage_id: currentStageId,
        last_szene_id: nextSzene.id,
      }}).catch(() => {})
  }, [])

  // Keyboard navigation: ↑↓ = Episode, ←→ = Szene
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return
      const tag = (document.activeElement?.tagName || '').toLowerCase()
      if (['input', 'textarea', 'select'].includes(tag)) return
      if (document.activeElement?.getAttribute('contenteditable')) return

      const currentBloecke    = bloeckeRef.current
      const currentBlock      = selectedBlockRef.current
      const currentFolge      = selectedFolgeNummerRef.current
      const currentStageId    = selectedStageIdRef.current
      const currentSzenen     = szenenRef.current
      const currentSzeneId    = selectedSzeneIdRef.current
      const staffelId         = selectedStaffelIdRef.current

      // ↑↓ — Episode wechseln (block-übergreifend), throttled auf 400ms
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault()
        const now = Date.now()
        if (now - kbFolgeLastFire.current < 400) return
        kbFolgeLastFire.current = now

        if (currentFolge == null || !currentBlock || !staffelId) return
        const dir = e.key === 'ArrowDown' ? 1 : -1
        const nextFolge = currentFolge + dir
        const inBlock = nextFolge >= (currentBlock.folge_von ?? nextFolge)
          && (currentBlock.folge_bis == null || nextFolge <= currentBlock.folge_bis)

        if (inBlock) {
          pendingNav.current = {}; navRestored.current = true
          setSelectedFolgeNummer(nextFolge)
          api.updateSettings({ ui_settings: {
            last_staffel_id: staffelId, last_folge_nummer: nextFolge,
            last_stage_id: null, last_szene_id: null,
          }}).catch(() => {})
        } else {
          const sorted = [...currentBloecke].sort((a, b) => (a.folge_von ?? 0) - (b.folge_von ?? 0))
          const idx = sorted.findIndex(b => b.proddb_id === currentBlock.proddb_id)
          const nextIdx = idx + dir
          if (nextIdx < 0 || nextIdx >= sorted.length) return
          const nextBlock = sorted[nextIdx]
          const targetFolge = dir > 0
            ? (nextBlock.folge_von ?? null)
            : (nextBlock.folge_bis ?? nextBlock.folge_von ?? null)
          if (targetFolge == null) return
          pendingNav.current = {}; navRestored.current = true
          setSelectedBlock(nextBlock)
          setSelectedFolgeNummer(targetFolge)
          api.updateSettings({ ui_settings: {
            last_staffel_id: staffelId, last_folge_nummer: targetFolge,
            last_stage_id: null, last_szene_id: null,
          }}).catch(() => {})
        }
      }

      // ←→ — Szene wechseln, throttled auf 200ms
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        const now = Date.now()
        if (now - kbSzeneLastFire.current < 200) return
        kbSzeneLastFire.current = now
        navigateSzene(e.key === 'ArrowRight' ? 1 : -1)
      }
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
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, dragStartWidth.current + delta))
      setSidebarWidth(newWidth)
    }
    const onUp = (ev: MouseEvent) => {
      isDragging.current = false
      const delta = ev.clientX - dragStartX.current
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, dragStartWidth.current + delta))
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
    fetch('/api/staffeln/sync', {
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
      .then(data => { if (data.staffel_id) setSelectedStaffelId(data.staffel_id) })
      .catch(console.error)
  }, [selectedProduction?.id, settingsLoaded])


  // Load Blöcke — restore saved folgeNummer by finding the right block
  useEffect(() => {
    if (!selectedStaffelId) return
    setBloecke([])
    setSelectedBlock(null)
    api.getBloecke(selectedStaffelId).then(data => {
      setBloecke(data)
      if (!data.length) return
      const savedFolge = pendingNav.current.folgeNummer
      const match = savedFolge && data.find((b: any) =>
        b.folge_von != null && savedFolge >= b.folge_von && (b.folge_bis == null || savedFolge <= b.folge_bis)
      )
      setSelectedBlock(match || data[0])
    }).catch(() => {})
  }, [selectedStaffelId])

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

  // Load Stages — restore saved stageId if available
  useEffect(() => {
    if (!selectedStaffelId || selectedFolgeNummer == null) return
    setStages([])
    setSelectedStageId(null)
    api.getStages(selectedStaffelId, selectedFolgeNummer).then(data => {
      setStages(data)
      if (!data.length) return
      const savedStage = pendingNav.current.stageId
      const match = savedStage && data.find((s: any) => s.id === savedStage)
      setSelectedStageId(match ? match.id : data[0].id)
      delete pendingNav.current.stageId
    }).catch(() => {})
  }, [selectedStaffelId, selectedFolgeNummer])

  // Load Szenen — restore saved szeneId if available
  useEffect(() => {
    if (!selectedStageId) return
    setSzenen([])
    setSelectedSzeneId(null)
    api.getSzenen(selectedStageId).then(data => {
      setSzenen(data)
      if (!data.length) return
      const savedSzene = pendingNav.current.szeneId
      const match = savedSzene && data.find((s: any) => s.id === savedSzene)
      setSelectedSzeneId(match ? match.id : data[0].id)
      delete pendingNav.current.szeneId
      navRestored.current = true
    }).catch(() => {})
  }, [selectedStageId])

  // Poll unread comment counts from Messenger-App every 60s
  useEffect(() => {
    if (!selectedStageId) { setCommentCounts({}); return }
    let cancelled = false
    const load = () => {
      api.getSceneCommentCounts(selectedStageId)
        .then(data => { if (!cancelled) setCommentCounts(data) })
        .catch(() => {})
    }
    load()
    const interval = setInterval(load, 60_000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [selectedStageId])

  const handleMarkCommentsRead = useCallback((szeneId: number) => {
    setCommentCounts(prev => ({ ...prev, [szeneId]: 0 }))
    api.markSceneCommentsRead(szeneId).catch(() => {})
  }, [])

  // Save navigation position when selections change
  useEffect(() => {
    if (selectedStaffelId) saveNavPosition(selectedStaffelId, selectedFolgeNummer, selectedStageId, selectedSzeneId)
  }, [selectedStaffelId, selectedFolgeNummer, selectedStageId, selectedSzeneId, saveNavPosition])

  if (loading) return <div style={{ padding: 32, color: 'var(--text-secondary)' }}>Lädt…</div>
  return (
    <AppShell
      selectedStaffelId={selectedStaffelId}
      bloecke={bloecke}
      selectedBlock={selectedBlock}
      onSelectBlock={b => { pendingNav.current = {}; navRestored.current = true; setSelectedBlock(b) }}
      selectedFolgeNummer={selectedFolgeNummer}
      onSelectFolge={nr => {
        pendingNav.current = {}; navRestored.current = true; setSelectedFolgeNummer(nr)
        if (selectedStaffelId)
          api.updateSettings({ ui_settings: { last_staffel_id: selectedStaffelId, last_folge_nummer: nr, last_stage_id: null, last_szene_id: null } }).catch(() => {})
      }}
      stages={stages}
      selectedStageId={selectedStageId}
      onSelectStage={id => { navRestored.current = true; setSelectedStageId(id) }}
    >
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', position: 'relative' }}>

        {/* Collapsible + resizable scene list */}
        {!sidebarCollapsed && (
          <div style={{ width: sidebarWidth, flexShrink: 0, overflow: 'hidden', display: 'flex' }}>
            <SceneList
              szenen={szenen}
              selectedSzeneId={selectedSzeneId}
              onSelectSzene={(id) => {
                setSelectedSzeneId(id)
                if (navRestored.current && selectedStaffelId)
                  api.updateSettings({ ui_settings: {
                    last_staffel_id: selectedStaffelId,
                    last_folge_nummer: selectedFolgeNummer,
                    last_stage_id: selectedStageId,
                    last_szene_id: id,
                  } }).catch(() => {})
              }}
              staffelId={selectedStaffelId}
              folgeNummer={selectedFolgeNummer}
              stageId={selectedStageId}
              onSzeneCreated={(newSzene) => {
                setSzenen(prev => [...prev, newSzene])
                setSelectedSzeneId(newSzene.id)
                if (navRestored.current && selectedStaffelId)
                  api.updateSettings({ ui_settings: {
                    last_staffel_id: selectedStaffelId,
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
            />
          </div>
        )}

        {/* Drag handle + collapse arrow */}
        <div className="scene-list-handle" onMouseDown={!sidebarCollapsed ? onDragStart : undefined}>
          <button
            className="scene-list-collapse-btn"
            onClick={toggleCollapse}
            title={sidebarCollapsed ? 'Szenenübersicht öffnen' : 'Szenenübersicht schließen'}
          >
            {sidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>

        {/* Editor area — vertical split: SceneEditor (top) + DockedEditorPanels (bottom) */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex' }}>
            {selectedSzeneId && (
              <SceneEditor
                szeneId={selectedSzeneId}
                stageId={selectedStageId}
                staffelId={selectedStaffelId}
                folgeNummer={selectedFolgeNummer}
                onSzeneUpdated={(updated) => {
                  setSzenen(prev => prev.map(s => s.id === updated.id ? updated : s))
                }}
                onNavigatePrev={() => navigateSzene(-1)}
                onNavigateNext={() => navigateSzene(1)}
                onMarkCommentsRead={handleMarkCommentsRead}
              />
            )}
            {!selectedSzeneId && (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
                Keine Szene ausgewählt
              </div>
            )}
          </div>
          <DockedEditorPanels staffelId={selectedStaffelId} folgeNummer={selectedFolgeNummer} />
        </div>

        {!focus && <BreakdownPanel szeneId={selectedSzeneId} staffelId={selectedStaffelId} />}
      </div>
    </AppShell>
  )
}
