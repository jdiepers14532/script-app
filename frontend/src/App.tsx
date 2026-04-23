import { createContext, useContext } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import ScriptPage from './pages/ScriptPage'
import EditorPage from './pages/EditorPage'
import AdminPage from './pages/AdminPage'
import { useFocusMode } from './hooks/useFocusMode'

interface FocusContextValue {
  focus: boolean
  toggle: () => void
}

export const FocusContext = createContext<FocusContextValue>({
  focus: false,
  toggle: () => {},
})

export function useFocus() {
  return useContext(FocusContext)
}

export default function App() {
  const { focus, toggle } = useFocusMode()

  return (
    <FocusContext.Provider value={{ focus, toggle }}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<ScriptPage />} />
          <Route path="/editor" element={<EditorPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </FocusContext.Provider>
  )
}
