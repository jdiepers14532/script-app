import { useState } from 'react'
import AppShell from '../components/AppShell'
import SceneList from '../components/SceneList'
import SceneEditor from '../components/SceneEditor'

export default function ScriptPage() {
  const [activeSceneId, setActiveSceneId] = useState(7)

  return (
    <AppShell>
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
      </div>
    </AppShell>
  )
}
