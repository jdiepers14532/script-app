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
  const { selectedProduction } = useSelectedProduction()
  const [staffeln, setStaffeln] = useState<any[]>([])
  const [bloecke, setBloecke] = useState<any[]>([])
  const [stages, setStages] = useState<any[]>([])
  const [szenen, setSzenen] = useState<any[]>([])

  const [selectedStaffelId, setSelectedStaffelId] = useState<string>('')
  const [selectedBlock, setSelectedBlock] = useState<any | null>(null)
  const [selectedFolgeNummer, setSelectedFolgeNummer] = useState<number | null>(null)
  const [selectedStageId, setSelectedStageId] = useState<number | null>(null)
  const [selectedSzeneId, setSelectedSzeneId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_WIDTH)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isDragging = useRef(false)
  const dragStartX = useRef(0)
  const dragStartWidth = useRef(0)

  // Load user settings (sidebar width/collapsed)
  useEffect(() => {
    api.getSettings().then(s => {
      const ui = s?.ui_settings || {}
      if (ui.scene_list_width) setSidebarWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, ui.scene_list_width)))
      if (typeof ui.scene_list_collapsed === 'boolean') setSidebarCollapsed(ui.scene_list_collapsed)
      setSettingsLoaded(true)
    }).catch(() => setSettingsLoaded(true))
  }, [])

  // Debounced save to backend
  const saveSettings = useCallback((width: number, collapsed: boolean) => {
    if (!settingsLoaded) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      api.updateSettings({ ui_settings: { scene_list_width: width, scene_list_collapsed: collapsed } })
        .catch(() => {})
    }, 800)
  }, [settingsLoaded])

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

  // Sync selected production as staffel
  useEffect(() => {
    if (!selectedProduction) return
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
  }, [selectedProduction?.id])

  // Load staffeln
  useEffect(() => {
    api.getStaffeln()
      .then(data => {
        setStaffeln(data)
        if (data.length > 0 && !selectedProduction) setSelectedStaffelId(data[0].id)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  // Load Blöcke from ProdDB when Staffel changes
  useEffect(() => {
    if (!selectedStaffelId) return
    setBloecke([])
    setSelectedBlock(null)
    api.getBloecke(selectedStaffelId).then(data => {
      setBloecke(data)
      setSelectedBlock(data.length > 0 ? data[0] : null)
    }).catch(() => {})
  }, [selectedStaffelId])

  // Set default Folge when Block changes
  useEffect(() => {
    if (!selectedBlock) { setSelectedFolgeNummer(null); return }
    setSelectedFolgeNummer(selectedBlock.folge_von ?? null)
  }, [selectedBlock?.proddb_id])

  // Load Stages when Folge changes
  useEffect(() => {
    if (!selectedStaffelId || selectedFolgeNummer == null) return
    setStages([])
    setSelectedStageId(null)
    api.getStages(selectedStaffelId, selectedFolgeNummer).then(data => {
      setStages(data)
      setSelectedStageId(data.length > 0 ? data[0].id : null)
    }).catch(() => {})
  }, [selectedStaffelId, selectedFolgeNummer])

  // Load Szenen when Stage changes
  useEffect(() => {
    if (!selectedStageId) return
    setSzenen([])
    setSelectedSzeneId(null)
    api.getSzenen(selectedStageId).then(data => {
      setSzenen(data)
      setSelectedSzeneId(data.length > 0 ? data[0].id : null)
    }).catch(() => {})
  }, [selectedStageId])

  if (loading) return <div style={{ padding: 32, color: 'var(--text-secondary)' }}>Lädt…</div>
  if (error) return <div style={{ padding: 32, color: 'var(--sw-danger)' }}>Fehler: {error}</div>

  return (
    <AppShell
      staffeln={staffeln}
      selectedStaffelId={selectedStaffelId}
      onSelectStaffel={setSelectedStaffelId}
      bloecke={bloecke}
      selectedBlock={selectedBlock}
      onSelectBlock={setSelectedBlock}
      selectedFolgeNummer={selectedFolgeNummer}
      onSelectFolge={setSelectedFolgeNummer}
      stages={stages}
      selectedStageId={selectedStageId}
      onSelectStage={setSelectedStageId}
    >
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', position: 'relative' }}>

        {/* Collapsible + resizable scene list */}
        {!sidebarCollapsed && (
          <div style={{ width: sidebarWidth, flexShrink: 0, overflow: 'hidden', display: 'flex' }}>
            <SceneList
              szenen={szenen}
              selectedSzeneId={selectedSzeneId}
              onSelectSzene={setSelectedSzeneId}
              staffelId={selectedStaffelId}
              folgeNummer={selectedFolgeNummer}
              stageId={selectedStageId}
              onSzeneCreated={(newSzene) => {
                setSzenen(prev => [...prev, newSzene])
                setSelectedSzeneId(newSzene.id)
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
