import { useState, useEffect } from 'react'
import { api } from '../api/client'
import AppShell from '../components/AppShell'
import SceneList from '../components/SceneList'
import SceneEditor from '../components/SceneEditor'
import BreakdownPanel from '../components/BreakdownPanel'
import { useFocus } from '../App'

export default function ScriptPage() {
  const { focus } = useFocus()
  const [staffeln, setStaffeln] = useState<any[]>([])
  const [bloecke, setBloecke] = useState<any[]>([])
  const [episoden, setEpisoden] = useState<any[]>([])
  const [stages, setStages] = useState<any[]>([])
  const [szenen, setSzenen] = useState<any[]>([])

  const [selectedStaffelId, setSelectedStaffelId] = useState<string>('')
  const [selectedBlockId, setSelectedBlockId] = useState<number | null>(null)
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<number | null>(null)
  const [selectedStageId, setSelectedStageId] = useState<number | null>(null)
  const [selectedSzeneId, setSelectedSzeneId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Staffeln laden
  useEffect(() => {
    api.getStaffeln()
      .then(data => {
        setStaffeln(data)
        if (data.length > 0) setSelectedStaffelId(data[0].id)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  // Blöcke laden wenn Staffel gewählt
  useEffect(() => {
    if (!selectedStaffelId) return
    setBloecke([])
    setSelectedBlockId(null)
    api.getBloecke(selectedStaffelId).then(data => {
      setBloecke(data)
      if (data.length > 0) setSelectedBlockId(data[0].id)
    }).catch(() => {})
  }, [selectedStaffelId])

  // Episoden laden wenn Block gewählt
  useEffect(() => {
    if (!selectedBlockId) return
    setEpisoden([])
    setSelectedEpisodeId(null)
    api.getEpisoden(selectedBlockId).then(data => {
      setEpisoden(data)
      setSelectedEpisodeId(data.length > 0 ? data[0].id : null)
    }).catch(() => {})
  }, [selectedBlockId])

  // Stages laden wenn Episode gewählt
  useEffect(() => {
    if (!selectedEpisodeId) return
    setStages([])
    setSelectedStageId(null)
    api.getStages(selectedEpisodeId).then(data => {
      setStages(data)
      setSelectedStageId(data.length > 0 ? data[0].id : null)
    }).catch(() => {})
  }, [selectedEpisodeId])

  // Szenen laden wenn Stage gewählt
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
      selectedBlockId={selectedBlockId}
      onSelectBlock={setSelectedBlockId}
      episoden={episoden}
      selectedEpisodeId={selectedEpisodeId}
      onSelectEpisode={setSelectedEpisodeId}
      stages={stages}
      selectedStageId={selectedStageId}
      onSelectStage={setSelectedStageId}
    >
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
        <SceneList
          szenen={szenen}
          selectedSzeneId={selectedSzeneId}
          onSelectSzene={setSelectedSzeneId}
          episodeId={selectedEpisodeId}
          stageId={selectedStageId}
          onSzeneCreated={(newSzene) => {
            setSzenen(prev => [...prev, newSzene])
            setSelectedSzeneId(newSzene.id)
          }}
        />
        {selectedSzeneId && (
          <SceneEditor
            szeneId={selectedSzeneId}
            episodeId={selectedEpisodeId}
            stageId={selectedStageId}
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
        {!focus && <BreakdownPanel szenen={szenen} />}
      </div>
    </AppShell>
  )
}
