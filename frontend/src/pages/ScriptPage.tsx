import { useState } from 'react'
import AppShell from '../components/AppShell'
import SceneList from '../components/SceneList'
import SceneEditor from '../components/SceneEditor'
import BreakdownPanel from '../components/BreakdownPanel'
import { useFocus } from '../App'

export default function ScriptPage() {
  const [activeSceneId, setActiveSceneId] = useState(7)
  const { focus } = useFocus()

  return (
    <AppShell>
      <div
        className={`work${focus ? '' : ''}`}
        style={{ flex: 1, overflow: 'hidden' }}
      >
        <SceneList
          activeSceneId={activeSceneId}
          onSelectScene={setActiveSceneId}
        />
        <SceneEditor sceneId={activeSceneId} />
        {!focus && <BreakdownPanel />}
      </div>
    </AppShell>
  )
}
