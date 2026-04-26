import { useState, useEffect, useRef, useCallback } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { api } from '../api/client'
import AppShell from '../components/AppShell'
import SceneList from '../components/SceneList'
import SceneEditor from '../components/SceneEditor'
import BreakdownPanel from '../components/BreakdownPanel'
import { useFocus, useSelectedProduction } from '../App'

const MIN_WIDTH = 180
const MAX_WIDTH = 520
const DEFAULT_WIDTH = 260

export default function ScriptPage() {
  const { focus } = useFocus()
  const { selectedProduction, loading } = useSelectedProduction()
  const [bloecke, setBloecke] = useState<any[]>([])
  const [stages, setStages] = useState<any[]>([])
  const [szenen, setSzenen] = useState<any[]>([])

  const [selectedStaffelId, setSelectedStaffelId] = useState<string>('')
  const [selectedBlock, setSelectedBlock] = useState<any | null>(null)
  const [selectedFolgeNummer, setSelectedFolgeNummer] = useState<number | null>(null)
  const [selectedStageId, setSelectedStageId] = useState<number | null>(null)
  const [selectedSzeneId, setSelectedSzeneId] = useState<number | null>(null)

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

  // Load user settings (sidebar + last navigation position)
  useEffect(() => {
    api.getSettings().then(s => {
      const ui = s?.ui_settings || {}
      if (ui.scene_list_width) setSidebarWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, ui.scene_list_width)))
      if (typeof ui.scene_list_collapsed === 'boolean') setSidebarCollapsed(ui.scene_list_collapsed)
      if (ui.last_staffel_id)    pendingNav.current.staffelId   = ui.last_staffel_id
      if (ui.last_folge_nummer)  pendingNav.current.folgeNummer = ui.last_folge_nummer
      if (ui.last_stage_id)      pendingNav.current.stageId     = ui.last_stage_id
      if (ui.last_szene_id)      pendingNav.current.szeneId     = ui.last_szene_id
      setSettingsLoaded(true)
    }).catch(() => setSettingsLoaded(true))
  }, [])

  // Debounced save layout to backend
  const saveSettings = useCallback((width: number, collapsed: boolean) => {
    if (!settingsLoaded) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      api.updateSettings({ ui_settings: { scene_list_width: width, scene_list_collapsed: collapsed } })
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
      saveSettings(newWidth, sidebarCollapsed)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [sidebarWidth, sidebarCollapsed, saveSettings])

  const toggleCollapse = useCallback(() => {
    setSidebarCollapsed(v => {
      const next = !v
      saveSettings(sidebarWidth, next)
      return next
    })
  }, [sidebarWidth, saveSettings])

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

        {/* Editor area */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
          {selectedSzeneId && (
            <SceneEditor
              szeneId={selectedSzeneId}
              stageId={selectedStageId}
              staffelId={selectedStaffelId}
              folgeNummer={selectedFolgeNummer}
              onSzeneUpdated={(updated) => {
                setSzenen(prev => prev.map(s => s.id === updated.id ? updated : s))
              }}
            />
          )}
          {!selectedSzeneId && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
              Keine Szene ausgewählt
            </div>
          )}
        </div>

        {!focus && <BreakdownPanel szeneId={selectedSzeneId} staffelId={selectedStaffelId} />}
      </div>
    </AppShell>
  )
}
