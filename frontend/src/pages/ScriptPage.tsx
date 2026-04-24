import { useState, useEffect } from 'react'
import { api } from '../api/client'
import AppShell from '../components/AppShell'
import SceneList from '../components/SceneList'
import SceneEditor from '../components/SceneEditor'
import BreakdownPanel from '../components/BreakdownPanel'
import { useFocus, useSelectedProduction } from '../App'

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
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
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
        {selectedSzeneId && (
          <SceneEditor
            szeneId={selectedSzeneId!}
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
        {!focus && <BreakdownPanel szenen={szenen} />}
      </div>
    </AppShell>
  )
}
