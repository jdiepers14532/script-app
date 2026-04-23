import { useState } from 'react'
import AppShell from '../components/AppShell'
import SceneList from '../components/SceneList'
import SceneEditor from '../components/SceneEditor'
import BreakdownPanel from '../components/BreakdownPanel'

export default function ScriptPage() {
  const [activeSceneId, setActiveSceneId] = useState(7)

  return (
    <AppShell stage="drehbuch">
      <div style={{
        display: 'flex',
        height: '100%',
        overflow: 'hidden',
      }}>
        <SceneList
          activeSceneId={activeSceneId}
          onSelectScene={setActiveSceneId}
        />
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <SceneEditor sceneId={activeSceneId} />
        </div>
        <BreakdownPanel />
      </div>
    </AppShell>
  )
}
